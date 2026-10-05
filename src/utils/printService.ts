const W58 = 32
const W80 = 48

import { tr } from '../i18n'
import { dataStore } from '../services/dataStore'
import { posFetch } from '../services/mobileConnection'

function width(paperSize: string): number {
  return paperSize === '80' ? W80 : W58
}

// Returns the printer name configured for a logical role (receipt/kitchen/
// waiter). The centrally configured server printers take priority, the local
// dataStore value is the fallback - both must agree for the client-side
// checks and the backend dispatch to work.
export async function resolveLogicalPrinter(logical: 'receipt' | 'kitchen' | 'waiter'): Promise<string> {
  try {
    const res = await posFetch('/api/network/status')
    if (res.ok) {
      const d = await res.json()
      const p = d?.printers?.[logical]?.printer
      if (p) return p
    }
  } catch {}
  const keys: Record<string, string> = {
    receipt: 'pos_v2_printer_name',
    kitchen: 'pos_v2_kitchen_printer_name',
    waiter: 'pos_v2_waiter_printer_name',
  }
  return dataStore.getItem(keys[logical]) || ''
}

function center(text: string, w: number): string {
  const pad = Math.max(0, w - text.length)
  return ' '.repeat(Math.floor(pad / 2)) + text
}

function lr(left: string, right: string, w: number): string {
  const gap = Math.max(1, w - left.length - right.length)
  return left + ' '.repeat(gap) + right
}

function sep(ch: string, w: number): string {
  return ch.repeat(w)
}

export async function getConnectedPrinters(): Promise<string[]> {
  return posFetch('/api/printers')
    .then(r => r.json())
    .then(d => d.printers || [])
    .catch(() => [])
}

export async function printText(printerName: string, content: string, logical?: 'receipt' | 'kitchen' | 'waiter'): Promise<void> {
  const res = await posFetch('/api/print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printerName, content, logical }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Print failed' }))
    throw new Error(err.error || 'Print failed')
  }
}

export function formatKitchenReceipt(data: {
  kitchenName: string
  tableLabel: string
  guestCount: number
  dateStr: string
  timeStr: string
  items: Array<{ name: string; quantity: number; comment?: string; sub?: boolean }>
  orderComment?: string
  orderTags?: string[]
  orderModifiers?: string[]
}, paperSize: string): string {
  const W = width(paperSize)
  const r: string[] = []
  r.push(sep('=', W))
  r.push(center(data.kitchenName, W))
  r.push(sep('=', W))
  r.push(lr(tr('Стол:', 'Stol:', 'Table:'), data.tableLabel, W))
  r.push(lr(tr('Гости:', 'Mehmonlar:', 'Guests:'), String(data.guestCount), W))
  r.push(lr(tr('Время:', 'Vaqt:', 'Time:'), data.dateStr + ' ' + data.timeStr, W))
  r.push(sep('-', W))
  const note = [...(data.orderTags || []), ...(data.orderComment ? [data.orderComment] : [])].join(' · ')
  if (note) r.push(note.length > W ? note.slice(0, W - 1) + '…' : note)
  if (data.orderModifiers && data.orderModifiers.length > 0) {
    const mods = tr('Модификаторы:', 'Modifikatorlar:', 'Modifiers:') + ' ' + data.orderModifiers.join(', ')
    r.push(mods.length > W ? mods.slice(0, W - 1) + '…' : mods)
  }
  for (const item of data.items) {
    const line = (item.sub ? '→ ' : '') + item.name + '  x' + item.quantity
    r.push(line.length > W ? line.slice(0, W - 1) + '…' : line)
    if (item.comment) r.push('> ' + item.comment.slice(0, W - 3))
  }
  r.push(sep('-', W))
  r.push(center(tr('Заказ отправляется', 'Buyurtma yuborilmoqda', 'Order is being sent'), W))
  r.push(center(tr('на кухню', 'oshxonaga', 'to kitchen'), W))
  r.push(sep('=', W))
  r.push('', '')
  return r.join('\r\n')
}

export function formatAvansReceipt(data: {
  orgName: string; orgAddress: string; orgPhone: string; orgStir: string
  dateStr: string; timeStr: string; orderNum: number
  tableLabel: string; guestCount: number; staffName: string; roleLabel: string
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number; mxik: string; markCodes?: string[] }>
  total: number; vat: number; fmTerminalId: string; shiftNumber: string
}, paperSize: string): string {
  const W = width(paperSize)
  const r: string[] = []
  r.push(sep('=', W))
  r.push(center(data.orgName, W))
  if (data.orgAddress) r.push(center(data.orgAddress, W))
  if (data.orgPhone) r.push(center(data.orgPhone, W))
  r.push(sep('=', W))
  r.push(lr('STIR: ' + (data.orgStir || '—'), '', W))
  r.push(lr(data.dateStr, data.timeStr, W))
  r.push(lr(tr('Заказ: #', 'Buyurtma: #', 'Order: #') + data.orderNum, '', W))
  r.push(lr(tr('Стол:', 'Stol:', 'Table:') + ' ' + data.tableLabel, tr('Гости:', 'Mehmonlar:', 'Guests:') + ' ' + data.guestCount, W))
  r.push(lr(data.roleLabel + ': ' + data.staffName, '', W))
  r.push(lr(tr('Смена:', 'Smena:', 'Shift:'), data.shiftNumber, W))
  r.push(sep('-', W))

  for (const item of data.items) {
    const line = item.name + '  ' + item.quantity + ' x ' + item.unitPrice.toLocaleString()
    r.push(line.length > W ? line.slice(0, W - 1) + '…' : line)
    r.push(lr('', 'QQS 12%: ' + Math.round(item.total * 12 / 100).toLocaleString(), W))
    if (item.markCodes && item.markCodes.length > 0) {
      r.push(tr('Маркировка:', 'Markirovka:', 'Labeling:'))
      for (const c of item.markCodes) {
        r.push(c.length > W - 2 ? c.slice(0, W - 3) + '…' : c)
      }
    }
  }

  r.push(sep('-', W))
  r.push(lr(tr('ИТОГО:', 'JAMI:', 'TOTAL:'), data.total.toLocaleString() + ' ' + tr('сум', 'so\'m', 'sum'), W))
  r.push(lr('QQS 12%:', data.vat.toLocaleString(), W))
  if (data.fmTerminalId) {
    r.push(sep('-', W))
    r.push(lr(tr('Терминал ID:', 'Terminal ID:', 'Terminal ID:'), data.fmTerminalId, W))
  }
  r.push(sep('=', W))
  r.push(center(tr('Спасибо! Ждём вас снова.', 'Rahmat! Yana kutib qolamiz.', 'Thank you! We look forward to seeing you again.'), W))
  r.push(sep('=', W))
  r.push('', '')
  return r.join('\r\n')
}

export function formatFiscalReceipt(data: {
  orgName: string; orgAddress: string; orgPhone: string; orgStir: string
  dateStr: string; timeStr: string; orderNum: number
  tableLabel: string; guestCount: number; staffName: string; roleLabel: string
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number; mxik: string; markCodes?: string[] }>
  totalSum: number; serviceAmount: number; servicePercent: number
  discountValue: number; qqsAmount: number; итого: number
  selectedMethod: string; splitAmounts?: { cash: number; card: number; click: number } | null
  fmTerminalId: string; fiscalSign?: string; qrCodeUrl?: string; shiftNumber: string
}, paperSize: string): string {
  const W = width(paperSize)
  const r: string[] = []
  r.push(sep('=', W))
  r.push(center(data.orgName, W))
  if (data.orgAddress) r.push(center(data.orgAddress, W))
  if (data.orgPhone) r.push(center(data.orgPhone, W))
  r.push(sep('=', W))
  r.push(lr('STIR: ' + (data.orgStir || '—'), '', W))
  r.push(lr(data.dateStr, data.timeStr, W))
  r.push(lr(tr('Заказ: #', 'Buyurtma: #', 'Order: #') + data.orderNum, '', W))
  r.push(lr(tr('Стол:', 'Stol:', 'Table:') + ' ' + data.tableLabel, tr('Гости:', 'Mehmonlar:', 'Guests:') + ' ' + data.guestCount, W))
  r.push(lr(data.roleLabel + ': ' + data.staffName, '', W))
  r.push(lr(tr('Смена:', 'Smena:', 'Shift:'), data.shiftNumber, W))
  r.push(sep('-', W))

  for (const item of data.items) {
    const line = item.name + '  ' + item.quantity + ' x ' + item.unitPrice.toLocaleString()
    r.push(line.length > W ? line.slice(0, W - 1) + '…' : line)
    if (item.markCodes && item.markCodes.length > 0) {
      r.push(tr('Маркировка:', 'Markirovka:', 'Labeling:'))
      for (const c of item.markCodes) {
        r.push(c.length > W - 2 ? c.slice(0, W - 3) + '…' : c)
      }
    }
  }

  r.push(sep('-', W))
  r.push(lr(tr('Общая сумма', 'Umumiy summa', 'Total amount'), data.totalSum.toLocaleString() + ' ' + tr('сум', 'so\'m', 'sum'), W))
  r.push(lr(tr('Сервис', 'Xizmat', 'Service charge') + ' (' + data.servicePercent + '%)', data.serviceAmount.toLocaleString() + ' ' + tr('сум', 'so\'m', 'sum'), W))
  if (data.discountValue > 0) {
    r.push(lr(tr('Скидка', 'Chegirma', 'Discount'), '-' + data.discountValue.toLocaleString() + ' ' + tr('сум', 'so\'m', 'sum'), W))
  }
  r.push(lr('QQS (12%)', data.qqsAmount.toLocaleString() + ' ' + tr('сум', 'so\'m', 'sum'), W))
  r.push(sep('-', W))
  r.push(lr(tr('ИТОГО:', 'JAMI:', 'TOTAL:'), data.итого.toLocaleString() + ' ' + tr('сум', 'so\'m', 'sum'), W))

  if (data.splitAmounts) {
    r.push(sep('-', W))
    if (data.splitAmounts.cash > 0) r.push(lr(tr('Наличной', 'Naqd', 'Cash'), data.splitAmounts.cash.toLocaleString() + ' ' + tr('сум', 'so\'m', 'sum'), W))
    if (data.splitAmounts.card > 0) r.push(lr(tr('Карта', 'Karta', 'Card'), data.splitAmounts.card.toLocaleString() + ' ' + tr('сум', 'so\'m', 'sum'), W))
    if (data.splitAmounts.click > 0) r.push(lr(tr('Другое', 'Boshqa', 'Other'), data.splitAmounts.click.toLocaleString() + ' ' + tr('сум', 'so\'m', 'sum'), W))
  } else {
    r.push(lr(tr('Выбор оплаты', 'To\'lov usuli', 'Select payment'), data.selectedMethod, W))
  }

  r.push(sep('-', W))
  if (data.qrCodeUrl) r.push(center('QR: ' + data.qrCodeUrl, W))
  if (data.fmTerminalId || data.fiscalSign) r.push(sep('-', W))
  if (data.fmTerminalId) r.push(lr(tr('Терминал ID:', 'Terminal ID:', 'Terminal ID:'), data.fmTerminalId, W))
  if (data.fiscalSign) r.push(lr(tr('Фиск.признак:', 'Fisk. belgi:', 'Fiscal code:'), data.fiscalSign, W))
  r.push(sep('=', W))
  r.push(center(tr('Спасибо! Ждём вас снова.', 'Rahmat! Yana kutib qolamiz.', 'Thank you! We look forward to seeing you again.'), W))
  r.push(sep('=', W))
  r.push('', '')
  return r.join('\r\n')
}
