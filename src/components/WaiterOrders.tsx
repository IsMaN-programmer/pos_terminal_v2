import { useState, useMemo } from 'react'
import type { Table, TableOrderData } from '../data/types'
import { OrderIcon, KitchenIcon, ReceiptIcon, FoodIcon, TableIcon, UserIcon } from './Icons'
import PrintLoadingModal from './PrintLoadingModal'
import { useT, tr } from '../i18n'
import { getPhoto } from '../utils/menuPhotos'
import { runAvansPrint, getAvansPrinter, getNextOrderNumber } from '../utils/avansPrint'
import { isOrderOwnedBy } from '../utils/orderOwnership'

type OrderFilter = 'all' | 'preparing' | 'delivered' | 'payment'

const ACTIVE_STATUSES = ['ordered', 'occupied', 'payment_pending']

function StageIcon({ icon }: { icon: 'prepare' | 'delivered' | 'bill' | 'cashier' }) {
  if (icon === 'prepare') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
    )
  }
  if (icon === 'delivered') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    )
  }
  if (icon === 'bill') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" />
        <path d="M8 7h8" /><path d="M8 11h8" /><path d="M8 15h5" />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="12" rx="2" />
      <line x1="6" y1="11" x2="6" y2="13" />
      <line x1="10" y1="11" x2="10" y2="13" />
      <line x1="14" y1="11" x2="14" y2="13" />
      <line x1="18" y1="11" x2="18" y2="13" />
      <line x1="2" y1="5" x2="22" y2="5" />
    </svg>
  )
}

interface WaiterOrdersProps {
  tables: Table[]
  tableOrders: Record<number, TableOrderData>
  avansPrinted: Set<number>
  staffName: string
  staffId?: number
  userRole: string
  shiftNumber?: string
  onEditOrder: (table: Table) => void
  onDelivered: (tableId: number) => void
  onIssueBill: (tableId: number) => void
  onSendToCashier: (table: Table) => void
  onCancelOrder?: (tableId: number) => void
}

export default function WaiterOrders({
  tables, tableOrders, avansPrinted, staffName, staffId, userRole, shiftNumber = '001',
  onEditOrder, onDelivered, onIssueBill, onSendToCashier, onCancelOrder,
}: WaiterOrdersProps) {
  const t = useT()
  const isCashier = userRole === 'cashier'
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<OrderFilter>('all')
  const [active, setActive] = useState<Table | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [printingAvans, setPrintingAvans] = useState(false)
  const [billOrderNum, setBillOrderNum] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  function openDetails(table: Table) {
    setActive(table)
    setSheetOpen(true)
  }

  function closeDetails() {
    setActive(null)
    setSheetOpen(false)
  }

  function showToastMsg(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function handleIssueAvans(table: Table) {
    const printer = await getAvansPrinter()
    if (!printer) {
      showToastMsg(tr('Подключите принтер в настройках', 'Sozlamalarda printerni ulang', 'Connect a printer in Settings'))
      return
    }
    if (!billOrderNum) setBillOrderNum(getNextOrderNumber())
    setActive(table)
    setPrintingAvans(true)
  }

  async function printAvansTask() {
    const table = activeTable
    const order = table ? tableOrders[table.id] : null
    if (!table || !order) return
    await runAvansPrint({
      orderItems: order.items,
      table,
      guestCount: order.guestCount,
      staffName,
      userRole,
      shiftNumber,
      orderNum: billOrderNum || getNextOrderNumber(),
    })
  }

  const activeTables = useMemo(
    () => tables.filter(t => ACTIVE_STATUSES.includes(t.status)
      && (userRole !== 'waiter' || isOrderOwnedBy(tableOrders[t.id], staffId))),
    [tables, tableOrders, userRole, staffId]
  )

  const counts = useMemo(() => ({
    all: activeTables.length,
    preparing: activeTables.filter(t => t.status === 'ordered').length,
    delivered: activeTables.filter(t => t.status === 'occupied').length,
    payment: activeTables.filter(t => t.status === 'payment_pending').length,
  }), [activeTables])

  const filtered = useMemo(() => {
    return activeTables
      .filter(t => {
        const st = t.status === 'ordered' ? 'preparing' : t.status === 'occupied' ? 'delivered' : 'payment'
        if (filter !== 'all' && st !== filter) return false
        if (search) {
          const q = search.toLowerCase()
          const order = tableOrders[t.id]
          const names = (order?.items || []).map(i => i.menuItem.name.toLowerCase())
          if (!t.name.toLowerCase().includes(q) && !names.some(n => n.includes(q))) return false
        }
        return true
      })
      .sort((a, b) => {
        const ta = tableOrders[a.id]?.openTime || ''
        const tb = tableOrders[b.id]?.openTime || ''
        return ta < tb ? 1 : ta > tb ? -1 : 0
      })
  }, [activeTables, filter, search, tableOrders])

  const activeTable = active ? activeTables.find(t => t.id === active.id) || null : null
  const activeOrder = activeTable ? tableOrders[activeTable.id] : null
  const delivered = activeTable?.status === 'occupied' || activeTable?.status === 'payment_pending'
  const billIssued = (activeTable && avansPrinted.has(activeTable.id)) || activeTable?.status === 'payment_pending'
  const sentCashier = activeTable?.status === 'payment_pending'
  const activeTotal = (activeOrder?.items || []).reduce((s, i) => s + i.total, 0)

  return (
    <div className={`screen orders-screen${sheetOpen ? ' mobile-sheet-open' : ''}`}>
      {sheetOpen && activeTable && (
        <div className="mobile-sheet-backdrop" onClick={closeDetails} />
      )}
      <div className="screen-header">
        <h1 className="screen-title">
          <OrderIcon />
          {t('Заказы', 'Buyurtmalar', 'Orders')}
        </h1>
      </div>

      <div className="orders-layout">
        <div className="orders-content">
          <div className="toolbar-search orders-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={t('Поиск по столу или блюду...', 'Stol yoki taom bo\'yicha qidirish...', 'Search by table or dish...')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="orders-categories">
            {([
              ['all', t('Все', 'Barchasi', 'All')],
              ['preparing', t('Готовится', 'Tayyorlanmoqda', 'Preparing')],
              ['delivered', t('Доставлен', 'Yetkazilgan', 'Delivered')],
              ['payment', t('Ожидает оплаты', 'To\'lov kutilmoqda', 'Awaiting payment')],
            ] as [OrderFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                className={`orders-cat-btn${filter === key ? ' active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="orders-stats">
            <div className="orders-stat">
              <span className="orders-stat-icon stat-all"><OrderIcon /></span>
              <span className="orders-stat-value">{counts.all}</span>
              <span className="orders-stat-label">{t('Всего заказов', 'Jami buyurtmalar', 'Total orders')}</span>
            </div>
            <div className="orders-stat">
              <span className="orders-stat-icon stat-preparing"><KitchenIcon /></span>
              <span className="orders-stat-value">{counts.preparing}</span>
              <span className="orders-stat-label">{t('Готовится', 'Tayyorlanmoqda', 'Preparing')}</span>
            </div>
            <div className="orders-stat">
              <span className="orders-stat-icon stat-delivered"><StageIcon icon="delivered" /></span>
              <span className="orders-stat-value">{counts.delivered}</span>
              <span className="orders-stat-label">{t('Доставлено', 'Yetkazilgan', 'Delivered')}</span>
            </div>
            <div className="orders-stat">
              <span className="orders-stat-icon stat-payment"><ReceiptIcon /></span>
              <span className="orders-stat-value">{counts.payment}</span>
              <span className="orders-stat-label">{t('Ожидает оплаты', 'To\'lov kutilmoqda', 'Awaiting payment')}</span>
            </div>
          </div>

          <div className="orders-list">
            {filtered.map(table => {
              const order = tableOrders[table.id]
              const items = order?.items || []
              const total = items.reduce((s, i) => s + i.total, 0)
              const thumbs: { photo?: string; name: string }[] = []
              for (const it of items) {
                if (thumbs.some(x => x.name === it.menuItem.name)) continue
                thumbs.push({ photo: getPhoto(it.menuItem.name) || undefined, name: it.menuItem.name })
                if (thumbs.length >= 5) break
              }
              const extra = new Set(items.map(i => i.menuItem.name)).size - thumbs.length
              const st = table.status === 'ordered'
                ? t('Готовится', 'Tayyorlanmoqda', 'Preparing')
                : table.status === 'occupied'
                  ? t('Доставлен', 'Yetkazilgan', 'Delivered')
                  : t('Ожидает оплаты', 'To\'lov kutilmoqda', 'Awaiting payment')
              const tBillIssued = avansPrinted.has(table.id) || table.status === 'payment_pending'
              return (
                <div key={table.id} className={`orders-card orders-card-${table.status}`}>
                  <div className="orders-card-top">
                    <div className="menu-table-info orders-card-info">
                      <div className="menu-table-info-row">
                        <TableIcon />
                        <span className="menu-table-info-label">{t('Стол:', 'Stol:', 'Table:')}</span>
                        <span className="menu-table-info-value">{table.name}</span>
                      </div>
                      <div className="menu-table-info-row">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span className="menu-table-info-label">{t('Гости:', 'Mehmonlar:', 'Guests:')}</span>
                        <span className="menu-table-info-value">{order?.guestCount ?? 1}</span>
                      </div>
                      <div className="menu-table-info-row">
                        <UserIcon />
                        <span className="menu-table-info-label">{t('Официант:', 'Ofitsiant:', 'Waiter:')}</span>
                        <span className="menu-table-info-value">{order?.waiterName || '—'}</span>
                      </div>
                      <div className="menu-table-info-row">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span className="menu-table-info-label">{t('Время:', 'Vaqt:', 'Time:')}</span>
                        <span className="menu-table-info-value">{order?.openTime || '—'}</span>
                      </div>
                    </div>
                    <div className="orders-card-status-right">
                      <span className="orders-card-status">{st}</span>
                    </div>
                  </div>
                  <div className="orders-card-sumline">
                    <span className="orders-card-sumline-line"></span>
                    <span className="orders-card-sum">{total.toLocaleString()} {t('сум', 'so\'m', 'sum')}</span>
                  </div>
                  <div className="orders-card-bottom">
                    <div className="orders-card-photos">
                      {thumbs.map((th, idx) => th.photo
                        ? <img key={idx} src={th.photo} alt="" className="orders-card-photo" />
                        : <FoodIcon key={idx} name={th.name} />
                      )}
                      {extra > 0 && <span className="orders-card-more">+{extra}</span>}
                    </div>
                    <div className="orders-card-btns">
                      {isCashier && table.status !== 'ordered' ? (
                        <button className="orders-view-btn disabled" disabled>{t('Посмотреть', 'Ko\'rish', 'View')}</button>
                      ) : (
                        <button className="orders-view-btn" onClick={() => openDetails(table)}>{t('Посмотреть', 'Ko\'rish', 'View')}</button>
                      )}
                      <button
                        className={`orders-edit-btn${isCashier || tBillIssued ? ' disabled' : ''}`}
                        disabled={isCashier || tBillIssued}
                        onClick={isCashier || tBillIssued ? undefined : () => onEditOrder(table)}
                      >
                        {t('Изменить', 'O\'zgartirish', 'Edit')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="orders-empty">{t('Нет заказов', 'Buyurtmalar yo\'q', 'No orders')}</div>
            )}
          </div>
        </div>

        {activeTable && (
          <div className="orders-panel">
            <div className="mobile-orders-sheet-header">
              <button type="button" className="mobile-sheet-handle" onClick={closeDetails} aria-label="close">
                <span />
              </button>
            </div>
            <div className="orders-panel-header">
              <span className="orders-panel-title">
                <OrderIcon />
                {activeTable!.name} | {t('Оплата / Счет', 'To\'lov / Hisob', 'Payment / Bill')}
              </span>
              <button className="orders-panel-close" onClick={closeDetails}>✕</button>
            </div>

            <div className="orders-panel-items">
              <div className="orders-panel-item-head">
                <span>{t('Блюдо', 'Taom', 'Dish')}</span>
                <span>{t('Кол-во', 'Soni', 'Qty')}</span>
                <span>{t('Цена', 'Narx', 'Price')}</span>
                <span>{t('Итого', 'Jami', 'Total')}</span>
              </div>
              {(activeOrder?.items || []).map(item => (
                <div key={item.id} className="orders-panel-item-row">
                  <span className="orders-panel-item-name">
                    <span className="orders-panel-item-photo">
                      {getPhoto(item.menuItem.name) ? (
                        <img src={getPhoto(item.menuItem.name)} alt={item.menuItem.name} className="orders-panel-photo-img" />
                      ) : (
                        <FoodIcon name={item.menuItem.name} />
                      )}
                    </span>
                    <span>{item.menuItem.name}</span>
                  </span>
                  <span>× {item.quantity}</span>
                  <span>{item.unitPrice.toLocaleString()}</span>
                  <span className="orders-panel-item-total">{item.total.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="orders-panel-total">
              <span className="orders-panel-total-label">{t('Итого:', 'Jami:', 'Total:')}</span>
              <span className="orders-panel-total-value">{activeTotal.toLocaleString()} {t('сум', 'so\'m', 'sum')}</span>
            </div>

            <div className="orders-stages">
              <div className={`orders-stage${' stage-active'}`}>
                <span className="orders-stage-icon"><StageIcon icon="prepare" /></span>
                <span className="orders-stage-label">{t('Готовится', 'Tayyorlanmoqda', 'Preparing')}</span>
              </div>
              <span className="orders-stage-arrow">›</span>
              <div className={`orders-stage${delivered || sentCashier ? ' stage-active' : ''}`}>
                <span className="orders-stage-icon"><StageIcon icon="delivered" /></span>
                <span className="orders-stage-label">{t('Заказ доставлен', 'Buyurtma yetkazildi', 'Order delivered')}</span>
              </div>
              <span className="orders-stage-arrow">›</span>
              <div className={`orders-stage${billIssued || sentCashier ? ' stage-active' : ''}`}>
                <span className="orders-stage-icon"><StageIcon icon="bill" /></span>
                <span className="orders-stage-label">{t('Выдать счет', 'Hisob berish', 'Issue bill')}</span>
              </div>
              <span className="orders-stage-arrow">›</span>
              <div className={`orders-stage${sentCashier ? ' stage-active' : ''}`}>
                <span className="orders-stage-icon"><StageIcon icon="cashier" /></span>
                <span className="orders-stage-label">{t('Отправить на кассу', 'Kassaga yuborish', 'Send to cash register')}</span>
              </div>
            </div>

            <div className="orders-stage-btns">
              {isCashier ? (
                <button className="kitchen-action-btn danger" onClick={() => { onCancelOrder?.(activeTable!.id); closeDetails() }}>
                  {t('Отменить', 'Bekor qilish', 'Cancel')}
                </button>
              ) : (
                !delivered && (
                  <button className="kitchen-action-btn green" onClick={() => onDelivered(activeTable!.id)}>
                    {t('Заказ доставлен', 'Buyurtma yetkazildi', 'Order delivered')}
                  </button>
                )
              )}
              {delivered && !billIssued && (
                <button className="kitchen-action-btn primary" onClick={() => handleIssueAvans(activeTable)}>
                  {t('Выдать счет', 'Hisob berish', 'Issue bill')}
                </button>
              )}
              {billIssued && !sentCashier && (
                <button className="kitchen-action-btn primary" onClick={() => onSendToCashier(activeTable)}>
                  {t('Отправить на кассу', 'Kassaga yuborish', 'Send to cash register')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {printingAvans && activeTable && (
        <PrintLoadingModal
          onCancel={() => setPrintingAvans(false)}
          task={printAvansTask}
          onComplete={() => { setPrintingAvans(false); if (activeTable) onIssueBill(activeTable.id) }}
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
