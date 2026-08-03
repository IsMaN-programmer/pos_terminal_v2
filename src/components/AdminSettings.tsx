import { useState, useEffect, useRef } from 'react'
import { getConnectedPrinters } from '../utils/printService'
import { getCompanyTin, getCompanyName, getCompanyAddress, getCompanyPhone, getCompanyEmployee, saveCompanyData } from '../utils/companyInfo'
import { useUpdater } from '../updater'
import { getReceiptLogo, setReceiptLogo, resetReceiptLogo, resizeReceiptLogo } from '../utils/receiptLogo'

const PRINTERS_KEY = 'pos_v2_printer_name'
const KITCHEN_PRINTERS_KEY = 'pos_v2_kitchen_printer_name'
const PAPER_KEY = 'pos_v2_paper_size'
const KITCHEN_PAPER_KEY = 'pos_v2_kitchen_paper_size'
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
  const [orgName, setOrgName] = useState(getCompanyName())
  const [orgStir, setOrgStir] = useState(getCompanyTin())
  const [orgAddress, setOrgAddress] = useState(getCompanyAddress())
  const [orgPhone, setOrgPhone] = useState(getCompanyPhone())
  const [orgEmployee, setOrgEmployee] = useState(getCompanyEmployee())
  const [orgSaved, setOrgSaved] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const [printerName, setPrinterName] = useState(localStorage.getItem(PRINTERS_KEY) || '')
  const [kitchenPrinterName, setKitchenPrinterName] = useState(localStorage.getItem(KITCHEN_PRINTERS_KEY) || '')
  const [kitchenPaperSize, setKitchenPaperSize] = useState(localStorage.getItem(KITCHEN_PAPER_KEY) || '58')
  const [paperSize, setPaperSize] = useState(localStorage.getItem(PAPER_KEY) || '58')
  const [language, setLanguage] = useState(localStorage.getItem(LANG_KEY) || 'ru')
  const [logo, setLogo] = useState(getReceiptLogo())
  const [logoError, setLogoError] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [printers, setPrinters] = useState<string[]>(() => {
    const saved = localStorage.getItem(PRINTERS_KEY)
    return saved ? [saved] : []
  })
  const { state: updaterState } = useUpdater()
  const appVersion = updaterState.currentVersion || '—'

  useEffect(() => {
    getConnectedPrinters().then(list => {
      const saved = localStorage.getItem(PRINTERS_KEY)
      setPrinters(saved && !list.includes(saved) ? [saved, ...list] : list)
    })
  }, [])

  function handleOrgSave() {
    saveCompanyData({
      name: orgName,
      stir: orgStir,
      address: orgAddress,
      phone: orgPhone,
      employee: orgEmployee,
    })
    setOrgSaved(true)
    setTimeout(() => setOrgSaved(false), 2000)
  }

  function handlePrinterChange(value: string) {
    setPrinterName(value)
    if (value) localStorage.setItem(PRINTERS_KEY, value)
    else localStorage.removeItem(PRINTERS_KEY)
  }

  function handleKitchenPrinterChange(value: string) {
    setKitchenPrinterName(value)
    if (value) localStorage.setItem(KITCHEN_PRINTERS_KEY, value)
    else localStorage.removeItem(KITCHEN_PRINTERS_KEY)
  }

  function handleKitchenPaperChange(size: string) {
    setKitchenPaperSize(size)
    localStorage.setItem(KITCHEN_PAPER_KEY, size)
  }

  function handlePaperChange(size: string) {
    setPaperSize(size)
    localStorage.setItem(PAPER_KEY, size)
  }

  function handleLangChange(lang: string) {
    setLanguage(lang)
    localStorage.setItem(LANG_KEY, lang)
  }

  async function handleLogoChange(file: File | null) {
    if (!file) return
    setLogoError('')
    try {
      const resized = await resizeReceiptLogo(file)
      setReceiptLogo(resized)
      setLogo(resized)
    } catch (e: any) {
      setLogoError(e?.message || 'Не удалось загрузить изображение')
    }
  }

  function handleLogoReset() {
    resetReceiptLogo()
    setLogo(getReceiptLogo())
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
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>Данные организации</h3>
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
            <div className="admin-settings-divider" />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Название организации</div>
            <input className="modal-input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Например: OOO «Soliq Servis»" />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>СТИР (ИНН)</div>
            <input className="modal-input" value={orgStir} onChange={e => setOrgStir(e.target.value)} placeholder="Например: 200200200" />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Адрес</div>
            <input className="modal-input" value={orgAddress} onChange={e => setOrgAddress(e.target.value)} placeholder="Например: г. Ташкент, ул. Мукимий, 166" />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Телефон</div>
            <input className="modal-input" value={orgPhone} onChange={e => setOrgPhone(e.target.value)} placeholder="Например: +998 90 123 45 67" />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Прикрепленный сотрудник</div>
            <input className="modal-input" value={orgEmployee} onChange={e => setOrgEmployee(e.target.value)} placeholder="ФИО сотрудника" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <button onClick={handleOrgSave} style={{ padding: '10px 28px', border: '1px solid #2563eb', borderRadius: 8, background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Сохранить
              </button>
              {orgSaved && <span style={{ color: '#16a34a', fontSize: 13 }}>Сохранено</span>}
              <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 'auto' }}>Данные вводятся вручную и отображаются в чеке</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
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
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Настройка принтера для кухни</div>
              <div className="admin-settings-printer-block">
                <div className="admin-settings-printer-group">
                  <label>Принтер для кухни</label>
                  <select className="admin-settings-printer-select" value={kitchenPrinterName} onChange={e => handleKitchenPrinterChange(e.target.value)}>
                    <option value="">— Выберите принтер —</option>
                    {printers.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="admin-settings-printer-group">
                  <label>Формат бумаги</label>
                  <select className="admin-settings-printer-select" value={kitchenPaperSize} onChange={e => handleKitchenPaperChange(e.target.value)}>
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
            <div className="admin-settings-divider" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Логотип в чеке</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 116, height: 116, border: '1px solid #e2e8f0', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                  <img src={logo} alt="Логотип" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
                {logoError && <div style={{ color: '#ef4444', fontSize: 13 }}>{logoError}</div>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => { handleLogoChange(e.target.files?.[0] || null); e.target.value = '' }}
                  />
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    style={{ padding: '10px 26px', border: '1px solid #2563eb', borderRadius: 8, background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Изменить
                  </button>
                  <button
                    onClick={handleLogoReset}
                    style={{ padding: '10px 26px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Сбросить
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Логотип будет автоматически приведён к стандартному размеру (512x512), как у стандартного логотипа в чеке</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.12)', display: 'flex', gap: 32, justifyContent: 'center' }}>
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