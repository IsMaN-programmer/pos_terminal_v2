import assert from 'node:assert/strict';
import vm from 'node:vm';
import http from 'node:http';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const result = await build({
  stdin: { contents: `
    export * from './src/services/mobileOrderSync';
    export * from './src/services/mobileConnection';
    export * from './src/services/dataStore';
    export * from './src/services/cabinetApi';
    export * from './src/services/fiscalDriveApi';
    export { initNetwork } from './src/services/networkSocket';
    export { default as Login } from './src/Login';
    export { default as PinScreen } from './src/PinScreen';
    export { default as MobileConnect } from './src/components/MobileConnect';
    export { default as Layout } from './src/components/Layout';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  loader: { '.png': 'dataurl', '.svg': 'dataurl' },
  plugins: [{ name: 'native-test-bridge', setup(builder) {
    builder.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: 'core', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
      export const Capacitor = { isNativePlatform: () => globalThis.__native, getPlatform: () => globalThis.__native ? 'android' : 'web' };
      export const CapacitorHttp = { request: args => globalThis.__nativeHttp(args) };
      export const registerPlugin = () => new Proxy({}, { get: () => () => { throw new Error('Unexpected native plugin call'); } });
    ` }));
  } }],
});

// Existing desktop contract: REST writes, data:update over Socket.IO.
const records = new Map([
  ['pos_v2_tables', JSON.stringify([{ id: 1, status: 'free' }, { id: 2, status: 'free' }])],
  ['pos_v2_tableOrders', '{}'], ['pos_v2_history', '[]'],
  ['pos_v2_staff', JSON.stringify([{ id: 7, name: 'Test waiter', pin: '1234', role: 'waiter' }])],
  ['pos_v2_menu', JSON.stringify([{ id: 11, name: 'Tea', price: 5000 }])],
]);
const requests = [];
let loseResponse = false;
const server = http.createServer(async (req, res) => {
  requests.push({ method: req.method, path: req.url });
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/network/status') return res.end(JSON.stringify({ ok: true, role: 'master' }));
  if (req.url === '/api/data') return res.end(JSON.stringify({ ok: true, data: Object.fromEntries(records) }));
  if (!req.url.startsWith('/api/data/')) { res.statusCode = 404; return res.end('{}'); }
  const key = decodeURIComponent(req.url.slice('/api/data/'.length));
  if (req.method === 'GET') return res.end(JSON.stringify({ ok: true, value: records.get(key) ?? null }));
  if (req.method === 'PUT') {
    let body = ''; for await (const chunk of req) body += chunk;
    const value = JSON.parse(body).value;
    records.set(key, value);
    sockets.emit('data:update', { key, value });
    if (loseResponse) { loseResponse = false; req.socket.destroy(); return; }
    return res.end(JSON.stringify({ ok: true }));
  }
  res.statusCode = 405; res.end('{}');
});
const sockets = new Server(server, { cors: { origin: '*' } });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const observer = connect(origin, { transports: ['websocket'], reconnection: false });
await new Promise((resolve, reject) => { observer.on('connect', resolve); observer.on('connect_error', reject); });
const broadcasts = [];
observer.on('data:update', item => broadcasts.push(item));

function client(native = true, initial = new Map()) {
  const storage = initial;
  const module = { exports: {} };
  const authRequests = [];
  const eventTarget = new EventTarget();
  const context = {
    module, exports: module.exports, require: name => name === 'react' ? { ...React, useSyncExternalStore: (subscribe, snapshot) => React.useSyncExternalStore(subscribe, snapshot, snapshot) } : require(name), console, Response, Headers, AbortSignal, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval: (fn, ms) => { const timer = setInterval(fn, ms); timer.unref(); return timer; }, clearInterval, Event, crypto: webcrypto,
    window: eventTarget, navigator: { language: 'ru' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    __native: native,
    fetch: async (url, init) => { authRequests.push({ url, data: JSON.parse(init?.body || '{}') }); return new Response(JSON.stringify({ success: true, data: { token: 'test-token' } })); },
    __nativeHttp: async args => {
      if (args.url.startsWith('https://cabinet.posvk.uz/')) {
        authRequests.push(args);
        return { status: 200, headers: {}, data: { success: true, data: { token: 'test-token' } } };
      }
      const response = await fetch(args.url, { method: args.method, headers: args.headers, body: args.data == null ? undefined : JSON.stringify(args.data) });
      return { status: response.status, headers: {}, data: await response.json() };
    },
  };
  vm.runInNewContext(result.outputFiles[0].text, context);
  return { api: module.exports, storage, authRequests };
}

try {
  const mobile = client();
  const { api } = mobile;
  api.saveMobileConnection(origin.slice(7));
  await api.signInCabinet(' waiter ', 'test-password', 'SHOULD-NOT-BE-SENT');
  assert.equal(mobile.authRequests[0].url, 'https://cabinet.posvk.uz/api/cabinet-api/auth/sign-in');
  assert.deepEqual(JSON.parse(JSON.stringify(mobile.authRequests[0].data)), { username: 'waiter', password: 'test-password' });
  const loginHtml = renderToStaticMarkup(React.createElement(api.Login, { onLogin() {} }));
  assert.ok(!loginHtml.includes('login-fm'));
  const pinHtml = renderToStaticMarkup(React.createElement(api.PinScreen, { onComplete() {} }));
  assert.ok(!pinHtml.includes('Подключиться'));
  const connectHtml = renderToStaticMarkup(React.createElement(api.MobileConnect));
  assert.ok(connectHtml.includes('Подключиться'));
  assert.ok(connectHtml.includes(origin.slice(7)));
  const layoutHtml = renderToStaticMarkup(React.createElement(api.Layout, { currentScreen: 'tables', onNavigate() {}, staffName: 'Test', onLogout() {}, role: 'waiter', children: 'Content' }));
  assert.ok(!layoutHtml.includes('Настройки Wi-Fi'));
  assert.ok(layoutHtml.includes('mobile-connection-blocked'));
  assert.ok(!layoutHtml.includes('usb-nav-img'));
  api.saveMobileConnection('');
  const firstConnectHtml = renderToStaticMarkup(React.createElement(api.MobileConnect));
  assert.ok(!firstConnectHtml.includes(origin.slice(7)));
  api.saveMobileConnection(origin.slice(7));
  assert.equal((await api.fiscalDriveApi.listFiscalDrives()).length, 0);
  await assert.rejects(api.fiscalDriveApi.openZReport('FM'), /только на главной кассе/);

  const desktop = client(false);
  await desktop.api.signInCabinet('cashier', 'test-password', 'FM123');
  assert.equal(desktop.authRequests[0].url, '/api/cabinet-proxy/desktop/auth/sign-in');
  assert.equal(desktop.authRequests[0].data.terminalId, 'FM123');
  assert.ok(renderToStaticMarkup(React.createElement(desktop.api.Login, { onLogin() {} })).includes('login-fm'));
  console.log('PASS: mobile connection screen and PIN; desktop login preserved; waiter-only UI; FM disabled');

  assert.equal(api.normalizeMasterHost('192.168.1.25'), '192.168.1.25:5000');
  assert.equal(api.normalizeMasterHost('http://192.168.1.25:8080/'), '192.168.1.25:8080');
  for (const host of ['999.1.1.1', '127.0.0.1:0', '127.0.0.1:99999', 'example.com/path']) assert.throws(() => api.normalizeMasterHost(host));
  api.dataStore.setItem('pos_v2_tables', '[]');
  assert.equal(api.getMobileSyncState().pending, 0, 'Initial render must not overwrite desktop data');
  api.setMobileCommitHandler(api.commitMobileChanges);
  await api.syncMobileConnection();
  assert.equal(api.getMobileSyncState().ready, true);
  assert.equal(JSON.parse(api.dataStore.getItem('pos_v2_staff'))[0].id, 7);
  assert.equal(JSON.parse(api.dataStore.getItem('pos_v2_menu'))[0].name, 'Tea');

  // Another waiter's order arrives after this phone's snapshot.
  records.set('pos_v2_tableOrders', JSON.stringify({ 2: { items: ['coffee'], waiterId: 8 } }));
  api.dataStore.setItem('pos_v2_tableOrders', JSON.stringify({ 1: { items: ['tea'], waiterId: 7 } }));
  api.dataStore.setItem('pos_v2_tables', JSON.stringify([{ id: 1, status: 'payment_pending' }, { id: 2, status: 'free' }]));
  api.dataStore.setItem('pos_v2_history', JSON.stringify([{ id: 'phone-1', status: 'sent', tableId: 1 }]));
  await api.flushMobileChanges();
  assert.equal(api.getMobileSyncState().pending, 0);
  const orders = JSON.parse(records.get('pos_v2_tableOrders'));
  assert.equal(orders[1].waiterId, 7);
  assert.equal(orders[2].waiterId, 8);
  assert.equal(JSON.parse(records.get('pos_v2_tables'))[0].status, 'payment_pending');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(broadcasts.some(x => x.key === 'pos_v2_tableOrders'));
  const writes = requests.filter(x => x.method === 'PUT');
  assert.ok(writes.findIndex(x => x.path.endsWith('tableOrders')) < writes.findIndex(x => x.path.endsWith('tables')));
  console.log('PASS: legacy desktop API; menu/staff sync; separate waiter orders; WebSocket broadcasts; cashier status');

  api.dataStore.setItem('pos_v2_history', JSON.stringify([{ id: 'phone-2', status: 'sent', tableId: 2 }, { id: 'phone-1', status: 'sent', tableId: 1 }]));
  loseResponse = true;
  await api.flushMobileChanges();
  assert.ok(api.getMobileSyncState().pending > 0);
  assert.ok(JSON.parse(mobile.storage.get('pos_v2_mobile_outbox')).changes.length);
  api.setMobileCommitHandler(null);
  const restarted = client(true, new Map(mobile.storage));
  restarted.api.setMobileCommitHandler(restarted.api.commitMobileChanges);
  await restarted.api.syncMobileConnection();
  assert.equal(restarted.api.getMobileSyncState().pending, 0);
  assert.equal(JSON.parse(records.get('pos_v2_history')).filter(x => x.id === 'phone-2').length, 1);
  restarted.api.setMobileCommitHandler(null);
  console.log('PASS: lost response and app restart retain outbox; retry does not duplicate history');

  assert.throws(() => api.mergeMobileValue('{"1":{"items":["changed"]}}', '{"1":{"items":["old"]}}', '{"1":{"items":["new"]}}'), /Заказ изменён/);
  assert.equal(api.mergeMobileValue('{"1":1,"2":2}', '{"1":1}', '{}'), '{"2":2}');
  assert.equal(JSON.parse(api.mergeMobileValue('[{"id":1,"status":"paid"},{"id":2,"status":"free"}]', '[{"id":1,"status":"paid"},{"id":2,"status":"free"}]', '[{"id":1,"status":"paid"},{"id":2,"status":"occupied"}]'))[0].status, 'paid');
  const beforeProtected = requests.length;
  api.dataStore.setItem('pos_v2_fiscal_queue', '["forbidden"]');
  assert.equal(requests.length, beforeProtected);
  assert.ok(requests.every(x => !x.path.includes('fiscal') && !x.path.includes('cabinet')));
  console.log('PASS: conflict detection, entity deletion, protected fiscal queues; no fiscal/OFD requests');

  // The Android WebSocket can drop while its native HTTP connection remains healthy.
  // Sending to the cashier must still work and the screen must stay usable.
  const httpOnly = client();
  httpOnly.api.saveMobileConnection(origin.slice(7));
  await httpOnly.api.initNetwork();
  let phoneSocket;
  for (let i = 0; i < 50 && !phoneSocket; i++) {
    phoneSocket = [...sockets.of('/').sockets.values()].find(s => s.id !== observer.id);
    if (!phoneSocket) await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(phoneSocket, 'Android client should connect to the Socket.IO server');
  for (let i = 0; i < 50 && !httpOnly.api.getMobileSyncState().ready; i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(httpOnly.api.getMobileSyncState().ready, true);
  phoneSocket.disconnect(true);
  await new Promise(resolve => setTimeout(resolve, 100));
  const httpLayout = renderToStaticMarkup(React.createElement(httpOnly.api.Layout, { currentScreen: 'orders', onNavigate() {}, staffName: 'Test', onLogout() {}, role: 'waiter', children: 'Order still visible' }));
  assert.ok(!httpLayout.includes('mobile-connection-blocked'));
  httpOnly.api.dataStore.setItem('pos_v2_tables', JSON.stringify([{ id: 1, status: 'payment_pending' }, { id: 2, status: 'free' }]));
  await httpOnly.api.flushMobileChanges();
  assert.equal(httpOnly.api.getMobileSyncState().pending, 0);
  assert.equal(JSON.parse(records.get('pos_v2_tables'))[0].status, 'payment_pending');
  console.log('PASS: WebSocket loss does not blank Android screen or prevent HTTP order delivery');
} finally {
  observer.disconnect();
  await new Promise(resolve => sockets.close(resolve));
}
