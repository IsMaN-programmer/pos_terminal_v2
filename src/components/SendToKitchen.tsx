import { useState } from 'react'
import { dataStore } from '../services/dataStore'
import type { KitchenItem, OrderItem } from '../data/types'
import { KitchenIcon, PlateIcon } from './Icons'
import SpecificKitchenModal from './SpecificKitchenModal'
import PrintLoadingModal from './PrintLoadingModal'
import type { PaperSize } from '../utils/receiptHtml'
import { resolveLogicalPrinter } from '../utils/printService'
import { runKitchenPrint } from '../utils/kitchenPrint'
import { useT, locale } from '../i18n'

function getPhoto(name: string): string | undefined {
  try {
    const raw = dataStore.getItem('pos_v2_menu')
    const items = raw ? JSON.parse(raw) : []
    const item = items.find((m: any) => m.name === name)
    if (item?.photo) return item.photo
  } catch {}
  try {
    const raw = dataStore.getItem('pos_v2_stock_goods')
    const goods = raw ? JSON.parse(raw) : []
    const good = goods.find((g: any) => g.name === name && g.type === 'additive')
    return good?.photo || undefined
  } catch { return undefined }
}

interface SendToKitchenProps {
  items: KitchenItem[]
  printItems?: KitchenItem[]
  orderItems: OrderItem[]
  onBack?: () => void
  onContinue?: () => void
  onCancelOrder?: () => void
  onPrint: (printed?: KitchenItem[]) => void
  tableLabel?: string
  guestCount?: number
  orderComment?: string
  orderTags?: string[]
  orderModifiers?: string[]
  embed?: boolean
}

const BUTTONS_KEY = 'pos_v2_action_buttons'

function loadButtons(): string[] {
  try {
    const raw = dataStore.getItem(BUTTONS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return ['Отправить шашлычную', 'Отправить сомсусечную']
}

export default function SendToKitchen({
  items, printItems, orderItems, onBack, onContinue, onCancelOrder, onPrint,
  tableLabel, guestCount, orderComment, orderTags, orderModifiers, embed,
}: SendToKitchenProps) {
  const t = useT()
  const time = new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [specificKitchen, setSpecificKitchen] = useState<string | null>(null)
  const [printing, setPrinting] = useState<{ items: KitchenItem[]; kitchenName: string; printer?: string; paperSize?: PaperSize; specific?: boolean } | null>(null)
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

  async function handleSend() {
    const toSend = (printItems || items).filter(i => !excluded.has(i.id))
    if (toSend.length === 0) return
    const printer = await resolveLogicalPrinter('kitchen')
    if (!printer) {
      setPrinterError(t('Выберите принтер для кухни в настройках', 'Sozlamalarda oshxona printerni tanlang', 'Select kitchen printer in Settings'))
      return
    }
    setPrinterError('')
    setPrinting({ items: toSend, kitchenName: t('КУХНЯ', 'OSHXONA', 'KITCHEN') })
  }

  const actionsPanel = (
    <div className="kitchen-actions-panel">
      <h3 className="kitchen-panel-title">{t('Действия', 'Amallar', 'Actions')}</h3>
      <div className="kitchen-action-btns">
        {!embed && (
          <button
            className={`kitchen-action-btn${allExcluded ? ' disabled' : someExcluded ? '' : ' primary'}`}
            disabled={allExcluded}
          >
            {t('Отправить всё', 'Hammasini yuborish', 'Send all')}
          </button>
        )}
        {!embed && (
          <button
            className={`kitchen-action-btn${someExcluded ? ' primary' : ''}`}
            disabled={excluded.size === 0}
          >
            {t('Отправить частично', 'Qisman yuborish', 'Send partially')}
          </button>
        )}
        {!embed && (
          <button className="kitchen-action-btn danger" onClick={() => setShowCancelModal(true)}>{t('Отменить заказ', 'Buyurtmani bekor qilish', 'Cancel order')}</button>
        )}
        {actionButtons.map((btn, idx) => (
          <button key={idx} className="kitchen-action-btn" onClick={() => setSpecificKitchen(btn)}>{btn}</button>
        ))}
      </div>
    </div>
  )

  return (
    <div className={`screen kitchen-screen${embed ? ' kitchen-screen-embed' : ''}`}>
      <div className="screen-header">
        <h1 className="screen-title">
          <KitchenIcon />
          {embed ? t('Кухня', 'Oshxona', 'Kitchen') : t('Отправка заказа на кухню', 'Buyurtmani oshxonaga yuborish', 'Sending order to kitchen')}
        </h1>
        <div className="menu-header-btns">
          {onBack && <button className="menu-header-btn back" onClick={onBack}>{t('Назад', 'Orqaga', 'Back')}</button>}
          {onContinue && <button className="menu-header-btn continue" onClick={handleSend}>{t('Отправить на кухню', 'Oshxonaga yuborish', 'Send to kitchen')}</button>}
        </div>
      </div>

      <div className="kitchen-card">
        <div className="order-info-bar kitchen-card-header">
          <div className="order-info-item">
            <span className="order-info-label">{t('Стол:', 'Stol:', 'Table:')}</span>
            <span className="order-info-value">{tableLabel || '3'}</span>
          </div>
          <div className="order-info-item">
            <PlateIcon />
            <span>{items.reduce((s, i) => s + i.quantity, 0)} {t('блюд(а)', 'taom', 'dish(es)')}</span>
          </div>
          <div className="order-info-item">
            <span className="order-info-time">{time}</span>
          </div>
        </div>

        <div className="kitchen-card-body">
          <div className="kitchen-items-panel">
            <h3 className="kitchen-panel-title">{t('Статус каждого блюда', 'Har bir taomning holati', 'Status of each dish')}</h3>
            <div className="kitchen-items-list">
              {items.map(item => {
                const isExcluded = excluded.has(item.id)
                const photo = getPhoto(item.name)
                return (
                  <div key={item.id} className={`kitchen-item-row${isExcluded ? ' excluded' : ''}${item.sub ? ' kitchen-item-sub' : ''}${item.rest ? ' kitchen-item-rest' : ''}`}>
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
                    {!embed && (isExcluded ? (
                      <span className="kitchen-item-status excluded-text" onClick={() => toggleExclude(item.id)}>{t('Не отправится ✕', 'Yuborilmaydi ✕', 'Will not be sent ✕')}</span>
                    ) : (
                      <button className="kitchen-remove-btn" onClick={() => toggleExclude(item.id)}>✕</button>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>

          {!embed && actionsPanel}
        </div>
      </div>

      {!embed && (
        <div className="kitchen-sync-bar">
          <span className="sync-label">{t('Синхронизация с кухней:', 'Oshxona bilan sinxronlash:', 'Sync with kitchen:')}</span>
          <div className="kitchen-sync-status centered">
            <span className="sync-dot connected" />
            <span>{t('Подключено', 'Ulangan', 'Connected')}</span>
          </div>
          <span className="sync-time">{t(`Последнее обновление: ${time}`, `Oxirgi yangilanish: ${time}`, `Last update: ${time}`)}</span>
        </div>
      )}

      {embed && <div className="kitchen-actions-bottom">{actionsPanel}</div>}

      {showCancelModal && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="confirm-text">{t('Вы уверены, что хотите отменить заказ?', 'Buyurtmani bekor qilishni xohlaysizmi?', 'Are you sure you want to cancel the order?')}</p>
            <div className="confirm-actions">
              <button className="confirm-btn no" onClick={() => setShowCancelModal(false)}>{t('Нет', 'Yo\'q', 'No')}</button>
              <button className="confirm-btn yes" onClick={() => { setShowCancelModal(false); onCancelOrder?.() }}>{t('Да', 'Ha', 'Yes')}</button>
            </div>
          </div>
        </div>
      )}

      {printerError && <div className="kitchen-printer-error">{printerError}</div>}

      {printing && (
        <PrintLoadingModal
          loadingLabel={t('Печать...', 'Chop etilmoqda...', 'Printing...')}
          doneLabel={printing.specific ? t('Напечатано', 'Chop etildi', 'Printed') : t('Отправлено на кухню', 'Oshxonaga yuborildi', 'Sent to kitchen')}
          task={() => runKitchenPrint(printing, {
            tableLabel: tableLabel || t('Стол', 'Stol', 'Table'),
            guestCount: guestCount || 2,
            orderComment,
            orderTags,
            orderModifiers,
            orderItems,
          })}
          onComplete={() => {
            const isSpecific = printing.specific
            setPrinting(null)
            if (!isSpecific) onPrint(printing.items)
          }}
        />
      )}

      {specificKitchen && (
        <SpecificKitchenModal
          items={items}
          kitchenName={specificKitchen}
          onPrint={(selItems, printer, paperSize) => {
            setSpecificKitchen(null)
            if (!printer) return
            setPrinting({ items: selItems, kitchenName: specificKitchen, printer, paperSize: paperSize as PaperSize, specific: true })
          }}
          onBack={() => setSpecificKitchen(null)}
        />
      )}
    </div>
  )
}
