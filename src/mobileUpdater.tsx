import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from './i18n'
import refreshIcon from './assets/icons/refresh.png'
import { isNativeMobile } from './services/capacitor'
import {
  checkForMobileUpdate,
  downloadAndInstallApk,
  mobileUpdateError,
  type MobileUpdateInfo,
} from './services/mobileUpdater'

export type { MobileUpdateInfo }

/**
 * Mobile over-the-air update state (mirrors the desktop electron-updater
 * flow: check → download with progress → install).
 */
export function useMobileUpdate() {
  const [info, setInfo] = useState<MobileUpdateInfo | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const busyRef = useRef(false)

  const check = useCallback(async (openWhenFound: boolean) => {
    if (!isNativeMobile() || busyRef.current) return
    busyRef.current = true
    setChecking(true)
    try {
      const found = await checkForMobileUpdate()
      if (found) {
        setInfo(found)
        if (openWhenFound || found.required) setInfoOpen(true)
      }
      return found
    } catch {
      return null
    } finally {
      busyRef.current = false
      setChecking(false)
    }
  }, [])

  // Background check shortly after login, like the desktop updater.
  useEffect(() => {
    if (!isNativeMobile()) return
    const timer = setTimeout(() => { void check(false) }, 4000)
    return () => clearTimeout(timer)
  }, [check])

  const openPanel = useCallback(() => {
    if (info) {
      setInfoOpen(true)
    } else {
      setInfoOpen(true)
      void check(true)
    }
  }, [info, check])

  return { info, infoOpen, setInfoOpen, checking, check, openPanel }
}

export function MobileUpdateButton({
  hasUpdate,
  busy,
  onClick,
}: {
  hasUpdate: boolean
  busy: boolean
  onClick: () => void
}) {
  const t = useT()
  return (
    <button
      className={`sidebar-btn sidebar-update-btn${hasUpdate && !busy ? ' has-update' : ''}`}
      onClick={onClick}
      title={busy
        ? t('Проверка обновлений...', 'Yangilanishlar tekshirilmoqda...', 'Checking for updates...')
        : t('Обновление', 'Yangilanish', 'Update')}
    >
      <span className="sidebar-icon updater-sidebar-icon">
        <img src={refreshIcon} alt="" className="sidebar-nav-img" />
        {busy && <span className="update-spinner-small" />}
        {!busy && hasUpdate && <span className="updater-dot" />}
      </span>
      <span className="sidebar-label">{t('Обновление', 'Yangilanish', 'Update')}</span>
    </button>
  )
}

export function MobileUpdateModals({
  info,
  infoOpen,
  onClose,
}: {
  info: MobileUpdateInfo | null
  infoOpen: boolean
  onClose: () => void
}) {
  const t = useT()
  const [downloading, setDownloading] = useState(false)
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (infoOpen) {
      setDownloading(false)
      setPercent(0)
      setError('')
    }
  }, [infoOpen, info])

  const download = useCallback(async () => {
    if (!info || downloading) return
    setDownloading(true)
    setPercent(0)
    setError('')
    try {
      await downloadAndInstallApk(info, setPercent)
      onClose()
    } catch (e) {
      setError(mobileUpdateError(e))
    } finally {
      setDownloading(false)
    }
  }, [info, downloading, onClose])

  if (!isNativeMobile() || !infoOpen) return null

  return (
    <div className="forced-update-overlay">
      <div className="updater-modal">
        <div className="updater-logo">
          <div className="login-logo-bg" />
          <div className="login-logo-ring" />
          <div className="login-logo-ring-2" />
        </div>
        <div className="updater-line" />
        {!info && (
          <>
            <div className="updater-title">{t('У вас последняя версия', 'Sizda so‘nggi versiya', 'You have the latest version')}</div>
            <div className="updater-actions">
              <button className="updater-btn later" onClick={onClose}>{t('Закрыть', 'Yopish', 'Close')}</button>
            </div>
          </>
        )}
        {info && !downloading && !error && (
          <>
            <div className="updater-title">{t('Доступно обновление', 'Yangilanish mavjud', 'Update available')} v{info.version}</div>
            {info.notes && <div className="updater-desc">{info.notes.slice(0, 500)}</div>}
            <div className="updater-desc">{info.apkName}</div>
            <div className="updater-actions">
              {!info.required && (
                <button className="updater-btn later" onClick={onClose}>{t('Позже', 'Keyinroq', 'Later')}</button>
              )}
              <button className="updater-btn update" onClick={() => void download()}>{t('Скачать', 'Yuklab olish', 'Download')}</button>
            </div>
          </>
        )}
        {info && downloading && !error && (
          <>
            <div className="updater-title">{t('Загрузка обновления...', 'Yangilanish yuklanmoqda...', 'Downloading update...')}</div>
            <div className="updater-progress">
              <div className="updater-progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="updater-percent">{percent}%</div>
          </>
        )}
        {error && (
          <>
            <div className="updater-title">{t('Не получилось обновить', 'Yangilab bo‘lmadi', 'Update failed')}</div>
            <div className="updater-desc">{error}</div>
            <div className="updater-actions">
              <button className="updater-btn later" onClick={onClose}>{t('Закрыть', 'Yopish', 'Close')}</button>
              {info && !downloading && (
                <button className="updater-btn update" onClick={() => { setError(''); setPercent(0) }}>{t('Повторить', 'Qayta urinish', 'Retry')}</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
