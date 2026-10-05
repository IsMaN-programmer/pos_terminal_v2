import { useState } from 'react'
import { dataStore } from '../services/dataStore'
import type { OrderItem, KitchenItem } from '../data/types'
import { useT, locale } from '../i18n'

function getManualModifiers(mods: string[]): string[] {
  try {
    const raw = dataStore.getItem('pos_v2_modifier_groups')
    const groups: { label: string; options: string[] }[] = raw ? JSON.parse(raw) : []
    const addonNames = new Set(
      groups.filter(g => g.label === 'Добавка').flatMap(g => g.options || [])
    )
    return mods.filter(m => !addonNames.has(m))
  } catch { return mods }
}

type PaperSize = '58' | '80'

interface KitchenCheckModalProps {
  items: KitchenItem[]
  orderItems: OrderItem[]
  tableLabel: string
  guestCount: number
  orderComment: string
  orderTags: string[]
  orderModifiers: string[]
  onPrint: () => void
  onBack: () => void
}

export default function KitchenCheckModal({
  items, orderItems, tableLabel, guestCount,
  orderComment, orderTags, orderModifiers,
  onPrint, onBack,
}: KitchenCheckModalProps) {
  const [paperSize, setPaperSize] = useState<PaperSize>('58')
  const t = useT()
  const now = new Date()
  const dateStr = now.toLocaleDateString(locale())
  const timeStr = now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="modal-overlay" onClick={onBack}>
      <div className="kitchen-check-modal" onClick={e => e.stopPropagation()}>
        <div className="kc-size-selector">
          <span className={`kc-size-opt${paperSize === '58' ? ' active' : ''}`} onClick={() => setPaperSize('58')}>58 мм</span>
          <span className={`kc-size-opt${paperSize === '80' ? ' active' : ''}`} onClick={() => setPaperSize('80')}>80 мм</span>
        </div>

        <div className={`kitchen-check-receipt paper-${paperSize}`}>
          <div className="kc-header">{t('КУХНЯ', 'OSHXONA', 'KITCHEN')}</div>

          <div className="kc-meta">
            <span>{tableLabel}</span>
            <span>{guestCount} {t('чел.', 'kishi', 'persons')}</span>
            <span>{dateStr} {timeStr}</span>
          </div>

          <div className="kc-divider" />

          {(orderComment || orderTags.length > 0) && (
            <div className="kc-order-note">
              {orderTags.length > 0 && <span>{orderTags.join(', ')}</span>}
              {orderTags.length > 0 && orderComment && <span> · </span>}
              {orderComment && <span>{orderComment}</span>}
            </div>
          )}

          {getManualModifiers(orderModifiers).length > 0 && (
            <div className="kc-order-mods">{t('Модификаторы: ', 'Modifikatorlar: ', 'Modifiers: ')}{getManualModifiers(orderModifiers).join(', ')}</div>
          )}

          <div className="kc-items">
            {items.map(item => {
              const orderItem = orderItems.find(oi => oi.id === item.id)
              return (
                <div key={item.id} className={`kc-item${item.sub ? ' kc-item-sub' : ''}`}>
                  <div className="kc-item-row">
                    <span className="kc-item-name">{item.sub ? '→ ' : ''}{item.name}</span>
                    <span className="kc-item-qty">× {item.quantity}</span>
                  </div>
                  {orderItem?.comment && <div className="kc-item-note">{orderItem.comment}</div>}
                </div>
              )
            })}
          </div>

          {items.length === 0 && (
            <div className="kc-empty">{t('Нет блюд для отправки', 'Yuborish uchun taomlar yo\'q', 'No dishes to send')}</div>
          )}

          <div className="kc-divider" />

          <div className="kc-info">{t('Заказ отправляется на кухню', 'Buyurtma oshxonaga yuborilmoqda', 'Order is being sent to kitchen')}</div>
        </div>

        <div className="kc-actions">
          <button className="kc-print-btn" onClick={onPrint}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            {t('Печатать', 'Chop etish', 'Print')}
          </button>
          <button className="kc-back-btn" onClick={onBack}>
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
