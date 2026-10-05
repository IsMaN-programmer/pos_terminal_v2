import { useState, useEffect, useMemo, useCallback } from 'react'
import type { HistoryEntry } from '../data/types'
import { CalendarIcon } from './Icons'
import { getCompanyName, getCompanyAddress, getCompanyTin, getCompanyPhone } from '../utils/companyInfo'
import { tr, useT } from '../i18n'
import { dataStore } from '../services/dataStore'
import QRCode from 'qrcode'
import { buildFiscalReceiptHtml, printReceiptHtml, type PaperSize } from '../utils/receiptHtml'
import { resolveLogicalPrinter, printText, formatFiscalReceipt } from '../utils/printService'
import { fetchCabinetReceiptHistory, fetchCabinetReceiptItems } from '../services/receiptSync'
import { claimAutoCabinetSync } from '../services/autoCabinetSync'
import sheetIcon from '../assets/icons/sheet.png'
import { entryItogo, entryQqs } from '../utils/historyTotals'

const PAPER_KEY = 'pos_v2_paper_size'

interface AdminReportsProps {
  history?: HistoryEntry[]
  presetDateFrom?: string
  presetDateTo?: string
  presetKey?: number
  onPresetConsumed?: () => void
}

const PAGE_SIZE = 8

interface ApiReceiptItem {
  id: number
  productName: string
  salePrice: number
  saleCount: number
  totalPrice: number
  vatSum: number
  mxikCode: string
}

export default function AdminReports({ history = [], presetDateFrom, presetDateTo, presetKey, onPresetConsumed }: AdminReportsProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (!presetKey) return
    setDateFrom(presetDateFrom || '')
    setDateTo(presetDateTo || '')
    setShowDatePicker(false)
    onPresetConsumed?.()
  }, [presetKey])
  const [detailEntry, setDetailEntry] = useState<HistoryEntry | null>(null)
  const [detailItems, setDetailItems] = useState<ApiReceiptItem[] | null>(null)
  const [detailFiscal, setDetailFiscal] = useState<{ terminalId: string; fiscalSign: string; qrCodeUrl: string; ofdStatus?: string; factoryId?: string } | null>(null)
  const [toast, setToast] = useState('')
  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }, [])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [showPageMenu, setShowPageMenu] = useState(false)
  const [printingCopy, setPrintingCopy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const t = useT()
  const canExportPdf = window.electronAPI?.isDesktop === true && typeof window.electronAPI.generatePdf === 'function'

  const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
    sent: { label: t('Отправлено', 'Yuborilgan', 'Sent'), className: 'hist-status-sent' },
    paid: { label: t('Оплачено', 'To\'landi', 'Paid'), className: 'hist-status-paid' },
    cancelled: { label: t('Отменено', 'Bekor qilingan', 'Cancelled'), className: 'hist-status-cancelled' },
  }

  const PAYMENT_LABELS: Record<string, string> = {
    cash: t('Наличные', 'Naqd', 'Cash'),
    card: t('Терминал', 'Terminal', 'Terminal'),
    click: t('Другое', 'Boshqa', 'Other'),
    split: t('Разделение', 'Bo\'lish', 'Split'),
  }

  const ORDER_TYPE_LABELS: Record<string, string> = {
    sent: 'Avans-check',
    paid: t('Фискальный чек', 'Fiskal chek', 'Fiscal receipt'),
    cancelled: t('Отменено', 'Bekor qilingan', 'Cancelled'),
  }

  const fetchDetail = useCallback(async (entry: HistoryEntry) => {
    setLoading(true)
    setDetailItems(null)
    setDetailFiscal(null)
    setDetailEntry(entry)
    if (entry.terminalId || entry.fiscalSign) {
      setDetailFiscal({ terminalId: entry.terminalId || '', fiscalSign: entry.fiscalSign || '', qrCodeUrl: entry.qrCodeUrl || '', ofdStatus: entry.ofdStatus || 'pending', factoryId: entry.factoryId || '' })
    }
try {
      const locId = entry.cabinetLocId
      if (locId) {
        const items = await fetchCabinetReceiptItems(locId)
        setDetailItems(items)
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('Не удалось загрузить блюда чека', 'Chek taomlarini yuklab bo\'lmadi', 'Failed to load receipt dishes'))
    } finally {
      setLoading(false)
    }
  }, [showToast, t])

  const reportsHistory = history.filter(h => h.status === 'paid')

  async function syncWithCabinet() {
    if (syncing) return
    setSyncing(true)
    try {
      const remote = await fetchCabinetReceiptHistory()
      let local: HistoryEntry[] = []
      try { local = JSON.parse(dataStore.getItem('pos_v2_history') || '[]') } catch {}
      let imported = 0
      for (const receipt of remote) {
        const matchIndex = local.findIndex(entry =>
          (!!receipt.cabinetReceiptId && entry.cabinetReceiptId === receipt.cabinetReceiptId)
          || (!!receipt.fiscalSign && entry.fiscalSign === receipt.fiscalSign)
          || (!!receipt.terminalId && !!receipt.receiptSeq
            && entry.terminalId === receipt.terminalId && entry.receiptSeq === receipt.receiptSeq)
        )
        if (matchIndex === -1) {
          local.push(receipt)
          imported++
        } else {
const current = local[matchIndex]
          local[matchIndex] = {
            ...receipt,
            ...current,
            cabinetReceiptId: current.cabinetReceiptId || receipt.cabinetReceiptId,
            cabinetLocId: receipt.cabinetLocId || current.cabinetLocId,
            fiscalSign: current.fiscalSign || receipt.fiscalSign,
            qrCodeUrl: current.qrCodeUrl || receipt.qrCodeUrl,
            terminalId: current.terminalId || receipt.terminalId,
            receiptSeq: current.receiptSeq || receipt.receiptSeq,
            ofdStatus: receipt.ofdStatus || current.ofdStatus,
          }
        }
      }
      local.sort((a, b) => {
        const parse = (value: string) => {
          const [date = '', time = ''] = value.split(' ')
          const [day, month, year] = date.split('.')
          return new Date(`${year}-${month}-${day}T${time || '00:00'}`).getTime() || 0
        }
        return parse(b.timestamp) - parse(a.timestamp)
      })
      dataStore.setItem('pos_v2_history', JSON.stringify(local))
      const parts: string[] = []
      if (imported > 0) parts.push(t(`Получено ${imported}`, `Qabul qilindi ${imported}`, `Received ${imported}`))
      showToast(parts.length > 0 ? parts.join(', ') : t('Обновлений нет', 'Yangilanish yo\'q', 'No updates'))
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('Ошибка синхронизации', 'Sinxronlash xatosi', 'Sync error'))
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (claimAutoCabinetSync('receipts')) void syncWithCabinet()
  }, [])

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
      ? `${e.discountAmount.toLocaleString()} ${tr('сум', 'so\'m', 'sum')}`
      : e.discountPercent ? `${e.discountPercent}%` : tr('0 сум', '0 so\'m', '0 sum')
    const service = e.servicePercent ? Math.round(e.total * e.servicePercent / 100).toLocaleString() : tr('0 сум', '0 so\'m', '0 sum')
    const orderNo = history.indexOf(e) + 1
    const company = getCompanyName()
    const address = getCompanyAddress()
    const tin = getCompanyTin()
    const fiscalRows = e.terminalId || e.fiscalSign ? `
      <h2 class="sec">${tr('Фискальные данные', 'Fiskal ma\'lumotlar', 'Fiscal data')}</h2>
      <div class="line"><span>Terminal ID:</span><span>${escapeHtml(e.terminalId || '—')}</span></div>
      <div class="line"><span>${tr('Фискальный признак:', 'Fiskal belgi:', 'Fiscal code:')}</span><span>${escapeHtml(e.fiscalSign || '—')}</span></div>
      ${e.qrCodeUrl ? `<div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(e.qrCodeUrl)}" alt="QR" /></div>` : ''}
    ` : ''
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${tr('Детали заказа', 'Buyurtma tafsilotlari', 'Order details')} №${orderNo}</title>
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
  <h2 class="title">${tr('Детали заказа', 'Buyurtma tafsilotlari', 'Order details')} №${orderNo}</h2>
  <div class="meta">
    <div><span>${tr('Кассир:', 'Kassir:', 'Cashier:')}</span><span>${escapeHtml(e.createdByName || e.createdByRole || '—')}</span></div>
    <div><span>${tr('Дата:', 'Sana:', 'Date:')}</span><span>${escapeHtml(e.timestamp)}</span></div>
    <div><span>${tr('Тип заказа:', 'Buyurtma turi:', 'Order type:')}</span><span>${escapeHtml(ORDER_TYPE_LABELS[e.status] || e.status)}</span></div>
    <div><span>${tr('Тип оплаты:', 'To\'lov turi:', 'Payment type:')}</span><span>${escapeHtml(PAYMENT_LABELS[e.paymentMethod || ''] || '—')}</span></div>
  </div>
  <table>
    <thead>
      <tr><th>#</th><th>${tr('Название', 'Nomi', 'Name')}</th><th>${tr('Цена', 'Narx', 'Price')}</th><th>${tr('Кол-во', 'Soni', 'Qty')}</th><th class="num">${tr('Итого', 'Jami', 'Total')}</th></tr>
    </thead>
    <tbody>
      ${items.map((it, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(it.name)}${it.mxik ? `<br><small style="color:#94a3b8">${escapeHtml(it.mxik)}</small>` : ''}</td><td>${it.price.toLocaleString()}</td><td>${it.qty}</td><td class="num">${it.total.toLocaleString()}</td></tr>`).join('')}
      ${items.length === 0 ? `<tr><td colspan="5">${tr('Нет позиций', 'Tovarlar yo\'q', 'No items')}</td></tr>` : ''}
    </tbody>
  </table>
  <div class="totals">
    <div><span>QQS (12%):</span><span>${vat.toLocaleString()} ${tr('сум', 'so\'m', 'sum')}</span></div>
    <div><span>${tr('Скидка:', 'Chegirma:', 'Discount:')}</span><span>${escapeHtml(discount)}</span></div>
    <div><span>${tr('Сервис:', 'Xizmat:', 'Service charge:')}</span><span>${escapeHtml(service)}</span></div>
    <div class="grand"><span>${tr('Сумма оплаты', 'To\'lov summasi', 'Payment amount')}</span><span>${e.total.toLocaleString()} ${tr('сум', 'so\'m', 'sum')}</span></div>
  </div>
  ${fiscalRows}
  <div class="foot">POS Terminal v2 &middot; ${new Date().toLocaleString()}</div>
</div>
</body>
</html>`
  }

  function printDetail() {
    const e = detailEntry
    if (!e) return
    ;(async () => {
      const printer = await resolveLogicalPrinter('receipt')
      if (!printer) {
        showToast(t('Выберите принтер для чеков в настройках', 'Sozlamalarda chek printerni tanlang', 'Select receipt printer in Settings'))
        return
      }
      const paperSize: PaperSize = ((dataStore.getItem(PAPER_KEY) as PaperSize) || '58')
      const items = (detailItems && detailItems.length > 0
        ? detailItems.map(it => ({ name: it.productName, mxik: it.mxikCode || '', quantity: it.saleCount, unitPrice: it.salePrice, total: it.totalPrice }))
        : (e.items || []).map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, mxik: i.mxik || '' })))
      const totalSum = e.total
      const servicePercent = e.servicePercent || 0
      const serviceAmount = Math.round(totalSum * servicePercent / 100)
      const discountValue = e.discountType === 'percent'
        ? Math.round(totalSum * (e.discountPercent || 0) / 100)
        : (e.discountAmount || 0)
      const qqsBase = totalSum + serviceAmount - discountValue
      const qqsAmount = Math.round(qqsBase * 12 / 100)
      const итого = qqsBase
      const [dateStr, timeStr] = e.timestamp.split(' ')
      const orderNum = e.receiptSeq || history.indexOf(e) + 1
      const ROLE: Record<string, string> = { waiter: t('Официант', 'Ofitsiant', 'Waiter'), cashier: t('Кассир', 'Kassir', 'Cashier'), admin: t('Администратор', 'Administrator', 'Administrator') }
      const METHOD: Record<string, string> = { cash: t('Наличной', 'Naqd', 'Cash'), card: t('Карта', 'Karta', 'Card'), click: t('Другое', 'Boshqa', 'Other') }

      let qrImgSrc = ''
      if (e.qrCodeUrl) {
        try {
          qrImgSrc = await QRCode.toDataURL(e.qrCodeUrl, { width: 480, margin: 1, errorCorrectionLevel: 'M' })
        } catch {}
      }

      const data = {
        orgName: getCompanyName() || '—', orgAddress: getCompanyAddress() || '', orgPhone: getCompanyPhone() || '',
        orgStir: getCompanyTin() || '—', dateStr: dateStr || '', timeStr: timeStr || '', orderNum,
        tableLabel: e.tableName, guestCount: e.guestCount || 1,
        staffName: e.createdByName || e.createdByRole || '—',
        roleLabel: ROLE[e.createdByRole || ''] || e.createdByRole || '',
        items, totalSum, serviceAmount, servicePercent,
        discountValue, qqsAmount, итого,
        selectedMethod: e.paymentMethod ? METHOD[e.paymentMethod] : t('Не выбран', 'Tanlanmagan', 'Not selected'),
        splitAmounts: null, fmTerminalId: e.terminalId || '', fiscalSign: e.fiscalSign || '',
        qrCodeUrl: e.qrCodeUrl || '', shiftNumber: e.shiftNumber || '001',
      }
      setPrintingCopy(true)
      try {
        await printReceiptHtml(printer, buildFiscalReceiptHtml(data, qrImgSrc), paperSize, 'receipt')
      } catch (err) {
        console.error('Печать изображением не удалась, пробуем текстом:', err)
        try {
          const text = formatFiscalReceipt(data, paperSize)
          await printText(printer, text, 'receipt')
        } catch (e2) {
          showToast(t('Ошибка печати', 'Chop etish xatosi', 'Print error'))
          console.error(e2)
        }
      } finally {
        setPrintingCopy(false)
      }
    })()
  }

  async function downloadPdf() {
    if (!canExportPdf) return
    const gen = window.electronAPI?.generatePdf
    if (!gen) return
    const html = detailHtml()
    if (!html) return
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
      showToast(t('Ошибка создания PDF', 'PDF yaratishda xato', 'PDF creation error'))
    }
  }

  const exportExcel = useCallback(() => {
    const payLabels: Record<string, string> = {
      cash: tr('Наличные', 'Naqd', 'Cash'),
      card: tr('Терминал', 'Terminal', 'Terminal'),
      click: tr('Другое', 'Boshqa', 'Other'),
      split: tr('Разделение', 'Bo\'lish', 'Split'),
    }
    const orderLabels: Record<string, string> = {
      sent: 'Avans-check',
      paid: tr('Фискальный чек', 'Fiskal chek', 'Fiscal receipt'),
      cancelled: tr('Отменено', 'Bekor qilingan', 'Cancelled'),
    }
    const statusLabels: Record<string, string> = {
      sent: tr('Отправлено', 'Yuborilgan', 'Sent'),
      paid: tr('Оплачено', 'To\'landi', 'Paid'),
      cancelled: tr('Отменено', 'Bekor qilingan', 'Cancelled'),
    }
    let table = `<table><thead><tr><th>№</th><th>${tr('Кассир', 'Kassir', 'Cashier')}</th><th>${tr('Тип оплаты', 'To\'lov turi', 'Payment type')}</th><th>${tr('Тип заказа', 'Buyurtma turi', 'Order type')}</th><th>${tr('Сумма', 'Summa', 'Amount')}</th><th>${tr('Статус', 'Holat', 'Status')}</th><th>${tr('Дата и время', 'Sana va vaqt', 'Date and time')}</th></tr></thead><tbody>`
    filtered.forEach((h, i) => {
      table += `<tr><td>${i + 1}</td><td>${h.createdByName || h.createdByRole || '—'}</td><td>${payLabels[h.paymentMethod || ''] || '—'}</td><td>${orderLabels[h.status] || h.status}</td><td>${entryItogo(h)}</td><td>${statusLabels[h.status] || h.status}</td><td>${h.timestamp}</td></tr>`
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
        <h1 className="screen-title">{t('История чеков', 'Cheklar tarixi', 'Receipt history')}</h1>
      </div>

      <div className="history-toolbar">
        <div className="history-toolbar-left">
          <div className="history-date-wrap">
            <div className="history-date-picker" onClick={() => setShowDatePicker(!showDatePicker)}>
              <span className="history-date-label">{hasDateFilter ? `${dateFrom || '...'} — ${dateTo || '...'}` : t('Дата', 'Sana', 'Date')}</span>
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
          <div className="toolbar-divider" />
          <select className="toolbar-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">{t('Все типы', 'Barcha turlar', 'All types')}</option>
            <option value="cash">{t('Наличные', 'Naqd', 'Cash')}</option>
            <option value="card">{t('Терминал', 'Terminal', 'Terminal')}</option>
            <option value="click">{t('Другое', 'Boshqa', 'Other')}</option>
            <option value="split">{t('Разделение', 'Bo\'lish', 'Split')}</option>
          </select>
          <button className="at-action-btn at-action-sync" disabled={syncing} onClick={syncWithCabinet}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {syncing ? t('Синхронизация...', 'Sinxronlash...', 'Syncing...') : t('Синхронизация', 'Sinxronlash', 'Synchronization')}
          </button>
          <button className="hist-export-btn" onClick={exportExcel} title={t('Скачать', 'Yuklab olish', 'Download')}>
            <img src={sheetIcon} alt="" />
            {t('Скачать', 'Yuklab olish', 'Download')}
          </button>
        </div>
        <div className="toolbar-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder={t('Поиск по кассиру, дате или сумме...', 'Kassir, sana yoki summa bo\'yicha qidirish...', 'Search by cashier, date or amount...')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="orders-layout history-layout">
        <div className="history-layout-content">
      <div className="history-table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>№</th>
              <th>{t('Кассир', 'Kassir', 'Cashier')}</th>
              <th>{t('Тип оплаты', 'To\'lov turi', 'Payment type')}</th>
              <th>{t('Тип заказа', 'Buyurtma turi', 'Order type')}</th>
              <th>{t('Сумма', 'Summa', 'Amount')}</th>
              <th>{t('Статус', 'Holat', 'Status')}</th>
              <th>{t('Дата и время', 'Sana va vaqt', 'Date and time')}</th>
              <th>{t('Действие', 'Amal', 'Action')}</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((row, idx) => {
              const config = STATUS_CONFIG[row.status]
              return (
                <tr key={row.id}>
                  <td>#{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                  <td>{row.createdByName || row.createdByRole || '—'}</td>
                  <td><span className="hist-payment-badge">{PAYMENT_LABELS[row.paymentMethod || ''] || '—'}</span></td>
                  <td><span className={`hist-order-type${row.status === 'paid' ? ' green' : ''}`}>{ORDER_TYPE_LABELS[row.status] || row.status}</span></td>
                  <td className="history-total-cell">{entryItogo(row).toLocaleString()} {t('сум', 'so\'m', 'sum')}</td>
                  <td><span className={`history-status-badge ${config.className}`}>{config.label}</span></td>
                  <td>{row.timestamp}</td>
                  <td><button className="hist-details-btn" onClick={() => { fetchDetail(row) }}>{t('Детали', 'Batafsil', 'Details')}</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {paginated.length === 0 && <div className="history-empty">{t('Чеки не найдены', 'Cheklar topilmadi', 'No receipts found')}</div>}
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
      </div>

      {detailEntry && (
        <div className="modal-overlay" onClick={() => { setDetailEntry(null); setDetailItems(null); setDetailFiscal(null) }}>
          <div className="rd-modal" onClick={e => e.stopPropagation()}>
            <div className="rd-header">
              <div className="rd-header-left">
                <span className="rd-header-label">{t('Кассир:', 'Kassir:', 'Cashier:')}</span>
                <span className="rd-header-value">{detailEntry.createdByName || detailFiscal?.terminalId || '—'}</span>
              </div>
              <div className="rd-header-right">
                <span className="rd-header-label">{t('Заказ №', 'Buyurtma №', 'Order #')}</span>
                <span className="rd-header-value">{(history.indexOf(detailEntry) + 1)}</span>
              </div>
            </div>
            <div className="rd-actions">
              <button className="rd-btn rd-btn-print" onClick={printDetail} disabled={printingCopy}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>{printingCopy ? t('Печать…', 'Chop etilmoqda…', 'Printing...') : t('Печать', 'Chop etish', 'Print')}</button>
              <button className="rd-btn" onClick={downloadPdf} disabled={!canExportPdf}>PDF</button>
            </div>

            {loading && <div className="rd-loading">{t('Загрузка данных...', 'Ma\'lumotlar yuklanmoqda...', 'Loading data...')}</div>}

            <div className="rd-table-wrap">
              <table className="rd-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('ИКПУ (МХИК)', 'IKPU (MXIK)', 'MXIK code')}</th>
                    <th>{t('Название товара', 'Tovar nomi', 'Product name')}</th>
                    <th>{t('Цена', 'Narx', 'Price')}</th>
                    <th>{t('Кол-во', 'Soni', 'Qty')}</th>
                    <th>{t('Итого', 'Jami', 'Total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detailItems && detailItems.length > 0 ? detailItems.map((item, idx) => (
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
                  {(!detailItems || detailItems.length === 0) && (!detailEntry.items || detailEntry.items.length === 0) && (
                    <tr><td colSpan={6} className="rd-empty">{t(`${detailEntry.itemCount} блюд(а)`, `${detailEntry.itemCount} ta taom`, `${detailEntry.itemCount} dish(es)`)}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {detailFiscal && (
              <div className="rd-fiscal-info">
                <div className="rd-meta-line"><span>Terminal ID:</span><span>{detailFiscal.terminalId}</span></div>
                <div className="rd-meta-line"><span>{t('Фискальный признак:', 'Fiskal belgi:', 'Fiscal code:')}</span><span>{detailFiscal.fiscalSign}</span></div>
                {detailFiscal.qrCodeUrl && (
                  <div className="rd-meta-line" style={{ justifyContent: 'center' }}>
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(detailFiscal.qrCodeUrl)}`} alt="QR" style={{ width: 100, height: 100 }} />
                  </div>
                )}
                <div className="rd-meta-line">
                  <span>{t('Статус ОФД:', 'OFD holati:', 'OFD status:')}</span>
                  <span>
                    <span className={`ofd-badge ${detailFiscal.ofdStatus === 'synced' ? 'ofd-synced' : 'ofd-pending'}`}>
                      {detailFiscal.ofdStatus === 'synced' ? t('Отправлен', 'Yuborilgan', 'Sent') : t('Ожидает', 'Kutilmoqda', 'Pending')}
                    </span>
                  </span>
                </div>
              </div>
            )}

            <div className="rd-meta">
              <div className="rd-meta-line"><span>{t('Дата:', 'Sana:', 'Date:')}</span><span>{detailEntry.timestamp}</span></div>
              <div className="rd-meta-line"><span>{t('Тип заказа:', 'Buyurtma turi:', 'Order type:')}</span><span className={`hist-order-type${detailEntry.status === 'paid' ? ' green' : ''}`}>{ORDER_TYPE_LABELS[detailEntry.status] || detailEntry.status}</span></div>
              <div className="rd-meta-line"><span>QQS (12%):</span><span>{entryQqs(detailEntry).toLocaleString()} {t('сум', 'so\'m', 'sum')}</span></div>
              <div className="rd-meta-line"><span>{t('Скидка:', 'Chegirma:', 'Discount:')}</span><span>{detailEntry.discountAmount ? `${detailEntry.discountAmount.toLocaleString()} ${t('сум', 'so\'m', 'sum')}` : detailEntry.discountPercent ? `${detailEntry.discountPercent}%` : t('0 сум', '0 so\'m', '0 sum')}</span></div>
              {detailEntry.servicePercent ? (
                <div className="rd-meta-line"><span>{t(`Сервис (${detailEntry.servicePercent}%):`, `Xizmat (${detailEntry.servicePercent}%):`, `Service (${detailEntry.servicePercent}%):`)}</span><span>{Math.round(detailEntry.total * detailEntry.servicePercent / 100).toLocaleString()} {t('сум', 'so\'m', 'sum')}</span></div>
              ) : (
                <div className="rd-meta-line"><span>{t('Сервис:', 'Xizmat:', 'Service charge:')}</span><span>{t('0 сум', '0 so\'m', '0 sum')}</span></div>
              )}
              <div className="rd-meta-line"><span>{t('Гости:', 'Mehmonlar:', 'Guests:')}</span><span>{detailEntry.guestCount ?? '—'}</span></div>
              <div className="rd-meta-line"><span>{t('Смена:', 'Smena:', 'Shift:')}</span><span>{detailEntry.shiftNumber || '—'}</span></div>
              <div className="rd-meta-line rd-meta-total"><span>{t('Сумма оплаты', 'To\'lov summasi', 'Payment amount')}</span><span>{entryItogo(detailEntry).toLocaleString()} {t('сум', 'so\'m', 'sum')}</span></div>
            </div>
            <div className="rd-footer">
              <button className="rd-btn rd-btn-back" onClick={() => { setDetailEntry(null); setDetailItems(null); setDetailFiscal(null) }}>{t('Закрыть', 'Yopish', 'Close')}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast-overlay"><div className="toast-msg">{toast}</div></div>}
    </div>
  )
}
