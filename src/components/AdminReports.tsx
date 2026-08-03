import { useState, useCallback } from 'react'
import type { HistoryEntry } from '../data/types'
import { CalendarIcon } from './Icons'
import { runFullOfdSync } from '../services/fiscalDriveApi'

interface AdminReportsProps {
  history?: HistoryEntry[]
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  sent: { label: 'Отправлено', className: 'hist-status-sent' },
  paid: { label: 'Оплачено', className: 'hist-status-paid' },
  cancelled: { label: 'Отменено', className: 'hist-status-cancelled' },
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Наличные',
  card: 'Терминал',
  click: 'Click/Payme',
  split: 'Разделение',
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  sent: 'Avans-check',
  paid: 'Фискальный чек',
  cancelled: 'Отменено',
}

interface ApiReceiptItem {
  id: number
  productName: string
  salePrice: number
  saleCount: number
  totalPrice: number
  vatSum: number
  mxikCode: string
}

export default function AdminReports({ history = [] }: AdminReportsProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [detailEntry, setDetailEntry] = useState<HistoryEntry | null>(null)
  const [detailItems, setDetailItems] = useState<ApiReceiptItem[] | null>(null)
  const [detailFiscal, setDetailFiscal] = useState<{ terminalId: string; fiscalSign: string; qrCodeUrl: string; ofdStatus?: string; factoryId?: string } | null>(null)
  const [ofdChecking, setOfdChecking] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }, [])
  const [loading, setLoading] = useState(false)

  const fetchDetail = useCallback(async (entry: HistoryEntry) => {
    setLoading(true)
    setDetailItems(null)
    setDetailFiscal(null)
    setDetailEntry(entry)
    if (entry.terminalId || entry.fiscalSign) {
      setDetailFiscal({ terminalId: entry.terminalId || '', fiscalSign: entry.fiscalSign || '', qrCodeUrl: entry.qrCodeUrl || '', ofdStatus: entry.ofdStatus || 'pending', factoryId: entry.factoryId || '' })
    }
    setLoading(false)
  }, [])

  const reportsHistory = history.filter(h => h.status === 'paid' || h.status === 'cancelled')

  const filtered = reportsHistory.filter(h => {
    if (typeFilter !== 'all' && h.paymentMethod !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const matchesCashier = h.createdByName ? h.createdByName.toLowerCase().includes(q) : false
      if (!matchesCashier && !h.timestamp.toLowerCase().includes(q) && !h.total.toString().includes(q)) return false
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

  const hasDateFilter = dateFrom || dateTo

  const exportExcel = useCallback(() => {
    let table = '<table><thead><tr><th>№</th><th>Кассир</th><th>Тип оплаты</th><th>Тип заказа</th><th>Сумма</th><th>Статус</th><th>Дата и время</th></tr></thead><tbody>'
    filtered.forEach((h, i) => {
      table += `<tr><td>${i + 1}</td><td>${h.createdByName || h.createdByRole || '—'}</td><td>${PAYMENT_LABELS[h.paymentMethod || ''] || '—'}</td><td>${ORDER_TYPE_LABELS[h.status] || h.status}</td><td>${h.total}</td><td>${STATUS_CONFIG[h.status]?.label || h.status}</td><td>${h.timestamp}</td></tr>`
    })
    table += '</tbody></table>'
    const html = `<html><meta charset="utf-8"><body>${table}</body></html>`
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `Chek_tarixi_${new Date().toISOString().slice(0, 10)}.xls`; a.click()
    URL.revokeObjectURL(url)
  }, [filtered])

  return (
    <div className="screen history-screen">
      <div className="screen-header">
        <h1 className="screen-title">Отчеты</h1>
      </div>

      <div className="history-toolbar">
        <div className="history-toolbar-left">
          <div className="history-date-wrap">
            <div className="history-date-picker" onClick={() => setShowDatePicker(!showDatePicker)}>
              <span className="history-date-label">{hasDateFilter ? `${dateFrom || '...'} — ${dateTo || '...'}` : 'Дата'}</span>
              <span className="history-date-icon"><CalendarIcon /></span>
            </div>
            {showDatePicker && (
              <div className="history-date-range">
                <div className="hdr-row"><label>с</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
                <div className="hdr-row"><label>до</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
                <button className="hdr-clear" onClick={clearDateFilter}>Сбросить</button>
              </div>
            )}
          </div>
          <div className="toolbar-divider" />
          <select className="toolbar-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">Все типы</option>
            <option value="cash">Наличные</option>
            <option value="card">Терминал</option>
            <option value="click">Click/Payme</option>
            <option value="split">Разделение</option>
          </select>
        </div>
        <div className="toolbar-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder="Поиск по кассиру, дате или сумме..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="hist-export-btn" onClick={exportExcel} title="Скачать Excel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="16" x2="16" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="8" x2="10" y2="8" /></svg>
          Excel
        </button>
      </div>

      <div className="history-table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Кассир</th>
              <th>Тип оплаты</th>
              <th>Тип заказа</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Дата и время</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, idx) => {
              const config = STATUS_CONFIG[row.status]
              return (
                <tr key={row.id}>
                  <td>#{idx + 1}</td>
                  <td>{row.createdByName || row.createdByRole || '—'}</td>
                  <td><span className="hist-payment-badge">{PAYMENT_LABELS[row.paymentMethod || ''] || '—'}</span></td>
                  <td><span className="hist-order-type">{ORDER_TYPE_LABELS[row.status] || row.status}</span></td>
                  <td className="history-total-cell">{row.total.toLocaleString()} сум</td>
                  <td><span className={`history-status-badge ${config.className}`}>{config.label}</span></td>
                  <td>{row.timestamp}</td>
                  <td><button className="hist-details-btn" onClick={() => { fetchDetail(row) }}>Детали</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="history-empty">Чеки не найдены</div>}
      </div>

      {detailEntry && (
        <div className="modal-overlay" onClick={() => { setDetailEntry(null); setDetailItems(null); setDetailFiscal(null) }}>
          <div className="rd-modal" onClick={e => e.stopPropagation()}>
            <div className="rd-header">
              <div className="rd-header-left">
                <span className="rd-header-label">Кассир:</span>
                <span className="rd-header-value">{detailEntry.createdByName || detailFiscal?.terminalId || '—'}</span>
              </div>
              <div className="rd-header-right">
                <span className="rd-header-label">Заказ №</span>
                <span className="rd-header-value">{(history.indexOf(detailEntry) + 1)}</span>
              </div>
            </div>
            <div className="rd-actions">
              <button className="rd-btn rd-btn-print"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>Печать</button>
              <button className="rd-btn">Excel</button>
              <button className="rd-btn">PDF</button>
            </div>

            {loading && <div className="rd-loading">Загрузка данных...</div>}

            <div className="rd-table-wrap">
              <table className="rd-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>ИКПУ (МХИК)</th>
                    <th>Название товара</th>
                    <th>Цена</th>
                    <th>Кол-во</th>
                    <th>Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {detailItems ? detailItems.map((item, idx) => (
                    <tr key={item.id}>
                      <td>{idx + 1}</td>
                      <td className="rd-mxik">{item.mxikCode || '—'}</td>
                      <td>{item.productName}</td>
                      <td>{item.salePrice.toLocaleString()}</td>
                      <td>{item.saleCount}</td>
                      <td className="rd-td-total">{item.totalPrice.toLocaleString()}</td>
                    </tr>
                  )) : detailEntry.items?.map((item, idx) => (
                    <tr key={item.id}>
                      <td>{idx + 1}</td>
                      <td className="rd-mxik">{item.mxik || '—'}</td>
                      <td>{item.name}</td>
                      <td>{item.unitPrice.toLocaleString()}</td>
                      <td>{item.quantity}</td>
                      <td className="rd-td-total">{item.total.toLocaleString()}</td>
                    </tr>
                  ))}
                  {!detailItems && (!detailEntry.items || detailEntry.items.length === 0) && (
                    <tr><td colSpan={6} className="rd-empty">{detailEntry.itemCount} блюд(а)</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {detailFiscal && (
              <div className="rd-fiscal-info">
                <div className="rd-meta-line"><span>Terminal ID:</span><span>{detailFiscal.terminalId}</span></div>
                <div className="rd-meta-line"><span>Фискальный признак:</span><span>{detailFiscal.fiscalSign}</span></div>
                {detailFiscal.qrCodeUrl && (
                  <div className="rd-meta-line" style={{ justifyContent: 'center' }}>
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(detailFiscal.qrCodeUrl)}`} alt="QR" style={{ width: 100, height: 100 }} />
                  </div>
                )}
                <div className="rd-meta-line">
                  <span>Статус ОФД:</span>
                  <span>
                    <span className={`ofd-badge ${detailFiscal.ofdStatus === 'synced' ? 'ofd-synced' : 'ofd-pending'}`}>
                      {detailFiscal.ofdStatus === 'synced' ? 'Отправлен' : 'Ожидает'}
                    </span>
                  </span>
                </div>
                {detailFiscal.factoryId && (
                  <button className="rd-btn rd-btn-check-ofd" disabled={ofdChecking} onClick={async () => {
                    setOfdChecking(true)
                    try {
                      const syncRes = await runFullOfdSync(detailFiscal.factoryId!)
                      const count = syncRes.totalRemaining ?? 0
                      if (count === 0) {
                        setDetailFiscal(prev => prev ? { ...prev, ofdStatus: 'synced' } : prev)
                        const entry = detailEntry
                        if (entry && entry.id) {
                          const allHistory = history.map(h => h.id === entry.id ? { ...h, ofdStatus: 'synced' as const } : h)
                          localStorage.setItem('pos_v2_history', JSON.stringify(allHistory))
                        }
                        showToast('Все чеки успешно отправлены в ОФД!')
                      } else {
                        showToast(`Ожидают отправки в ОФД: ${count} чеков`)
                      }
                    } catch {
                      showToast('Ошибка проверки ОФД')
                    }
                    setOfdChecking(false)
                  }}>
                    {ofdChecking ? 'Проверка...' : 'Проверить ОФД'}
                  </button>
                )}
              </div>
            )}

            <div className="rd-meta">
              <div className="rd-meta-line"><span>Дата:</span><span>{detailEntry.timestamp}</span></div>
              <div className="rd-meta-line"><span>Тип заказа:</span><span>{ORDER_TYPE_LABELS[detailEntry.status] || detailEntry.status}</span></div>
              <div className="rd-meta-line"><span>QQS (12%):</span><span>{Math.round(detailEntry.total * 12 / 112).toLocaleString()} сум</span></div>
              <div className="rd-meta-line"><span>Скидка:</span><span>{detailEntry.discountAmount ? `${detailEntry.discountAmount.toLocaleString()} сум` : detailEntry.discountPercent ? `${detailEntry.discountPercent}%` : '0 сум'}</span></div>
              {detailEntry.servicePercent ? (
                <div className="rd-meta-line"><span>Сервис ({detailEntry.servicePercent}%):</span><span>{Math.round(detailEntry.total * detailEntry.servicePercent / 100).toLocaleString()} сум</span></div>
              ) : (
                <div className="rd-meta-line"><span>Сервис:</span><span>0 сум</span></div>
              )}
              <div className="rd-meta-line rd-meta-total"><span>Сумма оплаты</span><span>{detailEntry.total.toLocaleString()} сум</span></div>
            </div>
            <div className="rd-footer">
              <button className="rd-btn rd-btn-back" onClick={() => { setDetailEntry(null); setDetailItems(null); setDetailFiscal(null) }}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast-overlay"><div className="toast-msg">{toast}</div></div>}
    </div>
  )
}