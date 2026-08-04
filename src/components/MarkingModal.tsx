import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import {
  parseMarkCode,
  validateMarking,
  MarkCodeError,
  MarkingServerError,
  MarkingConnectivityError,
} from '../services/markingApi'
import { getCompanyTin } from '../utils/companyInfo'

interface MarkingModalProps {
  itemName: string
  onConfirm: (code: string) => void
  onCancel: () => void
}

export default function MarkingModal({ itemName, onConfirm, onCancel }: MarkingModalProps) {
  const t = useT()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [offline, setOffline] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleProceed() {
    const raw = code.trim()
    if (!raw) {
      setError(t('Введите код маркировки', 'Markirovka kodini kiriting'))
      return
    }
    let parsed
    try {
      parsed = parseMarkCode(raw)
    } catch (e) {
      setError(e instanceof MarkCodeError
        ? t('Неверный код маркировки (GTIN или серия не найдены)', "Noto'g'ri markirovka kodi (GTIN yoki seriya topilmadi)")
        : t('Неверный код маркировки', "Noto'g'ri markirovka kodi"))
      return
    }
    setChecking(true)
    setError('')
    try {
      await validateMarking({
        ownerTin: getCompanyTin(),
        terminalId: localStorage.getItem('pos_v2_fm_terminal_id') || '',
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
        setError(t('Код маркировки не прошёл проверку', 'Markirovka kodi tekshiruvdan o\'tmadi'))
      }
    }
  }

  if (offline) {
    return (
      <div className="modal-overlay">
        <div className="modal-content marking-modal" onClick={e => e.stopPropagation()}>
          <h3 className="modal-title">{t('Не удалось проверить маркировку', 'Markirovkani tekshirib bo\'lmadi')}</h3>
          <p className="marking-modal-text">
            {t(
              'Нет интернет-соединения, код маркировки не был проверен. Если продолжите, ответственность за этот товар остаётся на предпринимателе.',
              'Internet aloqasi yo\'qligi sababli markirovka kodi tekshiruvdan o\'tkazilmadi. Davom etsangiz, ushbu mahsulot uchun javobgarlik tadbirkor zimmasida qoladi.',
            )}
          </p>
          <div className="modal-actions">
            <button className="modal-btn cancel" onClick={onCancel}>{t('Отмена', 'Bekor qilish')}</button>
            <button className="modal-btn save" onClick={() => onConfirm(code.trim())}>{t('Согласен, продолжить', 'Roziman, davom etish')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content marking-modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{t('Маркировка', 'Markirovka')}</h3>
        <div className="marking-modal-name">{itemName}</div>
        <input
          ref={inputRef}
          className="modal-input marking-modal-input"
          placeholder={t('Отсканируйте или введите код маркировки', 'Markirovka kodini skanerlang yoki kiriting')}
          value={code}
          onChange={e => { setCode(e.target.value); setError('') }}
          onKeyDown={e => { if (e.key === 'Enter' && !checking) handleProceed() }}
          disabled={checking}
        />
        {error && <div className="marking-modal-error">{error}</div>}
        {checking && <div className="marking-modal-checking">{t('Проверка...', 'Tekshirilmoqda...')}</div>}
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel}>{t('Отмена', 'Bekor qilish')}</button>
          <button className="modal-btn save" onClick={handleProceed} disabled={checking}>{t('Продолжить', 'Davom etish')}</button>
        </div>
      </div>
    </div>
  )
}
