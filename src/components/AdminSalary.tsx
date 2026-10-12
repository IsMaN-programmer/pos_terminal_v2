import { useEffect, useMemo, useState } from 'react'
import { dataStore } from '../services/dataStore'
import { CalendarIcon } from './Icons'
import { useT } from '../i18n'

interface StaffRec {
  id: number
  name: string
  role: string
}

export interface SalaryShift {
  cashierName: string
  userId?: number
  openTime: string
  closeTime: string
  sales: number
}

interface SalarySettings {
  mode: 'hourly' | 'percent'
  rate: number
  tax: number
  advance: number
}

const SETTINGS_KEY = 'pos_v2_salary_settings'

function loadStaff(): StaffRec[] {
  try {
    const raw = dataStore.getItem('pos_v2_staff')
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

function loadSettings(): Record<string, SalarySettings> {
  try {
    const raw = dataStore.getItem(SETTINGS_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch { return {} }
}

/** "DD.MM.YYYY HH:MM" -> { day: YYYY-MM-DD, date: Date } or null. */
function parseShiftTime(v: string): { day: string; date: Date } | null {
  const m = (v || '').match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/)
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]))
  if (isNaN(d.getTime())) return null
  return { day: `${m[3]}-${m[2]}-${m[1]}`, date: d }
}

function defaultSettings(): SalarySettings {
  return { mode: 'hourly', rate: 0, tax: 0, advance: 0 }
}

function normalizeSettings(raw: unknown): SalarySettings {
  const base = defaultSettings()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  // Backwards compatible with the previous per-month advances shape.
  const advance = typeof r.advance === 'number' ? r.advance : 0
  return {
    mode: r.mode === 'percent' ? 'percent' : 'hourly',
    rate: typeof r.rate === 'number' ? r.rate : 0,
    tax: typeof r.tax === 'number' ? r.tax : 0,
    advance,
  }
}

const ROLE_LABEL: Record<string, [string, string, string]> = {
  waiter: ['Официант', 'Ofitsiant', 'Waiter'],
  cashier: ['Кассир', 'Kassir', 'Cashier'],
  admin: ['Админ', 'Admin', 'Admin'],
}

export default function AdminSalary({ shiftLog = [] }: { shiftLog?: SalaryShift[] }) {
  const t = useT()
  const [staff, setStaff] = useState<StaffRec[]>(loadStaff)
  const [settings, setSettings] = useState<Record<string, SalarySettings>>(loadSettings)
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

  useEffect(() => dataStore.subscribe('pos_v2_staff', () => setStaff(loadStaff())), [])
  useEffect(() => { dataStore.setItem(SETTINGS_KEY, JSON.stringify(settings)) }, [settings])

  function patch(id: number, p: Partial<SalarySettings>) {
    setSettings(prev => ({ ...prev, [String(id)]: { ...normalizeSettings(prev[String(id)]), ...p } }))
  }

  const workers = useMemo(() => {
    const list = staff.filter(s => s.role !== 'admin')
    return search ? list.filter(s => s.name.toLowerCase().includes(search.toLowerCase())) : list
  }, [staff, search])

  const rows = useMemo(() => {
    return workers.map(w => {
      let hours = 0
      let sales = 0
      for (const s of shiftLog) {
        if (Number(s.userId || 0) !== Number(w.id)) continue
        const open = parseShiftTime(s.openTime)
        if (!open) continue
        if (dateFrom && open.day < dateFrom) continue
        if (dateTo && open.day > dateTo) continue
        const close = parseShiftTime(s.closeTime)
        if (close && close.date.getTime() > open.date.getTime()) {
          hours += (close.date.getTime() - open.date.getTime()) / 3600000
        }
        sales += Number(s.sales) || 0
      }
      hours = Math.round(hours * 100) / 100
      const cfg = normalizeSettings(settings[String(w.id)])
      const accrued = cfg.mode === 'hourly'
        ? Math.round(hours * (Number(cfg.rate) || 0))
        : Math.round(sales * (Number(cfg.rate) || 0) / 100)
      const taxSum = Math.round(accrued * (Number(cfg.tax) || 0) / 100)
      const advance = Number(cfg.advance) || 0
      return { worker: w, hours, sales, cfg, accrued, taxSum, advance, payable: accrued - taxSum - advance }
    })
  }, [workers, shiftLog, settings, dateFrom, dateTo])

  const totalHours = rows.reduce((s, r) => s + r.hours, 0)
  const totalAccrued = rows.reduce((s, r) => s + r.accrued, 0)
  const totalPayable = rows.reduce((s, r) => s + r.payable, 0)

  const roleLabel = (role: string) => {
    const v = ROLE_LABEL[role]
    return v ? t(v[0], v[1], v[2]) : role
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">{t('Зарплаты', 'Maoshlar', 'Salaries')}</h1>
      </div>

      <div className="orders-stats" style={{ marginBottom: 16 }}>
        <div className="orders-stat">
          <span className="orders-stat-value">{Math.round(totalHours * 100) / 100}</span>
          <span className="orders-stat-label">{t('Часов', 'Soatlar', 'Hours')}</span>
        </div>
        <div className="orders-stat">
          <span className="orders-stat-value">{totalAccrued.toLocaleString()}</span>
          <span className="orders-stat-label">{t('Начислено', 'Hisoblangan', 'Accrued')}</span>
        </div>
        <div className="orders-stat">
          <span className="orders-stat-value">{totalPayable.toLocaleString()}</span>
          <span className="orders-stat-label">{t('К выплате', 'Tolanishi kerak', 'Payable')}</span>
        </div>
        <div className="orders-stat">
          <span className="orders-stat-value">{rows.length}</span>
          <span className="orders-stat-label">{t('Сотрудников', 'Xodimlar', 'Employees')}</span>
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
            placeholder={t('Поиск по имени...', 'Ism bo\'yicha qidirish...', 'Search by name...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '16%' }}>{t('Сотрудник', 'Xodim', 'Employee')}</th>
              <th style={{ width: '8%' }}>{t('Часы', 'Soatlar', 'Hours')}</th>
              <th style={{ width: '11%' }}>{t('Продажи', 'Sotuvlar', 'Sales')}</th>
              <th style={{ width: '12%' }}>{t('Схема', 'Sxema', 'Scheme')}</th>
              <th style={{ width: '12%' }}>{t('Ставка', 'Stavka', 'Rate')}</th>
              <th style={{ width: '9%' }}>{t('Налог %', 'Soliq %', 'Tax %')}</th>
              <th style={{ width: '11%' }}>{t('Аванс', 'Avans', 'Advance')}</th>
              <th style={{ width: '11%' }}>{t('К выплате', 'Tolanishi kerak', 'Payable')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.worker.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{r.worker.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{roleLabel(r.worker.role)}</div>
                </td>
                <td>{r.hours}</td>
                <td>{r.sales.toLocaleString()}</td>
                <td>
                  <select
                    className="modal-input"
                    style={{ padding: '8px 10px', fontSize: 13 }}
                    value={r.cfg.mode}
                    onChange={e => patch(r.worker.id, { mode: e.target.value as 'hourly' | 'percent' })}
                  >
                    <option value="hourly">{t('сум/час', 'so‘m/soat', 'per hour')}</option>
                    <option value="percent">{t('% с продаж', 'sotuvdan %', '% of sales')}</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    className="modal-input"
                    style={{ padding: '8px 10px', fontSize: 13 }}
                    value={r.cfg.rate || ''}
                    placeholder="0"
                    min={0}
                    onChange={e => patch(r.worker.id, { rate: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="modal-input"
                    style={{ padding: '8px 10px', fontSize: 13 }}
                    value={r.cfg.tax || ''}
                    placeholder="0"
                    min={0}
                    max={100}
                    onChange={e => patch(r.worker.id, { tax: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="modal-input"
                    style={{ padding: '8px 10px', fontSize: 13 }}
                    value={r.cfg.advance || ''}
                    placeholder="0"
                    min={0}
                    onChange={e => patch(r.worker.id, { advance: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </td>
                <td style={{ fontWeight: 800 }}>{r.payable.toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8' }}>
                  {t('Нет сотрудников. Добавьте их во вкладке «Роли».', 'Xodimlar yo‘q. Ularni «Rollar» bo‘limida qo‘shing.', 'No employees. Add them in the Roles tab.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
