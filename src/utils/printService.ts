const W58 = 32
const W80 = 48

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

export function formatAvansReceipt(data: {
  orgName: string; orgAddress: string; orgPhone: string; orgStir: string
  dateStr: string; timeStr: string; orderNum: number
  tableLabel: string; guestCount: number; staffName: string; roleLabel: string
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number; mxik: string }>
  total: number; vat: number; fmTerminalId: string
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
  r.push(lr('Заказ: #' + data.orderNum, '', W))
  r.push(lr('Стол: ' + data.tableLabel, 'Гости: ' + data.guestCount, W))
  r.push(lr(data.roleLabel + ': ' + data.staffName, '', W))
  r.push(sep('-', W))

  for (const item of data.items) {
    const line = item.name + '  ' + item.quantity + ' x ' + item.unitPrice.toLocaleString()
    r.push(line.length > W ? line.slice(0, W - 1) + '…' : line)
    r.push(lr('', 'QQS 12%: ' + Math.round(item.total * 12 / 100).toLocaleString(), W))
  }

  r.push(sep('-', W))
  r.push(lr('ИТОГО:', data.total.toLocaleString() + ' сум', W))
  r.push(lr('QQS 12%:', data.vat.toLocaleString(), W))
  r.push(sep('-', W))
  r.push(lr('Терминал ID:', data.fmTerminalId || 'TERM-001', W))
  r.push(lr('Смена:', '002', W))
  r.push(sep('=', W))
  r.push(center('Спасибо! Ждём вас снова.', W))
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
  fmTerminalId: string; fiscalSign?: string; qrCodeUrl?: string
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
  r.push(lr('Заказ: #' + data.orderNum, '', W))
  r.push(lr('Стол: ' + data.tableLabel, 'Гости: ' + data.guestCount, W))
  r.push(lr(data.roleLabel + ': ' + data.staffName, '', W))
  r.push(sep('-', W))

  for (const item of data.items) {
    const line = item.name + '  ' + item.quantity + ' x ' + item.unitPrice.toLocaleString()
    r.push(line.length > W ? line.slice(0, W - 1) + '…' : line)
  }

  r.push(sep('-', W))
  r.push(lr('Общая сумма', data.totalSum.toLocaleString() + ' сум', W))
  r.push(lr('Сервис (' + data.servicePercent + '%)', data.serviceAmount.toLocaleString() + ' сум', W))
  if (data.discountValue > 0) {
    r.push(lr('Скидка', '-' + data.discountValue.toLocaleString() + ' сум', W))
  }
  r.push(lr('QQS (12%)', data.qqsAmount.toLocaleString() + ' сум', W))
  r.push(sep('-', W))
  r.push(lr('ИТОГО:', data.итого.toLocaleString() + ' сум', W))

  if (data.splitAmounts) {
    r.push(sep('-', W))
    if (data.splitAmounts.cash > 0) r.push(lr('Наличной', data.splitAmounts.cash.toLocaleString() + ' сум', W))
    if (data.splitAmounts.card > 0) r.push(lr('Карта', data.splitAmounts.card.toLocaleString() + ' сум', W))
    if (data.splitAmounts.click > 0) r.push(lr('Click/Payme', data.splitAmounts.click.toLocaleString() + ' сум', W))
  } else {
    r.push(lr('Выбор оплаты', data.selectedMethod, W))
  }

  r.push(sep('-', W))
  if (data.qrCodeUrl) r.push(center('QR: ' + data.qrCodeUrl, W))
  r.push(sep('-', W))
  r.push(lr('Терминал ID:', data.fmTerminalId || 'TERM-001', W))
  if (data.fiscalSign) r.push(lr('Фиск.признак:', data.fiscalSign, W))
  r.push(lr('Смена:', '002', W))
  r.push(sep('=', W))
  r.push(center('Спасибо! Ждём вас снова.', W))
  r.push(sep('=', W))
  r.push('', '')
  return r.join('\r\n')
}
