const W58 = 32
const W80 = 48

import { tr } from '../i18n'

function width(paperSize: string): number {
  return paperSize === '80' ? W80 : W58
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

export function getConnectedPrinters(): Promise<string[]> {
  return fetch('/api/printers')
    .then(r => r.json())
    .then(d => d.printers || [])
    .catch(() => [])
}

export async function printText(printerName: string, content: string): Promise<void> {
  const res = await fetch('/api/print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printerName, content }),
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
  items: Array<{ name: string; quantity: number; comment?: string }>
  orderComment?: string
  orderTags?: string[]
  orderModifiers?: string[]
}, paperSize: string): string {
  const W = width(paperSize)
  const r: string[] = []
  r.push(sep('=', W))
  r.push(center(data.kitchenName, W))
  r.push(sep('=', W))
  r.push(lr(tr('Стол:', 'Stol:'), data.tableLabel, W))
  r.push(lr(tr('Гости:', 'Mehmonlar:'), String(data.guestCount), W))
  r.push(lr(tr('Время:', 'Vaqt:'), data.dateStr + ' ' + data.timeStr, W))
  r.push(sep('-', W))
  const note = [...(data.orderTags || []), ...(data.orderComment ? [data.orderComment] : [])].join(' · ')
  if (note) r.push(note.length > W ? note.slice(0, W - 1) + '…' : note)
  if (data.orderModifiers && data.orderModifiers.length > 0) {
    const mods = tr('Модификаторы:', 'Modifikatorlar:') + ' ' + data.orderModifiers.join(', ')
    r.push(mods.length > W ? mods.slice(0, W - 1) + '…' : mods)
  }
  for (const item of data.items) {
    const line = item.name + '  x' + item.quantity
    r.push(line.length > W ? line.slice(0, W - 1) + '…' : line)
    if (item.comment) r.push('> ' + item.comment.slice(0, W - 3))
  }
  r.push(sep('-', W))
  r.push(center(tr('Заказ отправляется', 'Buyurtma yuborilmoqda'), W))
  r.push(center(tr('на кухню', 'oshxonaga'), W))
  r.push(sep('=', W))
  r.push('', '')
  return r.join('\r\n')
}

export function formatAvansReceipt(data: {
  orgName: string; orgAddress: string; orgPhone: string; orgStir: string
  dateStr: string; timeStr: string; orderNum: number
  tableLabel: string; guestCount: number; staffName: string; roleLabel: string
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number; mxik: string }>
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
  r.push(lr(tr('Заказ: #', 'Buyurtma: #') + data.orderNum, '', W))
  r.push(lr(tr('Стол:', 'Stol:') + ' ' + data.tableLabel, tr('Гости:', 'Mehmonlar:') + ' ' + data.guestCount, W))
  r.push(lr(data.roleLabel + ': ' + data.staffName, '', W))
  r.push(lr(tr('Смена:', 'Smena:'), data.shiftNumber, W))
  r.push(sep('-', W))

  for (const item of data.items) {
    const line = item.name + '  ' + item.quantity + ' x ' + item.unitPrice.toLocaleString()
    r.push(line.length > W ? line.slice(0, W - 1) + '…' : line)
    r.push(lr('', 'QQS 12%: ' + Math.round(item.total * 12 / 100).toLocaleString(), W))
  }

  r.push(sep('-', W))
  r.push(lr(tr('ИТОГО:', 'JAMI:'), data.total.toLocaleString() + ' ' + tr('сум', 'so\'m'), W))
  r.push(lr('QQS 12%:', data.vat.toLocaleString(), W))
  r.push(sep('-', W))
  r.push(lr(tr('Терминал ID:', 'Terminal ID:'), data.fmTerminalId || 'TERM-001', W))
  r.push(sep('=', W))
  r.push(center(tr('Спасибо! Ждём вас снова.', 'Rahmat! Yana kutib qolamiz.'), W))
  r.push(sep('=', W))
  r.push('', '')
  return r.join('\r\n')
}

export function formatFiscalReceipt(data: {
  orgName: string; orgAddress: string; orgPhone: string; orgStir: string
  dateStr: string; timeStr: string; orderNum: number
  tableLabel: string; guestCount: number; staffName: string; roleLabel: string
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number; mxik: string }>
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
  r.push(lr(tr('Заказ: #', 'Buyurtma: #') + data.orderNum, '', W))
  r.push(lr(tr('Стол:', 'Stol:') + ' ' + data.tableLabel, tr('Гости:', 'Mehmonlar:') + ' ' + data.guestCount, W))
  r.push(lr(data.roleLabel + ': ' + data.staffName, '', W))
  r.push(lr(tr('Смена:', 'Smena:'), data.shiftNumber, W))
  r.push(sep('-', W))

  for (const item of data.items) {
    const line = item.name + '  ' + item.quantity + ' x ' + item.unitPrice.toLocaleString()
    r.push(line.length > W ? line.slice(0, W - 1) + '…' : line)
  }

  r.push(sep('-', W))
  r.push(lr(tr('Общая сумма', 'Umumiy summa'), data.totalSum.toLocaleString() + ' ' + tr('сум', 'so\'m'), W))
  r.push(lr(tr('Сервис', 'Xizmat') + ' (' + data.servicePercent + '%)', data.serviceAmount.toLocaleString() + ' ' + tr('сум', 'so\'m'), W))
  if (data.discountValue > 0) {
    r.push(lr(tr('Скидка', 'Chegirma'), '-' + data.discountValue.toLocaleString() + ' ' + tr('сум', 'so\'m'), W))
  }
  r.push(lr('QQS (12%)', data.qqsAmount.toLocaleString() + ' ' + tr('сум', 'so\'m'), W))
  r.push(sep('-', W))
  r.push(lr(tr('ИТОГО:', 'JAMI:'), data.итого.toLocaleString() + ' ' + tr('сум', 'so\'m'), W))

  if (data.splitAmounts) {
    r.push(sep('-', W))
    if (data.splitAmounts.cash > 0) r.push(lr(tr('Наличной', 'Naqd'), data.splitAmounts.cash.toLocaleString() + ' ' + tr('сум', 'so\'m'), W))
    if (data.splitAmounts.card > 0) r.push(lr(tr('Карта', 'Karta'), data.splitAmounts.card.toLocaleString() + ' ' + tr('сум', 'so\'m'), W))
    if (data.splitAmounts.click > 0) r.push(lr(tr('Другое', 'Boshqa'), data.splitAmounts.click.toLocaleString() + ' ' + tr('сум', 'so\'m'), W))
  } else {
    r.push(lr(tr('Выбор оплаты', 'To\'lov usuli'), data.selectedMethod, W))
  }

  r.push(sep('-', W))
  if (data.qrCodeUrl) r.push(center('QR: ' + data.qrCodeUrl, W))
  r.push(sep('-', W))
  r.push(lr(tr('Терминал ID:', 'Terminal ID:'), data.fmTerminalId || 'TERM-001', W))
  if (data.fiscalSign) r.push(lr(tr('Фиск.признак:', 'Fisk. belgi:'), data.fiscalSign, W))
  r.push(sep('=', W))
  r.push(center(tr('Спасибо! Ждём вас снова.', 'Rahmat! Yana kutib qolamiz.'), W))
  r.push(sep('=', W))
  r.push('', '')
  return r.join('\r\n')
}
