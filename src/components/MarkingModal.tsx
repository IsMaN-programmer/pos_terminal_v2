import { useEffect, useRef, useState } from 'react'
import { dataStore } from '../services/dataStore'
import { useT } from '../i18n'
import {
  parseMarkCode,
  validateMarking,
  MarkCodeError,
  MarkingServerError,
  MarkingConnectivityError,
} from '../services/markingApi'
import { getCompanyTin } from '../utils/companyInfo'
import { isNativeMobile } from '../services/capacitor'
import { scanCode } from '../services/qrScanner'

interface MarkingModalProps {
  itemName: string
  existingCodes?: string[]
  allowDuplicates?: boolean
  onConfirm: (code: string) => void
  onCancel: () => void
}

export default function MarkingModal({ itemName, existingCodes = [], allowDuplicates = false, onConfirm, onCancel }: MarkingModalProps) {
  const t = useT()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [offline, setOffline] = useState(false)
  const [scanBusy, setScanBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleQrScan() {
    if (scanBusy || checking) return
    setScanBusy(true)
    setError('')
    try {
      const value = await scanCode()
      if (value) setCode(value.trim())
    } catch {
      // User cancelled — keep the input as-is.
    } finally {
      setScanBusy(false)
    }
  }

  async function handleProceed() {
    const raw = code.trim()
    if (!raw) {
      setError(t('Введите код маркировки', 'Markirovka kodini kiriting', 'Enter labeling code'))
      return
    }
    if (!allowDuplicates && existingCodes.some(c => c.trim() === raw)) {
      setError(t('Этот код маркировки уже был введён в заказ', 'Bu markirovka kodi buyurtmaga allaqachon kiritilgan', 'This labeling code has already been added to the order'))
      return
    }
    let parsed
    try {
      parsed = parseMarkCode(raw)
    } catch (e) {
      setError(e instanceof MarkCodeError
        ? t('Неверный код маркировки (GTIN или серия не найдены)', 'Noto\'g\'ri markirovka kodi (GTIN yoki seriya topilmadi)', 'Invalid labeling code (GTIN or batch not found)')
        : t('Неверный код маркировки', 'Noto\'g\'ri markirovka kodi', 'Invalid labeling code'))
      return
    }
    setChecking(true)
    setError('')
    try {
      await validateMarking({
        ownerTin: getCompanyTin(),
        terminalId: dataStore.getItem('pos_v2_fm_terminal_id') || '',
        productCode: parsed.productCode,
        packageCode: parsed.packageCode,
        safeCode: parsed.safeCode,
        kmId: parsed.kmId,
        fullKmId: parsed.fullKmId,
      })
      onConfirm(raw)
    } catch (e) {
      setChecking(false)
      if (e instanceof MarkingConnectivityError) {
        setOffline(true)
      } else if (e instanceof MarkingServerError && e.message) {
        setError(e.message)
      } else {
        setError(t('Код маркировки не прошёл проверку', 'Markirovka kodi tekshiruvdan o\'tmadi', 'Labeling code failed verification'))
      }
    }
  }

  if (offline) {
    return (
      <div className="modal-overlay">
        <div className="modal-content marking-modal" onClick={e => e.stopPropagation()}>
          <h3 className="modal-title">{t('Не удалось проверить маркировку', 'Markirovkani tekshirib bo\'lmadi', 'Failed to verify labeling')}</h3>
          <p className="marking-modal-text">
            {t(
              'Нет интернет-соединения, код маркировки не был проверен. Если продолжите, ответственность за этот товар остаётся на предпринимателе.',
              'Internet aloqasi yo\'qligi sababli markirovka kodi tekshiruvdan o\'tkazilmadi. Davom etsangiz, ushbu mahsulot uchun javobgarlik tadbirkor zimmasida qoladi.',
            )}
          </p>
          <div className="modal-actions">
            <button className="modal-btn cancel" onClick={onCancel}>{t('Отмена', 'Bekor qilish', 'Cancel')}</button>
            <button className="modal-btn save" onClick={() => onConfirm(code.trim())}>{t('Согласен, продолжить', 'Roziman, davom etish', 'Agree and continue')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content marking-modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{t('Маркировка', 'Markirovka', 'Labeling')}</h3>
        <div className="marking-modal-name">{itemName}</div>
        <div className="marking-modal-input-row">
          <input
            ref={inputRef}
            className="modal-input marking-modal-input"
            placeholder={t('Отсканируйте или введите код маркировки', 'Markirovka kodini skanerlang yoki kiriting', 'Scan or enter labeling code')}
            value={code}
            onChange={e => { setCode(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter' && !checking) handleProceed() }}
            disabled={checking}
          />
          {isNativeMobile() && (
            <button
              type="button"
              className={`menu-scanner-btn marking-qr-btn${scanBusy ? ' active' : ''}`}
              title={t('Сканировать QR-код камерой', 'QR-kodni kamera orqali skanerlash', 'Scan QR code with camera')}
              onClick={() => void handleQrScan()}
              disabled={checking || scanBusy}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h3v3h-3z" />
                <path d="M20 14v1M14 20h1M17 17l4 4" />
              </svg>
            </button>
          )}
        </div>
        {error && <div className="marking-modal-error">{error}</div>}
        {checking && <div className="marking-modal-checking">{t('Проверка...', 'Tekshirilmoqda...', 'Checking...')}</div>}
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel}>{t('Отмена', 'Bekor qilish', 'Cancel')}</button>
          <button className="modal-btn save" onClick={handleProceed} disabled={checking}>{t('Продолжить', 'Davom etish', 'Continue')}</button>
        </div>
      </div>
    </div>
  )
}
