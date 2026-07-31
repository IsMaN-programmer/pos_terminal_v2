import { useState, useMemo } from 'react'
import { CalendarIcon } from './Icons'
import type { HistoryEntry, Table } from '../data/types'

interface AdminDashboardProps {
  history?: HistoryEntry[]
  tables: Table[]
}

const CHART_WIDTH = 460
const CHART_HEIGHT = 200
const CHART_PADDING = { top: 20, right: 20, bottom: 30, left: 40 }

const TIME_LABELS = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00']

const PAYMENT_LABELS: Record<string, { label: string; color: string }> = {
  cash: { label: 'Naqd (Наличные)', color: '#22c55e' },
  card: { label: 'Karta (Карта)', color: '#3b82f6' },
  click: { label: 'Click / Payme', color: '#a855f7' },
}

function smoothLine(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const cx1 = (prev.x + curr.x) / 2
    const cy1 = prev.y
    const cx2 = cx1
    const cy2 = curr.y
    d += ` C${cx1},${cy1} ${cx2},${cy2} ${curr.x},${curr.y}`
  }
  return d
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function parseHistoryTime(ts: string): Date | null {
  const parts = ts.split(' ')
  if (parts.length < 2) return null
  const [datePart, timePart] = parts
  const [d, m, y] = datePart.split('.').map(Number)
  const [hh, mm] = timePart.split(':').map(Number)
  if (!d || !m || !y) return null
  return new Date(y, m - 1, d, hh || 0, mm || 0)
}

function filterByRange(entries: HistoryEntry[], filter: 'today' | 'week' | 'month'): HistoryEntry[] {
  const now = new Date()
  const start = new Date(now)
  if (filter === 'today') {
    start.setHours(0, 0, 0, 0)
  } else if (filter === 'week') {
    const day = start.getDay()
    const diff = day === 0 ? 6 : day - 1
    start.setDate(start.getDate() - diff)
    start.setHours(0, 0, 0, 0)
  } else {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  }
  return entries.filter(h => {
    const d = parseHistoryTime(h.timestamp)
    return d && d >= start && d <= now
  })
}

function getPreviousRange(filter: 'today' | 'week' | 'month'): { start: Date; end: Date } {
  const now = new Date()
  const end = new Date(now)
  const start = new Date(now)
  if (filter === 'today') {
    start.setDate(start.getDate() - 1)
    start.setHours(0, 0, 0, 0)
    end.setDate(end.getDate() - 1)
    end.setHours(23, 59, 59, 999)
  } else if (filter === 'week') {
    const day = start.getDay()
    const diff = day === 0 ? 6 : day - 1
    start.setDate(start.getDate() - diff - 7)
    start.setHours(0, 0, 0, 0)
    end.setDate(end.getDate() - diff - 1)
    end.setHours(23, 59, 59, 999)
  } else {
    start.setMonth(start.getMonth() - 1)
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    end.setDate(0)
    end.setHours(23, 59, 59, 999)
  }
  return { start, end }
}

export default function AdminDashboard({ history = [], tables }: AdminDashboardProps) {
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month'>('today')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [tooltip, setTooltip] = useState<{ x: number; y: number; value: string } | null>(null)

  const paidHistory = useMemo(() => history.filter(h => h.status === 'paid'), [history])

  const filtered = useMemo(() => {
    const preset = filterByRange(paidHistory, dateFilter)
    if (!dateFrom && !dateTo) return preset
    return paidHistory.filter(h => {
      const parts = h.timestamp.split(' ')[0].split('.')
      if (parts.length !== 3) return true
      const d = new Date(+parts[2], +parts[1] - 1, +parts[0])
      if (dateFrom) {
        const fp = dateFrom.split('-')
        const f = new Date(+fp[0], +fp[1] - 1, +fp[2])
        if (d < f) return false
      }
      if (dateTo) {
        const tp = dateTo.split('-')
        const t = new Date(+tp[0], +tp[1] - 1, +tp[2])
        t.setHours(23, 59, 59)
        if (d > t) return false
      }
      return true
    })
  }, [paidHistory, dateFilter, dateFrom, dateTo])

  const prevRange = getPreviousRange(dateFilter)
  const prevEntries = useMemo(() => {
    if (dateFrom || dateTo) return []
    return paidHistory.filter(h => {
      const d = parseHistoryTime(h.timestamp)
      return d && d >= prevRange.start && d <= prevRange.end
    })
  }, [paidHistory, prevRange.start.getTime(), prevRange.end.getTime(), dateFrom, dateTo])

  const stats = useMemo(() => {
    const totalRevenue = filtered.reduce((s, h) => s + h.total, 0)
    const orderCount = filtered.length
    const avgCheck = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0
    return { totalRevenue, orderCount, avgCheck }
  }, [filtered])

  const prevStats = useMemo(() => {
    const totalRevenue = prevEntries.reduce((s, h) => s + h.total, 0)
    const orderCount = prevEntries.length
    const avgCheck = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0
    return { totalRevenue, orderCount, avgCheck }
  }, [prevEntries])

  const activeTables = tables.filter(t => t.status === 'ordered' || t.status === 'occupied' || t.status === 'payment_pending').length
  const totalTables = tables.length

  function calcChange(current: number, previous: number): { text: string; positive: boolean } | null {
    if (previous <= 0) return null
    const diff = ((current - previous) / previous * 100)
    return { text: Math.abs(diff).toFixed(1), positive: diff >= 0 }
  }

  const revenueChange = calcChange(stats.totalRevenue, prevStats.totalRevenue)
  const ordersChange = calcChange(stats.orderCount, prevStats.orderCount)
  const avgChange = calcChange(stats.avgCheck, prevStats.avgCheck)

  const hourlyCount = useMemo(() => {
    const buckets = new Array(24).fill(0)
    filtered.forEach(h => {
      const d = parseHistoryTime(h.timestamp)
      if (d) buckets[d.getHours()]++
    })
    return buckets
  }, [filtered])

  const chartMax = Math.max(...hourlyCount, 1)

  const chartData = useMemo(() => {
    const drawW = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
    const drawH = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
    const stepX = drawW / (hourlyCount.length - 1)
    return hourlyCount.map((val, i) => ({
      x: CHART_PADDING.left + i * stepX,
      y: CHART_PADDING.top + drawH - (val / chartMax) * drawH,
      value: val,
    }))
  }, [hourlyCount, chartMax])

  const linePath = smoothLine(chartData)

  const yTicks = useMemo(() => {
    const drawH = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
    const step = Math.max(1, Math.ceil(chartMax / 4))
    const ticks: number[] = []
    for (let v = 0; v <= chartMax; v += step) ticks.push(v)
    if (ticks[ticks.length - 1] !== chartMax) ticks.push(chartMax)
    return ticks.map(t => ({
      y: CHART_PADDING.top + drawH - (t / chartMax) * drawH,
      label: t.toString(),
    }))
  }, [chartMax])

  const paymentCounts = useMemo(() => {
    const counts: Record<string, number> = { cash: 0, card: 0, click: 0 }
    filtered.forEach(h => {
      if (h.paymentMethod) counts[h.paymentMethod]++
    })
    return counts
  }, [filtered])

  const totalPayments = paymentCounts.cash + paymentCounts.card + paymentCounts.click

  function roundPct(values: number[]): number[] {
    const total = values.reduce((s, v) => s + v, 0)
    const rounded = values.map(v => Math.round((v / total) * 100))
    const diff = 100 - rounded.reduce((s, v) => s + v, 0)
    if (diff !== 0) rounded[rounded.length - 1] += diff
    return rounded
  }

  const donutSegments = useMemo(() => {
    const entries = Object.entries(PAYMENT_LABELS)
    if (totalPayments === 0) {
      const equal = entries.map(() => 1)
      const pcts = roundPct(equal)
      return entries.map(([key, cfg], i) => ({
        key,
        label: cfg.label,
        color: cfg.color,
        percent: pcts[i],
      }))
    }
    const raw = entries.map(([key]) => paymentCounts[key])
    const pcts = roundPct(raw)
    return entries.map(([key, cfg], i) => ({
      key,
      label: cfg.label,
      color: cfg.color,
      percent: pcts[i],
    }))
  }, [paymentCounts, totalPayments])

  function fullCirclePath(cx: number, cy: number, r: number): string {
    const top = polarToCartesian(cx, cy, r, 0)
    const bottom = polarToCartesian(cx, cy, r, 180)
    return `M ${top.x} ${top.y} A ${r} ${r} 0 1 0 ${bottom.x} ${bottom.y} A ${r} ${r} 0 1 0 ${top.x} ${top.y}`
  }

  let cumAngle = 0
  const donutArcs = donutSegments.filter(seg => seg.percent > 0).map(seg => {
    const angle = (seg.percent / 100) * 360
    const start = cumAngle
    const end = cumAngle + angle
    const path = angle >= 360 ? fullCirclePath(100, 100, 80) : describeArc(100, 100, 80, start, end)
    cumAngle = end
    return { ...seg, path }
  })

  return (
    <div className="screen admin-dashboard">
      <div className="screen-header">
        <h1 className="screen-title">Панель управления</h1>
      </div>

      <div className="ad-header-row">
        <span className="ad-stat-label">Статистика</span>
        <div className="ad-header-right">
          <button style={{ marginRight: 0, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, width: 38, height: 38, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }} title="Распечатать статистику">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          </button>
          <div className="history-date-wrap">
            <div className="history-date-picker" onClick={() => setShowDatePicker(!showDatePicker)}>
              <span className="history-date-label">
                {dateFrom || dateTo ? `${dateFrom || '...'} — ${dateTo || '...'}` : 'Дата'}
              </span>
              <span className="history-date-icon"><CalendarIcon /></span>
            </div>
            {showDatePicker && (
              <div className="history-date-range">
                <div className="hdr-row">
                  <label>с</label>
                  <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDateFilter('today') }} />
                </div>
                <div className="hdr-row">
                  <label>до</label>
                  <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setDateFilter('today') }} />
                </div>
                <button className="hdr-clear" onClick={() => { setDateFrom(''); setDateTo(''); setShowDatePicker(false) }}>Сбросить</button>
              </div>
            )}
          </div>
          <div className="ad-date-tabs">
            {(['today', 'week', 'month'] as const).map(tab => (
              <button
                key={tab}
                className={`ad-date-tab${dateFilter === tab ? ' active' : ''}`}
                onClick={() => { setDateFilter(tab); setDateFrom(''); setDateTo('') }}
              >
                {tab === 'today' ? 'Сегодня' : tab === 'week' ? 'Неделя' : 'Месяц'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ad-metrics">
        <div className="ad-metric-card">
          <div className="ad-metric-label">Общая выручка</div>
          <div className="ad-metric-value">{stats.totalRevenue.toLocaleString()} сум</div>
          <div className={`ad-metric-change ${revenueChange ? (revenueChange.positive ? 'positive' : 'negative') : 'neutral'}`}>
            {revenueChange ? `${revenueChange.positive ? '+' : '-'}${revenueChange.text}%` : '—'}
          </div>
        </div>
        <div className="ad-metric-card">
          <div className="ad-metric-label">Кол-во заказов</div>
          <div className="ad-metric-value">{stats.orderCount.toLocaleString()}</div>
          <div className={`ad-metric-change ${ordersChange ? (ordersChange.positive ? 'positive' : 'negative') : 'neutral'}`}>
            {ordersChange ? `${ordersChange.positive ? '+' : '-'}${ordersChange.text}%` : '—'}
          </div>
        </div>
        <div className="ad-metric-card">
          <div className="ad-metric-label">Средний чек</div>
          <div className="ad-metric-value">{stats.avgCheck.toLocaleString()} сум</div>
          <div className={`ad-metric-change ${avgChange ? (avgChange.positive ? 'positive' : 'negative') : 'neutral'}`}>
            {avgChange ? `${avgChange.positive ? '+' : '-'}${avgChange.text}%` : '—'}
          </div>
        </div>
        <div className="ad-metric-card">
          <div className="ad-metric-label">Активные столы</div>
          <div className="ad-metric-value">{activeTables} / {totalTables}</div>
          <div className="ad-metric-change neutral">
            {totalTables > 0 ? Math.round(activeTables / totalTables * 100) : 0}% загрузка зала
          </div>
        </div>
      </div>

      <div className="ad-charts-row">
        <div className="ad-chart-card">
          <div className="ad-chart-title">Динамика продаж</div>
          <div className="ad-chart-body">
            <svg width={CHART_WIDTH} height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </linearGradient>
              </defs>
              {yTicks.map(t => (
                <line key={t.y} x1={CHART_PADDING.left} y1={t.y} x2={CHART_WIDTH - CHART_PADDING.right} y2={t.y} stroke="#e2e8f0" strokeWidth="1" />
              ))}
              {yTicks.map(t => (
                <text key={t.y} x={CHART_PADDING.left - 8} y={t.y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{t.label}</text>
              ))}
              {TIME_LABELS.map((label, i) => {
                const idx = i * 4
                const x = idx < chartData.length ? chartData[idx].x : chartData[chartData.length - 1].x
                return (
                  <text key={label} x={x} y={CHART_HEIGHT - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">{label}</text>
                )
              })}
              <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d={`${linePath} L${chartData[chartData.length - 1].x},${CHART_PADDING.top + CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom} L${chartData[0].x},${CHART_PADDING.top + CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom} Z`} fill="url(#lineGrad)" />
              {chartData.filter((_, i) => i % 4 === 0 || i === chartData.length - 1).map(p => (
                <g key={p.x}>
                  <circle cx={p.x} cy={p.y} r="7" fill="#3b82f6" className="ad-chart-dot" onClick={() => setTooltip(t => t?.x === p.x ? null : { x: p.x, y: p.y - 14, value: p.value.toLocaleString() })} />
                  <circle cx={p.x} cy={p.y} r="14" fill="transparent" className="ad-chart-dot-hit" onClick={() => setTooltip(t => t?.x === p.x ? null : { x: p.x, y: p.y - 14, value: p.value.toLocaleString() })} />
                </g>
              ))}
              {tooltip && (
                <g>
                  <rect x={tooltip.x - 40} y={tooltip.y - 10} width="80" height="24" rx="4" fill="#1e293b" />
                  <text x={tooltip.x} y={tooltip.y + 5} textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="600">{tooltip.value}</text>
                </g>
              )}
            </svg>
          </div>
        </div>

        <div className="ad-chart-card">
          <div className="ad-chart-title">Способы оплаты</div>
          <div className="ad-chart-body ad-donut-body">
            <div className="ad-donut-wrap">
              <svg width="200" height="200" viewBox="0 0 200 200">
                {donutArcs.map(seg => (
                  <path key={seg.label} d={seg.path} fill="none" stroke={seg.color} strokeWidth="36" strokeLinecap="butt" />
                ))}
                <circle cx="100" cy="100" r="62" fill="#ffffff" />
              </svg>
            </div>
            <div className="ad-donut-legend">
              {donutSegments.map(seg => (
                <div key={seg.key} className="ad-donut-legend-item">
                  <span className="ad-donut-dot" style={{ background: seg.color }} />
                  <span className="ad-donut-legend-label">{seg.label}</span>
                  <span className="ad-donut-legend-pct">{seg.percent}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
