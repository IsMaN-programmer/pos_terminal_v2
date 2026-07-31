import { useState, useEffect } from 'react'
import { fetchAndStoreCompanyData } from '../utils/companyInfo'
import { getConnectedPrinters } from '../utils/printService'
import { useUpdater } from '../updater'

interface OrgData {
  name: string
  stir: string
  address: string
  phone: string
  employee: string
}

const PRINTERS_KEY = 'pos_v2_printer_name'
const PAPER_KEY = 'pos_v2_paper_size'
const LANG_KEY = 'pos_v2_language'

interface AdminSettingsProps {
  onLogout: () => void
  onChangeRole: () => void
  onDataDeleted: () => void
}

export default function AdminSettings({ onLogout, onChangeRole, onDataDeleted }: AdminSettingsProps) {
  const username = localStorage.getItem('pos_v2_login_username') || ''
  const password = localStorage.getItem('pos_v2_login_password') || ''
  const [showPassword, setShowPassword] = useState(false)
  const [org, setOrg] = useState<OrgData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteModal, setDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const [printerName, setPrinterName] = useState(localStorage.getItem(PRINTERS_KEY) || '')
  const [paperSize, setPaperSize] = useState(localStorage.getItem(PAPER_KEY) || '58')
  const [language, setLanguage] = useState(localStorage.getItem(LANG_KEY) || 'ru')
  const [printers, setPrinters] = useState<string[]>([])
  const { state: updaterState } = useUpdater()
  const appVersion = updaterState.currentVersion || '—'

  useEffect(() => {
    ;(async () => {
      try {
        const token = localStorage.getItem('pos_v2_cabinet_token') || ''
        if (!token) { setError('Не выполнен вход в cabinet.posvk.uz'); setLoading(false); return }
        const res = await fetch('/api/cabinet-proxy/api/company-data', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (!res.ok) {
          const text = await res.text()
          let msg: string
          try { const j = JSON.parse(text); msg = j.error || j.message || text } catch { msg = text }
          if (msg.includes('fetch failed') || msg.includes('Cabinet API unavailable')) msg = 'Кабинет недоступен, проверьте подключение к интернету'
          throw new Error(msg || `HTTP ${res.status}`)
        }
        const data = await res.json()
        const d = data?.data || data || {}
        if (d && d.name) {
          setOrg({
            name: d.name || d.correctName || '—',
            stir: d.tin || '—',
            address: d.address || '—',
            phone: d.phone || d.agentPhone || '—',
            employee: d.agentFio || '—',
          })
          // Persist real STIR and org info into localStorage for receipts
          await fetchAndStoreCompanyData()
          setLoading(false)
        } else {
          setError('Не удалось загрузить данные организации: неизвестный формат ответа')
          setLoading(false)
        }
      } catch (e: any) {
        setError(e?.message || 'Не удалось загрузить данные организации')
      }
      setLoading(false)
    })()
    getConnectedPrinters().then(setPrinters)
  }, [])

  function handlePrinterChange(value: string) {
    setPrinterName(value)
    if (value) localStorage.setItem(PRINTERS_KEY, value)
    else localStorage.removeItem(PRINTERS_KEY)
  }

  function handlePaperChange(size: string) {
    setPaperSize(size)
    localStorage.setItem(PAPER_KEY, size)
  }

  function handleLangChange(lang: string) {
    setLanguage(lang)
    localStorage.setItem(LANG_KEY, lang)
  }

  function handleDelete() {
    if (!deletePassword) {
      setDeleteError('Введите пароль')
      return
    }
    if (deletePassword !== password) {
      setDeleteError('Неверный пароль')
      return
    }
    setDeleteError('')
    setDeleting(true)
    setTimeout(() => onDataDeleted(), 2500)
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">Настройки</h1>
      </div>
      <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, padding: '20px 0' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>Данные организации</h3>
          {loading && <div style={{ color: '#94a3b8', fontSize: 14 }}>Загрузка...</div>}
          {error && <div style={{ color: '#ef4444', fontSize: 14, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="admin-settings-row"><span className="admin-settings-label">Логин</span><span className="admin-settings-value">{username || '—'}</span></div>
            <div className="admin-settings-row">
              <span className="admin-settings-label">Пароль</span>
              <span className="admin-settings-value" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', maxWidth: '60%' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{showPassword ? password : '••••••••'}</span>
                <span style={{ cursor: 'pointer', color: '#94a3b8', display: 'flex', flexShrink: 0, lineHeight: 1 }} onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </span>
              </span>
            </div>
            {org && (
              <>
                <div className="admin-settings-divider" />
                <div className="admin-settings-row"><span className="admin-settings-label">Название организации</span><span className="admin-settings-value">{org.name}</span></div>
                <div className="admin-settings-row"><span className="admin-settings-label">СТИР (ИНН)</span><span className="admin-settings-value">{org.stir}</span></div>
                <div className="admin-settings-row"><span className="admin-settings-label">Адрес</span><span className="admin-settings-value">{org.address}</span></div>
                <div className="admin-settings-row"><span className="admin-settings-label">Телефон</span><span className="admin-settings-value">{org.phone}</span></div>
                <div className="admin-settings-row"><span className="admin-settings-label">Прикрепленный сотрудник</span><span className="admin-settings-value">{org.employee}</span></div>
              </>
            )}
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>Основные настройки</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Настройка принтера</div>
              <div className="admin-settings-printer-block">
                <div className="admin-settings-printer-group">
                  <label>Принтер</label>
                  <select className="admin-settings-printer-select" value={printerName} onChange={e => handlePrinterChange(e.target.value)}>
                    <option value="">— Выберите принтер —</option>
                    {printers.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="admin-settings-printer-group">
                  <label>Формат бумаги</label>
                  <select className="admin-settings-printer-select" value={paperSize} onChange={e => handlePaperChange(e.target.value)}>
                    <option value="58">58 мм</option>
                    <option value="80">80 мм</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="admin-settings-divider" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Смена языка</div>
              <div className="admin-settings-lang-row">
                <button className={`admin-settings-lang-btn${language === 'ru' ? ' active' : ''}`} onClick={() => handleLangChange('ru')}>Русский</button>
                <button className={`admin-settings-lang-btn${language === 'uz' ? ' active' : ''}`} onClick={() => handleLangChange('uz')}>Узбекский</button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', gap: 32, justifyContent: 'center' }}>
          <button onClick={onLogout} style={{ padding: '14px 44px', border: '1px solid #ef4444', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Выйти</button>
          <button onClick={onChangeRole} style={{ padding: '14px 44px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Сменить роль</button>
          <button onClick={() => { setDeletePassword(''); setDeleteError(''); setDeleteModal(true) }} style={{ padding: '12px 34px', border: '1px solid #ef4444', borderRadius: 8, background: '#fff', color: '#dc2626', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Удалить данные</button>
        </div>

        <div style={{ textAlign: 'center', padding: '8px 0 4px', color: '#94a3b8', fontSize: 13 }}>
          Версия приложения: v{appVersion}
        </div>
      </div>
      {deleteModal && (
        <div className="modal-overlay" onClick={() => { if (!deleting) { setDeleteModal(false); setDeletePassword(''); setDeleteError('') } }}>
          <div className="modal-content" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            {deleting ? (
              <>
                <div className="modal-title">Удаление данных</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '12px 0 24px' }}>
                  <div className="print-loading-spinner" style={{ width: 56, height: 56 }} />
                  <div style={{ fontSize: 14, color: '#64748b' }}>Удаление всех данных... Пожалуйста, подождите</div>
                </div>
              </>
            ) : (
              <>
                <div className="modal-title">Удалить данные</div>
                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
                  Будет удалена вся информация: категории, чеки, роли, товары и другие данные. Введите пароль от логина для подтверждения.
                </div>
                <input
                  type="password"
                  className="modal-input"
                  placeholder="Пароль от логина"
                  value={deletePassword}
                  onChange={e => { setDeletePassword(e.target.value); setDeleteError('') }}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleDelete() }}
                />
                {deleteError && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{deleteError}</div>}
                <div className="modal-actions">
                  <button className="modal-btn cancel" onClick={() => { setDeleteModal(false); setDeletePassword(''); setDeleteError('') }}>Отменить</button>
                  <button className="modal-btn" style={{ background: '#ef4444', color: '#fff', border: 'none' }} onClick={handleDelete}>Удалить</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}