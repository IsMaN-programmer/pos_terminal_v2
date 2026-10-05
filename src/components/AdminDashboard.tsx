import { useState, useMemo } from 'react'
import { dataStore } from '../services/dataStore'
import { CalendarIcon } from './Icons'
import type { HistoryEntry, Table } from '../data/types'
import { useT } from '../i18n'

interface AdminDashboardProps {
  history?: HistoryEntry[]
  tables: Table[]
  tableOrders?: Record<number, { items: { total: number }[]; guestCount?: number }>
}

const CATEGORIES_KEY = 'pos_v2_zone_categories'
const ZONE_CATEGORY_KEY = 'pos_v2_zone_category_map'

function parseHistoryTime(ts: string): Date | null {
  const parts = ts.split(' ')
  if (parts.length < 2) return null
  const [datePart, timePart] = parts
  const [d, m, y] = datePart.split('.').map(Number)
  const [hh, mm] = timePart.split(':').map(Number)
  if (!d || !m || !y) return null
  return new Date(y, m - 1, d, hh || 0, mm || 0)
}

export default function AdminDashboard({ history = [], tables, tableOrders = {} }: AdminDashboardProps) {
  const t = useT()
  const paymentLabels: Record<string, { label: string; color: string }> = {
    cash: { label: t('Наличные', 'Naqd', 'Cash'), color: '#22c55e' },
    card: { label: t('Карта', 'Karta', 'Card'), color: '#3b82f6' },
    click: { label: t('Другое', 'Boshqa', 'Other'), color: '#a855f7' },
  }
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const paidHistory = useMemo(() => history.filter(h => h.status === 'paid'), [history])
  const cancelledHistory = useMemo(() => history.filter(h => h.status === 'cancelled'), [history])

  const filtered = useMemo(() => {
    const today = new Date()
    const start = dateFrom
      ? new Date(+dateFrom.split('-')[0], +dateFrom.split('-')[1] - 1, +dateFrom.split('-')[2])
      : new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const end = dateTo
      ? (() => { const t = new Date(+dateTo.split('-')[0], +dateTo.split('-')[1] - 1, +dateTo.split('-')[2]); t.setHours(23, 59, 59); return t })()
      : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
    return paidHistory.filter(h => {
      const parts = h.timestamp.split(' ')[0].split('.')
      if (parts.length !== 3) return true
      const d = new Date(+parts[2], +parts[1] - 1, +parts[0])
      if (d < start) return false
      if (d > end) return false
      return true
    })
  }, [paidHistory, dateFrom, dateTo])

  const cancelledToday = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return cancelledHistory.filter(h => {
      const d = parseHistoryTime(h.timestamp)
      return d && d >= start
    })
  }, [cancelledHistory])

  const activeOrderTables = tables.filter(t => t.status === 'ordered' || t.status === 'occupied' || t.status === 'payment_pending')
  const ordersCount = activeOrderTables.length
  const orderSumFor = (tableId: number) => {
    const o = tableOrders[tableId]
    return o ? o.items.reduce((s, i) => s + i.total, 0) : 0
  }
  const ordersSum = activeOrderTables.reduce((s, t) => s + orderSumFor(t.id), 0)
  const guestsCount = activeOrderTables.reduce((s, t) => s + (tableOrders[t.id]?.guestCount || 0), 0)

  const cancelledCount = cancelledToday.length
  const cancelledSum = cancelledToday.reduce((s, h) => s + h.total, 0)

  const activeTables = activeOrderTables.length
  const totalTables = tables.length
  const freeTablesCount = tables.filter(t => t.status === 'free').length

  const zoneCategories = useMemo(() => {
    try {
      const raw = dataStore.getItem(CATEGORIES_KEY)
      return raw ? JSON.parse(raw) : ['Основная зона']
    } catch { return ['Основная зона'] }
  }, [tables])

  const zoneCategoryMap = useMemo(() => {
    try {
      const raw = dataStore.getItem(ZONE_CATEGORY_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  }, [tables])

  const zoneGroups = useMemo(() => {
    const map: Record<string, { zone: string; active: number; total: number; sum: number }[]> = {}
    const zones = [...new Set(tables.map(t => t.zone))]
    zones.forEach(zone => {
      const cat = zoneCategoryMap[zone] || 'Основная зона'
      if (!map[cat]) map[cat] = []
      const zoneTables = tables.filter(t => t.zone === zone)
      const act = zoneTables.filter(t => t.status === 'ordered' || t.status === 'occupied' || t.status === 'payment_pending')
      map[cat].push({
        zone,
        active: act.length,
        total: zoneTables.length,
        sum: act.reduce((s, t) => {
          const o = tableOrders[t.id]
          return s + (o ? o.items.reduce((si, i) => si + i.total, 0) : 0)
        }, 0),
      })
    })
    return map
  }, [tables, zoneCategoryMap, tableOrders])

  const displayedCategories = useMemo(() => {
    const cats = [...zoneCategories]
    Object.keys(zoneGroups).forEach(c => { if (!cats.includes(c)) cats.push(c) })
    return cats
  }, [zoneCategories, zoneGroups])

  const paymentStats = useMemo(() => {
    const stats: Record<string, { count: number; sum: number }> = {
      cash: { count: 0, sum: 0 },
      card: { count: 0, sum: 0 },
      click: { count: 0, sum: 0 },
    }
    filtered.forEach(h => {
      if (h.paymentMethod && stats[h.paymentMethod]) {
        stats[h.paymentMethod].count++
        stats[h.paymentMethod].sum += h.total
      }
    })
    return stats
  }, [filtered])

  const totalPaymentSum = paymentStats.cash.sum + paymentStats.card.sum + paymentStats.click.sum

  return (
    <div className="screen admin-dashboard">
      <div className="screen-header">
        <h1 className="screen-title">{t('Панель управления', 'Boshqaruv paneli', 'Dashboard')}</h1>
      </div>

      <div className="ad-metrics">
        <div className="ad-metric-card">
          <div className="ad-metric-label">{t('Заказы', 'Buyurtmalar', 'Orders')}</div>
          <div className="ad-metric-value">{ordersCount.toLocaleString()}</div>
          <div className="ad-metric-change neutral">
            {guestsCount} {t('гостей', 'mehmon', 'guests')}
          </div>
        </div>
        <div className="ad-metric-card">
          <div className="ad-metric-label">{t('Сумма заказов', 'Buyurtmalar summasi', 'Order total')}</div>
          <div className="ad-metric-value">{ordersSum.toLocaleString()} {t('сум', 'so\'m', 'sum')}</div>
          <div className="ad-metric-change neutral">
            {t(`на ${ordersCount} столах`, `${ordersCount} ta stolda`, `on ${ordersCount} tables`)}
          </div>
        </div>
        <div className="ad-metric-card">
          <div className="ad-metric-label">{t('Отмены', 'Bekor qilinganlar', 'Cancellations')}</div>
          <div className="ad-metric-value">{cancelledCount.toLocaleString()}</div>
          <div className={`ad-metric-change ${cancelledSum > 0 ? 'negative' : 'positive'}`}>
            {cancelledSum.toLocaleString()} {t('сум', 'so\'m', 'sum')}
          </div>
        </div>
        <div className="ad-metric-card">
          <div className="ad-metric-label">{t('Активные столы', 'Faol stollar', 'Active tables')}</div>
          <div className="ad-metric-value">{activeTables} / {totalTables}</div>
          <div className="ad-metric-change neutral">
            {totalTables > 0 ? Math.round(activeTables / totalTables * 100) : 0}% {t('загрузка зала', 'zal bandligi', 'hall occupancy')}
          </div>
        </div>
      </div>

      <div className="ad-charts-row">
        <div className="ad-chart-card">
          <div className="ad-chart-title">{t('Активные столы по зонам', 'Zonalar bo\'yicha faol stollar', 'Active tables by zones')}</div>
          <div className="ad-zone-groups">
            {displayedCategories.map(cat => {
              const rows = zoneGroups[cat]
              if (!rows || rows.length === 0) return null
              return (
                <div key={cat} className="ad-zone-group">
                  <div className="ad-zone-group-title">{cat === 'Основная зона' ? t('Основная зона', 'Asosiy zona', 'Main hall') : cat}</div>
                  {rows.map(row => {
                    const pct = row.total > 0 ? Math.round(row.active / row.total * 100) : 0
                    return (
                      <div key={row.zone} className="ad-zone-row">
                        <div className="ad-zone-head">
                          <span className="ad-zone-name">{row.zone}</span>
                          <span className="ad-zone-count">{row.active} / {row.total}</span>
                        </div>
                        <div className="ad-zone-bar">
                          <div className="ad-zone-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="ad-zone-sum">{row.sum.toLocaleString()} {t('сум', 'so\'m', 'sum')}</div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {displayedCategories.length === 0 && (
              <div className="ad-zone-empty">{t('Нет столов', 'Stollar yo\'q', 'No tables')}</div>
            )}
          </div>
          <div className="ad-pay-total">
            <span>{t('Свободно', 'Bo\'sh', 'Free')}:</span>
            <span>{freeTablesCount}</span>
          </div>
        </div>

        <div className="ad-chart-card">
          <div className="ad-pay-head">
            <div className="ad-chart-title">{t('Выручка за смену', 'Smena tushumi', 'Shift revenue')}</div>
            <div className="history-date-wrap">
              <button
                className={`ad-pay-date-btn${dateFrom || dateTo ? ' active' : ''}`}
                title={t('Выбрать даты', 'Sanalarni tanlash', 'Select dates')}
                onClick={() => setShowDatePicker(!showDatePicker)}
              >
                <CalendarIcon />
              </button>
              {showDatePicker && (
                <div className="history-date-range ad-pay-date-range">
                  <div className="hdr-row">
                    <label>{t('с', 'dan', 'from')}</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </div>
                  <div className="hdr-row">
                    <label>{t('до', 'gacha', 'to')}</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                  <button className="hdr-clear" onClick={() => { setDateFrom(''); setDateTo(''); setShowDatePicker(false) }}>{t('Сбросить', 'Qaytarish', 'Reset')}</button>
                </div>
              )}
            </div>
          </div>
          <div className="ad-zone-groups">
            <div className="ad-zone-group">
              {Object.entries(paymentLabels).map(([key, cfg]) => {
                const st = paymentStats[key]
                const pct = totalPaymentSum > 0 ? Math.round(st.sum / totalPaymentSum * 100) : 0
                return (
                  <div key={key} className="ad-zone-row">
                    <div className="ad-zone-head">
                      <span className="ad-zone-name">
                        <span className="ad-pay-dot" style={{ background: cfg.color }} />
                        {cfg.label}
                      </span>
                      <span className="ad-zone-count">{pct}%</span>
                    </div>
                    <div className="ad-zone-bar">
                      <div className="ad-zone-bar-fill" style={{ width: `${pct}%`, background: cfg.color }} />
                    </div>
                    <div className="ad-zone-sum">{st.sum.toLocaleString()} {t('сум', 'so\'m', 'sum')}</div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="ad-pay-total">
            <span>{t('Итого', 'Jami', 'Total')}:</span>
            <span>{totalPaymentSum.toLocaleString()} {t('сум', 'so\'m', 'sum')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
