import { useState, useEffect, useRef } from 'react'
import type { OrderItem } from '../data/types'
import PrintLoadingModal from './PrintLoadingModal'
import QRCode from 'qrcode'
import { fiscalDriveApi, runFullOfdSync } from '../services/fiscalDriveApi'
import { getCompanyTin, getCompanyName, getCompanyAddress, getCompanyPhone, fetchAndStoreCompanyData } from '../utils/companyInfo'
import { buildFiscalReceiptHtml, printReceiptHtml, type PaperSize } from '../utils/receiptHtml'
import { formatFiscalReceipt, printText } from '../utils/printService'
import { getReceiptLogo } from '../utils/receiptLogo'
import { useT, tr, locale } from '../i18n'

const ORDER_COUNTER_KEY = 'pos_v2_order_counter'
const PRINTERS_KEY = 'pos_v2_printer_name'
const PAPER_KEY = 'pos_v2_paper_size'

function getNextOrderNumber(): number {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw = localStorage.getItem(ORDER_COUNTER_KEY)
    const counter: Record<string, number> = raw ? JSON.parse(raw) : {}
    const next = (counter[today] || 0) + 1
    counter[today] = next
    localStorage.setItem(ORDER_COUNTER_KEY, JSON.stringify(counter))
    return next
  } catch {
    return Math.floor(Math.random() * 9000) + 1000
  }
}

interface FiscalData {
  fiscalSign: string
  qrCodeUrl: string
  terminalId: string
  receiptSeq: number
  receiptId: string
  locId: string
  factoryId?: string
  ofdStatus?: 'synced' | 'pending'
}

interface CheckReceiptProps {
  items: OrderItem[]
  tableName: string
  guestCount: number
  staffName: string
  userRole: string
  shiftNumber?: string
  servicePercent: number
  discountType: 'percent' | 'amount'
  discountPercent: number
  discountAmount: number
  selectedMethod: 'cash' | 'card' | 'click' | null
  splitAmounts?: { cash: number; card: number; click: number } | null
  onBack: () => void
  onComplete: (fiscalData?: FiscalData) => void
}

export default function CheckReceipt({
  items, tableName, guestCount, staffName, userRole, shiftNumber = '001', servicePercent,
  discountType, discountPercent, discountAmount, selectedMethod, splitAmounts,
  onBack, onComplete,
}: CheckReceiptProps) {
  const t = useT()
  const methodLabel: Record<string, string> = {
    cash: t('Наличной', 'Naqd'),
    card: t('Карта', 'Karta'),
    click: t('Другое', 'Boshqa'),
  }
  const ROLE_LABELS: Record<string, string> = { waiter: t('Официант', 'Ofitsiant'), cashier: t('Кассир', 'Kassir'), admin: t('Администратор', 'Administrator') }
  const [fiscalOrderNum, setFiscalOrderNum] = useState(0)
  const [fiscalData, setFiscalData] = useState<FiscalData | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [fmConnected, setFmConnected] = useState(false)
  const [fmChecking, setFmChecking] = useState(true)
  const [fmCheckTime, setFmCheckTime] = useState(new Date())
  const [fmFactoryId, setFmFactoryId] = useState('')
  const [fmTerminalId, setFmTerminalId] = useState('')
  const [fmDescription, setFmDescription] = useState('')
  const [printingFiscal, setPrintingFiscal] = useState(false)
  const [finishingPayment, setFinishingPayment] = useState(false)
  const [fiscalIssued, setFiscalIssued] = useState(false)
  const [orgStir, setOrgStir] = useState(getCompanyTin)
  const [orgName, setOrgName] = useState(getCompanyName)
  const [orgAddress, setOrgAddress] = useState(getCompanyAddress)
  const [orgPhone, setOrgPhone] = useState(getCompanyPhone)
  const fiscalResultRef = useRef<{ queued: boolean; ofdSynced: boolean; failed: boolean; lastError: string }>({ queued: false, ofdSynced: false, failed: false, lastError: '' })

  async function checkInternet(): Promise<boolean> {
    try {
      const res = await fetch('/api/internet-check')
      if (!res.ok) return false
      const data = await res.json()
      return data.ok !== false
    } catch {
      return false
    }
  }

  async function getLocation(): Promise<{ latitude: string; longitude: string } | null> {
    const cached = localStorage.getItem('pos_v2_location')
    if (cached) try { return JSON.parse(cached) } catch {}
    if ('geolocation' in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, enableHighAccuracy: false })
        )
        const loc = { latitude: String(pos.coords.latitude), longitude: String(pos.coords.longitude) }
        localStorage.setItem('pos_v2_location', JSON.stringify(loc))
        return loc
      } catch {}
    }
    try {
      const res = await fetch('https://ipapi.co/json/')
      if (res.ok) {
        const data = await res.json()
        if (data.latitude && data.longitude) {
          const loc = { latitude: String(data.latitude), longitude: String(data.longitude) }
          localStorage.setItem('pos_v2_location', JSON.stringify(loc))
          return loc
        }
      }
    } catch {}
    return null
  }

  useEffect(() => {
    ;(async () => {
      try {
        const info = await fetchAndStoreCompanyData()
        if (info) {
          if (info.stir) setOrgStir(info.stir)
          if (info.name) setOrgName(info.name)
          if (info.address) setOrgAddress(info.address)
          if (info.phone) setOrgPhone(info.phone)
        }
      } catch {}
    })()
  }, [])

  async function probeFiscalModule() {
    let connected = false
    let factoryId = ''
    let terminalId = ''
    let description = ''
    try {
      const data = await fiscalDriveApi.listFiscalDrives()
      let list = Array.isArray(data) ? data : (Array.isArray((data as any)?.data) ? (data as any).data : [])

      if (list.length > 0) {
        const fm = list[0]
        factoryId = fm.FactoryID || fm.factoryId || ''
        try {
          const info = await fiscalDriveApi.getFiscalMemoryInfo(factoryId)
          const i = info?.data || info || {}
          terminalId = i.TerminalID || i.terminalId || i.terminal_id || ''
        } catch {}
        connected = true
        description = fm.Description || fm.description || ''
      }
    } catch {}
    return { connected, factoryId, terminalId, description }
  }

  async function detectFiscalModules() {
    setFmChecking(true)
    setFmConnected(false)
    const r = await probeFiscalModule()
    setFmConnected(r.connected)
    setFmFactoryId(r.factoryId)
    setFmTerminalId(r.terminalId)
    setFmDescription(r.description)
    setFmCheckTime(new Date())
    setFmChecking(false)
  }

  useEffect(() => {
    detectFiscalModules()
  }, [])

  const totalSum = items.reduce((s, i) => s + i.total, 0)
  const serviceAmount = Math.round(totalSum * servicePercent / 100)
  const discountValue = discountType === 'percent'
    ? Math.round(totalSum * discountPercent / 100)
    : discountAmount
  const qqsBase = totalSum + serviceAmount - discountValue
  const qqsAmount = Math.round(qqsBase * 12 / 100)
  const итого = qqsBase

  const now = new Date()
  const dateStr = now.toLocaleDateString(locale())
  const timeStr = now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })

  function handleRefreshFm() {
    if (fmChecking) return
    detectFiscalModules()
  }

  function showToastMsg(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function queueFiscalReceipt(payload: any, error: string) {
    const queue = JSON.parse(localStorage.getItem('pos_v2_fiscal_queue') || '[]')
    queue.push({
      id: payload?._receiptId || `FAIL-${Date.now()}`,
      receipt: payload,
      meta: {},
      status: 'failed',
      attempts: 0,
      nextRetryAt: Date.now() + 60000,
      lastError: error,
      createdAt: new Date().toISOString(),
    })
    localStorage.setItem('pos_v2_fiscal_queue', JSON.stringify(queue))
    fiscalResultRef.current.queued = true
  }

  function buildFiscalPayload(orderNum: number, loc: { latitude: string; longitude: string } | null): any {
    const totalSvc = serviceAmount
    const totalDisc = discountValue
    const sumTotals = items.reduce((s, i) => s + i.total, 0)
    const fdItems = items.map(i => {
      const prop = sumTotals > 0 ? i.total / sumTotals : 1 / items.length
      const itemSvc = Math.round(totalSvc * prop)
      const itemDisc = Math.round(totalDisc * prop)
      const price = i.total * 100 + itemSvc * 100
      return {
        Name: i.menuItem.name.slice(0, 72),
        Amount: Math.round(i.quantity * 1000),
        Price: price,
        VATPercent: 12,
        VAT: Math.round(price * 12 / 100),
        Discount: itemDisc * 100,
        SPIC: i.menuItem.mxik || '09901001001000000',
        PackageCode: String(i.menuItem.unitCode || '0'),
        Units: Number(i.menuItem.unitCode) || 1,
        Other: 0,
        OwnerType: 0,
      }
    })
    const fdNow = () => {
      const d = new Date()
      d.setMinutes(d.getMinutes() + 5)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    }
    return {
      Time: fdNow(),
      ReceivedCash: selectedMethod === 'cash' ? Math.round(итого * 100) : 0,
      ReceivedCard: selectedMethod !== 'cash' ? Math.round(итого * 100) : 0,
      Type: 0,
      Operation: 0,
      Items: fdItems,
      ExtraInfo: {
        TIN: orgStir || getCompanyTin() || '200200200',
        ...(loc || {}),
      },
      Location: loc ? { latitude: Number(loc.latitude), longitude: Number(loc.longitude) } : undefined,
      _receiptId: `CHK-${orderNum}-${Date.now()}`,
      _cashier: staffName,
    }
  }

  async function handleFiscalIssue() {
    const printer = localStorage.getItem(PRINTERS_KEY)
    if (!printer) { showToastMsg(tr('Подключите принтер в настройках', 'Sozlamalarda printerni ulang')); return }

    const fm = await probeFiscalModule()
    setFmConnected(fm.connected)
    setFmFactoryId(fm.factoryId)
    setFmTerminalId(fm.terminalId)
    setFmDescription(fm.description)
    if (!fm.connected || !fm.factoryId) {
      showToastMsg(tr('Подключите фискальный модуль', 'Fiskal modulni ulang'))
      return
    }

    const online = await checkInternet()
    if (!online) {
      showToastMsg(tr('Нет подключения к интернету', "Internetga ulanish yo'q"))
      return
    }

    const shiftOpen = localStorage.getItem('pos_v2_shift_open') === 'true'
    if (!shiftOpen) { showToastMsg(tr('Сначала откройте смену в Фискальном модуле', 'Avval Fiskal modulda smenani oching')); return }
    if (!fiscalOrderNum) setFiscalOrderNum(getNextOrderNumber())
    setPrintingFiscal(true)
  }

  async function fiscalPrintTask() {
    const printer = localStorage.getItem(PRINTERS_KEY)
    const paperSize: PaperSize = ((localStorage.getItem(PAPER_KEY) as PaperSize) || '58')
    const orderNum = fiscalOrderNum || getNextOrderNumber()

    let payload: any = null
    let regData: any = null
    try {
      const loc = await getLocation()
      payload = buildFiscalPayload(orderNum, loc)
      const regRes = await fetch(`/api/fiscal-register-receipt/${fmFactoryId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('pos_v2_cabinet_token') || ''}`
        },
        body: JSON.stringify(payload),
      })
      if (regRes.ok) {
        regData = await regRes.json()
      } else {
        const errText = await regRes.text().catch(() => '')
        fiscalResultRef.current.failed = true
        fiscalResultRef.current.lastError = `HTTP ${regRes.status}${errText ? ': ' + errText.slice(0, 100) : ''}`
        return
      }
    } catch (e: any) {
      fiscalResultRef.current.failed = true
      fiscalResultRef.current.lastError = e.message || tr('соединение не удалось', "ulanish amalga oshmadi")
      return
    }

    fiscalResultRef.current.failed = false
    fiscalResultRef.current.queued = false

    let ofdStat: 'synced' | 'pending' = 'pending'
    try {
      const syncRes = await runFullOfdSync(fmFactoryId)
      if (syncRes.totalRemaining === 0) {
        ofdStat = 'synced'
      }
    } catch {}
    fiscalResultRef.current.ofdSynced = ofdStat === 'synced'

    const fd: FiscalData = {
      fiscalSign: regData.fiscalSign || '',
      qrCodeUrl: regData.qrCodeUrl || '',
      terminalId: regData.terminalId || '',
      receiptSeq: regData.receiptSeq || 0,
      receiptId: regData.receiptId || payload._receiptId || '',
      locId: regData.locId || '',
      factoryId: fmFactoryId,
      ofdStatus: ofdStat,
    }
    setFiscalData(fd)
    localStorage.setItem('pos_v2_last_fiscal', JSON.stringify(fd))

    let qrImgSrc = ''
    const qrPayload = regData.qrCodeUrl || ''
    if (qrPayload) {
      try {
        qrImgSrc = await QRCode.toDataURL(qrPayload, { width: 480, margin: 1, errorCorrectionLevel: 'M' })
      } catch {}
    }

    const receiptNow = new Date()
    const receiptDateStr = receiptNow.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' })
    const receiptTimeStr = receiptNow.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const roleLabel = ROLE_LABELS[userRole] || userRole

    const html = buildFiscalReceiptHtml({
      orgName: orgName || '—', orgAddress: orgAddress || '', orgPhone: orgPhone || '',
      orgStir: orgStir || '—', dateStr: receiptDateStr, timeStr: receiptTimeStr, orderNum,
      tableLabel: tableName, guestCount, staffName, roleLabel, shiftNumber,
      items: items.map(i => ({
        name: i.menuItem.name, quantity: i.quantity,
        unitPrice: i.unitPrice, total: i.total, mxik: i.menuItem.mxik || '',
      })),
      totalSum, serviceAmount, servicePercent,
      discountValue, qqsAmount, итого,
      selectedMethod: selectedMethod ? methodLabel[selectedMethod] : t('Не выбран', 'Tanlanmagan'),
      splitAmounts, fmTerminalId, fiscalSign: fd.fiscalSign, qrCodeUrl: fd.qrCodeUrl,
    }, qrImgSrc)

    try {
      await printReceiptHtml(printer!, html, paperSize)
    } catch (e) {
      console.error('Печать изображением не удалась, пробуем текстом:', e)
      try {
        const text = formatFiscalReceipt({
          orgName: orgName || '—', orgAddress: orgAddress || '', orgPhone: orgPhone || '',
          orgStir: orgStir || '—', dateStr: receiptDateStr, timeStr: receiptTimeStr, orderNum,
          tableLabel: tableName, guestCount, staffName, roleLabel, shiftNumber,
          items: items.map(i => ({
            name: i.menuItem.name, quantity: i.quantity,
            unitPrice: i.unitPrice, total: i.total, mxik: i.menuItem.mxik || '',
          })),
          totalSum, serviceAmount, servicePercent,
          discountValue, qqsAmount, итого,
          selectedMethod: selectedMethod ? methodLabel[selectedMethod] : t('Не выбран', 'Tanlanmagan'),
          splitAmounts, fmTerminalId, fiscalSign: fd.fiscalSign, qrCodeUrl: fd.qrCodeUrl,
        }, paperSize)
        await printText(printer!, text)
      } catch (e2) {
        alert(tr('Ошибка печати: ' + (e2 instanceof Error ? e2.message : 'неизвестная ошибка'), "Chop etish xatosi: " + (e2 instanceof Error ? e2.message : "noma'lum xato")))
      }
    }
  }

  async function finishPaymentTask() {
    const orderNum = fiscalOrderNum || getNextOrderNumber()
    if (!fiscalOrderNum) setFiscalOrderNum(orderNum)
    let loc: { latitude: string; longitude: string } | null = null
    try { loc = await getLocation() } catch {}
    const payload = buildFiscalPayload(orderNum, loc)
    queueFiscalReceipt(payload, tr('Не отправлен (завершение оплаты)', "Yuborilmagan (to'lovni yakunlash)"))
  }

  function handleCompletePayment() {
    if (fiscalData || fiscalResultRef.current.queued) {
      setTimeout(() => onComplete(fiscalData || undefined), 100)
      return
    }
    setFinishingPayment(true)
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" />
            <path d="M8 7h8" /><path d="M8 11h8" /><path d="M8 15h5" />
          </svg>
          {t('Чек / Квитанция', 'Chek / Kvitansiya')}
        </h1>
        <div className="menu-header-btns">
          <button className="menu-header-btn back" onClick={onBack}>{t('Назад', 'Orqaga')}</button>
        </div>
      </div>

      <div className="order-info-bar">
        <div className="order-info-item">
          <span className="order-info-label">{t('Стол:', 'Stol:')}</span>
          <span className="order-info-value">{tableName}</span>
        </div>
        <div className="order-info-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>{guestCount} {t('чел.', 'kishi')}</span>
        </div>
        <div className="order-info-item">
          <span>{dateStr}</span>
          <span className="order-info-time">{timeStr}</span>
        </div>
      </div>

      <div className="cashier-payment-layout">
        <div className="cashier-payment-left">
          <div className="payment-summary-box">
            <div style={{ padding: '12px 24px', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{t('Информация чека', "Chek ma'lumoti")}</h3>
            </div>
            <div className="payment-summary-inner" style={{ padding: 0 }}>
              <div className="ac-receipt paper-58" style={{ width: '100%', border: 'none', margin: 0, padding: '20px 24px', maxWidth: 'none', boxSizing: 'border-box' }}>
                <div style={{ textAlign: 'center', marginBottom: 8 }}>
                  <img src={getReceiptLogo()} alt="Logo" style={{ width: 100, height: 100, objectFit: 'contain' }} />
                </div>
                <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{orgName}</div>
                <div style={{ textAlign: 'center', fontSize: 10, color: '#555' }}>{orgAddress}</div>
                <div style={{ textAlign: 'center', fontSize: 10, color: '#555', marginBottom: 6 }}>{orgPhone}</div>

                <div className="ac-divider dashed" />

                {items.map(item => (
                  <div key={item.id} className="ac-item">
                    <div className="ac-item-line">
                      <span className="ac-item-name">{item.menuItem.name}</span>
                      <span className="ac-item-right">{item.quantity} x {item.unitPrice.toLocaleString()}</span>
                    </div>
                  </div>
                ))}

                <div className="ac-divider solid" />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#555' }}>{t('Общая сумма', 'Umumiy summa')}</span>
                    <span style={{ fontWeight: 700 }}>{totalSum.toLocaleString()} {t('сум', "so'm")}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#555' }}>{t(`Сервис (${servicePercent}%)`, `Xizmat (${servicePercent}%)`)}</span>
                    <span style={{ fontWeight: 700 }}>{serviceAmount.toLocaleString()} {t('сум', "so'm")}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#555' }}>{t('Скидка', 'Chegirma')}</span>
                    <span style={{ fontWeight: 700, color: discountValue > 0 ? '#ef4444' : '#1e293b' }}>{discountValue > 0 ? `−${discountValue.toLocaleString()}` : '0'} {t('сум', "so'm")}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#555' }}>QQS (12%)</span>
                    <span style={{ fontWeight: 700 }}>{qqsAmount.toLocaleString()} {t('сум', "so'm")}</span>
                  </div>
                </div>

                <div className="ac-divider solid" />

                <div className="ac-total">
                  <span>{t('ИТОГО:', 'JAMI:')}</span>
                  <span className="ac-total-value">{итого.toLocaleString()} {t('сум', "so'm")}</span>
                </div>

                <div className="ac-divider dashed" />

                {splitAmounts ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 4 }}>{t('Разделение счета', "Hisobni bo'lish")}</span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5">
                          <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" />
                        </svg>
                        {t('Наличной', 'Naqd')}
                      </span>
                      <span style={{ fontWeight: 700 }}>{splitAmounts.cash.toLocaleString()} {t('сум', "so'm")}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5">
                          <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
                        </svg>
                        {t('Карта', 'Karta')}
                      </span>
                      <span style={{ fontWeight: 700 }}>{splitAmounts.card.toLocaleString()} {t('сум', "so'm")}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5">
                          <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
                        </svg>
                        {t('Другое', 'Boshqa')}
                      </span>
                      <span style={{ fontWeight: 700 }}>{splitAmounts.click.toLocaleString()} {t('сум', "so'm")}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>{t('Выбор оплаты', "To'lov usuli")}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {selectedMethod === 'cash' && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5">
                          <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                      {selectedMethod === 'card' && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5">
                          <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
                        </svg>
                      )}
                      {selectedMethod === 'click' && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5">
                          <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
                        </svg>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#333' }}>
                        {selectedMethod ? methodLabel[selectedMethod] : t('Не выбран', 'Tanlanmagan')}
                      </span>
                    </div>
                  </div>
                )}

                <div className="ac-divider dashed" />

                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <img src="/QR.svg" alt="QR" style={{ width: 150, height: 150 }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="cashier-payment-right">
          <div className="payment-summary-box" style={{ position: 'relative' }}>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{t('Информация о Фискальном модуле', "Fiskal modul haqida ma'lumot")}</h3>
                <button
                  onClick={handleRefreshFm}
                  disabled={fmChecking}
                  style={{ border: 'none', background: 'transparent', cursor: fmChecking ? 'default' : 'pointer', color: '#64748b', padding: 4, display: 'flex' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: fmChecking ? 'spin 0.8s linear infinite' : 'none' }}>
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                  <span style={{ color: '#64748b' }}>FM</span>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{fmConnected ? (fmTerminalId || fmDescription || fmFactoryId) : '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                  <span style={{ color: '#64748b' }}>{t('Последняя проверка', 'Oxirgi tekshiruv')}</span>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>
                    {fmChecking ? t('Проверка...', 'Tekshirilmoqda...') : `${fmCheckTime.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' })} ${fmCheckTime.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, alignItems: 'center' }}>
                  <span style={{ color: '#64748b' }}>{t('Статус', 'Holat')}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {fmChecking ? (
                      <span style={{ fontSize: 13, color: '#f97316', fontWeight: 600 }}>{t('Проверка...', 'Tekshirilmoqda...')}</span>
                    ) : (
                      <>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: fmConnected ? '#22c55e' : '#ef4444' }} />
                        <span style={{ fontWeight: 700, color: fmConnected ? '#16a34a' : '#dc2626' }}>
                          {fmConnected ? t('Подключен', 'Ulangan') : t('Не подключен', 'Ulanmagan')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            <button
              className="kitchen-action-btn primary"
              style={{ padding: '16px 20px', fontSize: 16 }}
              disabled={fiscalIssued}
              onClick={handleFiscalIssue}
            >
              {t('Выдать фискальный чек', 'Fiskal chek berish')}
            </button>
            <button className="kitchen-action-btn primary" style={{ padding: '16px 20px', fontSize: 16, background: '#22c55e' }} onClick={handleCompletePayment}>
              {t('Завершить оплату', "To'lovni yakunlash")}
            </button>
          </div>
        </div>
      </div>

      {printingFiscal && (
        <PrintLoadingModal
          task={fiscalPrintTask}
          onComplete={() => {
            setPrintingFiscal(false)
            if (fiscalResultRef.current.failed) {
              showToastMsg(tr('Не удалось зарегистрировать чек: ' + (fiscalResultRef.current.lastError || 'неизвестная ошибка'), "Chekni ro'yxatdan o'tkazib bo'lmadi: " + (fiscalResultRef.current.lastError || "noma'lum xato")))
              return
            }
            setFiscalIssued(true)
            showToastMsg(
              fiscalResultRef.current.ofdSynced
                ? tr('Чек зарегистрирован и отправлен в ОФД', "Chek ro'yxatdan o'tkazildi va OFDga yuborildi")
                : tr('Фискальный чек выдан', 'Fiskal chek berildi')
            )
          }}
        />
      )}

      {finishingPayment && (
        <PrintLoadingModal
          task={finishPaymentTask}
          onComplete={() => { setFinishingPayment(false); handleCompletePayment() }}
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
