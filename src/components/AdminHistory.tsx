import { useState, useCallback } from 'react'
import type { HistoryEntry } from '../data/types'
import { CalendarIcon } from './Icons'
import { useT, tr } from '../i18n'

interface AdminHistoryProps {
  history?: HistoryEntry[]
}

const ZONES = ['Все зоны', 'ОСНОВНОЙ ЗАЛ', 'ТЕРРАСА', 'VIP ЗОНА']

export default function AdminHistory({ history = [] }: AdminHistoryProps) {
  const t = useT()
  const statusConfig: Record<string, { label: string; className: string }> = {
    sent: { label: t('Отправлено', 'Yuborilgan'), className: 'hist-status-sent' },
    paid: { label: t('Оплачено', "To'langan"), className: 'hist-status-paid' },
    cancelled: { label: t('Отменено', 'Bekor qilingan'), className: 'hist-status-cancelled' },
  }
  const [search, setSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState('Все зоны')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filtered = history.filter(h => {
    if (zoneFilter !== 'Все зоны' && h.zone !== zoneFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const matchesName = h.tableName.toLowerCase().includes(q)
      const matchesDate = h.timestamp.toLowerCase().includes(q)
      const matchesTotal = h.total.toString().includes(q)
      const matchesStaff = h.createdByName ? h.createdByName.toLowerCase().includes(q) : false
      if (!matchesName && !matchesDate && !matchesTotal && !matchesStaff) return false
    }
    if (dateFrom || dateTo) {
      const parts = h.timestamp.split(' ')[0].split('.')
      if (parts.length === 3) {
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
      }
    }
    return true
  })

  function clearDateFilter() {
    setDateFrom('')
    setDateTo('')
    setShowDatePicker(false)
  }

  const exportExcel = useCallback(() => {
    let table = `<table><thead><tr><th>№</th><th>${tr('Стол', 'Stol')}</th><th>${tr('Имя', 'Ism')}</th><th>${tr('Сумма', 'Summa')}</th><th>${tr('Статус', 'Holat')}</th><th>${tr('Дата и время', 'Sana va vaqt')}</th></tr></thead><tbody>`
    filtered.forEach((h, i) => {
      table += `<tr><td>${i + 1}</td><td>${h.tableName}</td><td>${h.createdByName || '—'}</td><td>${h.total}</td><td>${statusConfig[h.status]?.label || h.status}</td><td>${h.timestamp}</td></tr>`
    })
    table += '</tbody></table>'
    const html = `<html><meta charset="utf-8"><body>${table}</body></html>`
    const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${tr('Istoriya', 'Tarix')}_${new Date().toISOString().slice(0, 10)}.xls`; a.click()
    URL.revokeObjectURL(url)
  }, [filtered, statusConfig])

  const hasDateFilter = dateFrom || dateTo

  return (
    <div className="screen history-screen">
      <div className="screen-header">
        <h1 className="screen-title">{t('История заказов', 'Buyurtmalar tarixi')}</h1>
      </div>

      <div className="history-toolbar">
        <div className="history-toolbar-left">
          <div className="history-date-wrap">
            <div className="history-date-picker" onClick={() => setShowDatePicker(!showDatePicker)}>
              <span className="history-date-label">
                {hasDateFilter ? `${dateFrom || '...'} — ${dateTo || '...'}` : t('Дата', 'Sana')}
              </span>
              <span className="history-date-icon"><CalendarIcon /></span>
            </div>
            {showDatePicker && (
              <div className="history-date-range">
                <div className="hdr-row">
                  <label>{t('с', 'dan')}</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div className="hdr-row">
                  <label>{t('до', 'gacha')}</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
                <button className="hdr-clear" onClick={clearDateFilter}>{t('Сбросить', 'Qaytarish')}</button>
              </div>
            )}
          </div>
          <div className="toolbar-divider" />
          <select className="toolbar-select" value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}>
            {ZONES.map(z => <option key={z} value={z}>{z === 'Все зоны' ? t('Все зоны', 'Barcha zonalar') : z}</option>)}
          </select>
          <button className="hist-export-btn" onClick={exportExcel} title={t('Скачать Excel', 'Excel yuklab olish')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="16" x2="16" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="8" x2="10" y2="8" /></svg>
            Excel
          </button>
        </div>
        <div className="toolbar-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={t('Поиск по столу, дате, сумме или имени...', "Stol, sana, summa yoki ism bo'yicha qidirish...")}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="history-table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>{t('№ заказа', 'Buyurtma raqami')}</th>
              <th>{t('Стол', 'Stol')}</th>
              <th>{t('Имя', 'Ism')}</th>
              <th>{t('Сумма', 'Summa')}</th>
              <th>{t('Статус', 'Holat')}</th>
              <th>{t('Дата и время', 'Sana va vaqt')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, idx) => {
              const config = statusConfig[row.status]
              return (
                <tr key={row.id}>
                  <td className="history-table-cell">#{idx + 1}</td>
                  <td>{row.tableName}</td>
                  <td>{row.createdByName || '—'}</td>
                  <td className="history-total-cell">{row.total.toLocaleString()} {t('сум', "so'm")}</td>
                  <td>
                    <span className={`history-status-badge ${config.className}`}>
                      {config.label}
                    </span>
                  </td>
                  <td>{row.timestamp}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="history-empty">{t('Ничего не найдено', 'Hech narsa topilmadi')}</div>}
      </div>
    </div>
  )
}
