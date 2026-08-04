import { useState, useMemo, useRef } from 'react'
import type { MenuItem, OrderItem, Table } from '../data/types'
import { MenuIcon, FoodIcon } from './Icons'
import MarkingModal from './MarkingModal'
import { useT } from '../i18n'

const MENU_KEY = 'pos_v2_menu'
const GOODS_KEY = 'pos_v2_stock_goods'
const CAT_KEY = 'pos_v2_menu_categories'

function loadMenu(): MenuItem[] {
  try {
    const raw = localStorage.getItem(MENU_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function loadAllCategories(): string[] {
  const fromMenu = new Set<string>()
  const items = loadMenu()
  items.forEach(m => { if (m.category) fromMenu.add(m.category) })
  try {
    const raw = localStorage.getItem(CAT_KEY)
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
    const raw = localStorage.getItem(GOODS_KEY)
    const goods = raw ? JSON.parse(raw) : []
    const map: Record<string, string> = {}
    for (const g of goods) {
      if (g.barcode) map[g.barcode] = g.name
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
}

export default function MenuSelection({ onContinue, onBack, initialSelected, existingItems }: MenuSelectionProps) {
  const t = useT()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Все')
  const [selected, setSelected] = useState<Set<number>>(initialSelected || new Set())
  const [markingFor, setMarkingFor] = useState<MenuItem | null>(null)
  const [markCodes, setMarkCodes] = useState<Record<number, string[]>>({})
  const [scanning, setScanning] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const scanBuf = useRef('')
  const scanTimer = useRef<number | null>(null)
  const barcodeMap = useMemo(() => loadGoodsBarcodeMap(), [])

  const menuItems = useMemo(() => loadMenu(), [])

  const filtered = menuItems.filter(item => {
    const matchCategory = activeCategory === 'Все' || item.category === activeCategory
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    return matchCategory && matchSearch
  })

  const comboItems = menuItems.filter(item => item.category === 'Комбо')

  function handleToggleItem(item: MenuItem, skipMarking = false) {
    if (!selected.has(item.id) && item.mxikMarking && !skipMarking) {
      setMarkingFor(item)
      return
    }
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(item.id)) {
        next.delete(item.id)
      } else {
        next.add(item.id)
      }
      return next
    })
  }

  function handleContinue() {
    const existingMap = new Map(existingItems?.map(e => [e.menuItem.id, e]) || [])
    const items: OrderItem[] = menuItems
      .filter(item => selected.has(item.id))
      .map((item, idx) => {
        const existing = existingMap.get(item.id)
        const qty = existing ? existing.quantity : 1
        return {
          id: existing ? existing.id : idx + 1,
          menuItem: item,
          quantity: qty,
          unitPrice: item.price,
          total: item.price * qty,
          markCodes: item.mxikMarking ? (markCodes[item.id] || []) : undefined,
        }
      })
    onContinue(items)
  }

  const totalSelected = selected.size

  return (
    <div className="screen menu-screen">
      <div className="screen-header">
        <h1 className="screen-title">
          <MenuIcon />
          {t('Меню и выбор блюд', 'Menyu va taomlar tanlash')}
        </h1>
        <div className="menu-header-btns">
          {onBack && (
            <button className="menu-header-btn back" onClick={onBack}>{t('Назад', 'Orqaga')}</button>
          )}
          <button
            className={`menu-header-btn continue${totalSelected === 0 ? ' disabled' : ''}`}
            onClick={handleContinue}
            disabled={totalSelected === 0}
          >
            {t('Продолжить', 'Davom etish')}
          </button>
        </div>
      </div>

      <div className="menu-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={searchRef}
          type="text"
          placeholder={t('Поиск...', 'Qidirish...')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (scanning) {
              if (e.key === 'Enter') {
                const code = scanBuf.current.trim()
                scanBuf.current = ''
                if (scanTimer.current) clearTimeout(scanTimer.current)
                setScanning(false)
                if (code && barcodeMap[code]) {
                  const name = barcodeMap[code]
                  const match = menuItems.find(m => m.name === name)
                  if (match) {
                    setSearch(name)
                    setActiveCategory(match.category)
                    handleToggleItem(match)
                  }
                }
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
          title={t('Сканировать штрих-код', 'Shtrix-kodni skanerlash')}
          onClick={() => {
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
            {cat === 'Все' ? t('Все', 'Barchasi') : cat}
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
                <span className="menu-card-price">{item.price.toLocaleString()} {t('сум', 'so\'m')}</span>
                <button
                  className={`menu-card-add-btn${isSel ? ' selected' : ''}`}
                  onClick={() => handleToggleItem(item)}
                  title={isSel ? t('Убрать', 'Olib tashlash') : t('Добавить', 'Qo\'shish')}
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
          <h3 className="combo-title">{t('Комбо-предложения', 'Kombo takliflar')}</h3>
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
                    <span className="combo-card-price">{item.price.toLocaleString()} {t('сум', 'so\'m')}</span>
                    <button
                      className={`menu-card-add-btn${isSel ? ' selected' : ''}`}
                      onClick={() => handleToggleItem(item)}
                      title={isSel ? t('Убрать', 'Olib tashlash') : t('Добавить', 'Qo\'shish')}
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
          onCancel={() => setMarkingFor(null)}
          onConfirm={(code) => {
            setMarkCodes(prev => ({ ...prev, [markingFor.id]: [...(prev[markingFor.id] || []), code] }))
            handleToggleItem(markingFor, true)
            setMarkingFor(null)
          }}
        />
      )}
    </div>
  )
}
