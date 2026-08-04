import { useState } from 'react'
import type { KitchenItem, OrderItem } from '../data/types'
import { KitchenIcon, PlateIcon } from './Icons'
import SpecificKitchenModal from './SpecificKitchenModal'
import PrintLoadingModal from './PrintLoadingModal'
import { buildKitchenReceiptHtml, printReceiptHtml, type PaperSize } from '../utils/receiptHtml'
import { formatKitchenReceipt, printText } from '../utils/printService'
import { useT, locale } from '../i18n'

const KITCHEN_PRINTERS_KEY = 'pos_v2_kitchen_printer_name'
const KITCHEN_PAPER_KEY = 'pos_v2_kitchen_paper_size'

function getPhoto(name: string): string | undefined {
  try {
    const raw = localStorage.getItem('pos_v2_menu')
    const items = raw ? JSON.parse(raw) : []
    const item = items.find((m: any) => m.name === name)
    return item?.photo || undefined
  } catch { return undefined }
}

interface SendToKitchenProps {
  items: KitchenItem[]
  orderItems: OrderItem[]
  onBack?: () => void
  onContinue?: () => void
  onCancelOrder?: () => void
  onPrint: () => void
  tableLabel?: string
  guestCount?: number
  orderComment?: string
  orderTags?: string[]
  orderModifiers?: string[]
}

const BUTTONS_KEY = 'pos_v2_action_buttons'

function loadButtons(): string[] {
  try {
    const raw = localStorage.getItem(BUTTONS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return ['Отправить шашлычную', 'Отправить сомсусечную']
}

export default function SendToKitchen({
  items, orderItems, onBack, onContinue, onCancelOrder, onPrint,
  tableLabel, guestCount, orderComment, orderTags, orderModifiers,
}: SendToKitchenProps) {
  const t = useT()
  const time = new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [specificKitchen, setSpecificKitchen] = useState<string | null>(null)
  const [printing, setPrinting] = useState<{ items: KitchenItem[]; kitchenName: string; printer?: string; paperSize?: PaperSize } | null>(null)
  const [printerError, setPrinterError] = useState('')
  const actionButtons = loadButtons()

  function toggleExclude(id: number) {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allExcluded = excluded.size === items.length
  const someExcluded = excluded.size > 0 && excluded.size < items.length

  function handleSend() {
    if (itemsToSend.length === 0) return
    if (!localStorage.getItem(KITCHEN_PRINTERS_KEY)) {
      setPrinterError(t('Выберите принтер для кухни в настройках', 'Sozlamalarda oshxona printerni tanlang'))
      return
    }
    setPrinterError('')
    setPrinting({ items: itemsToSend, kitchenName: t('КУХНЯ', 'OSHXONA') })
  }

  async function runKitchenPrint(p: { items: KitchenItem[]; kitchenName: string; printer?: string; paperSize?: PaperSize }) {
    const printer = p.printer || localStorage.getItem(KITCHEN_PRINTERS_KEY) || ''
    const paperSize: PaperSize = p.paperSize || ((localStorage.getItem(KITCHEN_PAPER_KEY) as PaperSize) || '58')
    const now = new Date()
    const dateStr = now.toLocaleDateString(locale())
    const timeStr = now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
    const receiptData = {
      kitchenName: p.kitchenName,
      tableLabel: tableLabel || t('Стол', 'Stol'),
      guestCount: guestCount || 2,
      dateStr,
      timeStr,
      items: p.items.map(i => ({
        name: i.name,
        quantity: i.quantity,
        comment: orderItems.find(oi => oi.id === i.id)?.comment,
      })),
      orderComment: orderComment || '',
      orderTags: orderTags || [],
      orderModifiers: orderModifiers || [],
    }
    const html = buildKitchenReceiptHtml(receiptData)
    try {
      await printReceiptHtml(printer, html, paperSize)
    } catch (e) {
      console.error('Печать изображением не удалась, пробуем текстом:', e)
      const text = formatKitchenReceipt(receiptData, paperSize)
      await printText(printer, text)
    }
  }

  const itemsToSend = items.filter(i => !excluded.has(i.id))

  return (
    <div className="screen kitchen-screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <KitchenIcon />
          {t('Отправка заказа на кухню', 'Buyurtmani oshxonaga yuborish')}
        </h1>
        <div className="menu-header-btns">
          {onBack && <button className="menu-header-btn back" onClick={onBack}>{t('Назад', 'Orqaga')}</button>}
          {onContinue && <button className="menu-header-btn continue" onClick={handleSend}>{t('Отправить на кухню', 'Oshxonaga yuborish')}</button>}
        </div>
      </div>

      <div className="kitchen-card">
        <div className="order-info-bar kitchen-card-header">
          <div className="order-info-item">
            <span className="order-info-label">{t('Стол:', 'Stol:')}</span>
            <span className="order-info-value">{tableLabel || '3'}</span>
          </div>
          <div className="order-info-item">
            <PlateIcon />
            <span>{items.reduce((s, i) => s + i.quantity, 0)} {t('блюд(а)', 'taom')}</span>
          </div>
          <div className="order-info-item">
            <span className="order-info-time">{time}</span>
          </div>
        </div>

        <div className="kitchen-card-body">
          <div className="kitchen-items-panel">
            <h3 className="kitchen-panel-title">{t('Статус каждого блюда', 'Har bir taomning holati')}</h3>
            <div className="kitchen-items-list">
              {items.map(item => {
                const isExcluded = excluded.has(item.id)
                const photo = getPhoto(item.name)
                return (
                  <div key={item.id} className={`kitchen-item-row${isExcluded ? ' excluded' : ''}`}>
                    <div className="kitchen-item-info">
                      <div className="kitchen-item-img">
                        {photo ? (
                          <img src={photo} alt={item.name} className="kitchen-item-photo" />
                        ) : (
                          <span className="food-icon" style={{ background: '#3b82f6' }}>{item.name.charAt(0)}</span>
                        )}
                      </div>
                      <div className="kitchen-item-details">
                        <span className="kitchen-item-name">{item.name}</span>
                        <span className="kitchen-item-qty">
                          {item.quantity} x {item.unitPrice.toLocaleString()} = {item.total.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    {isExcluded ? (
                      <span className="kitchen-item-status excluded-text" onClick={() => toggleExclude(item.id)}>{t('Не отправится ✕', 'Yuborilmaydi ✕')}</span>
                    ) : (
                      <button className="kitchen-remove-btn" onClick={() => toggleExclude(item.id)}>✕</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="kitchen-actions-panel">
            <h3 className="kitchen-panel-title">{t('Действия', 'Amallar')}</h3>
            <div className="kitchen-action-btns">
              <button
                className={`kitchen-action-btn${allExcluded ? ' disabled' : someExcluded ? '' : ' primary'}`}
                disabled={allExcluded}
              >
                {t('Отправить всё', 'Hammasini yuborish')}
              </button>
              <button
                className={`kitchen-action-btn${someExcluded ? ' primary' : ''}`}
                disabled={excluded.size === 0}
              >
                {t('Отправить частично', 'Qisman yuborish')}
              </button>
              <button className="kitchen-action-btn danger" onClick={() => setShowCancelModal(true)}>{t('Отменить заказ', 'Buyurtmani bekor qilish')}</button>
              {actionButtons.map((btn, idx) => (
                <button key={idx} className="kitchen-action-btn" onClick={() => setSpecificKitchen(btn)}>{btn}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="kitchen-sync-bar">
        <span className="sync-label">{t('Синхронизация с кухней:', 'Oshxona bilan sinxronlash:')}</span>
        <div className="kitchen-sync-status centered">
          <span className="sync-dot connected" />
          <span>{t('Подключено', 'Ulangan')}</span>
        </div>
        <span className="sync-time">{t(`Последнее обновление: ${time}`, `Oxirgi yangilanish: ${time}`)}</span>
      </div>

      {showCancelModal && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="confirm-text">{t('Вы уверены, что хотите отменить заказ?', 'Buyurtmani bekor qilishni xohlaysizmi?')}</p>
            <div className="confirm-actions">
              <button className="confirm-btn no" onClick={() => setShowCancelModal(false)}>{t('Нет', 'Yo\'q')}</button>
              <button className="confirm-btn yes" onClick={() => { setShowCancelModal(false); onCancelOrder?.() }}>{t('Да', 'Ha')}</button>
            </div>
          </div>
        </div>
      )}

      {printerError && <div className="kitchen-printer-error">{printerError}</div>}

      {printing && (
        <PrintLoadingModal
          loadingLabel={t('Отправка на кухню...', 'Oshxonaga yuborilmoqda...')}
          doneLabel={t('Отправлено на кухню', 'Oshxonaga yuborildi')}
          task={() => runKitchenPrint(printing)}
          onComplete={() => { setPrinting(null); onPrint() }}
        />
      )}

      {specificKitchen && (
        <SpecificKitchenModal
          items={items}
          kitchenName={specificKitchen}
          onPrint={(selItems, printer, paperSize) => {
            setSpecificKitchen(null)
            if (!printer) return
            setPrinting({ items: selItems, kitchenName: specificKitchen, printer, paperSize: paperSize as PaperSize })
          }}
          onBack={() => setSpecificKitchen(null)}
        />
      )}
    </div>
  )
}
