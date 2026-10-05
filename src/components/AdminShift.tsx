import { useState, useEffect } from 'react'
import type { HistoryEntry } from '../data/types'
import { dataStore } from '../services/dataStore'
import { useT } from '../i18n'
import { CalendarIcon } from './Icons'
import { SHIFT_LOG_KEY, syncCabinetShifts, receiptShiftNumber, type ShiftCabinetStatus } from '../services/shiftSync'

export interface ShiftLogEntry {
  id?: string
  number: number
  receiptShiftNumber?: string
  cashierName: string
  userId?: number
  openTime: string
  closeTime: string
  sales: number
  served: number
  cabinetStatus?: ShiftCabinetStatus
  cabinetError?: string
  cabinetSyncedAt?: string
}

interface AdminShiftProps {
  history?: HistoryEntry[]
  onShowShiftChecks?: (shift: ShiftLogEntry) => void
}

const PAGE_SIZE = 8

function loadShiftLog(): ShiftLogEntry[] {
  try { return JSON.parse(dataStore.getItem(SHIFT_LOG_KEY) || '[]') } catch { return [] }
}

const VAT_PERCENT = 12

function entryQqs(e: HistoryEntry): number {
  const service = Math.round(e.total * (e.servicePercent || 0) / 100)
  const disc = e.discountType === 'percent'
    ? Math.round(e.total * (e.discountPercent || 0) / 100)
    : (e.discountAmount || 0)
  return Math.round((e.total + service - disc) * VAT_PERCENT / 100)
}

function entryItogo(e: HistoryEntry): number {
  const service = Math.round(e.total * (e.servicePercent || 0) / 100)
  const disc = e.discountType === 'percent'
    ? Math.round(e.total * (e.discountPercent || 0) / 100)
    : (e.discountAmount || 0)
  return e.total + service - disc
}

function entryCash(e: HistoryEntry): number {
  if (e.cashPaymentSum != null) return Math.max(0, e.cashPaymentSum)
  if (e.paymentMethod === 'cash') return entryItogo(e)
  return 0
}

function shiftChecksFor(history: HistoryEntry[], shift: ShiftLogEntry): HistoryEntry[] {
  const num = receiptShiftNumber(shift)
  return history.filter(e => e.shiftNumber === num && e.createdByName === shift.cashierName && e.status === 'paid')
}

function shiftVatFor(history: HistoryEntry[], shift: ShiftLogEntry): number {
  const checks = shiftChecksFor(history, shift)
  if (checks.length === 0) return Math.round(shift.sales * VAT_PERCENT / 100)
  return checks.reduce((s, e) => s + entryQqs(e), 0)
}

function shiftCashFor(history: HistoryEntry[], shift: ShiftLogEntry): number {
  return shiftChecksFor(history, shift).reduce((s, e) => s + entryCash(e), 0)
}

function shiftTotalFor(history: HistoryEntry[], shift: ShiftLogEntry): number {
  const checks = shiftChecksFor(history, shift)
  if (checks.length === 0) return shift.sales || 0
  return checks.reduce((s, e) => s + entryItogo(e), 0)
}

export default function AdminShift({ history = [], onShowShiftChecks }: AdminShiftProps) {
  const t = useT()
  const [log, setLog] = useState<ShiftLogEntry[]>(loadShiftLog)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  async function syncShifts() {
    if (syncing) return
    setSyncing(true)
    try {
      const result = await syncCabinetShifts(history)
      if (result.failed > 0) {
        showToast(t(`Отправлено: ${result.sent}, ошибок: ${result.failed}`, `Yuborildi: ${result.sent}, xatolar: ${result.failed}`, `Sent: ${result.sent}, errors: ${result.failed}`))
      } else if (result.sent > 0) {
        showToast(t(`Отправлено смен: ${result.sent}`, `Yuborilgan smenalar: ${result.sent}`, `Shifts sent: ${result.sent}`))
      } else {
        showToast(t('Все смены уже синхронизированы', 'Barcha smenalar sinxronlangan', 'All shifts already synchronized'))
      }
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    const unsub = dataStore.subscribe(SHIFT_LOG_KEY, () => setLog(loadShiftLog()))
    return unsub
  }, [])

  const sorted = [...log].sort((a, b) => b.number - a.number)

  const filtered = sorted.filter(s => {
    if (search) {
      const q = search.toLowerCase()
      const matchesName = (s.cashierName || '').toLowerCase().includes(q)
      const matchesSum = shiftTotalFor(history, s).toString().includes(q)
      if (!matchesName && !matchesSum) return false
    }
    if (dateFrom || dateTo) {
      const src = (s.openTime && s.openTime !== '—' ? s.openTime : s.closeTime) || ''
      const parts = src.split(' ')[0].split('.')
      if (parts.length === 3) {
        const d = new Date(+parts[2], +parts[1] - 1, +parts[0])
        if (dateFrom) {
          const fp = dateFrom.split('-')
          const f = new Date(+fp[0], +fp[1] - 1, +fp[2])
          if (d < f) return false
        }
        if (dateTo) {
          const tp = dateTo.split('-')
          const t2 = new Date(+tp[0], +tp[1] - 1, +tp[2])
          t2.setHours(23, 59, 59)
          if (d > t2) return false
        }
      }
    }
    return true
  })

  const hasDateFilter = dateFrom || dateTo
  function clearDateFilter() {
    setDateFrom('')
    setDateTo('')
    setShowDatePicker(false)
  }

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1
  const [currentPage, setCurrentPage] = useState(1)
  const [showPageMenu, setShowPageMenu] = useState(false)
  const start = (currentPage - 1) * PAGE_SIZE
  const paginated = filtered.slice(start, start + PAGE_SIZE)

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1)
  }, [filtered.length, currentPage, totalPages])

  useEffect(() => {
    if (!showPageMenu) return
    function handleClick() { setShowPageMenu(false) }
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => { clearTimeout(timer); document.removeEventListener('click', handleClick) }
  }, [showPageMenu])

  const hiddenPages: number[] = []
  for (let i = 6; i < totalPages; i++) hiddenPages.push(i)

  function getPageNumbers(): (number | 'ellipsis')[] {
    if (totalPages <= 6) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages]
  }

  return (
    <div className="screen history-screen">
      <div className="screen-header">
        <h1 className="screen-title">{t('Смена', 'Smena', 'Shift')}</h1>
      </div>

      <div className="history-toolbar">
        <div className="history-toolbar-left">
          <div className="history-date-wrap">
            <div className="history-date-picker" onClick={() => setShowDatePicker(!showDatePicker)}>
              <span className="history-date-label">
                {hasDateFilter ? `${dateFrom || '...'} — ${dateTo || '...'}` : t('Дата', 'Sana', 'Date')}
              </span>
              <span className="history-date-icon"><CalendarIcon /></span>
            </div>
            {showDatePicker && (
              <div className="history-date-range">
                <div className="hdr-row"><label>{t('с', 'dan', 'from')}</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
                <div className="hdr-row"><label>{t('до', 'gacha', 'to')}</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
                <button className="hdr-clear" onClick={clearDateFilter}>{t('Сбросить', 'Tozalash', 'Reset')}</button>
              </div>
            )}
          </div>
          <button className="at-action-btn at-action-sync" disabled={syncing} onClick={syncShifts}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {syncing ? t('Синхронизация...', 'Sinxronlash...', 'Syncing...') : t('Синхронизация', 'Sinxronlash', 'Synchronization')}
          </button>
        </div>
        <div className="toolbar-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder={t('Поиск по кассиру или сумме...', 'Kassir yoki summa bo\'yicha qidirish...', 'Search by cashier or amount...')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="orders-layout history-layout">
        <div className="history-layout-content">
      <div className="history-table-wrap">
        <table className="ar-table">
          <thead>
            <tr>
              <th>{t('№', '№', '#')}</th>
              <th>{t('Кассир', 'Kassir', 'Cashier')}</th>
              <th style={{ paddingLeft: 48 }}>{t('Время открытия', 'Ochilish vaqti', 'Opening time')}</th>
              <th style={{ paddingLeft: 12 }}>{t('Время закрытия', 'Yopilish vaqti', 'Closing time')}</th>
              <th>{t('В кассе', 'Kassada', 'In cash drawer')}</th>
              <th>{t('НДС', 'QQS', 'VAT')}</th>
              <th>{t('Итого', 'Jami', 'Total')}</th>
              <th>{t('Синхронизация', 'Sinxronlash', 'Synchronization')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(shift => (
              <tr key={shift.number}>
                <td>#{shift.number}</td>
                <td className="ar-table-name">{shift.cashierName || '—'}</td>
                <td style={{ paddingLeft: 48 }}>{shift.openTime}</td>
                <td style={{ paddingLeft: 12 }}>{shift.closeTime}</td>
                <td>{shiftCashFor(history, shift).toLocaleString()} {t('сум', 'so\'m', 'sum')}</td>
                <td>{shiftVatFor(history, shift).toLocaleString()} {t('сум', 'so\'m', 'sum')}</td>
                <td className="history-total-cell">{shiftTotalFor(history, shift).toLocaleString()} {t('сум', 'so\'m', 'sum')}</td>
                <td>
                  <span className={`history-status-badge ${shift.cabinetStatus === 'synced' ? 'hist-status-sent' : shift.cabinetStatus === 'failed' ? 'hist-status-cancelled' : 'hist-status-paid'}`} title={shift.cabinetError || ''}>
                    {shift.cabinetStatus === 'synced' ? t('Отправлено', 'Yuborilgan', 'Sent') : shift.cabinetStatus === 'failed' ? t('Ошибка', 'Xato', 'Error') : t('Ожидает', 'Kutilmoqda', 'Pending')}
                  </span>
                </td>
                <td>
                  <button className="ar-add-btn" style={{ padding: '8px 20px' }} onClick={() => onShowShiftChecks?.(shift)}>
                    {t('Детали', 'Tafsilotlar', 'Details')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {paginated.length === 0 && (
          <div className="ar-empty">{log.length === 0 ? t('Смены еще не закрывались', 'Smenalar hali yopilmagan', 'No shifts have been closed yet') : t('Ничего не найдено', 'Hech narsa topilmadi', 'Nothing found')}</div>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="history-pagination">
          <span className="history-pagination-info">
            {start + 1}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} {t('из', 'dan', 'of')} {filtered.length}
          </span>
          <div className="history-pagination-btns">
            <button className="page-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>‹</button>
            {getPageNumbers().map((p, i) =>
              p === 'ellipsis' ? (
                <div key={'e' + i} className="page-ellipsis-wrap">
                  <button className="page-btn page-btn-ellipsis" onClick={() => setShowPageMenu(o => !o)}>…</button>
                  {showPageMenu && (
                    <div className="page-menu">
                      {hiddenPages.map(hp => (
                        <button key={hp} className={`page-menu-item${hp === currentPage ? ' active' : ''}`} onClick={() => { setCurrentPage(hp); setShowPageMenu(false) }}>{hp}</button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button key={p} className={`page-btn${p === currentPage ? ' active' : ''}`} onClick={() => setCurrentPage(p)}>{p}</button>
              )
            )}
            <button className="page-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>›</button>
          </div>
        </div>
      )}
        </div>
      </div>
      {toast && <div className="toast-overlay"><div className="toast-msg">{toast}</div></div>}
    </div>
  )
}
