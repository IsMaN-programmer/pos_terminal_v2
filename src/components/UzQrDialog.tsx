import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { dataStore } from '../services/dataStore'
import { getCompanyPointKey } from '../utils/companyInfo'
import { uzqrApi, UzQrError, type UzQrStatus } from '../services/uzqrApi'
import { useT } from '../i18n'

export interface UzQrSuccess {
  invoiceId: string
  payId?: string
}

interface UzQrDialogProps {
  amount: number
  onSuccess: (result: UzQrSuccess) => void
  onCancel: () => void
}

type Phase = 'creating' | 'waiting' | 'success' | 'failed' | 'expired' | 'cancelled' | 'error'

const TIMEOUT_SECONDS = 60
// Same polling schedule as posvk_mobile: 5s → +15s → +20s → +10s → +10s.
const POLL_AT = new Set([5, 20, 40, 50, 60])

export default function UzQrDialog({ amount, onSuccess, onCancel }: UzQrDialogProps) {
  const t = useT()
  const [phase, setPhase] = useState<Phase>('creating')
  const [qrImg, setQrImg] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS)
  const [checking, setChecking] = useState(false)
  const [online, setOnline] = useState(true)
  const [message, setMessage] = useState('')
  const invoiceRef = useRef<{ invoiceId: string } | null>(null)
  const checkingRef = useRef(false)
  const phaseRef = useRef<Phase>('creating')
  phaseRef.current = phase

  function fail(msg: string) {
    setPhase('error')
    setMessage(msg)
  }

  useEffect(() => {
    let alive = true
    const terminalId = (dataStore.getItem('pos_v2_fm_terminal_id') || '').trim()
    const licenseKey = getCompanyPointKey().trim()
    if (!terminalId || !licenseKey) {
      fail(t('Нет привязки терминала. Войдите заново на кассе.', 'Terminal bog‘lanmagan. Kassada qayta kiring.', 'Terminal is not linked. Log in again on the cash register.'))
      return
    }
    if (!navigator.onLine) {
      setOnline(false)
      fail(t('Нет интернет-соединения', 'Internet aloqasi yo‘q', 'No internet connection'))
      return
    }
    const receiptId = uzqrApi.newExternalId()
    const externalId = uzqrApi.newExternalId()
    uzqrApi.createInvoice({ receiptId, terminalId, licenseKey, externalId, amount: Math.round(amount) })
      .then(async inv => {
        if (!alive) return
        invoiceRef.current = { invoiceId: inv.invoiceId }
        try {
          setQrImg(await QRCode.toDataURL(inv.qrText, { width: 480, margin: 1, errorCorrectionLevel: 'M' }))
        } catch {
          setQrImg('')
        }
        if (!alive) return
        setPhase('waiting')
      })
      .catch((e: unknown) => {
        if (!alive) return
        fail(e instanceof UzQrError ? e.message : t('Не удалось создать UzQR-счёт', 'UzQR hisobini yaratib bo‘lmadi', 'Failed to create UzQR invoice'))
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function checkNow(automatic: boolean) {
    const inv = invoiceRef.current
    if (checkingRef.current || !inv || phaseRef.current !== 'waiting') return
    if (!navigator.onLine) {
      setOnline(false)
      if (!automatic) setMessage(t('Нет интернет-соединения', 'Internet aloqasi yo‘q', 'No internet connection'))
      return
    }
    checkingRef.current = true
    setChecking(true)
    setOnline(true)
    if (!automatic) setMessage('')
    try {
      const terminalId = (dataStore.getItem('pos_v2_fm_terminal_id') || '').trim()
      const licenseKey = getCompanyPointKey().trim()
      const st: UzQrStatus = await uzqrApi.checkStatus({ invoiceId: inv.invoiceId, terminalId, licenseKey })
      if (st.status === 2) {
        setPhase('success')
        onSuccess({ invoiceId: inv.invoiceId, payId: st.payId })
        return
      }
      if (st.status === 3) {
        setPhase('failed')
        return
      }
    } catch (e) {
      if (!automatic) setMessage(e instanceof UzQrError ? e.message : t('Ошибка проверки', 'Tekshirish xatosi', 'Check failed'))
    } finally {
      checkingRef.current = false
      setChecking(false)
    }
  }

  useEffect(() => {
    if (phase !== 'waiting') return
    let elapsed = 0
    const timer = setInterval(() => {
      elapsed += 1
      setSecondsLeft(Math.max(0, TIMEOUT_SECONDS - elapsed))
      if (POLL_AT.has(elapsed)) void checkNow(true)
      if (elapsed >= TIMEOUT_SECONDS) {
        clearInterval(timer)
        setPhase(prev => (prev === 'waiting' ? 'expired' : prev))
      }
    }, 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  async function handleCancel() {
    const inv = invoiceRef.current
    if (inv) {
      const terminalId = (dataStore.getItem('pos_v2_fm_terminal_id') || '').trim()
      const licenseKey = getCompanyPointKey().trim()
      await uzqrApi.cancelInvoice({ invoiceId: inv.invoiceId, terminalId, licenseKey })
    }
    setPhase('cancelled')
    onCancel()
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <div className="modal-title">UzQR</div>
        <div className="marking-modal-name">{t('К оплате', 'Tolovga', 'To pay')}: {Math.round(amount).toLocaleString()} {t('сум', 'so‘m', 'sum')}</div>

        {phase === 'creating' && <div className="marking-modal-checking">{t('Создаём счёт...', 'Hisob yaratilmoqda...', 'Creating invoice...')}</div>}

        {phase === 'waiting' && (
          <>
            {qrImg
              ? <img src={qrImg} alt="UzQR" style={{ width: 220, height: 220, margin: '0 auto', display: 'block' }} />
              : <div className="marking-modal-checking">{t('Загрузка QR...', 'QR yuklanmoqda...', 'Loading QR...')}</div>}
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>{mm}:{ss}</div>
            {!online && <div className="marking-modal-error">{t('Нет интернет-соединения', 'Internet aloqasi yo‘q', 'No internet connection')}</div>}
            {message && <div className="marking-modal-error">{message}</div>}
          </>
        )}

        {phase === 'success' && <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>{t('Оплата прошла', 'Tolov o‘tdi', 'Payment succeeded')}</div>}
        {phase === 'failed' && <div className="marking-modal-error">{t('Оплата отклонена', 'Tolov rad etildi', 'Payment declined')}</div>}
        {phase === 'expired' && <div className="marking-modal-error">{t('Время вышло, счёт закрыт', 'Vaqt tugadi, hisob yopildi', 'Time expired, invoice closed')}</div>}
        {phase === 'error' && <div className="marking-modal-error">{message || t('Ошибка UzQR', 'UzQR xatosi', 'UzQR error')}</div>}

        <div className="modal-actions">
          {(phase === 'waiting' || phase === 'creating') && (
            <button className="modal-btn cancel" onClick={() => void checkNow(false)} disabled={checking}>
              {checking ? t('Проверка...', 'Tekshirilmoqda...', 'Checking...') : t('Проверить', 'Tekshirish', 'Refresh')}
            </button>
          )}
          <button className="modal-btn cancel" onClick={() => void handleCancel()}>
            {t('Отмена', 'Bekor qilish', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
