import { useState, useEffect, useMemo } from 'react'
import { dataStore } from '../services/dataStore'
import { useT, tr } from '../i18n'
import {
  getCabinetContext,
  fetchCatalogs,
  upsertCatalog,
  deleteCatalogs,
  loadCatalogMapping,
  saveCatalogMapping,
  errorMessage,
} from '../services/cabinetSync'
import { claimAutoCabinetSync } from '../services/autoCabinetSync'
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
    const r = dataStore.getItem(GOODS_KEY)
    if (!r) return []
    const parsed = JSON.parse(r)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((g: any) => g && typeof g === 'object' && g.name && g.mxik)
  } catch { return [] }
}

function loadExtraCategories(): string[] {
  try {
    const raw = dataStore.getItem(CAT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveExtraCategories(list: string[]) {
  dataStore.setItem(CAT_STORAGE_KEY, JSON.stringify(list))
}

export default function AdminMenu() {
  const [goods, setGoods] = useState<StockGood[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Все')
  const [extraCategories, setExtraCategories] = useState<string[]>([])
  const [actionMode, setActionMode] = useState<'edit' | 'delete' | null>(null)
  const [modal, setModal] = useState<{ type: 'add' | 'edit' | 'delete'; name?: string } | null>(null)
  const [formName, setFormName] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const t = useT()

  const showToast = (msg: string, duration = 4000) => {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }

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
          dataStore.setItem(GOODS_KEY, JSON.stringify(newGoods))
          setGoods(newGoods)
        }
        if (categoryFilter === oldName) setCategoryFilter(name)
      }
    }
    setModal(null)
  }

  function handleDeleteCategory(catName: string) {
    finishDeleteCategory(catName)
  }

  function finishDeleteCategory(catName: string) {
    const allGoods = loadGoods()
    const removed = allGoods.filter(g => g.category !== catName)
    dataStore.setItem(GOODS_KEY, JSON.stringify(removed))
    setGoods(removed)
    const updated = extraCategories.filter(c => c !== catName)
    saveExtraCategories(updated)
    setExtraCategories(updated)
    if (categoryFilter === catName) setCategoryFilter('Все')
    setModal(null)
  }

  async function syncWithCabinet() {
    setSyncing(true)
    try {
      const ctx = getCabinetContext()
      if (!ctx) throw new Error('cabinet_no_context')
      const catalogs = await fetchCatalogs()
      const mapping = loadCatalogMapping()
      const active = catalogs.filter(c => !c.isDelete)
      const activeById = new Map(active.map(c => [c.id, c]))
      const activeNames = new Set(active.map(c => c.name))

      let added = 0, updated = 0, removed = 0
      const storeCategories = loadExtraCategories()
      const next = [...storeCategories]
      const localSet = new Set(storeCategories)
      const handledIds = new Set<number>()

      function renameGoodsCategory(oldName: string, newName: string) {
        const allGoods = loadGoods()
        if (allGoods.some(g => g.category === oldName)) {
          const newGoods = allGoods.map(g => g.category === oldName ? { ...g, category: newName } : g)
          dataStore.setItem(GOODS_KEY, JSON.stringify(newGoods))
          setGoods(newGoods)
        }
      }

      for (const m of [...mapping]) {
        handledIds.add(m.id)
        const fresh = activeById.get(m.id)
        const localHas = localSet.has(m.name)
        const candidate = next.find(n => n !== m.name && !activeNames.has(n) && !mapping.some(x => x !== m && x.name === n))
        if (fresh) {
          if (fresh.name !== m.name) {
            if (localHas) {
              const lIdx = next.indexOf(m.name)
              if (lIdx !== -1) next[lIdx] = fresh.name
              renameGoodsCategory(m.name, fresh.name)
              m.name = fresh.name
              updated++
              continue
            }
            if (candidate) {
              try {
                await upsertCatalog({ id: m.id, name: candidate, sortOrder: m.sortOrder })
                m.name = candidate
                updated++
              } catch { /* retry on next sync */ }
              continue
            }
            if (!next.includes(fresh.name)) next.push(fresh.name)
            renameGoodsCategory(m.name, fresh.name)
            m.name = fresh.name
            updated++
            continue
          }
          if (!localHas) {
            if (candidate) {
              try {
                await upsertCatalog({ id: m.id, name: candidate, sortOrder: m.sortOrder })
                m.name = candidate
                updated++
              } catch { /* retry on next sync */ }
            } else {
              try {
                await deleteCatalogs([m.id])
                removed++
              } catch { /* retry on next sync */ }
              const mi = mapping.indexOf(m)
              if (mi !== -1) mapping.splice(mi, 1)
            }
          }
        } else {
          const live = active.find(x => x.name === m.name)
          if (live) {
            m.id = live.id
            continue
          }
          if (localHas) {
            const idx = next.indexOf(m.name)
            if (idx !== -1) {
              next.splice(idx, 1)
              removed++
            }
          }
          const mi = mapping.indexOf(m)
          if (mi !== -1) mapping.splice(mi, 1)
        }
      }

      for (const c of active) {
        if (handledIds.has(c.id)) continue
        if (mapping.some(m => m.id === c.id)) continue
        if (!next.includes(c.name)) {
          next.push(c.name)
          added++
        }
        mapping.push({ id: c.id, name: c.name, sortOrder: c.sortOrder })
      }

      for (const name of next) {
        if (mapping.some(m => m.name === name)) continue
        if (activeNames.has(name)) continue
        try {
          const id = await upsertCatalog({ name, sortOrder: active.length + 1 })
          const existing = mapping.find(x => x.id === id)
          if (existing) existing.name = name
          else mapping.push({ id, name, sortOrder: active.length + 1 })
          added++
        } catch { /* keep local-only, retry on next sync */ }
      }

      saveCatalogMapping(mapping)
      saveExtraCategories(next)
      setExtraCategories(next)

      const catWord = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'категория' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'категории' : 'категорий'
      const parts: string[] = []
      if (added > 0) parts.push(tr(`Добавлено ${added} ${catWord(added)}`, `Qo'shildi ${added} kategoriya`))
      if (updated > 0) parts.push(tr(`Обновлено ${updated} ${catWord(updated)}`, `Yangilandi ${updated} kategoriya`))
      if (removed > 0) parts.push(tr(`Удалено ${removed} ${catWord(removed)}`, `O'chirildi ${removed} kategoriya`))
      showToast(parts.length > 0 ? parts.join(', ') : tr('Обновлений нет', 'Yangilanish yo\'q', 'No updates'), 5000)
    } catch (e) {
      showToast(errorMessage(e, tr('Не удалось синхронизировать с кабинетом. Проверьте вход в систему и интернет.', 'Kabinet bilan sinxronlash amalga oshmadi. Tizimga kirish va internetni tekshiring.', 'Failed to sync with back office. Please check login and internet connection.')))
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (claimAutoCabinetSync('menu')) void syncWithCabinet()
  }, [])

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">
          {t('Категории меню', 'Menyu kategoriyalari', 'Menu categories')}
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
        <button className="admin-cat-add-btn" title={t('Добавить категорию', 'Kategoriya qo\'shish', 'Add category')} onClick={() => { setFormName(''); setModal({ type: 'add' }) }}>+</button>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input className="admin-search-input" placeholder={t('Поиск по блюду или МХИК...', 'Taom yoki MXIK bo\'yicha qidirish...', 'Search by dish or MXIK...')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
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
        <button className="at-action-btn at-action-sync" disabled={syncing} onClick={syncWithCabinet}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {syncing ? t('Синхронизация...', 'Sinxronlash...', 'Syncing...') : t('Синхронизация', 'Sinxronlash', 'Synchronization')}
        </button>
      </div>

      {actionMode && <div className="at-hint">{actionMode === 'edit' ? t('Нажмите на категорию, чтобы изменить', 'Kategoriyani o\'zgartirish uchun bosing', 'Tap category to edit') : t('Нажмите на категорию, чтобы удалить', 'Kategoriyani o\'chirish uchun bosing', 'Tap category to delete')}</div>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>№</th>
              <th>{t('Имя', 'Nomi', 'Name')}</th>
              <th>{t('Мхик код', 'MXIK kodi', 'MXIK code')}</th>
              <th>{t('Сумма', 'Summa', 'Amount')}</th>
              <th>{t('Категория', 'Kategoriya', 'Category')}</th>
              <th>{t('Единица измерения', 'O\'lchov birligi', 'Unit of measure')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, idx) => (
              <tr key={item.id}>
                <td>{idx + 1}</td>
                <td style={{ fontWeight: 600 }}>{item.name}</td>
                <td style={{ fontWeight: 600 }}>{item.mxik}</td>
                <td>{item.sum.toLocaleString()} {t('сум', 'so\'m', 'sum')}</td>
                <td><span className="admin-role-badge">{item.category}</span></td>
                <td>{item.unit}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('Нет блюд', 'Taomlar yo\'q', 'No dishes')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.type === 'add' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{t('Добавить категорию', 'Kategoriya qo\'shish', 'Add category')}</h3>
            <input className="modal-input" placeholder={t('Название категории...', 'Kategoriya nomi...', 'Category name...')} value={formName} onChange={e => setFormName(e.target.value)} />
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setModal(null)}>{t('Назад', 'Orqaga', 'Back')}</button>
              <button className="modal-btn save" onClick={handleSaveCategory}>{t('Сохранить', 'Saqlash', 'Save')}</button>
            </div>
          </div>
        </div>
      )}

      {modal?.type === 'edit' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{t('Изменить категорию', 'Kategoriyani o\'zgartirish', 'Edit category')}</h3>
            <input className="modal-input" placeholder={t('Название категории...', 'Kategoriya nomi...', 'Category name...')} value={formName} onChange={e => setFormName(e.target.value)} />
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setModal(null)}>{t('Назад', 'Orqaga', 'Back')}</button>
              <button className="modal-btn save" onClick={handleSaveCategory}>{t('Сохранить', 'Saqlash', 'Save')}</button>
            </div>
          </div>
        </div>
      )}

      {modal?.type === 'delete' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{t('Удалить категорию', 'Kategoriyani o\'chirish', 'Delete category')}</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
              {t(`Все блюда в категории «${modal.name}» также будут удалены из склада. Продолжить?`, `«${modal.name}» kategoriyasidagi barcha taomlar ombordan ham o\'chiriladi. Davom etasizmi?`, `All dishes in category "${modal.name}" will also be removed from stock. Continue?`)}
            </p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setModal(null)}>{t('Назад', 'Orqaga', 'Back')}</button>
              <button className="modal-btn" style={{ background: '#ef4444', color: '#fff', border: 'none' }} onClick={() => handleDeleteCategory(modal.name!)}>{t('Удалить', 'O\'chirish', 'Delete')}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-overlay">
          <div className="toast-msg">{toast}</div>
        </div>
      )}
    </div>
  )
}
