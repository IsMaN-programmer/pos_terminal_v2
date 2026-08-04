import { useState, useEffect } from 'react'
import { fiscalDriveApi } from './services/fiscalDriveApi'
import { fetchAndStoreCompanyData } from './utils/companyInfo'
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
    detectFiscalModules()
  }, [])

  async function detectFiscalModules() {
    setFmStatus('checking')
    setFmHint(t('Поиск модулей...', 'Modullar qidirilmoqda...'))
    try {
      const data = await fiscalDriveApi.listFiscalDrives()
      let list = Array.isArray(data) ? data : (Array.isArray((data as any)?.data) ? (data as any).data : [])

      if (list.length === 0) {
        setModules([])
        setSelectedModule('')
        setFmStatus('empty')
        setFmHint(t('Подключите фискальный модуль к USB', 'Fiskal modulni USB-ga ulang'))
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
      setFmHint(`${t('Найдено модулей', 'Modullar topildi')}: ${fmList.length}`)

      if (fmList.length > 0) {
        setSelectedModule(fmList[0].factoryId)
      }
    } catch {
      setModules([])
      setSelectedModule('')
      setFmStatus('empty')
      setFmHint(t('Подключите фискальный модуль к USB', 'Fiskal modulni USB-ga ulang'))
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username || !password) {
      setError(t('Введите логин и пароль', 'Login va parolni kiriting'))
      return
    }

    setLoading(true)
    try {
      const terminalId = modules.find(m => m.factoryId === selectedModule)?.terminalId || ''
      const versionKey = '7760BA2B102041B99A24DD9D823FB9AE'
      const authRes = await fetch('/api/cabinet-proxy/desktop/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, terminalId, versionKey })
      })
      if (!authRes.ok) {
        setError(t('Неверный логин или пароль', 'Login yoki parol noto\'g\'ri'))
        setLoading(false)
        return
      }
      const authJson = await authRes.json()
      const token = authJson?.data?.token || authJson?.token || ''
      if (!token) {
        setError(t('Неверный логин или пароль', 'Login yoki parol noto\'g\'ri'))
        setLoading(false)
        return
      }
      localStorage.setItem('pos_v2_cabinet_token', token)
      localStorage.setItem('pos_v2_login_username', username)
      localStorage.setItem('pos_v2_login_password', password)
      localStorage.setItem('pos_v2_fm_factory_id', selectedModule)
      localStorage.setItem('pos_v2_fm_terminal_id', terminalId)

      // Fetch and store real organization STIR / TIN
      try { await fetchAndStoreCompanyData() } catch {}

      setTimeout(() => onLogin({
        username,
        role: 'admin',
        fmFactoryId: selectedModule,
        fmTerminalId: terminalId,
      }), 200)
    } catch {
      setError(t('Неверный логин или пароль', 'Login yoki parol noto\'g\'ri'))
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
              {t('Приложение для управления продажами и заказами в ресторане', 'Restorandagi savdo va buyurtmalarni boshqarish uchun ilova')}
            </div>
            <div className="login-left-features">
              <div className="login-feature">
                <span className="login-feature-icon">→</span> {t('Быстрая регистрация заказов', 'Buyurtmalarni tez ro\'yxatdan o\'tkazish')}
              </div>
              <div className="login-feature">
                <span className="login-feature-icon">→</span> {t('Управление меню и столами', 'Menyu va stollarni boshqarish')}
              </div>
              <div className="login-feature">
                <span className="login-feature-icon">→</span> {t('Печать чеков и отчёты', 'Cheklarni chop etish va hisobotlar')}
              </div>
            </div>
          </div>
        </div>
        <div className="login-right">
          <div className="login-card">
            <div className="login-card-title">{t('Вход в систему', 'Tizimga kirish')}</div>
            <div className="login-card-subtitle">{t('Введите логин и пароль', 'Login va parolni kiriting')}</div>

            {error && <div className="login-error">{error}</div>}

            <form onSubmit={handleLogin}>
              <div className="login-field">
                <label className="login-label" htmlFor="login-username">{t('Логин', 'Login')}</label>
                <input
                  id="login-username"
                  type="text"
                  className="login-input"
                  placeholder={t('Введите логин', 'Loginni kiriting')}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="login-field">
                <label className="login-label" htmlFor="login-password">{t('Пароль', 'Parol')}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="login-input"
                    style={{ paddingRight: 40 }}
                    placeholder={t('Введите пароль', 'Parolni kiriting')}
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

              <div className="login-field">
                <label className="login-label" htmlFor="login-fm">{t('Фискальный модуль', 'Fiskal modul')}</label>
                <div className="login-input-group">
                  <select
                    id="login-fm"
                    className="login-input login-select"
                    value={selectedModule}
                    onChange={e => setSelectedModule(e.target.value)}
                    disabled={fmStatus === 'checking'}
                  >
                    {fmStatus === 'checking' && (
                      <option value="">{t('Поиск модулей...', 'Modullar qidirilmoqda...')}</option>
                    )}
                    {fmStatus === 'empty' && (
                      <option value="">{t('Фискальные модули не найдены', 'Fiskal modullar topilmadi')}</option>
                    )}
                    {modules.map(m => (
                      <option key={m.factoryId} value={m.factoryId}>
                        {m.terminalId || m.description || m.readerName || m.factoryId}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="login-input-btn"
                    onClick={detectFiscalModules}
                    title={t('Обновить список модулей', 'Modullar ro\'yxatini yangilash')}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </button>
                </div>
                {fmStatus === 'empty' && (
                  <div className="login-field-hint login-field-hint-warn">
                    {t('Подключите фискальный модуль к USB', 'Fiskal modulni USB-ga ulang')}
                  </div>
                )}
                {fmStatus === 'found' && fmHint && (
                  <div className="login-field-hint">{fmHint}</div>
                )}
                {fmStatus === 'checking' && (
                  <div className="login-field-hint">{t('Поиск модулей...', 'Modullar qidirilmoqda...')}</div>
                )}

              </div>

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? t('Вход...', 'Kirilmoqda...') : t('Войти', 'Kirish')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
