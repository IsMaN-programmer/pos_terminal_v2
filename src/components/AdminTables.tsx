import { useState, useEffect } from 'react'
import type { Table } from '../data/types'

const ZONES_KEY = 'pos_v2_zones'
const CATEGORIES_KEY = 'pos_v2_zone_categories'
const ZONE_CATEGORY_KEY = 'pos_v2_zone_category_map'

function loadZones(): string[] {
  try {
    const raw = localStorage.getItem(ZONES_KEY)
    return raw ? JSON.parse(raw) : ['ОСНОВНОЙ ЗАЛ', 'ТЕРРАСА', 'VIP ЗОНА']
  } catch { return ['ОСНОВНОЙ ЗАЛ', 'ТЕРРАСА', 'VIP ЗОНА'] }
}

function loadCategories(): string[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY)
    return raw ? JSON.parse(raw) : ['Основная зона']
  } catch { return ['Основная зона'] }
}

function loadZoneCategory(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ZONE_CATEGORY_KEY)
    if (raw) return JSON.parse(raw)
    const zones = loadZones()
    const map: Record<string, string> = {}
    zones.forEach(z => { map[z] = 'Основная зона' })
    return map
  } catch { return {} }
}

interface AdminTablesProps {
  tables: Table[]
  onTablesChange: (tables: Table[]) => void
}

export default function AdminTables({ tables, onTablesChange }: AdminTablesProps) {
  const [allZones, setAllZones] = useState<string[]>(loadZones)
  const [categories, setCategories] = useState<string[]>(loadCategories)
  const [zoneCategory, setZoneCategory] = useState<Record<string, string>>(loadZoneCategory)
  const [selectedCategory, setSelectedCategory] = useState(categories[0] || '')
  const [zone, setZone] = useState(allZones[0] || '')
  const [actionMode, setActionMode] = useState<'edit' | 'delete' | null>(null)
  const [modal, setModal] = useState<{ type: 'table' | 'zone' | 'addZone' | 'addCategory' | 'editCategory'; table?: Table; zoneName?: string; categoryName?: string } | null>(null)
  const [formName, setFormName] = useState('')

  useEffect(() => { localStorage.setItem(ZONES_KEY, JSON.stringify(allZones)) }, [allZones])
  useEffect(() => { localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories)) }, [categories])
  useEffect(() => { localStorage.setItem(ZONE_CATEGORY_KEY, JSON.stringify(zoneCategory)) }, [zoneCategory])
  useEffect(() => { if (allZones.length > 0 && !allZones.includes(zone)) setZone(allZones[0]) }, [allZones, zone])

  const zonesInCategory = allZones.filter(z => (zoneCategory[z] || 'Основная зона') === selectedCategory)

  useEffect(() => {
    const zones = allZones.filter(z => (zoneCategory[z] || 'Основная зона') === selectedCategory)
    const first = zones.length > 0 ? zones[0] : ''
    if (zone !== first) setZone(first)
  }, [selectedCategory, allZones, zoneCategory])

  const filtered = tables.filter(t => t.zone === zone)

  function handleCategoryClick(cat: string) {
    if (actionMode === 'edit') {
      setFormName(cat)
      setModal({ type: 'editCategory', categoryName: cat })
      setActionMode(null)
    } else if (actionMode === 'delete') {
      handleDeleteCategory(cat)
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
      setAllZones(prev => prev.filter(zz => zz !== z))
      onTablesChange(tables.filter(t => t.zone !== z))
      const updated = { ...zoneCategory }
      delete updated[z]
      setZoneCategory(updated)
      setActionMode(null)
    } else {
      setZone(z)
    }
  }

  function handleTableClick(t: Table) {
    if (actionMode === 'edit') {
      setFormName(t.name)
      setModal({ type: 'table', table: t })
      setActionMode(null)
    } else if (actionMode === 'delete') {
      onTablesChange(tables.filter(td => td.id !== t.id))
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
    const maxNum = Math.max(...zoneTables.map(t => {
      const m = t.name.match(/\d+/)
      return m ? parseInt(m[0]) : 0
    }), 0)
    const id = Math.max(...tables.map(t => t.id), 0) + 1
    onTablesChange([...tables, {
      id,
      name: `Стол ${maxNum + 1}`,
      zone,
      seats: 4,
      status: 'free',
    }])
  }

  return (
    <div className="screen admin-tables">
      <div className="screen-header">
        <h1 className="screen-title">Столы и Зоны</h1>
      </div>

      <div className="admin-categories-row" style={{ marginBottom: 0 }}>
        {categories.map(cat => (
          <button
            key={cat}
            className={`admin-cat-chip${selectedCategory === cat ? ' active' : ''}${actionMode ? ' at-clickable' : ''}${actionMode === 'edit' ? ' at-highlight-edit' : ''}${actionMode === 'delete' ? ' at-highlight-del' : ''}`}
            onClick={() => handleCategoryClick(cat)}
          >
            {cat}
          </button>
        ))}
        <button className="admin-cat-add-btn" title="Добавить зону" onClick={() => { setFormName(''); setModal({ type: 'addCategory' }) }}>+</button>
      </div>

      <div className="at-layout">
        <div className="at-sidebar">
          {zonesInCategory.map(z => (
            <div key={z} className="at-zone-wrap">
              <button
                className={`at-zone-btn${zone === z ? ' active' : ''}${actionMode ? ' at-clickable' : ''}${actionMode === 'edit' ? ' at-highlight-edit' : ''}${actionMode === 'delete' ? ' at-highlight-del' : ''}`}
                onClick={() => handleZoneClick(z)}
              >
                {z.charAt(0) + z.slice(1).toLowerCase()}
              </button>
            </div>
          ))}
          <button className="admin-cat-add-btn" title="Добавить категорию" style={{ alignSelf: 'center' }} onClick={() => { setFormName(''); setModal({ type: 'addZone' }) }}>
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
                Изменить
              </button>
              <button className={`at-action-btn at-action-del${actionMode === 'delete' ? ' active' : ''}`} onClick={() => setActionMode(a => a === 'delete' ? null : 'delete')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Удалить
              </button>
              <button className="at-add-btn" onClick={handleAddTable}>+ Добавить</button>
            </div>
          </div>
          {actionMode && <div className="at-hint">Нажмите на элемент, чтобы {actionMode === 'edit' ? 'изменить' : 'удалить'}</div>}
          {zone && (
            <div className="at-grid">
              {filtered.map(t => (
                <div
                  key={t.id}
                  className={`at-table-card at-status-${t.status}${actionMode ? ' at-clickable' : ''}${actionMode === 'delete' ? ' at-highlight-del' : ''}${actionMode === 'edit' ? ' at-highlight-edit' : ''}`}
                  onClick={() => handleTableClick(t)}
                >
                  <div className="at-table-num">{t.name}</div>
                  <div className="at-table-status">{t.status === 'free' ? 'Свободен' : t.status === 'occupied' ? 'Занят' : t.status === 'ordered' ? 'Заказан' : t.status === 'payment_pending' ? 'Ожидает оплаты' : 'Забронирован'}</div>
                </div>
              ))}
              {filtered.length === 0 && <div className="at-empty">Нет столов в этой зоне</div>}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-title">
              {modal.type === 'table' ? `Изменить — ${modal.table!.name}` :
               modal.type === 'zone' ? 'Изменить зону' :
               modal.type === 'addZone' ? 'Добавить категорию' :
               modal.type === 'addCategory' ? 'Добавить зону' :
               'Изменить зону'}
            </div>
            <div className="at-form">
              <label className="ab-form-label">Название</label>
              <input
                className="modal-input"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder={modal.type === 'table' ? 'Новое название' : 'Название'}
              />
            </div>
            {modal.type === 'editCategory' && (
              <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                <button
                  className="modal-btn"
                  style={{ width: '100%', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}
                  onClick={() => handleDeleteCategory(modal.categoryName!)}
                >
                  Удалить зону и все категории в ней
                </button>
              </div>
            )}
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
