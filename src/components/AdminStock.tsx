import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { MenuItem } from '../data/types'

interface StockGood {
  id: number
  name: string
  mxik: string
  mxikName: string
  barcode?: string
  unit: string
  unitCode?: string
  sum: number
  qqs: number
  category: string
  type: 'dish' | 'additive'
  quantity: number
  unlimited: boolean
}

const GOODS_KEY = 'pos_v2_stock_goods'
const MENU_KEY = 'pos_v2_menu'
const MODIFIERS_KEY = 'pos_v2_modifier_groups'

function loadGoods(): StockGood[] {
  try {
    const r = localStorage.getItem(GOODS_KEY)
    if (!r) return []
    const parsed = JSON.parse(r)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((g: any) => g && typeof g === 'object' && g.name && g.mxik)
  } catch { return [] }
}
function saveGoods(list: StockGood[]) { localStorage.setItem(GOODS_KEY, JSON.stringify(list)) }

function loadMenuItems(): MenuItem[] {
  try { const r = localStorage.getItem(MENU_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}
function saveMenuItems(list: MenuItem[]) { localStorage.setItem(MENU_KEY, JSON.stringify(list)) }

function fmt(n: number) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') }

function loadCategories(): string[] {
  try {
    const raw = localStorage.getItem('pos_v2_menu_categories')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function loadModifiers(): { label: string; options: string[] }[] {
  try {
    const raw = localStorage.getItem(MODIFIERS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}
function saveModifiers(list: { label: string; options: string[] }[]) {
  localStorage.setItem(MODIFIERS_KEY, JSON.stringify(list))
}

export default function AdminStock() {
  const [goods, setGoods] = useState<StockGood[]>(loadGoods)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'dish' | 'additive'>('all')
  const [modal, setModal] = useState<{ item?: StockGood } | null>(null)
  const [form, setForm] = useState({
    mxik: '',
    mxikName: '',
    unit: '',
    unitCode: '',
    sum: '',
    qqs: 12,
    category: '',
    type: 'dish' as 'dish' | 'additive',
    name: '',
    barcode: '',
    quantity: '',
    unlimited: true,
    photo: '',
  })

  const [saveError, setSaveError] = useState('')
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [noBarcodeError, setNoBarcodeError] = useState('')
  const [mxikResults, setMxikResults] = useState<{ mxikCode: string; nameRu: string; marking: boolean }[]>([])
  const [mxikOpen, setMxikOpen] = useState(false)
  const [mxikLoading, setMxikLoading] = useState(false)
  const [mxikError, setMxikError] = useState('')
  const mxikTimer = useRef<number | null>(null)
  const [mxikConfirmed, setMxikConfirmed] = useState(false)
  const [tasnifUnits, setTasnifUnits] = useState<{ name: string; code: string }[]>([])
  const [showInfo, setShowInfo] = useState(false)

  const extraCategories = useMemo(() => loadCategories(), [modal])
  const allCategories = useMemo(() => {
    const fromGoods = [...new Set(goods.map(g => g.category))]
    const all = [...extraCategories, ...fromGoods.filter(c => !extraCategories.includes(c))]
    return [...new Set(all)]
  }, [goods, extraCategories])

  useEffect(() => { saveGoods(goods) }, [goods])

  const fetchTasnifBarcode = async (mxikCode: string) => {
    setBarcodeLoading(true)
    setNoBarcodeError('')
    setForm(f => ({ ...f, barcode: '' }))
    try {
      if (!mxikCode.trim()) {
        setBarcodeLoading(false)
        return
      }
      const searchUrl = `https://tasnif.soliq.uz/api/cls-api/integration-mxik/search?search_text=${encodeURIComponent(mxikCode.trim())}`
      const res = await fetch(searchUrl)
      if (res.ok) {
        const data = await res.json()
        if (data?.success && Array.isArray(data?.data) && data.data.length > 0) {
          const matched = data.data.find((item: any) => item.mxikCode === mxikCode.trim()) || data.data[0]
          const barcode = matched?.internationalCode
          if (barcode && typeof barcode === 'string' && barcode.trim() !== '' && barcode !== 'null') {
            setForm(f => ({ ...f, barcode: barcode.trim() }))
            setNoBarcodeError('')
            setBarcodeLoading(false)
            return
          }
        }
      }
      const historyUrl = `https://tasnif.soliq.uz/api/cls-api/integration-mxik/get/history/${encodeURIComponent(mxikCode.trim())}`
      const hRes = await fetch(historyUrl)
      if (hRes.ok) {
        const hData = await hRes.json()
        const code = hData?.data?.internationalCode
        if (code && typeof code === 'string' && code.trim() !== '' && code !== 'null') {
          setForm(f => ({ ...f, barcode: code.trim() }))
          setNoBarcodeError('')
          setBarcodeLoading(false)
          return
        }
      }
      setForm(f => ({ ...f, barcode: '' }))
      setNoBarcodeError('Штрих код не найден')
    } catch {
      setForm(f => ({ ...f, barcode: '' }))
      setNoBarcodeError('Штрих код не найден')
    } finally {
      setBarcodeLoading(false)
    }
  }

  const fetchMxik = useCallback(async (code: string) => {
    if (!code.trim()) {
      setMxikResults([])
      setMxikOpen(false)
      setMxikError('')
      return
    }
    setMxikLoading(true)
    setMxikError('')
    try {
      const res = await fetch(`https://tasnif.soliq.uz/api/cls-api/integration-mxik/get/history/${code.trim()}`)
      if (!res.ok) throw new Error('Not found')
      const data = await res.json()
      if (data?.success && data?.data) {
        const nameRu = data.data.positionNameRu || data.data.groupNameRu || ''
        setMxikResults([{ mxikCode: data.data.mxikCode || code, nameRu, marking: !!(data.data.hasMark || data.data.marked || data.data.marking || data.data.hasMarking || data.data.obligatoryMarking) }])
        setMxikError('')
        setMxikOpen(true)

        const extracted = new Map<string, string>()
        const addPkg = (pkg: any) => {
          const names = [pkg.name, pkg.unitName, pkg.containerName, pkg.nameRu].filter((n): n is string => !!n && typeof n === 'string' && n.trim().length > 0)
          const code = String(pkg.id || pkg.code || pkg.packageCode || pkg.okeiCode || '')
          for (const n of names) {
            if (!extracted.has(n)) extracted.set(n, code)
          }
        }
        if (Array.isArray(data.data.packageNames)) {
          data.data.packageNames.forEach(addPkg)
        }
        try {
          const searchRes = await fetch(`https://tasnif.soliq.uz/api/cls-api/integration-mxik/search?search_text=${code.trim()}`)
          if (searchRes.ok) {
            const sData = await searchRes.json()
            if (sData?.data?.[0]?.packages && Array.isArray(sData.data[0].packages)) {
              sData.data[0].packages.forEach(addPkg)
            }
          }
        } catch {}
        const unitList = Array.from(extracted.entries()).map(([name, code]) => ({ name, code }))
        if (unitList.length > 0) setTasnifUnits(unitList)
      } else {
        setMxikResults([])
        setMxikError('Мхик код не найден')
      }
    } catch {
      setMxikResults([])
      setMxikError('Мхик код не найден')
    }
    setMxikLoading(false)
  }, [])

  const filteredGoods = goods.filter(g => {
    if (typeFilter !== 'all' && g.type !== typeFilter) return false
    if (search && !g.name.toLowerCase().includes(search.toLowerCase()) && !(g.mxik && g.mxik.includes(search))) return false
    return true
  })

  function openAdd() {
    setForm({ mxik: '', mxikName: '', unit: '', unitCode: '', sum: '', qqs: 12, category: '', type: 'dish', name: '', barcode: '', quantity: '', unlimited: true, photo: '' })
    setSaveError('')
    setNoBarcodeError('')
    setBarcodeLoading(false)
    setMxikResults([])
    setMxikError('')
    setMxikConfirmed(false)
    setTasnifUnits([])
    setShowInfo(false)
    setModal({})
  }

  function openEdit(item: StockGood) {
    setForm({
      mxik: item.mxik || '',
      mxikName: item.mxikName || '',
      unit: item.unit || '',
      unitCode: item.unitCode || '',
      sum: String(item.sum || ''),
      qqs: item.qqs ?? 12,
      category: item.category || '',
      type: item.type || 'dish',
      name: item.name || '',
      barcode: item.barcode || '',
      quantity: String(item.quantity ?? ''),
      unlimited: item.unlimited ?? false,
      photo: '',
    })
    setSaveError('')
    setNoBarcodeError(item.barcode ? '' : 'Штрих код не найден')
    setBarcodeLoading(false)
    setMxikResults([])
    setMxikError('')
    setMxikConfirmed(true)
    setTasnifUnits(item.unit ? [{ name: item.unit, code: item.unitCode || '' }] : [])
    setShowInfo(false)
    setModal({ item })
  }

  function syncModifiersAdditive(additiveName: string, remove?: boolean) {
    let mods = loadModifiers()
    const additiveIdx = mods.findIndex(g => g.label === 'Добавка')
    if (remove) {
      if (additiveIdx !== -1) {
        mods[additiveIdx] = {
          ...mods[additiveIdx],
          options: mods[additiveIdx].options.filter(o => o !== additiveName),
        }
        if (mods[additiveIdx].options.length === 0) {
          mods = mods.filter((_, i) => i !== additiveIdx)
        }
        saveModifiers(mods)
      }
      return
    }
    if (additiveIdx !== -1) {
      if (!mods[additiveIdx].options.includes(additiveName)) {
        mods[additiveIdx] = {
          ...mods[additiveIdx],
          options: [...mods[additiveIdx].options, additiveName],
        }
      }
    } else {
      mods.push({ label: 'Добавка', options: [additiveName] })
    }
    saveModifiers(mods)
  }

  function saveGoodsItem() {
    setSaveError('')
    if (!form.mxik.trim()) { setSaveError('Мхик код обязателен'); return }
    if (mxikLoading) { setSaveError('Подождите проверки МХИК кода'); return }
    if (mxikError && !modal?.item) { setSaveError('Мхик код недействителен'); return }
    if (!mxikConfirmed && !modal?.item) { setSaveError('Выберите МХИК из списка'); return }
    if (!form.name.trim()) { setSaveError('Введите имя'); return }
    if (!form.unit.trim()) { setSaveError('Выберите единицу измерения'); return }
    if (!form.sum) { setSaveError('Введите сумму'); return }
    if (!form.category) { setSaveError('Выберите категорию'); return }

    const qty = Number(form.quantity) || 0
    const sum = Number(form.sum) || 0
    const isEditing = modal?.item

    const newItem: StockGood = {
      id: isEditing ? modal.item!.id : 0,
      name: form.name.trim(),
      mxik: form.mxik.trim(),
      mxikName: form.mxikName || '',
      barcode: form.barcode || undefined,
      unit: form.unit,
        unitCode: form.unitCode ? String(form.unitCode) : undefined,
      sum,
      qqs: form.qqs,
      category: form.category,
      type: form.type,
      quantity: qty,
      unlimited: form.unlimited,
    }

    if (isEditing) {
      const oldItem = modal.item!
      if (oldItem.type === 'dish' && form.type !== 'dish') {
        let menu = loadMenuItems()
        menu = menu.filter(m => m.mxik !== oldItem.mxik)
        saveMenuItems(menu)
      }
      if (oldItem.type === 'additive' && form.type !== 'additive') {
        syncModifiersAdditive(oldItem.name, true)
      }
      setGoods(prev => prev.map(g => g.id === oldItem.id ? { ...newItem, id: oldItem.id } : g))
    } else {
      const id = Math.max(0, ...goods.map(g => g.id)) + 1
      setGoods(prev => [{ ...newItem, id }, ...prev])
    }

    if (form.type === 'dish') {
      let menu = loadMenuItems()
      if (isEditing) {
        menu = menu.filter(m => m.mxik !== modal.item!.mxik)
      }
      const existingIdx = menu.findIndex(m => m.mxik === form.mxik.trim())
      const menuItem: MenuItem = {
        id: existingIdx !== -1 ? menu[existingIdx].id : Math.max(0, ...menu.map(m => m.id)) + 1,
        name: form.name.trim(),
        price: sum,
        category: form.category,
        unit: form.unit,
      unitCode: form.unitCode ? String(form.unitCode) : undefined,
        mxik: form.mxik.trim(),
        mxikName: form.mxikName || undefined,
        photo: form.photo || undefined,
      }
      if (existingIdx !== -1) {
        menu[existingIdx] = { ...menu[existingIdx], ...menuItem }
      } else {
        menu = [menuItem, ...menu]
      }
      saveMenuItems(menu)

      if (isEditing && modal.item?.type === 'additive') {
        syncModifiersAdditive(modal.item.name, true)
      }
    } else if (form.type === 'additive') {
      if (isEditing && modal.item?.type === 'dish') {
        let menu = loadMenuItems()
        menu = menu.filter(m => m.mxik !== modal.item!.mxik)
        saveMenuItems(menu)
      }
      syncModifiersAdditive(form.name.trim())
    }

    setModal(null)
  }

  function deleteGoods(id: number) {
    const item = goods.find(g => g.id === id)
    if (!item) return
    if (item.type === 'dish') {
      let menu = loadMenuItems()
      menu = menu.filter(m => m.mxik !== item.mxik)
      saveMenuItems(menu)
    } else if (item.type === 'additive') {
      syncModifiersAdditive(item.name, true)
    }
    setGoods(prev => prev.filter(g => g.id !== id))
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          Склад
        </h1>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input className="admin-search-input" placeholder="Поиск по имени или МХИК..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="admin-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} style={{ minWidth: 140 }}>
          <option value="all">Все</option>
          <option value="dish">Блюдо</option>
          <option value="additive">Добавка</option>
        </select>
        <button className="admin-add-btn" onClick={openAdd}>+ Добавить</button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>№</th>
              <th style={{ width: '18%' }}>Имя</th>
              <th style={{ width: '14%' }}>Мхик код</th>
              <th style={{ width: '13%' }}>Штрих код</th>
              <th style={{ width: '12%' }}>Ед. изм.</th>
              <th style={{ width: '10%' }}>Сумма</th>
              <th style={{ width: '9%' }}>Тип</th>
              <th style={{ width: '9%' }}>Остаток</th>
              <th style={{ width: '10%' }} />
            </tr>
          </thead>
          <tbody>
            {filteredGoods.map((item, idx) => (
              <tr key={item.id}>
                <td style={{ fontWeight: 700, color: '#64748b' }}>{idx + 1}</td>
                <td style={{ fontWeight: 600 }}>{item.name}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{item.mxik}</td>
                <td>{item.barcode || '—'}</td>
                <td>{item.unit}</td>
                <td>{fmt(item.sum)} сум</td>
                <td>
                  <span className={`admin-role-badge ${item.type === 'dish' ? '' : ''}`}
                    style={item.type === 'additive' ? { background: '#f3e8ff', color: '#9333ea' } : { background: '#dcfce7', color: '#16a34a' }}>
                    {item.type === 'dish' ? 'Блюдо' : 'Добавка'}
                  </span>
                </td>
                <td>{item.unlimited ? '—' : item.quantity}</td>
                <td>
                  <div className="admin-action-icons">
                    <button className="admin-icon-btn edit" title="Изменить" onClick={() => openEdit(item)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button className="admin-icon-btn delete" title="Удалить" onClick={() => deleteGoods(item.id)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredGoods.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Нет товаров</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content stock-modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{modal.item ? 'Изменить товар' : 'Добавить товар'}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div style={{ position: 'relative' }}>
                <input className="modal-input" placeholder="Мхик код..." maxLength={17} value={form.mxik}
                  readOnly={!!modal.item}
                  style={modal.item ? { background: '#f8fafc', cursor: 'not-allowed' } : {}}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 17)
                    setForm(f => ({ ...f, mxik: val, mxikName: '', unit: '', name: val ? f.name : '', barcode: '' }))
                    setMxikResults([])
                    setMxikError('')
                    setMxikConfirmed(false)
                    setTasnifUnits([])
                    setNoBarcodeError('')
                    if (mxikTimer.current) clearTimeout(mxikTimer.current)
                    mxikTimer.current = window.setTimeout(() => fetchMxik(val), 500)
                  }}
                />
                {mxikLoading && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#94a3b8' }}>Проверка...</span>}
                {mxikOpen && mxikResults.length > 0 && (
                  <div className="stock-mxik-dropdown">
                    {mxikResults.map((r, idx) => (
                      <div key={idx} className="stock-mxik-item"
                        onMouseDown={() => {
                          setForm(f => ({ ...f, mxik: r.mxikCode, mxikName: r.nameRu, name: r.nameRu || f.name }))
                          setMxikConfirmed(true)
                          setMxikOpen(false)
                          setMxikError('')
                          fetchTasnifBarcode(r.mxikCode)
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <div style={{ fontWeight: 600 }}>{r.mxikCode}</div>
                        {r.nameRu && <div style={{ fontSize: 11, color: '#64748b' }}>{r.nameRu}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {mxikError && <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#ef4444' }}>{mxikError}</div>}
              </div>

              <div className="stock-modal-row">
                <div className="stock-modal-field">
                  <label className="stock-field-label">Название из API</label>
                  <input className="modal-input" value={form.mxikName} readOnly
                    style={{ background: '#f1f5f9', color: '#64748b', cursor: 'default' }}
                    placeholder="Введите МХИК код" />
                </div>
                <div className="stock-modal-field">
                  <label className="stock-field-label">Единица измерения</label>
                  {tasnifUnits.length > 0 ? (
                    <select className="modal-input" value={form.unit || ''} onChange={e => {
                      const sel = tasnifUnits.find(u => u.name === e.target.value)
                      setForm(f => ({ ...f, unit: e.target.value, unitCode: sel?.code || '' }))
                    }}>
                      <option value="" disabled hidden>Выберите...</option>
                      {tasnifUnits.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                    </select>
                  ) : (
                    <input className="modal-input" placeholder="Из МХИК кода..." value={form.unit} readOnly
                      style={{ background: '#f8fafc', cursor: 'default' }} />
                  )}
                </div>
              </div>

              <div className="stock-modal-row">
                <div className="stock-modal-field">
                  <label className="stock-field-label">Сумма</label>
                  <input className="modal-input" type="text" inputMode="numeric" placeholder="0" value={form.sum}
                    onChange={e => setForm(f => ({ ...f, sum: e.target.value.replace(/\D/g, '') }))} />
                </div>
                <div className="stock-modal-field">
                  <label className="stock-field-label">QQS</label>
                  <select className="modal-input" value={form.qqs} onChange={e => setForm(f => ({ ...f, qqs: Number(e.target.value) }))}>
                    <option value={12}>12%</option>
                    <option value={6}>6%</option>
                    <option value={0}>0%</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="stock-field-label">Категория</label>
                <select className="modal-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="" disabled hidden>Выберите категорию...</option>
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="stock-field-label">Тип</label>
                <div className="stock-type-selector">
                  <button className={`stock-type-btn${form.type === 'dish' ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, type: 'dish' }))}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 5v14" /><path d="M6 5v3a5 5 0 0 0 5 5" /><path d="M17 3v16" /><path d="M17 10a3 3 0 0 0 0-6" />
                    </svg>
                    Блюдо
                  </button>
                  <button className={`stock-type-btn${form.type === 'additive' ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, type: 'additive' }))}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Добавка
                  </button>
                </div>
              </div>

              {form.type === 'dish' && (
                <div>
                  <input type="file" accept="image/*" id="stock-photo-input" style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 10 * 1024 * 1024) { setSaveError('Фото не более 10 МБ'); return }
                      const reader = new FileReader()
                      reader.onload = () => setForm(f => ({ ...f, photo: reader.result as string }))
                      reader.readAsDataURL(file)
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button type="button" className="modal-btn" style={{ flexShrink: 0, background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0' }}
                      onClick={() => document.getElementById('stock-photo-input')?.click()}>
                      {form.photo ? 'Изменить фото' : 'Добавить фото'}
                    </button>
                    {form.photo && (
                      <button className="admin-icon-btn delete" title="Удалить фото" style={{ flexShrink: 0 }}
                        onClick={() => setForm(f => ({ ...f, photo: '' }))}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {form.photo && (
                    <div style={{ marginTop: 10 }}>
                      <img src={form.photo} alt="preview" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, objectFit: 'cover' }} />
                    </div>
                  )}
                </div>
              )}

              <div className="stock-modal-row">
                <div className="stock-modal-field">
                  <label className="stock-field-label">Имя</label>
                  <input className="modal-input" placeholder="Введите имя..." value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="stock-modal-field">
                  <label className="stock-field-label">Штрих код</label>
                  <div>
                    <input className="modal-input"
                      placeholder={barcodeLoading ? 'Поиск...' : 'Из API'}
                      value={form.barcode || ''}
                      readOnly
                      style={{ background: '#f8fafc', cursor: 'default', color: form.barcode ? '#1e293b' : '#94a3b8' }}
                    />
                    {noBarcodeError && !form.barcode && (
                      <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>{noBarcodeError}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="stock-modal-row" style={{ alignItems: 'flex-end' }}>
                <div className="stock-modal-field">
                  <label className="stock-field-label">Количество</label>
                  <input className="modal-input" type="text" inputMode="numeric" placeholder="0" value={form.quantity}
                    disabled={form.unlimited}
                    style={form.unlimited ? { background: '#f8fafc', cursor: 'not-allowed' } : {}}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value.replace(/\D/g, '') }))} />
                </div>
                <div className="stock-modal-field">
                  <label className="stock-field-label">Ограничение количества</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button className={`stock-toggle${form.unlimited ? '' : ' active'}`}
                      onClick={() => {
                        const next = !form.unlimited
                        setForm(f => ({ ...f, unlimited: next, quantity: next ? '' : f.quantity }))
                      }}
                      title={form.unlimited ? 'Бесконечный товар (нажмите чтобы включить учёт)' : 'Учитывать остаток (нажмите чтобы сделать бесконечным)'}
                    >
                      <span className="stock-toggle-knob" />
                    </button>
                    <span style={{ fontSize: 13, color: form.unlimited ? '#94a3b8' : '#1e293b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {form.unlimited ? 'Бесконечно' : 'Учитывать'}
                    </span>
                    <button className="stock-info-btn" title="Справочник" onClick={() => setShowInfo(true)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {saveError && <div className="promo-error">{saveError}</div>}
            </div>

            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setModal(null)}>Назад</button>
              <button className="modal-btn save" onClick={saveGoodsItem} disabled={barcodeLoading || mxikLoading}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <div className="modal-overlay" onClick={() => setShowInfo(false)}>
          <div className="stock-info-popup" onClick={e => e.stopPropagation()}>
            <p className="stock-info-text">
              Минимальная единица — это наименьшая единица измерения, используемая для учёта, хранения или продажи товара.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
              <button className="modal-btn save" style={{ maxWidth: 200 }} onClick={() => setShowInfo(false)}>Понятно</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
