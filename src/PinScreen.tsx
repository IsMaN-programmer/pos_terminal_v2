import { useState, useEffect } from 'react'

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
  const [staff, setStaff] = useState<Staff[]>(loadStaff)
  const [pin, setPin] = useState('')
  const [step, setStep] = useState<'setup' | 'login'>('login')
  const [error, setError] = useState('')

  useEffect(() => {
    if (staff.length === 0) setStep('setup')
    else setStep('login')
  }, [])

  function handleNumpad(val: string) {
    setError('')
    if (val === 'clear') { setPin(''); return }
    if (val === 'back') { setPin(p => p.slice(0, -1)); return }
    if (pin.length >= 4) return
    const next = pin + val
    setPin(next)

    if (next.length === 4) {
      if (step === 'setup') {
        const nextId = Math.max(...staff.map(s => s.id), 0) + 1
        const admin: Staff = { id: nextId, name: 'Администратор', pin: next, role: 'admin' }
        const cashier: Staff = { id: nextId + 1, name: 'Кассир', pin: '0000', role: 'cashier' }
        const waiter: Staff = { id: nextId + 2, name: 'Официант', pin: '1111', role: 'waiter' }
        const updated = [...staff, admin, cashier, waiter]
        saveStaff(updated)
        setStaff(updated)
        setStep('login')
        setPin('')
      } else {
        const found = staff.find(s => s.pin === next)
        if (found) {
          onComplete(found)
        } else {
          setError('Неверный PIN-код')
          setTimeout(() => { setPin('') }, 600)
        }
      }
    }
  }

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
                ? 'Создайте PIN-код для администратора'
                : 'Войдите в систему, используя PIN-код'}
            </div>
          </div>
        </div>
        <div className="pin-right">
          <div className="pin-card">
            <div className="pin-card-title">
              {step === 'setup' ? 'Создание PIN-кода' : 'Вход по PIN-коду'}
            </div>
            <div className="pin-card-subtitle">
              {step === 'setup'
                ? 'Придумайте 4-значный PIN-код'
                : 'Введите ваш PIN-код'}
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
