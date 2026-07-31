import { useState } from 'react'
import type { OrderItem, KitchenItem } from '../data/types'

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
  const now = new Date()
  const dateStr = now.toLocaleDateString('ru-RU')
  const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="modal-overlay" onClick={onBack}>
      <div className="kitchen-check-modal" onClick={e => e.stopPropagation()}>
        <div className="kc-size-selector">
          <span className={`kc-size-opt${paperSize === '58' ? ' active' : ''}`} onClick={() => setPaperSize('58')}>58 мм</span>
          <span className={`kc-size-opt${paperSize === '80' ? ' active' : ''}`} onClick={() => setPaperSize('80')}>80 мм</span>
        </div>

        <div className={`kitchen-check-receipt paper-${paperSize}`}>
          <div className="kc-header">КУХНЯ</div>

          <div className="kc-meta">
            <span>{tableLabel}</span>
            <span>{guestCount} чел.</span>
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

          {orderModifiers.length > 0 && (
            <div className="kc-order-mods">Модификаторы: {orderModifiers.join(', ')}</div>
          )}

          <div className="kc-items">
            {items.map(item => {
              const orderItem = orderItems.find(oi => oi.id === item.id)
              return (
                <div key={item.id} className="kc-item">
                  <div className="kc-item-row">
                    <span className="kc-item-name">{item.name}</span>
                    <span className="kc-item-qty">× {item.quantity}</span>
                  </div>
                  {orderItem?.comment && <div className="kc-item-note">{orderItem.comment}</div>}
                </div>
              )
            })}
          </div>

          {items.length === 0 && (
            <div className="kc-empty">Нет блюд для отправки</div>
          )}

          <div className="kc-divider" />

          <div className="kc-info">Заказ отправляется на кухню</div>
        </div>

        <div className="kc-actions">
          <button className="kc-print-btn" onClick={onPrint}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Печатать
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
