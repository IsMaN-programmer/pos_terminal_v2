import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'

interface DraftPourModalProps {
  itemName: string
  containerLiters: number
  bottlePrice: number
  availableLiters: number
  onConfirm: (liters: number) => void
  onCancel: () => void
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export default function DraftPourModal({ itemName, containerLiters, bottlePrice, availableLiters, onConfirm, onCancel }: DraftPourModalProps) {
  const t = useT()
  const maxLiters = availableLiters > 0 ? Math.min(availableLiters, containerLiters) : containerLiters
  const [liters, setLiters] = useState(round3(maxLiters / 2))
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const quickButtons = Array.from(new Set([0.1, 0.3, 0.5, round3(maxLiters)])).filter(v => v > 0 && v <= maxLiters).sort((a, b) => a - b)

  const sum = Math.round(bottlePrice * liters / (containerLiters || 1))

  function handleChange(raw: string) {
    setError('')
    const v = parseFloat(raw.replace(',', '.'))
    setLiters(isNaN(v) ? 0 : v)
  }

  function handleConfirm() {
    if (!liters || liters <= 0) {
      setError(t('Введите количество литров', 'Litrlarni kiriting', 'Enter number of liters'))
      return
    }
    if (liters > maxLiters) {
      setError(t('Недостаточно остатка в ёмкости', 'Idishdagi qoldiq yetarli emas', 'Not enough stock in container'))
      return
    }
    onConfirm(round3(liters))
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content draft-modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{t('Налить', 'Quyish', 'Pour')}</h3>
        <div className="marking-modal-name">{itemName}</div>
        <div className="draft-modal-remaining">
          {t('Остаток:', 'Qoldiq:', 'Remaining:')} {maxLiters.toLocaleString('ru-RU')} {t('л', 'l', 'L')}
          {availableLiters > 0 && availableLiters < containerLiters && ` / ${containerLiters.toLocaleString('ru-RU')} ${t('л', 'l', 'L')}`}
        </div>
        <div className="draft-modal-quick">
          {quickButtons.map(v => (
            <button
              key={v}
              className={`draft-quick-btn${liters === round3(v) ? ' active' : ''}`}
              onClick={() => { setLiters(round3(v)); setError('') }}
            >
              {v}
            </button>
          ))}
        </div>
        <input
          ref={inputRef}
          className="modal-input marking-modal-input"
          type="number"
          min="0"
          step="0.1"
          placeholder={t('Литр (напр. 0.3)', 'Litr (masalan 0.3)', 'Liters (e.g. 0.3)')}
          value={liters || ''}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
        />
        {error && <div className="marking-modal-error">{error}</div>}
        <div className="draft-modal-sum">
          {t('Сумма:', 'Summa:', 'Amount:')} {sum.toLocaleString('ru-RU')} {t('сум', 'so\'m', 'sum')}
        </div>
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel}>{t('Отмена', 'Bekor qilish', 'Cancel')}</button>
          <button className="modal-btn save" onClick={handleConfirm}>{t('Налить', 'Quyish', 'Pour')}</button>
        </div>
      </div>
    </div>
  )
}
