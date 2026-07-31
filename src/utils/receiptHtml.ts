import { printReceiptNode } from './receiptPrint'

export type PaperSize = '58' | '80'

interface ItemData {
  name: string; quantity: number; unitPrice: number; total: number; mxik: string
}

interface BaseReceiptData {
  orgName: string; orgAddress: string; orgPhone: string; orgStir: string
  dateStr: string; timeStr: string; orderNum: number
  tableLabel: string; guestCount: number; staffName: string; roleLabel: string
  items: ItemData[]; fmTerminalId: string
}

interface AvansReceiptData extends BaseReceiptData {
  total: number; vat: number
}

interface FiscalReceiptData extends BaseReceiptData {
  totalSum: number; serviceAmount: number; servicePercent: number
  discountValue: number; qqsAmount: number; итого: number
  selectedMethod: string; splitAmounts?: { cash: number; card: number; click: number } | null
  fiscalSign?: string; qrCodeUrl?: string
}

function escHtml(s: string | number): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const TAX_TYPE = 'QQS 12%'

export function buildAvansReceiptHtml(data: AvansReceiptData): string {
  const rows = data.items.map(item => `
    <div class="ac-item">
      <div class="ac-item-line">
        <span class="ac-item-name">${escHtml(item.name)}</span>
        <span class="ac-item-right">${item.quantity} x ${item.unitPrice.toLocaleString()} сум</span>
      </div>
      <div class="ac-item-tax">${TAX_TYPE}: ${Math.round(item.total * 12 / 100).toLocaleString()}</div>
      <div class="ac-item-mxik">MXIK: ${escHtml(item.mxik || '09901001001000000')}</div>
    </div>
  `).join('')

  return `
    <div class="ac-logo">
      <img src="/unnamed.png" alt="Logo" class="ac-logo-img" />
    </div>
    <div class="ac-company">${escHtml(data.orgName)}</div>
    <div class="ac-address">${escHtml(data.orgAddress)}</div>
    <div class="ac-phone">${escHtml(data.orgPhone)}</div>
    <div class="ac-divider dashed"></div>
    <div class="ac-meta">
      <div class="ac-meta-row"><span class="ac-label">STIR</span><span class="ac-value">${escHtml(data.orgStir || '—')}</span></div>
      <div class="ac-meta-row"><span class="ac-label">Дата</span><span class="ac-value">${escHtml(data.dateStr)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">Время</span><span class="ac-value">${escHtml(data.timeStr)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">Заказ</span><span class="ac-value">#${data.orderNum}</span></div>
      <div class="ac-meta-row"><span class="ac-label">Стол</span><span class="ac-value">${escHtml(data.tableLabel)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">Гости</span><span class="ac-value">${data.guestCount}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${escHtml(data.roleLabel)}</span><span class="ac-value">${escHtml(data.staffName)}</span></div>
    </div>
    <div class="ac-divider solid"></div>
    <div class="ac-items">${rows}</div>
    <div class="ac-divider solid"></div>
    <div class="ac-total">
      <span>ИТОГО:</span>
      <span class="ac-total-value">${data.total.toLocaleString()} сум</span>
    </div>
    <div class="ac-vat">${TAX_TYPE}: ${data.vat.toLocaleString()}</div>
    <div class="ac-divider dashed"></div>
    <div class="ac-fiscal">
      <div class="ac-fiscal-row"><span>Терминал ID:</span><span>${escHtml(data.fmTerminalId || 'TERM-001')}</span></div>
      <div class="ac-fiscal-row"><span>Смена:</span><span>002</span></div>
    </div>
    <div class="ac-footer">Спасибо! Ждём вас снова.</div>
  `
}

export function buildFiscalReceiptHtml(data: FiscalReceiptData, qrImgSrc: string): string {
  const rows = data.items.map(item => `
    <div class="ac-item">
      <div class="ac-item-line">
        <span class="ac-item-name">${escHtml(item.name)}</span>
        <span class="ac-item-right">${item.quantity} x ${item.unitPrice.toLocaleString()} сум</span>
      </div>
      <div class="ac-item-tax">${TAX_TYPE}: ${Math.round(item.total * 12 / 100).toLocaleString()}</div>
      <div class="ac-item-mxik">MXIK: ${escHtml(item.mxik || '09901001001000000')}</div>
    </div>
  `).join('')

  const paymentHtml = data.splitAmounts ? `
    <div style="display:flex;flex-direction:column;gap:3px;padding:4px 0;font-size:12px;font-weight:700;color:#000">
      <span style="font-weight:700;color:#000;margin-bottom:2px">Разделение счета:</span>
      ${data.splitAmounts.cash > 0 ? `<div style="display:flex;justify-content:space-between"><span>Наличной</span><span style="font-weight:700">${data.splitAmounts.cash.toLocaleString()} сум</span></div>` : ''}
      ${data.splitAmounts.card > 0 ? `<div style="display:flex;justify-content:space-between"><span>Карта</span><span style="font-weight:700">${data.splitAmounts.card.toLocaleString()} сум</span></div>` : ''}
      ${data.splitAmounts.click > 0 ? `<div style="display:flex;justify-content:space-between"><span>Click/Payme</span><span style="font-weight:700">${data.splitAmounts.click.toLocaleString()} сум</span></div>` : ''}
    </div>
  ` : `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:12px">
      <span style="font-weight:700;color:#000">Выбор оплаты:</span>
      <span style="font-weight:700;color:#000">${escHtml(data.selectedMethod)}</span>
    </div>
  `

  const discountDisplay = data.discountValue > 0
    ? `−${data.discountValue.toLocaleString()}`
    : '0'

  return `
    <div class="ac-logo">
      <img src="/unnamed.png" alt="Logo" class="ac-logo-img" />
    </div>
    <div class="ac-company">${escHtml(data.orgName)}</div>
    <div class="ac-address">${escHtml(data.orgAddress)}</div>
    <div class="ac-phone">${escHtml(data.orgPhone)}</div>
    <div class="ac-divider dashed"></div>
    <div class="ac-meta">
      <div class="ac-meta-row"><span class="ac-label">STIR</span><span class="ac-value">${escHtml(data.orgStir || '—')}</span></div>
      <div class="ac-meta-row"><span class="ac-label">Дата</span><span class="ac-value">${escHtml(data.dateStr)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">Время</span><span class="ac-value">${escHtml(data.timeStr)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">Заказ</span><span class="ac-value">#${data.orderNum}</span></div>
      <div class="ac-meta-row"><span class="ac-label">Стол</span><span class="ac-value">${escHtml(data.tableLabel)}</span></div>
      <div class="ac-meta-row"><span class="ac-label">Гости</span><span class="ac-value">${data.guestCount}</span></div>
      <div class="ac-meta-row"><span class="ac-label">${escHtml(data.roleLabel)}</span><span class="ac-value">${escHtml(data.staffName)}</span></div>
    </div>
    <div class="ac-divider solid"></div>
    <div class="ac-items">${rows}</div>
    <div class="ac-divider solid"></div>
    <div style="display:flex;flex-direction:column;gap:6px;padding:4px 0">
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span style="font-weight:700;color:#000">Общая сумма</span>
        <span style="font-weight:700;color:#000">${data.totalSum.toLocaleString()} сум</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span style="font-weight:700;color:#000">Сервис (${data.servicePercent}%)</span>
        <span style="font-weight:700;color:#000">${data.serviceAmount.toLocaleString()} сум</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span style="font-weight:700;color:#000">Скидка</span>
        <span style="font-weight:700;color:#000">${discountDisplay} сум</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span style="font-weight:700;color:#000">QQS (12%)</span>
        <span style="font-weight:700;color:#000">${data.qqsAmount.toLocaleString()} сум</span>
      </div>
    </div>
    <div class="ac-divider solid"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
      <span style="font-size:14px;font-weight:700;color:#000">ИТОГО:</span>
      <span style="font-size:17px;font-weight:700;color:#000">${data.итого.toLocaleString()} сум</span>
    </div>
    <div class="ac-vat">${TAX_TYPE}: ${data.qqsAmount.toLocaleString()}</div>
    <div class="ac-divider dashed"></div>
    ${paymentHtml}
    <div class="ac-divider dashed"></div>
    <div style="text-align:center;padding:6px 0">
      ${qrImgSrc ? `<img src="${qrImgSrc}" alt="QR" style="width:150px;height:150px" />` : '<img src="/QR.svg" alt="QR" style="width:150px;height:150px" />'}
    </div>
    <div class="ac-divider dashed"></div>
    <div class="ac-fiscal">
      <div class="ac-fiscal-row"><span>Терминал ID:</span><span>${escHtml(data.fmTerminalId || 'TERM-001')}</span></div>
      <div class="ac-fiscal-row"><span>Фискальный признак:</span><span>${escHtml(data.fiscalSign || '—')}</span></div>
      <div class="ac-fiscal-row"><span>Смена:</span><span>002</span></div>
    </div>
    <div class="ac-footer">Спасибо! Ждём вас снова.</div>
  `
}

export async function printReceiptHtml(printerName: string, html: string, paperSize: PaperSize): Promise<void> {
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
    await printReceiptNode(printerName, div, paperSize)
  } catch (e) {
    console.error('Image print failed:', e)
    throw e
  } finally {
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper)
  }
}
