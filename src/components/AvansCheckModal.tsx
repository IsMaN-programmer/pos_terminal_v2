import { useState, useEffect, useRef } from 'react'
import type { OrderItem } from '../data/types'
import { fiscalDriveApi } from '../services/fiscalDriveApi'
import { getCompanyTin, getCompanyName, getCompanyAddress, getCompanyPhone, fetchAndStoreCompanyData } from '../utils/companyInfo'
import { getReceiptLogo } from '../utils/receiptLogo'
import { formatAvansReceipt, printText } from '../utils/printService'
import { printReceiptNode } from '../utils/receiptPrint'
import { useT, tr, locale } from '../i18n'

const PAPER_KEY = 'pos_v2_paper_size'
const PRINTERS_KEY = 'pos_v2_printer_name'

type PaperSize = '58' | '80'

interface AvansCheckModalProps {
  orderItems: OrderItem[]
  tableLabel: string
  guestCount: number
  orderNum: number
  staffName: string
  userRole: string
  shiftNumber?: string
  onPrint: () => void
  onBack: () => void
}

export default function AvansCheckModal({
  orderItems, tableLabel, guestCount, orderNum, staffName, userRole,
  shiftNumber = '001', onPrint, onBack,
}: AvansCheckModalProps) {
  const t = useT()
  const ROLE_LABELS: Record<string, string> = { waiter: t('Официант', 'Ofitsiant'), cashier: t('Кассир', 'Kassir'), admin: t('Администратор', 'Administrator') }
  const [paperSize, setPaperSize] = useState<PaperSize>((localStorage.getItem(PAPER_KEY) as PaperSize) || '58')
  const [fmTerminalId, setFmTerminalId] = useState('')
  const [orgStir, setOrgStir] = useState(getCompanyTin)
  const [orgName, setOrgName] = useState(getCompanyName)
  const [orgAddress, setOrgAddress] = useState(getCompanyAddress)
  const [orgPhone, setOrgPhone] = useState(getCompanyPhone)
  const [printing, setPrinting] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)
  const TAX_TYPE = 'QQS 12%'

  useEffect(() => {
    ;(async () => {
      try {
        const data = await fiscalDriveApi.listFiscalDrives()
        let list = Array.isArray(data) ? data : (Array.isArray((data as any)?.data) ? (data as any).data : [])
        if (list.length > 0) {
          const fm = list[0]
          const factoryId = fm.FactoryID || fm.factoryId || ''
          if (factoryId) {
            const info = await fiscalDriveApi.getFiscalMemoryInfo(factoryId)
            const i = info?.data || info || {}
            setFmTerminalId(i.TerminalID || i.terminalId || i.terminal_id || '')
          }
        }
      } catch {}

      // Always fetch fresh company data from API
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
  const dateStr = now.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const subtotal = orderItems.reduce((s, i) => s + i.total, 0)
  const vat = Math.round(subtotal * 12 / 100)
  const total = subtotal

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
            <div className="ac-meta-row"><span className="ac-label">{t('Дата', 'Sana')}</span><span className="ac-value">{dateStr}</span></div>
            <div className="ac-meta-row"><span className="ac-label">{t('Время', 'Vaqt')}</span><span className="ac-value">{timeStr}</span></div>
            <div className="ac-meta-row"><span className="ac-label">{t('Заказ', 'Buyurtma')}</span><span className="ac-value">#{orderNum}</span></div>
            <div className="ac-meta-row"><span className="ac-label">{t('Стол', 'Stol')}</span><span className="ac-value">{tableLabel}</span></div>
            <div className="ac-meta-row"><span className="ac-label">{t('Гости', 'Mehmonlar')}</span><span className="ac-value">{guestCount}</span></div>
            <div className="ac-meta-row"><span className="ac-label">{ROLE_LABELS[userRole] || userRole}</span><span className="ac-value">{staffName}</span></div>
            <div className="ac-meta-row"><span className="ac-label">{t('Смена', 'Smena')}</span><span className="ac-value">{shiftNumber}</span></div>
          </div>

          <div className="ac-divider solid" />

          <div className="ac-items">
            {orderItems.map(item => (
              <div key={item.id} className="ac-item">
                <div className="ac-item-line">
                  <span className="ac-item-name">{item.menuItem.name}</span>
                  <span className="ac-item-right">{item.quantity} x {item.unitPrice.toLocaleString()} {t('сум', "so'm")}</span>
                </div>
                <div className="ac-item-tax">{TAX_TYPE}: {Math.round(item.total * 12 / 100).toLocaleString()}</div>
                <div className="ac-item-mxik">MXIK: {item.menuItem.mxik || '09901001001000000'}</div>
              </div>
            ))}
          </div>

          <div className="ac-divider solid" />

          <div className="ac-total">
            <span>{t('ИТОГО:', 'JAMI:')}</span>
            <span className="ac-total-value">{total.toLocaleString()} {t('сум', "so'm")}</span>
          </div>
          <div className="ac-vat">{TAX_TYPE}: {vat.toLocaleString()}</div>

          <div className="ac-divider dashed" />

          <div className="ac-fiscal">
            <div className="ac-fiscal-row"><span>{t('Терминал ID:', 'Terminal ID:')}</span><span>{fmTerminalId || 'TERM-001'}</span></div>
          </div>

          <div className="ac-footer">{t('Спасибо! Ждём вас снова.', 'Rahmat! Yana kutib qolamiz.')}</div>
        </div>

        <div className="ac-actions">
          <button className="ac-print-btn" disabled={printing} onClick={async () => {
            const printer = localStorage.getItem(PRINTERS_KEY)
            let printed = false
            if (printer) {
              setPrinting(true)
              try {
                if (!receiptRef.current) throw new Error(tr('Чек не готов к печати', 'Chek chop etishga tayyor emas'))
                await printReceiptNode(printer, receiptRef.current, paperSize)
                printed = true
              } catch (e) {
                // Fall back to the old plain-text print so a printer that
                // can't handle images (or a capture hiccup) still prints something.
                console.error('Печать изображением не удалась, пробуем текстом:', e)
                try {
                  const text = formatAvansReceipt({
                    orgName: orgName || '—',
                    orgAddress: orgAddress || '',
                    orgPhone: orgPhone || '',
                    orgStir: orgStir || '—',
                    dateStr, timeStr, orderNum,
                    tableLabel, guestCount, staffName,
                    roleLabel: ROLE_LABELS[userRole] || userRole,
                    items: orderItems.map(i => ({
                      name: i.menuItem.name, quantity: i.quantity,
                      unitPrice: i.unitPrice, total: i.total, mxik: i.menuItem.mxik || '',
                    })),
                    total, vat, fmTerminalId, shiftNumber,
                  }, paperSize)
                  await printText(printer, text)
                  printed = true
                } catch (e2) {
                  alert(tr('Ошибка печати: ' + (e2 instanceof Error ? e2.message : 'неизвестная ошибка'), "Chop etish xatosi: " + (e2 instanceof Error ? e2.message : "noma'lum xato")))
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
            {printing ? t('Печать…', 'Chop etilmoqda…') : t('Печатать', 'Chop etish')}
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
