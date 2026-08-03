import { useState, useEffect, useCallback } from 'react'
import { fiscalDriveApi, runFullOfdSync } from '../services/fiscalDriveApi'

const FM_LIST_KEY = 'pos_v2_fm_list'
const SHIFT_OPEN_KEY = 'pos_v2_shift_open'
const SHIFT_INFO_KEY = 'pos_v2_shift_info'

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
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}

function saveQueue(q: UnsentItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
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
  try { return localStorage.getItem(SHIFT_OPEN_KEY) === 'true' } catch { return false }
}

function saveShiftOpen(v: boolean) {
  localStorage.setItem(SHIFT_OPEN_KEY, v ? 'true' : 'false')
}

function loadShiftInfo(): ShiftInfo | null {
  try {
    const raw = localStorage.getItem(SHIFT_INFO_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveShiftInfo(v: ShiftInfo | null) {
  if (v) localStorage.setItem(SHIFT_INFO_KEY, JSON.stringify(v))
  else localStorage.removeItem(SHIFT_INFO_KEY)
}

export default function FiscalModule() {
  const [devices, setDevices] = useState<FMDevice[]>(() => {
    try { return JSON.parse(localStorage.getItem(FM_LIST_KEY) || '[]') } catch { return [] }
  })
  const [selectedFactoryId, setSelectedFactoryId] = useState('')
  const [fmInfo, setFmInfo] = useState<any>(null)
  const [shiftOpen, setShiftOpen] = useState(loadShiftOpen)
  const [shiftInfo, setShiftInfo] = useState<ShiftInfo | null>(loadShiftInfo)
  const [unsentItems, setUnsentItems] = useState<UnsentItem[]>(loadQueue)
  const [pendingOfdCount, setPendingOfdCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

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
        localStorage.setItem(FM_LIST_KEY, JSON.stringify(mapped))
        if (!selectedFactoryId && mapped[0]) setSelectedFactoryId(mapped[0].factoryId)
      }
    } catch {}
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
      if (z.openTime) {
        doSetShiftOpen(true)
        doSetShiftInfo(z)
      } else {
        doSetShiftOpen(false)
        doSetShiftInfo(null)
      }
    } catch { /* keep cached state on network error */ }
  }, [doSetShiftInfo, doSetShiftOpen])



  const openShift = useCallback(async () => {
    if (!factoryId) { showToast('Фискальный модуль не найден'); return }
    setLoading(true)
    setError('')
    try {
      await fiscalDriveApi.openZReport(factoryId, await fdSafeTimeFromFm(factoryId))
      showToast('Смена открыта')
      await fetchShiftInfo(factoryId)
    } catch (e: any) {
      setError(`Не удалось открыть смену: ${e.message || 'ошибка'}`)
    }
    setLoading(false)
  }, [factoryId, fetchShiftInfo, showToast])

  const closeShift = useCallback(async () => {
    if (!factoryId) { showToast('Фискальный модуль не найден'); return }
    if (unsentItems.some(i => i.status === 'pending' || i.status === 'failed')) {
      showToast('Сначала отправьте неотправленные чеки')
      return
    }
    if (shiftOpen && (!shiftInfo || !shiftInfo.totalSaleCount)) {
      showToast('Нет зарегистрированных чеков за смену')
      return
    }
    setLoading(true)
    setError('')
    try {
      await fiscalDriveApi.closeZReport(factoryId, await fdSafeTimeFromFm(factoryId))
      showToast('Смена закрыта')
      doSetShiftOpen(false)
      doSetShiftInfo(null)
    } catch (e: any) {
      setError(`Не удалось закрыть смену: ${e.message || 'ошибка'}`)
    }
    setLoading(false)
  }, [factoryId, unsentItems, shiftOpen, shiftInfo, showToast, doSetShiftInfo, doSetShiftOpen])

  const sendUnsentReceipts = useCallback(async () => {
    if (!factoryId) { showToast('Фискальный модуль не найден'); setLoading(false); return }
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
        const txData = await fiscalDriveApi.getReceiptTXID(factoryId, receipt)
        const txRaw = txData && typeof txData === 'object'
          ? (txData?.data ?? txData?.txId ?? txData?.TXID ?? JSON.stringify(txData))
          : txData
        const txIdStr = String(txRaw ?? '').trim()
        const txIdNum = parseInt(txIdStr, 10)
        if (!txIdStr || isNaN(txIdNum)) throw new Error('No TXID')
        try {
          await fiscalDriveApi.registerReceiptTXID(factoryId, txIdNum)
        } catch {
          await fiscalDriveApi.openZReport(factoryId, fdShiftOpenTime(receipt.Time))
          await fiscalDriveApi.registerReceiptTXID(factoryId, txIdNum)
        }
        ok++
        pending = pending.filter(i => i.id !== item.id)
        setUnsentItems(pending)
        saveQueue(pending)
      } catch (e: any) {
        fail++
        const msg = (e?.message || 'Ошибка').slice(0, 200)
        pending = pending.map(i => i.id === item.id ? { ...i, status: 'failed' as const, attempts: i.attempts + 1, lastError: msg } : i)
        setUnsentItems(pending)
        saveQueue(pending)
      }
    }

    // 2. Run full batch OFD sync pipeline via Swagger API endpoints
    showToast('Синхронизация данных с ОФД...')
    const syncRes = await runFullOfdSync(factoryId)

    // 3. Update remaining counts
    await fetchFmInfo(factoryId)

    const remaining = syncRes.totalRemaining ?? 0
    if (remaining === 0) {
      showToast('Все чеки успешно отправлены в ОФД!')
      try {
        const historyRaw = localStorage.getItem('pos_v2_history')
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
          if (updated) localStorage.setItem('pos_v2_history', JSON.stringify(newHist))
        }
      } catch {}
    } else {
      showToast(`Ожидают отправки в ОФД: ${remaining} чеков`)
    }

    if (fail > 0) {
      const firstErr = unsentItems.find(i => i.status === 'failed' || i.status === 'pending')?.lastError
      showToast(`Не удалось зарегистрировать ${fail} чеков в ФМ${firstErr ? `: ${firstErr}` : ''}`)
    }
    setLoading(false)
  }, [unsentItems, factoryId, showToast, fetchFmInfo])

  useEffect(() => { listDevices() }, [listDevices])
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

  const today = new Date().toLocaleDateString('ru-RU')
  const formatSum = (v: number) => (v / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 })

  const localUnsentCount = unsentItems.filter(i => i.status === 'pending' || i.status === 'failed').length
  const badgeCount = pendingOfdCount + localUnsentCount



  return (
    <div className="screen fiscal-module-screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          Фискальный модуль
        </h1>
      </div>

      <div className="fm-toolbar">
        <div className="fm-toolbar-left">
          <span className="fm-modul-label">Fiscal modul</span>
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
          <button className="fm-print-btn" title="Печать">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          </button>
        </div>
      </div>

      <div className="fm-main-buttons">
        <button className={`fm-btn fm-btn-unsent${badgeCount > 0 ? ' has-items' : ''}`} onClick={sendUnsentReceipts} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          Неотправленные чеки
          <span className={`fm-badge${badgeCount === 0 ? ' fm-badge-zero' : ''}`}>{badgeCount}</span>
        </button>
        <button className="fm-btn fm-btn-open" onClick={openShift} disabled={loading || shiftOpen}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          Открыть смену
        </button>
        <button className="fm-btn fm-btn-close" onClick={closeShift} disabled={loading || !shiftOpen}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Закрыть смену
        </button>
      </div>

      {error && <div className="fm-error">{error}</div>}

      <div className="fm-info-section">
        {shiftOpen && shiftInfo ? (
          <div className="fm-shift-info">
            <div className="fm-info-row"><span className="fm-info-label">Terminal ID:</span><span className="fm-info-value">{shiftInfo.terminalId || fmInfo?.TerminalID || fmInfo?.terminalId || '—'}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Raqami:</span><span className="fm-info-value">0</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Cheklar soni:</span><span className="fm-info-value">{shiftInfo.totalSaleCount || 0}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Birinchi savdo cheki:</span><span className="fm-info-value">{shiftInfo.firstReceiptSeq || 0}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Oxirgi savdo cheki:</span><span className="fm-info-value">{shiftInfo.lastReceiptSeq || 0}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Ochish vaqti:</span><span className="fm-info-value">{shiftInfo.openTime || '—'}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Yopish vaqti:</span><span className="fm-info-value">{shiftInfo.closeTime || '—'}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Jami qaytariladigan QQS:</span><span className="fm-info-value">0 so'm</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Qaytarilgan naqd summa:</span><span className="fm-info-value">0 so'm</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Qaytarilgan naqdsiz summa:</span><span className="fm-info-value">0 so'm</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Qaytarilganlar soni:</span><span className="fm-info-value">0</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Jami QQS sotuvdan:</span><span className="fm-info-value">{formatSum(shiftInfo.totalVAT?.Sale || 0)} so'm</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Jami naqd sotuvlar:</span><span className="fm-info-value">{formatSum(shiftInfo.totalCash?.Sale || 0)} so'm</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Jami naqdsiz sotuvlar:</span><span className="fm-info-value">{formatSum(shiftInfo.totalCard?.Sale || 0)} so'm</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Jami sotuvlar soni:</span><span className="fm-info-value">{shiftInfo.totalSaleCount || 0}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Applet version:</span><span className="fm-info-value">{fmInfo?.AppletVersion || fmInfo?.appletVersion || '0400'}</span></div>
          </div>
        ) : (
          <div className="fm-shift-info">
            <div className="fm-info-row"><span className="fm-info-label">Terminal ID:</span><span className="fm-info-value">{fmInfo?.TerminalID || fmInfo?.terminalId || '—'}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Applet version:</span><span className="fm-info-value">{fmInfo?.AppletVersion || fmInfo?.appletVersion || '0400'}</span></div>
            <div className="fm-info-row"><span className="fm-info-label">Статус:</span><span className="fm-info-value" style={{ color: shiftOpen ? '#22c55e' : '#ef4444' }}>{shiftOpen ? 'Смена открыта' : 'Смена закрыта'}</span></div>
          </div>
        )}
      </div>



      {toast && <div className="toast-overlay"><div className="toast-msg">{toast}</div></div>}
    </div>
  )
}