import { useState, useEffect, useMemo, useCallback } from 'react'
import type { HistoryEntry } from '../data/types'
import { CalendarIcon, TableIcon, FoodIcon } from './Icons'
import { useT, tr } from '../i18n'
import PrintLoadingModal from './PrintLoadingModal'
import { getPhoto } from '../utils/menuPhotos'
import { getAvansPrinter } from '../utils/avansPrint'
import { resolveLogicalPrinter } from '../utils/printService'
import { printAvansCopy, printFiscalCopy } from '../utils/historyPrint'
import sheetIcon from '../assets/icons/sheet.png'
import totalOrdersIcon from '../assets/icons/total-orders.svg'
import sentIcon from '../assets/icons/sent.svg'
import paidIcon from '../assets/icons/paid.svg'
import cancelledIcon from '../assets/icons/cancelled.svg'
import totalAmountIcon from '../assets/icons/total-amount.svg'

interface AdminHistoryProps {
  history?: HistoryEntry[]
}

const ZONES = ['Все зоны', 'ОСНОВНОЙ ЗАЛ', 'ТЕРРАСА', 'VIP ЗОНА']
const PAGE_SIZE = 8

const ROLE_LABELS: Record<string, string> = {
  waiter: tr('Официант', 'Ofitsiant', 'Waiter'),
  cashier: tr('Кассир', 'Kassir', 'Cashier'),
  admin: tr('Администратор', 'Administrator', 'Administrator'),
}

export default function AdminHistory({ history: allHistory = [] }: AdminHistoryProps) {
  // Cabinet imports belong to Receipts; local orders keep their IDs even after upload.
  const history = useMemo(() => allHistory.filter(entry => !entry.id.startsWith('cabinet:')), [allHistory])
  const t = useT()
  const statusConfig: Record<string, { label: string; className: string }> = {
    sent: { label: t('Отправлено', 'Yuborilgan', 'Sent'), className: 'hist-status-sent' },
    paid: { label: t('Оплачено', 'To\'langan', 'Paid'), className: 'hist-status-paid' },
    cancelled: { label: t('Отменено', 'Bekor qilingan', 'Cancelled'), className: 'hist-status-cancelled' },
  }
  const [search, setSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState('Все зоны')
  const [roleFilter, setRoleFilter] = useState('Все роли')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [showPageMenu, setShowPageMenu] = useState(false)
  const [activeEntry, setActiveEntry] = useState<HistoryEntry | null>(null)
  const [printingEntry, setPrintingEntry] = useState<HistoryEntry | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function showToastMsg(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const filtered = history.filter(h => {
    if (zoneFilter !== 'Все зоны' && h.zone !== zoneFilter) return false
    if (roleFilter !== 'Все роли' && h.createdByRole !== roleFilter) return false
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

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1
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

  const hiddenPages = useMemo(() => {
    const p: number[] = []
    for (let i = 6; i < totalPages; i++) p.push(i)
    return p
  }, [totalPages])

  function getPageNumbers(): (number | 'ellipsis')[] {
    if (totalPages <= 6) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages]
  }

  function clearDateFilter() {
    setDateFrom('')
    setDateTo('')
    setShowDatePicker(false)
  }

  const exportExcel = useCallback(() => {
    const itogo = (e: HistoryEntry) => {
      const service = Math.round(e.total * (e.servicePercent || 0) / 100)
      const disc = e.discountType === 'percent' ? Math.round(e.total * (e.discountPercent || 0) / 100) : (e.discountAmount || 0)
      return e.total + service - disc
    }
    let table = `<table><thead><tr><th>№</th><th>${tr('Стол', 'Stol', 'Table')}</th><th>${tr('Имя', 'Ism', 'Name')}</th><th>${tr('Роль', 'Rol', 'Role')}</th><th>${tr('Сумма', 'Summa', 'Amount')}</th><th>${tr('Статус', 'Holat', 'Status')}</th><th>${tr('Дата и время', 'Sana va vaqt', 'Date and time')}</th></tr></thead><tbody>`
    filtered.forEach((h, i) => {
      table += `<tr><td>${i + 1}</td><td>${h.tableName}</td><td>${h.createdByName || '—'}</td><td>${h.createdByRole ? (ROLE_LABELS[h.createdByRole] || h.createdByRole) : '—'}</td><td>${itogo(h)}</td><td>${statusConfig[h.status]?.label || h.status}</td><td>${h.timestamp}</td></tr>`
    })
    table += '</tbody></table>'
    const html = `<html><meta charset="utf-8"><body>${table}</body></html>`
    const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${tr('Istoriya', 'Tarix', 'History')}_${new Date().toISOString().slice(0, 10)}.xls`; a.click()
    URL.revokeObjectURL(url)
  }, [filtered, statusConfig])

  const hasDateFilter = dateFrom || dateTo

  const stats = useMemo(() => {
    let sent = 0, paid = 0, cancelled = 0, paidSum = 0
    for (const h of filtered) {
      if (h.status === 'sent') sent++
      else if (h.status === 'paid') { paid++; paidSum += h.total }
      else if (h.status === 'cancelled') cancelled++
    }
    return { all: filtered.length, sent, paid, cancelled, paidSum }
  }, [filtered])

  const entryOrderNum = (e: HistoryEntry) => e.receiptSeq || history.indexOf(e) + 1

  async function handlePrintEntry(entry: HistoryEntry) {
    const printer = entry.status === 'paid'
      ? await resolveLogicalPrinter('receipt')
      : await getAvansPrinter()
    if (!printer) {
      showToastMsg(tr('Подключите принтер в настройках', 'Sozlamalarda printerni ulang', 'Connect a printer in Settings'))
      return
    }
    setPrintingEntry(entry)
  }

  async function printEntryTask(entry: HistoryEntry) {
    const orderNum = entryOrderNum(entry)
    if (entry.status === 'paid') {
      await printFiscalCopy(entry, orderNum)
    } else {
      await printAvansCopy(entry, orderNum)
    }
  }

  const qqsAmount = (e: HistoryEntry) => {
    const service = Math.round(e.total * (e.servicePercent || 0) / 100)
    const disc = e.discountType === 'percent'
      ? Math.round(e.total * (e.discountPercent || 0) / 100)
      : (e.discountAmount || 0)
    return Math.round((e.total + service - disc) * 12 / 100)
  }
  const entryItogo = (e: HistoryEntry) => {
    const service = Math.round(e.total * (e.servicePercent || 0) / 100)
    const disc = e.discountType === 'percent'
      ? Math.round(e.total * (e.discountPercent || 0) / 100)
      : (e.discountAmount || 0)
    return e.total + service - disc
  }

  return (
    <div className="screen history-screen">
      <div className="screen-header">
        <h1 className="screen-title">{t('Отчеты', 'Hisobotlar', 'Reports')}</h1>
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
          <div className="toolbar-divider" />
          <select className="toolbar-select" value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}>
            {ZONES.map(z => <option key={z} value={z}>{z === 'Все зоны' ? t('Все зоны', 'Barcha zonalar', 'All zones') : z}</option>)}
          </select>
          <select className="toolbar-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="Все роли">{t('Все роли', 'Barcha rollar', 'All roles')}</option>
            {(['waiter', 'cashier'] as const).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <button className="hist-export-btn" onClick={exportExcel} title={t('Скачать', 'Yuklab olish', 'Download')}>
            <img src={sheetIcon} alt="" />
            {t('Скачать', 'Yuklab olish', 'Download')}
          </button>
        </div>
        <div className="toolbar-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={t('Поиск по столу, дате, сумме или имени...', 'Stol, sana, summa yoki ism bo\'yicha qidirish...', 'Search by table, date, amount or name...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="orders-stats history-stats">
        <div className="orders-stat">
          <img src={totalOrdersIcon} alt="" style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0 }} />
          <span className="orders-stat-text">
            <span className="orders-stat-label">{t('Общие заказы', 'Jami buyurtmalar', 'Total orders')}</span>
            <span className="orders-stat-value">{stats.all}</span>
          </span>
        </div>
        <div className="orders-stat">
          <img src={sentIcon} alt="" style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0 }} />
          <span className="orders-stat-text">
            <span className="orders-stat-label">{t('Отправлено', 'Yuborilgan', 'Sent')}</span>
            <span className="orders-stat-value">{stats.sent}</span>
          </span>
        </div>
        <div className="orders-stat">
          <img src={paidIcon} alt="" style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0 }} />
          <span className="orders-stat-text">
            <span className="orders-stat-label">{t('Оплачено', 'To\'langan', 'Paid')}</span>
            <span className="orders-stat-value">{stats.paid}</span>
          </span>
        </div>
        <div className="orders-stat">
          <img src={cancelledIcon} alt="" style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0 }} />
          <span className="orders-stat-text">
            <span className="orders-stat-label">{t('Отменено', 'Bekor qilingan', 'Cancelled')}</span>
            <span className="orders-stat-value">{stats.cancelled}</span>
          </span>
        </div>
        <div className="orders-stat">
          <img src={totalAmountIcon} alt="" style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0 }} />
          <span className="orders-stat-text">
            <span className="orders-stat-label">{t('Общая сумма', 'Umumiy summa', 'Total amount')}</span>
            <span className="orders-stat-value">{stats.paidSum.toLocaleString()}</span>
          </span>
        </div>
      </div>

      <div className="orders-layout history-layout">
        <div className="history-layout-content">
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>{t('Стол', 'Stol', 'Table')}</th>
                  <th>{t('Имя', 'Ism', 'Name')}</th>
                  <th>{t('Роль', 'Rol', 'Role')}</th>
                  <th>{t('Сумма', 'Summa', 'Amount')}</th>
                  <th>{t('Статус', 'Holat', 'Status')}</th>
                  <th>{t('Дата и время', 'Sana va vaqt', 'Date and time')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((row, idx) => {
                  const config = statusConfig[row.status]
                  return (
                    <tr key={row.id}>
                      <td className="history-table-cell">#{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                      <td>{row.tableName}</td>
                      <td>{row.createdByName || '—'}</td>
                      <td>{row.createdByRole ? ROLE_LABELS[row.createdByRole] || row.createdByRole : '—'}</td>
                      <td className="history-total-cell">{entryItogo(row).toLocaleString()} {t('сум', 'so\'m', 'sum')}</td>
                      <td>
                        <span className={`history-status-badge ${config.className}`}>
                          {config.label}
                        </span>
                      </td>
                      <td>{row.timestamp}</td>
                      <td>
                        <button className="history-view-btn" onClick={() => setActiveEntry(row)}>{t('Посмотреть', 'Ko\'rish', 'View')}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {paginated.length === 0 && <div className="history-empty">{t('Ничего не найдено', 'Hech narsa topilmadi', 'Nothing found')}</div>}
          </div>

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
        </div>

        {activeEntry && (
          <div className="orders-panel history-panel">
            <div className="orders-panel-header">
              <span className="orders-panel-title">
                <TableIcon />
                {activeEntry.tableName} | <span className={`history-status-badge ${statusConfig[activeEntry.status].className}`}>{statusConfig[activeEntry.status].label}</span>
              </span>
              <button className="orders-panel-close" onClick={() => setActiveEntry(null)}>✕</button>
            </div>

            <div className="history-panel-body">
              <div className="hp-section">
                <div className="hp-section-title">{t('Информация о заказе', 'Buyurtma haqida ma\'lumot', 'Order information')}</div>
                <div className="hp-row"><span className="hp-label">{t('Стол:', 'Stol:', 'Table:')}</span><span className="hp-value">{activeEntry.tableName}</span></div>
                <div className="hp-row"><span className="hp-label">{t('Гости:', 'Mehmonlar:', 'Guests:')}</span><span className="hp-value">{activeEntry.guestCount ?? '—'}</span></div>
                <div className="hp-row"><span className="hp-label">{t('Официант:', 'Ofitsiant:', 'Waiter:')}</span><span className="hp-value">{activeEntry.createdByName || '—'}</span></div>
                <div className="hp-row"><span className="hp-label">{t('Роль:', 'Rol:', 'Role:')}</span><span className="hp-value">{activeEntry.createdByRole ? ROLE_LABELS[activeEntry.createdByRole] || activeEntry.createdByRole : '—'}</span></div>
                <div className="hp-row"><span className="hp-label">{t('Время:', 'Vaqt:', 'Time:')}</span><span className="hp-value">{activeEntry.timestamp}</span></div>
                {activeEntry.shiftNumber && <div className="hp-row"><span className="hp-label">{t('Смена:', 'Smena:', 'Shift:')}</span><span className="hp-value">{activeEntry.shiftNumber}</span></div>}
              </div>

              <div className="hp-section">
                <div className="hp-section-title">{t('Список блюд', 'Taomlar ro\'yxati', 'Dish list')}</div>
                <div className="orders-panel-item-head">
                  <span>{t('Блюдо', 'Taom', 'Dish')}</span>
                  <span>{t('Кол-во', 'Soni', 'Qty')}</span>
                  <span>{t('Цена', 'Narx', 'Price')}</span>
                  <span>{t('Итого', 'Jami', 'Total')}</span>
                </div>
                {(activeEntry.items || []).map(item => (
                  <div key={item.id} className="orders-panel-item-row">
                    <span className="orders-panel-item-name">
                      <span className="orders-panel-item-photo">
                        {getPhoto(item.name) ? (
                          <img src={getPhoto(item.name)} alt={item.name} className="orders-panel-photo-img" />
                        ) : (
                          <FoodIcon name={item.name} />
                        )}
                      </span>
                      <span>{item.name}</span>
                    </span>
                    <span>× {item.quantity}</span>
                    <span>{item.unitPrice.toLocaleString()}</span>
                    <span className="orders-panel-item-total">{item.total.toLocaleString()}</span>
                  </div>
                ))}
                {(activeEntry.items || []).length === 0 && (
                  <div className="history-empty">{t('Блюда не сохранены', 'Taomlar saqlanmagan', 'Dishes not saved')}</div>
                )}
              </div>

              <div className="hp-section">
                <div className="hp-section-title">{t('Суммы', 'Summalar', 'Totals')}</div>
                <div className="hp-row"><span className="hp-label">{t('Общая сумма', 'Umumiy summa', 'Total amount')}</span><span className="hp-value">{activeEntry.total.toLocaleString()} {t('сум', 'so\'m', 'sum')}</span></div>
                {activeEntry.servicePercent ? (
                  <div className="hp-row"><span className="hp-label">{t(`Сервис (${activeEntry.servicePercent}%):`, `Xizmat (${activeEntry.servicePercent}%):`, `Service (${activeEntry.servicePercent}%):`)}</span><span className="hp-value">{Math.round(activeEntry.total * activeEntry.servicePercent / 100).toLocaleString()} {t('сум', 'so\'m', 'sum')}</span></div>
                ) : null}
                {activeEntry.discountPercent || activeEntry.discountAmount ? (
                  <div className="hp-row"><span className="hp-label">{t('Скидка:', 'Chegirma:', 'Discount:')}</span><span className="hp-value">
                    {activeEntry.discountType === 'percent' ? `${activeEntry.discountPercent}%` : `${activeEntry.discountAmount?.toLocaleString()} ${t('сум', 'so\'m', 'sum')}`}
                  </span></div>
                ) : null}
                <div className="hp-row"><span className="hp-label">QQS (12%):</span><span className="hp-value">{qqsAmount(activeEntry).toLocaleString()} {t('сум', 'so\'m', 'sum')}</span></div>
                <div className="orders-panel-total hp-total">
                  <span className="orders-panel-total-label">{t('ИТОГО:', 'JAMI:', 'TOTAL:')}</span>
                  <span className="orders-panel-total-value">{entryItogo(activeEntry).toLocaleString()} {t('сум', 'so\'m', 'sum')}</span>
                </div>
              </div>

              {activeEntry.status === 'paid' ? (
                <div className="hp-section">
                  <div className="hp-section-title">{t('Информация о платеже', 'To\'lov haqida ma\'lumot', 'Payment information')}</div>
                  <div className="hp-row">
                    <span className="hp-label">{t('Метод оплаты:', 'To\'lov usuli:', 'Payment method:')}</span>
                    <span className="hp-value">
                      {activeEntry.paymentMethod === 'cash' ? t('Наличной', 'Naqd', 'Cash')
                        : activeEntry.paymentMethod === 'card' ? t('Карта', 'Karta', 'Card')
                        : activeEntry.paymentMethod === 'click' ? t('Другое', 'Boshqa', 'Other')
                        : activeEntry.paymentMethod === 'split' ? t('Разделение', 'Bo\'lish', 'Split')
                        : t('—', '—', '—')}
                    </span>
                  </div>
                  <div className="hp-row"><span className="hp-label">Terminal ID:</span><span className="hp-value">{activeEntry.terminalId || '—'}</span></div>
                  <div className="hp-row"><span className="hp-label">{t('Фискальный признак:', 'Fiskal belgi:', 'Fiscal code:')}</span><span className="hp-value">{activeEntry.fiscalSign || '—'}</span></div>
                  <div className="hp-row">
                    <span className="hp-label">{t('Статус ОФД:', 'OFD holati:', 'OFD status:')}</span>
                    <span className="hp-value">
                      <span className={`ofd-badge ${activeEntry.ofdStatus === 'synced' ? 'ofd-synced' : 'ofd-pending'}`}>
                        {activeEntry.ofdStatus === 'synced' ? t('Отправлен', 'Yuborilgan', 'Sent') : t('Ожидает', 'Kutilmoqda', 'Pending')}
                      </span>
                    </span>
                  </div>
                  {activeEntry.qrCodeUrl && (
                    <div className="hp-qr">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(activeEntry.qrCodeUrl)}`} alt="QR" style={{ width: 100, height: 100 }} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="hp-section">
                  <div className="hp-section-title">{t('Статус', 'Holat', 'Status')}</div>
                  <div className="hp-status-line">
                    <span className={`history-status-badge ${statusConfig[activeEntry.status].className}`}>{statusConfig[activeEntry.status].label}</span>
                    <span className="hp-status-note">
                      {activeEntry.status === 'sent'
                        ? t('Чек отправлен на кассу, ожидает оплаты', 'Chek kassaga yuborildi, to\'lov kutilmoqda', 'Receipt sent to cash register, awaiting payment')
                        : t('Заказ отменен', 'Buyurtma bekor qilindi', 'Order cancelled')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="orders-stage-btns">
              <button className="kitchen-action-btn primary" onClick={() => handlePrintEntry(activeEntry)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                {t('Распечатать', 'Chop etish', 'Print')}
              </button>
            </div>
          </div>
        )}
      </div>

      {printingEntry && (
        <PrintLoadingModal
          task={() => printEntryTask(printingEntry)}
          onComplete={() => {
            const wasPaid = printingEntry.status === 'paid'
            setPrintingEntry(null)
            showToastMsg(wasPaid ? tr('Фискальный чек распечатан', 'Fiskal chek chop etildi', 'Fiscal receipt printed') : tr('Чек распечатан', 'Chek chop etildi', 'Receipt printed'))
          }}
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
