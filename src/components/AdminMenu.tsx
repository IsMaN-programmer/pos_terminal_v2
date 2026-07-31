import { useState, useEffect, useMemo } from 'react'
interface StockGood {
  id: number
  name: string
  mxik: string
  mxikName: string
  barcode?: string
  unit: string
  sum: number
  qqs: number
  category: string
  type: 'dish' | 'additive'
  quantity: number
  unlimited: boolean
}

const GOODS_KEY = 'pos_v2_stock_goods'
const CAT_STORAGE_KEY = 'pos_v2_menu_categories'

function loadGoods(): StockGood[] {
  try {
    const r = localStorage.getItem(GOODS_KEY)
    if (!r) return []
    const parsed = JSON.parse(r)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((g: any) => g && typeof g === 'object' && g.name && g.mxik)
  } catch { return [] }
}

function loadExtraCategories(): string[] {
  try {
    const raw = localStorage.getItem(CAT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveExtraCategories(list: string[]) {
  localStorage.setItem(CAT_STORAGE_KEY, JSON.stringify(list))
}

export default function AdminMenu() {
  const [goods, setGoods] = useState<StockGood[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Все')
  const [extraCategories, setExtraCategories] = useState<string[]>([])
  const [actionMode, setActionMode] = useState<'edit' | 'delete' | null>(null)
  const [modal, setModal] = useState<{ type: 'add' | 'edit' | 'delete'; name?: string } | null>(null)
  const [formName, setFormName] = useState('')

  function loadData() {
    setGoods(loadGoods())
    setExtraCategories(loadExtraCategories())
  }

  useEffect(() => { loadData() }, [])

  const dishes = useMemo(() => goods.filter(g => g.type === 'dish'), [goods])

  const categories = useMemo(() => {
    const fromDishes = [...new Set(dishes.map(d => d.category))]
    const all = ['Все', ...extraCategories, ...fromDishes.filter(c => c !== 'Все' && !extraCategories.includes(c))]
    return [...new Set(all)]
  }, [dishes, extraCategories])

  const filtered = dishes.filter(item => {
    const matchCategory = categoryFilter === 'Все' || item.category === categoryFilter
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || item.mxik.toLowerCase().includes(search.toLowerCase())
    return matchCategory && matchSearch
  })

  function handleCategoryClick(cat: string) {
    if (cat === 'Все') { setCategoryFilter('Все'); return }
    if (actionMode === 'edit') {
      setFormName(cat)
      setModal({ type: 'edit', name: cat })
      setActionMode(null)
    } else if (actionMode === 'delete') {
      setFormName(cat)
      setModal({ type: 'delete', name: cat })
      setActionMode(null)
    } else {
      setCategoryFilter(cat)
    }
  }

  function handleSaveCategory() {
    const name = formName.trim()
    if (!name) return
    if (modal?.type === 'add') {
      if (!extraCategories.includes(name)) {
        const updated = [...extraCategories, name]
        saveExtraCategories(updated)
        setExtraCategories(updated)
      }
    } else if (modal?.type === 'edit' && modal.name) {
      const oldName = modal.name
      if (name !== oldName && !categories.includes(name)) {
        const updated = extraCategories.map(c => c === oldName ? name : c)
        saveExtraCategories(updated)
        setExtraCategories(updated)
        const allGoods = loadGoods()
        const changed = allGoods.some(g => g.category === oldName)
        if (changed) {
          const newGoods = allGoods.map(g => g.category === oldName ? { ...g, category: name } : g)
          localStorage.setItem(GOODS_KEY, JSON.stringify(newGoods))
          setGoods(newGoods)
        }
        if (categoryFilter === oldName) setCategoryFilter(name)
      }
    }
    setModal(null)
  }

  function handleDeleteCategory(catName: string) {
    const allGoods = loadGoods()
    const removed = allGoods.filter(g => g.category !== catName)
    localStorage.setItem(GOODS_KEY, JSON.stringify(removed))
    setGoods(removed)
    const updated = extraCategories.filter(c => c !== catName)
    saveExtraCategories(updated)
    setExtraCategories(updated)
    if (categoryFilter === catName) setCategoryFilter('Все')
    setModal(null)
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5v14" /><path d="M6 5v3a5 5 0 0 0 5 5" /><path d="M17 3v16" /><path d="M17 10a3 3 0 0 0 0-6" />
          </svg>
          Управление Меню
        </h1>
      </div>

      <div className="admin-categories-row">
        {categories.map(cat => (
          <button
            key={cat}
            className={`admin-cat-chip${categoryFilter === cat ? ' active' : ''}${actionMode ? ' at-clickable' : ''}${actionMode === 'edit' ? ' at-highlight-edit' : ''}${actionMode === 'delete' ? ' at-highlight-del' : ''}`}
            onClick={() => handleCategoryClick(cat)}
          >
            {cat}
          </button>
        ))}
        <button className="admin-cat-add-btn" title="Добавить категорию" onClick={() => { setFormName(''); setModal({ type: 'add' }) }}>+</button>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input className="admin-search-input" placeholder="Поиск по блюду или МХИК..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
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
      </div>

      {actionMode && <div className="at-hint">Нажмите на категорию, чтобы {actionMode === 'edit' ? 'изменить' : 'удалить'}</div>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Имя</th>
              <th>Мхик код</th>
              <th>Сумма</th>
              <th>Категория</th>
              <th>Единица измерения</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, idx) => (
              <tr key={item.id}>
                <td>{idx + 1}</td>
                <td style={{ fontWeight: 600 }}>{item.name}</td>
                <td style={{ fontWeight: 600 }}>{item.mxik}</td>
                <td>{item.sum.toLocaleString()} сум</td>
                <td><span className="admin-role-badge">{item.category}</span></td>
                <td>{item.unit}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Нет блюд</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.type === 'add' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Добавить категорию</h3>
            <input className="modal-input" placeholder="Название категории..." value={formName} onChange={e => setFormName(e.target.value)} />
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setModal(null)}>Назад</button>
              <button className="modal-btn save" onClick={handleSaveCategory}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {modal?.type === 'edit' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Изменить категорию</h3>
            <input className="modal-input" placeholder="Название категории..." value={formName} onChange={e => setFormName(e.target.value)} />
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setModal(null)}>Назад</button>
              <button className="modal-btn save" onClick={handleSaveCategory}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {modal?.type === 'delete' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Удалить категорию</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
              Все блюда в категории «{modal.name}» также будут удалены из склада. Продолжить?
            </p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setModal(null)}>Назад</button>
              <button className="modal-btn" style={{ background: '#ef4444', color: '#fff', border: 'none' }} onClick={() => handleDeleteCategory(modal.name!)}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
