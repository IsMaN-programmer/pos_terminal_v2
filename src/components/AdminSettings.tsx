import { useState, useEffect, useRef } from 'react'
import { dataStore } from '../services/dataStore'
import { getConnectedPrinters } from '../utils/printService'
import { getCompanyTin, getCompanyName, getCompanyAddress, getCompanyPhone, getCompanyEmployee, saveCompanyData, isCompanyApiSynced } from '../utils/companyInfo'
import { useUpdater } from '../updater'
import { getReceiptLogo, setReceiptLogo, resetReceiptLogo, resizeReceiptLogo } from '../utils/receiptLogo'
import { setLang, useT, type Lang } from '../i18n'
import NetworkSetup from './NetworkSetup'
import BluetoothPrinterSelect from './BluetoothPrinterSelect'
import { isNativeMobile } from '../services/capacitor'
import { useNetworkStore } from '../services/networkSocket'
import { saveNetworkPrinters, getNetworkStatus } from '../services/network'

const PRINTERS_KEY = 'pos_v2_printer_name'
const KITCHEN_PRINTERS_KEY = 'pos_v2_kitchen_printer_name'
const WAITER_PRINTERS_KEY = 'pos_v2_waiter_printer_name'
const PAPER_KEY = 'pos_v2_paper_size'
const KITCHEN_PAPER_KEY = 'pos_v2_kitchen_paper_size'
const LANG_KEY = 'pos_v2_language'
const BUTTONS_KEY = 'pos_v2_action_buttons'
const DEFAULT_BUTTONS: string[] = ['Отправить шашлычную', 'Отправить сомсусечную']

function loadActionButtons(): string[] {
  try {
    const raw = dataStore.getItem(BUTTONS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return [...DEFAULT_BUTTONS]
}

function saveActionButtons(list: string[]) {
  dataStore.setItem(BUTTONS_KEY, JSON.stringify(list))
}

interface PrinterRow {
  terminal: string
  printer: string
}

interface AdminSettingsProps {
  onLogout: () => void
  onChangeRole: () => void
  onDataDeleted: () => void
}

export default function AdminSettings({ onLogout, onChangeRole, onDataDeleted }: AdminSettingsProps) {
  const [deleteModal, setDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [orgName, setOrgName] = useState(getCompanyName())
  const [orgStir, setOrgStir] = useState(getCompanyTin())
  const [orgAddress, setOrgAddress] = useState(getCompanyAddress())
  const [orgPhone, setOrgPhone] = useState(getCompanyPhone())
  const [orgEmployee, setOrgEmployee] = useState(getCompanyEmployee())
  const [orgSaved, setOrgSaved] = useState(false)
  const [orgApiLocked] = useState(isCompanyApiSynced)

  const [printerTargets, setPrinterTargets] = useState<{ receipt: PrinterRow; kitchen: PrinterRow; waiter: PrinterRow }>(() => ({
    receipt: { terminal: '', printer: dataStore.getItem(PRINTERS_KEY) || '' },
    kitchen: { terminal: '', printer: dataStore.getItem(KITCHEN_PRINTERS_KEY) || '' },
    waiter: { terminal: '', printer: dataStore.getItem(WAITER_PRINTERS_KEY) || '' },
  }))
  const [kitchenPaperSize, setKitchenPaperSize] = useState(dataStore.getItem(KITCHEN_PAPER_KEY) || '58')
  const [paperSize, setPaperSize] = useState(dataStore.getItem(PAPER_KEY) || '58')
  const [language, setLanguage] = useState<Lang>(() => {
    const v = dataStore.getItem(LANG_KEY)
    return v === 'uz' ? 'uz' : v === 'en' ? 'en' : 'ru'
  })
  const t = useT()
  const [logo, setLogo] = useState(getReceiptLogo())
  const [logoError, setLogoError] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [printers, setPrinters] = useState<string[]>(() => {
    const saved = dataStore.getItem(PRINTERS_KEY)
    return saved ? [saved] : []
  })
  const { state: updaterState } = useUpdater()
  const appVersion = updaterState.currentVersion || '—'
  const net = useNetworkStore()
  const isSlave = net.role === 'slave'
  // Capacitor APK: standalone terminal, printers attach over Bluetooth SPP.
  const nativeMobile = isNativeMobile()

  const [actionButtons, setActionButtons] = useState<string[]>(loadActionButtons)
  const [editBtnIdx, setEditBtnIdx] = useState<number | null>(null)
  const [editBtnValue, setEditBtnValue] = useState('')
  const [newBtnInput, setNewBtnInput] = useState('')

  const [serverLoaded, setServerLoaded] = useState(false)

  useEffect(() => {
    if (!serverLoaded || isSlave) return
    saveNetworkPrinters(printerTargets.receipt, printerTargets.kitchen, printerTargets.waiter)
  }, [printerTargets, serverLoaded, isSlave])

  useEffect(() => {
    if (!net.ready || isSlave) return
    getNetworkStatus().then(s => {
      if (s?.printers) {
        const load = (key: 'receipt' | 'kitchen' | 'waiter', fallbackKey: string): PrinterRow => {
          const p = s.printers[key]
          const fallback = dataStore.getItem(fallbackKey) || ''
          if (p && (p.terminal || p.printer)) {
            const known = net.terminals.some(t => t.id === p.terminal)
            const terminal = p.terminal && p.terminal !== net.terminalName && known ? p.terminal : ''
            return { terminal, printer: p.printer || '' }
          }
          return { terminal: '', printer: fallback }
        }
        setPrinterTargets({
          receipt: load('receipt', PRINTERS_KEY),
          kitchen: load('kitchen', KITCHEN_PRINTERS_KEY),
          waiter: load('waiter', WAITER_PRINTERS_KEY),
        })
        const receipt = load('receipt', PRINTERS_KEY)
        const kitchen = load('kitchen', KITCHEN_PRINTERS_KEY)
        const waiter = load('waiter', WAITER_PRINTERS_KEY)
        setPrinterTargets({ receipt, kitchen, waiter })
        if (receipt.printer) dataStore.setItem(PRINTERS_KEY, receipt.printer); else dataStore.removeItem(PRINTERS_KEY)
        if (kitchen.printer) dataStore.setItem(KITCHEN_PRINTERS_KEY, kitchen.printer); else dataStore.removeItem(KITCHEN_PRINTERS_KEY)
        if (waiter.printer) dataStore.setItem(WAITER_PRINTERS_KEY, waiter.printer); else dataStore.removeItem(WAITER_PRINTERS_KEY)
      }
      setServerLoaded(true)
    })
  }, [net.ready, isSlave, net.terminalName])

  useEffect(() => {
    getConnectedPrinters().then(list => {
      const saved = dataStore.getItem(PRINTERS_KEY)
      setPrinters(saved && !list.includes(saved) ? [saved, ...list] : list)
    })
  }, [])

  function printerOptionsFor(target: PrinterRow): string[] {
    if (!target.terminal || target.terminal === net.terminalName) return printers
    const term = net.terminals.find(t => t.id === target.terminal)
    return term?.printers?.length ? term.printers : printers
  }

  function handlePrinterTargetChange(key: 'receipt' | 'kitchen' | 'waiter', patch: Partial<PrinterRow>) {
    setPrinterTargets(prev => {
      const next = { ...prev[key], ...patch }
      if (patch.terminal !== undefined && patch.terminal !== prev[key].terminal) {
        next.printer = printerOptionsFor(next).includes(prev[key].printer) ? prev[key].printer : ''
      }
      return { ...prev, [key]: next }
    })
  }

  function handlePrinterChange(key: 'receipt' | 'kitchen' | 'waiter', value: string) {
    handlePrinterTargetChange(key, { printer: value })
    const dataKey = key === 'receipt' ? PRINTERS_KEY : key === 'kitchen' ? KITCHEN_PRINTERS_KEY : WAITER_PRINTERS_KEY
    if (value) dataStore.setItem(dataKey, value)
    else dataStore.removeItem(dataKey)
  }

  function handleKitchenPaperChange(size: string) {
    setKitchenPaperSize(size)
    dataStore.setItem(KITCHEN_PAPER_KEY, size)
  }

  function handlePaperChange(size: string) {
    setPaperSize(size)
    dataStore.setItem(PAPER_KEY, size)
  }

  function handleLangChange(lang: string) {
    setLanguage(lang as Lang)
    setLang(lang as Lang)
  }

  function handleAddButton() {
    const name = newBtnInput.trim()
    if (!name) return
    saveActionButtons([...actionButtons, name])
    setActionButtons([...actionButtons, name])
    setNewBtnInput('')
  }

  function handleDeleteButton(idx: number) {
    const next = actionButtons.filter((_, i) => i !== idx)
    saveActionButtons(next)
    setActionButtons(next)
  }

  function handleSaveButton(idx: number) {
    const name = editBtnValue.trim()
    if (!name) return
    const next = actionButtons.map((b, i) => i === idx ? name : b)
    saveActionButtons(next)
    setActionButtons(next)
    setEditBtnIdx(null)
  }

  async function handleLogoChange(file: File | null) {
    if (!file) return
    setLogoError('')
    try {
      const resized = await resizeReceiptLogo(file)
      setReceiptLogo(resized)
      setLogo(resized)
    } catch (e: any) {
      setLogoError(e?.message || t('Не удалось загрузить изображение', 'Rasmni yuklab bo\'lmadi', 'Failed to load image'))
    }
  }

  function handleLogoReset() {
    resetReceiptLogo()
    setLogo(getReceiptLogo())
  }

  function handleOrgSave() {
    const stir = orgStir.trim()
    if (!orgApiLocked && !/^\d{9}$/.test(stir)) {
      alert(t('ИНН должен содержать ровно 9 цифр', 'INN aniq 9 raqamdan iborat bo\'lishi kerak', 'TIN must contain exactly 9 digits'))
      return
    }
    saveCompanyData({ name: orgName, stir, address: orgAddress, phone: orgPhone, employee: orgEmployee })
    setOrgSaved(true)
    setTimeout(() => setOrgSaved(false), 2000)
  }

  function handleDelete() {
    if (!deletePassword) {
      setDeleteError(t('Введите пароль', 'Parolni kiriting', 'Enter password'))
      return
    }
    if (deletePassword !== (dataStore.getItem('pos_v2_login_password') || '')) {
      setDeleteError(t('Неверный пароль', 'Parol noto\'g\'ri', 'Incorrect password'))
      return
    }
    setDeleteError('')
    setDeleting(true)
    setTimeout(() => onDataDeleted(), 2500)
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">{t('Настройки', 'Sozlamalar', 'Settings')}</h1>
      </div>
      <div className="admin-settings-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <NetworkSetup />

          <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>{t('Смена языка', 'Tilni o\'zgartirish', 'Change language')}</div>
                <div className="admin-settings-lang-row">
                  <button className={`admin-settings-lang-btn${language === 'ru' ? ' active' : ''}`} onClick={() => handleLangChange('ru')}>Русский</button>
                  <button className={`admin-settings-lang-btn${language === 'uz' ? ' active' : ''}`} onClick={() => handleLangChange('uz')}>O'zbekcha</button>
                  <button className={`admin-settings-lang-btn${language === 'en' ? ' active' : ''}`} onClick={() => handleLangChange('en')}>English</button>
                </div>
              </div>
              <div className="admin-settings-divider" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button onClick={onChangeRole} style={{ padding: '13px 44px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%' }}>{t('Сменить роль', 'Rolni almashtirish', 'Change role')}</button>
                <button onClick={onLogout} style={{ padding: '13px 44px', border: '1px solid #ef4444', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%' }}>{t('Выйти с аккаунта', 'Akkauntdan chiqish', 'Log out')}</button>
                <button onClick={() => { setDeletePassword(''); setDeleteError(''); setDeleteModal(true) }} style={{ padding: '13px 34px', border: '1px solid #ef4444', borderRadius: 8, background: '#fff', color: '#dc2626', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' }}>{t('Удалить данные', 'Ma\'lumotlarni o\'chirish', 'Delete data')}</button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>{t('Настройка печати', 'Chop etish sozlamalari', 'Print settings')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {isSlave && (
              <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 13, color: '#92400e' }}>
                {t('Этот терминал подключен к кассе. Печать (чеки, кухня) настраивается на главном компьютере в разделе «Сеть терминалов».', 'Ushbu terminal kassaga ulangan. Chop etish (cheklar, oshxona) «Terminallar tarmog\'i» bo\'limida bosh kompyuterda sozlanadi.', 'This terminal is connected to the cash register. Printing (receipts, kitchen) is configured on the main computer in the "Terminal network" section.')}
              </div>
            )}
            {!isSlave && <><div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>{t('Настройка принтера кассира', 'Kassir printerni sozlash', 'Cashier printer settings')}</div>
              <div className="admin-settings-printer-block">
                {nativeMobile ? (
                  <BluetoothPrinterSelect value={printerTargets.receipt.printer} onChange={v => handlePrinterChange('receipt', v)} paperWidth={Number(paperSize) || 58} />
                ) : (<>
                <div className="admin-settings-printer-group">
                  <label>{t('Терминал', 'Terminal', 'Terminal')}</label>
                  <select className="admin-settings-printer-select" value={printerTargets.receipt.terminal} onChange={e => handlePrinterTargetChange('receipt', { terminal: e.target.value })}>
                    <option value="">{t('Эта касса', 'Shu kassa', 'This cash register')}</option>
                    {net.terminals.filter(t => t.connected && t.name !== net.terminalName).map(t => (
                      <option key={t.id} value={t.id}>{t.name}{t.ip ? ` (${t.ip})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-settings-printer-group">
                  <label>{t('Принтер', 'Printer', 'Printer')}</label>
                  <select className="admin-settings-printer-select" value={printerTargets.receipt.printer} onChange={e => handlePrinterChange('receipt', e.target.value)}>
                    <option value="">— {t('Выберите принтер', 'Printerni tanlang', 'Select printer')} —</option>
                    {printerOptionsFor(printerTargets.receipt).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                </>)}
                <div className="admin-settings-printer-group">
                  <label>{t('Формат бумаги', 'Qog\'oz formati', 'Paper format')}</label>
                  <select className="admin-settings-printer-select" value={paperSize} onChange={e => handlePaperChange(e.target.value)}>
                    <option value="58">58 мм</option>
                    <option value="80">80 мм</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="admin-settings-divider" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>{t('Настройка принтера для кухни', 'Oshxona printerni sozlash', 'Kitchen printer settings')}</div>
              <div className="admin-settings-printer-block">
                {nativeMobile ? (
                  <BluetoothPrinterSelect value={printerTargets.kitchen.printer} onChange={v => handlePrinterChange('kitchen', v)} paperWidth={Number(kitchenPaperSize) || 58} />
                ) : (<>
                <div className="admin-settings-printer-group">
                  <label>{t('Терминал', 'Terminal', 'Terminal')}</label>
                  <select className="admin-settings-printer-select" value={printerTargets.kitchen.terminal} onChange={e => handlePrinterTargetChange('kitchen', { terminal: e.target.value })}>
                    <option value="">{t('Эта касса', 'Shu kassa', 'This cash register')}</option>
                    {net.terminals.filter(t => t.connected && t.name !== net.terminalName).map(t => (
                      <option key={t.id} value={t.id}>{t.name}{t.ip ? ` (${t.ip})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-settings-printer-group">
                  <label>{t('Принтер', 'Printer', 'Printer')}</label>
                  <select className="admin-settings-printer-select" value={printerTargets.kitchen.printer} onChange={e => handlePrinterChange('kitchen', e.target.value)}>
                    <option value="">— {t('Выберите принтер', 'Printerni tanlang', 'Select printer')} —</option>
                    {printerOptionsFor(printerTargets.kitchen).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                </>)}
                <div className="admin-settings-printer-group">
                  <label>{t('Формат бумаги', 'Qog\'oz formati', 'Paper format')}</label>
                  <select className="admin-settings-printer-select" value={kitchenPaperSize} onChange={e => handleKitchenPaperChange(e.target.value)}>
                    <option value="58">58 мм</option>
                    <option value="80">80 мм</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="admin-settings-divider" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>{t('Настройка принтера для официанта', 'Ofitsiant printerni sozlash', 'Waiter printer settings')}</div>
              <div className="admin-settings-printer-block">
                {nativeMobile ? (
                  <BluetoothPrinterSelect value={printerTargets.waiter.printer} onChange={v => handlePrinterChange('waiter', v)} paperWidth={Number(paperSize) || 58} />
                ) : (<>
                <div className="admin-settings-printer-group">
                  <label>{t('Терминал', 'Terminal', 'Terminal')}</label>
                  <select className="admin-settings-printer-select" value={printerTargets.waiter.terminal} onChange={e => handlePrinterTargetChange('waiter', { terminal: e.target.value })}>
                    <option value="">{t('Эта касса', 'Shu kassa', 'This cash register')}</option>
                    {net.terminals.filter(t => t.connected && t.name !== net.terminalName).map(t => (
                      <option key={t.id} value={t.id}>{t.name}{t.ip ? ` (${t.ip})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-settings-printer-group">
                  <label>{t('Принтер', 'Printer', 'Printer')}</label>
                  <select className="admin-settings-printer-select" value={printerTargets.waiter.printer} onChange={e => handlePrinterChange('waiter', e.target.value)}>
                    <option value="">— {t('Выберите принтер', 'Printerni tanlang', 'Select printer')} —</option>
                    {printerOptionsFor(printerTargets.waiter).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                </>)}
                <div className="admin-settings-printer-group">
                  <label>{t('Формат бумаги', 'Qog\'oz formati', 'Paper format')}</label>
                  <select className="admin-settings-printer-select" value={paperSize} onChange={e => handlePaperChange(e.target.value)}>
                    <option value="58">58 мм</option>
                    <option value="80">80 мм</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="admin-settings-divider" /></>}
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>{t('Логотип в чеке', 'Chekdagi logotip', 'Logo on receipt')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 129, height: 129, border: '1px solid #e2e8f0', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
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
                    {t('Изменить', 'O\'zgartirish', 'Edit')}
                  </button>
                  <button
                    onClick={handleLogoReset}
                    style={{ padding: '10px 26px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {t('Сбросить', 'Qaytarish', 'Reset')}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{t('Логотип будет автоматически приведён к стандартному размеру (512x512)', 'Logotip standart o\'lchamga (512x512) avtomatik keltiriladi', 'Logo will be automatically resized to standard size (512x512)')}</div>
              </div>
            </div>
            <div className="admin-settings-divider" />
            {false && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>{t('Кнопки действий', 'Amallar tugmalari', 'Action buttons')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {actionButtons.map((btn, idx) => (
                  <div key={idx} className="am-option-row">
                    {editBtnIdx === idx ? (
                      <div className="am-edit-inline">
                        <input className="am-input" value={editBtnValue} onChange={e => setEditBtnValue(e.target.value)} placeholder={t('Название кнопки...', 'Tugma nomi...', 'Button name...')} />
                        <button className="am-btn am-btn-sm am-btn-primary" onClick={() => handleSaveButton(idx)}>✓</button>
                        <button className="am-btn am-btn-sm" onClick={() => setEditBtnIdx(null)}>✕</button>
                      </div>
                    ) : (
                      <>
                        <span className="am-option-name">{btn}</span>
                        <div className="am-option-actions">
                          <button className="am-icon-btn" title={t('Редактировать', 'Tahrirlash', 'Edit')} onClick={() => { setEditBtnIdx(idx); setEditBtnValue(btn) }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                          <button className="am-icon-btn danger" title={t('Удалить', 'O\'chirish', 'Delete')} onClick={() => handleDeleteButton(idx)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="am-divider" />
              <div className="am-add-group-row">
                <input className="am-input" style={{ flex: 1 }} value={newBtnInput} onChange={e => setNewBtnInput(e.target.value)} placeholder={t('Название новой кнопки...', 'Yangi tugma nomi...', 'New button name...')} />
                <button className="am-btn am-btn-primary" onClick={handleAddButton}>{t('Добавить кнопку', 'Tugma qo\'shish', 'Add button')}</button>
              </div>
            </div>
            )}
          </div>
        </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 0 24px' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>{t('Данные организации', 'Tashkilot ma\'lumotlari', 'Organization details')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="admin-settings-row">
              <span className="admin-settings-label">{t('Логин', 'Login', 'Login')}</span>
              <span className="admin-settings-value">{dataStore.getItem('pos_v2_login_username') || '—'}</span>
            </div>
            <div className="admin-settings-row">
              <span className="admin-settings-label">{t('Пароль', 'Parol', 'Password')}</span>
              <span className="admin-settings-value" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', maxWidth: '60%' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{showPassword ? dataStore.getItem('pos_v2_login_password') || '' : '••••••••'}</span>
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
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{t('Название организации', 'Tashkilot nomi', 'Organization name')}</div>
            <input className="modal-input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="OOO «Soliq Servis»" disabled={orgApiLocked} />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>СТИР ({t('ИНН', 'INN', 'TIN')})</div>
            <input className="modal-input" value={orgStir} onChange={e => setOrgStir(e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="200200200" inputMode="numeric" maxLength={9} disabled={orgApiLocked} />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{t('Адрес', 'Manzil', 'Address')}</div>
            <input className="modal-input" value={orgAddress} onChange={e => setOrgAddress(e.target.value)} placeholder="Toshkent sh., Muqimiy ko'ch., 166" disabled={orgApiLocked} />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{t('Телефон', 'Telefon', 'Phone')}</div>
            <input className="modal-input" value={orgPhone} onChange={e => setOrgPhone(e.target.value)} placeholder="+998 90 123 45 67" />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{t('Прикрепленный сотрудник', 'Biriktirilgan xodim', 'Assigned employee')}</div>
            <input className="modal-input" value={orgEmployee} onChange={e => setOrgEmployee(e.target.value)} placeholder={t('ФИО сотрудника', 'Xodim F.I.Sh.', 'Employee full name')} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
              <button onClick={handleOrgSave} style={{ padding: '10px 28px', border: '1px solid #2563eb', borderRadius: 8, background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {t('Сохранить', 'Saqlash', 'Save')}
              </button>
              {orgSaved && <span style={{ color: '#16a34a', fontSize: 13 }}>{t('Сохранено', 'Saqlandi', 'Saved')}</span>}
              {orgApiLocked ? (
                <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 'auto' }}>{t('Название, ИНН и адрес загружены из кабинета и не редактируются', 'Nomi, INN va manzil kabinetdan yuklangan, tahrirlanmaydi', 'Name, TIN and address are loaded from back office and cannot be edited')}</span>
              ) : (
                <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 'auto' }}>{t('Данные загружаются из кабинета при входе, можно редактировать вручную', 'Ma\'lumotlar kirishda kabinetdan yuklanadi, qo\'lda tahrirlash mumkin', 'Data is loaded from the back office on login, you can edit it manually')}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '8px 0 4px', color: '#94a3b8', fontSize: 13 }}>
        {t('Версия приложения', 'Ilova versiyasi', 'App version')}: v{appVersion}
      </div>
      {deleteModal && (
        <div className="modal-overlay" onClick={() => { if (!deleting) { setDeleteModal(false); setDeletePassword(''); setDeleteError('') } }}>
          <div className="modal-content" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            {deleting ? (
              <>
                <div className="modal-title">{t('Удаление данных', 'Ma\'lumotlarni o\'chirish', 'Deleting data')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '12px 0 24px' }}>
                  <div className="print-loading-spinner" style={{ width: 56, height: 56 }} />
                  <div style={{ fontSize: 14, color: '#64748b' }}>{t('Удаление всех данных... Пожалуйста, подождите', 'Barcha ma\'lumotlar o\'chirilmoqda... Iltimos, kuting', 'Deleting all data... Please wait')}</div>
                </div>
              </>
            ) : (
              <>
                <div className="modal-title">{t('Удалить данные', 'Ma\'lumotlarni o\'chirish', 'Delete data')}</div>
                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
                  {t('Будет удалена вся информация: категории, чеки, роли, товары и другие данные. Введите пароль от логина для подтверждения.', 'Barcha ma\'lumotlar o\'chiriladi: kategoriyalar, cheklar, rollar, tovarlar va boshqa ma\'lumotlar. Tasdiqlash uchun login parolini kiriting.', 'All data will be deleted: categories, receipts, roles, products and other data. Enter login password to confirm.')}
                </div>
                <input
                  type="password"
                  className="modal-input"
                  placeholder={t('Пароль от логина', 'Login paroli', 'Login password')}
                  value={deletePassword}
                  onChange={e => { setDeletePassword(e.target.value); setDeleteError('') }}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleDelete() }}
                />
                {deleteError && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{deleteError}</div>}
                <div className="modal-actions">
                  <button className="modal-btn cancel" onClick={() => { setDeleteModal(false); setDeletePassword(''); setDeleteError('') }}>{t('Отменить', 'Bekor qilish', 'Cancel')}</button>
                  <button className="modal-btn" style={{ background: '#ef4444', color: '#fff', border: 'none' }} onClick={handleDelete}>{t('Удалить', 'O\'chirish', 'Delete')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}