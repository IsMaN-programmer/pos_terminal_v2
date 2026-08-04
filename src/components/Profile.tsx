import { useState, useEffect } from 'react'
import { UserIcon } from './Icons'
import type { HistoryEntry } from '../data/types'
import { useT, tr, locale } from '../i18n'

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
  const dateStr = d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  return `${dateStr} ${timeStr}`
}

export default function Profile({ history = [], onChangeRole, shiftActive = false, shiftStartTime = '—', shiftEndTime = '—', shiftEnding = false, shiftNumber = '—', onShiftStart, onShiftEnd, activeTableCount = 0, userRole = 'waiter', staffName = 'Пользователь', staffId }: ProfileProps) {
  const t = useT()
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
      setNotify(tr('Сначала завершите все активные заказы', 'Avval barcha faol buyurtmalarni yakunlang'))
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
          {t('Профиль', 'Profil')}
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
            {userRole === 'cashier' ? t('Кассир', 'Kassir') : userRole === 'admin' ? t('Администратор', 'Administrator') : t('Официант', 'Ofitsiant')}
          </div>
          <div className="profile-id profile-id-lg">ID: {staffId || '—'}</div>
        </div>

        <div className="shift-section">
          <h3 className="shift-title">{t('Смена', 'Smena')}</h3>
          <div className="shift-details">
            <div className="shift-row">
              <span className="shift-label">{t('Номер смены:', 'Smena raqami:')}</span>
              <span className="shift-value">{shiftNumber}</span>
            </div>
            <div className="shift-row">
              <span className="shift-label">{t('Начало:', 'Boshlanishi:')}</span>
              <span className="shift-value">{shiftStartTime}</span>
            </div>
            <div className="shift-row">
              <span className="shift-label">{t('Конец:', 'Tugashi:')}</span>
              <span className="shift-value">{shiftEnding ? shiftEndTime : '—'}</span>
            </div>
            <div className="shift-row">
              <span className="shift-label">{t('Продажи:', 'Savdolar:')}</span>
              <span className="shift-value highlight">{paidTotal.toLocaleString()} {t('сум', "so'm")}</span>
            </div>
            <div className="shift-row">
              <span className="shift-label">{t('Обслужено столов:', 'Xizmat qilingan stollar:')}</span>
              <span className="shift-value">{servedTables}</span>
            </div>
          </div>
          {shiftEnding ? (
            <div className="shift-ending-text">{t('Смена завершена, перенаправление...', "Smena yakunlandi, yo'naltirilmoqda...")}</div>
          ) : (
            <button className="shift-action-btn" onClick={handleShiftAction}>
              {shiftActive ? t('Завершить смену', 'Smenani yakunlash') : t('Начать смену', 'Smenani boshlash')}
            </button>
          )}
        </div>

        <button className="role-change-btn" onClick={onChangeRole}>{t('Сменить роль', 'Rolni almashtirish')}</button>
      </div>
    </div>
  )
}
