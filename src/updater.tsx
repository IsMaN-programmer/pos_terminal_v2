import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

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
              <div className="updater-title">Приложение обновлено</div>
              <div className="updater-desc">
                Обновление v{state.version} успешно загружено.
              </div>
              <div className="updater-actions">
                <button className="updater-btn update" onClick={install}>Перезагрузить</button>
              </div>
            </>
          ) : downloading ? (
            <>
              <div className="updater-title">Загрузка обновления</div>
              <div className="updater-desc">Загружается обновление v{state.version}...</div>
              <ProgressBar percent={state.percent} />
              <div className="updater-percent">{state.percent}%</div>
            </>
          ) : (
            <>
              <div className="updater-title">Обновление обязательно</div>
              <div className="updater-desc">
                {state.releaseNotes || 'Доступна новая версия приложения. Обновление обязательно для продолжения работы.'}
              </div>
              <div className="updater-actions">
                <button className="updater-btn update" onClick={download}>Обновить</button>
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
            <div className="updater-title">Проверка обновлений</div>
            <div className="updater-desc">Поиск новых версий...</div>
            <div className="updater-checking-spinner" />
          </>
        )}
        {state.status === 'available' && (
          <>
            <div className="updater-title">Доступно обновление v{state.version}</div>
            <div className="updater-desc">{state.releaseNotes || 'Доступна новая версия приложения.'}</div>
            <div className="updater-actions">
              <button className="updater-btn later" onClick={closeInfo}>Позже</button>
              <button className="updater-btn update" onClick={download}>Обновить</button>
            </div>
          </>
        )}
        {state.status === 'not-available' && (
          <>
            <div className="updater-title">Обновление не найдено</div>
            <div className="updater-desc">У вас установлена последняя версия приложения.</div>
            <div className="updater-actions">
              <button className="updater-btn update" onClick={closeInfo}>ОК</button>
            </div>
          </>
        )}
        {state.status === 'error' && (
          <>
            <div className="updater-title">Ошибка проверки обновлений</div>
            <div className="updater-desc">{state.error || 'Не удалось проверить наличие обновлений. Проверьте подключение к интернету.'}</div>
            <div className="updater-actions">
              <button className="updater-btn update" onClick={closeInfo}>ОК</button>
            </div>
          </>
        )}
        {state.status === 'idle' && (
          <>
            <div className="updater-title">Проверка обновлений</div>
            <div className="updater-desc">Поиск новых версий...</div>
            <div className="updater-checking-spinner" />
          </>
        )}
      </div>
    </div>
  )
}

export function UpdateButton() {
  const { state, openInfo } = useUpdater()
  if (!window.electronAPI) return null
  const downloading = state.status === 'downloading'
  const hasUpdate = state.status === 'available' && !state.isRequired
  return (
    <button
      className={`sidebar-btn sidebar-update-btn${hasUpdate ? ' has-update' : ''}`}
      onClick={openInfo}
      title={downloading ? 'Загрузка обновления...' : 'Обновление'}
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
