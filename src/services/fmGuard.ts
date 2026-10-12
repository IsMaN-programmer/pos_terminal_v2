import { dataStore } from './dataStore'
import { fiscalDriveApi } from './fiscalDriveApi'
import { isNativeMobile } from './capacitor'
import { posFetch } from './mobileConnection'

const FACTORY_KEY = 'pos_v2_fm_factory_id'
const TERMINAL_KEY = 'pos_v2_fm_terminal_id'
// Mobile keeps its own binding: the phone has no local FiscalDrive,
// it watches the master's module, and desktop keys are owned by Login.
const MOBILE_FACTORY_KEY = 'pos_v2_mobile_fm_factory_id'
const MOBILE_TERMINAL_KEY = 'pos_v2_mobile_fm_terminal_id'
const FISCAL_QUEUE_KEY = 'pos_v2_fiscal_queue'
const RECEIPT_QUEUE_KEY = 'pos_v2_receipt_sync_queue'
const SHIFT_KEY = 'pos_v2_shiftByStaff'

function bindingKeys(): { factory: string; terminal: string } {
  return isNativeMobile()
    ? { factory: MOBILE_FACTORY_KEY, terminal: MOBILE_TERMINAL_KEY }
    : { factory: FACTORY_KEY, terminal: TERMINAL_KEY }
}

export interface FmChangeInfo {
  newFactoryId: string
  newTerminalId: string
  unsent: number
  hasOpenShift: boolean
}

let checking = false

function readJsonArray(key: string): unknown[] {
  try {
    const raw = dataStore.getItem(key)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

function parseFmList(list: unknown): { factoryId: string; terminalId: string } | null {
  const arr = Array.isArray(list) ? list : (Array.isArray((list as any)?.data) ? (list as any).data : [])
  if (!arr.length) return null
  const d = arr[0] as any
  const factoryId = String(d.FactoryID || d.factoryId || '').trim()
  const terminalId = String(d.TerminalID || d.terminalId || '').trim()
  if (!factoryId) return null
  return { factoryId, terminalId }
}

/**
 * Fiscal module currently attached: on desktop via the local FiscalDrive
 * service, on mobile via the master cash register backend (the phone has
 * no local FiscalDrive, and fiscal ops stay on the main kassa).
 */
export async function readCurrentFm(): Promise<{ factoryId: string; terminalId: string } | null> {
  try {
    if (isNativeMobile()) {
      const res = await posFetch('/api/fiscal-drive-proxy/FiscalDrive/List', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) return null
      return parseFmList(await res.json().catch(() => null))
    }
    return parseFmList(await fiscalDriveApi.listFiscalDrives())
  } catch {
    return null
  }
}

function countUnsentReceipts(): number {
  const fiscal = readJsonArray(FISCAL_QUEUE_KEY)
  const pending = fiscal.filter((i: any) => !i || i.status === 'pending' || i.status === 'failed').length
  return pending + readJsonArray(RECEIPT_QUEUE_KEY).length
}

function hasOpenShift(): boolean {
  try {
    const raw = dataStore.getItem(SHIFT_KEY)
    const rec = raw ? JSON.parse(raw) : {}
    return Object.values(rec || {}).some((s: any) => s && s.active === true)
  } catch { return false }
}

export function saveFmBinding(factoryId: string, terminalId: string) {
  const keys = bindingKeys()
  dataStore.setItem(keys.factory, factoryId)
  dataStore.setItem(keys.terminal, terminalId)
}

/**
 * Compares the attached FM with the one bound at login (same idea as
 * posvk_mobile MainShell._checkFmTerminalChanged and pos_system
 * handleIfFiscalModuleChanged). Returns change details when a DIFFERENT
 * module is attached, null otherwise. Never blocks work on errors —
 * like the references, a failed check simply does nothing.
 */
export async function checkFmChanged(): Promise<FmChangeInfo | null> {
  if (checking) return null
  checking = true
  try {
    const current = await readCurrentFm()
    if (!current) return null
    const keys = bindingKeys()
    const savedFactoryId = (dataStore.getItem(keys.factory) || '').trim()
    const savedTerminalId = (dataStore.getItem(keys.terminal) || '').trim()
    if (!savedFactoryId && !savedTerminalId) {
      // First binding — not a change.
      saveFmBinding(current.factoryId, current.terminalId)
      return null
    }
    const fiscalChanged = !!savedFactoryId && savedFactoryId !== current.factoryId
    const terminalChanged = !!savedTerminalId && !!current.terminalId && savedTerminalId !== current.terminalId
    if (!fiscalChanged && !terminalChanged) return null
    return {
      newFactoryId: current.factoryId,
      newTerminalId: current.terminalId,
      unsent: countUnsentReceipts(),
      hasOpenShift: hasOpenShift(),
    }
  } catch {
    return null
  } finally {
    checking = false
  }
}
