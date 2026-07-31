import { useState, useEffect } from 'react'
import type { StaffRecord } from '../data/types'

const STORAGE_KEY = 'pos_v2_staff'

function loadStaff(): StaffRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return list.map((s: any) => ({ id: s.id, name: s.name, pin: s.pin, role: s.role, phone: s.phone || '' }))
  } catch { return [] }
}

function saveStaff(list: StaffRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

const ROLES = ['Все', 'waiter', 'cashier', 'admin']
const ROLE_LABELS: Record<string, string> = { waiter: 'Официант', cashier: 'Кассир', admin: 'Администратор' }

export default function AdminRoles() {
  const [staff, setStaff] = useState<StaffRecord[]>(loadStaff)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('Все')
  const [modal, setModal] = useState<{ item?: StaffRecord } | null>(null)
  const [form, setForm] = useState({ name: '', pin: '', role: 'waiter', phone: '' })

  useEffect(() => { saveStaff(staff) }, [staff])

  const filtered = staff.filter(s => {
    if (roleFilter !== 'Все' && s.role !== roleFilter) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function openAdd() {
    setForm({ name: '', pin: '', role: 'waiter', phone: '' })
    setModal({})
  }

  function openEdit(s: StaffRecord) {
    setForm({ name: s.name, pin: s.pin, role: s.role, phone: s.phone })
    setModal({ item: s })
  }

  function handleSave() {
    if (!form.name.trim() || !form.pin.trim()) return
    if (modal?.item) {
      setStaff(prev => prev.map(s => s.id === modal.item!.id ? { ...s, name: form.name, pin: form.pin, role: form.role, phone: form.phone } : s))
    } else {
      const id = Math.max(...staff.map(s => s.id), 0) + 1
      setStaff(prev => [...prev, { id, name: form.name, pin: form.pin, role: form.role, phone: form.phone }])
    }
    setModal(null)
  }

  function handleDelete(id: number) {
    setStaff(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="screen admin-roles">
      <div className="screen-header">
        <h1 className="screen-title">Управление ролей</h1>
      </div>

      <div className="ar-toolbar">
        <div className="ar-toolbar-left">
          <div className="toolbar-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" placeholder="Поиск по имени..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="toolbar-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ minWidth: 160 }}>
            {ROLES.map(r => <option key={r} value={r}>{r === 'Все' ? 'Все' : ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <button className="ar-add-btn" onClick={openAdd}>+ Добавить роль</button>
      </div>

      <div className="ar-table-wrap">
        <table className="ar-table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Пин код</th>
              <th>Роль</th>
              <th>Телефон</th>
              <th>Настройки</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td className="ar-table-name">{s.name}</td>
                <td className="ar-table-pin">{s.pin}</td>
                <td><span className={`ar-role-badge ar-role-${s.role}`}>{ROLE_LABELS[s.role] || s.role}</span></td>
                <td className="ar-table-phone">{s.phone || '—'}</td>
                <td>
                  <div className="ar-table-actions">
                    <button className="ab-action-btn" title="Изменить" onClick={() => openEdit(s)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button className="ab-action-btn ab-action-delete" title="Удалить" onClick={() => handleDelete(s.id)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="ar-empty">Сотрудники не найдены</div>}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal.item ? 'Изменить роль' : 'Добавить роль'}</div>
            <div className="ar-form">
              <label className="ab-form-label">Роль</label>
              <select className="toolbar-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={{ width: '100%' }}>
                <option value="waiter">Официант</option>
                <option value="cashier">Кассир</option>
                <option value="admin">Администратор</option>
              </select>
              <label className="ab-form-label">Имя</label>
              <input className="modal-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Имя сотрудника" />
              <label className="ab-form-label">Пароль (PIN-код)</label>
              <input className="modal-input" value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.slice(0, 4) }))} placeholder="4-значный PIN" maxLength={4} type="password" inputMode="numeric" />
              <label className="ab-form-label">Телефон</label>
              <input className="modal-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Номер телефона" />
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setModal(null)}>Отмена</button>
              <button className="modal-btn save" onClick={handleSave}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
