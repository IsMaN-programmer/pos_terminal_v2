import { useState, useEffect, useRef } from 'react'
import { useT } from './i18n'

interface Staff {
  id: number
  name: string
  pin: string
  role: string
}

interface PinScreenProps {
  onComplete: (staff: Staff) => void
}

const STORAGE_KEY = 'pos_v2_staff'

function loadStaff(): Staff[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveStaff(staff: Staff[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(staff))
}

export default function PinScreen({ onComplete }: PinScreenProps) {
  const t = useT()
  const [staff, setStaff] = useState<Staff[]>(loadStaff)
  const [pin, setPin] = useState('')
  const [step, setStep] = useState<'setup' | 'login'>('login')
  const [error, setError] = useState('')
  const pinRef = useRef('')

  useEffect(() => {
    if (staff.length === 0) setStep('setup')
    else setStep('login')
  }, [])

  function handleNumpad(val: string) {
    setError('')
    if (val === 'clear') { pinRef.current = ''; setPin(''); return }
    if (val === 'back') { pinRef.current = pinRef.current.slice(0, -1); setPin(pinRef.current); return }
    if (pinRef.current.length >= 4) return
    const next = pinRef.current + val
    pinRef.current = next
    setPin(next)

    if (next.length === 4) {
      if (step === 'setup') {
        const nextId = Math.max(...staff.map(s => s.id), 0) + 1
        const admin: Staff = { id: nextId, name: t('Администратор', 'Administrator'), pin: next, role: 'admin' }
        const cashier: Staff = { id: nextId + 1, name: t('Кассир', 'Kassir'), pin: '0000', role: 'cashier' }
        const waiter: Staff = { id: nextId + 2, name: t('Официант', 'Ofitsiant'), pin: '1111', role: 'waiter' }
        const updated = [...staff, admin, cashier, waiter]
        saveStaff(updated)
        setStaff(updated)
        setStep('login')
        pinRef.current = ''
        setPin('')
      } else {
        const found = staff.find(s => s.pin === next)
        if (found) {
          onComplete(found)
        } else {
          setError(t('Неверный PIN-код', 'PIN-kod noto\'g\'ri'))
          setTimeout(() => { pinRef.current = ''; setPin('') }, 600)
        }
      }
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) { handleNumpad(e.key); return }
      if (e.key === 'Backspace') { handleNumpad('back'); return }
      if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') { handleNumpad('clear'); return }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="pin-overlay">
      <div className="pin-container">
        <div className="pin-left">
          <div className="pin-left-content">
            <div className="pin-left-logo">
              <div className="pin-logo-wrap">
                <div className="pin-logo-bg" />
                <div className="pin-logo-ring" />
                <div className="pin-logo-ring-2" />
                <div className="pin-logo-icon">
                  <img src="/logo.png" alt="logo" />
                </div>
              </div>
            </div>
            <div className="pin-left-title">POS Terminal</div>
            <div className="pin-left-subtitle">Virtual kassa v2</div>
            <div className="pin-left-desc">
              {step === 'setup'
                ? t('Создайте PIN-код для администратора', 'Administrator uchun PIN-kod yarating')
                : t('Войдите в систему, используя PIN-код', 'PIN-kod yordamida tizimga kiring')}
            </div>
          </div>
        </div>
        <div className="pin-right">
          <div className="pin-card">
            <div className="pin-card-title">
              {step === 'setup' ? t('Создание PIN-кода', 'PIN-kod yaratish') : t('Вход по PIN-коду', 'PIN-kod orqali kirish')}
            </div>
            <div className="pin-card-subtitle">
              {step === 'setup'
                ? t('Придумайте 4-значный PIN-код', '4 xonali PIN-kod o\'ylab toping')
                : t('Введите ваш PIN-код', 'PIN-kodingizni kiriting')}
            </div>

            {error && <div className="pin-error">{error}</div>}

            <div className="pin-dots">
              {[0, 1, 2, 3].map(i => (
                <span
                  key={i}
                  className={`pin-dot${i < pin.length ? ' filled' : ''}${error ? ' error' : ''}`}
                />
              ))}
            </div>

            <div className="numpad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button key={n} className="numpad-btn" onClick={() => handleNumpad(String(n))}>
                  {n}
                </button>
              ))}
              <button className="numpad-btn" onClick={() => handleNumpad('clear')}>C</button>
              <button className="numpad-btn" onClick={() => handleNumpad('0')}>0</button>
              <button className="numpad-btn" onClick={() => handleNumpad('back')}>⌫</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
