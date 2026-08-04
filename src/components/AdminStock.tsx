import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { MenuItem } from '../data/types'
import { useT, tr } from '../i18n'

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
  photo?: string
  marking?: boolean
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
    marking: false,
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
  const t = useT()

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
      const res = await fetch(`https://tasnif.soliq.uz/api/cl-api/integration-mxik/get/information?mxikCode=${encodeURIComponent(mxikCode.trim())}&lang=uz`)
      if (res.ok) {
        const data = await res.json()
        const item = Array.isArray(data?.data) ? data.data[0] : data?.data
        const barcode = item?.internalCode
        if (barcode && typeof barcode === 'string' && barcode.trim() !== '' && barcode !== 'null') {
          setForm(f => ({ ...f, barcode: barcode.trim() }))
          setNoBarcodeError('')
          setBarcodeLoading(false)
          return
        }
      }
      setForm(f => ({ ...f, barcode: '' }))
      setNoBarcodeError(t('Штрих код не найден', 'Shtrix-kod topilmadi'))
    } catch {
      setForm(f => ({ ...f, barcode: '' }))
      setNoBarcodeError(t('Штрих код не найден', 'Shtrix-kod topilmadi'))
    } finally {
      setBarcodeLoading(false)
    }
  }

  const loadMxikUnits = useCallback(async (code: string) => {
    try {
      const res = await fetch(`https://tasnif.soliq.uz/api/cl-api/integration-mxik/get/information?mxikCode=${encodeURIComponent(code.trim())}&lang=uz`)
      if (!res.ok) return
      const data = await res.json()
      if (!data?.success || !data?.data) return

      const item = Array.isArray(data.data) ? data.data[0] : data.data
      const unitList = (Array.isArray(item?.packages) ? item.packages : [])
        .map((pkg: any) => ({
          name: pkg.nameRu || pkg.nameLat || pkg.nameUz || '',
          code: String(pkg.code ?? pkg.mxikCode ?? ''),
        }))
        .filter((u: { name: string }) => u.name.trim().length > 0)
      if (unitList.length > 0) setTasnifUnits(unitList)
    } catch {}
  }, [])

  const fetchMxik = useCallback(async (code: string) => {
    if (!code.trim()) {
      setMxikResults([])
      setMxikOpen(false)
      setMxikError('')
      return
    }
    setMxikLoading(true)
    setMxikError('')
    const query = code.trim()
    try {
      const params = new URLSearchParams({ lang: 'uz' })
      if (/^\d+$/.test(query)) {
        params.set('mxikCode', query)
      } else {
        params.set('text', query)
        params.set('search_text', query)
      }
      const res = await fetch(`https://tasnif.soliq.uz/api/cl-api/integration-mxik/get/information?${params.toString()}`)
      if (!res.ok) throw new Error('Not found')
      const data = await res.json()
      if (data?.success && data?.data) {
        const list = Array.isArray(data.data) ? data.data : [data.data]
        const results = list
          .map((item: any) => ({
            mxikCode: String(item.mxik || item.mxikCode || ''),
            nameRu: item.name || item.positionName || '',
            marking: Number(item.label ?? item.hasMark ?? item.marked ?? item.marking ?? item.hasMarking ?? item.obligatoryMarking ?? 0) > 0,
          }))
          .filter((r: { mxikCode: string }) => r.mxikCode)
        if (results.length > 0) {
          setMxikResults(results)
          setMxikError('')
          setMxikOpen(true)
        } else {
          setMxikResults([])
          setMxikError(tr('Мхик код не найден', 'MXIK kodi topilmadi'))
        }
      } else {
        setMxikResults([])
        setMxikError(tr('Мхик код не найден', 'MXIK kodi topilmadi'))
      }
    } catch {
      setMxikResults([])
      setMxikError(tr('Мхик код не найден', 'MXIK kodi topilmadi'))
    }
    setMxikLoading(false)
  }, [])

  const filteredGoods = goods.filter(g => {
    if (typeFilter !== 'all' && g.type !== typeFilter) return false
    if (search && !g.name.toLowerCase().includes(search.toLowerCase()) && !(g.mxik && g.mxik.includes(search))) return false
    return true
  })

  function openAdd() {
    setForm({ mxik: '', mxikName: '', unit: '', unitCode: '', sum: '', qqs: 12, category: '', type: 'dish', name: '', barcode: '', quantity: '', unlimited: true, photo: '', marking: false })
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
    const menuPhoto = loadMenuItems().find(m => m.goodsId === item.id)?.photo
      || loadMenuItems().find(m => m.mxik === item.mxik)?.photo
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
      photo: item.photo || menuPhoto || '',
      marking: !!(item as any).marking,
    })
    setSaveError('')
    setNoBarcodeError(item.barcode ? '' : t('Штрих код не найден', 'Shtrix-kod topilmadi'))
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

  function removeMenuDish(menu: MenuItem[], goodsId: number, mxik: string): MenuItem[] {
    let idx = menu.findIndex(m => m.goodsId === goodsId)
    if (idx === -1) idx = menu.findIndex(m => m.mxik === mxik && m.id === goodsId)
    if (idx === -1) idx = menu.findIndex(m => m.mxik === mxik)
    if (idx === -1) return menu
    return menu.filter((_, i) => i !== idx)
  }

  function saveGoodsItem() {
    setSaveError('')
    if (!form.mxik.trim()) { setSaveError(t('Мхик код обязателен', 'MXIK kodi majburiy')); return }
    if (mxikLoading) { setSaveError(t('Подождите проверки МХИК кода', 'MXIK kodi tekshirilishini kuting')); return }
    if (mxikError && !modal?.item) { setSaveError(t('Мхик код недействителен', 'MXIK kodi yaroqsiz')); return }
    if (!mxikConfirmed && !modal?.item) { setSaveError(t('Выберите МХИК из списка', 'MXIK ni ro\'yxatdan tanlang')); return }
    if (!form.name.trim()) { setSaveError(t('Введите имя', 'Nomini kiriting')); return }
    if (!form.unit.trim()) { setSaveError(t('Выберите единицу измерения', 'O\'lchov birligini tanlang')); return }
    if (!form.sum) { setSaveError(t('Введите сумму', 'Summani kiriting')); return }
    if (!form.category) { setSaveError(t('Выберите категорию', 'Kategoriyani tanlang')); return }

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
      photo: form.photo || undefined,
      marking: form.marking,
    }

    let id = isEditing ? modal.item!.id : 0
    if (isEditing) {
      const oldItem = modal.item!
      if (oldItem.type === 'dish' && form.type !== 'dish') {
        saveMenuItems(removeMenuDish(loadMenuItems(), oldItem.id, oldItem.mxik))
      }
      if (oldItem.type === 'additive' && form.type !== 'additive') {
        syncModifiersAdditive(oldItem.name, true)
      }
      setGoods(prev => prev.map(g => g.id === oldItem.id ? { ...newItem, id: oldItem.id } : g))
    } else {
      id = Math.max(0, ...goods.map(g => g.id)) + 1
      setGoods(prev => [{ ...newItem, id }, ...prev])
    }

    if (form.type === 'dish') {
      let menu = loadMenuItems()
      const menuItem: MenuItem = {
        id: isEditing ? 0 : id,
        name: form.name.trim(),
        price: sum,
        category: form.category,
        unit: form.unit,
      unitCode: form.unitCode ? String(form.unitCode) : undefined,
        mxik: form.mxik.trim(),
        mxikName: form.mxikName || undefined,
        photo: form.photo || undefined,
        goodsId: id,
        mxikMarking: form.marking,
      }
      if (isEditing) {
        const goodsId = id
        const idx = menu.findIndex(m => m.goodsId === goodsId)
        if (idx !== -1) {
          menu = menu.map((m, i) => i === idx ? { ...m, ...menuItem, id: m.id } : m)
        } else {
          let idx2 = menu.findIndex(m => m.mxik === modal.item!.mxik && m.id === goodsId)
          if (idx2 === -1) idx2 = menu.findIndex(m => m.mxik === modal.item!.mxik)
          if (idx2 !== -1) {
            menu = menu.map((m, i) => i === idx2 ? { ...m, ...menuItem, id: m.id } : m)
          } else {
            menu = [{ ...menuItem, id: goodsId }, ...menu]
          }
        }
      } else {
        menu = [menuItem, ...menu]
      }
      saveMenuItems(menu)

      if (isEditing && modal.item?.type === 'additive') {
        syncModifiersAdditive(modal.item.name, true)
      }
    } else if (form.type === 'additive') {
      if (isEditing && modal.item?.type === 'dish') {
        saveMenuItems(removeMenuDish(loadMenuItems(), modal.item!.id, modal.item!.mxik))
      }
      syncModifiersAdditive(form.name.trim())
    }

    setModal(null)
  }

  function deleteGoods(id: number) {
    const item = goods.find(g => g.id === id)
    if (!item) return
    if (item.type === 'dish') {
      saveMenuItems(removeMenuDish(loadMenuItems(), item.id, item.mxik))
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
          {t('Склад', 'Ombor')}
        </h1>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input className="admin-search-input" placeholder={t('Поиск по имени или МХИК...', 'Nom yoki MXIK bo\'yicha qidirish...')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="admin-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} style={{ minWidth: 140 }}>
          <option value="all">{t('Все', 'Barchasi')}</option>
          <option value="dish">{t('Блюдо', 'Taom')}</option>
          <option value="additive">{t('Добавка', 'Qo\'shimcha')}</option>
        </select>
        <button className="admin-add-btn" onClick={openAdd}>+ {t('Добавить', 'Qo\'shish')}</button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>№</th>
              <th style={{ width: '18%' }}>{t('Имя', 'Nomi')}</th>
              <th style={{ width: '14%' }}>{t('Мхик код', 'MXIK kodi')}</th>
              <th style={{ width: '13%' }}>{t('Штрих код', 'Shtrix-kod')}</th>
              <th style={{ width: '12%' }}>{t('Ед. изм.', 'O\'lchov birligi')}</th>
              <th style={{ width: '10%' }}>{t('Сумма', 'Summa')}</th>
              <th style={{ width: '9%' }}>{t('Тип', 'Turi')}</th>
              <th style={{ width: '9%' }}>{t('Остаток', 'Qoldiq')}</th>
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
                <td>{fmt(item.sum)} {t('сум', 'so\'m')}</td>
                <td>
                  <span className={`admin-role-badge ${item.type === 'dish' ? '' : ''}`}
                    style={item.type === 'additive' ? { background: '#f3e8ff', color: '#9333ea' } : { background: '#dcfce7', color: '#16a34a' }}>
                    {item.type === 'dish' ? t('Блюдо', 'Taom') : t('Добавка', 'Qo\'shimcha')}
                  </span>
                </td>
                <td>{item.unlimited ? '—' : item.quantity}</td>
                <td>
                  <div className="admin-action-icons">
                    <button className="admin-icon-btn edit" title={t('Изменить', 'O\'zgartirish')} onClick={() => openEdit(item)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button className="admin-icon-btn delete" title={t('Удалить', 'O\'chirish')} onClick={() => deleteGoods(item.id)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredGoods.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('Нет товаров', 'Tovarlar yo\'q')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content stock-modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{modal.item ? t('Изменить товар', 'Tovarni o\'zgartirish') : t('Добавить товар', 'Tovar qo\'shish')}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div style={{ position: 'relative' }}>
                <input className="modal-input" placeholder={t('Мхик код или название...', 'MXIK kodi yoki nomi...')} maxLength={60} value={form.mxik}
                  readOnly={!!modal.item}
                  style={modal.item ? { background: '#f8fafc', cursor: 'not-allowed' } : {}}
                  onChange={e => {
                    const val = e.target.value.slice(0, 60)
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
                {mxikLoading && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#94a3b8' }}>{t('Проверка...', 'Tekshirilmoqda...')}</span>}
                {mxikOpen && mxikResults.length > 0 && (
                  <div className="stock-mxik-dropdown">
                    {mxikResults.map((r, idx) => (
                      <div key={idx} className="stock-mxik-item"
                        onMouseDown={() => {
                          setForm(f => ({ ...f, mxik: r.mxikCode, mxikName: r.nameRu, name: r.nameRu || f.name, marking: r.marking }))
                          setMxikConfirmed(true)
                          setMxikOpen(false)
                          setMxikError('')
                          setTasnifUnits([])
                          loadMxikUnits(r.mxikCode)
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
                  <label className="stock-field-label">{t('Название из API', 'API dan nomi')}</label>
                  <input className="modal-input" value={form.mxikName} readOnly
                    style={{ background: '#f1f5f9', color: '#64748b', cursor: 'default' }}
                    placeholder={t('Введите МХИК код', 'MXIK kodini kiriting')} />
                </div>
                <div className="stock-modal-field">
                  <label className="stock-field-label">{t('Единица измерения', 'O\'lchov birligi')}</label>
                  {tasnifUnits.length > 0 ? (
                    <select className="modal-input" value={form.unit || ''} onChange={e => {
                      const sel = tasnifUnits.find(u => u.name === e.target.value)
                      setForm(f => ({ ...f, unit: e.target.value, unitCode: sel?.code || '' }))
                    }}>
                      <option value="" disabled hidden>{t('Выберите...', 'Tanlang...')}</option>
                      {tasnifUnits.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                    </select>
                  ) : (
                    <input className="modal-input" placeholder={t('Из МХИК кода...', 'MXIK kodidan...')} value={form.unit} readOnly
                      style={{ background: '#f8fafc', cursor: 'default' }} />
                  )}
                </div>
              </div>

              <div className="stock-modal-row">
                <div className="stock-modal-field">
                  <label className="stock-field-label">{t('Сумма', 'Summa')}</label>
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
                <label className="stock-field-label">{t('Категория', 'Kategoriya')}</label>
                <select className="modal-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="" disabled hidden>{t('Выберите категорию...', 'Kategoriyani tanlang...')}</option>
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="stock-field-label">{t('Тип', 'Turi')}</label>
                <div className="stock-type-selector">
                  <button className={`stock-type-btn${form.type === 'dish' ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, type: 'dish' }))}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 5v14" /><path d="M6 5v3a5 5 0 0 0 5 5" /><path d="M17 3v16" /><path d="M17 10a3 3 0 0 0 0-6" />
                    </svg>
                    {t('Блюдо', 'Taom')}
                  </button>
                  <button className={`stock-type-btn${form.type === 'additive' ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, type: 'additive' }))}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {t('Добавка', 'Qo\'shimcha')}
                  </button>
                </div>
              </div>

              {form.type === 'dish' && (
                <div>
                  <input type="file" accept="image/*" id="stock-photo-input" style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 10 * 1024 * 1024) { setSaveError(t('Фото не более 10 МБ', 'Rasm 10 MB dan oshmasligi kerak')); return }
                      const reader = new FileReader()
                      reader.onload = () => setForm(f => ({ ...f, photo: reader.result as string }))
                      reader.readAsDataURL(file)
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button type="button" className="modal-btn" style={{ flexShrink: 0, background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0' }}
                      onClick={() => document.getElementById('stock-photo-input')?.click()}>
                      {form.photo ? t('Изменить фото', 'Rasmni o\'zgartirish') : t('Добавить фото', 'Rasm qo\'shish')}
                    </button>
                    {form.photo && (
                      <button className="admin-icon-btn delete" title={t('Удалить фото', 'Rasmni o\'chirish')} style={{ flexShrink: 0 }}
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
                  <label className="stock-field-label">{t('Имя', 'Nomi')}</label>
                  <input className="modal-input" placeholder={t('Введите имя...', 'Nomini kiriting...')} value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="stock-modal-field">
                  <label className="stock-field-label">{t('Штрих код', 'Shtrix-kod')}</label>
                  <div>
                    <input className="modal-input"
                      placeholder={barcodeLoading ? t('Поиск...', 'Qidirilmoqda...') : t('Из API', 'API dan')}
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
                  <label className="stock-field-label">{t('Количество', 'Miqdori')}</label>
                  <input className="modal-input" type="text" inputMode="numeric" placeholder="0" value={form.quantity}
                    disabled={form.unlimited}
                    style={form.unlimited ? { background: '#f8fafc', cursor: 'not-allowed' } : {}}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value.replace(/\D/g, '') }))} />
                </div>
                <div className="stock-modal-field">
                  <label className="stock-field-label">{t('Ограничение количества', 'Miqdor cheklovi')}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button className={`stock-toggle${form.unlimited ? '' : ' active'}`}
                      onClick={() => {
                        const next = !form.unlimited
                        setForm(f => ({ ...f, unlimited: next, quantity: next ? '' : f.quantity }))
                      }}
                      title={form.unlimited ? t('Бесконечный товар (нажмите чтобы включить учёт)', 'Cheksiz tovar (hisobni yoqish uchun bosing)') : t('Учитывать остаток (нажмите чтобы сделать бесконечным)', 'Qoldiqni hisobga olish (cheksiz qilish uchun bosing)')}
                    >
                      <span className="stock-toggle-knob" />
                    </button>
                    <span style={{ fontSize: 13, color: form.unlimited ? '#94a3b8' : '#1e293b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {form.unlimited ? t('Бесконечно', 'Cheksiz') : t('Учитывать', 'Hisobga olish')}
                    </span>
                    <button className="stock-info-btn" title={t('Справочник', 'Ma\'lumotnoma')} onClick={() => setShowInfo(true)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </button>
                    <span
                      className={`stock-mark-btn${form.marking ? ' active' : ''}`}
                      title={form.marking
                        ? t('Маркировка обязательна', 'Markirovka majburiy')
                        : t('Без маркировки', 'Markirovkasiz')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                        <line x1="7" y1="7" x2="7.01" y2="7" />
                      </svg>
                      МАРК
                    </span>
                  </div>
                </div>
              </div>

              {saveError && <div className="promo-error">{saveError}</div>}
            </div>

            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setModal(null)}>{t('Назад', 'Orqaga')}</button>
              <button className="modal-btn save" onClick={saveGoodsItem} disabled={barcodeLoading || mxikLoading}>{t('Сохранить', 'Saqlash')}</button>
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <div className="modal-overlay" onClick={() => setShowInfo(false)}>
          <div className="stock-info-popup" onClick={e => e.stopPropagation()}>
            <p className="stock-info-text">
              {t('Минимальная единица — это наименьшая единица измерения, используемая для учёта, хранения или продажи товара.', 'Minimal birlik — bu tovarni hisobga olish, saqlash yoki sotish uchun ishlatiladigan eng kichik o\'lchov birligidir.')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
              <button className="modal-btn save" style={{ maxWidth: 200 }} onClick={() => setShowInfo(false)}>{t('Понятно', 'Tushunarli')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
