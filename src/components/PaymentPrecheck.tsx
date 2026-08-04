import { useState } from 'react'
import type { OrderItem } from '../data/types'
import type { Table } from '../data/types'
import { ReceiptIcon } from './Icons'
import PrintLoadingModal from './PrintLoadingModal'
import { fiscalDriveApi } from '../services/fiscalDriveApi'
import { getCompanyTin, getCompanyName, getCompanyAddress, getCompanyPhone, fetchAndStoreCompanyData } from '../utils/companyInfo'
import { buildAvansReceiptHtml, printReceiptHtml, type PaperSize } from '../utils/receiptHtml'
import { formatAvansReceipt, printText } from '../utils/printService'
import { useT, tr, locale } from '../i18n'

const PRINTERS_KEY = 'pos_v2_printer_name'
const PAPER_KEY = 'pos_v2_paper_size'

function getPhoto(name: string): string | undefined {
  try {
    const raw = localStorage.getItem('pos_v2_menu')
    const items = raw ? JSON.parse(raw) : []
    const item = items.find((m: any) => m.name === name)
    return item?.photo || undefined
  } catch { return undefined }
}

interface PaymentPrecheckProps {
  orderItems: OrderItem[]
  table: Table | null
  guestCount: number
  staffName: string
  userRole: string
  shiftNumber?: string
  onBack?: () => void
  onDelivered?: () => void
  onAvansPrinted?: () => void
  onSendToCashier?: () => void
  avansPrinted?: boolean
}

const ORDER_COUNTER_KEY = 'pos_v2_order_counter'

function getNextOrderNumber(): number {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw = localStorage.getItem(ORDER_COUNTER_KEY)
    const counter: Record<string, number> = raw ? JSON.parse(raw) : {}
    const next = (counter[today] || 0) + 1
    counter[today] = next
    localStorage.setItem(ORDER_COUNTER_KEY, JSON.stringify(counter))
    return next
  } catch {
    return Math.floor(Math.random() * 9000) + 1000
  }
}

export default function PaymentPrecheck({
  orderItems, table, guestCount, staffName, userRole, shiftNumber = '001', onBack, onDelivered, onAvansPrinted, onSendToCashier,
  avansPrinted = false,
}: PaymentPrecheckProps) {
  const [printingAvans, setPrintingAvans] = useState(false)
  const [avansOrderNum, setAvansOrderNum] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  const t = useT()
  const now = new Date()
  const dateStr = now.toLocaleDateString(locale())
  const timeStr = now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  const ROLE_LABELS: Record<string, string> = { waiter: t('Официант', 'Ofitsiant'), cashier: t('Кассир', 'Kassir'), admin: t('Администратор', 'Administrator') }

  const tableStatus = table?.status || 'ordered'
  const isDelivered = tableStatus === 'occupied' || avansPrinted
  const isAvansIssued = avansPrinted

  const grandTotal = orderItems.reduce((s, i) => s + i.total, 0)

  function showToastMsg(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function handleIssueAvans() {
    const printer = localStorage.getItem(PRINTERS_KEY)
    if (!printer) {
      showToastMsg(tr('Подключите принтер в настройках', 'Sozlamalarda printerni ulang'))
      return
    }
    if (!avansOrderNum) setAvansOrderNum(getNextOrderNumber())
    setPrintingAvans(true)
  }

  async function printAvansTask() {
    const printer = localStorage.getItem(PRINTERS_KEY)
    const paperSize: PaperSize = ((localStorage.getItem(PAPER_KEY) as PaperSize) || '58')
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

    const html = buildAvansReceiptHtml({
      orgName: orgName || '—', orgAddress: orgAddress || '', orgPhone: orgPhone || '',
      orgStir: orgStir || '—', dateStr, timeStr, orderNum: avansOrderNum || getNextOrderNumber(),
      tableLabel: table?.name || '—', guestCount, staffName, roleLabel, shiftNumber,
      items: orderItems.map(i => ({
        name: i.menuItem.name, quantity: i.quantity,
        unitPrice: i.unitPrice, total: i.total, mxik: i.menuItem.mxik || '',
      })),
      total: subtotal, vat, fmTerminalId,
    })

    try {
      await printReceiptHtml(printer!, html, paperSize)
    } catch (e) {
      console.error('Печать изображением не удалась, пробуем текстом:', e)
      try {
        const text = formatAvansReceipt({
          orgName: orgName || '—', orgAddress: orgAddress || '', orgPhone: orgPhone || '',
          orgStir: orgStir || '—', dateStr, timeStr, orderNum: avansOrderNum,
          tableLabel: table?.name || '—', guestCount, staffName, roleLabel, shiftNumber,
          items: orderItems.map(i => ({
            name: i.menuItem.name, quantity: i.quantity,
            unitPrice: i.unitPrice, total: i.total, mxik: i.menuItem.mxik || '',
          })),
          total: subtotal, vat, fmTerminalId,
        }, paperSize)
        await printText(printer!, text)
      } catch (e2) {
        alert(tr('Ошибка печати: ' + (e2 instanceof Error ? e2.message : 'неизвестная ошибка'), "Chop etish xatosi: " + (e2 instanceof Error ? e2.message : "noma'lum xato")))
      }
    }
  }

  return (
    <div className="screen payment-screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <ReceiptIcon />
          {t('Оплата / Avans-check', "To'lov / Avans-chek")}
        </h1>
        <div className="menu-header-btns">
          {onBack && <button className="menu-header-btn back" onClick={onBack}>{t('Назад', 'Orqaga')}</button>}
        </div>
      </div>

      <div className="kitchen-card">
        <div className="order-info-bar kitchen-card-header">
          <div className="order-info-item">
            <span className="order-info-label">{t('Стол:', 'Stol:')}</span>
            <span className="order-info-value">{table?.name || '—'}</span>
          </div>
          <div className="order-info-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            <span>{guestCount} {t('чел.', 'kishi')}</span>
          </div>
          <div className="order-info-item">
            <span>{dateStr}</span>
            <span className="order-info-time">{timeStr}</span>
          </div>
          <div className="order-info-item">
            <span className="payment-precheck-badge">{t('Avans-check', 'Avans-chek')}</span>
          </div>
        </div>

        <div className="kitchen-card-body">
          <div className="kitchen-items-panel">
            <h3 className="kitchen-panel-title">{t('Список блюд', "Taomlar ro'yxati")}</h3>
            <div className="payment-items-list">
              {orderItems.map(item => {
                const photo = getPhoto(item.menuItem.name)
                return (
                  <div key={item.id} className="payment-item-row">
                    <div className="payment-item-info">
                      {photo && <img src={photo} alt={item.menuItem.name} className="payment-item-photo" />}
                      <span className="payment-item-name">{item.menuItem.name}</span>
                    </div>
                    <span className="payment-item-qty">× {item.quantity}</span>
                    <span className="payment-item-total">{item.total.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
            <div className="payment-summary">
              <span>{t(`Итого: ${orderItems.reduce((s, i) => s + i.quantity, 0)} блюд`, `Jami: ${orderItems.reduce((s, i) => s + i.quantity, 0)} taom`)}</span>
              <span className="payment-grand-total">{grandTotal.toLocaleString()} {t('сум', "so'm")}</span>
            </div>
          </div>

          <div className="kitchen-actions-panel">
            <h3 className="kitchen-panel-title">{t('Действия', 'Amallar')}</h3>
            <div className="payment-stage-btns">
              <button
                className={`kitchen-action-btn${isDelivered ? ' disabled' : ' green'}`}
                disabled={isDelivered}
                onClick={isDelivered ? undefined : onDelivered}
              >
                {t('Заказ доставлен', 'Buyurtma yetkazildi')}
              </button>

              {isDelivered && (
                <>
                  <div className="payment-stage-arrow">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <polyline points="19 12 12 19 5 12" />
                    </svg>
                  </div>

                  <button
                    className="kitchen-action-btn primary"
                    onClick={handleIssueAvans}
                  >
                    {t('Выдать Avans-check', 'Avans-chek berish')}
                  </button>
                </>
              )}

              {isAvansIssued && (
                <>
                  <div className="payment-stage-arrow">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <polyline points="19 12 12 19 5 12" />
                    </svg>
                  </div>

                  <button
                    className="kitchen-action-btn primary"
                    onClick={onSendToCashier}
                  >
                    {t('Отправить на кассу', 'Kassaga yuborish')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="kitchen-sync-bar">
        <span className="sync-label">{t('Синхронизация с кассой:', 'Kassa bilan sinxronlash:')}</span>
        <div className="kitchen-sync-status centered">
          <span className="sync-dot" style={{ background: '#3b82f6' }} />
          <span>{t('Подключено', 'Ulangan')}</span>
        </div>
        <span className="sync-time">{t(`Последнее обновление: ${timeStr}`, `Oxirgi yangilanish: ${timeStr}`)}</span>
      </div>

      {printingAvans && (
        <PrintLoadingModal
          task={printAvansTask}
          onComplete={() => { setPrintingAvans(false); onAvansPrinted?.() }}
        />
      )}

      {toast && (
        <div className="toast-overlay">
          <div className="toast-msg">{toast}</div>
        </div>
      )}
    </div>
  )
}
