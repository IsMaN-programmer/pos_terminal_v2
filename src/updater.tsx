import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useT } from './i18n'
import refreshIcon from './assets/icons/refresh.png'

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
              <div className="updater-title">{t('Приложение обновлено', 'Ilova yangilandi', 'App updated')}</div>
              <div className="updater-desc">
                {t('Обновление', 'Yangilanish', 'Update')} v{state.version} {t('успешно загружено.', 'muvaffaqiyatli yuklab olindi.', 'successfully downloaded.')}
              </div>
              <div className="updater-actions">
                <button className="updater-btn update" onClick={install}>{t('Перезагрузить', 'Qayta ishga tushirish', 'Restart')}</button>
              </div>
            </>
          ) : downloading ? (
            <>
              <div className="updater-title">{t('Загрузка обновления', 'Yangilanish yuklanmoqda', 'Downloading update')}</div>
              <div className="updater-desc">{t('Загружается обновление', 'Yangilanish yuklanmoqda', 'Update downloading')} v{state.version}...</div>
              <ProgressBar percent={state.percent} />
              <div className="updater-percent">{state.percent}%</div>
            </>
          ) : (
            <>
              <div className="updater-title">{t('Обновление обязательно', 'Yangilanish majburiy', 'Update required')}</div>
              <div className="updater-desc">
                {state.releaseNotes || t('Доступна новая версия приложения. Обновление обязательно для продолжения работы.', 'Ilovaning yangi versiyasi mavjud. Ishlashni davom ettirish uchun yangilash majburiy.', 'A new version of the app is available. Update required to continue.')}
              </div>
              <div className="updater-actions">
                <button className="updater-btn update" onClick={download}>{t('Обновить', 'Yangilash', 'Update')}</button>
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
            <div className="updater-title">{t('Проверка обновлений', 'Yangilanishlar tekshirilmoqda', 'Checking for updates')}</div>
            <div className="updater-desc">{t('Поиск новых версий...', 'Yangi versiyalar qidirilmoqda...', 'Searching for new versions...')}</div>
            <div className="updater-checking-spinner" />
          </>
        )}
        {state.status === 'available' && (
          <>
            <div className="updater-title">{t('Доступно обновление', 'Yangilanish mavjud', 'Update available')} v{state.version}</div>
            <div className="updater-desc">{state.releaseNotes || t('Доступна новая версия приложения.', 'Ilovaning yangi versiyasi mavjud.', 'A new version of the app is available.')}</div>
            <div className="updater-actions">
              <button className="updater-btn later" onClick={closeInfo}>{t('Позже', 'Keyinroq', 'Later')}</button>
              <button className="updater-btn update" onClick={download}>{t('Обновить', 'Yangilash', 'Update')}</button>
            </div>
          </>
        )}
        {state.status === 'not-available' && (
          <>
            <div className="updater-title">{t('Обновление не найдено', 'Yangilanish topilmadi', 'No update found')}</div>
            <div className="updater-desc">{t('У вас установлена последняя версия приложения.', 'Sizda ilovaning eng so\'nggi versiyasi o\'rnatilgan.', 'You have the latest version of the app installed.')}</div>
            <div className="updater-actions">
              <button className="updater-btn update" onClick={closeInfo}>OK</button>
            </div>
          </>
        )}
        {state.status === 'error' && (
          <>
            <div className="updater-title">{t('Ошибка проверки обновлений', 'Yangilanishlarni tekshirishda xato', 'Failed to check for updates')}</div>
            <div className="updater-desc">{state.error || t('Не удалось проверить наличие обновлений. Проверьте подключение к интернету.', 'Yangilanishlar mavjudligini tekshirib bo\'lmadi. Internetga ulanishni tekshiring.', 'Failed to check for updates. Please check your internet connection.')}</div>
            <div className="updater-actions">
              <button className="updater-btn update" onClick={closeInfo}>OK</button>
            </div>
          </>
        )}
        {state.status === 'idle' && (
          <>
            <div className="updater-title">{t('Проверка обновлений', 'Yangilanishlar tekshirilmoqda', 'Checking for updates')}</div>
            <div className="updater-desc">{t('Поиск новых версий...', 'Yangi versiyalar qidirilmoqda...', 'Searching for new versions...')}</div>
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
  const inElectron = !!window.electronAPI
  const downloading = state.status === 'downloading'
  const hasUpdate = state.status === 'available' && !state.isRequired
  return (
    <button
      className={`sidebar-btn sidebar-update-btn${hasUpdate ? ' has-update' : ''}`}
      onClick={() => { if (inElectron) openInfo() }}
      title={downloading ? t('Загрузка обновления...', 'Yangilanish yuklanmoqda...', 'Downloading update...') : t('Обновление', 'Yangilanish', 'Update')}
    >
      <span className="sidebar-icon updater-sidebar-icon">
        <img src={refreshIcon} alt="" className="sidebar-nav-img" />
        {inElectron && downloading && <span className="update-spinner-small" />}
        {inElectron && hasUpdate && <span className="updater-dot" />}
      </span>
      <span className="sidebar-label">{t('Обновление', 'Yangilanish', 'Update')}</span>
    </button>
  )
}
