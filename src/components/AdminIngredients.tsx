import { useState, useEffect, useMemo } from 'react'
import { useT, tr } from '../i18n'
import ingredientsIcon from '../assets/icons/ingredients.svg'
import activeIcon from '../assets/icons/active.svg'
import lowStockIcon from '../assets/icons/low-stock.svg'
import inactiveIcon from '../assets/icons/inactive.svg'
import {
  Ingredient,
  DEFAULT_UNITS,
  loadIngredients,
  saveIngredients,
  loadIngredientCategories,
  saveIngredientCategories,
  ingredientStatus,
} from '../services/ingredients'

const STATUS_COLORS: Record<string, { label: string; bg: string; color: string }> = {
  active: { label: tr('Активный', 'Faol', 'Active'), bg: '#dcfce7', color: '#16a34a' },
  low: { label: tr('Низкий остаток', 'Kam qoldiq', 'Low stock'), bg: '#fef3c7', color: '#b45309' },
  out: { label: tr('Нет в наличии', 'Mavjud emas', 'Out of stock'), bg: '#fee2e2', color: '#dc2626' },
  inactive: { label: tr('Неактивный', 'Faol emas', 'Inactive'), bg: '#e2e8f0', color: '#64748b' },
}

function fmt(n: number) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') }

export default function AdminIngredients() {
  const t = useT()
  const [ingredients, setIngredients] = useState<Ingredient[]>(loadIngredients)
  const [categories, setCategories] = useState<string[]>(loadIngredientCategories)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string>('Все')
  const [unitFilter, setUnitFilter] = useState<string>('Все')
  const [toast, setToast] = useState<string | null>(null)
  const [catModal, setCatModal] = useState(false)
  const [catName, setCatName] = useState('')
  const [catEditOriginal, setCatEditOriginal] = useState<string | null>(null)
  const [catError, setCatError] = useState('')
  const [ingModal, setIngModal] = useState<{ item?: Ingredient } | null>(null)
  const [form, setForm] = useState({ name: '', category: '', unit: DEFAULT_UNITS[0], stock: '', price: '', active: true })
  const [ingError, setIngError] = useState('')
  const [deleteName, setDeleteName] = useState<string | null>(null)
  const [deleteCat, setDeleteCat] = useState<string | null>(null)

  const showToast = (msg: string, duration = 3000) => {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }

  useEffect(() => { saveIngredients(ingredients) }, [ingredients])
  useEffect(() => { saveIngredientCategories(categories) }, [categories])

  const stats = useMemo(() => {
    const all = ingredients.length
    const active = ingredients.filter(i => i.active).length
    const low = ingredients.filter(i => ingredientStatus(i) === 'low').length
    const inactive = ingredients.filter(i => !i.active).length
    return { all, active, low, inactive }
  }, [ingredients])

  const units = useMemo(() => {
    const fromList = [...new Set(ingredients.map(i => i.unit))]
    return [...new Set([...DEFAULT_UNITS, ...fromList])]
  }, [ingredients])

  const filtered = useMemo(() => ingredients.filter(ing => {
    if (catFilter !== 'Все' && ing.category !== catFilter) return false
    if (unitFilter !== 'Все' && ing.unit !== unitFilter) return false
    if (search && !ing.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [ingredients, catFilter, unitFilter, search])

  function openAdd() {
    setForm({ name: '', category: categories[0] || '', unit: DEFAULT_UNITS[0], stock: '', price: '', active: true })
    setIngError('')
    setIngModal({})
  }

  function openEdit(item: Ingredient) {
    setForm({ name: item.name, category: item.category, unit: item.unit, stock: String(item.stock), price: String(item.price), active: item.active })
    setIngError('')
    setIngModal({ item })
  }

  function openAddCategory(original?: string) {
    setCatName(original ?? '')
    setCatEditOriginal(original ?? null)
    setCatError('')
    setCatModal(true)
  }

  function handleSaveCategory() {
    const name = catName.trim()
    if (!name) {
      setCatError(tr('Введите название категории', 'Kategoriya nomini kiriting', 'Enter category name'))
      return
    }
    const dup = categories.some(c =>
      c.toLowerCase() === name.toLowerCase() && !(catEditOriginal && c === catEditOriginal)
    )
    if (dup) {
      setCatError(tr('Такая категория уже есть', 'Bunday kategoriya allaqachon mavjud', 'Category already exists'))
      return
    }
    if (catEditOriginal) {
      setCategories(prev => prev.map(c => c === catEditOriginal ? name : c))
      setIngredients(prev => prev.map(i => i.category === catEditOriginal ? { ...i, category: name } : i))
      if (catFilter === catEditOriginal) setCatFilter(name)
      showToast(tr('Категория обновлена', 'Kategoriya yangilandi', 'Category updated'))
    } else {
      setCategories(prev => [...prev, name])
      showToast(tr('Категория добавлена', 'Kategoriya qo\'shildi', 'Category added'))
    }
    setCatModal(false)
    setCatName('')
    setCatEditOriginal(null)
  }

  function handleDeleteCategory(cat: string) {
    setCategories(prev => prev.filter(c => c !== cat))
    setIngredients(prev => prev.map(i => i.category === cat ? { ...i, category: 'Без категории' } : i))
    if (catFilter === cat) setCatFilter('Все')
    setDeleteCat(null)
    showToast(tr('Категория удалена', 'Kategoriya o\'chirildi', 'Category deleted'))
  }

  function handleSaveIngredient() {
    const name = form.name.trim()
    if (!name) {
      setIngError(tr('Введите название ингредиента', 'Ingredient nomini kiriting', 'Enter ingredient name'))
      return
    }
    const dup = ingredients.some(i =>
      i.name.toLowerCase() === name.toLowerCase() && i.id !== ingModal?.item?.id
    )
    if (dup) {
      setIngError(tr('Такой ингредиент уже есть', 'Bunday ingredient allaqachon mavjud', 'Ingredient already exists'))
      return
    }
    const stock = parseFloat(form.stock.replace(',', '.'))
    const price = parseFloat(form.price.replace(',', '.'))
    const ing: Ingredient = {
      id: ingModal?.item?.id || Date.now(),
      name,
      category: form.category || 'Без категории',
      unit: form.unit,
      stock: isNaN(stock) ? 0 : stock,
      price: isNaN(price) ? 0 : price,
      active: form.active,
      baseline: ingModal?.item
        ? Math.max(ingModal.item.baseline || 0, isNaN(stock) ? 0 : stock)
        : (isNaN(stock) ? 0 : stock),
    }
    if (ingModal?.item) {
      setIngredients(prev => prev.map(i => i.id === ing.id ? ing : i))
      showToast(tr('Ингредиент обновлен', 'Ingredient yangilandi', 'Ingredient updated'))
    } else {
      setIngredients(prev => [...prev, ing])
      showToast(tr('Ингредиент добавлен', 'Ingredient qo\'shildi', 'Ingredient added'))
    }
    setIngModal(null)
  }

  function handleDelete(ing: Ingredient) {
    setIngredients(prev => prev.filter(i => i.id !== ing.id))
    setDeleteName(null)
    showToast(tr('Ингредиент удален', 'Ingredient o\'chirildi', 'Ingredient deleted'))
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">
          {t('Ингредиенты', 'Ingredientlar', 'Ingredients')}
        </h1>
      </div>

      <div className="ing-stats">
        <div className="ing-stat-card">
          <img src={ingredientsIcon} alt="" style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0 }} />
          <div className="ing-stat-text">
            <span className="ing-stat-value">{stats.all}</span>
            <span className="ing-stat-label">{t('Все ингредиенты', 'Barcha ingredientlar', 'All ingredients')}</span>
          </div>
        </div>
        <div className="ing-stat-card">
          <img src={activeIcon} alt="" style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0 }} />
          <div className="ing-stat-text">
            <span className="ing-stat-value">{stats.active}</span>
            <span className="ing-stat-label">{t('Активные', 'Faollar', 'Active')}</span>
          </div>
        </div>
        <div className="ing-stat-card">
          <img src={lowStockIcon} alt="" style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0 }} />
          <div className="ing-stat-text">
            <span className="ing-stat-value">{stats.low}</span>
            <span className="ing-stat-label">{t('Низкий остаток', 'Kam qoldiq', 'Low stock')}</span>
          </div>
        </div>
        <div className="ing-stat-card">
          <img src={inactiveIcon} alt="" style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0 }} />
          <div className="ing-stat-text">
            <span className="ing-stat-value">{stats.inactive}</span>
            <span className="ing-stat-label">{t('Неактивные', 'Faol emas', 'Inactive')}</span>
          </div>
        </div>
      </div>

      <div className="ing-main">
        <div className="ing-sidebar">
          <div className="ing-list-block">
            <div className="ing-list-title">{t('Все категории', 'Barcha kategoriyalar', 'All categories')}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select className="toolbar-select" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
                <option value="Все">{t('Все', 'Barchasi', 'All')}</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {catFilter !== 'Все' && categories.some(c => c === catFilter) && (
                <>
                  <button className="admin-icon-btn edit" title={t('Изменить категорию', 'Kategoriyani o\'zgartirish', 'Edit category')} onClick={() => openAddCategory(catFilter)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  <button className="admin-icon-btn delete" title={t('Удалить категорию', 'Kategoriyani o\'chirish', 'Delete category')} onClick={() => setDeleteCat(catFilter)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="ing-list-block">
            <div className="ing-list-title">{t('Все единицы', 'Barcha birliklar', 'All units')}</div>
            <select className="toolbar-select" value={unitFilter} onChange={e => setUnitFilter(e.target.value)}>
              <option value="Все">{t('Все', 'Barchasi', 'All')}</option>
              {units.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div className="ing-content">
          <div className="ing-toolbar">
            <div className="admin-search-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input className="admin-search-input" placeholder={t('Поиск по названию ингредиента...', 'Ingredient nomi bo\'yicha qidirish...', 'Search by ingredient name...')} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button className="admin-add-btn" onClick={openAdd}>+ {t('Добавить ингредиент', 'Ingredient qo\'shish', 'Add ingredient')}</button>
            <button className="admin-add-btn" onClick={() => openAddCategory()}>+ {t('Добавить категорию', 'Kategoriya qo\'shish', 'Add category')}</button>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '5%' }}>№</th>
                  <th style={{ width: '20%' }}>{t('Ингредиент', 'Ingredient', 'Ingredient')}</th>
                  <th style={{ width: '15%' }}>{t('Категория', 'Kategoriya', 'Category')}</th>
                  <th style={{ width: '10%' }}>{t('Ед. изм', 'O\'lchov birligi', 'Unit')}</th>
                  <th style={{ width: '12%' }}>{t('Остаток', 'Qoldiq', 'Stock')}</th>
                  <th style={{ width: '14%' }}>{t('Цена за ед.', 'Birlik narxi', 'Unit price')}</th>
                  <th style={{ width: '13%' }}>{t('Статус', 'Holat', 'Status')}</th>
                  <th style={{ width: '11%' }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((ing, idx) => {
                  const st = STATUS_COLORS[ingredientStatus(ing)]
                  return (
                    <tr key={ing.id}>
                      <td style={{ fontWeight: 700, color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{ing.name}</td>
                      <td><span className="admin-role-badge">{ing.category}</span></td>
                      <td>{ing.unit}</td>
                      <td style={{ fontWeight: 600 }}>{ing.stock}</td>
                      <td>{fmt(ing.price)} {t('сум', 'so\'m', 'sum')}</td>
                      <td><span className="history-status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                      <td>
                        <div className="admin-action-icons">
                          <button className="admin-icon-btn edit" title={t('Изменить', 'O\'zgartirish', 'Edit')} onClick={() => openEdit(ing)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                          <button className="admin-icon-btn delete" title={t('Удалить', 'O\'chirish', 'Delete')} onClick={() => setDeleteName(ing.name)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('Нет ингредиентов', 'Ingredientlar yo\'q', 'No ingredients')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {catModal && (
        <div className="modal-overlay" onClick={() => setCatModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <h3 className="modal-title">{catEditOriginal ? t('Изменить категорию', 'Kategoriyani o\'zgartirish', 'Edit category') : t('Добавить категорию', 'Kategoriya qo\'shish', 'Add category')}</h3>
            <input className="modal-input" placeholder={t('Название категории...', 'Kategoriya nomi...', 'Category name...')} value={catName}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveCategory() }}
              onChange={e => { setCatName(e.target.value); setCatError('') }} />
            {catError && <div className="ing-modal-error">{catError}</div>}
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setCatModal(false)}>{t('Отменить', 'Bekor qilish', 'Cancel')}</button>
              <button className="modal-btn save" onClick={handleSaveCategory}>{t('Сохранить', 'Saqlash', 'Save')}</button>
            </div>
          </div>
        </div>
      )}

      {ingModal && (
        <div className="modal-overlay" onClick={() => setIngModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 className="modal-title">{ingModal.item ? t('Изменить ингредиент', 'Ingredientni o\'zgartirish', 'Edit ingredient') : t('Добавить ингредиент', 'Ingredient qo\'shish', 'Add ingredient')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div className="ing-field-label">{t('Название', 'Nomi', 'Name')}</div>
                <input className="modal-input" placeholder={t('Название ингредиента...', 'Ingredient nomi...', 'Ingredient name...')} value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setIngError('') }} />
                {ingError && <div className="ing-modal-error">{ingError}</div>}
              </div>
              <div>
                <div className="ing-field-label">{t('Категория', 'Kategoriya', 'Category')}</div>
                <select className="admin-select" style={{ width: '100%' }} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div className="ing-field-label">{t('Единица измерения', 'O\'lchov birligi', 'Unit of measure')}</div>
                <select className="admin-select" style={{ width: '100%' }} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                  {DEFAULT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <div className="ing-field-label">{t('Остаток', 'Qoldiq', 'Stock')}</div>
                <input className="modal-input" type="number" min="0" step="0.001" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
              </div>
              <div>
                <div className="ing-field-label">{t('Цена за единицу', 'Birlik narxi', 'Unit price')}</div>
                <input className="modal-input" type="number" min="0" step="100" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, color: '#1e293b', cursor: 'pointer', padding: '6px 0' }}>
                <input type="checkbox" style={{ width: 18, height: 18, cursor: 'pointer' }} checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                {t('Активный', 'Faol', 'Active')}
              </label>
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setIngModal(null)}>{t('Отменить', 'Bekor qilish', 'Cancel')}</button>
              <button className="modal-btn save" onClick={handleSaveIngredient}>{t('Сохранить', 'Saqlash', 'Save')}</button>
            </div>
          </div>
        </div>
      )}

      {deleteName && (
        <div className="modal-overlay" onClick={() => setDeleteName(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <h3 className="modal-title">{t('Удалить ингредиент', 'Ingredientni o\'chirish', 'Delete ingredient')}</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
              {t(`Удалить «${deleteName}»?`, `«${deleteName}» o'chirilsinmi?`, `Delete "${deleteName}"?`)}
            </p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setDeleteName(null)}>{t('Отменить', 'Bekor qilish', 'Cancel')}</button>
              <button className="modal-btn" style={{ background: '#ef4444', color: '#fff', border: 'none' }} onClick={() => handleDelete(ingredients.find(i => i.name === deleteName)!)}>{t('Удалить', 'O\'chirish', 'Delete')}</button>
            </div>
          </div>
        </div>
      )}

      {deleteCat && (
        <div className="modal-overlay" onClick={() => setDeleteCat(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <h3 className="modal-title">{t('Удалить категорию', 'Kategoriyani o\'chirish', 'Delete category')}</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
              {t(`Удалить категорию «${deleteCat}»? Ингредиенты станут «Без категории».`, `«${deleteCat}» kategoriyasi o'chirilsinmi? Ingredientlar «Kategoriyasiz» bo'ladi.`, `Delete category "${deleteCat}"? Ingredients will become "Uncategorized".`)}
            </p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setDeleteCat(null)}>{t('Отменить', 'Bekor qilish', 'Cancel')}</button>
              <button className="modal-btn" style={{ background: '#ef4444', color: '#fff', border: 'none' }} onClick={() => handleDeleteCategory(deleteCat)}>{t('Удалить', 'O\'chirish', 'Delete')}</button>
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