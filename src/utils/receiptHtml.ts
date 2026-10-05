import { printReceiptNode } from './receiptPrint'
import { getReceiptLogo } from './receiptLogo'
import { tr } from '../i18n'

export type PaperSize = '58' | '80'

interface ItemData {
  name: string; quantity: number; unitPrice: number; total: number; mxik: string; markCodes?: string[]
}

interface BaseReceiptData {
  orgName: string; orgAddress: string; orgPhone: string; orgStir: string
  dateStr: string; timeStr: string; orderNum: number
  tableLabel: string; guestCount: number; staffName: string; roleLabel: string
  items: ItemData[]; fmTerminalId: string; shiftNumber: string
}

interface AvansReceiptData extends BaseReceiptData {
  total: number; vat: number
}

interface FiscalReceiptData extends BaseReceiptData {
  totalSum: number; serviceAmount: number; servicePercent: number
  discountValue: number; qqsAmount: number; итого: number
  selectedMethod: string; splitAmounts?: { cash: number; card: number; click: number } | null
  fiscalSign?: string; qrCodeUrl?: string; licenseNumber?: string
}

function escHtml(s: string | number): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const TAX_TYPE = 'QQS 12%'

function markingHtml(item: ItemData): string {
  if (!item.markCodes || item.markCodes.length === 0) return ''
  return `<div class="ac-item-marking">${tr('Маркировка', 'Markirovka', 'Labeling')}:</div>` +
    item.markCodes.map(c => `<div class="ac-item-mark-code">${escHtml(c)}</div>`).join('')
}

export function buildAvansReceiptHtml(data: AvansReceiptData): string {
  const rows = data.items.map(item => `
    <div class="ac-item">
      <div class="ac-item-line">
        <span class="ac-item-name">${escHtml(item.name)}</span>
        <span class="ac-item-right">${item.quantity} x ${item.unitPrice.toLocaleString()} ${tr('сум', 'so\'m', 'sum')}</span>
      </div>
      <div class="ac-item-tax">${TAX_TYPE}: ${Math.round(item.total * 12 / 100).toLocaleString()}</div>
      <div class="ac-item-mxik">MXIK: ${escHtml(item.mxik || '09901001001000000')}</div>
      ${markingHtml(item)}
    </div>
  `).join('')

  return `
    <div class="ac-logo">
      <img src="${getReceiptLogo()}" alt="Logo" class="ac-logo-img" />
    </div>
    <div class="ac-company">${escHtml(data.orgName)}</div>
    <div class="ac-address">${escHtml(data.orgAddress)}</div>
    <div class="ac-phone">${escHtml(data.orgPhone)}</div>
    <div class="ac-divider dashed"></div>
    <div class="ac-meta">
      <div class="ac-meta-row"><span class="ac-label">STIR</span><span class="ac-value">${escHtml(data.orgStir || '—')}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${tr('Дата', 'Sana', 'Date')}</span><span class="ac-value">${escHtml(data.dateStr)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${tr('Время', 'Vaqt', 'Time')}</span><span class="ac-value">${escHtml(data.timeStr)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${tr('Заказ', 'Buyurtma', 'Order')}</span><span class="ac-value">#${data.orderNum}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${tr('Стол', 'Stol', 'Table')}</span><span class="ac-value">${escHtml(data.tableLabel)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${tr('Гости', 'Mehmonlar', 'Guests')}</span><span class="ac-value">${data.guestCount}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${escHtml(data.roleLabel)}</span><span class="ac-value">${escHtml(data.staffName)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${tr('Смена', 'Smena', 'Shift')}</span><span class="ac-value">${escHtml(data.shiftNumber)}</span></div>
    </div>
    <div class="ac-divider solid"></div>
    <div class="ac-items">${rows}</div>
    <div class="ac-divider solid"></div>
    <div class="ac-total">
      <span>${tr('ИТОГО:', 'JAMI:', 'TOTAL:')}</span>
      <span class="ac-total-value">${data.total.toLocaleString()} ${tr('сум', 'so\'m', 'sum')}</span>
    </div>
    <div class="ac-vat">${TAX_TYPE}: ${data.vat.toLocaleString()}</div>
    <div class="ac-divider dashed"></div>
    ${data.fmTerminalId ? `<div class="ac-fiscal">
      <div class="ac-fiscal-row"><span>${tr('Терминал ID', 'Terminal ID', 'Terminal ID')}:</span><span>${escHtml(data.fmTerminalId)}</span></div>
    </div>` : ''}
    <div class="ac-footer">${tr('Спасибо! Ждём вас снова.', 'Rahmat! Yana kutib qolamiz.', 'Thank you! We look forward to seeing you again.')}</div>
  `
}

export function buildFiscalReceiptHtml(data: FiscalReceiptData, qrImgSrc: string): string {
  const rows = data.items.map(item => `
    <div class="ac-item">
      <div class="ac-item-line">
        <span class="ac-item-name">${escHtml(item.name)}</span>
        <span class="ac-item-right">${item.quantity} x ${item.unitPrice.toLocaleString()} ${tr('сум', 'so\'m', 'sum')}</span>
      </div>
      <div class="ac-item-tax">${TAX_TYPE}: ${Math.round(item.total * 12 / 100).toLocaleString()}</div>
      <div class="ac-item-mxik">MXIK: ${escHtml(item.mxik || '09901001001000000')}</div>
      ${markingHtml(item)}
    </div>
  `).join('')

  const paymentHtml = data.splitAmounts ? `
    <div style="display:flex;flex-direction:column;gap:3px;padding:4px 0;font-size:12px;font-weight:700;color:#000">
      <span style="font-weight:700;color:#000;margin-bottom:2px">${tr('Разделение счета', 'Hisobni bo\'lish', 'Split bill')}:</span>
      ${data.splitAmounts.cash > 0 ? `<div style="display:flex;justify-content:space-between"><span>${tr('Наличной', 'Naqd', 'Cash')}</span><span style="font-weight:700">${data.splitAmounts.cash.toLocaleString()} ${tr('сум', 'so\'m', 'sum')}</span></div>` : ''}
      ${data.splitAmounts.card > 0 ? `<div style="display:flex;justify-content:space-between"><span>${tr('Карта', 'Karta', 'Card')}</span><span style="font-weight:700">${data.splitAmounts.card.toLocaleString()} ${tr('сум', 'so\'m', 'sum')}</span></div>` : ''}
      ${data.splitAmounts.click > 0 ? `<div style="display:flex;justify-content:space-between"><span>${tr('Другое', 'Boshqa', 'Other')}</span><span style="font-weight:700">${data.splitAmounts.click.toLocaleString()} ${tr('сум', 'so\'m', 'sum')}</span></div>` : ''}
    </div>
  ` : `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:12px">
      <span style="font-weight:700;color:#000">${tr('Выбор оплаты', 'To\'lov usuli', 'Select payment')}:</span>
      <span style="font-weight:700;color:#000">${escHtml(data.selectedMethod)}</span>
    </div>
  `

  const discountDisplay = data.discountValue > 0
    ? `−${data.discountValue.toLocaleString()}`
    : '0'

  const qrHtml = qrImgSrc ? `
    <div class="ac-divider dashed"></div>
    <div style="text-align:center;padding:6px 0">
      <img src="${qrImgSrc}" alt="QR" style="width:150px;height:150px" />
    </div>
  ` : ''

  const fiscalHtml = data.fmTerminalId || data.fiscalSign || data.licenseNumber ? `
    <div class="ac-divider dashed"></div>
    <div class="ac-fiscal">
      ${data.fmTerminalId ? `<div class="ac-fiscal-row"><span>${tr('Терминал ID', 'Terminal ID', 'Terminal ID')}:</span><span>${escHtml(data.fmTerminalId)}</span></div>` : ''}
      ${data.fiscalSign ? `<div class="ac-fiscal-row"><span>${tr('Фискальный признак', 'Fiskal belgi', 'Fiscal code')}:</span><span>${escHtml(data.fiscalSign)}</span></div>` : ''}
      ${data.licenseNumber ? `<div class="ac-fiscal-row"><span>${tr('Номер лицензии', 'Litsenziya raqami', 'License number')}:</span><span>${escHtml(data.licenseNumber)}</span></div>` : ''}
    </div>
  ` : ''

  return `
    <div class="ac-logo">
      <img src="${getReceiptLogo()}" alt="Logo" class="ac-logo-img" />
    </div>
    <div class="ac-company">${escHtml(data.orgName)}</div>
    <div class="ac-address">${escHtml(data.orgAddress)}</div>
    <div class="ac-phone">${escHtml(data.orgPhone)}</div>
    <div class="ac-divider dashed"></div>
    <div class="ac-meta">
      <div class="ac-meta-row"><span class="ac-label">STIR</span><span class="ac-value">${escHtml(data.orgStir || '—')}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${tr('Дата', 'Sana', 'Date')}</span><span class="ac-value">${escHtml(data.dateStr)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${tr('Время', 'Vaqt', 'Time')}</span><span class="ac-value">${escHtml(data.timeStr)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${tr('Заказ', 'Buyurtma', 'Order')}</span><span class="ac-value">#${data.orderNum}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${tr('Стол', 'Stol', 'Table')}</span><span class="ac-value">${escHtml(data.tableLabel)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${tr('Гости', 'Mehmonlar', 'Guests')}</span><span class="ac-value">${data.guestCount}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${escHtml(data.roleLabel)}</span><span class="ac-value">${escHtml(data.staffName)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${tr('Смена', 'Smena', 'Shift')}</span><span class="ac-value">${escHtml(data.shiftNumber)}</span></div>
    </div>
    <div class="ac-divider solid"></div>
    <div class="ac-items">${rows}</div>
    <div class="ac-divider solid"></div>
    <div style="display:flex;flex-direction:column;gap:6px;padding:4px 0">
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span style="font-weight:700;color:#000">${tr('Общая сумма', 'Umumiy summa', 'Total amount')}</span>
        <span style="font-weight:700;color:#000">${data.totalSum.toLocaleString()} ${tr('сум', 'so\'m', 'sum')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span style="font-weight:700;color:#000">${tr('Сервис', 'Xizmat', 'Service charge')} (${data.servicePercent}%)</span>
        <span style="font-weight:700;color:#000">${data.serviceAmount.toLocaleString()} ${tr('сум', 'so\'m', 'sum')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span style="font-weight:700;color:#000">${tr('Скидка', 'Chegirma', 'Discount')}</span>
        <span style="font-weight:700;color:#000">${discountDisplay} ${tr('сум', 'so\'m', 'sum')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span style="font-weight:700;color:#000">QQS (12%)</span>
        <span style="font-weight:700;color:#000">${data.qqsAmount.toLocaleString()} ${tr('сум', 'so\'m', 'sum')}</span>
      </div>
    </div>
    <div class="ac-divider solid"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
      <span style="font-size:14px;font-weight:700;color:#000">${tr('ИТОГО:', 'JAMI:', 'TOTAL:')}</span>
      <span style="font-size:17px;font-weight:700;color:#000">${data.итого.toLocaleString()} ${tr('сум', 'so\'m', 'sum')}</span>
    </div>
    <div class="ac-vat">${TAX_TYPE}: ${data.qqsAmount.toLocaleString()}</div>
    <div class="ac-divider dashed"></div>
    ${paymentHtml}
    ${qrHtml}
    ${fiscalHtml}
    <div class="ac-footer">${tr('Спасибо! Ждём вас снова.', 'Rahmat! Yana kutib qolamiz.', 'Thank you! We look forward to seeing you again.')}</div>
  `
}

export interface KitchenReceiptItem {
  name: string
  quantity: number
  comment?: string
  sub?: boolean
}

export interface KitchenReceiptData {
  kitchenName: string
  tableLabel: string
  guestCount: number
  dateStr: string
  timeStr: string
  items: KitchenReceiptItem[]
  orderComment?: string
  orderTags?: string[]
  orderModifiers?: string[]
}

export function buildKitchenReceiptHtml(data: KitchenReceiptData): string {
  const noteParts = [...(data.orderTags || []), ...(data.orderComment ? [data.orderComment] : [])]
  const noteHtml = noteParts.length > 0
    ? `<div class="kc-note">${escHtml(noteParts.join(' · '))}</div>`
    : ''
  const modsHtml = data.orderModifiers && data.orderModifiers.length > 0
    ? `<div class="kc-mods">${tr('Модификаторы', 'Modifikatorlar', 'Modifiers')}: ${escHtml(data.orderModifiers.join(', '))}</div>`
    : ''
  const itemsHtml = data.items.map(item => `
    <div class="kc-item${item.sub ? ' kc-sub' : ''}">
      <span class="kc-item-name">${item.sub ? '<span class="kc-arrow">→</span> ' : ''}${escHtml(item.name)}</span>
      <span class="kc-item-qty">× ${item.quantity}</span>
    </div>
    ${item.comment ? `<div class="kc-item-comment"><span class="kc-arrow">→</span> ${escHtml(item.comment)}</div>` : ''}
  `).join('')

  return `
    <div class="kc-receipt">
      <div class="kc-head">${escHtml(data.kitchenName)}</div>
      <div class="kc-divider"></div>
      <div class="kc-meta-row"><span>${tr('Стол', 'Stol', 'Table')}</span><span>${escHtml(data.tableLabel)}</span></div>
      <div class="kc-meta-row"><span>${tr('Гости', 'Mehmonlar', 'Guests')}</span><span>${data.guestCount}</span></div>
      <div class="kc-meta-row"><span>${tr('Время', 'Vaqt', 'Time')}</span><span>${escHtml(data.dateStr)} ${escHtml(data.timeStr)}</span></div>
      <div class="kc-divider"></div>
      ${noteHtml}
      ${modsHtml}
      <div class="kc-items">${itemsHtml}</div>
      <div class="kc-divider"></div>
      <div class="kc-foot">${tr('Заказ отправляется на кухню', 'Buyurtma oshxonaga yuborilmoqda', 'Order is being sent to kitchen')}</div>
    </div>
  `
}

export async function printReceiptHtml(printerName: string, html: string, paperSize: PaperSize, logical?: 'receipt' | 'kitchen' | 'waiter'): Promise<void> {
  const wrapper = document.createElement('div')
  wrapper.style.position = 'absolute'
  wrapper.style.top = '0'
  wrapper.style.left = '-9999px'
  wrapper.style.width = '0'
  wrapper.style.height = '0'
  wrapper.style.overflow = 'hidden'
  wrapper.style.zIndex = '-1'
  document.body.appendChild(wrapper)

  const div = document.createElement('div')
  div.className = `ac-receipt paper-${paperSize}`
  div.innerHTML = html
  wrapper.appendChild(div)

  try {
    await printReceiptNode(printerName, div, paperSize, logical)
  } catch (e) {
    console.error('Image print failed:', e)
    throw e
  } finally {
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper)
  }
}
