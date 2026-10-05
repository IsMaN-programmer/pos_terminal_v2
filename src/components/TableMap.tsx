import { useState, useMemo } from 'react'
import { dataStore } from '../services/dataStore'
import type { Table, TableStatus, TableOrderData, TableBookingData } from '../data/types'
import { TableIcon, CalendarIcon, ClockIcon, UserIcon, SmartphoneIcon, GuestsIcon, ReceiptIcon, PlateIcon, KitchenIcon, BookIcon } from './Icons'
import BookingModal from './BookingModal'
import { useT } from '../i18n'
import chairIcon from '../assets/icons/chair.png'

const CATEGORIES_KEY = 'pos_v2_zone_categories'
const ZONE_CATEGORY_KEY = 'pos_v2_zone_category_map'

function loadCategories(): string[] {
  try {
    const raw = dataStore.getItem(CATEGORIES_KEY)
    return raw ? JSON.parse(raw) : ['Основная зона']
  } catch { return ['Основная зона'] }
}

function loadZoneCategory(): Record<string, string> {
  try {
    const raw = dataStore.getItem(ZONE_CATEGORY_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

const STATUS_CLASSES: Record<string, string> = {
  free: 'table-free',
  occupied: 'table-occupied',
  ordered: 'table-ordered',
  payment_pending: 'table-payment',
  reserved: 'table-reserved',
}

interface TableMapProps {
  tables: Table[]
  tableOrders?: Record<number, TableOrderData>
  tableBookings?: Record<number, TableBookingData>
  staffName?: string
  reservingMode?: boolean
  onCancelReservingMode?: () => void
  onSaveBooking?: (tableId: number, booking: TableBookingData) => void
  onSelectTable: (table: Table) => void
  onUpdateStatus: (tableId: number, status: TableStatus) => void
  role?: string
}

export default function TableMap({
  tables,
  tableOrders = {},
  tableBookings = {},
  staffName = '',
  reservingMode = false,
  onCancelReservingMode,
  onSaveBooking,
  onSelectTable,
  onUpdateStatus: _onUpdateStatus,
  role,
}: TableMapProps) {
  const t = useT()
  const STATUS_LABELS: Record<string, string> = {
    free: t('Свободен', 'Bo\'sh', 'Free'),
    occupied: t('Занят', 'Band', 'Occupied'),
    ordered: t('Есть заказ', 'Buyurtma bor', 'Order exists'),
    payment_pending: t('Ожидает оплаты', 'To\'lov kutilmoqda', 'Awaiting payment'),
    reserved: t('Бронь', 'Bron', 'Reservation'),
  }
  const [categoryFilter, setCategoryFilter] = useState('Все зоны')
  const [zoneFilter, setZoneFilter] = useState('Все зоны')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Booking Modal State
  const [bookingTarget, setBookingTarget] = useState<Table | null>(null)

  const isWaiter = role === 'waiter'

  const allCategories = useMemo(() => loadCategories(), [tables])
  const zoneCategory = useMemo(() => loadZoneCategory(), [tables])

  const zones = [...new Set(tables.map(t => t.zone))]

  const zonesInCategory = useMemo(() => {
    if (categoryFilter === 'Все зоны') return zones
    return zones.filter(z => (zoneCategory[z] || 'Основная зона') === categoryFilter)
  }, [categoryFilter, zones, zoneCategory])

  const statusCounts = useMemo(() => ({
    all: tables.length,
    free: tables.filter(t => t.status === 'free').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    ordered: tables.filter(t => t.status === 'ordered').length,
    payment_pending: tables.filter(t => t.status === 'payment_pending').length,
    reserved: tables.filter(t => t.status === 'reserved').length,
  }), [tables])

  const filtered = tables.filter(t => {
    const matchCategory = categoryFilter === 'Все зоны' || (zoneCategory[t.zone] || 'Основная зона') === categoryFilter
    const matchZone = zoneFilter === 'Все зоны' || t.zone === zoneFilter
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    const matchSearch = !search
      || t.name.toLowerCase().includes(search.toLowerCase())
      || t.zone.toLowerCase().includes(search.toLowerCase())
      || (tableOrders[t.id]?.waiterName || '').toLowerCase().includes(search.toLowerCase())
    return matchCategory && matchZone && matchStatus && matchSearch
  })

  const grouped = zonesInCategory.reduce<Record<string, Table[]>>((acc, zone) => {
    acc[zone] = filtered.filter(t => t.zone === zone)
    return acc
  }, {})

  function handleTableClick(table: Table) {
    if (reservingMode) {
      if (table.status === 'free') {
        setBookingTarget(table)
      }
      return
    }

    if (isWaiter && table.status !== 'free' && table.status !== 'reserved') {
      return
    }

    onSelectTable(table)
  }

  return (
    <div className="screen table-map-screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <TableIcon />
          {t('Карта столов', 'Stollar xaritasi', 'Table map')}
        </h1>
      </div>

      {reservingMode && (
        <div className="reserving-mode-banner">
          <span>{t('Выберите свободный стол для бронирования', 'Bron qilish uchun bo\'sh stolni tanlang', 'Select a free table for reservation')}</span>
          {onCancelReservingMode && (
            <button className="reserving-cancel-btn" onClick={onCancelReservingMode}>
              {t('Отменить выбор', 'Tanlovni bekor qilish', 'Clear selection')}
            </button>
          )}
        </div>
      )}

      {/* Легенда статусов на верху */}
      <div className="table-map-stats">
        <button
          type="button"
          className={`table-map-stat-card stat-all${statusFilter === 'all' ? ' active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <span className="stat-card-icon icon-all"><TableIcon /></span>
          <div className="stat-card-info">
            <span className="stat-card-value">{statusCounts.all}</span>
            <span className="stat-card-label">{t('Все столы', 'Barcha stollar', 'All tables')}</span>
          </div>
        </button>

        <button
          type="button"
          className={`table-map-stat-card stat-free${statusFilter === 'free' ? ' active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'free' ? 'all' : 'free')}
        >
          <span className="stat-card-icon icon-free"><TableIcon /></span>
          <div className="stat-card-info">
            <span className="stat-card-value">{statusCounts.free}</span>
            <span className="stat-card-label">{STATUS_LABELS.free}</span>
          </div>
        </button>

        <button
          type="button"
          className={`table-map-stat-card stat-occupied${statusFilter === 'occupied' ? ' active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'occupied' ? 'all' : 'occupied')}
        >
          <span className="stat-card-icon icon-occupied"><UserIcon /></span>
          <div className="stat-card-info">
            <span className="stat-card-value">{statusCounts.occupied}</span>
            <span className="stat-card-label">{STATUS_LABELS.occupied}</span>
          </div>
        </button>

        <button
          type="button"
          className={`table-map-stat-card stat-ordered${statusFilter === 'ordered' ? ' active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'ordered' ? 'all' : 'ordered')}
        >
          <span className="stat-card-icon icon-ordered"><KitchenIcon /></span>
          <div className="stat-card-info">
            <span className="stat-card-value">{statusCounts.ordered}</span>
            <span className="stat-card-label">{STATUS_LABELS.ordered}</span>
          </div>
        </button>

        <button
          type="button"
          className={`table-map-stat-card stat-payment${statusFilter === 'payment_pending' ? ' active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'payment_pending' ? 'all' : 'payment_pending')}
        >
          <span className="stat-card-icon icon-payment"><ReceiptIcon /></span>
          <div className="stat-card-info">
            <span className="stat-card-value">{statusCounts.payment_pending}</span>
            <span className="stat-card-label">{STATUS_LABELS.payment_pending}</span>
          </div>
        </button>

        <button
          type="button"
          className={`table-map-stat-card stat-reserved${statusFilter === 'reserved' ? ' active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'reserved' ? 'all' : 'reserved')}
        >
          <span className="stat-card-icon icon-reserved"><BookIcon /></span>
          <div className="stat-card-info">
            <span className="stat-card-value">{statusCounts.reserved}</span>
            <span className="stat-card-label">{STATUS_LABELS.reserved}</span>
          </div>
        </button>
      </div>

      <div className="table-map-toolbar">
        <div className="table-map-toolbar-top">
          <div className="toolbar-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={t('Поиск стола, зоны или официанта...', 'Stol, zona yoki ofitsiantni qidirish...', 'Search for table, zone or waiter...')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="toolbar-filters">
            <select className="toolbar-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="Все зоны">{t('Все зоны', 'Barcha zonalar', 'All zones')}</option>
              {allCategories.map(c => <option key={c} value={c}>{c === 'Основная зона' ? t('Основная зона', 'Asosiy zona', 'Main hall') : c}</option>)}
            </select>
          </div>
        </div>
        <div className="toolbar-chip-group reserve-chip-row">
          <button
            type="button"
            className={`toolbar-chip${zoneFilter === 'Все зоны' ? ' active' : ''}`}
            onClick={() => setZoneFilter('Все зоны')}
          >{t('Все', 'Barchasi', 'All')}</button>
          {zonesInCategory.map(z => (
            <button
              key={z}
              type="button"
              className={`toolbar-chip${zoneFilter === z ? ' active' : ''}`}
              onClick={() => setZoneFilter(zoneFilter === z ? 'Все зоны' : z)}
            >{z}</button>
          ))}
        </div>
      </div>

      <div className="table-map-content">
        {Object.entries(grouped).map(([zone, zoneTables]) => (
          zoneTables.length > 0 && (
            <div key={zone} className="table-zone">
              <h2 className="zone-title">{zone}</h2>
              <div className="table-grid">
                {zoneTables.map(table => {
                  const isReservingHighlight = reservingMode && table.status === 'free'
                  const lockedForWaiter = isWaiter && table.status !== 'free' && table.status !== 'reserved'
                  const highlightClass = isReservingHighlight ? ' table-highlight-reserve' : ''

                  const booking = tableBookings[table.id]
                  const order = tableOrders[table.id]
                  const items = order?.items || []
                  const totalSum = items.reduce((sum, i) => sum + i.total, 0)
                  const guestCount = order?.guestCount || 1
                  const openTime = order?.openTime || ''
                  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)
                  const orderWaiter = order?.waiterName || staffName || '—'

                  return (
                    <button
                      key={table.id}
                      className={`table-card ${STATUS_CLASSES[table.status]}${highlightClass}${lockedForWaiter ? ' table-waiter-locked' : ''}`}
                      onClick={() => handleTableClick(table)}
                    >
                      <div className="table-card-top-bar">
                        <span className="table-number">{table.name}</span>
                        <span className="table-status-pill">{STATUS_LABELS[table.status]}</span>
                      </div>

                      <div className="table-card-body">
                        {table.status === 'free' ? (
                          <span className="table-card-icon"><img src={chairIcon} alt="" className="table-card-icon-img" /></span>
                        ) : table.status === 'reserved' ? (
                          <div className="table-card-order-info-list">
                            <div className="table-card-order-row">
                              <CalendarIcon />
                              <span className="table-card-order-label">{t('Дата:', 'Sana:', 'Date:')}</span>
                              <span className="table-card-order-val">{booking?.date || '—'}</span>
                            </div>
                            <div className="table-card-order-row">
                              <ClockIcon />
                              <span className="table-card-order-label">{t('Время:', 'Vaqt:', 'Time:')}</span>
                              <span className="table-card-order-val">{booking?.time || '—'}</span>
                            </div>
                            <div className="table-card-order-row">
                              <UserIcon />
                              <span className="table-card-order-label">{t('Имя:', 'Ism:', 'Name:')}</span>
                              <span className="table-card-order-val">{booking?.name || '—'}</span>
                            </div>
                            <div className="table-card-order-row">
                              <SmartphoneIcon />
                              <span className="table-card-order-label">{t('Тел:', 'Tel:', 'Phone:')}</span>
                              <span className="table-card-order-val">{booking?.phone || '—'}</span>
                            </div>
                            <div className="table-card-order-row">
                              <GuestsIcon />
                              <span className="table-card-order-label">{t('Люди:', 'Odamlar:', 'People:')}</span>
                              <span className="table-card-order-val">{booking?.guestCount ?? 1}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="table-card-order-info-list">
                            <div className="table-card-order-row">
                              <GuestsIcon />
                              <span className="table-card-order-label">{t('Люди:', 'Odamlar:', 'People:')}</span>
                              <span className="table-card-order-val">{guestCount}</span>
                            </div>
                            <div className="table-card-order-row">
                              <UserIcon />
                              <span className="table-card-order-label">{t('Официант:', 'Ofitsiant:', 'Waiter:')}</span>
                              <span className="table-card-order-val">{orderWaiter}</span>
                            </div>
                            <div className="table-card-order-row">
                              <ClockIcon />
                              <span className="table-card-order-label">{t('Время:', 'Vaqt:', 'Time:')}</span>
                              <span className="table-card-order-val">{openTime || '—'}</span>
                            </div>
                            <div className="table-card-order-row table-card-order-row-sum">
                              <ReceiptIcon />
                              <span className="table-card-order-label">{t('Сумма:', 'Summa:', 'Amount:')}</span>
                              <span className="table-card-order-val table-card-sum-text">
                                {totalSum > 0 ? `${totalSum.toLocaleString()} ${t('сум', 'so\'m', 'sum')}` : '—'}
                              </span>
                            </div>
                            <div className="table-card-order-row">
                              <PlateIcon />
                              <span className="table-card-order-label">{t('Блюда:', 'Taomlar:', 'Dishes:')}</span>
                              <span className="table-card-order-val">{itemCount}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        ))}
      </div>

      {/* Booking Modal */}
      {bookingTarget && (
        <BookingModal
          table={bookingTarget}
          onSave={(tableId, booking) => {
            onSaveBooking?.(tableId, booking)
            setBookingTarget(null)
          }}
          onClose={() => {
            setBookingTarget(null)
            onCancelReservingMode?.()
          }}
        />
      )}
    </div>
  )
}
