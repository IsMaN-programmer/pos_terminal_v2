import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useT } from './i18n'

const INITIAL_STATE: UpdateState = {
  status: 'idle',
  version: '',
  currentVersion: '',
  isRequired: false,
  releaseNotes: '',
  percent: 0,
  error: '',
  available: false,
}

interface UpdaterContextValue {
  state: UpdateState
  infoOpen: boolean
  openInfo: () => void
  closeInfo: () => void
  download: () => void
  install: () => void
}

const UpdaterContext = createContext<UpdaterContextValue>({
  state: INITIAL_STATE,
  infoOpen: false,
  openInfo: () => {},
  closeInfo: () => {},
  download: () => {},
  install: () => {},
})

export function useUpdater() {
  return useContext(UpdaterContext)
}

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UpdateState>(INITIAL_STATE)
  const [infoOpen, setInfoOpen] = useState(false)

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    let unsubscribe: (() => void) | undefined
    ;(async () => {
      try {
        setState(await api.getUpdateState())
      } catch {}
      unsubscribe = api.onUpdateStatus(setState)
    })()
    return () => { unsubscribe?.() }
  }, [])

  const openInfo = useCallback(() => {
    if (!window.electronAPI) return
    if (state.status === 'downloading' || state.status === 'downloaded') return
    setInfoOpen(true)
    window.electronAPI.checkForUpdates().catch(() => {})
  }, [state.status])

  const closeInfo = useCallback(() => setInfoOpen(false), [])

  const download = useCallback(() => {
    const api = window.electronAPI
    if (!api) return
    setInfoOpen(false)
    api.downloadUpdate().catch(() => {})
  }, [])

  const install = useCallback(() => {
    window.electronAPI?.quitAndInstall()
  }, [])

  return (
    <UpdaterContext.Provider value={{ state, infoOpen, openInfo, closeInfo, download, install }}>
      {children}
    </UpdaterContext.Provider>
  )
}

function UpdateLogo() {
  return (
    <div className="updater-logo">
      <div className="login-logo-bg" />
      <div className="login-logo-ring" />
      <div className="login-logo-ring-2" />
      <div className="login-logo-icon">
        <img src="/logo.png" alt="logo" />
      </div>
    </div>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="updater-progress">
      <div className="updater-progress-fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  )
}

export function UpdateModals() {
  const { state, infoOpen, closeInfo, download, install } = useUpdater()
  const t = useT()
  if (!window.electronAPI) return null

  const forced = state.status === 'available' && state.isRequired
  const downloading = state.status === 'downloading'
  const downloaded = state.status === 'downloaded'

  if (forced || downloaded) {
    return (
      <div className="forced-update-overlay">
        <div className="updater-modal">
          <UpdateLogo />
          <div className="updater-line" />
          {downloaded ? (
            <>
              <div className="updater-title">{t('Приложение обновлено', 'Ilova yangilandi')}</div>
              <div className="updater-desc">
                {t('Обновление', 'Yangilanish')} v{state.version} {t('успешно загружено.', 'muvaffaqiyatli yuklab olindi.')}
              </div>
              <div className="updater-actions">
                <button className="updater-btn update" onClick={install}>{t('Перезагрузить', 'Qayta ishga tushirish')}</button>
              </div>
            </>
          ) : downloading ? (
            <>
              <div className="updater-title">{t('Загрузка обновления', 'Yangilanish yuklanmoqda')}</div>
              <div className="updater-desc">{t('Загружается обновление', 'Yangilanish yuklanmoqda')} v{state.version}...</div>
              <ProgressBar percent={state.percent} />
              <div className="updater-percent">{state.percent}%</div>
            </>
          ) : (
            <>
              <div className="updater-title">{t('Обновление обязательно', 'Yangilanish majburiy')}</div>
              <div className="updater-desc">
                {state.releaseNotes || t('Доступна новая версия приложения. Обновление обязательно для продолжения работы.', 'Ilovaning yangi versiyasi mavjud. Ishlashni davom ettirish uchun yangilash majburiy.')}
              </div>
              <div className="updater-actions">
                <button className="updater-btn update" onClick={download}>{t('Обновить', 'Yangilash')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  if (!infoOpen) return null

  return (
    <div className="modal-overlay" onClick={closeInfo}>
      <div className="updater-modal" onClick={e => e.stopPropagation()}>
        <UpdateLogo />
        <div className="updater-line" />
        {state.status === 'checking' && (
          <>
            <div className="updater-title">{t('Проверка обновлений', 'Yangilanishlar tekshirilmoqda')}</div>
            <div className="updater-desc">{t('Поиск новых версий...', 'Yangi versiyalar qidirilmoqda...')}</div>
            <div className="updater-checking-spinner" />
          </>
        )}
        {state.status === 'available' && (
          <>
            <div className="updater-title">{t('Доступно обновление', 'Yangilanish mavjud')} v{state.version}</div>
            <div className="updater-desc">{state.releaseNotes || t('Доступна новая версия приложения.', 'Ilovaning yangi versiyasi mavjud.')}</div>
            <div className="updater-actions">
              <button className="updater-btn later" onClick={closeInfo}>{t('Позже', 'Keyinroq')}</button>
              <button className="updater-btn update" onClick={download}>{t('Обновить', 'Yangilash')}</button>
            </div>
          </>
        )}
        {state.status === 'not-available' && (
          <>
            <div className="updater-title">{t('Обновление не найдено', 'Yangilanish topilmadi')}</div>
            <div className="updater-desc">{t('У вас установлена последняя версия приложения.', 'Sizda ilovaning eng so\'nggi versiyasi o\'rnatilgan.')}</div>
            <div className="updater-actions">
              <button className="updater-btn update" onClick={closeInfo}>OK</button>
            </div>
          </>
        )}
        {state.status === 'error' && (
          <>
            <div className="updater-title">{t('Ошибка проверки обновлений', 'Yangilanishlarni tekshirishda xato')}</div>
            <div className="updater-desc">{state.error || t('Не удалось проверить наличие обновлений. Проверьте подключение к интернету.', 'Yangilanishlar mavjudligini tekshirib bo\'lmadi. Internetga ulanishni tekshiring.')}</div>
            <div className="updater-actions">
              <button className="updater-btn update" onClick={closeInfo}>OK</button>
            </div>
          </>
        )}
        {state.status === 'idle' && (
          <>
            <div className="updater-title">{t('Проверка обновлений', 'Yangilanishlar tekshirilmoqda')}</div>
            <div className="updater-desc">{t('Поиск новых версий...', 'Yangi versiyalar qidirilmoqda...')}</div>
            <div className="updater-checking-spinner" />
          </>
        )}
      </div>
    </div>
  )
}

export function UpdateButton() {
  const { state, openInfo } = useUpdater()
  const t = useT()
  if (!window.electronAPI) return null
  const downloading = state.status === 'downloading'
  const hasUpdate = state.status === 'available' && !state.isRequired
  return (
    <button
      className={`sidebar-btn sidebar-update-btn${hasUpdate ? ' has-update' : ''}`}
      onClick={openInfo}
      title={downloading ? t('Загрузка обновления...', 'Yangilanish yuklanmoqda...') : t('Обновление', 'Yangilanish')}
    >
      <span className="sidebar-icon updater-sidebar-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
        {downloading && <span className="update-spinner-small" />}
        {hasUpdate && <span className="updater-dot" />}
      </span>
    </button>
  )
}
