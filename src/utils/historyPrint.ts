import { dataStore } from '../services/dataStore'
import type { HistoryEntry } from '../data/types'
import QRCode from 'qrcode'
import { getCompanyTin, getCompanyName, getCompanyAddress, getCompanyPhone, fetchAndStoreCompanyData } from './companyInfo'
import { buildAvansReceiptHtml, buildFiscalReceiptHtml, printReceiptHtml, type PaperSize } from './receiptHtml'
import { formatAvansReceipt, formatFiscalReceipt, printText, resolveLogicalPrinter } from './printService'
import { getAvansPrinter } from './avansPrint'
import { tr } from '../i18n'

const PAPER_KEY = 'pos_v2_paper_size'

const ROLE_LABELS: Record<string, string> = {
  waiter: tr('Официант', 'Ofitsiant', 'Waiter'),
  cashier: tr('Кассир', 'Kassir', 'Cashier'),
  admin: tr('Администратор', 'Administrator', 'Administrator'),
}

const METHOD_LABELS: Record<string, string> = {
  cash: tr('Наличной', 'Naqd', 'Cash'),
  card: tr('Карта', 'Karta', 'Card'),
  click: tr('Другое', 'Boshqa', 'Other'),
  split: tr('Разделение', 'Bo\'lish', 'Split'),
}

async function fetchOrg() {
  const info = { stir: getCompanyTin(), name: getCompanyName(), address: getCompanyAddress(), phone: getCompanyPhone() }
  try {
    const fresh = await fetchAndStoreCompanyData()
    if (fresh) {
      if (fresh.stir) info.stir = fresh.stir
      if (fresh.name) info.name = fresh.name
      if (fresh.address) info.address = fresh.address
      if (fresh.phone) info.phone = fresh.phone
    }
  } catch {}
  return info
}

function entryDateTime(entry: HistoryEntry): { dateStr: string; timeStr: string } {
  const [dateStr, timeStr = ''] = (entry.timestamp || '').split(' ')
  return { dateStr: dateStr || '', timeStr }
}

function entryItems(entry: HistoryEntry) {
  return (entry.items || []).map(i => ({
    name: i.name,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    total: i.total,
    mxik: i.mxik || '',
    markCodes: i.markCodes,
  }))
}

export const NoPrinterError = 'NO_PRINTER'

export async function printAvansCopy(entry: HistoryEntry, orderNum: number): Promise<void> {
  const printer = await getAvansPrinter()
  if (!printer) throw new Error(NoPrinterError)
  const paperSize: PaperSize = ((dataStore.getItem(PAPER_KEY) as PaperSize) || '58')
  const org = await fetchOrg()
  const { dateStr, timeStr } = entryDateTime(entry)
  const subtotal = entry.total
  const vat = Math.round(subtotal * 12 / 100)
  const roleLabel = ROLE_LABELS[entry.createdByRole || ''] || entry.createdByRole || ''

  const data = {
    orgName: org.name || '—', orgAddress: org.address || '', orgPhone: org.phone || '',
    orgStir: org.stir || '—', dateStr, timeStr, orderNum,
    tableLabel: entry.tableName, guestCount: entry.guestCount || 1,
    staffName: entry.createdByName || '—', roleLabel,
    shiftNumber: entry.shiftNumber || '001',
    items: entryItems(entry), total: subtotal, vat,
    fmTerminalId: entry.terminalId || '',
  }

  try {
    await printReceiptHtml(printer, buildAvansReceiptHtml(data), paperSize, 'waiter')
  } catch (e) {
    console.error('Печать изображением не удалась, пробуем текстом:', e)
    await printText(printer, formatAvansReceipt(data, paperSize), 'waiter')
  }
}

export async function printFiscalCopy(entry: HistoryEntry, orderNum: number): Promise<void> {
  const printer = await resolveLogicalPrinter('receipt')
  if (!printer) throw new Error(NoPrinterError)
  const paperSize: PaperSize = ((dataStore.getItem(PAPER_KEY) as PaperSize) || '58')
  const org = await fetchOrg()
  const { dateStr, timeStr } = entryDateTime(entry)
  const roleLabel = ROLE_LABELS[entry.createdByRole || ''] || entry.createdByRole || ''

  const totalSum = entry.total
  const servicePercent = entry.servicePercent || 0
  const serviceAmount = Math.round(totalSum * servicePercent / 100)
  const discountValue = entry.discountType === 'percent'
    ? Math.round(totalSum * (entry.discountPercent || 0) / 100)
    : (entry.discountAmount || 0)
  const qqsBase = totalSum + serviceAmount - discountValue
  const qqsAmount = Math.round(qqsBase * 12 / 100)
  const итого = qqsBase

  let qrImgSrc = ''
  if (entry.qrCodeUrl) {
    try {
      qrImgSrc = await QRCode.toDataURL(entry.qrCodeUrl, { width: 480, margin: 1, errorCorrectionLevel: 'M' })
    } catch {}
  }

  const data = {
    orgName: org.name || '—', orgAddress: org.address || '', orgPhone: org.phone || '',
    orgStir: org.stir || '—', dateStr, timeStr, orderNum,
    tableLabel: entry.tableName, guestCount: entry.guestCount || 1,
    staffName: entry.createdByName || '—', roleLabel,
    shiftNumber: entry.shiftNumber || '001',
    items: entryItems(entry), totalSum, serviceAmount, servicePercent,
    discountValue, qqsAmount, итого,
    selectedMethod: entry.paymentMethod ? (METHOD_LABELS[entry.paymentMethod] || entry.paymentMethod) : tr('Не выбран', 'Tanlanmagan', 'Not selected'),
    splitAmounts: null, fmTerminalId: entry.terminalId || '',
    fiscalSign: entry.fiscalSign || '', qrCodeUrl: entry.qrCodeUrl || '',
  }

  if (entry.localOnlyReceipt) {
    const localData = {
      orgName: data.orgName, orgAddress: data.orgAddress, orgPhone: data.orgPhone,
      orgStir: data.orgStir, dateStr, timeStr, orderNum,
      tableLabel: data.tableLabel, guestCount: data.guestCount,
      staffName: data.staffName, roleLabel, shiftNumber: data.shiftNumber,
      items: data.items, total: итого, vat: qqsAmount, fmTerminalId: '',
    }
    try {
      await printReceiptHtml(printer, buildAvansReceiptHtml(localData), paperSize, 'receipt')
    } catch (e) {
      console.error('Печать изображения счета не удалась, пробуем текстом:', e)
      await printText(printer, formatAvansReceipt(localData, paperSize), 'receipt')
    }
    return
  }

  try {
    await printReceiptHtml(printer, buildFiscalReceiptHtml(data, qrImgSrc), paperSize, 'receipt')
  } catch (e) {
    console.error('Печать изображением не удалась, пробуем текстом:', e)
    await printText(printer, formatFiscalReceipt(data, paperSize), 'receipt')
  }
}
