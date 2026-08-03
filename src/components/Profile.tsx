import { useState, useEffect } from 'react'
import { UserIcon } from './Icons'
import type { HistoryEntry } from '../data/types'

interface ProfileProps {
  history?: HistoryEntry[]
  onChangeRole?: () => void
  shiftActive?: boolean
  shiftStartTime?: string
  shiftEndTime?: string
  shiftEnding?: boolean
  shiftNumber?: string
  onShiftStart?: (time: string) => void
  onShiftEnd?: (time: string) => void
  activeTableCount?: number
  userRole?: string
  staffName?: string
  staffId?: string
}

function formatTime(d: Date) {
  const dateStr = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `${dateStr} ${timeStr}`
}

export default function Profile({ history = [], onChangeRole, shiftActive = false, shiftStartTime = '—', shiftEndTime = '—', shiftEnding = false, shiftNumber = '—', onShiftStart, onShiftEnd, activeTableCount = 0, userRole = 'waiter', staffName = 'Пользователь', staffId }: ProfileProps) {
  const [notify, setNotify] = useState('')
  const paidTotal = history
    .filter(h => h.status === 'paid')
    .reduce((s, h) => s + h.total, 0)
  const servedTables = history.filter(h => h.status === 'sent').length

  useEffect(() => {
    if (shiftEnding) {
      const timer = setTimeout(() => {
        onChangeRole?.()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [shiftEnding, onChangeRole])

  function handleShiftAction() {
    if (!shiftActive) {
      onShiftStart?.(formatTime(new Date()))
    } else if (activeTableCount > 0) {
      setNotify('Сначала завершите все активные заказы')
      setTimeout(() => setNotify(''), 2500)
    } else {
      onShiftEnd?.(formatTime(new Date()))
    }
  }

  return (
    <div className="screen profile-screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <UserIcon />
          Профиль
        </h1>
      </div>

      <div className="profile-centered">
        {notify && <div className="profile-notify">{notify}</div>}

        <div className="profile-avatar-section">
          <div className="profile-avatar profile-avatar-lg">
            {staffName.charAt(0)}
          </div>
          <div className="profile-name profile-name-lg">{staffName}</div>
          <div className="profile-position profile-position-lg">
            {userRole === 'cashier' ? 'Кассир' : userRole === 'admin' ? 'Администратор' : 'Официант'}
          </div>
          <div className="profile-id profile-id-lg">ID: {staffId || '—'}</div>
        </div>

        <div className="shift-section">
          <h3 className="shift-title">Смена</h3>
          <div className="shift-details">
            <div className="shift-row">
              <span className="shift-label">Номер смены:</span>
              <span className="shift-value">{shiftNumber}</span>
            </div>
            <div className="shift-row">
              <span className="shift-label">Начало:</span>
              <span className="shift-value">{shiftStartTime}</span>
            </div>
            <div className="shift-row">
              <span className="shift-label">Конец:</span>
              <span className="shift-value">{shiftEnding ? shiftEndTime : '—'}</span>
            </div>
            <div className="shift-row">
              <span className="shift-label">Продажи:</span>
              <span className="shift-value highlight">{paidTotal.toLocaleString()} сум</span>
            </div>
            <div className="shift-row">
              <span className="shift-label">Обслужено столов:</span>
              <span className="shift-value">{servedTables}</span>
            </div>
          </div>
          {shiftEnding ? (
            <div className="shift-ending-text">Смена завершена, перенаправление...</div>
          ) : (
            <button className="shift-action-btn" onClick={handleShiftAction}>
              {shiftActive ? 'Завершить смену' : 'Начать смену'}
            </button>
          )}
        </div>

        <button className="role-change-btn" onClick={onChangeRole}>Сменить роль</button>
      </div>
    </div>
  )
}
