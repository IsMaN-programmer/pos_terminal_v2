import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { dataStore } from '../services/dataStore'
import type { MenuItem } from '../data/types'
import { useT, tr } from '../i18n'
import { getCompanyTin } from '../utils/companyInfo'
import {
  getCabinetContext,
  fetchAllProducts,
  createProduct,
  updateProduct,
  deleteProducts,
  loadCatalogMapping,
  errorMessage,
  type CabinetProduct,
  type ProductPushInput,
} from '../services/cabinetSync'
import { claimAutoCabinetSync } from '../services/autoCabinetSync'
import {
  loadIngredients,
  loadIngredientCategories,
  loadRecipes,
  saveRecipes,
  type Ingredient,
  type RecipeIngredient,
} from '../services/ingredients'
import MarkingModal from './MarkingModal'

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
  markingValue?: number
  cashSale?: number
  cabinetId?: number
  draft?: boolean
  draftLiters?: number
  lastMarkCode?: string
  permitted?: boolean
  syncPending?: boolean
}

const GOODS_KEY = 'pos_v2_stock_goods'
const MENU_KEY = 'pos_v2_menu'
const MODIFIERS_KEY = 'pos_v2_modifier_groups'
const PENDING_DELETIONS_KEY = 'pos_v2_stock_goods_pending_deletions'

function loadGoods(): StockGood[] {
  try {
    const r = dataStore.getItem(GOODS_KEY)
    if (!r) return []
    const parsed = JSON.parse(r)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((g: any) => g && typeof g === 'object' && g.name && g.mxik)
  } catch { return [] }
}
function saveGoods(list: StockGood[]) { dataStore.setItem(GOODS_KEY, JSON.stringify(list)) }

function loadPendingDeletions(): number[] {
  try {
    const raw = dataStore.getItem(PENDING_DELETIONS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.map(Number).filter(id => Number.isFinite(id) && id > 0))]
  } catch { return [] }
}

function savePendingDeletions(ids: number[]) {
  dataStore.setItem(PENDING_DELETIONS_KEY, JSON.stringify([...new Set(ids)]))
}

function queuePendingDeletion(cabinetId?: number) {
  if (!cabinetId) return
  savePendingDeletions([...loadPendingDeletions(), cabinetId])
}

function loadMenuItems(): MenuItem[] {
  try { const r = dataStore.getItem(MENU_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}
function saveMenuItems(list: MenuItem[]) { dataStore.setItem(MENU_KEY, JSON.stringify(list)) }

function fmt(n: number) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') }

function loadCategories(): string[] {
  try {
    const raw = dataStore.getItem('pos_v2_menu_categories')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function loadModifiers(): { label: string; options: string[] }[] {
  try {
    const raw = dataStore.getItem(MODIFIERS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}
function saveModifiers(list: { label: string; options: string[] }[]) {
  dataStore.setItem(MODIFIERS_KEY, JSON.stringify(list))
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
    markingValue: 0,
    cashSale: 0,
    draft: false,
    draftLiters: '',
    permitted: false,
  })

  const [saveError, setSaveError] = useState('')
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [noBarcodeError, setNoBarcodeError] = useState('')
  const [mxikResults, setMxikResults] = useState<{ mxikCode: string; nameRu: string; marking: boolean; markingValue: number; cashSale: number; permitted: boolean }[]>([])
  const [mxikOpen, setMxikOpen] = useState(false)
  const [mxikLoading, setMxikLoading] = useState(false)
  const [mxikError, setMxikError] = useState('')
  const mxikTimer = useRef<number | null>(null)
  const [vatLoading, setVatLoading] = useState(false)
  const [vatError, setVatError] = useState<string | null>(null)
  const [vatPercent, setVatPercent] = useState<number | null>(null)
  const [mxikConfirmed, setMxikConfirmed] = useState(false)
  const [tasnifUnits, setTasnifUnits] = useState<{ name: string; code: string }[]>([])
  const [showInfo, setShowInfo] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [markingForSave, setMarkingForSave] = useState<{ itemName: string; quantity: number } | null>(null)
  const pendingMarkCode = useRef<string | null>(null)
  const t = useT()

  const [recipePanel, setRecipePanel] = useState<StockGood | null>(null)
  const [recipeSearch, setRecipeSearch] = useState('')
  const [recipeCat, setRecipeCat] = useState('Все')
  const [recipeQty, setRecipeQty] = useState<Record<number, string>>({})
  const [recipeAdded, setRecipeAdded] = useState<RecipeIngredient[]>([])

  const showToast = (msg: string, duration = 4000) => {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }

  const extraCategories = useMemo(() => loadCategories(), [modal])
  const allCategories = useMemo(() => {
    const fromGoods = [...new Set(goods.map(g => g.category))]
    const all = [...extraCategories, ...fromGoods.filter(c => !extraCategories.includes(c))]
    return [...new Set(all)]
  }, [goods, extraCategories])

  useEffect(() => { saveGoods(goods) }, [goods])

  const allIngredients = useMemo(() => loadIngredients(), [recipePanel])
  const allRecipes = useMemo(() => loadRecipes(), [recipePanel, recipeAdded])
  const ingredientCategories = useMemo(() => {
    const fromList = [...new Set(allIngredients.map(i => i.category))]
    return [...new Set([...loadIngredientCategories(), ...fromList])]
  }, [allIngredients, recipePanel])
  const ingById = useMemo(() => new Map(allIngredients.map(i => [i.id, i])), [allIngredients])

  const filteredIngredients = useMemo(() => allIngredients.filter(ing => {
    if (recipeCat !== 'Все' && ing.category !== recipeCat) return false
    if (recipeSearch && !ing.name.toLowerCase().includes(recipeSearch.toLowerCase())) return false
    return true
  }), [allIngredients, recipeCat, recipeSearch])

  const ingredientSum = recipeAdded.reduce((s, a) => {
    const ing = ingById.get(a.ingredientId)
    return s + (ing ? (a.qty || 0) * ing.price : 0)
  }, 0)
  const suggestedSum = Math.max(0, Math.ceil((ingredientSum * 3) / 100) * 100)

  function openRecipe(item: StockGood) {
    const recipes = loadRecipes()
    const existing = (item.mxik && recipes[item.mxik]) || []
    setRecipeAdded(existing.map(r => ({ ...r })))
    setRecipeQty({})
    setRecipeSearch('')
    setRecipeCat('Все')
    setRecipePanel(item)
  }

  function addIngredient(ing: Ingredient) {
    if (recipeAdded.some(a => a.ingredientId === ing.id)) return
    const raw = recipeQty[ing.id]
    const qty = raw === undefined || raw.trim() === '' || isNaN(parseFloat(raw)) ? 1 : parseFloat(raw)
    setRecipeAdded(prev => [...prev, { ingredientId: ing.id, qty }])
  }

  function removeAdded(id: number) {
    setRecipeAdded(prev => prev.filter(a => a.ingredientId !== id))
  }

  function saveRecipe() {
    if (!recipePanel) return
    const recipes = loadRecipes()
    if (recipeAdded.length > 0) recipes[recipePanel.mxik] = recipeAdded
    else delete recipes[recipePanel.mxik]
    saveRecipes(recipes)
    showToast(tr('Ингредиенты сохранены', 'Ingredientlar saqlandi', 'Ingredients saved'))
    setRecipePanel(null)
  }

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
      setNoBarcodeError(t('Штрих код не найден', 'Shtrix-kod topilmadi', 'Barcode not found'))
    } catch {
      setForm(f => ({ ...f, barcode: '' }))
      setNoBarcodeError(t('Штрих код не найден', 'Shtrix-kod topilmadi', 'Barcode not found'))
    } finally {
      setBarcodeLoading(false)
    }
  }

  const loadMxikUnits = useCallback(async (code: string) => {
    const extracted = new Map<string, string>()
    const addPkg = (pkg: any) => {
      const name = [pkg.name, pkg.unitName, pkg.containerName, pkg.nameLat, pkg.nameUz, pkg.nameRu]
        .find((n): n is string => !!n && typeof n === 'string' && n.trim().length > 0)
      if (!name) return
      if (/миллилитр|millilitr/i.test(name)) return
      const pkgCode = String(pkg.id || pkg.code || pkg.packageCode || pkg.okeiCode || '')
      if (!extracted.has(name)) extracted.set(name, pkgCode)
    }
    const tin = getCompanyTin()
    const terminalId = dataStore.getItem('pos_v2_fm_terminal_id') || ''
    const authParams = (tin ? `&tin=${encodeURIComponent(tin.trim())}` : '') + (terminalId ? `&terminalId=${encodeURIComponent(terminalId)}` : '')
    try {
      const histRes = await fetch(`https://tasnif.soliq.uz/api/cls-api/integration-mxik/get/history/${encodeURIComponent(code.trim())}`)
      if (histRes.ok) {
        const hist = await histRes.json()
        if (Array.isArray(hist?.data?.packageNames)) {
          hist.data.packageNames.forEach(addPkg)
        }
      }
    } catch {}
    try {
      const res = await fetch(`https://tasnif.soliq.uz/api/cl-api/integration-mxik/get/information?mxikCode=${encodeURIComponent(code.trim())}&lang=uz${authParams}`)
      if (res.ok) {
        const data = await res.json()
        if (data?.data) {
          const item = Array.isArray(data.data) ? data.data[0] : data.data
          if (Array.isArray(item?.packages)) item.packages.forEach(addPkg)
        }
      }
    } catch {}
    const unitList = Array.from(extracted.entries()).map(([name, code]) => ({ name, code }))
    if (unitList.length > 0) setTasnifUnits(unitList)
  }, [])

  const fetchVatInformation = useCallback(async () => {
    const tin = getCompanyTin().trim()
    if (!tin) {
      setVatError(tr('Укажите ИНН в настройках', 'Sozlamalarda INN kiriting', 'Please specify TIN in Settings'))
      setVatLoading(false)
      setVatPercent(null)
      return
    }
    const terminalId = (dataStore.getItem('pos_v2_fm_terminal_id') || '').trim()
    setVatLoading(true)
    setVatError(null)
    try {
      const url = `https://txkm.soliq.uz/api/txkm-api/ccm-api/info/check/is-vat/${encodeURIComponent(tin)}${terminalId ? `?terminalId=${encodeURIComponent(terminalId)}` : ''}`
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      const success = body?.success === true
      if (!success) throw new Error(body?.reason || body?.message || tr('Не удалось проверить QQS', 'QQS ni tekshirib bo\'lmadi', 'Failed to check VAT'))
      const isVatPayer = body?.data === true
      const percent = body?.percent != null ? Number(body.percent) : null
      if (isVatPayer && percent == null) throw new Error(tr('Ставка НДС не вернулась', 'QQS stavkasi qaytmadi', 'VAT rate not returned'))
      const effective = isVatPayer ? (percent ?? 0) : null
      setVatPercent(effective)
      setForm(f => ({ ...f, qqs: effective ?? 0 }))
      setVatLoading(false)
    } catch (e: any) {
      setVatError(e?.message || tr('Не удалось проверить QQS', 'QQS ni tekshirib bo\'lmadi', 'Failed to check VAT'))
      setVatLoading(false)
      setVatPercent(null)
    }
  }, [])

  useEffect(() => {
    if (modal) {
      fetchVatInformation()
    } else {
      setVatLoading(false)
      setVatError(null)
      setVatPercent(null)
    }
  }, [modal, fetchVatInformation])

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
    const tin = getCompanyTin()
    const terminalId = dataStore.getItem('pos_v2_fm_terminal_id') || ''
    try {
      const params = new URLSearchParams({ lang: 'uz' })
      if (tin.trim()) params.set('tin', tin.trim())
      if (terminalId) params.set('terminalId', terminalId)
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
        const permitted = data?.permitted === true || data?.permitted === 1 || data?.permitted === 'true'
        const list = Array.isArray(data.data) ? data.data : [data.data]
        const results = list
          .map((item: any) => {
            const markingValue = Number(item.label ?? item.hasMark ?? item.marked ?? item.marking ?? item.hasMarking ?? item.obligatoryMarking ?? 0) || 0
            return {
              mxikCode: String(item.mxik || item.mxikCode || ''),
              nameRu: item.name || item.positionName || '',
              marking: markingValue > 0,
              markingValue,
              cashSale: Number(item.cashSale ?? 0) || 0,
              permitted,
            }
          })
          .filter((r: { mxikCode: string }) => r.mxikCode)
        if (results.length > 0) {
          setMxikResults(results)
          setMxikError('')
          setMxikOpen(true)
        } else {
          setMxikResults([])
          setMxikError(tr('Мхик код не найден', 'MXIK kodi topilmadi', 'MXIK code not found'))
        }
      } else {
        setMxikResults([])
        setMxikError(tr('Мхик код не найден', 'MXIK kodi topilmadi', 'MXIK code not found'))
      }
    } catch {
      setMxikResults([])
      setMxikError(tr('Мхик код не найден', 'MXIK kodi topilmadi', 'MXIK code not found'))
    }
    setMxikLoading(false)
  }, [])

  const filteredGoods = goods.filter(g => {
    if (typeFilter !== 'all' && g.type !== typeFilter) return false
    if (search && !g.name.toLowerCase().includes(search.toLowerCase()) && !(g.mxik && g.mxik.includes(search))) return false
    return true
  })

  function openAdd() {
    setForm({ mxik: '', mxikName: '', unit: '', unitCode: '', sum: '', qqs: 12, category: '', type: 'dish', name: '', barcode: '', quantity: '', unlimited: true, photo: '', marking: false, markingValue: 0, cashSale: 0, draft: false, draftLiters: '', permitted: false })
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
      markingValue: Number((item as any).markingValue ?? ((item as any).marking ? 1 : 0)) || 0,
      cashSale: Number((item as any).cashSale ?? 0) || 0,
      draft: !!(item as any).draft,
      draftLiters: String((item as any).draftLiters ?? ''),
      permitted: !!(item as any).permitted,
    })
    setSaveError('')
    setNoBarcodeError(item.barcode ? '' : t('Штрих код не найден', 'Shtrix-kod topilmadi', 'Barcode not found'))
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

  async function pushGoodToCabinet(item: StockGood): Promise<StockGood> {
    const ctx = getCabinetContext()
    if (!ctx || item.type !== 'dish') return item
    let cabinetItem = item
    if (item.markingValue == null || item.cashSale == null) {
      try {
        const params = new URLSearchParams({ mxikCode: item.mxik, lang: 'uz' })
        const tin = getCompanyTin().trim()
        const terminalId = dataStore.getItem('pos_v2_fm_terminal_id') || ''
        if (tin) params.set('tin', tin)
        if (terminalId) params.set('terminalId', terminalId)
        const response = await fetch(`https://tasnif.soliq.uz/api/cl-api/integration-mxik/get/information?${params.toString()}`)
        if (response.ok) {
          const body = await response.json()
          const rows = Array.isArray(body?.data) ? body.data : (body?.data ? [body.data] : [])
          const mxikInfo = rows.find((row: any) => String(row?.mxik ?? row?.mxikCode ?? '') === item.mxik) || rows[0]
          if (mxikInfo) {
            const markingValue = Number(mxikInfo.label ?? mxikInfo.hasMark ?? 0) || 0
            cabinetItem = {
              ...item,
              marking: markingValue > 0,
              markingValue,
              cashSale: Number(mxikInfo.cashSale ?? 0) || 0,
            }
          }
        }
      } catch { /* the cabinet request below will return the authoritative error */ }
    }
    if (!cabinetItem.unitCode || !cabinetItem.unit) {
      throw new Error(tr(
        `Выберите единицу измерения из списка МХИК (код обязателен)`,
        `O\'lchov birligini MXIK ro\'yxatidan tanlang (kod majburiy)`,
      ))
    }
    const mapping = loadCatalogMapping()
    const cat = mapping.find(m => m.name === cabinetItem.category)
    if (!cat) {
      throw new Error(tr(
        `Категория «${cabinetItem.category}» не синхронизирована с кабинетом. Откройте Управление Меню → Синхронизация.`,
        `«${cabinetItem.category}» kategoriyasi kabinet bilan sinxronlanmagan. Menyu boshqaruvi → Sinxronlash bo'limini oching.`,
      ))
    }
    const input: ProductPushInput = {
      id: cabinetItem.cabinetId,
      catalogId: cat.id,
      name: cabinetItem.name,
      shortName: cabinetItem.name,
      classCode: cabinetItem.mxik,
      className: cabinetItem.mxikName || undefined,
      barcode: cabinetItem.barcode || undefined,
      price: cabinetItem.sum,
      vatPercent: cabinetItem.qqs,
      vatSum: cabinetItem.qqs > 0 ? Math.round(cabinetItem.sum * cabinetItem.qqs / (100 + cabinetItem.qqs) * 100) / 100 : 0,
      perAmount: 1,
      packageCode: cabinetItem.unitCode || undefined,
      packageName: cabinetItem.unit || undefined,
      isMark: cabinetItem.markingValue ?? (cabinetItem.marking ? 1 : 0),
      cashSale: cabinetItem.cashSale ?? 0,
    }
    if (cabinetItem.cabinetId) {
      await updateProduct(input)
      return cabinetItem
    }
    const id = await createProduct(input)
    return { ...cabinetItem, cabinetId: id }
  }

  async function doSaveGoods() {
    setSaveError('')
    if (!form.mxik.trim()) { setSaveError(t('Мхик код обязателен', 'MXIK kodi majburiy', 'MXIK code is required')); return }
    if (mxikLoading) { setSaveError(t('Подождите проверки МХИК кода', 'MXIK kodi tekshirilishini kuting', 'Please wait for MXIK code verification')); return }
    if (mxikError && !modal?.item) { setSaveError(t('Мхик код недействителен', 'MXIK kodi yaroqsiz', 'MXIK code is invalid')); return }
    if (!mxikConfirmed && !modal?.item) { setSaveError(t('Выберите МХИК из списка', 'MXIK ni ro\'yxatdan tanlang', 'Select MXIK from the list')); return }
    if (form.type === 'dish') {
      if (vatLoading) { setSaveError(t('Подождите проверки QQS', 'QQS tekshirilishini kuting', 'Please wait for VAT check')); return }
      if (vatError) { setSaveError(vatError); return }
    }
    if (!form.name.trim()) { setSaveError(t('Введите имя', 'Nomini kiriting', 'Enter name')); return }
    if (!form.unit.trim()) { setSaveError(t('Выберите единицу измерения', 'O\'lchov birligini tanlang', 'Select unit of measure')); return }
    if (form.type === 'dish' && !form.unitCode) {
      setSaveError(t('Для единицы измерения обязателен код из МХИК', 'O\'lchov birligi uchun MXIK kodi majburiy', 'MXIK code is required for unit of measure'))
      return
    }
    if (!form.sum) { setSaveError(t('Введите сумму', 'Summani kiriting', 'Enter amount')); return }
    if (!form.category) { setSaveError(t('Выберите категорию', 'Kategoriyani tanlang', 'Select category')); return }

    const qty = Number(form.quantity.replace(',', '.')) || 0
    const sum = Number(form.sum) || 0
    const isEditing = modal?.item
    const draftLiters = form.draft ? Number(form.draftLiters.replace(',', '.')) || 0 : 0
    if (form.draft && draftLiters <= 0) { setSaveError(t('Введите объём ёмкости (литры)', 'Idish hajmini kiriting (litr)', 'Enter container volume (liters)')); return }

    const newItem: StockGood = {
      id: isEditing ? modal.item!.id : 0,
      name: form.name.trim(),
      mxik: form.mxik.trim(),
      mxikName: form.mxikName || '',
      barcode: form.barcode || undefined,
      unit: form.draft ? 'л' : form.unit,
        unitCode: form.unitCode ? String(form.unitCode) : undefined,
      sum,
      qqs: form.qqs,
      category: form.category,
      type: form.type,
      quantity: qty,
      unlimited: form.unlimited,
      photo: form.photo || undefined,
      marking: form.marking,
      markingValue: form.markingValue,
      cashSale: form.cashSale,
      draft: form.draft || undefined,
      draftLiters: form.draft ? draftLiters : undefined,
      lastMarkCode: pendingMarkCode.current || modal?.item?.lastMarkCode,
      permitted: form.permitted || undefined,
    }

    let id = isEditing ? modal.item!.id : 0
    let savedItem: StockGood
    if (isEditing) {
      savedItem = { ...newItem, id: modal.item!.id, cabinetId: modal.item!.cabinetId }
    } else {
      id = Math.max(0, ...goods.map(g => g.id)) + 1
      savedItem = { ...newItem, id }
    }

    savedItem = { ...savedItem, syncPending: savedItem.type === 'dish' }

    if (isEditing) {
      const oldItem = modal.item!
      if (oldItem.type === 'dish' && form.type !== 'dish') {
        queuePendingDeletion(oldItem.cabinetId)
        savedItem = { ...savedItem, cabinetId: undefined, syncPending: false }
        saveMenuItems(removeMenuDish(loadMenuItems(), oldItem.id, oldItem.mxik))
      }
      if (oldItem.type === 'additive' && form.type !== 'additive') {
        syncModifiersAdditive(oldItem.name, true)
      }
      setGoods(prev => prev.map(g => g.id === oldItem.id ? { ...savedItem, id: oldItem.id } : g))
    } else {
      id = savedItem.id
      setGoods(prev => [{ ...savedItem, id }, ...prev])
    }

    if (form.type === 'dish') {
      let menu = loadMenuItems()
      const menuItem: MenuItem = {
        id: isEditing ? 0 : id,
        name: form.name.trim(),
        price: sum,
        category: form.category,
        unit: form.draft ? 'л' : form.unit,
      unitCode: form.unitCode ? String(form.unitCode) : undefined,
        mxik: form.mxik.trim(),
        mxikName: form.mxikName || undefined,
        photo: form.photo || undefined,
        goodsId: id,
        mxikMarking: form.marking,
        draft: form.draft || undefined,
        draftLiters: form.draft ? draftLiters : undefined,
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

    pendingMarkCode.current = null
    setModal(null)
  }

  async function saveGoodsItem() {
    const isEditing = modal?.item
    const qty = Number(form.quantity.replace(',', '.')) || 0
    if (isEditing && isEditing.draft && form.draft && qty !== isEditing.quantity) {
      setMarkingForSave({ itemName: form.name.trim(), quantity: isEditing.quantity })
      return
    }
    await doSaveGoods()
  }

  function deleteGoods(id: number) {
    const item = goods.find(g => g.id === id)
    if (!item) return
    queuePendingDeletion(item.cabinetId)
    if (item.type === 'dish') {
      saveMenuItems(removeMenuDish(loadMenuItems(), item.id, item.mxik))
    } else if (item.type === 'additive') {
      syncModifiersAdditive(item.name, true)
    }
    setGoods(prev => prev.filter(g => g.id !== id))
  }

  function syncMenuForGoods(g: StockGood) {
    if (g.type !== 'dish') return
    let menu = loadMenuItems()
    const menuItem: MenuItem = {
      id: 0,
      name: g.name,
      price: g.sum,
      category: g.category,
      unit: g.unit,
      unitCode: g.unitCode,
      mxik: g.mxik,
      mxikName: g.mxikName || undefined,
      photo: g.photo,
      goodsId: g.id,
      mxikMarking: g.marking,
      draft: g.draft,
      draftLiters: g.draftLiters,
    }
    const idx = menu.findIndex(m => m.goodsId === g.id)
    if (idx !== -1) {
      menu = menu.map((m, i) => i === idx ? { ...m, ...menuItem, id: m.id } : m)
    } else {
      let idx2 = menu.findIndex(m => m.mxik === g.mxik && m.id === g.id)
      if (idx2 === -1) idx2 = menu.findIndex(m => m.mxik === g.mxik)
      if (idx2 !== -1) {
        menu = menu.map((m, i) => i === idx2 ? { ...m, ...menuItem, id: m.id } : m)
      } else {
        menu = [{ ...menuItem, id: g.id }, ...menu]
      }
    }
    saveMenuItems(menu)
  }

  async function syncWithCabinet() {
    setSyncing(true)
    try {
      const ctx = getCabinetContext()
      if (!ctx) throw new Error('cabinet_no_context')
      let current = loadGoods()
      let pushedAdded = 0, pushedUpdated = 0, pushedRemoved = 0
      const pushedCabinetIds = new Set<number>()

      const pendingDeletions = loadPendingDeletions()
      const deletedCabinetIds = new Set(pendingDeletions)
      if (pendingDeletions.length > 0) {
        await deleteProducts(pendingDeletions)
        pushedRemoved = pendingDeletions.length
        savePendingDeletions([])
      }

      const products = await fetchAllProducts()
      const claimedCabinetIds = new Set(current.map(g => g.cabinetId).filter((id): id is number => !!id))
      const productName = (p: CabinetProduct) => [p.shortName, p.name, p.className]
        .find(v => v && String(v).trim().length > 0)?.toString().trim() || ''
      const productMxik = (p: CabinetProduct) => [p.classCode, p.mxikCode]
        .find(v => v && String(v).trim().length > 0)?.toString().trim() || ''
      const productBarcode = (p: CabinetProduct) => String(p.barcode ?? '').trim()
      const productDeleted = (p: CabinetProduct) => p.isDelete === true || p.isDelete === 1 || p.isDelete === 'true'
      const normalized = (value: string) => value.trim().toLocaleLowerCase()

      function findCabinetMatch(local: StockGood): CabinetProduct | undefined {
        const available = products.filter(p => {
          const id = Number(p.id)
          return id > 0 && !productDeleted(p) && !deletedCabinetIds.has(id) && !claimedCabinetIds.has(id)
        })
        const barcode = String(local.barcode ?? '').trim()
        if (barcode) {
          const byBarcode = available.filter(p => productBarcode(p) === barcode)
          if (byBarcode.length === 1) return byBarcode[0]
        }
        const byMxikAndName = available.filter(p =>
          productMxik(p) === local.mxik && normalized(productName(p)) === normalized(local.name))
        if (byMxikAndName.length === 1) return byMxikAndName[0]
        return undefined
      }

      for (const local of current) {
        if (local.type !== 'dish' || !local.syncPending) continue
        let pending = local
        if (!pending.cabinetId) {
          const match = findCabinetMatch(pending)
          if (match) {
            pending = { ...pending, cabinetId: Number(match.id) }
            claimedCabinetIds.add(Number(match.id))
          }
        }
        const existedInCabinet = !!pending.cabinetId
        const saved = await pushGoodToCabinet(pending)
        current = current.map(g => g.id === local.id
          ? { ...saved, id: local.id, syncPending: false }
          : g)
        saveGoods(current)
        if (saved.cabinetId) pushedCabinetIds.add(saved.cabinetId)
        if (existedInCabinet) pushedUpdated++
        else pushedAdded++
      }

      const mapping = loadCatalogMapping()
      const catName = new Map(mapping.map(m => [m.id, m.name]))
      const next = [...current]
      let pulledAdded = 0, pulledUpdated = 0, pulledRemoved = 0, skipped = 0

      for (const p of products) {
        const cabinetId = Number(p.id)
        if (!cabinetId) { skipped++; continue }
        if (deletedCabinetIds.has(cabinetId) || pushedCabinetIds.has(cabinetId)) continue
        const name = productName(p)
        const mxik = productMxik(p)
        if (!name || !mxik) { skipped++; continue }
        const isDel = productDeleted(p)
        const existing = next.find(g => g.cabinetId === cabinetId)
          || next.find(g => !g.cabinetId && g.type === 'dish' && (
            (!!productBarcode(p) && productBarcode(p) === String(g.barcode ?? '').trim())
            || (g.mxik === mxik && normalized(g.name) === normalized(name))
          ))
        if (isDel) {
          if (existing) {
            next.splice(next.indexOf(existing), 1)
            saveMenuItems(removeMenuDish(loadMenuItems(), existing.id, existing.mxik))
            pulledRemoved++
          }
          continue
        }
        const count = Number(p.count ?? 0) || 0
        const entry: StockGood = {
          id: existing?.id ?? Math.max(0, ...next.map(g => g.id)) + 1,
          cabinetId,
          name,
          mxik,
          mxikName: String(p.className ?? '').trim(),
          barcode: String(p.barcode ?? '').trim() || undefined,
          unit: String(p.packageName ?? '').trim(),
          unitCode: String(p.packageCode ?? '').trim() || undefined,
          sum: Number(p.salePrice ?? 0) || 0,
          qqs: Number(p.vatPercent ?? 0) || 0,
          category: catName.get(Number(p.catalogId)) || '',
          type: 'dish',
          quantity: count,
          unlimited: !(count > 0),
          marking: p.isMark === true || Number(p.isMark ?? 0) > 0,
          markingValue: Number(p.isMark ?? 0) || 0,
          cashSale: Number(p.cashSale ?? 0) || 0,
          draft: existing?.draft,
          draftLiters: existing?.draftLiters,
          syncPending: false,
        }
        if (existing) {
          const i = next.indexOf(existing)
          const same = existing.name === entry.name
            && (existing.mxik || '') === (entry.mxik || '')
            && (existing.mxikName || '') === (entry.mxikName || '')
            && (existing.barcode || '') === (entry.barcode || '')
            && (existing.unit || '') === (entry.unit || '')
            && (existing.category || '') === (entry.category || '')
            && (existing.sum ?? 0) === (entry.sum ?? 0)
            && (existing.qqs ?? 0) === (entry.qqs ?? 0)
            && (existing.quantity ?? 0) === (entry.quantity ?? 0)
            && (existing.unlimited ?? true) === (entry.unlimited ?? true)
            && (existing.marking ?? false) === (entry.marking ?? false)
            && (existing.markingValue ?? (existing.marking ? 1 : 0)) === (entry.markingValue ?? 0)
            && (existing.cashSale ?? 0) === (entry.cashSale ?? 0)
          if (!same) {
            next[i] = { ...existing, ...entry, id: existing.id }
            pulledUpdated++
          }
        } else {
          next.push(entry)
          pulledAdded++
        }
        syncMenuForGoods(entry)
      }

      saveGoods(next)
      setGoods(next)
      const goodsWord = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'товар' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'товара' : 'товаров'
      const parts: string[] = []
      const added = pushedAdded + pulledAdded
      const updated = pushedUpdated + pulledUpdated
      const removed = pushedRemoved + pulledRemoved
      if (added > 0) parts.push(tr(`Добавлено ${added} ${goodsWord(added)}`, `Qo'shildi ${added} tovar`))
      if (updated > 0) parts.push(tr(`Обновлено ${updated} ${goodsWord(updated)}`, `Yangilandi ${updated} tovar`))
      if (removed > 0) parts.push(tr(`Удалено ${removed} ${goodsWord(removed)}`, `O'chirildi ${removed} tovar`))
      showToast(parts.length > 0 ? parts.join(', ') : tr('Обновлений нет', 'Yangilanish yo\'q', 'No updates'), 5000)
    } catch (e) {
      showToast(errorMessage(e, t('Не удалось синхронизировать с кабинетом. Проверьте вход в систему и интернет.', 'Kabinet bilan sinxronlash amalga oshmadi. Tizimga kirish va internetni tekshiring.', 'Failed to sync with back office. Please check login and internet connection.')))
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (claimAutoCabinetSync('stock')) void syncWithCabinet()
  }, [])

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">
          {t('Товары', 'Mahsulotlar', 'Products')}
        </h1>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input className="admin-search-input" placeholder={t('Поиск по имени или МХИК...', 'Nom yoki MXIK bo\'yicha qidirish...', 'Search by name or MXIK...')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="admin-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} style={{ minWidth: 140 }}>
          <option value="all">{t('Все', 'Barchasi', 'All')}</option>
          <option value="dish">{t('Блюдо', 'Taom', 'Dish')}</option>
          <option value="additive">{t('Добавка', 'Qo\'shimcha', 'Additive')}</option>
        </select>
        <button className="admin-add-btn" onClick={openAdd}>+ {t('Добавить', 'Qo\'shish', 'Add')}</button>
        <button className="at-action-btn at-action-sync" disabled={syncing} onClick={syncWithCabinet}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {syncing ? t('Синхронизация...', 'Sinxronlash...', 'Syncing...') : t('Синхронизация', 'Sinxronlash', 'Synchronization')}
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>№</th>
              <th style={{ width: '16%' }}>{t('Имя', 'Nomi', 'Name')}</th>
              <th style={{ width: '9%', whiteSpace: 'nowrap', paddingLeft: 6 }}>{t('Ингредиент', 'Ingredient', 'Ingredient')}</th>
              <th style={{ width: '16%' }}>{t('Мхик код', 'MXIK kodi', 'MXIK code')}</th>
              <th style={{ width: '13%' }}>{t('Штрих код', 'Shtrix-kod', 'Barcode')}</th>
              <th style={{ width: '12%' }}>{t('Ед. изм.', 'O\'lchov birligi', 'Unit')}</th>
              <th style={{ width: '10%' }}>{t('Сумма', 'Summa', 'Amount')}</th>
              <th style={{ width: '9%' }}>{t('Тип', 'Turi', 'Type')}</th>
              <th style={{ width: '9%' }}>{t('Остаток', 'Qoldiq', 'Stock')}</th>
              <th style={{ width: '10%' }} />
            </tr>
          </thead>
          <tbody>
            {filteredGoods.map((item, idx) => (
              <tr key={item.id}>
                <td style={{ fontWeight: 700, color: '#64748b' }}>{idx + 1}</td>
                <td style={{ fontWeight: 600 }}>{item.name}</td>
                <td style={{ textAlign: 'center', paddingLeft: 14, paddingRight: 34 }}>
                  <button className={`ing-row-add-btn${item.mxik && allRecipes[item.mxik]?.length ? ' has-recipe' : ''}`} title={t('Добавить ингредиенты', 'Ingredientlar qo\'shish', 'Add ingredients')} onClick={() => openRecipe(item)}>+</button>
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{item.mxik}</td>
                <td>{item.barcode || '—'}</td>
                <td>{item.unit}</td>
                <td>{fmt(item.sum)} {t('сум', 'so\'m', 'sum')}</td>
                <td>
                  <span className={`admin-role-badge ${item.type === 'dish' ? '' : ''}`}
                    style={item.type === 'additive' ? { background: '#f3e8ff', color: '#9333ea' } : { background: '#dcfce7', color: '#16a34a' }}>
                    {item.type === 'dish' ? t('Блюдо', 'Taom', 'Dish') : t('Добавка', 'Qo\'shimcha', 'Additive')}
                  </span>
                </td>
                <td>{item.unlimited ? '—' : item.quantity}</td>
                <td>
                  <div className="admin-action-icons">
                    <button className="admin-icon-btn edit" title={t('Изменить', 'O\'zgartirish', 'Edit')} onClick={() => openEdit(item)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button className="admin-icon-btn delete" title={t('Удалить', 'O\'chirish', 'Delete')} onClick={() => deleteGoods(item.id)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredGoods.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('Нет товаров', 'Tovarlar yo\'q', 'No products')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {recipePanel && (
        <div className="ing-recipe-overlay" onClick={() => setRecipePanel(null)}>
          <div className="ing-recipe-panel" onClick={e => e.stopPropagation()}>
            <div className="ing-recipe-header">
              <div>
                <div className="ing-recipe-title">{t('Добавление ингредиента', 'Ingredient qo\'shish', 'Adding ingredient')}</div>
                <div className="ing-recipe-dish">{recipePanel.name}</div>
              </div>
              <button className="ing-recipe-close" onClick={() => setRecipePanel(null)}>✕</button>
            </div>

            <div className="ing-recipe-toolbar">
              <div className="admin-search-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input className="admin-search-input" placeholder={t('Поиск ингредиента...', 'Ingredient qidirish...', 'Search ingredient...')} value={recipeSearch} onChange={e => setRecipeSearch(e.target.value)} />
              </div>
              <select className="admin-select" value={recipeCat} onChange={e => setRecipeCat(e.target.value)} style={{ minWidth: 130 }}>
                <option value="Все">{t('Все категории', 'Barcha kategoriyalar', 'All categories')}</option>
                {ingredientCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="ing-recipe-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '24%' }}>{t('Ингредиент', 'Ingredient', 'Ingredient')}</th>
                    <th style={{ width: '18%' }}>{t('Остаток', 'Qoldiq', 'Stock')}</th>
                    <th style={{ width: '15%' }}>{t('Ед', 'Birlik', 'Unit')}</th>
                    <th style={{ width: '27%' }}>{t('Отнимать', 'Kamaytirish', 'Deduct')}</th>
                    <th style={{ width: '16%' }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredIngredients.map(ing => (
                    <tr key={ing.id}>
                      <td style={{ fontWeight: 600 }}>{ing.name}</td>
                      <td>{ing.stock}</td>
                      <td>{ing.unit}</td>
                      <td>
                        <input className="ing-qty-input" type="number" min="0" step="0.001" value={recipeQty[ing.id] ?? ''}
                          placeholder="0.1"
                          onChange={e => setRecipeQty(prev => ({ ...prev, [ing.id]: e.target.value }))} />
                      </td>
                      <td>
                        <button className={`ing-add-btn${recipeAdded.some(a => a.ingredientId === ing.id) ? ' added' : ''}`}
                          disabled={recipeAdded.some(a => a.ingredientId === ing.id)}
                          onClick={() => addIngredient(ing)}>+</button>
                      </td>
                    </tr>
                  ))}
                  {filteredIngredients.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: 30 }}>{t('Нет ингредиентов', 'Ingredientlar yo\'q', 'No ingredients')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="ing-recipe-section-title">{t('Добавленные ингредиенты', 'Qo\'shilgan ingredientlar', 'Added ingredients')}</div>
            <div className="ing-recipe-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '32%' }}>{t('Ингредиенты', 'Ingredientlar', 'Ingredients')}</th>
                    <th style={{ width: '26%' }}>{t('Отнимать', 'Kamaytirish', 'Deduct')}</th>
                    <th style={{ width: '12%' }}>{t('Ед', 'Birlik', 'Unit')}</th>
                    <th style={{ width: '20%' }}>{t('Сумма', 'Summa', 'Amount')}</th>
                    <th style={{ width: '10%' }} />
                  </tr>
                </thead>
                <tbody>
                  {recipeAdded.map(a => {
                    const ing = ingById.get(a.ingredientId)
                    if (!ing) return null
                    return (
                      <tr key={a.ingredientId}>
                        <td style={{ fontWeight: 600 }}>{ing.name}</td>
                        <td>
                          <span className="ing-qty-text">{a.qty}</span>
                        </td>
                        <td>{ing.unit}</td>
                        <td>{fmt((a.qty || 0) * ing.price)} {t('сум', 'so\'m', 'sum')}</td>
                        <td>
                          <button className="admin-icon-btn delete" title={t('Удалить', 'O\'chirish', 'Delete')} onClick={() => removeAdded(a.ingredientId)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {recipeAdded.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>{t('Ничего не добавлено', 'Hech narsa qo\'shilmagan', 'Nothing added')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="ing-recipe-sums">
              <div className="ing-recipe-sum">
                <span className="ing-recipe-sum-icon sum-ing">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" /><path d="M16 14h4" /><path d="M2 11h20" /></svg>
                </span>
                <span className="ing-recipe-sum-text">
                  <span className="ing-recipe-sum-label">{t('Сумма ингредиентов', 'Ingredientlar summasi', 'Ingredients cost')}</span>
                  <b>{fmt(Math.round(ingredientSum))} {t('сум', 'so\'m', 'sum')}</b>
                </span>
              </div>
              <div className="ing-recipe-sum">
                <span className="ing-recipe-sum-icon sum-dish">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>
                </span>
                <span className="ing-recipe-sum-text">
                  <span className="ing-recipe-sum-label">{t('Сумма блюда', 'Taom summasi', 'Dish cost')}</span>
                  <b>{fmt(recipePanel.sum)} {t('сум', 'so\'m', 'sum')}</b>
                </span>
              </div>
              <div className="ing-recipe-sum">
                <span className="ing-recipe-sum-icon sum-suggest">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /><path d="M19 16l.9 2.6 2.6.9-2.6.9L19 23l-.9-2.6-2.6-.9 2.6-.9z" /></svg>
                </span>
                <span className="ing-recipe-sum-text">
                  <span className="ing-recipe-sum-label">{t('Предлагаемая сумма', 'Taklif qilingan summa', 'Suggested amount')}</span>
                  <b>{fmt(suggestedSum)} {t('сум', 'so\'m', 'sum')}</b>
                </span>
              </div>
            </div>

            <button className="ing-recipe-save" onClick={saveRecipe}>{t('Сохранить', 'Saqlash', 'Save')}</button>
          </div>
        </div>
      )}

      {modal !== null && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content stock-modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{modal.item ? t('Изменить товар', 'Tovarni o\'zgartirish', 'Edit product') : t('Добавить товар', 'Tovar qo\'shish', 'Add product')}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div style={{ position: 'relative' }}>
                <input className="modal-input" placeholder={t('Мхик код или название...', 'MXIK kodi yoki nomi...', 'MXIK code or name...')} maxLength={60} value={form.mxik}
                  readOnly={!!modal.item}
                  style={modal.item ? { background: '#f8fafc', cursor: 'not-allowed' } : {}}
                  onChange={e => {
                    const val = e.target.value.slice(0, 60)
                    setForm(f => ({ ...f, mxik: val, mxikName: '', unit: '', name: val ? f.name : '', barcode: '', marking: false, markingValue: 0, cashSale: 0, permitted: false }))
                    setMxikResults([])
                    setMxikError('')
                    setMxikConfirmed(false)
                    setTasnifUnits([])
                    setNoBarcodeError('')
                    if (mxikTimer.current) clearTimeout(mxikTimer.current)
                    mxikTimer.current = window.setTimeout(() => fetchMxik(val), 500)
                  }}
                />
                {mxikLoading && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#94a3b8' }}>{t('Проверка...', 'Tekshirilmoqda...', 'Checking...')}</span>}
                {mxikOpen && mxikResults.length > 0 && (
                  <div className="stock-mxik-dropdown">
                    {mxikResults.map((r, idx) => (
                      <div key={idx} className="stock-mxik-item"
                        onMouseDown={() => {
                          setForm(f => ({
                            ...f,
                            mxik: r.mxikCode,
                            mxikName: r.nameRu,
                            name: r.nameRu || f.name,
                            marking: r.marking,
                            markingValue: r.markingValue,
                            cashSale: r.cashSale,
                            permitted: r.permitted,
                            draft: r.permitted ? f.draft : false,
                          }))
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
                  <label className="stock-field-label">{t('Название из API', 'API dan nomi', 'Name from API')}</label>
                  <input className="modal-input" value={form.mxikName} readOnly
                    style={{ background: '#f1f5f9', color: '#64748b', cursor: 'default' }}
                    placeholder={t('Введите МХИК код', 'MXIK kodini kiriting', 'Enter MXIK code')} />
                </div>
                <div className="stock-modal-field">
                  <label className="stock-field-label">{t('Единица измерения', 'O\'lchov birligi', 'Unit of measure')}</label>
                  {tasnifUnits.length > 0 ? (
                    <select className="modal-input" value={form.unit || ''} onChange={e => {
                      const sel = tasnifUnits.find(u => u.name === e.target.value)
                      setForm(f => ({ ...f, unit: e.target.value, unitCode: sel?.code || '' }))
                    }}>
                      <option value="" disabled hidden>{t('Выберите...', 'Tanlang...', 'Select...')}</option>
                      {tasnifUnits.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                    </select>
                  ) : (
                    <input className="modal-input" placeholder={t('Из МХИК кода...', 'MXIK kodidan...', 'From MXIK code...')} value={form.unit} readOnly
                      style={{ background: '#f8fafc', cursor: 'default' }} />
                  )}
                </div>
              </div>

              <div className="stock-modal-row">
                <div className="stock-modal-field">
                  <label className="stock-field-label">{t('Сумма', 'Summa', 'Amount')}</label>
                  <input className="modal-input" type="text" inputMode="numeric" placeholder="0" value={form.sum}
                    onChange={e => setForm(f => ({ ...f, sum: e.target.value.replace(/\D/g, '') }))} />
                </div>
                <div className="stock-modal-field">
                  <label className="stock-field-label">QQS</label>
                  {vatLoading ? (
                    <div className="modal-input" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc' }}>
                      <span style={{ width: 18, height: 18, border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                      <span style={{ color: '#64748b', fontSize: 14 }}>{t('Определение...', 'Aniqlanmoqda...', 'Checking...')}</span>
                    </div>
                  ) : vatError ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#fff4f2', border: '1px solid #fda29b', borderRadius: 8 }}>
                      <span style={{ color: '#d92d20', fontSize: 13, fontWeight: 600, flex: 1 }}>{vatError}</span>
                      <button onClick={fetchVatInformation} style={{ background: 'none', border: 'none', color: '#d92d20', cursor: 'pointer', display: 'flex' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      </button>
                    </div>
                  ) : vatPercent == null ? (
                    <div className="modal-input" style={{ background: '#f8fafc', color: '#64748b' }}>{t('Не применяется', 'Qo\'llanilmaydi', 'Not applicable')}</div>
                  ) : (
                    <div className="modal-input" style={{ background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#1e293b', fontWeight: 600 }}>
                      <span>{vatPercent}%</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="stock-field-label">{t('Категория', 'Kategoriya', 'Category')}</label>
                <select className="modal-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="" disabled hidden>{t('Выберите категорию...', 'Kategoriyani tanlang...', 'Select category...')}</option>
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="stock-field-label">{t('Тип', 'Turi', 'Type')}</label>
                <div className="stock-type-selector">
                  <button className={`stock-type-btn${form.type === 'dish' ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, type: 'dish' }))}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 5v14" /><path d="M6 5v3a5 5 0 0 0 5 5" /><path d="M17 3v16" /><path d="M17 10a3 3 0 0 0 0-6" />
                    </svg>
                    {t('Блюдо', 'Taom', 'Dish')}
                  </button>
                  <button className={`stock-type-btn${form.type === 'additive' ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, type: 'additive' }))}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {t('Добавка', 'Qo\'shimcha', 'Additive')}
                  </button>
                </div>
              </div>

              {form.type === 'dish' || form.type === 'additive' ? (
                <div>
                  <input type="file" accept="image/*" id="stock-photo-input" style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 10 * 1024 * 1024) { setSaveError(t('Фото не более 10 МБ', 'Rasm 10 MB dan oshmasligi kerak', 'Photo must not exceed 10 MB')); return }
                      const reader = new FileReader()
                      reader.onload = () => setForm(f => ({ ...f, photo: reader.result as string }))
                      reader.readAsDataURL(file)
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button type="button" className="modal-btn" style={{ flexShrink: 0, background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0' }}
                      onClick={() => document.getElementById('stock-photo-input')?.click()}>
                      {form.photo ? t('Изменить фото', 'Rasmni o\'zgartirish', 'Change photo') : t('Добавить фото', 'Rasm qo\'shish', 'Add photo')}
                    </button>
                    {form.photo && (
                      <button className="admin-icon-btn delete" title={t('Удалить фото', 'Rasmni o\'chirish', 'Delete photo')} style={{ flexShrink: 0 }}
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
              ) : null}

              <div className="stock-modal-row">
                <div className="stock-modal-field">
                  <label className="stock-field-label">{t('Имя', 'Nomi', 'Name')}</label>
                  <input className="modal-input" placeholder={t('Введите имя...', 'Nomini kiriting...', 'Enter name...')} value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="stock-modal-field">
                  <label className="stock-field-label">{t('Штрих код', 'Shtrix-kod', 'Barcode')}</label>
                  <div>
                    <input className="modal-input"
                      placeholder={barcodeLoading ? t('Поиск...', 'Qidirilmoqda...', 'Search...') : t('Из API', 'API dan', 'From API')}
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
                  <label className="stock-field-label">{t('Количество', 'Miqdori', 'Quantity')}</label>
                  <input className="modal-input" type="text" inputMode="decimal" placeholder={form.draft ? '0.5' : '0'} value={form.quantity}
                    disabled={form.unlimited}
                    style={form.unlimited ? { background: '#f8fafc', cursor: 'not-allowed' } : {}}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value.replace(form.draft ? /[^\d.,]/g : /\D/g, '') }))} />
                </div>
                <div className="stock-modal-field">
                  <label className="stock-field-label">{t('Ограничение количества', 'Miqdor cheklovi', 'Quantity limit')}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button className={`stock-toggle${form.unlimited ? '' : ' active'}`}
                      onClick={() => {
                        const next = !form.unlimited
                        setForm(f => ({ ...f, unlimited: next, quantity: next ? '' : f.quantity }))
                      }}
                      title={form.unlimited ? t('Бесконечный товар (нажмите чтобы включить учёт)', 'Cheksiz tovar (hisobni yoqish uchun bosing)', 'Unlimited product (tap to enable tracking)') : t('Учитывать остаток (нажмите чтобы сделать бесконечным)', 'Qoldiqni hisobga olish (cheksiz qilish uchun bosing)', 'Track stock (tap to make unlimited)')}
                    >
                      <span className="stock-toggle-knob" />
                    </button>
                    <span style={{ fontSize: 13, color: form.unlimited ? '#94a3b8' : '#1e293b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {form.unlimited ? t('Бесконечно', 'Cheksiz', 'Unlimited') : t('Учитывать', 'Hisobga olish', 'Track')}
                    </span>
                    <button className="stock-info-btn" title={t('Справочник', 'Ma\'lumotnoma', 'Catalog')} onClick={() => setShowInfo(true)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </button>
                    <span
                      className={`stock-mark-btn${form.marking ? ' active' : ''}`}
                      title={form.marking
                        ? t('Маркировка обязательна', 'Markirovka majburiy', 'Labeling required')
                        : t('Без маркировки', 'Markirovkasiz', 'Without labeling')}
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

            {form.type === 'dish' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', marginTop: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{t('Наливной товар (разлив)', 'Quyma mahsulot (jo\'mrakdan)', 'Draft product (on tap)')}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    {t('Остаток и продажа в литрах, цена за ёмкость', 'Qoldiq va sotuv litrlarda, narx idish uchun', 'Stock and sales in liters, price per container')}
                    {form.permitted && !form.draft && (
                      <span style={{ marginLeft: 8, color: '#16a34a', fontWeight: 700 }}>✓ {t('Разрешён (permitted)', 'Ruxsat etilgan (permitted)', 'Allowed (permitted)')}</span>
                    )}
                  </div>
                </div>
                <button className={`stock-toggle${form.draft ? ' active' : ''}${!form.draft && !form.permitted ? ' disabled' : ''}`}
                  disabled={!form.draft && !form.permitted}
                  onClick={() => {
                    if (!form.draft && !form.permitted) return
                    const next = !form.draft
                    setForm(f => ({
                      ...f,
                      draft: next,
                      draftLiters: next && !f.draftLiters ? '1' : f.draftLiters,
                    }))
                  }}
                  title={!form.draft && !form.permitted ? t('Только для товаров с разрешённым статусом (permitted)', 'Faqat ruxsat etilgan (permitted) tovarlar uchun', 'Only for products with permitted status') : (form.draft ? t('Обычный товар', 'Oddiy mahsulot', 'Regular product') : t('Наливной товар', 'Quyma mahsulot', 'Draft product'))}
                >
                  <span className="stock-toggle-knob" />
                </button>
              </div>
            )}

            {form.type === 'dish' && form.draft && (
              <div>
                <label className="stock-field-label">{t('Объём ёмкости, л', 'Idish hajmi, l', 'Container volume, L')}</label>
                <input className="modal-input" type="text" inputMode="decimal" placeholder="1" value={form.draftLiters}
                  onChange={e => setForm(f => ({ ...f, draftLiters: e.target.value.replace(/[^\d.,]/g, '') }))} />
              </div>
            )}

            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setModal(null)}>{t('Назад', 'Orqaga', 'Back')}</button>
              <button className="modal-btn save" onClick={saveGoodsItem} disabled={barcodeLoading || mxikLoading || (form.type === 'dish' && (vatLoading || !!vatError))}>{t('Сохранить', 'Saqlash', 'Save')}</button>
            </div>
          </div>
        </div>
      )}

      {markingForSave && (
        <MarkingModal
          itemName={markingForSave.itemName}
          allowDuplicates
          onCancel={() => setMarkingForSave(null)}
          onConfirm={(code) => {
            pendingMarkCode.current = code
            setMarkingForSave(null)
            doSaveGoods()
          }}
        />
      )}

      {showInfo && (
        <div className="modal-overlay" onClick={() => setShowInfo(false)}>
          <div className="stock-info-popup" onClick={e => e.stopPropagation()}>
            <p className="stock-info-text">
              {t('Минимальная единица — это наименьшая единица измерения, используемая для учёта, хранения или продажи товара.', 'Minimal birlik — bu tovarni hisobga olish, saqlash yoki sotish uchun ishlatiladigan eng kichik o\'lchov birligidir.', 'Minimum unit is the smallest unit of measure used for accounting, storage or sale of the product.')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
              <button className="modal-btn save" style={{ maxWidth: 200 }} onClick={() => setShowInfo(false)}>{t('Понятно', 'Tushunarli', 'Got it')}</button>
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
