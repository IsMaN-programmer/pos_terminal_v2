import { useState, useEffect, useCallback, useRef } from 'react'
import { dataStore } from '../services/dataStore'
import { useNetworkStore } from '../services/networkSocket'
import { fiscalDriveApi, runFullOfdSync } from '../services/fiscalDriveApi'
import { onFiscalUsbChange } from '../services/fiscalNative'
import { tr, useT, locale } from '../i18n'
import { buildCabinetReceiptPayload, queueCabinetReceipt, sendCabinetReceipt } from '../services/receiptSync'
import { isNativeMobile } from '../services/capacitor'
import usbIcon from '../assets/icons/usb.png'

const FM_LIST_KEY = 'pos_v2_fm_list'
const SHIFT_OPEN_KEY = 'pos_v2_shift_open'
const SHIFT_INFO_KEY = 'pos_v2_shift_info'
const LAST_CLOSE_TIMES_KEY = 'pos_v2_fm_last_close_times'

function validShiftTime(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  const date = new Date(value.trim().replace(' ', 'T'))
  return Number.isFinite(date.getTime()) && date.getFullYear() >= 2000 ? value.trim() : ''
}

function loadLastCloseTimes(): Record<string, string> {
  try {
    const raw = JSON.parse(dataStore.getItem(LAST_CLOSE_TIMES_KEY) || '{}')
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch { return {} }
}

interface ShiftInfo {
  openTime: string
  closeTime: string
  firstReceiptSeq: number
  lastReceiptSeq: number
  terminalId: string
  totalSaleCount: number
  totalRefundCount: number
  totalCash: { Sale: number; Refund: number }
  totalCard: { Sale: number; Refund: number }
  totalVAT: { Sale: number; Refund: number }
}

function normalizeShiftInfoKeys(raw: any): ShiftInfo {
  const keyMap: Record<string, string> = {
    'opentime': 'openTime',
    'closetime': 'closeTime',
    'firstreceiptseq': 'firstReceiptSeq',
    'lastreceiptseq': 'lastReceiptSeq',
    'terminalid': 'terminalId',
    'totalsalecount': 'totalSaleCount',
    'totalrefundcount': 'totalRefundCount',
    'totalcash': 'totalCash',
    'totalcard': 'totalCard',
    'totalvat': 'totalVAT',
  }
  const result: any = {}
  for (const [key, value] of Object.entries(raw)) {
    const mapped = keyMap[key.toLowerCase()]
    result[mapped || key] = value
  }
  return result as ShiftInfo
}

interface FMDevice {
  factoryId: string
  description: string
  readerName: string
  terminalId: string
}

interface UnsentItem {
  id: string
  receipt: any
  meta: any
  status: 'pending' | 'success' | 'failed'
  attempts: number
  nextRetryAt: number
  lastError: string
  createdAt: string
}

const QUEUE_KEY = 'pos_v2_fiscal_queue'

function loadQueue(): UnsentItem[] {
  try { return JSON.parse(dataStore.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}

function saveQueue(q: UnsentItem[]) {
  dataStore.setItem(QUEUE_KEY, JSON.stringify(q))
}

function fdShiftOpenTime(t: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = new Date(t.replace(' ', 'T'))
  d.setSeconds(d.getSeconds() - 5)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function fmtLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function fdSafeTimeFromFm(factoryId: string, t?: string): Promise<string> {
  const refs: number[] = []
  const nowRef = new Date()
  nowRef.setMinutes(nowRef.getMinutes() + 5)
  refs.push(nowRef.getTime())
  if (t) {
    const p = new Date(t.replace(' ', 'T'))
    if (!isNaN(p.getTime())) refs.push(p.getTime())
  }
  try {
    const info = await fiscalDriveApi.getFiscalMemoryInfo(factoryId)
    const i = info?.data || info || {}
    const lastOp = i.LastOperationTime || i.lastOperationTime || ''
    if (lastOp) {
      const p = new Date(lastOp.replace(' ', 'T'))
      if (!isNaN(p.getTime())) refs.push(p.getTime())
    }
  } catch {}
  try {
    const z = await fiscalDriveApi.getZReportInfo(factoryId, 0)
    const zd = z?.data && typeof z.data === 'object' ? z.data : z
    const openT = zd.OpenTime || zd.openTime || zd.opentime || zd.LastOpenTime || zd.lastOpenTime || zd.lastopentime || ''
    if (openT) {
      const p = new Date(openT.replace(' ', 'T'))
      if (!isNaN(p.getTime())) refs.push(p.getTime())
    }
  } catch {}
  const base = new Date(Math.max(...refs))
  base.setSeconds(base.getSeconds() + 30)
  return fmtLocal(base)
}

function loadShiftOpen(): boolean {
  try { return dataStore.getItem(SHIFT_OPEN_KEY) === 'true' } catch { return false }
}

function saveShiftOpen(v: boolean) {
  dataStore.setItem(SHIFT_OPEN_KEY, v ? 'true' : 'false')
}

function loadShiftInfo(): ShiftInfo | null {
  try {
    const raw = dataStore.getItem(SHIFT_INFO_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveShiftInfo(v: ShiftInfo | null) {
  if (v) dataStore.setItem(SHIFT_INFO_KEY, JSON.stringify(v))
  else dataStore.removeItem(SHIFT_INFO_KEY)
}

export default function FiscalModule() {
  const netState = useNetworkStore()
  const networkBlocked = !isNativeMobile() && netState.role === 'neutral'
  const [devices, setDevices] = useState<FMDevice[]>(() => {
    try { return JSON.parse(dataStore.getItem(FM_LIST_KEY) || '[]') } catch { return [] }
  })
  const [selectedFactoryId, setSelectedFactoryId] = useState('')
  const [fmInfo, setFmInfo] = useState<any>(null)
  const [shiftOpen, setShiftOpen] = useState(loadShiftOpen)
  const [shiftInfo, setShiftInfo] = useState<ShiftInfo | null>(loadShiftInfo)
  const [lastCloseTimes, setLastCloseTimes] = useState(loadLastCloseTimes)
  const [unsentItems, setUnsentItems] = useState<UnsentItem[]>(loadQueue)
  const [pendingOfdCount, setPendingOfdCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const infoSectionRef = useRef<HTMLDivElement>(null)
  const t = useT()

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])

  const doSetShiftOpen = useCallback((v: boolean) => {
    setShiftOpen(v)
    saveShiftOpen(v)
  }, [])

  const doSetShiftInfo = useCallback((v: ShiftInfo | null) => {
    setShiftInfo(v)
    saveShiftInfo(v)
  }, [])

  const rememberCloseTime = useCallback((fid: string, value: unknown) => {
    const closeTime = validShiftTime(value)
    if (!fid || !closeTime) return
    const saved = loadLastCloseTimes()
    const previous = validShiftTime(saved[fid])
    if (previous && new Date(previous.replace(' ', 'T')) >= new Date(closeTime.replace(' ', 'T'))) return
    const next = { ...saved, [fid]: closeTime }
    dataStore.setItem(LAST_CLOSE_TIMES_KEY, JSON.stringify(next))
    setLastCloseTimes(next)
  }, [])

  useEffect(() => dataStore.subscribe(LAST_CLOSE_TIMES_KEY, () => {
    setLastCloseTimes(loadLastCloseTimes())
  }), [])

  const factoryId = selectedFactoryId || devices[0]?.factoryId || ''

  const listDevices = useCallback(async () => {
    try {
      const list = await fiscalDriveApi.listFiscalDrives()
      const arr = Array.isArray(list) ? list : (Array.isArray((list as any)?.data) ? (list as any).data : [])
      if (arr.length > 0) {
        const mapped: FMDevice[] = arr.map((d: any) => ({
          factoryId: d.FactoryID || d.factoryId || '',
          description: d.Description || d.description || '',
          readerName: d.ReaderName || d.readerName || '',
          terminalId: d.TerminalID || d.terminalId || '',
        }))
        setDevices(mapped)
        dataStore.setItem(FM_LIST_KEY, JSON.stringify(mapped))
        if (!selectedFactoryId && mapped[0]) setSelectedFactoryId(mapped[0].factoryId)
      } else if (isNativeMobile()) {
        setDevices([])
        setSelectedFactoryId('')
        dataStore.setItem(FM_LIST_KEY, '[]')
      }
    } catch (error: any) {
      if (isNativeMobile()) {
        setDevices([])
        setSelectedFactoryId('')
        setError(error?.message || tr('Не удалось прочитать фискальный модуль', 'Fiskal modulni o‘qib bo‘lmadi'))
      }
    }
  }, [selectedFactoryId])

  const fetchFmInfo = useCallback(async (fid: string) => {
    if (!fid) return
    try {
      const data = await fiscalDriveApi.getFiscalMemoryInfo(fid)
      const i = data?.data || data || {}
      setFmInfo(i)
      const fmCount = i.ReceiptsCount ?? i.receiptsCount ?? 0

      // Also check DB count (Status=0)
      let dbCount = 0
      try {
        const counts = await fiscalDriveApi.getFilesCount(0)
        if (counts && typeof counts === 'object') {
          dbCount = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0)
        }
      } catch {}

      setPendingOfdCount(Math.max(fmCount, dbCount))
    } catch {}
  }, [])

  const fetchShiftInfo = useCallback(async (fid: string) => {
    if (!fid) return
    try {
      const data = await fiscalDriveApi.getZReportInfo(fid, 0)
      const z = normalizeShiftInfoKeys(data?.data || data || {})
      const currentCloseTime = validShiftTime(z.closeTime)
      if (currentCloseTime) {
        rememberCloseTime(fid, currentCloseTime)
      } else {
        try {
          // Index 0 is the current Z-report; index 1 is the previous one.
          const previous = await fiscalDriveApi.getZReportInfo(fid, 1, ['03'])
          const closed = normalizeShiftInfoKeys(previous?.data || previous || {})
          rememberCloseTime(fid, closed.closeTime)
        } catch { /* Keep the last known closing time if the previous report is unavailable. */ }
      }
      if (z.openTime) {
        doSetShiftOpen(!currentCloseTime)
        doSetShiftInfo(z)
      } else {
        doSetShiftOpen(false)
        doSetShiftInfo(null)
      }
    } catch { /* keep cached state on network error */ }
  }, [doSetShiftInfo, doSetShiftOpen, rememberCloseTime])



  const openShift = useCallback(async () => {
    if (networkBlocked) { showToast(tr('Сначала создайте IP или подключитесь к кассе в настройках', 'Avval sozlamalarda IP yarating yoki kassaga ulaning', 'Please create an IP or connect to the cash register in Settings first')); return }
    if (!factoryId) { showToast(tr('Фискальный модуль не найден', 'Fiskal modul topilmadi', 'Fiscal module not found')); return }
    setLoading(true)
    setError('')
    try {
      try {
        await fiscalDriveApi.openZReport(factoryId, await fdSafeTimeFromFm(factoryId))
      } catch (openError: any) {
        if (!/9090|LOCKED_SYNC_WITH_SERVER/i.test(String(openError?.message || openError))) throw openError
        const syncResult = await runFullOfdSync(factoryId)
        if (!syncResult.success || syncResult.details?.stateError) {
          throw new Error(syncResult.details?.stateError || syncResult.error || 'Не удалось синхронизировать ФМ с ОФД')
        }
        await fiscalDriveApi.openZReport(factoryId, await fdSafeTimeFromFm(factoryId))
      }
      showToast(tr('Смена открыта', 'Smena ochiq', 'Shift is open'))
      await fetchShiftInfo(factoryId)
    } catch (e: any) {
      setError(tr(`Не удалось открыть смену: ${e.message || 'ошибка'}`, `Smenani ochishning imkoni bo\'lmadi: ${e.message || 'xato'}`))
    }
    setLoading(false)
  }, [factoryId, fetchShiftInfo, showToast, networkBlocked])

  const closeShift = useCallback(async () => {
    if (!factoryId) { showToast(tr('Фискальный модуль не найден', 'Fiskal modul topilmadi', 'Fiscal module not found')); return }
    if (unsentItems.some(i => i.status === 'pending' || i.status === 'failed')) {
      showToast(tr('Сначала отправьте неотправленные чеки', 'Avval yuborilmagan cheklarni yuboring', 'Please send unsent receipts first'))
      return
    }
    if (shiftOpen && (!shiftInfo || !shiftInfo.totalSaleCount)) {
      showToast(tr('Нет зарегистрированных чеков за смену', 'Smenada ro\'yxatga olingan cheklar yo\'q', 'No registered receipts for the shift'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const closeTime = await fdSafeTimeFromFm(factoryId)
      await fiscalDriveApi.closeZReport(factoryId, closeTime)
      rememberCloseTime(factoryId, closeTime)
      showToast(tr('Смена закрыта', 'Smena yopiq', 'Shift is closed'))
      doSetShiftOpen(false)
      doSetShiftInfo(null)
    } catch (e: any) {
      setError(tr(`Не удалось закрыть смену: ${e.message || 'ошибка'}`, `Smenani yopishning imkoni bo\'lmadi: ${e.message || 'xato'}`))
    }
    setLoading(false)
  }, [factoryId, unsentItems, shiftOpen, shiftInfo, showToast, doSetShiftInfo, doSetShiftOpen, rememberCloseTime])

  const sendUnsentReceipts = useCallback(async () => {
    if (!factoryId) { showToast(tr('Фискальный модуль не найден', 'Fiskal modul topilmadi', 'Fiscal module not found')); setLoading(false); return }
    setLoading(true)
    let pending = unsentItems.filter(i => i.status === 'pending' || i.status === 'failed')
    let ok = 0, fail = 0

    // 1. Process local pending queue
    for (const item of pending) {
      try {
        const receipt: any = { Time: await fdSafeTimeFromFm(factoryId, item.receipt?.Time) }
        for (const [k, v] of Object.entries(item.receipt || {})) {
          if (!k.startsWith('_') && k !== 'Time') receipt[k] = v
        }
        if (isNativeMobile()) receipt._receiptId = item.receipt?._receiptId || item.id
        const curTin = (dataStore.getItem('pos_v2_company_tin') || dataStore.getItem('pos_v2_company_stir') || '').trim()
        if (/^\d{9}$/.test(curTin)) {
          receipt.ExtraInfo = { ...(receipt.ExtraInfo || {}), TIN: curTin }
        }
        const txData = await fiscalDriveApi.getReceiptTXID(factoryId, receipt)
        const txRaw = txData && typeof txData === 'object'
          ? (txData?.data ?? txData?.txId ?? txData?.TXID ?? JSON.stringify(txData))
          : txData
        const txIdStr = String(txRaw ?? '').trim()
        const txIdNum = parseInt(txIdStr, 10)
        if (!txIdStr || isNaN(txIdNum)) throw new Error('No TXID')
        let registerData: any
        try {
          registerData = await fiscalDriveApi.registerReceiptTXID(factoryId, txIdNum)
        } catch {
          await fiscalDriveApi.openZReport(factoryId, fdShiftOpenTime(receipt.Time))
          registerData = await fiscalDriveApi.registerReceiptTXID(factoryId, txIdNum)
        }
        const cabinetPayload = buildCabinetReceiptPayload(item.receipt, registerData, factoryId, txIdNum)
        try {
          await sendCabinetReceipt(cabinetPayload)
        } catch (cabinetError) {
          queueCabinetReceipt(cabinetPayload, cabinetError)
        }
        ok++
        pending = pending.filter(i => i.id !== item.id)
        setUnsentItems(pending)
        saveQueue(pending)
        try {
          const histRaw = dataStore.getItem('pos_v2_history')
          if (histRaw) {
            const hist = JSON.parse(histRaw)
            let updated = false
            const newHist = hist.map((h: any) => {
              if (h.fiscalQueueId && h.fiscalQueueId === item.id) {
                updated = true
                const terminalId = String(registerData?.TerminalID ?? registerData?.terminalId ?? '')
                const receiptSeq = Number(registerData?.ReceiptSeq ?? registerData?.receiptSeq ?? 0) || 0
                const fiscalSign = String(registerData?.FiscalSign ?? registerData?.fiscalSign ?? '')
                const dateTime = String(registerData?.DateTime ?? registerData?.dateTime ?? '')
                const qrCodeUrl = String(registerData?.QRCodeURL ?? registerData?.qrCodeUrl
                  ?? (terminalId ? `https://ofd.soliq.uz/check?t=${terminalId}&r=${receiptSeq}&c=${dateTime.replace(/[^0-9]/g, '')}&s=${fiscalSign}` : ''))
                return {
                  ...h,
                  status: 'paid',
                  factoryId: h.factoryId || factoryId,
                  fiscalSign,
                  qrCodeUrl,
                  terminalId,
                  receiptSeq,
                  cabinetReceiptId: cabinetPayload.id,
                  ofdStatus: 'pending',
                  fiscalQueueId: undefined,
                }
              }
              return h
            })
            if (updated) dataStore.setItem('pos_v2_history', JSON.stringify(newHist))
          }
        } catch {}
      } catch (e: any) {
        fail++
        const msg = (e?.message || tr('Ошибка', 'Xato', 'Error')).slice(0, 200)
        pending = pending.map(i => i.id === item.id ? { ...i, status: 'failed' as const, attempts: i.attempts + 1, lastError: msg } : i)
        setUnsentItems(pending)
        saveQueue(pending)
      }
    }

    // 2. Run full batch OFD sync pipeline via Swagger API endpoints
    showToast(tr('Синхронизация данных с ОФД...', 'OFD bilan ma\'lumotlar sinxronlashmoqda...', 'Syncing data with OFD...'))
    let syncRes: Awaited<ReturnType<typeof runFullOfdSync>>
    try {
      syncRes = await runFullOfdSync(factoryId)
    } catch (error: any) {
      setError(error?.message || tr('Не удалось синхронизировать ФМ с ОФД', 'FM ni OFD bilan sinxronlab bo‘lmadi'))
      setLoading(false)
      return
    }

    // 3. Update remaining counts
    await fetchFmInfo(factoryId)

    const remaining = syncRes.totalRemaining ?? 0
    if (remaining === 0) {
      showToast(tr('Все чеки успешно отправлены в ОФД!', 'Barcha cheklar OFDga muvaffaqiyatli yuborildi!', 'All receipts successfully sent to OFD!'))
      try {
        const historyRaw = dataStore.getItem('pos_v2_history')
        if (historyRaw) {
          const hist = JSON.parse(historyRaw)
          let updated = false
          const newHist = hist.map((h: any) => {
            if (h.ofdStatus === 'pending' || !h.ofdStatus) {
              updated = true
              return { ...h, ofdStatus: 'synced' }
            }
            return h
          })
          if (updated) dataStore.setItem('pos_v2_history', JSON.stringify(newHist))
        }
      } catch {}
    } else {
      showToast(tr(`Ожидают отправки в ОФД: ${remaining} чеков`, `OFDga yuborishni kutyapti: ${remaining} chek`))
    }

    if (fail > 0) {
      const firstErr = unsentItems.find(i => i.status === 'failed' || i.status === 'pending')?.lastError
      showToast(tr(`Не удалось зарегистрировать ${fail} чеков в ФМ${firstErr ? `: ${firstErr}` : ''}`, `FM da ${fail} ta chekni ro\'yxatga olish imkoni bo\'lmadi${firstErr ? `: ${firstErr}` : ''}`))
    }
    setLoading(false)
  }, [unsentItems, factoryId, showToast, fetchFmInfo])

  useEffect(() => { listDevices() }, [listDevices])
  useEffect(() => {
    if (!isNativeMobile()) return
    let disposed = false
    let handles: { remove: () => Promise<void> }[] = []
    onFiscalUsbChange(() => { if (!disposed) void listDevices() })
      .then(registered => { if (disposed) registered.forEach(handle => void handle.remove()); else handles = registered })
      .catch(() => {})
    return () => { disposed = true; handles.forEach(handle => void handle.remove()) }
  }, [listDevices])
  useEffect(() => {
    if (factoryId) {
      fetchFmInfo(factoryId)
      fetchShiftInfo(factoryId)
    }
  }, [factoryId, fetchFmInfo, fetchShiftInfo])

  useEffect(() => {
    const iv = setInterval(() => {
      setUnsentItems(loadQueue)
      if (factoryId) {
        fetchFmInfo(factoryId)
      }
    }, 5000)
    return () => clearInterval(iv)
  }, [factoryId, fetchFmInfo])

  const today = new Date().toLocaleDateString(locale())
  const formatSum = (v: number) => (v / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 })

  const localUnsentCount = unsentItems.filter(i => i.status === 'pending' || i.status === 'failed').length
  const badgeCount = pendingOfdCount + localUnsentCount
  const lastCloseTime = validShiftTime(lastCloseTimes[factoryId])
  const canExportPdf = window.electronAPI?.isDesktop === true && typeof window.electronAPI.generatePdf === 'function'

  async function downloadTablePdf() {
    if (!canExportPdf || generatingPdf) return
    const generatePdf = window.electronAPI?.generatePdf
    if (!generatePdf) return
    const rows = Array.from(infoSectionRef.current?.querySelectorAll('.fm-info-row') || []).map(row => ({
      label: row.querySelector('.fm-info-label')?.textContent || '',
      value: row.querySelector('.fm-info-value')?.textContent || '—',
    }))
    if (rows.length === 0) {
      showToast(t('Нет данных для сохранения', 'Saqlash uchun ma\'lumot yo\'q', 'No data to export'))
      return
    }
    const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const title = t('Фискальный модуль', 'Fiskal modul', 'Fiscal module')
    const now = new Date()
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .date { color: #64748b; font-size: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { width: 60%; font-weight: 600; background: #f8fafc; }
  tr { break-inside: avoid; }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<div class="date">${escapeHtml(now.toLocaleString(locale()))}</div>
<table><tbody>${rows.map(row => `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`).join('')}</tbody></table>
</body></html>`
    setGeneratingPdf(true)
    try {
      const base64 = await generatePdf(html)
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const link = document.createElement('a')
      try {
        link.href = url
        link.download = `Fiscal_module_${fmtLocal(now).replace(' ', '_').replace(/:/g, '-')}.pdf`
        document.body.appendChild(link)
        link.click()
      } finally {
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      showToast(t('Ошибка создания PDF', 'PDF yaratishda xato', 'PDF creation error'))
    } finally {
      setGeneratingPdf(false)
    }
  }


  return (
    <div className="screen fiscal-module-screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <img src={usbIcon} alt="" width={24} height={24} style={{ objectFit: 'contain', transform: 'rotate(-45deg)', flexShrink: 0 }} />
          {t('Фискальный модуль', 'Fiskal modul', 'Fiscal module')}
        </h1>
      </div>

      <div className="fm-toolbar">
        <div className="fm-toolbar-left">
          <span className="fm-modul-label">{t('Фискальный модуль', 'Fiskal modul', 'Fiscal module')}</span>
        </div>
        <div className="fm-toolbar-right">
          <div className="fm-date-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>{today}</span>
          </div>
          <button className="fm-print-btn" onClick={downloadTablePdf} disabled={!canExportPdf || generatingPdf} title={t('Сохранить таблицу в PDF', 'Jadvalni PDF sifatida saqlash', 'Save table as PDF')} aria-label={t('Сохранить таблицу в PDF', 'Jadvalni PDF sifatida saqlash', 'Save table as PDF')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          </button>
        </div>
      </div>

      <div className="fm-main-buttons">
        <button className="fm-btn fm-btn-unsent${badgeCount > 0 ? ' has-items' : ''}" onClick={sendUnsentReceipts} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          {t('Неотправленные чеки', 'Yuborilmagan cheklar', 'Unsent receipts')}
          <span className={`fm-badge${badgeCount === 0 ? ' fm-badge-zero' : ''}`}>{badgeCount}</span>
        </button>
        <button className="fm-btn fm-btn-open" onClick={openShift} disabled={loading || shiftOpen}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {t('Открыть смену', 'Smenani ochish', 'Open shift')}
        </button>
        <button className="fm-btn fm-btn-close" onClick={closeShift} disabled={loading || !shiftOpen}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('Закрыть смену', 'Smenani yopish', 'Close shift')}
        </button>
      </div>

      {error && <div className="fm-error">{error}</div>}

      <div className="fm-info-section" ref={infoSectionRef}>
        {shiftOpen && shiftInfo ? (
          <div className="fm-shift-info">
            <div className="fm-info-row"><span className="fm-info-label">Terminal ID:</span><span className="fm-info-value">{shiftInfo.terminalId || fmInfo?.TerminalID || fmInfo?.terminalId || '—'}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Номер смены:', 'Smena raqami:', 'Shift number:')}</span><span className="fm-info-value">0</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Количество чеков:', 'Cheklar soni:', 'Receipt count:')}</span><span className="fm-info-value">{shiftInfo.totalSaleCount || 0}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Первый чек продажи:', 'Birinchi savdo cheki:', 'First sales receipt:')}</span><span className="fm-info-value">{shiftInfo.firstReceiptSeq || 0}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Последний чек продажи:', 'Oxirgi savdo cheki:', 'Last sales receipt:')}</span><span className="fm-info-value">{shiftInfo.lastReceiptSeq || 0}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Время открытия:', 'Ochilish vaqti:', 'Opening time:')}</span><span className="fm-info-value">{shiftInfo.openTime || '—'}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Время закрытия:', 'Yopish vaqti:', 'Closing time:')}</span><span className="fm-info-value">{lastCloseTime || '—'}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Всего возвращаемый QQS:', 'Jami qaytariladigan QQS:', 'Total refundable QQS:')}</span><span className="fm-info-value">{t('0 сум', '0 so\'m', '0 sum')}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Возвращённая наличными сумма:', 'Qaytarilgan naqd summa:', 'Cash refund amount:')}</span><span className="fm-info-value">{t('0 сум', '0 so\'m', '0 sum')}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Возвращённая безналичная сумма:', 'Qaytarilgan naqdsiz summa:', 'Non-cash refund amount:')}</span><span className="fm-info-value">{t('0 сум', '0 so\'m', '0 sum')}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Количество возвратов:', 'Qaytarilganlar soni:', 'Number of refunds:')}</span><span className="fm-info-value">0</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Всего QQS с продаж:', 'Jami QQS sotuvdan:', 'Total QQS from sales:')}</span><span className="fm-info-value">{formatSum(shiftInfo.totalVAT?.Sale || 0)} {t('сум', 'so\'m', 'sum')}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Всего наличные продажи:', 'Jami naqd sotuvlar:', 'Total cash sales:')}</span><span className="fm-info-value">{formatSum(shiftInfo.totalCash?.Sale || 0)} {t('сум', 'so\'m', 'sum')}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Всего безналичные продажи:', 'Jami naqdsiz sotuvlar:', 'Total non-cash sales:')}</span><span className="fm-info-value">{formatSum(shiftInfo.totalCard?.Sale || 0)} {t('сум', 'so\'m', 'sum')}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Всего продаж:', 'Jami sotuvlar soni:', 'Total sales:')}</span><span className="fm-info-value">{shiftInfo.totalSaleCount || 0}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Applet version:</span><span className="fm-info-value">{fmInfo?.AppletVersion || fmInfo?.appletVersion || '0400'}</span></div>
          </div>
        ) : (
          <div className="fm-shift-info">
            <div className="fm-info-row"><span className="fm-info-label">Terminal ID:</span><span className="fm-info-value">{fmInfo?.TerminalID || fmInfo?.terminalId || '—'}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Applet version:</span><span className="fm-info-value">{fmInfo?.AppletVersion || fmInfo?.appletVersion || '0400'}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Статус:', 'Holat:', 'Status:')}</span><span className="fm-info-value" style={{ color: shiftOpen ? '#22c55e' : '#ef4444' }}>{shiftOpen ? t('Смена открыта', 'Smena ochiq', 'Shift is open') : t('Смена закрыта', 'Smena yopiq', 'Shift is closed')}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">{t('Время закрытия:', 'Yopish vaqti:', 'Closing time:')}</span><span className="fm-info-value">{lastCloseTime || '—'}</span></div>
          </div>
        )}
      </div>



      {toast && <div className="toast-overlay"><div className="toast-msg">{toast}</div></div>}
    </div>
  )
}
