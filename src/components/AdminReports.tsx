import { useState, useCallback } from 'react'
import type { HistoryEntry } from '../data/types'
import { CalendarIcon } from './Icons'
import { getCompanyName, getCompanyAddress, getCompanyTin } from '../utils/companyInfo'
import { tr, useT } from '../i18n'

interface AdminReportsProps {
  history?: HistoryEntry[]
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
  const [toast, setToast] = useState('')
  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }, [])
  const [loading, setLoading] = useState(false)
  const t = useT()

  const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
    sent: { label: t('Отправлено', 'Yuborilgan'), className: 'hist-status-sent' },
    paid: { label: t('Оплачено', 'To\'landi'), className: 'hist-status-paid' },
    cancelled: { label: t('Отменено', 'Bekor qilingan'), className: 'hist-status-cancelled' },
  }

  const PAYMENT_LABELS: Record<string, string> = {
    cash: t('Наличные', 'Naqd'),
    card: t('Терминал', 'Terminal'),
    click: t('Другое', 'Boshqa'),
    split: t('Разделение', 'Bo\'lish'),
  }

  const ORDER_TYPE_LABELS: Record<string, string> = {
    sent: 'Avans-check',
    paid: t('Фискальный чек', 'Fiskal chek'),
    cancelled: t('Отменено', 'Bekor qilingan'),
  }

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
          const toDate = new Date(+tp[0], +tp[1] - 1, +tp[2])
          toDate.setHours(23, 59, 59)
          if (d > toDate) return false
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

  function escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function detailHtml(): string {
    const e = detailEntry
    if (!e) return ''
    const items = detailItems
      ? detailItems.map(it => ({ name: it.productName, mxik: it.mxikCode || '', price: it.salePrice, qty: it.saleCount, total: it.totalPrice }))
      : (e.items || []).map(it => ({ name: it.name, mxik: it.mxik || '', price: it.unitPrice, qty: it.quantity, total: it.total }))
    const vat = Math.round(e.total * 12 / 112)
    const discount = e.discountAmount
      ? `${e.discountAmount.toLocaleString()} ${tr('сум', "so'm")}`
      : e.discountPercent ? `${e.discountPercent}%` : tr('0 сум', "0 so'm")
    const service = e.servicePercent ? Math.round(e.total * e.servicePercent / 100).toLocaleString() : tr('0 сум', "0 so'm")
    const orderNo = history.indexOf(e) + 1
    const company = getCompanyName()
    const address = getCompanyAddress()
    const tin = getCompanyTin()
    const fiscalRows = e.terminalId || e.fiscalSign ? `
      <h2 class="sec">${tr('Фискальные данные', 'Fiskal ma\'lumotlar')}</h2>
      <div class="line"><span>Terminal ID:</span><span>${escapeHtml(e.terminalId || '—')}</span></div>
      <div class="line"><span>${tr('Фискальный признак:', 'Fiskal belgi:')}</span><span>${escapeHtml(e.fiscalSign || '—')}</span></div>
      ${e.qrCodeUrl ? `<div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(e.qrCodeUrl)}" alt="QR" /></div>` : ''}
    ` : ''
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${tr('Детали заказа', 'Buyurtma tafsilotlari')} №${orderNo}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 40px; }
  .doc { max-width: 720px; margin: 0 auto; }
  .head { text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 12px; margin-bottom: 20px; }
  .head h1 { margin: 0 0 4px; font-size: 20px; }
  .head div { font-size: 12px; color: #475569; }
  .title { font-size: 16px; font-weight: 700; margin: 0 0 12px; }
  .meta { margin-bottom: 16px; font-size: 13px; }
  .meta div { display: flex; justify-content: space-between; max-width: 360px; padding: 2px 0; }
  .sec { font-size: 14px; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-top: 12px; font-size: 13px; max-width: 360px; margin-left: auto; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals .grand { border-top: 2px solid #1e293b; margin-top: 4px; padding-top: 6px; font-weight: 700; font-size: 15px; }
  .line { display: flex; justify-content: space-between; max-width: 360px; font-size: 13px; padding: 2px 0; }
  .qr { text-align: center; margin-top: 8px; }
  .foot { margin-top: 32px; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 11px; color: #64748b; }
</style>
</head>
<body>
<div class="doc">
  <div class="head">
    <h1>${escapeHtml(company)}</h1>
    <div>${escapeHtml(address)}${tin ? ` &middot; STIR/ИНН: ${escapeHtml(tin)}` : ''}</div>
  </div>
  <h2 class="title">${tr('Детали заказа', 'Buyurtma tafsilotlari')} №${orderNo}</h2>
  <div class="meta">
    <div><span>${tr('Кассир:', 'Kassir:')}</span><span>${escapeHtml(e.createdByName || e.createdByRole || '—')}</span></div>
    <div><span>${tr('Дата:', 'Sana:')}</span><span>${escapeHtml(e.timestamp)}</span></div>
    <div><span>${tr('Тип заказа:', 'Buyurtma turi:')}</span><span>${escapeHtml(ORDER_TYPE_LABELS[e.status] || e.status)}</span></div>
    <div><span>${tr('Тип оплаты:', "To'lov turi:")}</span><span>${escapeHtml(PAYMENT_LABELS[e.paymentMethod || ''] || '—')}</span></div>
  </div>
  <table>
    <thead>
      <tr><th>#</th><th>${tr('Название', 'Nomi')}</th><th>${tr('Цена', 'Narx')}</th><th>${tr('Кол-во', 'Soni')}</th><th class="num">${tr('Итого', 'Jami')}</th></tr>
    </thead>
    <tbody>
      ${items.map((it, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(it.name)}${it.mxik ? `<br><small style="color:#94a3b8">${escapeHtml(it.mxik)}</small>` : ''}</td><td>${it.price.toLocaleString()}</td><td>${it.qty}</td><td class="num">${it.total.toLocaleString()}</td></tr>`).join('')}
      ${items.length === 0 ? `<tr><td colspan="5">${tr('Нет позиций', 'Tovarlar yo\'q')}</td></tr>` : ''}
    </tbody>
  </table>
  <div class="totals">
    <div><span>QQS (12%):</span><span>${vat.toLocaleString()} ${tr('сум', "so'm")}</span></div>
    <div><span>${tr('Скидка:', 'Chegirma:')}</span><span>${escapeHtml(discount)}</span></div>
    <div><span>${tr('Сервис:', 'Xizmat:')}</span><span>${escapeHtml(service)}</span></div>
    <div class="grand"><span>${tr('Сумма оплаты', "To'lov summasi")}</span><span>${e.total.toLocaleString()} ${tr('сум', "so'm")}</span></div>
  </div>
  ${fiscalRows}
  <div class="foot">POS Terminal v2 &middot; ${new Date().toLocaleString()}</div>
</div>
</body>
</html>`
  }

  function printDetail() {
    const html = detailHtml()
    if (!html) return
    const frame = document.createElement('iframe')
    frame.style.position = 'fixed'
    frame.style.right = '0'
    frame.style.bottom = '0'
    frame.style.width = '0'
    frame.style.height = '0'
    frame.style.border = '0'
    frame.style.visibility = 'hidden'
    document.body.appendChild(frame)
    const doc = frame.contentWindow?.document
    if (!doc) { document.body.removeChild(frame); return }
    doc.open()
    doc.write(html)
    doc.close()
    frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print() }
    setTimeout(() => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    }, 300)
    setTimeout(() => { if (frame.parentNode) frame.parentNode.removeChild(frame) }, 15000)
  }

  async function downloadPdf() {
    const html = detailHtml()
    if (!html) return
    const gen = window.electronAPI?.generatePdf
    if (!gen) { printDetail(); return }
    try {
      const base64 = await gen(html)
      const bin = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const blob = new Blob([bin], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Detali_zakaz_${history.indexOf(detailEntry!) + 1}_${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      showToast(t('Ошибка создания PDF', 'PDF yaratishda xato'))
    }
  }

  const exportExcel = useCallback(() => {
    const payLabels: Record<string, string> = {
      cash: tr('Наличные', 'Naqd'),
      card: tr('Терминал', 'Terminal'),
      click: tr('Другое', 'Boshqa'),
      split: tr('Разделение', 'Bo\'lish'),
    }
    const orderLabels: Record<string, string> = {
      sent: 'Avans-check',
      paid: tr('Фискальный чек', 'Fiskal chek'),
      cancelled: tr('Отменено', 'Bekor qilingan'),
    }
    const statusLabels: Record<string, string> = {
      sent: tr('Отправлено', 'Yuborilgan'),
      paid: tr('Оплачено', 'To\'landi'),
      cancelled: tr('Отменено', 'Bekor qilingan'),
    }
    let table = `<table><thead><tr><th>№</th><th>${tr('Кассир', 'Kassir')}</th><th>${tr('Тип оплаты', 'To\'lov turi')}</th><th>${tr('Тип заказа', 'Buyurtma turi')}</th><th>${tr('Сумма', 'Summa')}</th><th>${tr('Статус', 'Holat')}</th><th>${tr('Дата и время', 'Sana va vaqt')}</th></tr></thead><tbody>`
    filtered.forEach((h, i) => {
      table += `<tr><td>${i + 1}</td><td>${h.createdByName || h.createdByRole || '—'}</td><td>${payLabels[h.paymentMethod || ''] || '—'}</td><td>${orderLabels[h.status] || h.status}</td><td>${h.total}</td><td>${statusLabels[h.status] || h.status}</td><td>${h.timestamp}</td></tr>`
    })
    table += '</tbody></table>'
    const html = `<html><meta charset="utf-8"><body>${table}</body></html>`
    const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `Chek_tarixi_${new Date().toISOString().slice(0, 10)}.xls`; a.click()
    URL.revokeObjectURL(url)
  }, [filtered])

  return (
    <div className="screen history-screen">
      <div className="screen-header">
        <h1 className="screen-title">{t('Отчеты', 'Hisobotlar')}</h1>
      </div>

      <div className="history-toolbar">
        <div className="history-toolbar-left">
          <div className="history-date-wrap">
            <div className="history-date-picker" onClick={() => setShowDatePicker(!showDatePicker)}>
              <span className="history-date-label">{hasDateFilter ? `${dateFrom || '...'} — ${dateTo || '...'}` : t('Дата', 'Sana')}</span>
              <span className="history-date-icon"><CalendarIcon /></span>
            </div>
            {showDatePicker && (
              <div className="history-date-range">
                <div className="hdr-row"><label>{t('с', 'dan')}</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
                <div className="hdr-row"><label>{t('до', 'gacha')}</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
                <button className="hdr-clear" onClick={clearDateFilter}>{t('Сбросить', 'Tozalash')}</button>
              </div>
            )}
          </div>
          <div className="toolbar-divider" />
          <select className="toolbar-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">{t('Все типы', 'Barcha turlar')}</option>
            <option value="cash">{t('Наличные', 'Naqd')}</option>
            <option value="card">{t('Терминал', 'Terminal')}</option>
            <option value="click">{t('Другое', 'Boshqa')}</option>
            <option value="split">{t('Разделение', 'Bo\'lish')}</option>
          </select>
        </div>
        <div className="toolbar-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder={t('Поиск по кассиру, дате или сумме...', 'Kassir, sana yoki summa bo\'yicha qidirish...')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="hist-export-btn" onClick={exportExcel} title={t('Скачать Excel', 'Excel yuklab olish')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="16" x2="16" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="8" x2="10" y2="8" /></svg>
          {t('Excel', 'Excel')}
        </button>
      </div>

      <div className="history-table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>№</th>
              <th>{t('Кассир', 'Kassir')}</th>
              <th>{t('Тип оплаты', 'To\'lov turi')}</th>
              <th>{t('Тип заказа', 'Buyurtma turi')}</th>
              <th>{t('Сумма', 'Summa')}</th>
              <th>{t('Статус', 'Holat')}</th>
              <th>{t('Дата и время', 'Sana va vaqt')}</th>
              <th>{t('Действие', 'Amal')}</th>
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
                  <td className="history-total-cell">{row.total.toLocaleString()} {t('сум', 'so\'m')}</td>
                  <td><span className={`history-status-badge ${config.className}`}>{config.label}</span></td>
                  <td>{row.timestamp}</td>
                  <td><button className="hist-details-btn" onClick={() => { fetchDetail(row) }}>{t('Детали', 'Batafsil')}</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="history-empty">{t('Чеки не найдены', 'Cheklar topilmadi')}</div>}
      </div>

      {detailEntry && (
        <div className="modal-overlay" onClick={() => { setDetailEntry(null); setDetailItems(null); setDetailFiscal(null) }}>
          <div className="rd-modal" onClick={e => e.stopPropagation()}>
            <div className="rd-header">
              <div className="rd-header-left">
                <span className="rd-header-label">{t('Кассир:', 'Kassir:')}</span>
                <span className="rd-header-value">{detailEntry.createdByName || detailFiscal?.terminalId || '—'}</span>
              </div>
              <div className="rd-header-right">
                <span className="rd-header-label">{t('Заказ №', 'Buyurtma №')}</span>
                <span className="rd-header-value">{(history.indexOf(detailEntry) + 1)}</span>
              </div>
            </div>
            <div className="rd-actions">
              <button className="rd-btn rd-btn-print" onClick={printDetail}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>{t('Печать', 'Chop etish')}</button>
              <button className="rd-btn" onClick={downloadPdf}>PDF</button>
            </div>

            {loading && <div className="rd-loading">{t('Загрузка данных...', 'Ma\'lumotlar yuklanmoqda...')}</div>}

            <div className="rd-table-wrap">
              <table className="rd-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('ИКПУ (МХИК)', 'IKPU (MXIK)')}</th>
                    <th>{t('Название товара', 'Tovar nomi')}</th>
                    <th>{t('Цена', 'Narx')}</th>
                    <th>{t('Кол-во', 'Soni')}</th>
                    <th>{t('Итого', 'Jami')}</th>
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
                    <tr><td colSpan={6} className="rd-empty">{t(`${detailEntry.itemCount} блюд(а)`, `${detailEntry.itemCount} ta taom`)}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {detailFiscal && (
              <div className="rd-fiscal-info">
                <div className="rd-meta-line"><span>Terminal ID:</span><span>{detailFiscal.terminalId}</span></div>
                <div className="rd-meta-line"><span>{t('Фискальный признак:', 'Fiskal belgi:')}</span><span>{detailFiscal.fiscalSign}</span></div>
                {detailFiscal.qrCodeUrl && (
                  <div className="rd-meta-line" style={{ justifyContent: 'center' }}>
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(detailFiscal.qrCodeUrl)}`} alt="QR" style={{ width: 100, height: 100 }} />
                  </div>
                )}
                <div className="rd-meta-line">
                  <span>{t('Статус ОФД:', 'OFD holati:')}</span>
                  <span>
                    <span className={`ofd-badge ${detailFiscal.ofdStatus === 'synced' ? 'ofd-synced' : 'ofd-pending'}`}>
                      {detailFiscal.ofdStatus === 'synced' ? t('Отправлен', 'Yuborilgan') : t('Ожидает', 'Kutilmoqda')}
                    </span>
                  </span>
                </div>
              </div>
            )}

            <div className="rd-meta">
              <div className="rd-meta-line"><span>{t('Дата:', 'Sana:')}</span><span>{detailEntry.timestamp}</span></div>
              <div className="rd-meta-line"><span>{t('Тип заказа:', 'Buyurtma turi:')}</span><span>{ORDER_TYPE_LABELS[detailEntry.status] || detailEntry.status}</span></div>
              <div className="rd-meta-line"><span>QQS (12%):</span><span>{Math.round(detailEntry.total * 12 / 112).toLocaleString()} {t('сум', 'so\'m')}</span></div>
              <div className="rd-meta-line"><span>{t('Скидка:', 'Chegirma:')}</span><span>{detailEntry.discountAmount ? `${detailEntry.discountAmount.toLocaleString()} ${t('сум', 'so\'m')}` : detailEntry.discountPercent ? `${detailEntry.discountPercent}%` : t('0 сум', '0 so\'m')}</span></div>
              {detailEntry.servicePercent ? (
                <div className="rd-meta-line"><span>{t(`Сервис (${detailEntry.servicePercent}%):`, `Xizmat (${detailEntry.servicePercent}%):`)}</span><span>{Math.round(detailEntry.total * detailEntry.servicePercent / 100).toLocaleString()} {t('сум', 'so\'m')}</span></div>
              ) : (
                <div className="rd-meta-line"><span>{t('Сервис:', 'Xizmat:')}</span><span>{t('0 сум', '0 so\'m')}</span></div>
              )}
              <div className="rd-meta-line rd-meta-total"><span>{t('Сумма оплаты', 'To\'lov summasi')}</span><span>{detailEntry.total.toLocaleString()} {t('сум', 'so\'m')}</span></div>
            </div>
            <div className="rd-footer">
              <button className="rd-btn rd-btn-back" onClick={() => { setDetailEntry(null); setDetailItems(null); setDetailFiscal(null) }}>{t('Закрыть', 'Yopish')}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast-overlay"><div className="toast-msg">{toast}</div></div>}
    </div>
  )
}