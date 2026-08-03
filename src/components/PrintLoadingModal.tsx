import { useState, useEffect, useRef } from 'react'

interface PrintLoadingModalProps {
  task: () => Promise<void>
  onComplete: () => void
  loadingLabel?: string
  doneLabel?: string
}

export default function PrintLoadingModal({ task, onComplete, loadingLabel, doneLabel }: PrintLoadingModalProps) {
  const [state, setState] = useState<'loading' | 'done'>('loading')
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    task()
      .catch(e => {
        console.error('Ошибка при создании чека:', e)
        alert('Ошибка: ' + (e instanceof Error ? e.message : 'неизвестная ошибка'))
      })
      .then(() => {
        setState('done')
        setTimeout(() => onComplete(), 1200)
      })
  }, [])

  return (
    <div className="print-loading-overlay">
      <div className="print-loading-modal">
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
          {state === 'loading' ? (loadingLabel || 'Создание чека...') : (doneLabel || 'Чек готов')}
        </div>
      </div>
    </div>
  )
}
