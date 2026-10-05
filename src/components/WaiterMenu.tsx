import { useState, useEffect, useMemo, useRef } from 'react'
import type { KitchenItem, OrderItem, Table } from '../data/types'
import MenuSelection, { loadMenu } from './MenuSelection'
import OrderWindow from './OrderWindow'
import PrintLoadingModal from './PrintLoadingModal'
import { buildKitchenItems, type SentCount } from '../utils/kitchenItems'
import { resolveLogicalPrinter } from '../utils/printService'
import { runKitchenPrint, type KitchenPrintTask } from '../utils/kitchenPrint'
import { useT } from '../i18n'

interface WaiterMenuProps {
  selectedTable: Table | null
  items: OrderItem[]
  onItemsChange: (items: OrderItem[]) => void
  guestCount: number
  onGuestCountChange: (v: number) => void
  onBack: () => void
  onKitchenPrinted: (printed?: KitchenItem[]) => void
  onCancelOrder?: () => void
  onReserveTable?: () => void
  isReserved?: boolean
  onCancelBooking?: () => void
  orderActionsLocked?: boolean
  onPayment?: () => void
  staffName: string
  orderOpenTime: string
  kitchenSent: SentCount[]
  orderComment: string
  onOrderCommentChange: (v: string) => void
  orderTags: string[]
  onOrderTagsChange: (v: string[]) => void
  orderModifiers: string[]
  onOrderModifiersChange: (v: string[]) => void
  onShowToast?: (msg: string) => void
}

export default function WaiterMenu({
  selectedTable, items, onItemsChange, guestCount, onGuestCountChange, onBack,
  onKitchenPrinted, onCancelOrder, onReserveTable, isReserved, onCancelBooking, orderActionsLocked, onPayment, staffName, orderOpenTime, kitchenSent,
  orderComment, onOrderCommentChange, orderTags, onOrderTagsChange,
  orderModifiers, onOrderModifiersChange, onShowToast,
}: WaiterMenuProps) {
  const t = useT()
  const [markCodes, setMarkCodes] = useState<Record<number, string[]>>({})
  const [pouredLiters, setPouredLiters] = useState<Record<number, number>>({})
  const pendingMark = useRef<{ itemId: number; code: string } | null>(null)
  const pendingPour = useRef<{ itemId: number; liters: number } | null>(null)
  const [printing, setPrinting] = useState<KitchenPrintTask | null>(null)
  const [printerError, setPrinterError] = useState('')
  const [mobileOrderOpen, setMobileOrderOpen] = useState(false)
  const menuItems = useMemo(() => loadMenu(), [])

  const totalCount = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items])
  const grandTotal = useMemo(() => items.reduce((s, i) => s + i.total, 0), [items])

  useEffect(() => { setMobileOrderOpen(false) }, [selectedTable?.id])

  const markedCodes = useMemo(() => {
    const map: Record<number, string[]> = {}
    for (const i of items) {
      const codes = [...new Set([...(i.markCodes || []), ...(markCodes[i.menuItem.id] || [])])]
      if (codes.length) map[i.menuItem.id] = codes
    }
    return map
  }, [items, markCodes])

  const [selected, setSelected] = useState<Set<number>>(() =>
    new Set(items.filter(i => i.menuItem.category !== 'Добавка').map(i => i.menuItem.id))
  )

  useEffect(() => {
    setSelected(new Set(items.filter(i => i.menuItem.category !== 'Добавка').map(i => i.menuItem.id)))
  }, [items])

  function buildOrderItems(sel: Set<number>, pm?: { itemId: number; code: string } | null, pour?: { itemId: number; liters: number } | null): OrderItem[] {
    const dishes = items.filter(i => i.menuItem.category !== 'Добавка')
    const existingMap = new Map(dishes.map(e => [e.menuItem.id, e]))
    const baseId = items.reduce((m, i) => Math.max(m, i.id), 0)
    const dishItems: OrderItem[] = menuItems
      .filter(item => sel.has(item.id))
      .map((item, idx) => {
        const prev = existingMap.get(item.id)
        const qty = prev
          ? prev.quantity
          : (item.draft ? ((pour && pour.itemId === item.id ? pour.liters : (pouredLiters[item.id] || 0))) : 1)
        return {
          id: prev ? prev.id : baseId + 1 + idx,
          menuItem: item,
          quantity: qty,
          unitPrice: item.price,
          total: item.draft ? Math.round(item.price * qty / (item.draftLiters || 1)) : item.price * qty,
          markCodes: item.mxikMarking
            ? [...new Set([...(prev?.markCodes || []), ...(markCodes[item.id] || []), ...(pm && pm.itemId === item.id ? [pm.code] : [])])]
            : undefined,
        }
      })
    const addonItems = items.filter(e => e.menuItem.category === 'Добавка')
    return [...dishItems, ...addonItems]
  }

  function handleSelectionChange(next: Set<number>) {
    const pm = pendingMark.current
    const pour = pendingPour.current
    pendingMark.current = null
    pendingPour.current = null
    setSelected(next)
    onItemsChange(buildOrderItems(next, pm, pour))
  }

  function handleItemsChange(nextItems: OrderItem[]) {
    onItemsChange(nextItems)
    setSelected(new Set(nextItems.filter(i => i.menuItem.category !== 'Добавка').map(i => i.menuItem.id)))
  }

  const { kitchenItems, kitchenPrintItems } = useMemo(
    () => buildKitchenItems(items, kitchenSent),
    [items, kitchenSent]
  )

  async function handleSendToKitchen() {
    if (isReserved) {
      alert(t('Нельзя отправить на кухню, пока не отменена бронь', 'Bron bekor qilinmaguncha oshxonaga yuborib bo\'lmaydi', 'Cannot send to kitchen while reservation is active'))
      return
    }
    const toSend = kitchenPrintItems || kitchenItems
    if (toSend.length === 0) return
    const printer = await resolveLogicalPrinter('kitchen')
    if (!printer) {
      setPrinterError(t('Выберите принтер для кухни в настройках', 'Sozlamalarda oshxona printerni tanlang', 'Select kitchen printer in Settings'))
      return
    }
    setPrinterError('')
    setPrinting({ items: toSend, kitchenName: t('КУХНЯ', 'OSHXONA', 'KITCHEN'), printer })
  }

  return (
    <div className={`menu-split${mobileOrderOpen ? ' mobile-sheet-open' : ''}`}>
      {mobileOrderOpen && (
        <div className="mobile-sheet-backdrop" onClick={() => setMobileOrderOpen(false)} />
      )}
      <button
        type="button"
        className="mobile-order-bar"
        onClick={() => setMobileOrderOpen(true)}
      >
        <span className="mobile-order-bar-count">{totalCount}</span>
        <span className="mobile-order-bar-text">
          {grandTotal > 0
            ? `${grandTotal.toLocaleString()} ${t('сум', 'so‘m', 'sum')}`
            : t('Заказ пуст', 'Buyurtma bo‘sh', 'Order is empty')}
        </span>
        <span className="mobile-order-bar-chevron">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </span>
      </button>
      <div className="menu-split-left">
        <MenuSelection
          selectedTable={selectedTable}
          onContinue={() => {}}
          onBack={onBack}
          embed
          selected={selected}
          onSelectedChange={handleSelectionChange}
          onMarked={(itemId, code) => {
            pendingMark.current = { itemId, code }
            setMarkCodes(prev => ({ ...prev, [itemId]: [...(prev[itemId] || []), code] }))
          }}
          onPoured={(itemId, liters) => {
            pendingPour.current = { itemId, liters }
            setPouredLiters(prev => ({ ...prev, [itemId]: liters }))
          }}
          markedCodes={markedCodes}
          tableInfo={{
            tableName: selectedTable?.name || '',
            guestCount,
            staffName,
            openTime: orderOpenTime,
          }}
        />
      </div>
      <div className="menu-split-right mobile-order-sheet-wrap">
        <div className="mobile-sheet-header">
          <button type="button" className="mobile-sheet-handle" onClick={() => setMobileOrderOpen(false)} aria-label="close">
            <span />
          </button>
          <div className="mobile-sheet-title-row">
            <div className="mobile-sheet-title">
              {t('Окно заказа', 'Buyurtma oynasi', 'Order window')}
              {selectedTable?.name ? ` · ${selectedTable.name}` : ''}
            </div>
            <button type="button" className="mobile-sheet-close" onClick={() => setMobileOrderOpen(false)}>✕</button>
          </div>
        </div>
        <div className="mobile-sheet-body">
        <OrderWindow
          items={items}
          onItemsChange={handleItemsChange}
          tableName={selectedTable?.name || ''}
          guestCount={guestCount}
          onGuestCountChange={onGuestCountChange}
          onSendToKitchen={onPayment ? undefined : handleSendToKitchen}
          onPayment={onPayment}
          onCancelOrder={onCancelOrder}
          onReserveTable={onReserveTable}
          isReserved={isReserved}
          onCancelBooking={onCancelBooking}
          orderActionsLocked={orderActionsLocked}
          orderComment={orderComment}
          onOrderCommentChange={onOrderCommentChange}
          orderTags={orderTags}
          onOrderTagsChange={onOrderTagsChange}
          orderModifiers={orderModifiers}
          onOrderModifiersChange={onOrderModifiersChange}
          onShowToast={onShowToast}
          embed
        />
        </div>
      </div>
      {printing && (
        <PrintLoadingModal
          onCancel={() => setPrinting(null)}
          loadingLabel={t('Печать...', 'Chop etilmoqda...', 'Printing...')}
          doneLabel={t('Отправлено на кухню', 'Oshxonaga yuborildi', 'Sent to kitchen')}
          task={() => runKitchenPrint(printing, {
            tableLabel: selectedTable?.name || '',
            guestCount,
            orderComment,
            orderTags,
            orderModifiers,
            orderItems: items,
          })}
          onComplete={() => {
            setPrinting(null)
            onKitchenPrinted(printing.items)
          }}
        />
      )}
      {printerError && <div className="kitchen-printer-error">{printerError}</div>}
    </div>
  )
}
