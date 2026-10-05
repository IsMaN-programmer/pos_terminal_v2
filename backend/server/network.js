import { Server } from 'socket.io';
import { getConfig } from './config.js';

let io = null;
let isMaster = false;

const terminals = new Map();
const printerLists = new Map();

export function initNetwork(server) {
  io = new Server(server, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    const cfg = getConfig();
    if (cfg.role !== 'master') {
      // Not a master: keep the socket open (so the frontend gets no
      // reconnection spam) but do not register this terminal.
      return;
    }

    socket.on('terminal:hello', (payload) => {
      const id = String(payload?.id || socket.id);
      const name = String(payload?.name || 'TERMINAL');
      const entry = terminals.get(id);
      const now = new Date();
      const firstConnect = !entry || !entry.connected;
      terminals.set(id, {
        id,
        name,
        ip: socket.handshake.address,
        connected: true,
        connectedAt: firstConnect ? now.toISOString() : (entry.connectedAt || now.toISOString()),
        lostAt: '',
      });
      socket.data.terminalId = id;
      broadcastTerminals();
      socket.emit('printers:request');
    });

    socket.on('printers:list', (payload) => {
      const id = socket.data.terminalId;
      if (!id) return;
      printerLists.set(id, Array.isArray(payload?.printers) ? payload.printers : []);
      broadcastTerminals();
    });

    socket.on('terminal:kicked', () => {
      const id = socket.data.terminalId;
      if (id) {
        const entry = terminals.get(id);
        if (entry) entry.connected = false;
        socket.disconnect(true);
        broadcastTerminals();
      }
    });

    socket.on('disconnect', () => {
      const id = socket.data.terminalId;
      if (id && terminals.has(id)) {
        const entry = terminals.get(id);
        entry.connected = false;
        entry.lostAt = new Date().toISOString();
        broadcastTerminals();
      }
    });
  });
}

export function setMasterMode(active) {
  isMaster = active;
  if (!active && io) {
    io.sockets.sockets.forEach((socket) => socket.disconnect(true));
    terminals.clear();
  }
}

export function isMasterActive() {
  return getConfig().role === 'master';
}

export function broadcastTerminals() {
  if (!io) return;
  io.emit('terminals:update', listTerminals());
}

export function listTerminals() {
  return Array.from(terminals.values())
    .map((t) => ({ ...t, printers: printerLists.get(t.id) || [] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getTerminalIp(id) {
  const entry = terminals.get(id);
  if (!entry || !entry.connected) return '';
  return String(entry.ip || '').replace(/^::ffff:/, '');
}

export function requestPrinterLists() {
  if (!io) return;
  io.emit('printers:request');
}

export function kickTerminal(id) {
  const entry = terminals.get(id);
  if (!entry) return false;
  terminals.delete(id);
  printerLists.delete(id);
  io.sockets.sockets.forEach((socket) => {
    if (socket.data.terminalId === id) {
      socket.emit('kicked');
      socket.disconnect(true);
    }
  });
  broadcastTerminals();
  return true;
}

export function broadcastToTerminals(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}
