import { useState, useMemo } from 'react'
import type { Table, TableStatus } from '../data/types'
import { TableIcon } from './Icons'

const CATEGORIES_KEY = 'pos_v2_zone_categories'
const ZONE_CATEGORY_KEY = 'pos_v2_zone_category_map'

function loadCategories(): string[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY)
    return raw ? JSON.parse(raw) : ['Основная зона']
  } catch { return ['Основная зона'] }
}

function loadZoneCategory(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ZONE_CATEGORY_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

const STATUS_LABELS: Record<string, string> = {
  free: 'Свободен',
  occupied: 'Занят',
  ordered: 'Есть заказ',
  payment_pending: 'Ожидает оплаты',
  reserved: 'Бронь',
}

const STATUS_CLASSES: Record<string, string> = {
  free: 'table-free',
  occupied: 'table-occupied',
  ordered: 'table-ordered',
  payment_pending: 'table-payment',
  reserved: 'table-reserved',
}

type BookingMode = 'reserve' | 'unreserve' | null

interface TableMapProps {
  tables: Table[]
  onSelectTable: (table: Table) => void
  onUpdateStatus: (tableId: number, status: TableStatus) => void
}

export default function TableMap({ tables, onSelectTable, onUpdateStatus }: TableMapProps) {
  const [categoryFilter, setCategoryFilter] = useState('Все зоны')
  const [zoneFilter, setZoneFilter] = useState('Все зоны')
  const [search, setSearch] = useState('')
  const [bookingMode, setBookingMode] = useState<BookingMode>(null)

  const allCategories = useMemo(() => loadCategories(), [tables])
  const zoneCategory = useMemo(() => loadZoneCategory(), [tables])

  const zones = [...new Set(tables.map(t => t.zone))]

  const zonesInCategory = useMemo(() => {
    if (categoryFilter === 'Все зоны') return zones
    return zones.filter(z => (zoneCategory[z] || 'Основная зона') === categoryFilter)
  }, [categoryFilter, zones, zoneCategory])

  const filtered = tables.filter(t => {
    const matchCategory = categoryFilter === 'Все зоны' || (zoneCategory[t.zone] || 'Основная зона') === categoryFilter
    const matchZone = zoneFilter === 'Все зоны' || t.zone === zoneFilter
    const matchSearch = !search
      || t.name.toLowerCase().includes(search.toLowerCase())
      || t.zone.toLowerCase().includes(search.toLowerCase())
    return matchCategory && matchZone && matchSearch
  })

  const grouped = zonesInCategory.reduce<Record<string, Table[]>>((acc, zone) => {
    acc[zone] = filtered.filter(t => t.zone === zone)
    return acc
  }, {})

  function handleTableClick(table: Table) {
    if (bookingMode === 'reserve' && table.status === 'free') {
      onUpdateStatus(table.id, 'reserved')
      setBookingMode(null)
      return
    }
    if (bookingMode === 'unreserve' && table.status === 'reserved') {
      onUpdateStatus(table.id, 'free')
      setBookingMode(null)
      return
    }
    onSelectTable(table)
  }

  return (
    <div className="screen table-map-screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <TableIcon />
          Карта столов
        </h1>
      </div>

      <div className="table-map-toolbar">
        <div className="toolbar-filters">
          <select className="toolbar-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option>Все зоны</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="toolbar-select" value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}>
            <option>Все зоны</option>
            {zonesInCategory.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div className="toolbar-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Поиск стола или зоны..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="table-map-booking-bar">
        <button
          className={`booking-btn booking-btn-reserve${bookingMode === 'reserve' ? ' active' : ''}`}
          onClick={() => setBookingMode(bookingMode === 'reserve' ? null : 'reserve')}
        >
          Забронировать
        </button>
        <button
          className={`booking-btn booking-btn-unreserve${bookingMode === 'unreserve' ? ' active' : ''}`}
          onClick={() => setBookingMode(bookingMode === 'unreserve' ? null : 'unreserve')}
        >
          Отменить Бронь
        </button>
      </div>

      <div className="table-map-content">
        {Object.entries(grouped).map(([zone, zoneTables]) => (
          zoneTables.length > 0 && (
            <div key={zone} className="table-zone">
              <h2 className="zone-title">{zone}</h2>
              <div className="table-grid">
                {zoneTables.map(table => {
                  const isReservable = bookingMode === 'reserve' && table.status === 'free'
                  const isUnreservable = bookingMode === 'unreserve' && table.status === 'reserved'
                  const highlightClass = isReservable ? ' table-highlight-reserve' : isUnreservable ? ' table-highlight-unreserve' : ''
                  return (
                    <button
                      key={table.id}
                      className={`table-card ${STATUS_CLASSES[table.status]}${highlightClass}`}
                      onClick={() => handleTableClick(table)}
                    >
                      <span className="table-number">{table.name}</span>
                      <span className="table-status-label">{STATUS_LABELS[table.status]}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        ))}
      </div>

      <div className="table-map-legend">
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <div key={key} className="legend-item">
            <span className={`legend-dot ${STATUS_CLASSES[key]}`} />
            <span className="legend-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
