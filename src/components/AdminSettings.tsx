import { useState, useEffect, useRef } from 'react'
import { getConnectedPrinters } from '../utils/printService'
import { getCompanyTin, getCompanyName, getCompanyAddress, getCompanyPhone, getCompanyEmployee, saveCompanyData } from '../utils/companyInfo'
import { useUpdater } from '../updater'
import { getReceiptLogo, setReceiptLogo, resetReceiptLogo, resizeReceiptLogo } from '../utils/receiptLogo'
import { setLang, useT, type Lang } from '../i18n'

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
  const [language, setLanguage] = useState<Lang>(() => (localStorage.getItem(LANG_KEY) === 'uz' ? 'uz' : 'ru'))
  const t = useT()
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
    setLanguage(lang as Lang)
    setLang(lang as Lang)
  }

  async function handleLogoChange(file: File | null) {
    if (!file) return
    setLogoError('')
    try {
      const resized = await resizeReceiptLogo(file)
      setReceiptLogo(resized)
      setLogo(resized)
    } catch (e: any) {
      setLogoError(e?.message || t('Не удалось загрузить изображение', 'Rasmni yuklab bo\'lmadi'))
    }
  }

  function handleLogoReset() {
    resetReceiptLogo()
    setLogo(getReceiptLogo())
  }

  function handleDelete() {
    if (!deletePassword) {
      setDeleteError(t('Введите пароль', 'Parolni kiriting'))
      return
    }
    if (deletePassword !== password) {
      setDeleteError(t('Неверный пароль', 'Parol noto\'g\'ri'))
      return
    }
    setDeleteError('')
    setDeleting(true)
    setTimeout(() => onDataDeleted(), 2500)
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">{t('Настройки', 'Sozlamalar')}</h1>
      </div>
      <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, padding: '20px 0' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>{t('Данные организации', 'Tashkilot ma\'lumotlari')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="admin-settings-row"><span className="admin-settings-label">{t('Логин', 'Login')}</span><span className="admin-settings-value">{username || '—'}</span></div>
            <div className="admin-settings-row">
              <span className="admin-settings-label">{t('Пароль', 'Parol')}</span>
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
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{t('Название организации', 'Tashkilot nomi')}</div>
            <input className="modal-input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="OOO «Soliq Servis»" />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>СТИР ({t('ИНН', 'INN')})</div>
            <input className="modal-input" value={orgStir} onChange={e => setOrgStir(e.target.value)} placeholder="200200200" />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{t('Адрес', 'Manzil')}</div>
            <input className="modal-input" value={orgAddress} onChange={e => setOrgAddress(e.target.value)} placeholder="Toshkent sh., Muqimiy ko'ch., 166" />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{t('Телефон', 'Telefon')}</div>
            <input className="modal-input" value={orgPhone} onChange={e => setOrgPhone(e.target.value)} placeholder="+998 90 123 45 67" />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{t('Прикрепленный сотрудник', 'Biriktirilgan xodim')}</div>
            <input className="modal-input" value={orgEmployee} onChange={e => setOrgEmployee(e.target.value)} placeholder={t('ФИО сотрудника', 'Xodim F.I.Sh.')} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <button onClick={handleOrgSave} style={{ padding: '10px 28px', border: '1px solid #2563eb', borderRadius: 8, background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {t('Сохранить', 'Saqlash')}
              </button>
              {orgSaved && <span style={{ color: '#16a34a', fontSize: 13 }}>{t('Сохранено', 'Saqlandi')}</span>}
              <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 'auto' }}>{t('Данные вводятся вручную и отображаются в чеке', 'Ma\'lumotlar qo\'lda kiritiladi va chekda ko\'rsatiladi')}</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>{t('Основные настройки', 'Asosiy sozlamalar')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>{t('Настройка принтера', 'Printerni sozlash')}</div>
              <div className="admin-settings-printer-block">
                <div className="admin-settings-printer-group">
                  <label>{t('Принтер', 'Printer')}</label>
                  <select className="admin-settings-printer-select" value={printerName} onChange={e => handlePrinterChange(e.target.value)}>
                    <option value="">— {t('Выберите принтер', 'Printerni tanlang')} —</option>
                    {printers.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="admin-settings-printer-group">
                  <label>{t('Формат бумаги', 'Qog\'oz formati')}</label>
                  <select className="admin-settings-printer-select" value={paperSize} onChange={e => handlePaperChange(e.target.value)}>
                    <option value="58">58 мм</option>
                    <option value="80">80 мм</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="admin-settings-divider" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>{t('Настройка принтера для кухни', 'Oshxona printerni sozlash')}</div>
              <div className="admin-settings-printer-block">
                <div className="admin-settings-printer-group">
                  <label>{t('Принтер для кухни', 'Oshxona printeri')}</label>
                  <select className="admin-settings-printer-select" value={kitchenPrinterName} onChange={e => handleKitchenPrinterChange(e.target.value)}>
                    <option value="">— {t('Выберите принтер', 'Printerni tanlang')} —</option>
                    {printers.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="admin-settings-printer-group">
                  <label>{t('Формат бумаги', 'Qog\'oz formati')}</label>
                  <select className="admin-settings-printer-select" value={kitchenPaperSize} onChange={e => handleKitchenPaperChange(e.target.value)}>
                    <option value="58">58 мм</option>
                    <option value="80">80 мм</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="admin-settings-divider" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>{t('Смена языка', 'Tilni o\'zgartirish')}</div>
              <div className="admin-settings-lang-row">
                <button className={`admin-settings-lang-btn${language === 'ru' ? ' active' : ''}`} onClick={() => handleLangChange('ru')}>Русский</button>
                <button className={`admin-settings-lang-btn${language === 'uz' ? ' active' : ''}`} onClick={() => handleLangChange('uz')}>O'zbekcha</button>
              </div>
            </div>
            <div className="admin-settings-divider" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>{t('Логотип в чеке', 'Chekdagi logotip')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 116, height: 116, border: '1px solid #e2e8f0', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                  <img src={logo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
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
                    {t('Изменить', 'O\'zgartirish')}
                  </button>
                  <button
                    onClick={handleLogoReset}
                    style={{ padding: '10px 26px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {t('Сбросить', 'Qaytarish')}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{t('Логотип будет автоматически приведён к стандартному размеру (512x512), как у стандартного логотипа в чеке', 'Logotip chekdagi standart logotip kabi standart o\'lchamga (512x512) avtomatik keltiriladi')}</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.12)', display: 'flex', gap: 32, justifyContent: 'center' }}>
          <button onClick={onLogout} style={{ padding: '14px 44px', border: '1px solid #ef4444', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{t('Выйти', 'Chiqish')}</button>
          <button onClick={onChangeRole} style={{ padding: '14px 44px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{t('Сменить роль', 'Rolni almashtirish')}</button>
          <button onClick={() => { setDeletePassword(''); setDeleteError(''); setDeleteModal(true) }} style={{ padding: '12px 34px', border: '1px solid #ef4444', borderRadius: 8, background: '#fff', color: '#dc2626', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{t('Удалить данные', 'Ma\'lumotlarni o\'chirish')}</button>
        </div>

        <div style={{ textAlign: 'center', padding: '8px 0 4px', color: '#94a3b8', fontSize: 13 }}>
          {t('Версия приложения', 'Ilova versiyasi')}: v{appVersion}
        </div>
      </div>
      {deleteModal && (
        <div className="modal-overlay" onClick={() => { if (!deleting) { setDeleteModal(false); setDeletePassword(''); setDeleteError('') } }}>
          <div className="modal-content" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            {deleting ? (
              <>
                <div className="modal-title">{t('Удаление данных', 'Ma\'lumotlarni o\'chirish')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '12px 0 24px' }}>
                  <div className="print-loading-spinner" style={{ width: 56, height: 56 }} />
                  <div style={{ fontSize: 14, color: '#64748b' }}>{t('Удаление всех данных... Пожалуйста, подождите', 'Barcha ma\'lumotlar o\'chirilmoqda... Iltimos, kuting')}</div>
                </div>
              </>
            ) : (
              <>
                <div className="modal-title">{t('Удалить данные', 'Ma\'lumotlarni o\'chirish')}</div>
                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
                  {t('Будет удалена вся информация: категории, чеки, роли, товары и другие данные. Введите пароль от логина для подтверждения.', 'Barcha ma\'lumotlar o\'chiriladi: kategoriyalar, cheklar, rollar, tovarlar va boshqa ma\'lumotlar. Tasdiqlash uchun login parolini kiriting.')}
                </div>
                <input
                  type="password"
                  className="modal-input"
                  placeholder={t('Пароль от логина', 'Login paroli')}
                  value={deletePassword}
                  onChange={e => { setDeletePassword(e.target.value); setDeleteError('') }}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleDelete() }}
                />
                {deleteError && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{deleteError}</div>}
                <div className="modal-actions">
                  <button className="modal-btn cancel" onClick={() => { setDeleteModal(false); setDeletePassword(''); setDeleteError('') }}>{t('Отменить', 'Bekor qilish')}</button>
                  <button className="modal-btn" style={{ background: '#ef4444', color: '#fff', border: 'none' }} onClick={handleDelete}>{t('Удалить', 'O\'chirish')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}