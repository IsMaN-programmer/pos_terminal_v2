import { useState, useEffect } from 'react'
import { dataStore } from '../services/dataStore'
import type { Table, TableOrderData, TableBookingData } from '../data/types'
import { CalendarIcon, ClockIcon, UserIcon, SmartphoneIcon, GuestsIcon, ReceiptIcon, PlateIcon } from './Icons'
import { useT } from '../i18n'
import chairIcon from '../assets/icons/chair.png'

const ZONES_KEY = 'pos_v2_zones'
const CATEGORIES_KEY = 'pos_v2_zone_categories'
const ZONE_CATEGORY_KEY = 'pos_v2_zone_category_map'

function loadZones(): string[] {
  try {
    const raw = dataStore.getItem(ZONES_KEY)
    return raw ? JSON.parse(raw) : ['ОСНОВНОЙ ЗАЛ', 'ТЕРРАСА', 'VIP ЗОНА']
  } catch { return ['ОСНОВНОЙ ЗАЛ', 'ТЕРРАСА', 'VIP ЗОНА'] }
}

function loadCategories(): string[] {
  try {
    const raw = dataStore.getItem(CATEGORIES_KEY)
    return raw ? JSON.parse(raw) : ['Основная зона']
  } catch { return ['Основная зона'] }
}

function loadZoneCategory(): Record<string, string> {
  try {
    const raw = dataStore.getItem(ZONE_CATEGORY_KEY)
    if (raw) return JSON.parse(raw)
    const zones = loadZones()
    const map: Record<string, string> = {}
    zones.forEach(z => { map[z] = 'Основная зона' })
    return map
  } catch { return {} }
}

interface AdminTablesProps {
  tables: Table[]
  tableOrders?: Record<number, TableOrderData>
  tableBookings?: Record<number, TableBookingData>
  staffName?: string
  onTablesChange: (tables: Table[]) => void
}

const STATUS_CLASSES: Record<string, string> = {
  free: 'table-free',
  occupied: 'table-occupied',
  ordered: 'table-ordered',
  payment_pending: 'table-payment',
  reserved: 'table-reserved',
}

function statusLabel(t: string, tr: (ru: string, uz: string, en?: string) => string): string {
  switch (t) {
    case 'free': return tr('Свободен', 'Bo\'sh', 'Free')
    case 'occupied': return tr('Занят', 'Band', 'Occupied')
    case 'ordered': return tr('Заказан', 'Buyurtma qilingan', 'Ordered')
    case 'payment_pending': return tr('Ожидает оплаты', 'To\'lov kutilmoqda', 'Awaiting payment')
    default: return tr('Забронирован', 'Bron qilingan', 'Reserved')
  }
}

export default function AdminTables({ tables, tableOrders = {}, tableBookings = {}, staffName = '', onTablesChange }: AdminTablesProps) {
  const t = useT()
  const [allZones, setAllZones] = useState<string[]>(loadZones)
  const [categories, setCategories] = useState<string[]>(loadCategories)
  const [zoneCategory, setZoneCategory] = useState<Record<string, string>>(loadZoneCategory)
  const [selectedCategory, setSelectedCategory] = useState(categories[0] || '')
  const [zone, setZone] = useState(allZones[0] || '')
  const [actionMode, setActionMode] = useState<'edit' | 'delete' | null>(null)
  const [modal, setModal] = useState<{ type: 'table' | 'zone' | 'addZone' | 'addCategory' | 'editCategory'; table?: Table; zoneName?: string; categoryName?: string } | null>(null)
  const [formName, setFormName] = useState('')

  useEffect(() => { dataStore.setItem(ZONES_KEY, JSON.stringify(allZones)) }, [allZones])
  useEffect(() => { dataStore.setItem(CATEGORIES_KEY, JSON.stringify(categories)) }, [categories])
  useEffect(() => { dataStore.setItem(ZONE_CATEGORY_KEY, JSON.stringify(zoneCategory)) }, [zoneCategory])
  useEffect(() => { if (allZones.length > 0 && !allZones.includes(zone)) setZone(allZones[0]) }, [allZones, zone])

  const zonesInCategory = allZones.filter(z => (zoneCategory[z] || 'Основная зона') === selectedCategory)

  useEffect(() => {
    const zones = allZones.filter(z => (zoneCategory[z] || 'Основная зона') === selectedCategory)
    const first = zones.length > 0 ? zones[0] : ''
    if (zone !== first) setZone(first)
  }, [selectedCategory, allZones, zoneCategory])

  const filtered = tables.filter(t => t.zone === zone)

  function zoneDeletable(z: string): boolean {
    return tables.filter(t => t.zone === z).every(t => t.status === 'free')
  }

  function categoryDeletable(cat: string): boolean {
    const zs = allZones.filter(z => (zoneCategory[z] || 'Основная зона') === cat)
    return tables.filter(t => zs.includes(t.zone)).every(t => t.status === 'free')
  }

  function handleCategoryClick(cat: string) {
    if (actionMode === 'edit') {
      setFormName(cat)
      setModal({ type: 'editCategory', categoryName: cat })
      setActionMode(null)
    } else if (actionMode === 'delete') {
      if (categoryDeletable(cat)) handleDeleteCategory(cat)
      setActionMode(null)
    } else {
      setSelectedCategory(cat)
    }
  }

  function handleZoneClick(z: string) {
    if (actionMode === 'edit') {
      setFormName(z)
      setModal({ type: 'zone', zoneName: z })
      setActionMode(null)
    } else if (actionMode === 'delete') {
      if (zoneDeletable(z)) {
        setAllZones(prev => prev.filter(zz => zz !== z))
        onTablesChange(tables.filter(t => t.zone !== z))
        const updated = { ...zoneCategory }
        delete updated[z]
        setZoneCategory(updated)
      }
      setActionMode(null)
    } else {
      setZone(z)
    }
  }

  function handleTableClick(tbl: Table) {
    if (!actionMode) return
    if (tbl.status !== 'free') {
      alert(t('Изменить или удалить можно только свободные столы', 'Faqat bo\'sh stollarni o\'zgartirish yoki o\'chirish mumkin', 'Only free tables can be edited or deleted'))
      setActionMode(null)
      return
    }
    if (actionMode === 'edit') {
      setFormName(tbl.name)
      setModal({ type: 'table', table: tbl })
      setActionMode(null)
    } else if (actionMode === 'delete') {
      onTablesChange(tables.filter(td => td.id !== tbl.id))
      setActionMode(null)
    }
  }

  function handleSave() {
    const name = formName.trim()
    if (!name) return
    if (modal?.type === 'table' && modal.table) {
      onTablesChange(tables.map(t => t.id === modal.table!.id ? { ...t, name } : t))
    } else if (modal?.type === 'zone' && modal.zoneName) {
      const oldName = modal.zoneName
      const upper = name.toUpperCase()
      setAllZones(prev => prev.map(z => z === oldName ? upper : z))
      if (zone === oldName) setZone(upper)
      setZoneCategory(prev => {
        const updated = { ...prev }
        const cat = updated[oldName] || 'Основная зона'
        delete updated[oldName]
        updated[upper] = cat
        return updated
      })
    } else if (modal?.type === 'addZone') {
      const upper = name.toUpperCase()
      if (!allZones.includes(upper)) {
        setAllZones(prev => [...prev, upper])
        setZone(upper)
        setZoneCategory(prev => ({ ...prev, [upper]: selectedCategory }))
      }
    } else if (modal?.type === 'addCategory') {
      if (!categories.includes(name)) {
        setCategories(prev => [...prev, name])
        setSelectedCategory(name)
      }
    } else if (modal?.type === 'editCategory' && modal.categoryName) {
      const oldName = modal.categoryName
      if (name !== oldName && !categories.includes(name)) {
        setCategories(prev => prev.map(c => c === oldName ? name : c))
        setZoneCategory(prev => {
          const updated = { ...prev }
          Object.keys(updated).forEach(k => {
            if (updated[k] === oldName) updated[k] = name
          })
          return updated
        })
        if (selectedCategory === oldName) setSelectedCategory(name)
      }
    }
    setModal(null)
  }

  function handleDeleteCategory(catName: string) {
    if (!categoryDeletable(catName)) {
      setModal(null)
      return
    }
    const zonesToRemove = allZones.filter(z => (zoneCategory[z] || 'Основная зона') === catName)
    setAllZones(prev => prev.filter(z => !zonesToRemove.includes(z)))
    onTablesChange(tables.filter(t => !zonesToRemove.includes(t.zone)))
    const updated = { ...zoneCategory }
    zonesToRemove.forEach(z => delete updated[z])
    setZoneCategory(updated)
    setCategories(prev => prev.filter(c => c !== catName))
    if (selectedCategory === catName) {
      const remaining = categories.filter(c => c !== catName)
      setSelectedCategory(remaining[0] || '')
    }
    setModal(null)
  }

  function handleAddTable() {
    const zoneTables = tables.filter(t => t.zone === zone)
    let maxNum = 0
    let prefix = 'Стол'
    zoneTables.forEach(t => {
      const m = t.name.match(/^(.*?)\s*(\d+)\s*$/)
      if (m) {
        const num = parseInt(m[2])
        if (num > maxNum) {
          maxNum = num
          prefix = m[1].trim() || prefix
        }
      }
    })
    const id = Math.max(...tables.map(t => t.id), 0) + 1
    onTablesChange([...tables, {
      id,
      name: `${prefix} ${maxNum + 1}`,
      zone,
      seats: 4,
      status: 'free',
    }])
  }

  return (
    <div className="screen admin-tables">
      <div className="screen-header">
        <h1 className="screen-title">{t('Столы и Зоны', 'Stollar va zonalar', 'Tables and Zones')}</h1>
      </div>

      <div className="admin-categories-row" style={{ marginBottom: 0 }}>
        {categories.map(cat => (
          <button
            key={cat}
            className={`admin-cat-chip${selectedCategory === cat ? ' active' : ''}${actionMode ? ' at-clickable' : ''}${actionMode === 'edit' ? ' at-highlight-edit' : ''}${actionMode === 'delete' ? ' at-highlight-del' : ''}${actionMode === 'delete' && !categoryDeletable(cat) ? ' at-locked' : ''}`}
            onClick={() => handleCategoryClick(cat)}
          >
            {cat}
          </button>
        ))}
        <button className="admin-cat-add-btn" title={t('Добавить зону', 'Zona qo\'shish', 'Add zone')} onClick={() => { setFormName(''); setModal({ type: 'addCategory' }) }}>+</button>
      </div>

      <div className="at-layout">
        <div className="at-sidebar">
          {zonesInCategory.map(z => (
            <div key={z} className="at-zone-wrap">
              <button
                className={`at-zone-btn${zone === z ? ' active' : ''}${actionMode ? ' at-clickable' : ''}${actionMode === 'edit' ? ' at-highlight-edit' : ''}${actionMode === 'delete' ? ' at-highlight-del' : ''}${actionMode === 'delete' && !zoneDeletable(z) ? ' at-locked' : ''}`}
                onClick={() => handleZoneClick(z)}
              >
                {z.charAt(0) + z.slice(1).toLowerCase()}
              </button>
            </div>
          ))}
          <button className="admin-cat-add-btn" title={t('Добавить категорию', 'Kategoriya qo\'shish', 'Add category')} style={{ alignSelf: 'center' }} onClick={() => { setFormName(''); setModal({ type: 'addZone' }) }}>
            +
          </button>
        </div>
        <div className="at-main">
          <div className="at-top-bar">
            <span className="at-zone-title">{zone ? zone.charAt(0) + zone.slice(1).toLowerCase() : ''}</span>
            <div className="at-actions">
              <button className={`at-action-btn${actionMode === 'edit' ? ' active' : ''}`} onClick={() => setActionMode(a => a === 'edit' ? null : 'edit')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                {t('Изменить', 'O\'zgartirish', 'Edit')}
              </button>
              <button className={`at-action-btn at-action-del${actionMode === 'delete' ? ' active' : ''}`} onClick={() => setActionMode(a => a === 'delete' ? null : 'delete')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                {t('Удалить', 'O\'chirish', 'Delete')}
              </button>
              <button className="at-add-btn" onClick={handleAddTable}>+ {t('Добавить', 'Qo\'shish', 'Add')}</button>
            </div>
          </div>
          {actionMode && <div className="at-hint">{actionMode === 'edit' ? t('Нажмите на элемент, чтобы изменить', 'O\'zgartirish uchun elementga bosing', 'Tap item to edit') : t('Нажмите на элемент, чтобы удалить', 'O\'chirish uchun elementga bosing', 'Tap item to delete')}</div>}
          {zone && (
            <div className="table-grid at-grrd">
              {filtered.map(tbl => {
                const order = tableOrders[tbl.id]
                const booking = tableBookings[tbl.id]
                const items = order?.items || []
                const totalSum = items.reduce((sum, i) => sum + i.total, 0)
                const guestCount = order?.guestCount || 1
                const openTime = order?.openTime || ''
                const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)
                const orderWaiter = order?.waiterName || staffName || '—'
                return (
                  <div
                    key={tbl.id}
                    className={`table-card ${STATUS_CLASSES[tbl.status]} at-table-card${actionMode ? ' at-clickable' : ''}${actionMode === 'delete' && tbl.status === 'free' ? ' at-highlight-del' : ''}${actionMode && tbl.status !== 'free' ? ' at-locked' : ''}`}
                    onClick={() => handleTableClick(tbl)}
                  >
                    <div className="table-card-top-bar">
                      <span className="table-number">{tbl.name}</span>
                      <span className="table-status-pill">{statusLabel(tbl.status, t)}</span>
                    </div>
                    <div className="table-card-body">
                      {tbl.status === 'free' ? (
                        <span className="table-card-icon"><img src={chairIcon} alt="" className="table-card-icon-img" /></span>
                      ) : tbl.status === 'reserved' ? (
                        <div className="table-card-order-info-list">
                          <div className="table-card-order-row">
                            <CalendarIcon />
                            <span className="table-card-order-label">{t('Дата:', 'Sana:', 'Date:')}</span>
                            <span className="table-card-order-val">{booking?.date || '—'}</span>
                          </div>
                          <div className="table-card-order-row">
                            <ClockIcon />
                            <span className="table-card-order-label">{t('Время:', 'Vaqt:', 'Time:')}</span>
                            <span className="table-card-order-val">{booking?.time || '—'}</span>
                          </div>
                          <div className="table-card-order-row">
                            <UserIcon />
                            <span className="table-card-order-label">{t('Имя:', 'Ism:', 'Name:')}</span>
                            <span className="table-card-order-val">{booking?.name || '—'}</span>
                          </div>
                          <div className="table-card-order-row">
                            <SmartphoneIcon />
                            <span className="table-card-order-label">{t('Тел:', 'Tel:', 'Phone:')}</span>
                            <span className="table-card-order-val">{booking?.phone || '—'}</span>
                          </div>
                          <div className="table-card-order-row">
                            <GuestsIcon />
                            <span className="table-card-order-label">{t('Люди:', 'Odamlar:', 'People:')}</span>
                            <span className="table-card-order-val">{booking?.guestCount ?? 1}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="table-card-order-info-list">
                          <div className="table-card-order-row">
                            <GuestsIcon />
                            <span className="table-card-order-label">{t('Люди:', 'Odamlar:', 'People:')}</span>
                            <span className="table-card-order-val">{guestCount}</span>
                          </div>
                          <div className="table-card-order-row">
                            <UserIcon />
                            <span className="table-card-order-label">{t('Официант:', 'Ofitsiant:', 'Waiter:')}</span>
                            <span className="table-card-order-val">{orderWaiter}</span>
                          </div>
                          <div className="table-card-order-row">
                            <ClockIcon />
                            <span className="table-card-order-label">{t('Время:', 'Vaqt:', 'Time:')}</span>
                            <span className="table-card-order-val">{openTime || '—'}</span>
                          </div>
                          <div className="table-card-order-row table-card-order-row-sum">
                            <ReceiptIcon />
                            <span className="table-card-order-label">{t('Сумма:', 'Summa:', 'Amount:')}</span>
                            <span className="table-card-order-val table-card-sum-text">
                              {totalSum > 0 ? `${totalSum.toLocaleString()} ${t('сум', 'so\'m', 'sum')}` : '—'}
                            </span>
                          </div>
                          <div className="table-card-order-row">
                            <PlateIcon />
                            <span className="table-card-order-label">{t('Блюда:', 'Taomlar:', 'Dishes:')}</span>
                            <span className="table-card-order-val">{itemCount}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && <div className="at-empty">{t('Нет столов в этой зоне', 'Bu zonada stollar yo\'q', 'No tables in this zone')}</div>}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-title">
              {modal.type === 'table' ? `${t('Изменить', 'O\'zgartirish', 'Edit')} — ${modal.table!.name}` :
               modal.type === 'zone' ? t('Изменить зону', 'Zonani o\'zgartirish', 'Edit zone') :
               modal.type === 'addZone' ? t('Добавить категорию', 'Kategoriya qo\'shish', 'Add category') :
               modal.type === 'addCategory' ? t('Добавить зону', 'Zona qo\'shish', 'Add zone') :
               t('Изменить зону', 'Zonani o\'zgartirish', 'Edit zone')}
            </div>
            <div className="at-form">
              <label className="ab-form-label">{t('Название', 'Nomi', 'Name')}</label>
              <input
                className="modal-input"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder={modal.type === 'table' ? t('Новое название', 'Yangi nom', 'New name') : t('Название', 'Nomi', 'Name')}
              />
            </div>
            {modal.type === 'editCategory' && (
              <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                <button
                  className="modal-btn"
                  style={{ width: '100%', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}
                  onClick={() => handleDeleteCategory(modal.categoryName!)}
                >
                  {t('Удалить зону и все категории в ней', 'Zona va undagi barcha kategoriyalarni o\'chirish', 'Delete zone and all categories in it')}
                </button>
              </div>
            )}
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
