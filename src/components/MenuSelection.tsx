import { useState, useMemo, useRef } from 'react'
import { dataStore } from '../services/dataStore'
import type { MenuItem, OrderItem, Table } from '../data/types'
import { MenuIcon, FoodIcon, TableIcon, UserIcon } from './Icons'
import MarkingModal from './MarkingModal'
import DraftPourModal from './DraftPourModal'
import { useT } from '../i18n'
import { isNativeMobile } from '../services/capacitor'
import { scanCode } from '../services/qrScanner'

const MENU_KEY = 'pos_v2_menu'
const GOODS_KEY = 'pos_v2_stock_goods'
const CAT_KEY = 'pos_v2_menu_categories'

export function loadMenu(): MenuItem[] {
  try {
    const raw = dataStore.getItem(MENU_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function loadAllCategories(): string[] {
  const fromMenu = new Set<string>()
  const items = loadMenu()
  items.forEach(m => { if (m.category) fromMenu.add(m.category) })
  try {
    const raw = dataStore.getItem(CAT_KEY)
    if (raw) {
      const extra = JSON.parse(raw)
      if (Array.isArray(extra)) extra.forEach((c: string) => fromMenu.add(c))
    }
  } catch {}
  const ordered: string[] = ['Все']
  const seen = new Set<string>(ordered)
  for (const c of fromMenu) { if (!seen.has(c)) { seen.add(c); ordered.push(c) } }
  return ordered
}

function loadGoodsBarcodeMap(): Record<string, string> {
  try {
    const raw = dataStore.getItem(GOODS_KEY)
    const goods = raw ? JSON.parse(raw) : []
    const map: Record<string, string> = {}
    for (const g of goods) {
      if (g.barcode) map[g.barcode] = g.name
    }
    return map
  } catch { return {} }
}

function loadDraftStockMap(): Record<number, { quantity: number; draftLiters: number }> {
  try {
    const raw = dataStore.getItem(GOODS_KEY)
    const goods = raw ? JSON.parse(raw) : []
    const map: Record<number, { quantity: number; draftLiters: number }> = {}
    for (const g of goods) {
      if (g.draft && g.goodsId != null) {
        map[g.goodsId] = { quantity: Number(g.quantity) || 0, draftLiters: Number(g.draftLiters) || 1 }
      }
    }
    return map
  } catch { return {} }
}

interface MenuSelectionProps {
  selectedTable: Table | null
  onContinue: (items: OrderItem[]) => void
  onBack?: () => void
  initialSelected?: Set<number>
  existingItems?: OrderItem[]
  embed?: boolean
  selected?: Set<number>
  onSelectedChange?: (s: Set<number>) => void
  onMarked?: (itemId: number, code: string) => void
  markedCodes?: Record<number, string[]>
  onPoured?: (itemId: number, liters: number) => void
  tableInfo?: { tableName: string; guestCount: number; staffName: string; openTime: string }
}

export default function MenuSelection({ onContinue, onBack, initialSelected, existingItems, embed, selected: controlledSelected, onSelectedChange, onMarked, markedCodes, onPoured, tableInfo }: MenuSelectionProps) {
  const t = useT()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Все')
  const [internalSelected, setInternalSelected] = useState<Set<number>>(initialSelected || new Set())
  const [markingFor, setMarkingFor] = useState<MenuItem | null>(null)
  const [pourFor, setPourFor] = useState<{ item: MenuItem; code: string } | null>(null)
  const [poured, setPoured] = useState<Record<number, number>>({})
  const [markCodes, setMarkCodes] = useState<Record<number, string[]>>({})
  const [scanning, setScanning] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const scanBuf = useRef('')
  const scanTimer = useRef<number | null>(null)
  const barcodeMap = useMemo(() => loadGoodsBarcodeMap(), [])
  const draftStockMap = useMemo(() => loadDraftStockMap(), [])

  const isControlled = controlledSelected !== undefined
  const selected = isControlled ? controlledSelected : internalSelected

  const menuItems = useMemo(() => loadMenu(), [])

  const filtered = menuItems.filter(item => {
    const matchCategory = activeCategory === 'Все' || item.category === activeCategory
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    return matchCategory && matchSearch
  })

  const comboItems = menuItems.filter(item => item.category === 'Комбо')

  const existingCodes = useMemo(() => {
    if (!markingFor) return []
    const set = new Set<string>()
    for (const c of (markCodes[markingFor.id] || [])) set.add(c)
    for (const c of (markedCodes?.[markingFor.id] || [])) set.add(c)
    for (const it of (existingItems || [])) {
      if (it.menuItem.id === markingFor.id) for (const c of (it.markCodes || [])) set.add(c)
    }
    return [...set]
  }, [markingFor, markCodes, markedCodes, existingItems])

  function applyScannedCode(code: string) {
    const c = code.trim()
    if (!c) return
    if (barcodeMap[c]) {
      const name = barcodeMap[c]
      const match = menuItems.find(m => m.name === name)
      if (match) {
        setSearch(name)
        setActiveCategory(match.category)
        handleToggleItem(match)
        return
      }
    }
    setSearch(c)
  }

  async function handleCameraScan() {
    if (scanning) return
    setScanning(true)
    try {
      const code = await scanCode()
      if (code) applyScannedCode(code)
    } catch {
      // User cancelled or no camera — keep the search as-is.
    } finally {
      setScanning(false)
    }
  }

  function handleToggleItem(item: MenuItem, skipMarking = false) {
    if (!selected.has(item.id) && item.mxikMarking && !skipMarking) {
      setMarkingFor(item)
      return
    }
    const next = new Set(selected)
    if (next.has(item.id)) {
      next.delete(item.id)
    } else {
      next.add(item.id)
    }
    if (isControlled) onSelectedChange?.(next)
    else setInternalSelected(next)
  }

  function handleContinue() {
    const existingMap = new Map(existingItems?.map(e => [e.menuItem.id, e]) || [])
    const dishItems: OrderItem[] = menuItems
      .filter(item => selected.has(item.id))
      .map((item, idx) => {
        const existing = existingMap.get(item.id)
        const qty = item.draft
          ? (existing ? existing.quantity : (poured[item.id] || 0))
          : (existing ? existing.quantity : 1)
        return {
          id: existing ? existing.id : idx + 1,
          menuItem: item,
          quantity: qty,
          unitPrice: item.price,
          total: item.draft ? Math.round(item.price * qty / (item.draftLiters || 1)) : item.price * qty,
          markCodes: item.mxikMarking ? (markCodes[item.id] || []) : undefined,
        }
      })
    const addonItems = (existingItems || []).filter(e => e.menuItem.category === 'Добавка')
    onContinue([...dishItems, ...addonItems])
  }

  const totalSelected = selected.size

  return (
    <div className="screen menu-screen">
      <div className="screen-header menu-screen-header">
        {!embed && (
          <h1 className="screen-title">
            <MenuIcon />
            {t('Меню', 'Menyu', 'Menu')}
          </h1>
        )}
        {embed && tableInfo && (
          <div className="menu-title-wrap">
            <div className="menu-table-info">
            <div className="menu-table-info-row">
              <TableIcon />
              <span className="menu-table-info-label">{t('Стол:', 'Stol:', 'Table:')}</span>
              <span className="menu-table-info-value">{tableInfo.tableName}</span>
            </div>
            <div className="menu-table-info-row">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className="menu-table-info-label">{t('Гости:', 'Mehmonlar:', 'Guests:')}</span>
              <span className="menu-table-info-value">{tableInfo.guestCount}</span>
            </div>
            <div className="menu-table-info-row">
              <UserIcon />
              <span className="menu-table-info-label">{t('Официант:', 'Ofitsiant:', 'Waiter:')}</span>
              <span className="menu-table-info-value">{tableInfo.staffName}</span>
            </div>
            <div className="menu-table-info-row">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="menu-table-info-label">{t('Время:', 'Vaqt:', 'Time:')}</span>
              <span className="menu-table-info-value">{tableInfo.openTime || '—'}</span>
            </div>
            </div>
          </div>
        )}
        <div className="menu-header-btns">
          {!embed && onBack && (
            <button className="menu-header-btn back" onClick={onBack}>{t('Назад', 'Orqaga', 'Back')}</button>
          )}
          {!embed && (
            <button
              className={`menu-header-btn continue${totalSelected === 0 ? ' disabled' : ''}`}
              onClick={handleContinue}
              disabled={totalSelected === 0}
            >
              {t('Продолжить', 'Davom etish', 'Continue')}
            </button>
          )}
        </div>
      </div>

      <div className="menu-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={searchRef}
          type="text"
          placeholder={t('Поиск...', 'Qidirish...', 'Search...')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (scanning) {
              if (e.key === 'Enter') {
                const code = scanBuf.current.trim()
                scanBuf.current = ''
                if (scanTimer.current) clearTimeout(scanTimer.current)
                setScanning(false)
                applyScannedCode(code)
                return
              }
              if (e.key.length === 1) {
                scanBuf.current += e.key
              }
              if (scanTimer.current) clearTimeout(scanTimer.current)
              scanTimer.current = window.setTimeout(() => {
                scanBuf.current = ''
                setScanning(false)
              }, 100)
            }
          }}
        />
        <button
          className={`menu-scanner-btn${scanning ? ' active' : ''}`}
          title={t('Сканировать штрих-код', 'Shtrix-kodni skanerlash', 'Scan barcode')}
          onClick={() => {
            // On Android open the camera scanner (QR / barcode / DataMatrix).
            if (isNativeMobile()) { void handleCameraScan(); return }
            if (scanning) {
              setScanning(false)
              scanBuf.current = ''
              if (scanTimer.current) clearTimeout(scanTimer.current)
            } else {
              setScanning(true)
              scanBuf.current = ''
              searchRef.current?.focus()
            }
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="12" x2="17" y2="12" />
          </svg>
        </button>
      </div>

      <div className="menu-categories">
        {loadAllCategories().map(cat => (
          <button
            key={cat}
            className={`menu-cat-btn${activeCategory === cat ? ' active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat === 'Все' ? t('Все', 'Barchasi', 'All') : cat}
          </button>
        ))}
      </div>

      <div className="menu-grid">
        {filtered.map(item => {
          const isSel = selected.has(item.id)
          return (
            <div key={item.id} className={`menu-card${isSel ? ' menu-card-selected' : ''}`}>
              {isSel && (
                <span className="menu-card-check">✓</span>
              )}
              <div className="menu-card-img">
                {item.photo ? <img src={item.photo} alt={item.name} className="menu-card-photo" /> : <FoodIcon name={item.name} />}
              </div>
              <div className="menu-card-body">
                <span className="menu-card-name">{item.name}</span>
                <span className="menu-card-price">{item.price.toLocaleString()} {t('сум', 'so\'m', 'sum')}</span>
                <button
                  className={`menu-card-add-btn${isSel ? ' selected' : ''}`}
                  onClick={() => handleToggleItem(item)}
                  title={isSel ? t('Убрать', 'Olib tashlash', 'Remove') : t('Добавить', 'Qo\'shish', 'Add')}
                >
                  <span className="add-btn-icon">+</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {comboItems.length > 0 && (
        <div className="menu-combo-section">
          <h3 className="combo-title">{t('Комбо-предложения', 'Kombo takliflar', 'Combo offers')}</h3>
          <div className="combo-scroll">
            {comboItems.map(item => {
              const isSel = selected.has(item.id)
              return (
                <div key={item.id} className={`combo-card${isSel ? ' combo-card-selected' : ''}`}>
                  {isSel && (
                    <span className="menu-card-check">✓</span>
                  )}
                  <div className="combo-card-img">
                    {item.photo ? <img src={item.photo} alt={item.name} className="menu-card-photo" /> : <FoodIcon name={item.name} />}
                  </div>
                  <div className="combo-card-body">
                    <span className="combo-card-name">{item.name}</span>
                    <span className="combo-card-price">{item.price.toLocaleString()} {t('сум', 'so\'m', 'sum')}</span>
                    <button
                      className={`menu-card-add-btn${isSel ? ' selected' : ''}`}
                      onClick={() => handleToggleItem(item)}
                      title={isSel ? t('Убрать', 'Olib tashlash', 'Remove') : t('Добавить', 'Qo\'shish', 'Add')}
                    >
                      <span className="add-btn-icon">+</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {markingFor && (
        <MarkingModal
          itemName={markingFor.name}
          existingCodes={existingCodes}
          allowDuplicates={!!markingFor.draft}
          onCancel={() => setMarkingFor(null)}
          onConfirm={(code) => {
            if (markingFor.draft) {
              setPourFor({ item: markingFor, code })
              setMarkingFor(null)
              return
            }
            onMarked?.(markingFor.id, code)
            setMarkCodes(prev => ({ ...prev, [markingFor.id]: [...(prev[markingFor.id] || []), code] }))
            handleToggleItem(markingFor, true)
            setMarkingFor(null)
          }}
        />
      )}
      {pourFor && (
        <DraftPourModal
          itemName={pourFor.item.name}
          containerLiters={pourFor.item.draftLiters || 1}
          bottlePrice={pourFor.item.price}
          availableLiters={draftStockMap[pourFor.item.goodsId || -1]?.quantity ?? -1}
          onCancel={() => setPourFor(null)}
          onConfirm={(liters) => {
            onMarked?.(pourFor.item.id, pourFor.code)
            onPoured?.(pourFor.item.id, liters)
            setPoured(prev => ({ ...prev, [pourFor.item.id]: liters }))
            setMarkCodes(prev => ({ ...prev, [pourFor.item.id]: [...(prev[pourFor.item.id] || []), pourFor.code] }))
            handleToggleItem(pourFor.item, true)
            setPourFor(null)
          }}
        />
      )}
    </div>
  )
}
