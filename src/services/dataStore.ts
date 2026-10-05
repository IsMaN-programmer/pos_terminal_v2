// Unified data layer. Business keys (SHARED_KEYS) live on the master's backend
// (SQLite) and are synced to every terminal over socket.io. Local-only keys
// (session, language, login) behave exactly like plain localStorage.
//
// getItem/setItem/removeItem keep the same signatures as localStorage so
// components work unchanged, but reads hit an in-memory cache that is kept in
// sync with the backend, and writes are pushed to the backend (debounced).

import { isNativeMobile } from './capacitor'
import { masterOrigin, mobileConnection, posFetch } from './mobileConnection'
import { getMobileStoredValue, prepareMobileStorage, removeMobileStoredValue, setMobileStoredValue, waitForMobileStorage } from './mobileStorage'

function standaloneMobile(): boolean {
  return isNativeMobile() && !mobileConnection().host
}

const SHARED_KEYS = new Set([
  ...(isNativeMobile() ? ['pos_v2_tableBookings', 'pos_v2_kitchen_sent', 'pos_v2_roles',
    'pos_v2_ingredients', 'pos_v2_ingredient_categories', 'pos_v2_ingredient_recipes'] : []),
  'pos_v2_tables',
  'pos_v2_tableOrders',
  'pos_v2_history',
  'pos_v2_stock_goods',
  'pos_v2_stock_goods_pending_deletions',
  'pos_v2_menu',
  'pos_v2_menu_categories',
  'pos_v2_modifier_groups',
  'pos_v2_action_buttons',
  'pos_v2_zones',
  'pos_v2_zone_categories',
  'pos_v2_zone_category_map',
  'pos_v2_staff',
  'pos_v2_branches',
  'pos_v2_printer_name',
  'pos_v2_kitchen_printer_name',
  'pos_v2_waiter_printer_name',
  'pos_v2_paper_size',
  'pos_v2_kitchen_paper_size',
  'pos_v2_company_name',
  'pos_v2_company_tin',
  'pos_v2_company_stir',
  'pos_v2_company_address',
  'pos_v2_company_phone',
  'pos_v2_company_employee',
  'pos_v2_company_api_synced',
  'pos_v2_cabinet_company_id',
  'pos_v2_cabinet_cash_id',
  'pos_v2_cabinet_user_id',
  'pos_v2_cabinet_shift_ids',
  'pos_v2_cabinet_catalogs',
  'pos_v2_receipt_logo',
  'pos_v2_fiscal_queue',
  'pos_v2_receipt_sync_queue',
  'pos_v2_shift_log',
  'pos_v2_shift_open',
  'pos_v2_shift_info',
  'pos_v2_fm_last_close_times',
  'pos_v2_fm_list',
  'pos_v2_order_counter',
  'pos_v2_location',
  'pos_v2_last_fiscal',
])

const IMMEDIATE_KEYS = new Set([
  'pos_v2_fiscal_queue',
  'pos_v2_shift_open',
  'pos_v2_shift_info',
  'pos_v2_order_counter',
  'pos_v2_shift_log',
])

const cache = new Map<string, string | null>()
const listeners = new Map<string, Set<() => void>>()
const pending = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>()
const DEBOUNCE_MS = 250

const MOBILE_KEYS = new Set(['pos_v2_tables', 'pos_v2_tableOrders', 'pos_v2_tableBookings', 'pos_v2_kitchen_sent', 'pos_v2_history', 'pos_v2_shiftByStaff', 'pos_v2_ingredients', 'pos_v2_order_counter'])
const OUTBOX_KEY = 'pos_v2_mobile_outbox'
const STANDALONE_SNAPSHOT_KEY = 'pos_v2_mobile_standalone_snapshot'
const CONFLICT_BACKUP_KEY = 'pos_v2_mobile_conflict_backup'
export async function prepareMobileData(): Promise<void> {
  if (isNativeMobile()) await prepareMobileStorage([...SHARED_KEYS, OUTBOX_KEY, STANDALONE_SNAPSHOT_KEY, CONFLICT_BACKUP_KEY])
}
type Change = { key: string; before: string | null; value: string }
type CommitResult = { ok: boolean; data?: Record<string, string>; conflict?: boolean; error?: string }
let mobileReady = false
let mobileSending = false
let mobileError = ''
let mobileTimer: ReturnType<typeof setTimeout> | undefined
let mobileCommit: ((changes: Change[]) => Promise<CommitResult>) | null = null
const mobilePending = new Map<string, Change>()
const mobileListeners = new Set<() => void>()
let mobileState = { ready: false, pending: 0, error: '' }
function emitMobileState() {
  mobileState = { ready: mobileReady, pending: mobilePending.size, error: mobileError }
  mobileListeners.forEach(fn => fn())
}
function saveOutbox(): Promise<void> {
  emitMobileState()
  const save = mobilePending.size
    ? setMobileStoredValue(OUTBOX_KEY, JSON.stringify({ origin: masterOrigin(), changes: [...mobilePending.values()] }))
    : removeMobileStoredValue(OUTBOX_KEY)
  return save.catch(error => {
    mobileError = 'Не удалось сохранить заказ на телефоне. Проверьте свободное место.'
    emitMobileState()
    throw error
  })
}
export function hasMobilePendingChanges(): boolean {
  if (mobilePending.size) return true
  try { return JSON.parse(getMobileStoredValue(OUTBOX_KEY) || '{}').changes?.length > 0 } catch { return false }
}
export function subscribeMobileSync(fn: () => void) { mobileListeners.add(fn); return () => { mobileListeners.delete(fn) } }
export function getMobileSyncState() { return mobileState }
export function setMobileCommitHandler(handler: typeof mobileCommit) { mobileCommit = handler }
export function mobileDisconnected() { mobileReady = false; emitMobileState() }
export async function flushMobileChanges(): Promise<void> {
  if (mobileSending || !mobileCommit || !mobilePending.size) return
  mobileSending = true
  const changes = [...mobilePending.values()].map(x => ({ ...x }))
  try {
    const result = await mobileCommit(changes)
    if (!result.ok) {
      mobileError = result.error || 'Не удалось сохранить заказ на кассе'
      if (result.conflict) {
        await setMobileStoredValue(CONFLICT_BACKUP_KEY, JSON.stringify({ time: new Date().toISOString(), changes }))
        mobilePending.clear()
        await saveOutbox()
        await dataStore.syncAll()
        window.dispatchEvent(new Event('pos:mobile-conflict'))
      }
      return
    }
    mobileError = ''
    for (const sent of changes) {
      const pendingChange = mobilePending.get(sent.key)
      if (pendingChange?.value === sent.value) mobilePending.delete(sent.key)
      else if (pendingChange) pendingChange.before = result.data?.[sent.key] ?? sent.value
    }
    await saveOutbox().catch(console.error)
    if (result.data) dataStore.applyAll(result.data)
  } catch {
    mobileError = 'Нет подтверждения от кассы. Заказ сохранён на телефоне и будет отправлен при восстановлении связи.'
  } finally {
    mobileSending = false
    emitMobileState()
    if (mobilePending.size) mobileTimer = setTimeout(() => void flushMobileChanges(), 3000)
  }
}
export async function syncMobileConnection(): Promise<void> {
  if (!mobilePending.size) {
    try {
      const saved = JSON.parse(getMobileStoredValue(OUTBOX_KEY) || '{}')
      if (saved.origin === masterOrigin() && Array.isArray(saved.changes)) {
        for (const change of saved.changes) if (MOBILE_KEYS.has(change.key)) mobilePending.set(change.key, change)
      }
    } catch { /* Ignore an invalid local cache. */ }
  }
  await flushMobileChanges()
  await dataStore.syncAll()
}

export function resetMobileData() {
  mobileReady = false
  cache.clear()
  for (const key of SHARED_KEYS) void removeMobileStoredValue(key).catch(console.error)
  localStorage.removeItem('pos_v2_shiftByStaff')
  emitMobileState()
}

export function saveMobileStandaloneData() {
  if (!standaloneMobile()) return
  const data: Record<string, string> = {}
  for (const key of [...SHARED_KEYS, 'pos_v2_shiftByStaff']) {
    const value = SHARED_KEYS.has(key) ? getMobileStoredValue(key) : localStorage.getItem(key)
    if (value !== null) data[key] = value
  }
  void setMobileStoredValue(STANDALONE_SNAPSHOT_KEY, JSON.stringify(data)).catch(console.error)
}

export function restoreMobileStandaloneData() {
  if (!standaloneMobile()) return
  try {
    const data = JSON.parse(getMobileStoredValue(STANDALONE_SNAPSHOT_KEY) || 'null')
    if (!data || typeof data !== 'object' || Array.isArray(data)) return
    for (const [key, value] of Object.entries(data)) {
      if ((SHARED_KEYS.has(key) || key === 'pos_v2_shiftByStaff') && typeof value === 'string') {
        if (SHARED_KEYS.has(key)) void setMobileStoredValue(key, value).catch(console.error)
        else localStorage.setItem(key, value)
        notify(key)
      }
    }
  } catch { /* Keep the current local data if a snapshot is invalid. */ }
}

export function isSharedKey(key: string): boolean {
  return SHARED_KEYS.has(key)
}

function notify(key: string) {
  listeners.get(key)?.forEach(fn => fn())
}

function flush(key: string, value: string) {
  pending.delete(key)
  posFetch(`/api/data/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  }).catch(() => {})
}

export const dataStore = {
  getItem(key: string): string | null {
    if (standaloneMobile()) return SHARED_KEYS.has(key) ? getMobileStoredValue(key) : localStorage.getItem(key)
    if (!SHARED_KEYS.has(key)) return localStorage.getItem(key)
    if (cache.has(key)) return cache.get(key)!
    return isNativeMobile() ? getMobileStoredValue(key) : localStorage.getItem(key)
  },

  setItem(key: string, value: string) {
    if (standaloneMobile()) {
      const before = this.getItem(key)
      if (before === value) return
      if (SHARED_KEYS.has(key)) void setMobileStoredValue(key, value).catch(console.error)
      else localStorage.setItem(key, value)
      notify(key)
      return
    }
    if (!SHARED_KEYS.has(key)) {
      localStorage.setItem(key, value)
      return
    }
    if (isNativeMobile()) {
      if (!mobileReady) return
      if (!MOBILE_KEYS.has(key)) {
        if (this.getItem(key) === value) return
        cache.set(key, value)
        void setMobileStoredValue(key, value).catch(console.error)
        notify(key)
        flush(key, value)
        return
      }
      const before = this.getItem(key)
      if (before === value) return
      const existing = mobilePending.get(key)
      mobilePending.set(key, { key, before: existing ? existing.before : before, value })
      cache.set(key, value)
      void setMobileStoredValue(key, value).catch(error => {
        mobileError = 'Не удалось сохранить заказ на телефоне. Проверьте свободное место.'
        emitMobileState()
        console.error(error)
      })
      notify(key)
      mobileError = ''
      clearTimeout(mobileTimer)
      void saveOutbox().then(() => {
        clearTimeout(mobileTimer)
        mobileTimer = setTimeout(() => void flushMobileChanges(), DEBOUNCE_MS)
      }).catch(error => {
        console.error(error)
        // When local persistence is exhausted, still deliver while HTTP is online.
        mobileTimer = setTimeout(() => void flushMobileChanges(), 0)
      })
      return
    }
    if (cache.get(key) === value) return
    cache.set(key, value)
    localStorage.setItem(key, value)
    notify(key)
    if (IMMEDIATE_KEYS.has(key)) {
      flush(key, value)
      return
    }
    const prev = pending.get(key)
    if (prev) clearTimeout(prev.timer)
    pending.set(key, { value, timer: setTimeout(() => flush(key, value), DEBOUNCE_MS) })
  },

  removeItem(key: string) {
    if (standaloneMobile()) {
      if (SHARED_KEYS.has(key)) void removeMobileStoredValue(key).catch(console.error)
      else localStorage.removeItem(key)
      notify(key)
      return
    }
    if (!SHARED_KEYS.has(key)) {
      localStorage.removeItem(key)
      return
    }
    if (isNativeMobile()) {
      cache.set(key, null)
      void removeMobileStoredValue(key).catch(console.error)
      notify(key)
      void posFetch(`/api/data/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {})
      return
    }
    cache.set(key, null)
    localStorage.removeItem(key)
    notify(key)
    fetch(`/api/data/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {})
  },

  subscribe(key: string, fn: () => void): () => void {
    if (!listeners.has(key)) listeners.set(key, new Set())
    listeners.get(key)!.add(fn)
    return () => listeners.get(key)?.delete(fn)
  },

  // Called when a new value arrives from the backend/socket.
  applyExternal(key: string, value: string | null) {
    if (standaloneMobile()) return
    if (!SHARED_KEYS.has(key)) return
    if (isNativeMobile() && mobilePending.has(key)) return
    const prev = cache.has(key) ? cache.get(key)! : isNativeMobile() ? getMobileStoredValue(key) : null
    if (prev === value) return
    cache.set(key, value)
    if (isNativeMobile()) {
      if (value === null) void removeMobileStoredValue(key).catch(console.error)
      else void setMobileStoredValue(key, value).catch(console.error)
    } else if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
    notify(key)
  },

  applyAll(data: Record<string, string | null>) {
    for (const key of Object.keys(data)) {
      this.applyExternal(key, data[key] ?? null)
    }
  },

  async syncAll(): Promise<void> {
    if (standaloneMobile()) return
    try {
      const res = await posFetch('/api/data')
      if (!res.ok) throw new Error('Не удалось загрузить данные с кассы')
      const json = await res.json()
      if (json?.ok && json.data) {
        if (isNativeMobile()) {
          for (const key of SHARED_KEYS) this.applyExternal(key, json.data[key] ?? null)
          await waitForMobileStorage()
          mobileReady = true
          if (!mobilePending.size && !mobileError.includes('Заказ изменён')) mobileError = ''
          emitMobileState()
        } else this.applyAll(json.data)
      }
    } catch {
      // offline — keep local cache
      if (isNativeMobile()) { mobileReady = false; mobileError = 'Не удалось загрузить данные с кассы. Проверьте Wi-Fi и IP-адрес.'; emitMobileState() }
    }
  },

  clearAll() {
    if (isNativeMobile()) {
      resetMobileData()
      void removeMobileStoredValue(STANDALONE_SNAPSHOT_KEY).catch(console.error)
      return
    }
    for (const key of Array.from(cache.keys())) {
      cache.delete(key)
      localStorage.removeItem(key)
      notify(key)
    }
    fetch('/api/data', { method: 'DELETE' }).catch(() => {})
  },
}
