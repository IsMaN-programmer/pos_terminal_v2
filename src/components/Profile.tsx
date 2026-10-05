import { useState, useEffect } from 'react'
import { UserIcon, TableIcon } from './Icons'
import { useT, tr, locale } from '../i18n'

interface ProfileProps {
  onChangeRole?: () => void
  shiftActive?: boolean
  shiftStartTime?: string
  shiftEndTime?: string
  shiftEnding?: boolean
  shiftNumber?: string
  shiftSales?: number
  shiftServed?: number
  onShiftStart?: (time: string) => void
  onShiftEnd?: (time: string) => void
  activeTableCount?: number
  userRole?: string
  staffName?: string
  staffId?: string
  staffPhone?: string
  networkBlocked?: boolean
}

function formatTime(d: Date) {
  const dateStr = d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  return `${dateStr} ${timeStr}`
}

export default function Profile({ onChangeRole, shiftActive = false, shiftStartTime = '—', shiftEndTime = '—', shiftEnding = false, shiftNumber = '—', shiftSales = 0, shiftServed = 0, onShiftStart, onShiftEnd, activeTableCount = 0, userRole = 'waiter', staffName = 'Пользователь', staffId, staffPhone, networkBlocked = false }: ProfileProps) {
  const t = useT()
  const [toast, setToast] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const paidTotal = shiftSales
  const servedTables = shiftServed
  const roleLabel = userRole === 'cashier' ? t('Кассир', 'Kassir', 'Cashier') : userRole === 'admin' ? t('Администратор', 'Administrator', 'Administrator') : t('Официант', 'Ofitsiant', 'Waiter')

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  const workHours = shiftActive ? (() => {
    try {
      const parts = (shiftStartTime || '').split(' ')
      if (parts.length !== 2) return '—'
      const [dd, mm, yyyy] = parts[0].split('.').map(Number)
      const [hh, min] = parts[1].split(':').map(Number)
      const d = new Date(yyyy, mm - 1, dd, hh, min)
      if (isNaN(d.getTime())) return '—'
      const ms = Math.max(0, now - d.getTime())
      const h = Math.floor(ms / 3600000)
      const m = Math.floor((ms % 3600000) / 60000)
      if (h > 0) return `${h} ${t('ч', 's', 'h')} ${m} ${t('мин', 'daq', 'min')}`
      return `${m} ${t('мин', 'daq', 'min')}`
    } catch {
      return '—'
    }
  })() : '—'

  useEffect(() => {
    if (shiftEnding) {
      const timer = setTimeout(() => {
        onChangeRole?.()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [shiftEnding, onChangeRole])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function handleShiftAction() {
    if (networkBlocked) {
      showToast(tr('Сначала создайте IP или подключитесь к кассе в настройках', 'Avval sozlamalarda IP yarating yoki kassaga ulaning', 'Please create an IP or connect to the cash register in Settings first'))
      return
    }
    if (!shiftActive) {
      onShiftStart?.(formatTime(new Date()))
    } else if (activeTableCount > 0) {
      showToast(tr('Сначала завершите все активные заказы', 'Avval barcha faol buyurtmalarni yakunlang', 'Please complete all active orders first'))
    } else {
      onShiftEnd?.(formatTime(new Date()))
    }
  }

  return (
    <div className="screen profile-screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <UserIcon />
          {t('Профиль', 'Profil', 'Profile')}
        </h1>
      </div>

      {toast && (
        <div className="toast-overlay">
          <div className="toast-msg">{toast}</div>
        </div>
      )}

      <div className="profile-topbar">
        <div className="profile-topbar-avatar">{staffName.charAt(0)}</div>
        <div className="profile-topbar-info">
          <div className="profile-name">{staffName}</div>
          <div className="profile-topbar-stats">
            <div className="profile-topbar-stat">
              <span>{t('Роль', 'Rol', 'Role')}</span>
              <b>{roleLabel}</b>
            </div>
            <div className="profile-topbar-stat">
              <span>ID</span>
              <b>{staffId || '—'}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-row">
        <div className="shift-section">
          <h3 className="shift-title">{t('Смена', 'Smena', 'Shift')}</h3>
          <div className="shift-details">
            <div className="shift-row">
              <span className="shift-label">{t('Номер смены:', 'Smena raqami:', 'Shift number:')}</span>
              <span className="shift-value">{shiftNumber}</span>
            </div>
            <div className="shift-row">
              <span className="shift-label">{t('Начало:', 'Boshlanishi:', 'Start:')}</span>
              <span className="shift-value">{shiftStartTime}</span>
            </div>
            <div className="shift-row">
              <span className="shift-label">{t('Конец:', 'Tugashi:', 'End:')}</span>
              <span className="shift-value">{shiftEnding ? shiftEndTime : '—'}</span>
            </div>
            <div className="shift-row">
              <span className="shift-label">{t('Продажи:', 'Savdolar:', 'Sales:')}</span>
              <span className="shift-value highlight">{paidTotal.toLocaleString()} {t('сум', 'so\'m', 'sum')}</span>
            </div>
            <div className="shift-row">
              <span className="shift-label">{t('Обслужено столов:', 'Xizmat qilingan stollar:', 'Tables served:')}</span>
              <span className="shift-value">{servedTables}</span>
            </div>
          </div>
          {shiftEnding && (
            <div className="shift-ending-text">{t('Смена завершена, перенаправление...', 'Smena yakunlandi, yo\'naltirilmoqda...', 'Shift completed, redirecting...')}</div>
          )}
        </div>

        <div className="profile-stats-icons">
          <div className="profile-stat-card">
            <span className="profile-stat-icon stat-sales">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></svg>
            </span>
            <b className="profile-stat-value">{paidTotal.toLocaleString()} {t('сум', 'so\'m', 'sum')}</b>
            <span className="profile-stat-label">{t('Продажи', 'Savdolar', 'Sales')}</span>
          </div>
          <div className="profile-stat-card">
            <span className="profile-stat-icon stat-served">
              <TableIcon />
            </span>
            <b className="profile-stat-value">{servedTables}</b>
            <span className="profile-stat-label">{t('Обслужено столов', 'Xizmat qilingan stollar', 'Tables served')}</span>
          </div>
          <div className="profile-stat-card">
            <span className="profile-stat-icon stat-hours">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </span>
            <b className="profile-stat-value">{workHours}</b>
            <span className="profile-stat-label">{t('Часы работы', 'Ish soatlari', 'Working hours')}</span>
          </div>
        </div>
      </div>

      <div className="profile-row">
        <div className="profile-info-section">
          <h3 className="shift-title">{t('Данные профиля', 'Profil ma\'lumotlari', 'Profile data')}</h3>
          <div className="profile-info-row">
            <span>{t('Имя:', 'Ism:', 'Name:')}</span>
            <b>{staffName}</b>
          </div>
          <div className="profile-info-row">
            <span>{t('Роль:', 'Rol:', 'Role:')}</span>
            <b>{roleLabel}</b>
          </div>
          <div className="profile-info-row">
            <span>ID:</span>
            <b>{staffId || '—'}</b>
          </div>
          <div className="profile-info-row">
            <span>{t('Телефон:', 'Telefon:', 'Phone:')}</span>
            <b>{staffPhone || '—'}</b>
          </div>
        </div>

        <div className="profile-actions">
          <button className="shift-action-btn" onClick={handleShiftAction}>
            {shiftActive ? t('Завершить смену', 'Smenani yakunlash', 'End shift') : t('Начать смену', 'Smenani boshlash', 'Start shift')}
          </button>
          <button className="role-change-btn" onClick={onChangeRole}>{t('Сменить роль', 'Rolni almashtirish', 'Change role')}</button>
        </div>
      </div>
    </div>
  )
}
