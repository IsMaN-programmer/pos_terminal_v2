import { useState, useEffect } from 'react'
import { dataStore } from './services/dataStore'
import { fiscalDriveApi } from './services/fiscalDriveApi'
import { onFiscalUsbChange } from './services/fiscalNative'
import { isNativeMobile } from './services/capacitor'
import { listFiscalUsbReaders } from './services/fiscalUsb'
import { syncCompanyDataFromCabinet } from './utils/companyInfo'
import { signInCabinet } from './services/cabinetApi'
import { beginAutoCabinetSync } from './services/autoCabinetSync'
import { useT } from './i18n'

interface LoginProps {
  onLogin: (user: { username: string; role: string; fmFactoryId?: string; fmTerminalId?: string }) => void
}

interface FiscalModule {
  factoryId: string
  description: string
  readerName: string
  terminalId: string
}

export default function Login({ onLogin }: LoginProps) {
  const t = useT()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [modules, setModules] = useState<FiscalModule[]>([])
  const [selectedModule, setSelectedModule] = useState('')
  const [fmStatus, setFmStatus] = useState<'checking' | 'found' | 'empty' | 'error'>('checking')
  const [fmHint, setFmHint] = useState('')

  useEffect(() => {
    if (isNativeMobile()) return
    detectFiscalModules()
    if (!isNativeMobile()) return
    let disposed = false
    let handles: { remove: () => Promise<void> }[] = []
    onFiscalUsbChange(() => { if (!disposed) detectFiscalModules() })
      .then(registered => { if (disposed) registered.forEach(handle => void handle.remove()); else handles = registered })
      .catch(() => {})
    return () => { disposed = true; handles.forEach(handle => void handle.remove()) }
  }, [])

  async function usbDiagnostic(): Promise<string> {
    try {
      const readers = await listFiscalUsbReaders()
      if (readers.length === 0) {
        return t('Android не видит USB-устройство. Проверьте OTG и подключение.', 'Android USB qurilmani ko‘rmayapti. OTG va ulanishni tekshiring.', 'Android cannot see the USB device. Check OTG and connection.')
      }
      const ids = readers.map(reader =>
        `${reader.vendorId.toString(16).padStart(4, '0')}:${reader.productId.toString(16).padStart(4, '0')}`
      ).join(', ')
      return `${t('Android видит USB', 'Android USB ni ko‘rmoqda', 'Android sees USB')}: ${ids}. ${t('ФМ не прочитан', 'FM o‘qilmadi', 'Fiscal module was not read')}.`
    } catch (error: any) {
      return `${t('Ошибка USB-моста', 'USB ko‘prigi xatosi', 'USB bridge error')}: ${error?.message || String(error)}`
    }
  }

  async function detectFiscalModules() {
    setFmStatus('checking')
    setFmHint(t('Поиск модулей...', 'Modullar qidirilmoqda...', 'Searching for modules...'))
    try {
      const data = await fiscalDriveApi.listFiscalDrives()
      let list = Array.isArray(data) ? data : (Array.isArray((data as any)?.data) ? (data as any).data : [])

      if (list.length === 0) {
        setModules([])
        setSelectedModule('')
        setFmStatus('empty')
        setFmHint(isNativeMobile()
          ? await usbDiagnostic()
          : t('Подключите фискальный модуль к USB', 'Fiskal modulni USB-ga ulang', 'Connect fiscal module to USB'))
        return
      }

      const fmList: FiscalModule[] = []
      for (const fm of list) {
        const factoryId = fm.FactoryID || fm.factoryId || ''
        let terminalId = ''
        try {
          const info = await fiscalDriveApi.getFiscalMemoryInfo(factoryId)
          const i = info?.data || info || {}
          terminalId = i.TerminalID || i.terminalId || i.terminal_id || ''
        } catch {}

        fmList.push({
          factoryId,
          description: fm.Description || fm.description || '',
          readerName: fm.ReaderName || fm.readerName || '',
          terminalId,
        })
      }

      setModules(fmList)
      setFmStatus('found')
      setFmHint(`${t('Найдено модулей', 'Modullar topildi', 'Modules found')}: ${fmList.length}`)

      if (fmList.length > 0) {
        setSelectedModule(fmList[0].factoryId)
      }
    } catch (error: any) {
      setModules([])
      setSelectedModule('')
      setFmStatus('error')
      setFmHint(isNativeMobile()
        ? `${t('Ошибка чтения ФМ', 'FM o‘qish xatosi', 'Fiscal module read error')}: ${error?.message || String(error)}. ${await usbDiagnostic()}`
        : t('Подключите фискальный модуль к USB', 'Fiskal modulni USB-ga ulang', 'Connect fiscal module to USB'))
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username || !password) {
      setError(t('Введите логин и пароль', 'Login va parolni kiriting', 'Enter login and password'))
      return
    }

    setLoading(true)
    try {
      const terminalId = modules.find(m => m.factoryId === selectedModule)?.terminalId || ''
      let authRes: Response
      try {
        authRes = await signInCabinet(username, password, terminalId)
      } catch {
        setError(t('Нет подключения к интернету', 'Internetga ulanish yo\'q', 'No internet connection'))
        setLoading(false)
        return
      }
      if (!authRes.ok) {
        let msg = ''
        try { msg = String((await authRes.json())?.message ?? '') } catch {}
        if (authRes.status === 502 || /unavailable|fetch failed|ECONNREFUSED|timeout/i.test(msg)) {
          setError(t('Нет подключения к интернету', 'Internetga ulanish yo\'q', 'No internet connection'))
        } else {
          setError((isNativeMobile() && msg) || t('Неверный логин или пароль', 'Login yoki parol noto\'g\'ri', 'Invalid login or password'))
        }
        setLoading(false)
        return
      }
      const authJson = await authRes.json()
      if (isNativeMobile() && authJson?.success === false) throw new Error(authJson.message || 'Ошибка входа')
      const token = authJson?.data?.token || authJson?.token || ''
      if (!token) {
        setError(t('Неверный логин или пароль', 'Login yoki parol noto\'g\'ri', 'Invalid login or password'))
        setLoading(false)
        return
      }
      dataStore.setItem('pos_v2_cabinet_token', token)
      dataStore.setItem('pos_v2_login_username', username)
      if (!isNativeMobile()) dataStore.setItem('pos_v2_login_password', password)
      if (isNativeMobile()) {
        dataStore.removeItem('pos_v2_login_password')
        dataStore.removeItem('pos_v2_fm_factory_id')
        dataStore.removeItem('pos_v2_fm_terminal_id')
      } else {
        dataStore.setItem('pos_v2_fm_factory_id', selectedModule)
        dataStore.setItem('pos_v2_fm_terminal_id', terminalId)
      }

      // Fetch organization requisites (STIR / TIN, name, address) from Cabinet API
      try { await syncCompanyDataFromCabinet() } catch {}
      beginAutoCabinetSync()

      setTimeout(() => onLogin({
        username,
        role: 'admin',
        fmFactoryId: selectedModule,
        fmTerminalId: terminalId,
      }), 200)
    } catch (error) {
      setError(isNativeMobile() && error instanceof Error ? error.message : t('Неверный логин или пароль', 'Login yoki parol noto\'g\'ri', 'Invalid login or password'))
      setLoading(false)
    }
  }

  return (
    <div className="login-overlay">
      <div className="login-container">
        <div className="login-left">
          <div className="login-left-content">
            <div className="login-left-logo">
              <div className="login-logo-wrap">
                <div className="login-logo-bg" />
                <div className="login-logo-ring" />
                <div className="login-logo-ring-2" />
                <div className="login-logo-icon">
                  <img src="/logo.png" alt="logo" />
                </div>
              </div>
            </div>
            <div className="login-left-title">POS Terminal</div>
            <div className="login-left-subtitle">Virtual kassa v2</div>
            <div className="login-left-desc">
              {t('Приложение для управления продажами и заказами в ресторане', 'Restorandagi savdo va buyurtmalarni boshqarish uchun ilova', 'App for managing restaurant sales and orders')}
            </div>
            <div className="login-left-features">
              <div className="login-feature">
                <span className="login-feature-icon">→</span> {t('Быстрая регистрация заказов', 'Buyurtmalarni tez ro\'yxatdan o\'tkazish', 'Quick order registration')}
              </div>
              <div className="login-feature">
                <span className="login-feature-icon">→</span> {t('Управление меню и столами', 'Menyu va stollarni boshqarish', 'Menu and table management')}
              </div>
              <div className="login-feature">
                <span className="login-feature-icon">→</span> {t('Печать чеков и отчёты', 'Cheklarni chop etish va hisobotlar', 'Receipt printing and reports')}
              </div>
            </div>
          </div>
        </div>
        <div className="login-right">
          <div className="login-card">
            <div className="login-card-title">{t('Вход в систему', 'Tizimga kirish', 'Log in')}</div>
            <div className="login-card-subtitle">{t('Введите логин и пароль', 'Login va parolni kiriting', 'Enter login and password')}</div>

            {error && <div className="login-error">{error}</div>}

            <form onSubmit={handleLogin}>
              <div className="login-field">
                <label className="login-label" htmlFor="login-username">{t('Логин', 'Login', 'Login')}</label>
                <input
                  id="login-username"
                  type="text"
                  className="login-input"
                  placeholder={t('Введите логин', 'Loginni kiriting', 'Enter login')}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="login-field">
                <label className="login-label" htmlFor="login-password">{t('Пароль', 'Parol', 'Password')}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="login-input"
                    style={{ paddingRight: 40 }}
                    placeholder={t('Введите пароль', 'Parolni kiriting', 'Enter password')}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <span style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    cursor: 'pointer', color: '#94a3b8', display: 'flex', lineHeight: 1
                  }} onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </span>
                </div>
              </div>

              {!isNativeMobile() && <div className="login-field">
                <label className="login-label" htmlFor="login-fm">{t('Фискальный модуль', 'Fiskal modul', 'Fiscal module')}</label>
                <div className="login-input-group">
                  <div className="login-select-wrap">
                    <select
                      id="login-fm"
                      className="login-input login-select"
                      value={selectedModule}
                      onChange={e => setSelectedModule(e.target.value)}
                      disabled={fmStatus === 'checking'}
                    >
                      {fmStatus === 'checking' && (
                        <option value="">{t('Поиск модулей...', 'Modullar qidirilmoqda...', 'Searching for modules...')}</option>
                      )}
                      {(fmStatus === 'empty' || fmStatus === 'error') && (
                        <option value="">{t('Фискальные модули не найдены', 'Fiskal modullar topilmadi', 'No fiscal modules found')}</option>
                      )}
                      {modules.map(m => (
                        <option key={m.factoryId} value={m.factoryId}>
                          {m.terminalId || m.description || m.readerName || m.factoryId}
                        </option>
                      ))}
                    </select>
                    <span className="login-select-chevron">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="login-input-btn"
                    onClick={detectFiscalModules}
                    title={t('Обновить список модулей', 'Modullar ro\'yxatini yangilash', 'Refresh module list')}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </button>
                </div>
                {(fmStatus === 'empty' || fmStatus === 'error') && (
                  <div className="login-field-hint login-field-hint-warn">
                    {fmHint}
                  </div>
                )}
                {fmStatus === 'found' && fmHint && (
                  <div className="login-field-hint">{fmHint}</div>
                )}
                {fmStatus === 'checking' && (
                  <div className="login-field-hint">{t('Поиск модулей...', 'Modullar qidirilmoqda...', 'Searching for modules...')}</div>
                )}

              </div>}
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? t('Вход...', 'Kirilmoqda...', 'Logging in...') : t('Войти', 'Kirish', 'Log in')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
