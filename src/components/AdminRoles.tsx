import { useState, useEffect } from 'react'
import { dataStore } from '../services/dataStore'
import type { StaffRecord } from '../data/types'
import { useT } from '../i18n'

const STORAGE_KEY = 'pos_v2_staff'

function loadStaff(): StaffRecord[] {
  try {
    const raw = dataStore.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    const MOCK_CASHIER = new Set(['Кассир', 'Kassir'])
    const MOCK_WAITER = new Set(['Официант', 'Ofitsiant'])
    return (Array.isArray(list) ? list : [])
      .filter((s: any) =>
        !(s.role === 'cashier' && s.pin === '0000' && MOCK_CASHIER.has(s.name)) &&
        !(s.role === 'waiter' && s.pin === '1111' && MOCK_WAITER.has(s.name))
      )
      .map((s: any) => ({ id: s.id, name: s.name, pin: s.pin, role: s.role, phone: s.phone || '' }))
  } catch { return [] }
}

function saveStaff(list: StaffRecord[]) {
  dataStore.setItem(STORAGE_KEY, JSON.stringify(list))
}

const ROLES = ['Все', 'waiter', 'cashier', 'admin']

export default function AdminRoles() {
  const t = useT()
  const roleLabels: Record<string, string> = { waiter: t('Официант', 'Ofitsiant', 'Waiter'), cashier: t('Кассир', 'Kassir', 'Cashier'), admin: t('Администратор', 'Administrator', 'Administrator') }
  const [staff, setStaff] = useState<StaffRecord[]>(loadStaff)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('Все')
  const [modal, setModal] = useState<{ item?: StaffRecord } | null>(null)
  const [form, setForm] = useState({ name: '', pin: '', role: 'waiter', phone: '' })
  const [pinError, setPinError] = useState('')

  useEffect(() => { saveStaff(staff) }, [staff])

  const filtered = staff.filter(s => {
    if (roleFilter !== 'Все' && s.role !== roleFilter) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function openAdd() {
    setForm({ name: '', pin: '', role: 'waiter', phone: '' })
    setPinError('')
    setModal({})
  }

  function openEdit(s: StaffRecord) {
    setForm({ name: s.name, pin: s.pin, role: s.role, phone: s.phone })
    setPinError('')
    setModal({ item: s })
  }

  function handleSave() {
    if (!form.name.trim() || !form.pin.trim()) return
    const pin = form.pin.trim()
    const editId = modal?.item?.id
    const taken = staff.find(s => s.id !== editId && s.pin === pin)
    if (taken) {
      setPinError(`${t('Пин-код уже занят', 'PIN-kod band', 'PIN already taken')}: ${taken.name} (${roleLabels[taken.role] || taken.role})`)
      return
    }
    setPinError('')
    if (modal?.item) {
      const keepRole = modal.item.role === 'admin' ? 'admin' : form.role
      setStaff(prev => prev.map(s => s.id === modal.item!.id ? { ...s, name: form.name, pin, role: keepRole, phone: form.phone } : s))
    } else {
      const id = Math.max(...staff.map(s => s.id), 0) + 1
      setStaff(prev => [...prev, { id, name: form.name, pin, role: form.role, phone: form.phone }])
    }
    setModal(null)
  }

  function handleDelete(id: number) {
    setStaff(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="screen admin-roles">
      <div className="screen-header">
        <h1 className="screen-title">{t('Управление ролей', 'Rollar boshqaruvi', 'Role management')}</h1>
      </div>

      <div className="ar-toolbar">
        <div className="ar-toolbar-left">
          <div className="toolbar-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" placeholder={t('Поиск по имени...', 'Ism bo\'yicha qidirish...', 'Search by name...')} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="toolbar-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ minWidth: 160 }}>
            {ROLES.map(r => <option key={r} value={r}>{r === 'Все' ? t('Все', 'Barchasi', 'All') : roleLabels[r]}</option>)}
          </select>
        </div>
        <button className="ar-add-btn" onClick={openAdd}>+ {t('Добавить роль', 'Rol qo\'shish', 'Add role')}</button>
      </div>

      <div className="ar-table-wrap">
        <table className="ar-table">
          <thead>
            <tr>
              <th>{t('Имя', 'Ism', 'Name')}</th>
              <th>{t('Пин код', 'PIN kod', 'PIN code')}</th>
              <th>{t('Роль', 'Rol', 'Role')}</th>
              <th>{t('Телефон', 'Telefon', 'Phone')}</th>
              <th>{t('Настройки', 'Sozlamalar', 'Settings')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td className="ar-table-name">{s.name}</td>
                <td className="ar-table-pin">{s.pin}</td>
                <td><span className={`ar-role-badge ar-role-${s.role}`}>{roleLabels[s.role] || s.role}</span></td>
                <td className="ar-table-phone">{s.phone || '—'}</td>
                <td>
                  <div className="ar-table-actions">
                    <button className="ab-action-btn" title={t('Изменить', 'O\'zgartirish', 'Edit')} onClick={() => openEdit(s)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    {s.role !== 'admin' && (
                      <button className="ab-action-btn ab-action-delete" title={t('Удалить', 'O\'chirish', 'Delete')} onClick={() => handleDelete(s.id)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="ar-empty">{t('Сотрудники не найдены', 'Xodimlar topilmadi', 'No employees found')}</div>}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal.item ? t('Изменить роль', 'Rolni o\'zgartirish', 'Edit role') : t('Добавить роль', 'Rol qo\'shish', 'Add role')}</div>
            <div className="ar-form">
              <label className="ab-form-label">{t('Роль', 'Rol', 'Role')}</label>
              <select className="modal-input" value={form.role} disabled={modal.item?.role === 'admin'} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={{ cursor: 'pointer', width: '100%', minHeight: 51, flexShrink: 0 }}>
                <option value="waiter">{t('Официант', 'Ofitsiant', 'Waiter')}</option>
                <option value="cashier">{t('Кассир', 'Kassir', 'Cashier')}</option>
                {modal.item?.role === 'admin' && <option value="admin">{t('Администратор', 'Administrator', 'Administrator')}</option>}
              </select>
              <label className="ab-form-label">{t('Имя', 'Ism', 'Name')}</label>
              <input className="modal-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('Имя сотрудника', 'Xodim ismi', 'Employee name')} />
              <label className="ab-form-label">{t('Пароль (PIN-код)', 'Parol (PIN-kod)', 'Password (PIN)')}</label>
              <input className="modal-input" value={form.pin} onChange={e => { setPinError(''); setForm(f => ({ ...f, pin: e.target.value.slice(0, 4) })) }} placeholder={t('4-значный PIN', '4 xonali PIN', '4-digit PIN')} maxLength={4} type="password" inputMode="numeric" />
              <label className="ab-form-label">{t('Телефон', 'Telefon', 'Phone')}</label>
              <input className="modal-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder={t('Номер телефона', 'Telefon raqami', 'Phone number')} />
              {pinError && <div className="promo-error">{pinError}</div>}
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setModal(null)}>{t('Отмена', 'Bekor qilish', 'Cancel')}</button>
              <button className="modal-btn save" onClick={handleSave}>{t('Сохранить', 'Saqlash', 'Save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
