import { useState, useMemo } from 'react'
import { dataStore } from '../services/dataStore'
import type { HistoryEntry } from '../data/types'
import { CalendarIcon } from './Icons'
import { useT } from '../i18n'

interface StockGood {
  name: string
  quantity?: number
  unlimited?: boolean
}

function loadStock(): StockGood[] {
  try {
    const raw = dataStore.getItem('pos_v2_stock_goods')
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

/** History timestamps look like "DD.MM.YYYY HH:MM". Returns YYYY-MM-DD or ''. */
function historyDay(ts: string): string {
  const m = (ts || '').match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (!m) return ''
  return `${m[3]}-${m[2]}-${m[1]}`
}

interface UsageRow {
  name: string
  sold: number
  revenue: number
  stock: number | null
}

export default function AdminUsage({ history = [] }: { history?: HistoryEntry[] }) {
  const t = useT()
  const [search, setSearch] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const hasDateFilter = dateFrom || dateTo

  function clearDateFilter() {
    setDateFrom('')
    setDateTo('')
    setShowDatePicker(false)
  }

  const stock = useMemo(loadStock, [])

  const rows = useMemo<UsageRow[]>(() => {
    const map = new Map<string, { name: string; sold: number; revenue: number }>()
    for (const h of history) {
      if (h.status === 'cancelled') continue
      const day = historyDay(h.timestamp)
      if (!day) continue
      if (dateFrom && day < dateFrom) continue
      if (dateTo && day > dateTo) continue
      for (const it of h.items || []) {
        const key = (it.name || '').toLowerCase()
        if (!key) continue
        const cur = map.get(key) || { name: it.name, sold: 0, revenue: 0 }
        cur.sold += it.quantity || 0
        cur.revenue += it.total || 0
        map.set(key, cur)
      }
    }
    const stockMap = new Map<string, StockGood>()
    for (const g of stock) {
      if (g.name) stockMap.set(g.name.toLowerCase(), g)
    }
    return Array.from(map.values())
      .map(r => {
        const g = stockMap.get(r.name.toLowerCase())
        return { ...r, stock: g && !g.unlimited && g.quantity != null ? g.quantity : null }
      })
      .sort((a, b) => b.revenue - a.revenue)
  }, [history, stock, dateFrom, dateTo])

  const filtered = search
    ? rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : rows

  const totalSold = rows.reduce((s, r) => s + r.sold, 0)
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const lowCount = rows.filter(r => r.stock != null && r.stock <= 5).length

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">{t('Расходы', 'Xisobot', 'Usage')}</h1>
      </div>

      <div className="orders-stats" style={{ marginBottom: 16 }}>
        <div className="orders-stat">
          <span className="orders-stat-value">{totalSold.toLocaleString()}</span>
          <span className="orders-stat-label">{t('Продано (шт)', 'Sotilgan (dona)', 'Sold (pcs)')}</span>
        </div>
        <div className="orders-stat">
          <span className="orders-stat-value">{totalRevenue.toLocaleString()}</span>
          <span className="orders-stat-label">{t('Выручка', 'Tushum', 'Revenue')}</span>
        </div>
        <div className="orders-stat">
          <span className="orders-stat-value">{rows.length}</span>
          <span className="orders-stat-label">{t('Позиций', 'Pozitsiyalar', 'Items')}</span>
        </div>
        <div className="orders-stat">
          <span className="orders-stat-value">{lowCount}</span>
          <span className="orders-stat-label">{t('На исходе', 'Tugamoqda', 'Running low')}</span>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="history-date-wrap">
          <div className="history-date-picker" onClick={() => setShowDatePicker(!showDatePicker)}>
            <span className="history-date-label">
              {hasDateFilter ? `${dateFrom || '...'} — ${dateTo || '...'}` : t('Дата', 'Sana', 'Date')}
            </span>
            <span className="history-date-icon"><CalendarIcon /></span>
          </div>
          {showDatePicker && (
            <div className="history-date-range">
              <div className="hdr-row">
                <label>{t('с', 'dan', 'from')}</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className="hdr-row">
                <label>{t('до', 'gacha', 'to')}</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
              <button className="hdr-clear" onClick={clearDateFilter}>{t('Сбросить', 'Qaytarish', 'Reset')}</button>
            </div>
          )}
        </div>
        <div className="admin-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="admin-search-input"
            type="text"
            placeholder={t('Поиск по названию...', 'Nomi bo\'yicha qidirish...', 'Search by name...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '6%' }}>№</th>
              <th style={{ width: '40%' }}>{t('Товар / Блюдо', 'Mahsulot / Taom', 'Product / Dish')}</th>
              <th style={{ width: '16%' }}>{t('Продано', 'Sotilgan', 'Sold')}</th>
              <th style={{ width: '19%' }}>{t('Выручка', 'Tushum', 'Revenue')}</th>
              <th style={{ width: '19%' }}>{t('Осталось', 'Qoldi', 'Left')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => (
              <tr key={r.name}>
                <td>{idx + 1}</td>
                <td className="ab-table-name">{r.name}</td>
                <td>{r.sold.toLocaleString()}</td>
                <td>{r.revenue.toLocaleString()}</td>
                <td>{r.stock == null ? '—' : r.stock.toLocaleString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8' }}>
                  {t('Нет данных за выбранный период', 'Tanlangan davrda ma\'lumot yo\'q', 'No data for the selected period')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
