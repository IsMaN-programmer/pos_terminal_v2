import { dataStore } from '../services/dataStore'
import type { OrderItem } from '../data/types'
import type { Table } from '../data/types'
import { fiscalDriveApi } from '../services/fiscalDriveApi'
import { getCompanyTin, getCompanyName, getCompanyAddress, getCompanyPhone, fetchAndStoreCompanyData } from './companyInfo'
import { buildAvansReceiptHtml, printReceiptHtml, type PaperSize } from './receiptHtml'
import { formatAvansReceipt, printText, resolveLogicalPrinter } from './printService'
import { locale, tr } from '../i18n'
import { isNativeMobile } from '../services/capacitor'

const PRINTERS_KEY = 'pos_v2_printer_name'
const PAPER_KEY = 'pos_v2_paper_size'
const WAITER_PRINTERS_KEY = 'pos_v2_waiter_printer_name'
const ORDER_COUNTER_KEY = 'pos_v2_order_counter'

const ROLE_LABELS: Record<string, string> = { waiter: tr('Официант', 'Ofitsiant', 'Waiter'), cashier: tr('Кассир', 'Kassir', 'Cashier'), admin: tr('Администратор', 'Administrator', 'Administrator') }

export async function getAvansPrinter(): Promise<string> {
  const resolved = await resolveLogicalPrinter('waiter')
  if (resolved) return resolved
  return dataStore.getItem(WAITER_PRINTERS_KEY) || dataStore.getItem(PRINTERS_KEY) || ''
}

export function getNextOrderNumber(): number {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw = dataStore.getItem(ORDER_COUNTER_KEY)
    const counter: Record<string, number> = raw ? JSON.parse(raw) : {}
    const next = (counter[today] || 0) + 1
    counter[today] = next
    dataStore.setItem(ORDER_COUNTER_KEY, JSON.stringify(counter))
    return next
  } catch {
    return Math.floor(Math.random() * 9000) + 1000
  }
}

export interface AvansPrintParams {
  orderItems: OrderItem[]
  table: Table | null
  guestCount: number
  staffName: string
  userRole: string
  shiftNumber?: string
  orderNum: number
}

export async function runAvansPrint(params: AvansPrintParams): Promise<void> {
  const { orderItems, table, guestCount, staffName, userRole, shiftNumber = '001', orderNum } = params
  const printer = await getAvansPrinter()
  const paperSize: PaperSize = ((dataStore.getItem(PAPER_KEY) as PaperSize) || '58')
  const now = new Date()
  const dateStr = now.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  let orgStir = getCompanyTin()
  let orgName = getCompanyName()
  let orgAddress = getCompanyAddress()
  let orgPhone = getCompanyPhone()

  try {
    const info = await fetchAndStoreCompanyData()
    if (info) {
      if (info.stir) orgStir = info.stir
      if (info.name) orgName = info.name
      if (info.address) orgAddress = info.address
      if (info.phone) orgPhone = info.phone
    }
  } catch {}

  let fmTerminalId = ''
  try {
    const data = await fiscalDriveApi.listFiscalDrives()
    const list = Array.isArray(data) ? data : (Array.isArray((data as any)?.data) ? (data as any).data : [])
    if (list.length > 0) {
      const factoryId = list[0].FactoryID || list[0].factoryId || ''
      if (factoryId) {
        const info = await fiscalDriveApi.getFiscalMemoryInfo(factoryId)
        const i = info?.data || info || {}
        fmTerminalId = i.TerminalID || i.terminalId || i.terminal_id || ''
      }
    }
  } catch {}

  const subtotal = orderItems.reduce((s, i) => s + i.total, 0)
  const vat = Math.round(subtotal * 12 / 100)
  const roleLabel = ROLE_LABELS[userRole] || userRole

  const items = orderItems.map(i => ({
    name: i.menuItem.name, quantity: i.quantity,
    unitPrice: i.unitPrice, total: i.total, mxik: i.menuItem.mxik || '', markCodes: i.markCodes,
  }))

  const html = buildAvansReceiptHtml({
    orgName: orgName || '—', orgAddress: orgAddress || '', orgPhone: orgPhone || '',
    orgStir: orgStir || '—', dateStr, timeStr, orderNum,
    tableLabel: table?.name || '—', guestCount, staffName, roleLabel, shiftNumber,
    items, total: subtotal, vat, fmTerminalId,
  })

  try {
    await printReceiptHtml(printer, html, paperSize, 'waiter')
  } catch (e) {
    console.error('Печать изображением не удалась, пробуем текстом:', e)
    try {
      const text = formatAvansReceipt({
        orgName: orgName || '—', orgAddress: orgAddress || '', orgPhone: orgPhone || '',
        orgStir: orgStir || '—', dateStr, timeStr, orderNum,
        tableLabel: table?.name || '—', guestCount, staffName, roleLabel, shiftNumber,
        items, total: subtotal, vat, fmTerminalId,
      }, paperSize)
      await printText(printer, text, 'waiter')
    } catch (e2) {
      if (isNativeMobile()) throw e2
      alert(tr('Ошибка печати: ' + (e2 instanceof Error ? e2.message : 'неизвестная ошибка'), "Chop etish xatosi: " + (e2 instanceof Error ? e2.message : "noma'lum xato")))
    }
  }
}
