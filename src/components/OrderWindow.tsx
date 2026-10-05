import { useState } from 'react'
import { dataStore } from '../services/dataStore'
import type { OrderItem } from '../data/types'
import { OrderIcon } from './Icons'
import CommentModal from './CommentModal'
import ModifierModal, { type AddonSelection } from './ModifierModal'
import MarkingModal from './MarkingModal'
import DraftPourModal from './DraftPourModal'
import { useT, locale } from '../i18n'

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
  onCancelOrder?: () => void
  onReserveTable?: () => void
  isReserved?: boolean
  onCancelBooking?: () => void
  orderActionsLocked?: boolean
  embed?: boolean
  orderComment?: string
  onOrderCommentChange?: (v: string) => void
  orderTags?: string[]
  onOrderTagsChange?: (v: string[]) => void
  orderModifiers?: string[]
  onOrderModifiersChange?: (v: string[]) => void
  onShowToast?: (msg: string) => void
}

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
    const raw = dataStore.getItem('pos_v2_stock_goods')
    const goods: StockGood[] = raw ? JSON.parse(raw) : []
    const map: Record<string, StockGood> = {}
    for (const g of goods) {
      if (g.name) map[g.name.toLowerCase()] = g
      if (g.mxik) map[g.mxik] = g
    }
    return map
  } catch { return {} }
}

function loadDraftStockQty(): Record<number, number> {
  try {
    const raw = dataStore.getItem('pos_v2_stock_goods')
    const goods: StockGood[] = raw ? JSON.parse(raw) : []
    const map: Record<number, number> = {}
    for (const g of goods) {
      if (g.draft && g.goodsId != null) map[g.goodsId] = Number(g.quantity) || 0
    }
    return map
  } catch { return {} }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export default function OrderWindow({
  items, onItemsChange, tableName, guestCount, onGuestCountChange, onBack, onSendToKitchen, onPayment, onChangeTable, onCancelOrder,
  onReserveTable, isReserved = false, onCancelBooking, orderActionsLocked = false, embed,
  orderComment = '', onOrderCommentChange, orderTags = [], onOrderTagsChange,
  orderModifiers = [], onOrderModifiersChange, onShowToast,
}: OrderWindowProps) {
  const t = useT()
  const now = new Date()
  const dateStr = now.toLocaleDateString(locale())
  const timeStr = now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  const [showCommentModal, setShowCommentModal] = useState(false)
  const [showModifierModal, setShowModifierModal] = useState(false)
  const [markingFor, setMarkingFor] = useState<number | null>(null)
  const [pourFor, setPourFor] = useState<OrderItem | null>(null)
  const stockMap = loadStockMap()
  const draftStockQty = loadDraftStockQty()

  function updateQuantity(id: number, delta: number) {
    if (delta > 0) {
      const target = items.find(item => item.id === id)
      if (target?.menuItem.draft) {
        setPourFor(target)
        return
      }
      if (target?.menuItem.mxikMarking) {
        setMarkingFor(id)
        return
      }
    }
    onItemsChange(items.map(item => {
      if (item.id !== id) return item
      const stockKey = item.menuItem.name.toLowerCase()
      const stock = stockMap[stockKey]
      let newQty: number
      if (item.menuItem.draft) {
        newQty = Math.max(0.1, round3(item.quantity + delta * 0.1))
        if (delta > 0 && stock && !stock.unlimited && stock.quantity != null) {
          newQty = Math.min(newQty, round3(stock.quantity))
        }
      } else {
        newQty = Math.max(1, item.quantity + delta)
        if (delta > 0 && stock && !stock.unlimited && stock.quantity != null) {
          const factor = getUnitFactor(stock.unit)
          const maxQty = factor > 0 ? Math.floor(stock.quantity / factor) : 999999
          newQty = Math.min(newQty, maxQty)
        }
      }
      return {
        ...item,
        quantity: newQty,
        total: item.menuItem.draft ? Math.round(item.unitPrice * newQty / (item.menuItem.draftLiters || 1)) : newQty * item.unitPrice,
      }
    }))
  }

  function canIncrement(itemName: string, currentQty: number, draft?: boolean) {
    const stock = stockMap[itemName.toLowerCase()]
    if (!stock || stock.unlimited) return true
    if (stock.quantity == null) return true
    if (draft) return currentQty < stock.quantity - 0.0001
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

  function handleSendToKitchenClick() {
    if (isReserved) {
      onShowToast?.(t('Сначала отмените бронь!', 'Avval bronni bekor qiling!', 'Please cancel the reservation first!'))
      return
    }
    onSendToKitchen?.()
  }

  const hasComment = orderComment || orderTags.length > 0
  const grandTotal = items.reduce((sum, item) => sum + item.total, 0)
  const markingItem = markingFor !== null ? items.find(item => item.id === markingFor) : null
  const addonItems = items.filter(item => item.menuItem.category === 'Добавка')
  const hasAddons = addonItems.length > 0
  const dishes = items
    .filter(item => item.menuItem.category !== 'Добавка')
    .map(d => ({ id: d.menuItem.id, name: d.menuItem.name, quantity: d.quantity }))
  const initialAddons: AddonSelection[] = addonItems.map(i => ({
    id: i.menuItem.id,
    name: i.menuItem.name,
    photo: i.menuItem.photo,
    price: i.menuItem.price,
    mxik: i.menuItem.mxik,
    mxikName: i.menuItem.mxikName,
    unit: i.menuItem.unit,
    unitCode: i.menuItem.unitCode,
    marking: i.menuItem.mxikMarking,
    quantity: i.quantity,
    mode: i.dishBindings?.length ? 'dish' : 'general',
    bindings: i.dishBindings ?? [],
  }))

  function handleSaveModifiers(addons: AddonSelection[], mods: string[]) {
    onOrderModifiersChange?.(mods)
    const withoutAddons = items.filter(item => item.menuItem.category !== 'Добавка')
    const baseId = withoutAddons.length > 0 ? Math.max(...withoutAddons.map(i => i.id)) : 0
    const newItems: OrderItem[] = addons.map((a, idx) => ({
      id: baseId + 1 + idx,
      menuItem: {
        id: a.id,
        name: a.name,
        price: a.price,
        category: 'Добавка',
        unit: a.unit,
        unitCode: a.unitCode,
        photo: a.photo,
        mxik: a.mxik,
        mxikName: a.mxikName,
        mxikMarking: a.marking,
      },
      quantity: a.quantity,
      unitPrice: a.price,
      total: a.price * a.quantity,
      dishBindings: a.mode === 'dish' ? a.bindings?.filter(b => b.count > 0) : undefined,
    }))
    onItemsChange([...withoutAddons, ...newItems])
    setShowModifierModal(false)
  }

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
          initialAddons={initialAddons}
          dishes={dishes}
          onSave={handleSaveModifiers}
          onCancel={() => setShowModifierModal(false)}
        />
      )}
      {markingItem && (
        <MarkingModal
          itemName={markingItem.menuItem.name}
          existingCodes={markingItem.markCodes || []}
          allowDuplicates={!!markingItem.menuItem.draft}
          onCancel={() => setMarkingFor(null)}
          onConfirm={(code) => {
            onItemsChange(items.map(item => {
              if (item.id !== markingItem.id) return item
              const stockKey = item.menuItem.name.toLowerCase()
              const stock = stockMap[stockKey]
              let newQty = item.quantity + 1
              if (stock && !stock.unlimited && stock.quantity != null) {
                const factor = getUnitFactor(stock.unit)
                const maxQty = factor > 0 ? Math.floor(stock.quantity / factor) : 999999
                newQty = Math.min(newQty, maxQty)
              }
              return {
                ...item,
                quantity: newQty,
                total: newQty * item.unitPrice,
                markCodes: [...(item.markCodes || []), code],
              }
            }))
            setMarkingFor(null)
          }}
        />
      )}
      {pourFor && (
        <DraftPourModal
          itemName={pourFor.menuItem.name}
          containerLiters={pourFor.menuItem.draftLiters || 1}
          bottlePrice={pourFor.menuItem.price}
          availableLiters={draftStockQty[pourFor.menuItem.goodsId || -1] ?? -1}
          onCancel={() => setPourFor(null)}
          onConfirm={(liters) => {
            onItemsChange(items.map(item => {
              if (item.id !== pourFor.id) return item
              const stockKey = item.menuItem.name.toLowerCase()
              const stock = stockMap[stockKey]
              let newQty = round3(item.quantity + liters)
              if (stock && !stock.unlimited && stock.quantity != null) {
                newQty = Math.min(newQty, round3(stock.quantity))
              }
              return {
                ...item,
                quantity: newQty,
                total: Math.round(item.unitPrice * newQty / (item.menuItem.draftLiters || 1)),
              }
            }))
            setPourFor(null)
          }}
        />
      )}
      {!embed && (
        <div className="screen-header">
          <h1 className="screen-title">
            <OrderIcon />
            {t('Окно заказа', 'Buyurtma oynasi', 'Order window')}
          </h1>
          <div className="menu-header-btns">
            {onBack && (
              <button className="menu-header-btn back" onClick={onBack}>{t('Назад', 'Orqaga', 'Back')}</button>
            )}
            {onSendToKitchen && (
              <button
              className={`menu-header-btn continue`}
              onClick={handleSendToKitchenClick}
            >
              {t('Отправить на кухню', 'Oshxonaga yuborish', 'Send to kitchen')}
            </button>
            )}
            {onPayment && (
              <button className="menu-header-btn continue" onClick={onPayment}>{t('Продолжить', 'Davom etish', 'Continue')}</button>
            )}
          </div>
        </div>
      )}

      <div className="order-info-bar">
        {embed ? (
          <>
            <div className="order-info-item order-title-embed-item">
              <span className="order-info-value">{tableName}</span>
              <span className="order-title-embed-sep">|</span>
              <span>{t('Окно заказа', 'Buyurtma oynasi', 'Order window')}</span>
            </div>
            <div className="order-info-item order-guests-embed">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <div className="qty-controls">
                <button className="qty-btn" onClick={() => onGuestCountChange?.(Math.max(1, guestCount - 1))}>−</button>
                <span className="qty-value">{guestCount}</span>
                <button className="qty-btn" onClick={() => onGuestCountChange?.(guestCount + 1)}>+</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="order-info-item">
              <span className="order-info-label">{t('Стол:', 'Stol:', 'Table:')}</span>
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
              <span style={{ marginLeft: 4 }}>{t('чел.', 'kishi', 'persons')}</span>
            </div>
            <div className="order-info-item">
              <span>{dateStr}</span>
              <span className="order-info-time">{timeStr}</span>
            </div>
          </>
        )}
      </div>


      <div className="order-table-wrap">
        <table className="order-table">
          <thead>
            <tr>
              <th>{t('Блюдо', 'Taom', 'Dish')}</th>
              <th>{t('Кол-во', 'Soni', 'Qty')}</th>
              <th>{t('Цена', 'Narx', 'Price')}</th>
              <th>{t('Итого', 'Jami', 'Total')}</th>
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
                  <span className="order-product-name">{item.menuItem.name}</span>
                </td>
                <td>
                    <div className="qty-controls">
                      <button className="qty-btn" onClick={() => updateQuantity(item.id, -1)}>−</button>
                      <span className="qty-value">{item.quantity}</span>
                      <button className="qty-btn"
                        disabled={!canIncrement(item.menuItem.name, item.quantity, item.menuItem.draft)}
                        style={!canIncrement(item.menuItem.name, item.quantity, item.menuItem.draft) ? { opacity: 0.4, cursor: 'default' } : {}}
                        onClick={() => updateQuantity(item.id, 1)}>+</button>
                    </div>
                </td>
                <td className="order-price-cell">{item.unitPrice.toLocaleString()}</td>
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
          {embed && (
            <div className="order-grand-total">
              <span className="grand-total-label">{t('Итого:', 'Jami:', 'Total:')}</span>
              <span className="grand-total-value">{grandTotal.toLocaleString()} {t('сум', 'so\'m', 'sum')}</span>
            </div>
          )}
          {onSendToKitchen && (
            <button
              className="order-action-btn send"
              onClick={handleSendToKitchenClick}
            >
              {t('Отправить на кухню', 'Oshxonaga yuborish', 'Send to kitchen')}
            </button>
          )}
          {onPayment && (
            <button
              className="order-action-btn send"
              onClick={onPayment}
            >
              {t('Продолжить', 'Davom etish', 'Continue')}
            </button>
          )}
          <div className="order-footer-row">
            <button className={`order-action-btn${hasComment ? ' modified' : ' primary'}`} onClick={() => setShowCommentModal(true)}>
              {hasComment ? t('✎ Изменить комментарий', '✎ Izohni o\'zgartirish', '✎ Edit comment') : t('+ Добавить комментарий', '+ Izoh qo\'shish', '+ Add comment')}
            </button>
            <button className={`order-action-btn${hasAddons || orderModifiers.length > 0 ? ' modified' : ' primary'}`} onClick={() => setShowModifierModal(true)}>
              {hasAddons || orderModifiers.length > 0 ? t('✎ Изменить модификаторы', '✎ Modifikatorlarni o\'zgartirish', '✎ Edit modifiers') : t('+ Модификатор', '+ Modifikator', '+ Modifier')}
            </button>
          </div>

          <div className="order-footer-split-row">
            {isReserved && onCancelBooking ? (
              <button
                className={`order-action-btn cancel-booking-btn${orderActionsLocked ? ' disabled' : ''}`}
                disabled={orderActionsLocked}
                onClick={orderActionsLocked ? undefined : onCancelBooking}
              >
                {t('Отменить бронь', 'Bronni bekor qilish', 'Cancel reservation')}
              </button>
            ) : onReserveTable ? (
              <button
                className={`order-action-btn reserve-table-btn${orderActionsLocked ? ' disabled' : ''}`}
                disabled={orderActionsLocked}
                onClick={orderActionsLocked ? undefined : onReserveTable}
              >
                {t('Бронь', 'Bron', 'Reservation')}
              </button>
            ) : null}

            {onCancelOrder ? (
              <button
                className={`order-action-btn cancel-order${orderActionsLocked ? ' disabled' : ''}`}
                disabled={orderActionsLocked}
                onClick={orderActionsLocked ? undefined : onCancelOrder}
              >
                {t('Отменить заказ', 'Buyurtmani bekor qilish', 'Cancel order')}
              </button>
            ) : onChangeTable ? (
              <button className="order-action-btn table-change" onClick={onChangeTable}>
                {t('Сменить стол', 'Stolni almashtirish', 'Change table')}
              </button>
            ) : null}
          </div>
        </div>

        {!embed && (
          <div className="order-grand-total">
            <span className="grand-total-label">{t('Итого:', 'Jami:', 'Total:')}</span>
            <span className="grand-total-value">{grandTotal.toLocaleString()} {t('сум', 'so\'m', 'sum')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
