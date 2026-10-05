import { useState, useEffect, useRef } from 'react'
import { useT, tr } from '../i18n'
import { isNativeMobile } from '../services/capacitor'

interface PrintLoadingModalProps {
  task: () => Promise<void>
  onComplete: () => void
  onCancel?: () => void
  loadingLabel?: string
  doneLabel?: string
}

export default function PrintLoadingModal({ task, onComplete, onCancel, loadingLabel, doneLabel }: PrintLoadingModalProps) {
  const t = useT()
  const [state, setState] = useState<'loading' | 'done'>('loading')
  const startedRef = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    task()
      .catch(e => {
        if (isNativeMobile()) { setError(e instanceof Error ? e.message : 'Ошибка печати'); return false }
        console.error('Ошибка при создании чека:', e)
        alert(tr('Ошибка: ' + (e instanceof Error ? e.message : 'неизвестная ошибка'), 'Xato: ' + (e instanceof Error ? e.message : "noma'lum xato")))
      })
      .then(result => {
        if (result === false) return
        setState('done')
        setTimeout(() => onComplete(), 1200)
      })
  }, [])

  return (
    <div className="print-loading-overlay">
      <div className="print-loading-modal">
        {error ? <><div role="alert" className="pin-error">{error}</div><button className="modal-btn cancel" onClick={onCancel}>Закрыть</button></> : <>
        {state === 'loading' ? (
          <div className="print-loading-spinner" />
        ) : (
          <div className="print-loading-check">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
        <div className="print-loading-label">
          {state === 'loading' ? (loadingLabel || t('Создание чека...', 'Chek yaratilmoqda...', 'Creating receipt...')) : (doneLabel || t('Чек готов', 'Chek tayyor', 'Receipt ready'))}
        </div>
        </>}
      </div>
    </div>
  )
}
