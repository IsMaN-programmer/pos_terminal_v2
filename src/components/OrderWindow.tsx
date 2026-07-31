import { useState } from 'react'
import type { OrderItem } from '../data/types'
import { OrderIcon } from './Icons'
import CommentModal from './CommentModal'
import ModifierModal from './ModifierModal'

interface OrderWindowProps {
  items: OrderItem[]
  onItemsChange: (items: OrderItem[]) => void
  tableName: string
  guestCount: number
  onGuestCountChange?: (v: number) => void
  onBack?: () => void
  onSendToKitchen?: () => void
  onPayment?: () => void
  onChangeTable?: () => void
  orderComment?: string
  onOrderCommentChange?: (v: string) => void
  orderTags?: string[]
  onOrderTagsChange?: (v: string[]) => void
  orderModifiers?: string[]
  onOrderModifiersChange?: (v: string[]) => void
}

const now = new Date()
const dateStr = now.toLocaleDateString('ru-RU')
const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

interface StockGood {
  id: number; name: string; mxik: string; unit: string; sum: number;
  quantity: number; unlimited: boolean; type: 'dish' | 'additive';
  [key: string]: any;
}

function getUnitFactor(unit: string): number {
  if (!unit) return 1
  const eqIdx = unit.indexOf('=')
  if (eqIdx === -1) return 1
  const after = unit.slice(eqIdx + 1).trim()
  const match = after.match(/^([\d.]+)/)
  return match ? parseFloat(match[1]) || 1 : 1
}

function loadStockMap(): Record<string, StockGood> {
  try {
    const raw = localStorage.getItem('pos_v2_stock_goods')
    const goods: StockGood[] = raw ? JSON.parse(raw) : []
    const map: Record<string, StockGood> = {}
    for (const g of goods) {
      if (g.name) map[g.name.toLowerCase()] = g
      if (g.mxik) map[g.mxik] = g
    }
    return map
  } catch { return {} }
}

export default function OrderWindow({
  items, onItemsChange, tableName, guestCount, onGuestCountChange, onBack, onSendToKitchen, onPayment, onChangeTable,
  orderComment = '', onOrderCommentChange, orderTags = [], onOrderTagsChange,
  orderModifiers = [], onOrderModifiersChange,
}: OrderWindowProps) {
  const [showCommentModal, setShowCommentModal] = useState(false)
  const [showModifierModal, setShowModifierModal] = useState(false)
  const stockMap = loadStockMap()

  function updateQuantity(id: number, delta: number) {
    onItemsChange(items.map(item => {
      if (item.id !== id) return item
      const stockKey = item.menuItem.name.toLowerCase()
      const stock = stockMap[stockKey]
      let newQty = Math.max(1, item.quantity + delta)
      if (delta > 0 && stock && !stock.unlimited && stock.quantity != null) {
        const factor = getUnitFactor(stock.unit)
        const maxQty = factor > 0 ? Math.floor(stock.quantity / factor) : 999999
        newQty = Math.min(newQty, maxQty)
      }
      return { ...item, quantity: newQty, total: newQty * item.unitPrice }
    }))
  }

  function canIncrement(itemName: string, currentQty: number) {
    const stock = stockMap[itemName.toLowerCase()]
    if (!stock || stock.unlimited) return true
    if (stock.quantity == null) return true
    const factor = getUnitFactor(stock.unit)
    if (factor <= 0) return true
    return (currentQty + 1) * factor <= stock.quantity
  }

  function removeItem(id: number) {
    onItemsChange(items.filter(item => item.id !== id))
  }

  function handleSaveComment(comment: string, tags: string[]) {
    onOrderCommentChange?.(comment)
    onOrderTagsChange?.(tags)
    setShowCommentModal(false)
  }

  const hasComment = orderComment || orderTags.length > 0
  const grandTotal = items.reduce((sum, item) => sum + item.total, 0)

  return (
    <div className="screen order-screen">
      {showCommentModal && (
        <CommentModal
          initialComment={orderComment}
          initialTags={orderTags}
          onSave={handleSaveComment}
          onCancel={() => setShowCommentModal(false)}
        />
      )}
      {showModifierModal && (
        <ModifierModal
          initialSelected={orderModifiers}
          onSave={(selected) => { onOrderModifiersChange?.(selected); setShowModifierModal(false) }}
          onCancel={() => setShowModifierModal(false)}
        />
      )}
      <div className="screen-header">
        <h1 className="screen-title">
          <OrderIcon />
          Окно заказа
        </h1>
        <div className="menu-header-btns">
          {onBack && (
            <button className="menu-header-btn back" onClick={onBack}>Назад</button>
          )}
          {onSendToKitchen && (
            <button className="menu-header-btn continue" onClick={onSendToKitchen}>Продолжить</button>
          )}
          {onPayment && (
            <button className="menu-header-btn continue" onClick={onPayment}>Продолжить</button>
          )}
        </div>
      </div>

      <div className="order-info-bar">
        <div className="order-info-item">
          <span className="order-info-label">Стол:</span>
          <span className="order-info-value">{tableName}</span>
        </div>
        <div className="order-info-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <div className="qty-controls" style={{ display: 'inline-flex', marginLeft: 4 }}>
            <button className="qty-btn" onClick={() => onGuestCountChange?.(Math.max(1, guestCount - 1))}>−</button>
            <span className="qty-value">{guestCount}</span>
            <button className="qty-btn" onClick={() => onGuestCountChange?.(guestCount + 1)}>+</button>
          </div>
          <span style={{ marginLeft: 4 }}>чел.</span>
        </div>
        <div className="order-info-item">
          <span>{dateStr}</span>
          <span className="order-info-time">{timeStr}</span>
        </div>
        <button className="order-change-table-btn" onClick={onChangeTable}>Сменить стол</button>
      </div>

      <div className="order-table-wrap">
        <table className="order-table">
          <thead>
            <tr>
              <th>Блюдо</th>
              <th>Кол-во</th>
              <th>Цена</th>
              <th>Итого</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td className="order-product-cell">
                  {item.menuItem.photo ? (
                    <img src={item.menuItem.photo} alt={item.menuItem.name} className="order-product-photo" />
                  ) : (
                    <span className="order-product-fallback">{item.menuItem.name.charAt(0)}</span>
                  )}
                  <span>{item.menuItem.name}</span>
                </td>
                <td>
                    <div className="qty-controls">
                      <button className="qty-btn" onClick={() => updateQuantity(item.id, -1)}>−</button>
                      <span className="qty-value">{item.quantity}</span>
                      <button className="qty-btn"
                        disabled={!canIncrement(item.menuItem.name, item.quantity)}
                        style={!canIncrement(item.menuItem.name, item.quantity) ? { opacity: 0.4, cursor: 'default' } : {}}
                        onClick={() => updateQuantity(item.id, 1)}>+</button>
                    </div>
                </td>
                <td>{item.unitPrice.toLocaleString()}</td>
                <td className="order-total-cell">{item.total.toLocaleString()}</td>
                <td>
                  <button className="order-remove-btn" onClick={() => removeItem(item.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="order-bottom">
        <div className="order-footer-actions">
          <button className={`order-action-btn${hasComment ? ' modified' : ' primary'}`} onClick={() => setShowCommentModal(true)}>{hasComment ? '✎ Изменить комментарий' : '+ Добавить комментарий'}</button>
          <button className={`order-action-btn${orderModifiers.length > 0 ? ' modified' : ' primary'}`} onClick={() => setShowModifierModal(true)}>{orderModifiers.length > 0 ? '✎ Изменить модификаторы' : '+ Модификатор'}</button>
        </div>
        <div className="order-grand-total">
          <span className="grand-total-label">Итого:</span>
          <span className="grand-total-value">{grandTotal.toLocaleString()} сум</span>
        </div>
      </div>
    </div>
  )
}
