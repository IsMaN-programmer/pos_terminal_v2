import assert from 'node:assert/strict'
import vm from 'node:vm'
import { build } from 'esbuild'

const built = await build({ entryPoints: ['src/services/mobileStorage.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' })
const persisted = new Map()
const database = {
  objectStoreNames: { contains: () => true },
  createObjectStore() {},
  transaction() {
    const tx = { oncomplete: null, onerror: null, onabort: null }
    tx.objectStore = () => ({
      openCursor() {
        const request = { result: null, onsuccess: null, onerror: null }
        const entries = [...persisted.entries()]
        let index = 0
        const next = () => {
          const entry = entries[index++]
          request.result = entry ? { key: entry[0], value: entry[1], continue: () => queueMicrotask(next) } : null
          request.onsuccess?.()
        }
        queueMicrotask(next)
        return request
      },
      put(value, key) { queueMicrotask(() => { persisted.set(key, value); tx.oncomplete?.() }) },
      delete(key) { queueMicrotask(() => { persisted.delete(key); tx.oncomplete?.() }) },
    })
    return tx
  },
}
const indexedDB = {
  open() {
    const request = { result: database, onsuccess: null, onerror: null, onupgradeneeded: null }
    queueMicrotask(() => { request.onupgradeneeded?.(); request.onsuccess?.() })
    return request
  },
}
const legacy = new Map([
  ['pos_v2_history', 'h'.repeat(300_000)],
  ['pos_v2_mobile_outbox', 'o'.repeat(100_000)],
])
const localStorage = {
  getItem: key => legacy.get(key) ?? null,
  setItem(key, value) {
    const size = [...legacy].filter(([k]) => k !== key).reduce((n, [, v]) => n + v.length, String(value).length)
    if (size > 500_000) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    legacy.set(key, String(value))
  },
  removeItem: key => legacy.delete(key),
}

function launch() {
  const module = { exports: {} }
  vm.runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, indexedDB, localStorage, queueMicrotask, console })
  return module.exports
}

const first = launch()
await first.prepareMobileStorage(['pos_v2_history', 'pos_v2_mobile_outbox'])
assert.equal(legacy.size, 0, 'Legacy data should move out of localStorage only after it is persisted')
assert.equal(first.getMobileStoredValue('pos_v2_history').length, 300_000)
await first.setMobileStoredValue('pos_v2_history', 'h'.repeat(1_000_000))
await first.setMobileStoredValue('pos_v2_mobile_outbox', 'o'.repeat(1_000_000))
await first.waitForMobileStorage()
assert.equal(legacy.size, 0, 'Large mobile records must not use localStorage quota')

const restarted = launch()
await restarted.prepareMobileStorage(['pos_v2_history', 'pos_v2_mobile_outbox'])
assert.equal(restarted.getMobileStoredValue('pos_v2_history').length, 1_000_000)
assert.equal(restarted.getMobileStoredValue('pos_v2_mobile_outbox').length, 1_000_000)
await restarted.removeMobileStoredValue('pos_v2_mobile_outbox')
assert.equal(persisted.has('pos_v2_mobile_outbox'), false)
console.log('PASS: legacy migration, quota-safe large outbox, restart recovery, and queue cleanup')
