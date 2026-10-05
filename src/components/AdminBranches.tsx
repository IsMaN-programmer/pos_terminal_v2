import { useState, useEffect } from 'react'
import { dataStore } from '../services/dataStore'
import type { Branch } from '../data/types'
import { useT } from '../i18n'

const STORAGE_KEY = 'pos_v2_branches'

function loadBranches(): Branch[] {
  try {
    const raw = dataStore.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveBranches(list: Branch[]) {
  dataStore.setItem(STORAGE_KEY, JSON.stringify(list))
}

export default function AdminBranches() {
  const t = useT()
  const [branches, setBranches] = useState<Branch[]>(loadBranches)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<{ branch?: Branch } | null>(null)
  const [form, setForm] = useState({ name: '', address: '', phone: '', terminalId: '', licenseNumber: '' })

  useEffect(() => { saveBranches(branches) }, [branches])

  const filtered = search
    ? branches.filter(b => b.name.toLowerCase().includes(search.toLowerCase()))
    : branches

  function openAdd() {
    setForm({ name: '', address: '', phone: '', terminalId: '', licenseNumber: '' })
    setModal({})
  }

  function openEdit(b: Branch) {
    setForm({ name: b.name, address: b.address, phone: b.phone, terminalId: b.terminalId || '', licenseNumber: b.licenseNumber || '' })
    setModal({ branch: b })
  }

  function handleSave() {
    if (!form.name.trim()) return
    if (modal?.branch) {
      setBranches(prev => prev.map(b => b.id === modal.branch!.id ? { ...b, ...form } : b))
    } else {
      const id = Math.max(...branches.map(b => b.id), 0) + 1
      setBranches(prev => [...prev, { id, ...form }])
    }
    setModal(null)
  }

  function handleDelete(id: number) {
    setBranches(prev => prev.filter(b => b.id !== id))
  }

  return (
    <div className="screen admin-branches">
      <div className="screen-header">
        <h1 className="screen-title">{t('Филиалы', 'Filiallar', 'Branches')}</h1>
      </div>

      <div className="ab-toolbar">
        <div className="toolbar-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={t('Поиск по названию...', 'Nomi bo\'yicha qidirish...', 'Search by name...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="ab-add-btn" onClick={openAdd}>+ {t('Добавить', 'Qo\'shish', 'Add')}</button>
      </div>

      <div className="ab-table-wrap">
        <table className="ab-table">
          <thead>
            <tr>
              <th>{t('Название', 'Nomi', 'Name')}</th>
              <th>{t('Адрес', 'Manzil', 'Address')}</th>
              <th>{t('Телефон', 'Telefon', 'Phone')}</th>
              <th>{t('Терминал ID', 'Terminal ID', 'Terminal ID')}</th>
              <th>{t('Номер лицензии', 'Litsenziya raqami', 'License number')}</th>
              <th>{t('Настройки', 'Sozlamalar', 'Settings')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.id}>
                <td className="ab-table-name">{b.name}</td>
                <td className="ab-table-addr">{b.address}</td>
                <td className="ab-table-phone">{b.phone}</td>
                <td>{b.terminalId || '—'}</td>
                <td>{b.licenseNumber || '—'}</td>
                <td>
                  <div className="ab-table-actions">
                    <button className="ab-action-btn" title={t('Изменить', 'O\'zgartirish', 'Edit')} onClick={() => openEdit(b)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button className="ab-action-btn ab-action-delete" title={t('Удалить', 'O\'chirish', 'Delete')} onClick={() => handleDelete(b.id)}>
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
        {filtered.length === 0 && <div className="ab-empty">{t('Филиалы не найдены', 'Filiallar topilmadi', 'No branches found')}</div>}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal.branch ? t('Изменить филиал', 'Filialni o\'zgartirish', 'Edit branch') : t('Добавить филиал', 'Filial qo\'shish', 'Add branch')}</div>
            <div className="ab-form">
              <label className="ab-form-label">{t('Название', 'Nomi', 'Name')}</label>
              <input className="modal-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('Введите название', 'Nomni kiriting', 'Enter name')} />
              <label className="ab-form-label">{t('Адрес', 'Manzil', 'Address')}</label>
              <input className="modal-input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder={t('Введите адрес', 'Manzilni kiriting', 'Enter address')} />
              <label className="ab-form-label">{t('Телефон', 'Telefon', 'Phone')}</label>
              <input className="modal-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder={t('Введите телефон', 'Telefonni kiriting', 'Enter phone number')} />
              <label className="ab-form-label">{t('Терминал ID', 'Terminal ID', 'Terminal ID')}</label>
              <input className="modal-input" value={form.terminalId} onChange={e => setForm(f => ({ ...f, terminalId: e.target.value }))} placeholder={t('Введите терминал ID', 'Terminal ID kiriting', 'Enter Terminal ID')} />
              <label className="ab-form-label">{t('Номер лицензии', 'Litsenziya raqami', 'License number')}</label>
              <input className="modal-input" value={form.licenseNumber} onChange={e => setForm(f => ({ ...f, licenseNumber: e.target.value }))} placeholder={t('Введите номер лицензии', 'Litsenziya raqamini kiriting', 'Enter license number')} />
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
