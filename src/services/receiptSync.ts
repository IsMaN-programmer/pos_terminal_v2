import { dataStore } from './dataStore'
import { isNativeMobile } from './capacitor'
import { cabinetFetch } from './cabinetTransport'
import type { HistoryEntry } from '../data/types'

const RECEIPT_SYNC_QUEUE_KEY = 'pos_v2_receipt_sync_queue'

export interface CabinetReceiptProductPayload {
  id: string
  mxikCode?: string
  packageCode?: string
  packageName?: string
  productId: number
  productName?: string
  amount: number
  salePrice?: number
  totalPrice?: number
  discountSum?: number
  vatSum?: number
  label?: string
  perAmount?: number
}

export interface CabinetReceiptPayload {
  id: string
  companyId: number
  terminalId: string
  shiftId: string
  receiptTypeId: number
  operationTypeId: number
  txId?: number
  receiptSeq?: number
  receiptDate?: string
  fiscalSign?: string
  qrcodeUrl?: string
  sentToOfd: number
  deleted: boolean
  createdDate: string
  userId: number
  licenseId?: string
  totalSum: number
  paidSum: number
  changeSum: number
  vatSum: number
  cashSum: number
  cardSum: number
  certificateSum: number
  commentary: string
  cardNumber: string
  rrn: string
  products: CabinetReceiptProductPayload[]
}

interface QueueEntry {
  payload: CabinetReceiptPayload
  attempts: number
  lastError: string
  createdAt: string
}

function numberValue(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function serverDate(value?: string): string {
  const date = value ? new Date(value.replace(' ', 'T')) : new Date()
  const safe = Number.isNaN(date.getTime()) ? new Date() : date
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())} ${pad(safe.getHours())}:${pad(safe.getMinutes())}:${pad(safe.getSeconds())}`
}

export interface CabinetReceiptItem {
  id: number
  productName: string
  salePrice: number
  saleCount: number
  totalPrice: number
  vatSum: number
  mxikCode: string
}

function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.floor(Math.random() * 16)
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function validUuid(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null
}

export function cabinetShiftId(rawValue: unknown): string {
  const raw = String(rawValue ?? '').trim() || 'default'
  const direct = validUuid(raw)
  if (direct) return direct
  let ids: Record<string, string> = {}
  try {
    const parsed = JSON.parse(dataStore.getItem('pos_v2_cabinet_shift_ids') || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ids = parsed
  } catch {}
  const existing = validUuid(ids[raw])
  if (existing) return existing
  const id = newUuid()
  ids[raw] = id
  dataStore.setItem('pos_v2_cabinet_shift_ids', JSON.stringify(ids))
  return id
}

export function buildCabinetReceiptPayload(receipt: any, registration: any, factoryId: string, txId?: number): CabinetReceiptPayload {
  const items = Array.isArray(receipt?.Items) ? receipt.Items : []
  const meta = Array.isArray(receipt?._cabinetProducts) ? receipt._cabinetProducts : []
  const companyId = numberValue(receipt?._companyId ?? dataStore.getItem('pos_v2_cabinet_company_id'))
  const terminalId = String(registration?.TerminalID ?? registration?.terminalId ?? receipt?._terminalId ?? '').trim()
  const receiptSeq = numberValue(registration?.ReceiptSeq ?? registration?.receiptSeq ?? registration?.receiptNumber)
  const fiscalSign = String(registration?.FiscalSign ?? registration?.fiscalSign ?? '').trim()
  const receiptDate = serverDate(registration?.DateTime ?? registration?.dateTime ?? receipt?.Time)
  const id = validUuid(receipt?._receiptId) || validUuid(registration?.receiptId) || newUuid()
  const createdDate = serverDate(receipt?._createdDate)
  const cashSum = numberValue(receipt?.ReceivedCash)
  const cardSum = numberValue(receipt?.ReceivedCard)
  let stockGoods: any[] = []
  try {
    const parsed = JSON.parse(dataStore.getItem('pos_v2_stock_goods') || '[]')
    if (Array.isArray(parsed)) stockGoods = parsed
  } catch {}
  const products: CabinetReceiptProductPayload[] = items.map((item: any, index: number): CabinetReceiptProductPayload => {
    const product = meta[index] || {}
    const stockGood = stockGoods.find(g => String(g?.mxik ?? '').trim() === String(product.mxikCode ?? item.SPIC ?? '').trim())
    return {
      id: validUuid(product.id) || newUuid(),
      mxikCode: String(product.mxikCode ?? item.SPIC ?? '').trim() || undefined,
      packageCode: String(product.packageCode ?? item.PackageCode ?? '').trim() || undefined,
      packageName: String(product.packageName ?? '').trim() || undefined,
      productId: numberValue(product.productId ?? stockGood?.cabinetId, 0),
      productName: String(product.productName ?? item.Name ?? '').trim() || undefined,
      amount: numberValue(product.amount, numberValue(item.Amount) / 1000),
      perAmount: numberValue(product.perAmount, 1),
      salePrice: numberValue(product.salePrice, numberValue(item.Price)),
      totalPrice: numberValue(product.totalPrice, numberValue(item.Price)),
      discountSum: numberValue(product.discountSum, numberValue(item.Discount)),
      vatSum: numberValue(product.vatSum, numberValue(item.VAT)),
      label: String(product.label ?? item.label ?? '').trim() || undefined,
    }
  })
  // Payment fields contain the final amount after discount. The cabinet API
  // treats a separate product discount inconsistently, so products are
  // normalized to their net values immediately before sending.
  const totalSum = cashSum + cardSum
  const vatSum = products.reduce((sum: number, item: CabinetReceiptProductPayload) => sum + numberValue(item.vatSum), 0)
  return {
    id,
    companyId,
    terminalId,
    shiftId: cabinetShiftId(receipt?._shiftId || `SHIFT-${terminalId || factoryId}-${receiptDate.slice(0, 10)}`),
    receiptTypeId: numberValue(receipt?._receiptTypeId, 0),
    operationTypeId: numberValue(receipt?._operationTypeId, 0),
    txId: numberValue(txId ?? registration?.TXID ?? registration?.txId) || undefined,
    receiptSeq: receiptSeq || undefined,
    receiptDate,
    fiscalSign: fiscalSign || undefined,
    qrcodeUrl: String(registration?.QRCodeURL ?? registration?.qrCodeUrl ?? '').trim() || undefined,
    sentToOfd: 1,
    deleted: false,
    createdDate,
    userId: numberValue(dataStore.getItem('pos_v2_cabinet_user_id'), numberValue(receipt?._userId, 1)),
    licenseId: factoryId || undefined,
    totalSum,
    paidSum: cashSum + cardSum,
    changeSum: 0,
    vatSum,
    cashSum,
    cardSum,
    certificateSum: 0,
    commentary: '',
    cardNumber: String(receipt?._cardNumber ?? ''),
    rrn: String(receipt?._rrn ?? ''),
    products,
  }
}

function normalizedCabinetReceiptPayload(payload: CabinetReceiptPayload): CabinetReceiptPayload {
  let receiptNetVat = 0
  const products = payload.products.map(product => {
    const grossTotal = Math.max(0, numberValue(product.totalPrice))
    const discount = Math.min(grossTotal, Math.max(0, numberValue(product.discountSum)))
    const netTotal = grossTotal - discount
    const grossVat = Math.max(0, numberValue(product.vatSum))
    const netVat = grossTotal > 0 ? Math.round(grossVat * netTotal / grossTotal) : grossVat
    const baseSaleTotal = Math.max(0, numberValue(product.salePrice)) * Math.max(0, numberValue(product.amount))
    const itemSaleVat = Math.round(baseSaleTotal * 12 / 100)
    receiptNetVat += netVat
    return {
      ...product,
      totalPrice: netTotal,
      discountSum: 0,
      // Item details show VAT for the dish sale price only (without service).
      // The receipt header keeps VAT for the final total including service.
      vatSum: itemSaleVat,
    }
  })
  const paymentTotal = numberValue(payload.cashSum) + numberValue(payload.cardSum) + numberValue(payload.certificateSum)
  return { ...payload, products, totalSum: paymentTotal, paidSum: paymentTotal, vatSum: receiptNetVat }
}

export async function sendCabinetReceipt(payload: CabinetReceiptPayload): Promise<void> {
  if (!payload.companyId || !payload.terminalId || !payload.shiftId || payload.products.length === 0) {
    throw new Error('Недостаточно данных для отправки чека в кабинет')
  }
  if (payload.products.some(product => !product.productId)) {
    throw new Error('Один из товаров чека ещё не синхронизирован с кабинетом')
  }
  const token = (dataStore.getItem('pos_v2_cabinet_token') || '').trim()
  if (!token) throw new Error('Не выполнен вход в кабинет')
  const normalizedPayload = normalizedCabinetReceiptPayload(payload)
  if (isNativeMobile()) throw new Error('Отправка чеков выполняется только на главной кассе')
  const response = await fetch('/api/cabinet-proxy/desktop/vcr/save-check-details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(normalizedPayload),
  })
  const text = await response.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch {}
  if (!response.ok || body?.success !== true) {
    throw new Error(String(body?.message ?? body?.reason ?? text ?? `HTTP ${response.status}`).slice(0, 300))
  }
}

function loadQueue(): QueueEntry[] {
  try {
    const parsed = JSON.parse(dataStore.getItem(RECEIPT_SYNC_QUEUE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveQueue(queue: QueueEntry[]) {
  dataStore.setItem(RECEIPT_SYNC_QUEUE_KEY, JSON.stringify(queue))
}

export function queueCabinetReceipt(payload: CabinetReceiptPayload, error: unknown) {
  const queue = loadQueue().filter(item => item.payload?.id !== payload.id)
  queue.push({
    payload,
    attempts: 0,
    lastError: error instanceof Error ? error.message : String(error),
    createdAt: new Date().toISOString(),
  })
  saveQueue(queue)
}

export async function flushCabinetReceiptQueue(): Promise<{ sent: number; failed: number; lastError?: string }> {
  const queue = loadQueue()
  const remaining: QueueEntry[] = []
  let sent = 0
  for (const item of queue) {
    try {
      await sendCabinetReceipt(item.payload)
      sent++
    } catch (error) {
      remaining.push({ ...item, attempts: item.attempts + 1, lastError: error instanceof Error ? error.message : String(error) })
    }
  }
  saveQueue(remaining)
  return { sent, failed: remaining.length, lastError: remaining.length ? remaining[remaining.length - 1].lastError : undefined }
}

function extractReceipts(body: any): any[] {
  if (Array.isArray(body)) return body
  const data = body?.data
  if (Array.isArray(data)) return data
  for (const value of [data?.content, data?.items, data?.list, data?.rows, body?.content, body?.items]) {
    if (Array.isArray(value)) return value
  }
  return []
}

function extractReceiptItems(body: any): any[] {
  if (Array.isArray(body)) return body
  for (const value of [
    body?.items,
    body?.content,
    body?.data,
    body?.data?.items,
    body?.data?.content,
    body?.data?.list,
    body?.data?.rows,
  ]) {
    if (Array.isArray(value)) return value
  }
  return []
}

function displayDate(value: unknown): string {
  const date = new Date(String(value ?? '').replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return String(value ?? '')
  return `${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

function moneyFromCabinet(value: unknown): number {
  return Math.round(numberValue(value))
}

export async function fetchCabinetReceiptItems(locId: string): Promise<CabinetReceiptItem[]> {
  const token = (dataStore.getItem('pos_v2_cabinet_token') || '').trim()
  const cashId = numberValue(dataStore.getItem('pos_v2_cabinet_cash_id'))
  if (!token || !locId) throw new Error('Недостаточно данных для загрузки позиций чека')
  const params = new URLSearchParams({ locId, page: '0', size: '1000' })
  if (cashId) params.set('cashId', String(cashId))
  const response = await cabinetFetch(`/api/cabinet-proxy/api/invoices-data-items-list?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch {}
  if (!response.ok) throw new Error(String(body?.message ?? body?.reason ?? text ?? `HTTP ${response.status}`).slice(0, 300))
  return extractReceiptItems(body).map((item: any, index: number) => ({
    id: numberValue(item.id ?? item.productId, index + 1),
    productName: String(item.productName ?? item.name ?? ''),
    salePrice: moneyFromCabinet(item.salePrice ?? item.price),
    saleCount: numberValue(item.saleCount ?? item.amount ?? item.quantity, 1),
    totalPrice: moneyFromCabinet(item.totalPrice ?? item.total) - moneyFromCabinet(item.discountSum),
    vatSum: moneyFromCabinet(item.vatSum),
    mxikCode: String(item.mxikCode ?? item.spic ?? ''),
  }))
}

export async function fetchCabinetReceiptHistory(): Promise<HistoryEntry[]> {
  const token = (dataStore.getItem('pos_v2_cabinet_token') || '').trim()
  const companyId = numberValue(dataStore.getItem('pos_v2_cabinet_company_id'))
  const cashId = numberValue(dataStore.getItem('pos_v2_cabinet_cash_id'))
  if (!token || !companyId) throw new Error('Не выполнен вход в кабинет')
  const params = new URLSearchParams({ companyId: String(companyId), page: '0', size: '1000' })
  if (cashId) params.set('cashId', String(cashId))
  const response = await fetch(`/api/fiscal-receipt-history?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  let body: any = null
  try { body = text ? JSON.parse(text) : null } catch {}
  if (!response.ok) throw new Error(String(body?.message ?? body?.reason ?? text ?? `HTTP ${response.status}`).slice(0, 300))
  return extractReceipts(body).map((receipt: any, index: number): HistoryEntry => {
    const products = Array.isArray(receipt.products ?? receipt.items) ? (receipt.products ?? receipt.items) : []
    const total = numberValue(receipt.paidSum ?? receipt.totalPay ?? receipt.totalSum)
    const cash = numberValue(receipt.cashSum ?? receipt.cashPay ?? receipt.cash)
    const explicitCard = numberValue(receipt.cardSum ?? receipt.cardPay ?? receipt.card)
    // Cabinet's own web UI derives card payment as totalSum - cashSum.
    const card = explicitCard > 0 ? explicitCard : Math.max(total - cash, 0)
    const remoteId = String(receipt.id ?? receipt.receiptId ?? receipt.invoicesDataLocId ?? `${receipt.terminalId}-${receipt.receiptSeq}-${index}`)
    const locId = String(receipt.locId ?? receipt.invoicesDataLocId ?? receipt.invoicesDataLocationId ?? remoteId)
    return {
      id: `cabinet:${remoteId}`,
      tableId: 0,
      tableName: String(receipt.tableName ?? 'Кабинет'),
      zone: String(receipt.zone ?? ''),
      timestamp: displayDate(receipt.dateTime ?? receipt.receiptDate ?? receipt.createdDate),
      itemCount: products.reduce((sum: number, item: any) => sum + numberValue(item.amount ?? item.saleCount, 1), 0),
      total: moneyFromCabinet(total),
      status: 'paid',
      paymentMethod: cash > 0 && card > 0 ? 'split' : card > 0 ? 'card' : 'cash',
      createdByRole: 'cashier',
      createdByName: String(receipt.userName ?? receipt.cashier ?? receipt.createdByName ?? ''),
      items: products.map((item: any, itemIndex: number) => ({
        id: numberValue(item.productId ?? item.id, itemIndex + 1),
        name: String(item.productName ?? item.name ?? ''),
        quantity: numberValue(item.amount ?? item.saleCount, 1),
        unitPrice: moneyFromCabinet(item.salePrice ?? item.price),
        total: moneyFromCabinet(item.totalPrice ?? item.total),
        mxik: String(item.mxikCode ?? item.spic ?? ''),
        markCodes: item.label ? [String(item.label)] : undefined,
      })),
      fiscalSign: String(receipt.fiscalSign ?? receipt.fiskalSign ?? ''),
      qrCodeUrl: String(receipt.qrcodeUrl ?? receipt.qrCodeUrl ?? ''),
      terminalId: String(receipt.terminalId ?? ''),
      receiptSeq: numberValue(receipt.receiptSeq ?? receipt.receiptSec),
      cabinetReceiptId: remoteId,
      cabinetLocId: locId,
      cashPaymentSum: moneyFromCabinet(cash),
      cardPaymentSum: moneyFromCabinet(card),
      ofdStatus: numberValue(receipt.sentToOfd ?? receipt.sendOfdStatus, 1) === 1 ? 'synced' : 'pending',
      factoryId: String(receipt.licenseId ?? receipt.license ?? ''),
    }
  })
}
