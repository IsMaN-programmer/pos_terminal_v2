import type { HistoryEntry } from '../data/types'
import { dataStore } from './dataStore'
import { isNativeMobile } from './capacitor'
import { cabinetShiftId } from './receiptSync'

export const SHIFT_LOG_KEY = 'pos_v2_shift_log'

export type ShiftCabinetStatus = 'pending' | 'synced' | 'failed'

export interface SyncableShiftLogEntry {
  id?: string
  number: number
  receiptShiftNumber?: string
  cashierName: string
  userId?: number
  openTime: string
  closeTime: string
  sales: number
  served: number
  cabinetStatus?: ShiftCabinetStatus
  cabinetError?: string
  cabinetSyncedAt?: string
}

interface CabinetShiftPayload {
  id: string
  userId: number
  license?: string
  openDate?: string
  closeDate?: string
  totalReceiptCount: number
  saleReceiptCount: number
  totalReceiptSum: number
  saleReceiptSum: number
  refundReceiptSum: number
  vatReceiptSum: number
  cardReceiptSum: number
  cashReceiptSum: number
  status: number
  refReceiptCount: number
  companyId: number
  cashId: number
  createdDate: string
  requestData?: string
}

function numberValue(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function apiDate(value: string | undefined): string | undefined {
  const text = String(value || '').trim()
  if (!text || text === '—') return undefined
  const match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return text
  return `${match[1]}.${match[2]}.${match[3]} ${match[4]}:${match[5]}:${match[6] || '00'}`
}

function nowApiDate(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function loadShiftLog(): SyncableShiftLogEntry[] {
  try {
    const parsed = JSON.parse(dataStore.getItem(SHIFT_LOG_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveShiftLog(log: SyncableShiftLogEntry[]): void {
  dataStore.setItem(SHIFT_LOG_KEY, JSON.stringify(log))
}

function paidTotal(entry: HistoryEntry): number {
  const service = Math.round(entry.total * (entry.servicePercent || 0) / 100)
  const discount = entry.discountType === 'percent'
    ? Math.round(entry.total * (entry.discountPercent || 0) / 100)
    : (entry.discountAmount || 0)
  return Math.max(0, entry.total + service - discount)
}

function vatTotal(entry: HistoryEntry): number {
  return Math.round(paidTotal(entry) * 12 / 100)
}

export function receiptShiftNumber(shift: SyncableShiftLogEntry): string {
  return shift.receiptShiftNumber || String(Math.max(1, shift.number)).padStart(3, '0')
}

function checksForShift(shift: SyncableShiftLogEntry, history: HistoryEntry[]): HistoryEntry[] {
  const number = receiptShiftNumber(shift)
  return history.filter(entry =>
    entry.status === 'paid'
    && !entry.localOnlyReceipt
    && entry.shiftNumber === number
    && (!shift.cashierName || !entry.createdByName || entry.createdByName === shift.cashierName)
  )
}

function paymentParts(entry: HistoryEntry): { cash: number; card: number } {
  const total = paidTotal(entry)
  if (entry.cashPaymentSum != null || entry.cardPaymentSum != null) {
    return {
      cash: Math.max(0, numberValue(entry.cashPaymentSum)),
      card: Math.max(0, numberValue(entry.cardPaymentSum)),
    }
  }
  if (entry.paymentMethod === 'cash') return { cash: total, card: 0 }
  if (entry.paymentMethod === 'card' || entry.paymentMethod === 'click') return { cash: 0, card: total }
  return { cash: 0, card: total }
}

function buildPayload(shift: SyncableShiftLogEntry, history: HistoryEntry[]): CabinetShiftPayload {
  const number = receiptShiftNumber(shift)
  const id = shift.id || cabinetShiftId(`SHIFT-${number}`)
  const checks = checksForShift(shift, history)
  const saleSum = checks.reduce((sum, entry) => sum + paidTotal(entry), 0)
  const vatSum = checks.reduce((sum, entry) => sum + vatTotal(entry), 0)
  const payments = checks.reduce((sum, entry) => {
    const part = paymentParts(entry)
    return { cash: sum.cash + part.cash, card: sum.card + part.card }
  }, { cash: 0, card: 0 })
  const terminalId = (dataStore.getItem('pos_v2_fm_terminal_id') || '').trim()

  return {
    id,
    userId: numberValue(dataStore.getItem('pos_v2_cabinet_user_id')) || numberValue(shift.userId) || 1,
    license: (dataStore.getItem('pos_v2_fm_factory_id') || checks.find(e => e.factoryId)?.factoryId || '').trim() || undefined,
    openDate: apiDate(shift.openTime),
    closeDate: apiDate(shift.closeTime),
    totalReceiptCount: checks.length,
    saleReceiptCount: checks.length,
    totalReceiptSum: Math.round(saleSum * 100),
    saleReceiptSum: Math.round(saleSum * 100),
    refundReceiptSum: 0,
    vatReceiptSum: Math.round(vatSum * 100),
    cardReceiptSum: Math.round(payments.card * 100),
    cashReceiptSum: Math.round(payments.cash * 100),
    status: 0,
    refReceiptCount: 0,
    companyId: numberValue(dataStore.getItem('pos_v2_cabinet_company_id')),
    cashId: numberValue(dataStore.getItem('pos_v2_cabinet_cash_id')),
    createdDate: nowApiDate(),
    requestData: terminalId ? JSON.stringify({ TerminalID: terminalId }) : undefined,
  }
}

async function sendShift(payload: CabinetShiftPayload): Promise<void> {
  if (isNativeMobile()) throw new Error('Фискальные смены отправляет главная касса')
  const token = (dataStore.getItem('pos_v2_cabinet_token') || '').trim()
  if (!token || !payload.companyId || !payload.cashId) throw new Error('Не выполнен вход в кабинет')
  const response = await fetch('/api/cabinet-proxy/desktop/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch {}
  if (!response.ok || (body && typeof body === 'object' && body.success === false)) {
    throw new Error(String(body?.message ?? body?.reason ?? text ?? `HTTP ${response.status}`).slice(0, 300))
  }
}

export async function syncCabinetShifts(
  history: HistoryEntry[],
  options: { shiftIds?: string[] } = {},
): Promise<{ sent: number; failed: number; remaining: number; lastError?: string }> {
  let log = loadShiftLog()
  const selected = options.shiftIds ? new Set(options.shiftIds) : null
  let sent = 0
  let failed = 0
  let lastError: string | undefined

  for (let index = 0; index < log.length; index++) {
    const current = log[index]
    const id = current.id || cabinetShiftId(`SHIFT-${receiptShiftNumber(current)}`)
    if (selected && !selected.has(id)) continue
    if (!selected && current.cabinetStatus === 'synced') continue
    const normalized = { ...current, id }
    try {
      await sendShift(buildPayload(normalized, history))
      log[index] = { ...normalized, cabinetStatus: 'synced', cabinetError: undefined, cabinetSyncedAt: new Date().toISOString() }
      sent++
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      log[index] = { ...normalized, cabinetStatus: 'failed', cabinetError: lastError }
      failed++
    }
    saveShiftLog(log)
  }

  const remaining = log.filter(item => item.cabinetStatus !== 'synced').length
  return { sent, failed, remaining, lastError }
}
