import { useState } from 'react'
import type { OrderItem } from '../data/types'
import type { Table } from '../data/types'
import { ReceiptIcon } from './Icons'
import PrintLoadingModal from './PrintLoadingModal'
import { getPhoto } from '../utils/menuPhotos'
import { runAvansPrint, getAvansPrinter, getNextOrderNumber } from '../utils/avansPrint'
import { useT, tr, locale } from '../i18n'

interface PaymentPrecheckProps {
  orderItems: OrderItem[]
  table: Table | null
  guestCount: number
  staffName: string
  userRole: string
  shiftNumber?: string
  onBack?: () => void
  onAddOrder?: () => void
  onDelivered?: () => void
  onAvansPrinted?: () => void
  onSendToCashier?: () => void
  avansPrinted?: boolean
}

export default function PaymentPrecheck({
  orderItems, table, guestCount, staffName, userRole, shiftNumber = '001', onBack, onAddOrder, onDelivered, onAvansPrinted, onSendToCashier,
  avansPrinted = false,
}: PaymentPrecheckProps) {
  const [printingAvans, setPrintingAvans] = useState(false)
  const [avansOrderNum, setAvansOrderNum] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  const t = useT()
  const now = new Date()
  const dateStr = now.toLocaleDateString(locale())
  const timeStr = now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })

  const tableStatus = table?.status || 'ordered'
  const isDelivered = tableStatus === 'occupied' || avansPrinted
  const isAvansIssued = avansPrinted

  const grandTotal = orderItems.reduce((s, i) => s + i.total, 0)

  function showToastMsg(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function handleIssueAvans() {
    const printer = await getAvansPrinter()
    if (!printer) {
      showToastMsg(tr('Подключите принтер в настройках', 'Sozlamalarda printerni ulang', 'Connect a printer in Settings'))
      return
    }
    if (!avansOrderNum) setAvansOrderNum(getNextOrderNumber())
    setPrintingAvans(true)
  }

  async function printAvansTask() {
    await runAvansPrint({
      orderItems, table, guestCount, staffName, userRole, shiftNumber,
      orderNum: avansOrderNum || getNextOrderNumber(),
    })
  }

  return (
    <div className="screen payment-screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <ReceiptIcon />
          {t('Оплата / Счет', 'To\'lov / Hisob', 'Payment / Bill')}
        </h1>
        <div className="menu-header-btns">
          {onAddOrder && (
            <button
              className={`menu-header-btn back${isAvansIssued ? ' disabled' : ''}`}
              disabled={isAvansIssued}
              onClick={isAvansIssued ? undefined : onAddOrder}
            >
              + {t('Добавить заказ', 'Buyurtma qo\'shish', 'Add order')}
            </button>
          )}
          {onBack && <button className="menu-header-btn back" onClick={onBack}>{t('Назад', 'Orqaga', 'Back')}</button>}
        </div>
      </div>

      <div className="kitchen-card">
        <div className="order-info-bar kitchen-card-header">
          <div className="order-info-item">
            <span className="order-info-label">{t('Стол:', 'Stol:', 'Table:')}</span>
            <span className="order-info-value">{table?.name || '—'}</span>
          </div>
          <div className="order-info-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            <span>{guestCount} {t('чел.', 'kishi', 'persons')}</span>
          </div>
          <div className="order-info-item">
            <span>{dateStr}</span>
            <span className="order-info-time">{timeStr}</span>
          </div>
          <div className="order-info-item">
            <span className="payment-precheck-badge">{t('Счет', 'Hisob', 'Bill')}</span>
          </div>
        </div>

        <div className="kitchen-card-body">
          <div className="kitchen-items-panel">
            <h3 className="kitchen-panel-title">{t('Список блюд', 'Taomlar ro\'yxati', 'Dish list')}</h3>
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
              <span>{t(`Итого: ${orderItems.reduce((s, i) => s + i.quantity, 0)} блюд`, `Jami: ${orderItems.reduce((s, i) => s + i.quantity, 0)} taom`, `Total: ${orderItems.reduce((s, i) => s + i.quantity, 0)} dishes`)}</span>
              <span className="payment-grand-total">{grandTotal.toLocaleString()} {t('сум', 'so\'m', 'sum')}</span>
            </div>
          </div>

          <div className="kitchen-actions-panel">
            <h3 className="kitchen-panel-title">{t('Действия', 'Amallar', 'Actions')}</h3>
            <div className="payment-stage-btns">
              <button
                className={`kitchen-action-btn${isDelivered ? ' disabled' : ' green'}`}
                disabled={isDelivered}
                onClick={isDelivered ? undefined : onDelivered}
              >
                {t('Заказ доставлен', 'Buyurtma yetkazildi', 'Order delivered')}
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
                    {t('Выдать счет', 'Hisob berish', 'Issue bill')}
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
                    {t('Отправить на кассу', 'Kassaga yuborish', 'Send to cash register')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="kitchen-sync-bar">
        <span className="sync-label">{t('Синхронизация с кассой:', 'Kassa bilan sinxronlash:', 'Sync with cash register:')}</span>
        <div className="kitchen-sync-status centered">
          <span className="sync-dot" style={{ background: '#3b82f6' }} />
          <span>{t('Подключено', 'Ulangan', 'Connected')}</span>
        </div>
        <span className="sync-time">{t(`Последнее обновление: ${timeStr}`, `Oxirgi yangilanish: ${timeStr}`, `Last update: ${timeStr}`)}</span>
      </div>

      {printingAvans && (
        <PrintLoadingModal
          onCancel={() => setPrintingAvans(false)}
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
