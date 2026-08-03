import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import type { OrderItem } from '../data/types'
import { getCompanyTin, getCompanyName, getCompanyAddress, getCompanyPhone, fetchAndStoreCompanyData } from '../utils/companyInfo'
import { getReceiptLogo } from '../utils/receiptLogo'
import { formatFiscalReceipt, printText } from '../utils/printService'
import { printReceiptNode } from '../utils/receiptPrint'

const PAPER_KEY = 'pos_v2_paper_size'
const PRINTERS_KEY = 'pos_v2_printer_name'

type PaperSize = '58' | '80'

interface FiscalReceiptModalProps {
  orderItems: OrderItem[]
  tableLabel: string
  guestCount: number
  orderNum: number
  staffName: string
  userRole: string
  servicePercent: number
  serviceAmount: number
  discountValue: number
  qqsAmount: number
  итого: number
  totalSum: number
  selectedMethod: 'cash' | 'card' | 'click' | null
  splitAmounts?: { cash: number; card: number; click: number } | null
  fmTerminalId: string
  fiscalSign?: string
  qrCodeUrl?: string
  shiftNumber?: string
  onPrint: () => void
  onBack: () => void
}

const ROLE_LABELS: Record<string, string> = { waiter: 'Официант', cashier: 'Кассир', admin: 'Администратор' }

const TAX_TYPE = 'QQS 12%'

const methodLabel: Record<string, string> = {
  cash: 'Наличной',
  card: 'Карта',
  click: 'Click/Payme',
}

export default function FiscalReceiptModal({
  orderItems, tableLabel, guestCount, orderNum, staffName, userRole,
  servicePercent, serviceAmount, discountValue, qqsAmount, итого, totalSum, selectedMethod, splitAmounts,
  fmTerminalId, fiscalSign, qrCodeUrl, shiftNumber = '001',
  onPrint, onBack,
}: FiscalReceiptModalProps) {
  const [paperSize, setPaperSize] = useState<PaperSize>((localStorage.getItem(PAPER_KEY) as PaperSize) || '58')
  const [orgStir, setOrgStir] = useState(getCompanyTin)
  const [orgName, setOrgName] = useState(getCompanyName)
  const [orgAddress, setOrgAddress] = useState(getCompanyAddress)
  const [orgPhone, setOrgPhone] = useState(getCompanyPhone)
  const [qrImgSrc, setQrImgSrc] = useState('')
  const [printing, setPrinting] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)

  // Generate the QR code locally instead of loading it from an external
  // service: this keeps it crisp, works offline, and (crucially) avoids
  // tainting the canvas we use to render the receipt image for printing.
  useEffect(() => {
    let cancelled = false
    const payload = qrCodeUrl && qrCodeUrl.trim() ? qrCodeUrl : ''
    if (!payload) { setQrImgSrc(''); return }
    QRCode.toDataURL(payload, { width: 480, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => { if (!cancelled) setQrImgSrc(url) })
      .catch(() => { if (!cancelled) setQrImgSrc('') })
    return () => { cancelled = true }
  }, [qrCodeUrl])

  useEffect(() => {
    ;(async () => {
      try {
        const info = await fetchAndStoreCompanyData()
        if (info) {
          if (info.stir) setOrgStir(info.stir)
          if (info.name) setOrgName(info.name)
          if (info.address) setOrgAddress(info.address)
          if (info.phone) setOrgPhone(info.phone)
        }
      } catch {}
    })()
  }, [])

  const now = new Date()
  const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const vat = qqsAmount

  return (
    <div className="modal-overlay" onClick={onBack}>
      <div className="avans-check-modal" onClick={e => e.stopPropagation()}>
        <div className="kc-size-selector">
          <span className={`kc-size-opt${paperSize === '58' ? ' active' : ''}`} onClick={() => setPaperSize('58')}>58 мм</span>
          <span className={`kc-size-opt${paperSize === '80' ? ' active' : ''}`} onClick={() => setPaperSize('80')}>80 мм</span>
        </div>

        <div className={`ac-receipt paper-${paperSize}`} ref={receiptRef}>
          <div className="ac-logo">
            <img src={getReceiptLogo()} alt="Logo" className="ac-logo-img" />
          </div>
          <div className="ac-company">{orgName}</div>
          <div className="ac-address">{orgAddress}</div>
          <div className="ac-phone">{orgPhone}</div>

          <div className="ac-divider dashed" />

          <div className="ac-meta">
            <div className="ac-meta-row"><span className="ac-label">STIR</span><span className="ac-value">{orgStir || '—'}</span></div>
            <div className="ac-meta-row"><span className="ac-label">Дата</span><span className="ac-value">{dateStr}</span></div>
            <div className="ac-meta-row"><span className="ac-label">Время</span><span className="ac-value">{timeStr}</span></div>
            <div className="ac-meta-row"><span className="ac-label">Заказ</span><span className="ac-value">#{orderNum}</span></div>
            <div className="ac-meta-row"><span className="ac-label">Стол</span><span className="ac-value">{tableLabel}</span></div>
            <div className="ac-meta-row"><span className="ac-label">Гости</span><span className="ac-value">{guestCount}</span></div>
            <div className="ac-meta-row"><span className="ac-label">{ROLE_LABELS[userRole] || userRole}</span><span className="ac-value">{staffName}</span></div>
            <div className="ac-meta-row"><span className="ac-label">Смена</span><span className="ac-value">{shiftNumber}</span></div>
          </div>

          <div className="ac-divider solid" />

          <div className="ac-items">
            {orderItems.map(item => (
              <div key={item.id} className="ac-item">
                <div className="ac-item-line">
                  <span className="ac-item-name">{item.menuItem.name}</span>
                  <span className="ac-item-right">{item.quantity} x {item.unitPrice.toLocaleString()} сум</span>
                </div>
                <div className="ac-item-tax">{TAX_TYPE}: {Math.round(item.total * 12 / 100).toLocaleString()}</div>
                <div className="ac-item-mxik">MXIK: {item.menuItem.mxik || '09901001001000000'}</div>
              </div>
            ))}
          </div>

          <div className="ac-divider solid" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: '#000' }}>Общая сумма</span>
              <span style={{ fontWeight: 700, color: '#000' }}>{totalSum.toLocaleString()} сум</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: '#000' }}>Сервис ({servicePercent}%)</span>
              <span style={{ fontWeight: 700, color: '#000' }}>{serviceAmount.toLocaleString()} сум</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: '#000' }}>Скидка</span>
              <span style={{ fontWeight: 700, color: discountValue > 0 ? '#ef4444' : '#000' }}>{discountValue > 0 ? `−${discountValue.toLocaleString()}` : '0'} сум</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: '#000' }}>QQS (12%)</span>
              <span style={{ fontWeight: 700, color: '#000' }}>{qqsAmount.toLocaleString()} сум</span>
            </div>
          </div>

          <div className="ac-divider solid" />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#000' }}>ИТОГО:</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#000' }}>{итого.toLocaleString()} сум</span>
          </div>
          <div className="ac-vat">{TAX_TYPE}: {vat.toLocaleString()}</div>

          <div className="ac-divider dashed" />

          {splitAmounts ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 0', fontSize: 11, fontWeight: 700, color: '#000' }}>
              <span style={{ fontWeight: 700, color: '#000', marginBottom: 2 }}>Разделение счета:</span>
              {splitAmounts.cash > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Наличной</span><span style={{ fontWeight: 700 }}>{splitAmounts.cash.toLocaleString()} сум</span></div>}
              {splitAmounts.card > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Карта</span><span style={{ fontWeight: 700 }}>{splitAmounts.card.toLocaleString()} сум</span></div>}
              {splitAmounts.click > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Click/Payme</span><span style={{ fontWeight: 700 }}>{splitAmounts.click.toLocaleString()} сум</span></div>}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
              <span style={{ fontWeight: 700, color: '#000' }}>Выбор оплаты:</span>
              <span style={{ fontWeight: 700, color: '#000' }}>{selectedMethod ? methodLabel[selectedMethod] : 'Не выбран'}</span>
            </div>
          )}

          <div className="ac-divider dashed" />

          <div style={{ textAlign: 'center', padding: '6px 0' }}>
            {qrImgSrc ? (
              <img src={qrImgSrc} alt="QR" style={{ width: 150, height: 150 }} />
            ) : (
              <img src="/QR.svg" alt="QR" style={{ width: 150, height: 150 }} />
            )}
          </div>

          <div className="ac-divider dashed" />

          <div className="ac-fiscal">
            <div className="ac-fiscal-row"><span>Терминал ID:</span><span>{fmTerminalId || 'TERM-001'}</span></div>
            <div className="ac-fiscal-row"><span>Фискальный признак:</span><span>{fiscalSign || '—'}</span></div>
          </div>

          <div className="ac-footer">Спасибо! Ждём вас снова.</div>
        </div>

        <div className="ac-actions">
          <button className="ac-print-btn" disabled={printing} onClick={async () => {
            const printer = localStorage.getItem(PRINTERS_KEY)
            let printed = false
            if (printer) {
              setPrinting(true)
              try {
                if (!receiptRef.current) throw new Error('Чек не готов к печати')
                await printReceiptNode(printer, receiptRef.current, paperSize)
                printed = true
              } catch (e) {
                // Fall back to the old plain-text print so a printer that
                // can't handle images (or a capture hiccup) still prints something.
                console.error('Печать изображением не удалась, пробуем текстом:', e)
                try {
                  const text = formatFiscalReceipt({
                    orgName: orgName || '—', orgAddress: orgAddress || '', orgPhone: orgPhone || '',
                    orgStir: orgStir || '—', dateStr, timeStr, orderNum,
                    tableLabel, guestCount, staffName,
                    roleLabel: ROLE_LABELS[userRole] || userRole,
                    items: orderItems.map(i => ({
                      name: i.menuItem.name, quantity: i.quantity,
                      unitPrice: i.unitPrice, total: i.total, mxik: i.menuItem.mxik || '',
                    })),
                    totalSum, serviceAmount, servicePercent,
                    discountValue, qqsAmount, итого,
                    selectedMethod: selectedMethod ? methodLabel[selectedMethod] : 'Не выбран',
                    splitAmounts, fmTerminalId, fiscalSign, qrCodeUrl, shiftNumber,
                  }, paperSize)
                  await printText(printer, text)
                  printed = true
                } catch (e2) {
                  alert('Ошибка печати: ' + (e2 instanceof Error ? e2.message : 'неизвестная ошибка'))
                }
              } finally {
                setPrinting(false)
              }
            }
            if (printed || !printer) onPrint()
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            {printing ? 'Печать…' : 'Печатать'}
          </button>
          <button className="ac-back-btn" onClick={onBack}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
