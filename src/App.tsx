import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import Login from './Login'
import PinScreen from './PinScreen'
import MobileConnect from './components/MobileConnect'
import Layout from './components/Layout'
import TableMap from './components/TableMap'
import MenuSelection from './components/MenuSelection'
import OrderWindow from './components/OrderWindow'
import SendToKitchen from './components/SendToKitchen'
import WaiterMenu from './components/WaiterMenu'
import WaiterOrders from './components/WaiterOrders'
import { buildKitchenItems } from './utils/kitchenItems'
import { isOrderOwnedBy, migrateOrderOwners, orderOwnerForSave } from './utils/orderOwnership'

import OrderHistory from './components/OrderHistory'
import AdminDashboard from './components/AdminDashboard'
import AdminBranches from './components/AdminBranches'
import AdminTables from './components/AdminTables'
import AdminRoles from './components/AdminRoles'
import AdminHistory from './components/AdminHistory'
import AdminMenu from './components/AdminMenu'
import AdminStock from './components/AdminStock'
import AdminIngredients from './components/AdminIngredients'
import { deductIngredientStock } from './services/ingredients'
import AdminSettings from './components/AdminSettings'
import AdminModifiers from './components/AdminModifiers'
import AdminReports from './components/AdminReports'
import AdminShift from './components/AdminShift'
import AdminSupport from './components/AdminSupport'
import FiscalModule from './components/FiscalModule'
import { cabinetShiftId } from './services/receiptSync'
import { syncCabinetShifts, type ShiftCabinetStatus } from './services/shiftSync'

import PaymentPrecheck from './components/PaymentPrecheck'
import BookingModal from './components/BookingModal'
import CashierPayment from './components/CashierPayment'
import type { CashierPaymentData } from './components/CashierPayment'
import CheckReceipt from './components/CheckReceipt'
import Profile from './components/Profile'
import { UpdaterProvider, UpdateModals } from './updater'
import { initNetwork, reconnectNetwork, waitForNetworkConfig, waitForNetworkSocket, useNetworkStore } from './services/networkSocket'
import { isNativeMobile } from './services/capacitor'
import { mobileConnection, saveMobileConnection } from './services/mobileConnection'
import { getMobileSyncState, resetMobileData, subscribeMobileSync } from './services/dataStore'
import { dataStore } from './services/dataStore'
import { useT, tr, locale } from './i18n'
import type { Screen, Table, OrderItem, KitchenItem, HistoryEntry, TableOrderData, TableBookingData } from './data/types'
import { MOCK_ORDER, MOCK_TABLES } from './data/mockData'

interface Staff {
  id: number
  name: string
  pin: string
  role: string
  phone?: string
}

const LOADING_STEPS: [string, string, string][] = [
  ['Инициализация...', 'Ishga tushirilmoqda...', 'Initializing...'],
  ['Загрузка базы данных...', 'Ma\'lumotlar bazasi yuklanmoqda...', 'Loading database...'],
  ['Загрузка меню...', 'Menyu yuklanmoqda...', 'Loading menu...'],
  ['Подключение к серверу...', 'Serverga ulanmoqda...', 'Connecting to server...'],
  ['Синхронизация данных...', 'Ma\'lumotlar sinxronlanmoqda...', 'Syncing data...'],
  ['Запуск приложения...', 'Ilova ishga tushirilmoqda...', 'Starting application...'],
]

const LOCAL_STORES: { key: string; fallback: unknown }[] = [
  { key: 'pos_v2_tables', fallback: MOCK_TABLES },
  { key: 'pos_v2_history', fallback: [] },
  { key: 'pos_v2_tableOrders', fallback: {} },
  { key: 'pos_v2_kitchen_sent', fallback: {} },
  { key: 'pos_v2_tableBookings', fallback: {} },
  { key: 'pos_v2_shiftByStaff', fallback: {} },
  { key: 'pos_v2_roles', fallback: [] },
  { key: 'pos_v2_branches', fallback: [] },
]

const MENU_STORES: { key: string; fallback: unknown }[] = [
  { key: 'pos_v2_menu', fallback: [] },
  { key: 'pos_v2_stock_goods', fallback: [] },
  { key: 'pos_v2_menu_categories', fallback: [] },
  { key: 'pos_v2_modifier_groups', fallback: [] },
]

async function loadStores(stores: { key: string; fallback: unknown }[]): Promise<void> {
  for (const { key, fallback } of stores) {
    try {
      const raw = dataStore.getItem(key)
      if (!raw) continue
      JSON.parse(raw)
    } catch {
      dataStore.setItem(key, JSON.stringify(fallback))
    }
  }
}

async function waitForBackend(timeoutMs = 12000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch('/api/internet-check', { signal: AbortSignal.timeout(1500) })
      if (res.ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 300))
  }
}

const SESSION_KEY = 'pos_v2_session'

function App() {
  const t = useT()
  const netState = useNetworkStore()
  const mobileSync = useSyncExternalStore(subscribeMobileSync, getMobileSyncState)
  const [status, setStatus] = useState(t(LOADING_STEPS[0][0], LOADING_STEPS[0][1], LOADING_STEPS[0][2]))
  const [progress, setProgress] = useState(10)
  const [ready, setReady] = useState(false)
  const [phase, setPhase] = useState<'loading' | 'connect' | 'login' | 'pin' | 'app'>('loading')
  const [staff, setStaff] = useState<Staff | null>(null)
  const [currentScreen, setCurrentScreen] = useState<Screen>('tables')
  const [reportsPreset, setReportsPreset] = useState<{ from: string; to: string; key: number } | null>(null)

  const openShiftChecks = (shift: { openTime: string; closeTime: string }) => {
    const src = (shift.openTime && shift.openTime !== '—' ? shift.openTime : shift.closeTime) || ''
    const parts = src.split(' ')[0].split('.')
    let from = ''
    if (parts.length === 3) from = `${parts[2]}-${parts[1]}-${parts[0]}`
    setReportsPreset({ from, to: from, key: Date.now() })
    setCurrentScreen('admin_reports')
  }
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [menuEntry, setMenuEntry] = useState(false)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [changingTable, setChangingTable] = useState(false)
  const [tableOrders, setTableOrders] = useState<Record<number, TableOrderData>>(() => {
    try { return JSON.parse(dataStore.getItem('pos_v2_tableOrders') || '{}') } catch { return {} }
  })
  const [kitchenSent, setKitchenSent] = useState<Record<number, { menuItemId: number; quantity: number }[]>>(() => {
    try { return JSON.parse(dataStore.getItem('pos_v2_kitchen_sent') || '{}') } catch { return {} }
  })
  const [tables, setTables] = useState<Table[]>(() => {
    try { return JSON.parse(dataStore.getItem('pos_v2_tables') || 'null') || MOCK_TABLES } catch { return MOCK_TABLES }
  })
  const [tableBookings, setTableBookings] = useState<Record<number, TableBookingData>>(() => {
    try { return JSON.parse(dataStore.getItem('pos_v2_tableBookings') || '{}') } catch { return {} }
  })
  const [reservingMode, setReservingMode] = useState(false)
  const [bookingModalTable, setBookingModalTable] = useState<Table | null>(null)
  const [orderComment, setOrderComment] = useState('')
  const [orderTags, setOrderTags] = useState<string[]>([])
  const [orderModifiers, setOrderModifiers] = useState<string[]>([])
  const [orderGuestCount, setOrderGuestCount] = useState(1)
  const [orderOpenTime, setOrderOpenTime] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [cashierPaymentData, setCashierPaymentData] = useState<CashierPaymentData | null>(null)
  const [cpServicePercent, setCpServicePercent] = useState(0)
  const [cpDiscountType, setCpDiscountType] = useState<'percent' | 'amount'>('percent')
  const [cpDiscountPercent, setCpDiscountPercent] = useState(0)
  const [cpDiscountAmount, setCpDiscountAmount] = useState(0)
  const [cpSelectedMethod, setCpSelectedMethod] = useState<'cash' | 'card' | 'click' | null>(null)
  const [cpSplitAmounts, setCpSplitAmounts] = useState<{ cash: number; card: number; click: number } | null>(null)
  const prevTableId = useRef<number | null>(null)

  useEffect(() => {
    if (selectedTable && prevTableId.current !== null && prevTableId.current !== selectedTable.id) {
      setCpServicePercent(0)
      setCpDiscountType('percent')
      setCpDiscountPercent(0)
      setCpDiscountAmount(0)
      setCpSelectedMethod(null)
      setCpSplitAmounts(null)
    }
    if (selectedTable) prevTableId.current = selectedTable.id
  }, [selectedTable])

  const userRole = staff?.role || 'waiter'
  const shiftKey = staff ? String(staff.id) : userRole

  interface ShiftState {
    active: boolean
    startTime: string
    endTime: string
    ending: boolean
    number: number
    sales: number
    served: number
  }
  const defaultShift: ShiftState = { active: false, startTime: '—', endTime: '—', ending: false, number: 0, sales: 0, served: 0 }
  const [shiftByStaff, setShiftByStaff] = useState<Record<string, ShiftState>>(() => {
    try { return JSON.parse(dataStore.getItem('pos_v2_shiftByStaff') || '{}') } catch { return {} }
  })

  function getShift(key: string): ShiftState {
    return shiftByStaff[key] || defaultShift
  }

  const currentShift = getShift(shiftKey)
  const shiftActive = currentShift.active
  const shiftStartTime = currentShift.startTime
  const shiftEndTime = currentShift.endTime
  const shiftEnding = currentShift.ending
  const shiftNumber = currentShift.number || 0
  const shiftNumberStr = String(Math.max(1, shiftNumber)).padStart(3, '0')

  function updateShift(key: string, update: Partial<ShiftState>) {
    setShiftByStaff(prev => ({ ...prev, [key]: { ...(prev[key] || defaultShift), ...update } }))
  }

  const bumpShiftStat = useCallback((key: string, stat: 'sales' | 'served', by: number) => {
    setShiftByStaff(prev => {
      const cur = prev[key] || defaultShift
      return { ...prev, [key]: { ...cur, [stat]: cur[stat] + by } }
    })
  }, [])

  const [shiftEndRedirectKey, setShiftEndRedirectKey] = useState<string | null>(null)

  interface ShiftLogEntry {
    id?: string
    number: number
    receiptShiftNumber?: string
    cashierName: string
    userId?: number
    openTime: string
    closeTime: string
    sales: number
    served: number
    cabinetStatus?: ShiftCabinetStatus
    cabinetError?: string
    cabinetSyncedAt?: string
  }
  const [shiftLog, setShiftLog] = useState<ShiftLogEntry[]>(() => {
    try { return JSON.parse(dataStore.getItem('pos_v2_shift_log') || '[]') } catch { return [] }
  })
  function appendShiftLog(entry: ShiftLogEntry) {
    let current: ShiftLogEntry[] = []
    try { current = JSON.parse(dataStore.getItem('pos_v2_shift_log') || '[]') } catch {}
    dataStore.setItem('pos_v2_shift_log', JSON.stringify([...current, entry]))
  }

  // Track avans check printed per table
  const [avansPrintedSet, setAvansPrintedSet] = useState<Set<number>>(new Set())
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(dataStore.getItem('pos_v2_history') || '[]') } catch { return [] }
  })


  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  const showCashierSent = useCallback(() => {
    if (!isNativeMobile()) { showToast(tr('Чек отправлен на кассу', 'Chek kassaga yuborildi', 'Order sent to cashier')); return }
    if (!mobileConnection().host) { showToast(tr('Заказ сохранён локально', 'Buyurtma mahalliy saqlandi', 'Order saved locally')); return }
    // React persists the order and table status in effects after this event.
    setTimeout(() => {
      const check = () => {
        const state = getMobileSyncState()
        if (state.error) { showToast(state.error); return }
        if (state.pending) { setTimeout(check, 500); return }
        showToast(tr('Чек отправлен на кассу', 'Chek kassaga yuborildi', 'Order sent to cashier'))
      }
      check()
    }, 350)
  }, [showToast])

  const saveCurrentOrder = useCallback(() => {
    if (selectedTable && staff) {
      setTableOrders(prev => {
        const saved = prev[selectedTable.id]
        if (staff.role === 'waiter' && saved && saved.items.length > 0
          && !isOrderOwnedBy(saved, staff.id)) return prev
        return { ...prev, [selectedTable.id]: {
          items: orderItems, comment: orderComment, tags: orderTags, modifiers: orderModifiers,
          guestCount: orderGuestCount, openTime: orderOpenTime,
          ...(orderItems.length > 0 ? orderOwnerForSave(saved, staff) : {}),
        } }
      })
    }
  }, [selectedTable, orderItems, orderComment, orderTags, orderModifiers, orderGuestCount, orderOpenTime, staff])

  const canAccessOrder = useCallback((tableId: number) => {
    if (userRole !== 'waiter' || isOrderOwnedBy(tableOrders[tableId], staff?.id)) return true
    showToast(tr('Доступны только ваши заказы', 'Faqat o\'zingizning buyurtmalaringiz mavjud', 'Only your own orders are available'))
    return false
  }, [userRole, tableOrders, staff?.id, showToast])

  function formatOpenTime(): string {
    return new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  }

  const loadTableOrder = useCallback((table: Table) => {
    const saved = tableOrders[table.id]
    if (saved) {
      setOrderItems(saved.items)
      setOrderComment(saved.comment)
      setOrderTags(saved.tags)
      setOrderModifiers(saved.modifiers)
      setOrderGuestCount(saved.guestCount || 1)
      setOrderOpenTime(saved.openTime || formatOpenTime())
    } else {
      setOrderItems([])
      setOrderComment('')
      setOrderTags([])
      setOrderModifiers([])
      setOrderGuestCount(1)
      setOrderOpenTime(formatOpenTime())
    }
  }, [tableOrders])

  const handleNavigate = useCallback((screen: Screen) => {
    if (screen === 'menu') {
      setSelectedTable(null)
      setMenuEntry(true)
      setCurrentScreen('tables')
      showToast(tr('Сначала выберите стол', 'Avval stolni tanlang', 'Please select a table first'))
      return
    }
    if (screen === 'tables') setMenuEntry(false)
    setCurrentScreen(screen)
  }, [showToast])

  const handleSelectTable = useCallback((table: Table) => {
    if (!shiftActive) {
      showToast(tr('Сначала начните смену в профиле', 'Avval profilingizda smenani boshlang', 'Please start your shift in Profile first'))
      return
    }
    const saved = tableOrders[table.id]
    if (userRole === 'waiter' && saved && saved.items.length > 0
      && !canAccessOrder(table.id)) return
    if (table.status === 'reserved') {
      loadTableOrder(table)
      setSelectedTable(table)
      setCurrentScreen(userRole === 'waiter' ? 'menu' : 'order')
      return
    }
    if (userRole === 'cashier') {
      if (table.status !== 'payment_pending') {
        showToast(tr('Доступны только столы со статусом Ожидает оплаты', 'Faqat To\'lov kutilmoqda holatidagi stollar mavjud', 'Only tables with \'Awaiting payment\' status are available'))
        return
      }
      loadTableOrder(table)
      setSelectedTable(table)
      setCurrentScreen('menu')
      return
    }
    if (userRole === 'waiter') {
      if (table.status !== 'free') {
        showToast(tr('Заказ и оплата стола — во вкладке «Заказы»', 'Stol buyurtmasi va to\'lovi — «Buyurtmalar» bo\'limida', 'Order and payment for the table — in the "Orders" tab'))
        return
      }
      setKitchenSent(prev => {
        if (!(table.id in prev)) return prev
        const next = { ...prev }
        delete next[table.id]
        return next
      })
      loadTableOrder(table)
      setSelectedTable(table)
      setCurrentScreen('menu')
      return
    }
    if (table.status === 'payment_pending') {
      return
    }
    if (table.status === 'ordered' || table.status === 'occupied') {
      loadTableOrder(table)
      setSelectedTable(table)
      setCurrentScreen('payment')
      return
    }
    if (changingTable) {
      if (prevTableId.current !== null && prevTableId.current !== table.id) {
        setKitchenSent(prev => { const next = { ...prev }; delete next[prevTableId.current!]; return next })
      }
      setTableOrders(prev => ({ ...prev, [table.id]: {
        items: orderItems, comment: orderComment, tags: orderTags, modifiers: orderModifiers,
        guestCount: orderGuestCount, openTime: orderOpenTime,
        ...(staff ? orderOwnerForSave(selectedTable ? prev[selectedTable.id] : undefined, staff) : {}),
      } }))
      setSelectedTable(table)
      setChangingTable(false)
      setCurrentScreen(userRole === 'waiter' ? 'menu' : 'order')
      return
    }
    setKitchenSent(prev => {
      if (!(table.id in prev)) return prev
      const next = { ...prev }
      delete next[table.id]
      return next
    })
    loadTableOrder(table)
    setSelectedTable(table)
    setCurrentScreen('menu')
  }, [changingTable, shiftActive, showToast, loadTableOrder, userRole, orderItems, orderComment, orderTags, orderModifiers, orderGuestCount, orderOpenTime, menuEntry, tableOrders, canAccessOrder, staff, selectedTable])

  const handleContinueToOrder = useCallback((items: OrderItem[]) => {
    setOrderItems(items)
    setCurrentScreen('order')
  }, [])

  function getStockFactor(unit: string): number {
    if (!unit) return 1
    const eqIdx = unit.indexOf('=')
    if (eqIdx === -1) return 1
    const after = unit.slice(eqIdx + 1).trim()
    const match = after.match(/^([\d.]+)/)
    return match ? parseFloat(match[1]) || 1 : 1
  }

  function decrementStock(orderItemsList: typeof orderItems, mods: string[]) {
    try {
      const raw = dataStore.getItem('pos_v2_stock_goods')
      if (!raw) return
      const goods: any[] = JSON.parse(raw)
      let changed = false

      for (const item of orderItemsList) {
        const name = item.menuItem.name.toLowerCase()
        for (const g of goods) {
          if (g.name && g.name.toLowerCase() === name) {
            if (!g.unlimited && g.quantity != null) {
              const factor = getStockFactor(g.unit)
              const amount = g.draft ? item.quantity : item.quantity * factor
              g.quantity = Math.max(0, Math.round((g.quantity - amount) * 1000) / 1000)
              changed = true
            }
            break
          }
        }
      }

      let manualMods = mods
      try {
        const groupsRaw = dataStore.getItem('pos_v2_modifier_groups')
        const groups: { label: string; options: string[] }[] = groupsRaw ? JSON.parse(groupsRaw) : []
        const addonNames = new Set(groups.filter(g => g.label === 'Добавка').flatMap(g => g.options || []))
        manualMods = mods.filter(m => !addonNames.has(m))
      } catch {}

      for (const mod of manualMods) {
        const key = mod.toLowerCase()
        for (const g of goods) {
          if (g.name && g.name.toLowerCase() === key && g.type === 'additive') {
            if (!g.unlimited && g.quantity != null) {
              const factor = getStockFactor(g.unit)
              g.quantity = Math.max(0, g.quantity - factor)
              changed = true
            }
            break
          }
        }
      }

      if (changed) dataStore.setItem('pos_v2_stock_goods', JSON.stringify(goods))
    } catch {}
  }

  const handlePrint = useCallback((printed?: KitchenItem[]) => {
    showToast(tr('Чек отправился на кухню', 'Chek oshxonaga yuborildi', 'Order sent to kitchen'))
    if (selectedTable) {
      saveCurrentOrder()
      if (printed && printed.length > 0) {
        setKitchenSent(prev => {
          const map = new Map((prev[selectedTable.id] || []).map(p => [p.menuItemId, p.quantity]))
          for (const it of printed) {
            if (it.menuItemId != null) map.set(it.menuItemId, (map.get(it.menuItemId) || 0) + it.quantity)
          }
          return { ...prev, [selectedTable.id]: Array.from(map.entries()).map(([menuItemId, quantity]) => ({ menuItemId, quantity })) }
        })
      }
      setTables(prev => prev.map(t =>
        t.id === selectedTable.id ? { ...t, status: 'ordered' as const } : t
      ))
    }
    setCurrentScreen('tables')
  }, [selectedTable, showToast, saveCurrentOrder])

  const handleCancelOrder = useCallback(() => {
    if (!selectedTable) return
    if (selectedTable.status === 'occupied' || selectedTable.status === 'payment_pending') {
      showToast(tr('Доставленный заказ нельзя отменить', 'Yetkazilgan buyurtmani bekor qilib bo\'lmaydi', 'A delivered order cannot be cancelled'))
      return
    }

    const tableId = selectedTable.id
    const saved = tableOrders[tableId]
    const items = orderItems.length > 0 ? orderItems : (saved?.items || [])

    if (selectedTable.status === 'ordered' && items.length > 0) {
      const now = new Date()
      const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
      const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      setHistory(prev => [{
        id: Date.now().toString(),
        tableId,
        tableName: selectedTable.name,
        zone: selectedTable.zone,
        timestamp: `${dateStr} ${timeStr}`,
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        total: items.reduce((sum, item) => sum + item.total, 0),
        status: 'cancelled',
        createdByRole: userRole,
        createdByName: staff?.name,
        guestCount: saved?.guestCount || orderGuestCount,
        shiftNumber: shiftNumberStr,
        items: items.map(item => ({
          id: item.id,
          name: item.menuItem.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          mxik: item.menuItem.mxik,
          photo: item.menuItem.photo,
          markCodes: item.markCodes,
        })),
      }, ...prev])
    }

    setTables(prev => prev.map(table => table.id === tableId ? { ...table, status: 'free' as const } : table))
    setTableOrders(prev => ({ ...prev, [tableId]: { items: [], comment: '', tags: [], modifiers: [], guestCount: 1 } }))
    setTableBookings(prev => { const next = { ...prev }; delete next[tableId]; return next })
    setKitchenSent(prev => { const next = { ...prev }; delete next[tableId]; return next })
    setAvansPrintedSet(prev => { const next = new Set(prev); next.delete(tableId); return next })
    setOrderItems([])
    setOrderComment('')
    setOrderTags([])
    setOrderModifiers([])
    setOrderGuestCount(1)
    setOrderOpenTime('')
    setSelectedTable(null)
    setCurrentScreen('tables')
  }, [selectedTable, tableOrders, orderItems, userRole, staff, orderGuestCount, shiftNumberStr, showToast])

  const handleDelivered = useCallback(() => {
    if (selectedTable) {
      saveCurrentOrder()
      setTables(prev => prev.map(t =>
        t.id === selectedTable.id ? { ...t, status: 'occupied' as const } : t
      ))
      if (orderItems.length > 0) deductIngredientStock(orderItems)
    }
    setCurrentScreen('tables')
  }, [selectedTable, saveCurrentOrder, orderItems])

  const handleCashierCancelOrder = useCallback((tableId: number) => {
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'free' as const } : t))
    const saved = tableOrders[tableId]
    const items = saved?.items || []
    const table = tables.find(t => t.id === tableId)
    if (table && items.length > 0) {
      const now = new Date()
      const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
      const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      setHistory(prev => [{
        id: Date.now().toString(),
        tableId: table.id,
        tableName: table.name,
        zone: table.zone,
        timestamp: `${dateStr} ${timeStr}`,
        itemCount: items.reduce((s, i) => s + i.quantity, 0),
        total: items.reduce((s, i) => s + i.total, 0),
        status: 'cancelled',
        createdByRole: userRole,
        createdByName: staff?.name,
        items: items.map(i => ({ id: i.id, name: i.menuItem.name, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, mxik: i.menuItem.mxik, photo: i.menuItem.photo })),
      }, ...prev])
    }
    setTableOrders(prev => ({ ...prev, [tableId]: { items: [], comment: '', tags: [], modifiers: [], guestCount: 1 } }))
    setKitchenSent(prev => { const next = { ...prev }; delete next[tableId]; return next })
    setAvansPrintedSet(prev => { const next = new Set(prev); next.delete(tableId); return next })
  }, [tableOrders, tables, userRole, staff, shiftNumberStr])

  const handleAvansPrinted = useCallback(() => {
    showToast(tr('Счет выдан', 'Hisob berildi', 'Bill issued'))
    if (selectedTable) {
      setAvansPrintedSet(prev => new Set(prev).add(selectedTable.id))
    }
  }, [selectedTable, showToast])

  const handleOrdersEdit = useCallback((table: Table) => {
    if (!canAccessOrder(table.id)) return
    loadTableOrder(table)
    setSelectedTable(table)
    setCurrentScreen('menu')
  }, [canAccessOrder, loadTableOrder])

  const handleOrdersDelivered = useCallback((tableId: number) => {
    if (!canAccessOrder(tableId)) return
    setTables(prev => prev.map(t =>
      t.id === tableId ? { ...t, status: 'occupied' as const } : t
    ))
    const saved = tableOrders[tableId]
    const items = saved?.items || []
    if (items.length > 0) deductIngredientStock(items)
  }, [tableOrders, canAccessOrder])

  const handleOrdersIssueBill = useCallback((tableId: number) => {
    if (!canAccessOrder(tableId)) return
    setAvansPrintedSet(prev => new Set(prev).add(tableId))
    showToast(tr('Счет выдан', 'Hisob berildi', 'Bill issued'))
  }, [showToast, canAccessOrder])

  const handleSaveBooking = useCallback((tableId: number, booking: TableBookingData) => {
    setTableBookings(prev => ({ ...prev, [tableId]: booking }))
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'reserved' as const } : t))
    setOrderGuestCount(booking.guestCount)
    setTableOrders(prev => {
      const saved = prev[tableId]
      if (!saved) return prev
      return { ...prev, [tableId]: { ...saved, guestCount: booking.guestCount } }
    })
    setBookingModalTable(null)
    setReservingMode(false)
  }, [])

  const handleCancelBooking = useCallback(() => {
    if (!selectedTable) return
    const tableId = selectedTable.id
    setTableBookings(prev => { const next = { ...prev }; delete next[tableId]; return next })
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'free' as const } : t))
  }, [selectedTable])

  const handleReserveFromOrder = useCallback(() => {
    saveCurrentOrder()
    setBookingModalTable(selectedTable)
  }, [saveCurrentOrder, selectedTable])

  const handleOrdersSendToCashier = useCallback((table: Table) => {
    if (!canAccessOrder(table.id)) return
    const saved = tableOrders[table.id]
    const items = saved?.items || []
    if (!items.length) {
      showToast(tr('В заказе нет блюд', 'Buyurtmada taom yo\'q', 'The order is empty'))
      return
    }
    if (table.status === 'payment_pending') return
    setTables(prev => prev.map(t =>
      t.id === table.id ? { ...t, status: 'payment_pending' as const } : t
    ))
    const now = new Date()
    const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    setHistory(prev => [{
      id: Date.now().toString(),
      tableId: table.id,
      tableName: table.name,
      zone: table.zone,
      timestamp: `${dateStr} ${timeStr}`,
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
      total: items.reduce((s, i) => s + i.total, 0),
      status: 'sent',
      createdByRole: userRole,
      createdByName: staff?.name,
      items: items.map(i => ({ id: i.id, name: i.menuItem.name, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, mxik: i.menuItem.mxik, ...(!isNativeMobile() ? { photo: i.menuItem.photo } : {}) })),
      servicePercent: 0,
      guestCount: saved?.guestCount || 1,
      shiftNumber: shiftNumberStr,
    }, ...prev])
    bumpShiftStat(shiftKey, 'served', 1)
    showCashierSent()
  }, [tableOrders, userRole, shiftKey, shiftNumberStr, staff, bumpShiftStat, showCashierSent, showToast, canAccessOrder])

  const handleSendToCashier = useCallback(() => {
    if (selectedTable) {
      saveCurrentOrder()
      setTables(prev => prev.map(t =>
        t.id === selectedTable.id ? { ...t, status: 'payment_pending' as const } : t
      ))
      const now = new Date()
      const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
      const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      setHistory(prev => [{
        id: Date.now().toString(),
        tableId: selectedTable.id,
        tableName: selectedTable.name,
        zone: selectedTable.zone,
        timestamp: `${dateStr} ${timeStr}`,
        itemCount: orderItems.reduce((s, i) => s + i.quantity, 0),
        total: orderItems.reduce((s, i) => s + i.total, 0),
        status: 'sent',
        createdByRole: userRole,
        createdByName: staff?.name,
        items: orderItems.map(i => ({ id: i.id, name: i.menuItem.name, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, mxik: i.menuItem.mxik, photo: i.menuItem.photo, markCodes: i.markCodes })),
        servicePercent: cpServicePercent,
        guestCount: orderGuestCount,
        shiftNumber: shiftNumberStr,
      }, ...prev])
    }
    bumpShiftStat(shiftKey, 'served', 1)
    setCurrentScreen('tables')
    showCashierSent()
  }, [selectedTable, showCashierSent, orderItems, saveCurrentOrder, userRole, shiftKey, staff, cpServicePercent, bumpShiftStat, orderGuestCount, shiftNumberStr])

  useEffect(() => {
    let cancelled = false
    const runSteps = async () => {
      if (cancelled) return

      setStatus(t(LOADING_STEPS[0][0], LOADING_STEPS[0][1], LOADING_STEPS[0][2]))
      setProgress(10)
      // Mobile APK has no local Node backend: data lives on-device
      // (localStorage) and syncs via the cabinet API, so skip the wait.
      if (!isNativeMobile()) await waitForBackend()
      if (cancelled) return

      setStatus(t(LOADING_STEPS[1][0], LOADING_STEPS[1][1], LOADING_STEPS[1][2]))
      setProgress(25)
      await loadStores(LOCAL_STORES)
      if (cancelled) return

      setStatus(t(LOADING_STEPS[2][0], LOADING_STEPS[2][1], LOADING_STEPS[2][2]))
      setProgress(45)
      await loadStores(MENU_STORES)
      if (cancelled) return

      setStatus(t(LOADING_STEPS[3][0], LOADING_STEPS[3][1], LOADING_STEPS[3][2]))
      setProgress(60)
      await initNetwork()
      // Standalone mobile terminal: no master/slave socket to wait for.
      if (!isNativeMobile()) await waitForNetworkConfig()
      if (cancelled) return

      setStatus(t(LOADING_STEPS[4][0], LOADING_STEPS[4][1], LOADING_STEPS[4][2]))
      setProgress(80)
      if (!isNativeMobile()) await waitForNetworkSocket()
      if (cancelled) return

      setStatus(t(LOADING_STEPS[5][0], LOADING_STEPS[5][1], LOADING_STEPS[5][2]))
      setProgress(95)
      if (!cancelled) {
        setStatus(tr('Готово!', 'Tayyor!', 'Done!'))
        setProgress(100)
        setReady(true)
        setTimeout(() => {
          if (cancelled) return
          const session = dataStore.getItem(SESSION_KEY)
          if (isNativeMobile()) {
            setPhase('connect')
          } else if (session) {
            setPhase('pin')
          } else {
            setPhase('login')
          }
        }, 500)
      }
    }
    runSteps()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!isNativeMobile()) return
    const resetDraft = () => { setSelectedTable(null); setOrderItems([]); setMenuEntry(false); setCurrentScreen('tables') }
    const changedCashier = () => { resetDraft(); setTables([]); setTableOrders({}); setHistory([]); setTableBookings({}); setKitchenSent({}); setShiftByStaff({}); setStaff(null); setPhase('connect') }
    window.addEventListener('pos:mobile-conflict', resetDraft)
    window.addEventListener('pos:mobile-connection-changed', changedCashier)
    return () => {
      window.removeEventListener('pos:mobile-conflict', resetDraft)
      window.removeEventListener('pos:mobile-connection-changed', changedCashier)
    }
  }, [])

  useEffect(() => {
    if (!isNativeMobile() || netState.connection !== 'kicked') return
    saveMobileConnection('')
    resetMobileData()
    setStaff(null)
    setSelectedTable(null)
    setOrderItems([])
    setPhase('connect')
    void reconnectNetwork()
  }, [netState.connection])

  useEffect(() => {
    if (!isNativeMobile()) return
    if (phase === 'connect' && mobileConnection().host && netState.connection === 'connected' && mobileSync.ready && mobileSync.pending === 0) {
      setPhase('pin')
    } else if (phase === 'pin' && netState.connection !== 'connected') {
      setPhase('connect')
    }
  }, [phase, netState.connection, mobileSync.ready, mobileSync.pending])

  const handleDataDeleted = useCallback(() => {
    dataStore.clearAll()
    dataStore.removeItem(SESSION_KEY)
    dataStore.removeItem('pos_v2_login_username')
    dataStore.removeItem('pos_v2_login_password')
    dataStore.removeItem('pos_v2_cabinet_token')
    dataStore.removeItem('pos_v2_fm_factory_id')
    dataStore.removeItem('pos_v2_fm_terminal_id')
    setTables(MOCK_TABLES)
    setHistory([])
    setTableOrders({})
    setKitchenSent({})
    setShiftByStaff({})
    setAvansPrintedSet(new Set())
    setOrderItems([])
    setOrderComment('')
    setOrderTags([])
    setOrderModifiers([])
    setCashierPaymentData(null)
    setCpSplitAmounts(null)
    setStaff(null)
    setMenuEntry(false)
    setCurrentScreen('tables')
    if (isNativeMobile()) {
      saveMobileConnection('')
      void reconnectNetwork()
    }
    setPhase(isNativeMobile() ? 'connect' : 'login')
  }, [])

  useEffect(() => { dataStore.setItem('pos_v2_history', JSON.stringify(history)) }, [history])
  useEffect(() => { dataStore.setItem('pos_v2_tables', JSON.stringify(tables)) }, [tables])
  useEffect(() => { dataStore.setItem('pos_v2_tableOrders', JSON.stringify(tableOrders)) }, [tableOrders])
  useEffect(() => { dataStore.setItem('pos_v2_tableBookings', JSON.stringify(tableBookings)) }, [tableBookings])
  useEffect(() => { dataStore.setItem('pos_v2_kitchen_sent', JSON.stringify(kitchenSent)) }, [kitchenSent])
  useEffect(() => { dataStore.setItem('pos_v2_shiftByStaff', JSON.stringify(shiftByStaff)) }, [shiftByStaff])
  useEffect(() => { dataStore.setItem('pos_v2_shift_log', JSON.stringify(shiftLog)) }, [shiftLog])

  // Live sync: when another terminal changes shared data, update local state.
  useEffect(() => {
    const parse = (raw: string | null, fallback: any) => {
      try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
    }
    const unsubTables = dataStore.subscribe('pos_v2_tables', () => {
      setTables(parse(dataStore.getItem('pos_v2_tables'), MOCK_TABLES))
    })
    const unsubTableOrders = dataStore.subscribe('pos_v2_tableOrders', () => {
      setTableOrders(parse(dataStore.getItem('pos_v2_tableOrders'), {}))
    })
    const unsubTableBookings = dataStore.subscribe('pos_v2_tableBookings', () => {
      setTableBookings(parse(dataStore.getItem('pos_v2_tableBookings'), {}))
    })
    const unsubHistory = dataStore.subscribe('pos_v2_history', () => {
      setHistory(parse(dataStore.getItem('pos_v2_history'), []))
    })
    const unsubShift = dataStore.subscribe('pos_v2_shiftByStaff', () => {
      setShiftByStaff(parse(dataStore.getItem('pos_v2_shiftByStaff'), {}))
    })
    const unsubShiftLog = dataStore.subscribe('pos_v2_shift_log', () => {
      setShiftLog(parse(dataStore.getItem('pos_v2_shift_log'), []))
    })
    const unsubKitchenSent = dataStore.subscribe('pos_v2_kitchen_sent', () => {
      setKitchenSent(parse(dataStore.getItem('pos_v2_kitchen_sent'), {}))
    })
    return () => {
      unsubTables()
      unsubTableOrders()
      unsubTableBookings()
      unsubHistory()
      unsubShift()
      unsubShiftLog()
      unsubKitchenSent()
    }
  }, [])

  if (phase === 'loading') {
    return (
      <div className="loading-overlay">
        <div className="loading-container">
          <div className="loading-logo-wrap">
            <div className="loading-logo-bg" />
            <div className="loading-logo-ring" />
            <div className="loading-logo-ring-2" />
            <div className="loading-logo-icon">
              <img src="/logo.png" alt="logo" />
            </div>
          </div>
          <div className="loading-title">
            POS <span>Terminal</span>
          </div>
          <div className="loading-subtitle">{t('Виртуальная касса v2', 'Virtual kassa v2', 'Virtual cash register v2')}</div>
          <div className="loading-dots">
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
          <div className={`loading-status${ready ? ' loaded' : ''}`}>{status}</div>
          <div className="loading-progress">
            <div className="loading-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'connect') {
    return <MobileConnect />
  }

  if (phase === 'login') {
    return <Login onLogin={() => { dataStore.setItem(SESSION_KEY, '1'); setPhase('pin') }} />
  }

  if (phase === 'pin') {
    return <PinScreen onComplete={(s) => {
      // Hard guard: mobile APK is waiters-only (admin/cashier stay on desktop).
      if (isNativeMobile() && s.role !== 'waiter') return
      try {
        const directory: Staff[] = JSON.parse(dataStore.getItem('pos_v2_staff') || '[]')
        if (Array.isArray(directory)) setTableOrders(prev => migrateOrderOwners(prev, directory))
      } catch { /* Keep unassigned orders available to the cashier. */ }
      setSelectedTable(null)
      setOrderItems([])
      setOrderComment('')
      setOrderTags([])
      setOrderModifiers([])
      setOrderGuestCount(1)
      setOrderOpenTime('')
      setChangingTable(false)
      setMenuEntry(false)
      setBookingModalTable(null)
      setReservingMode(false)
      setCashierPaymentData(null)
      setCpServicePercent(0)
      setCpDiscountType('percent')
      setCpDiscountPercent(0)
      setCpDiscountAmount(0)
      setCpSelectedMethod(null)
      setCpSplitAmounts(null)
      prevTableId.current = null
      if (shiftEndRedirectKey) {
        updateShift(shiftEndRedirectKey, { active: false, startTime: '—', endTime: '—', ending: false })
        setShiftEndRedirectKey(null)
      }
      setStaff(s); setPhase('app'); setCurrentScreen(s.role === 'admin' ? 'admin_dashboard' : 'tables')
    }} />
  }

  function renderScreen() {
    if (isNativeMobile() && currentScreen === 'fiscal_module') return null
    switch (currentScreen) {
      case 'tables':
        return <TableMap tables={tables} tableOrders={tableOrders} tableBookings={tableBookings} staffName={staff?.name || ''} role={userRole} reservingMode={reservingMode} onSelectTable={handleSelectTable} onSaveBooking={handleSaveBooking} onCancelReservingMode={() => { setReservingMode(false) }} onUpdateStatus={(id, status) => setTables(prev => prev.map(t => t.id === id ? { ...t, status } : t))} />
      case 'menu':
        if (userRole === 'waiter' || userRole === 'cashier') {
          return (
            <WaiterMenu
              selectedTable={selectedTable}
              items={orderItems}
              onItemsChange={setOrderItems}
              guestCount={orderGuestCount}
              onGuestCountChange={setOrderGuestCount}
              onBack={() => { saveCurrentOrder(); setCurrentScreen('tables') }}
              onKitchenPrinted={handlePrint}
              onCancelOrder={userRole === 'waiter' ? handleCancelOrder : undefined}
              onReserveTable={userRole === 'waiter' ? handleReserveFromOrder : undefined}
              isReserved={userRole === 'waiter' && !!(selectedTable && tableBookings[selectedTable.id])}
              onCancelBooking={userRole === 'waiter' ? handleCancelBooking : undefined}
              orderActionsLocked={userRole === 'waiter' && (selectedTable?.status === 'occupied' || selectedTable?.status === 'payment_pending')}
              onPayment={userRole === 'cashier' ? () => { saveCurrentOrder(); setCurrentScreen('cashier_payment') } : undefined}
              staffName={staff?.name || tr('Пользователь', 'Foydalanuvchi', 'User')}
              orderOpenTime={orderOpenTime}
              kitchenSent={selectedTable ? (kitchenSent[selectedTable.id] || []) : []}
              orderComment={orderComment}
              onOrderCommentChange={setOrderComment}
              orderTags={orderTags}
              onOrderTagsChange={setOrderTags}
              orderModifiers={orderModifiers}
              onOrderModifiersChange={setOrderModifiers}
              onShowToast={showToast}
            />
          )
        }
        return (
          <MenuSelection
            selectedTable={selectedTable}
            onContinue={handleContinueToOrder}
            onBack={() => { saveCurrentOrder(); setCurrentScreen('tables') }}
            initialSelected={orderItems.length > 0 ? new Set(orderItems.map(i => i.menuItem.id)) : undefined}
            existingItems={orderItems.length > 0 ? orderItems : undefined}
          />
        )
      case 'order':
        return (
          <OrderWindow
            items={orderItems}
            onItemsChange={setOrderItems}
            tableName={selectedTable?.name || MOCK_ORDER.tableName}
            guestCount={orderGuestCount}
            onGuestCountChange={setOrderGuestCount}
            onBack={() => { saveCurrentOrder(); setCurrentScreen(userRole === 'cashier' ? 'menu' : 'menu') }}
            onSendToKitchen={userRole === 'cashier' ? undefined : () => { saveCurrentOrder(); setCurrentScreen('kitchen') }}
            onPayment={userRole === 'cashier' ? () => { saveCurrentOrder(); setCurrentScreen('cashier_payment') } : undefined}
            onChangeTable={() => { saveCurrentOrder(); setChangingTable(true); setCurrentScreen('tables') }}
            orderComment={orderComment}
            onOrderCommentChange={setOrderComment}
            orderTags={orderTags}
            onOrderTagsChange={setOrderTags}
            orderModifiers={orderModifiers}
            onOrderModifiersChange={setOrderModifiers}
          />
        )
      case 'kitchen':
        const { kitchenItems, kitchenPrintItems } = buildKitchenItems(
          orderItems,
          selectedTable ? (kitchenSent[selectedTable.id] || []) : []
        )
        return (
          <SendToKitchen
            items={kitchenItems}
            printItems={kitchenPrintItems}
            orderItems={orderItems}
            tableLabel={selectedTable?.name || MOCK_ORDER.tableName}
            guestCount={orderGuestCount}
            onBack={() => { saveCurrentOrder(); setCurrentScreen('order') }}
            onContinue={() => { saveCurrentOrder(); setCurrentScreen('payment') }}
            onCancelOrder={handleCancelOrder}
            onPrint={handlePrint}
            orderComment={orderComment}
            orderTags={orderTags}
            orderModifiers={orderModifiers}
          />
        )
      case 'history':
        return <OrderHistory history={history} role={userRole} />
      case 'orders':
        return (
          <WaiterOrders
            key={`${userRole}:${staff?.id}`}
            tables={tables}
            tableOrders={tableOrders}
            avansPrinted={avansPrintedSet}
            staffName={staff?.name || ''}
            staffId={staff?.id}
            userRole={userRole}
            shiftNumber={shiftNumberStr}
            onEditOrder={handleOrdersEdit}
            onDelivered={handleOrdersDelivered}
            onIssueBill={handleOrdersIssueBill}
            onSendToCashier={handleOrdersSendToCashier}
            onCancelOrder={handleCashierCancelOrder}
          />
        )
      case 'payment':
        return (
          <PaymentPrecheck
            orderItems={orderItems}
            table={selectedTable}
            guestCount={orderGuestCount}
            staffName={staff?.name || tr('Пользователь', 'Foydalanuvchi', 'User')}
            userRole={userRole}
            shiftNumber={shiftNumberStr}
            onBack={() => setCurrentScreen('tables')}
            onAddOrder={() => { saveCurrentOrder(); setCurrentScreen('menu') }}
            onDelivered={handleDelivered}
            onAvansPrinted={handleAvansPrinted}
            onSendToCashier={handleSendToCashier}
            avansPrinted={selectedTable ? avansPrintedSet.has(selectedTable.id) : false}
          />
        )
      case 'cashier_payment':
        return (
          <CashierPayment
            totalSum={orderItems.reduce((s, i) => s + i.total, 0)}
            tableName={selectedTable?.name || ''}
            guestCount={orderGuestCount}
            onBack={() => { saveCurrentOrder(); setCurrentScreen('menu') }}
            items={orderItems}
            onContinue={(data) => { setCashierPaymentData(data); setCurrentScreen('check_receipt') }}
            servicePercent={cpServicePercent}
            discountType={cpDiscountType}
            discountPercent={cpDiscountPercent}
            discountAmount={cpDiscountAmount}
            selectedMethod={cpSelectedMethod}
            onServicePercentChange={setCpServicePercent}
            onDiscountTypeChange={setCpDiscountType}
            onDiscountPercentChange={setCpDiscountPercent}
            onDiscountAmountChange={setCpDiscountAmount}
            onSelectedMethodChange={setCpSelectedMethod}
            splitAmounts={cpSplitAmounts}
            onSplitAmountsChange={setCpSplitAmounts}
          />
        )
      case 'check_receipt': {
        const pd = cashierPaymentData
        return pd ? (
          <CheckReceipt
            items={pd.items}
            tableName={pd.tableName}
            guestCount={pd.guestCount}
            staffName={staff?.name || tr('Пользователь', 'Foydalanuvchi', 'User')}
            staffId={staff?.id || 1}
            userRole={userRole}
            shiftNumber={shiftNumberStr}
            servicePercent={pd.servicePercent}
            discountType={pd.discountType}
            discountPercent={pd.discountPercent}
            discountAmount={pd.discountAmount}
            selectedMethod={pd.selectedMethod}
            splitAmounts={pd.splitAmounts || null}
            onBack={() => { saveCurrentOrder(); setCurrentScreen('cashier_payment') }}
            onComplete={(fiscalData?: { fiscalSign?: string; qrCodeUrl?: string; terminalId?: string; receiptSeq?: number; receiptId?: string; locId?: string; factoryId?: string; queuedId?: string }) => {
              decrementStock(pd.items, orderModifiers)
              if (selectedTable) {
                setTables(prev => prev.map(t =>
                  t.id === selectedTable.id ? { ...t, status: 'free' as const } : t
                ))
                setAvansPrintedSet(prev => { const next = new Set(prev); next.delete(selectedTable.id); return next })
      setTableOrders(prev => ({ ...prev, [selectedTable.id]: { items: [], comment: '', tags: [], modifiers: [], guestCount: 1 } }))
                const now = new Date()
                const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
                const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                const fiscalIssued = !!(fiscalData?.fiscalSign || fiscalData?.receiptSeq)
                const baseTotal = pd.items.reduce((s, i) => s + i.total, 0)
                const serviceTotal = Math.round(baseTotal * pd.servicePercent / 100)
                const discountTotal = pd.discountType === 'percent'
                  ? Math.round(baseTotal * pd.discountPercent / 100)
                  : pd.discountAmount
                const paymentTotal = Math.max(0, baseTotal + serviceTotal - discountTotal)
                setHistory(prev => [{
                  id: Date.now().toString(),
                  tableId: selectedTable.id,
                  tableName: selectedTable.name,
                  zone: selectedTable.zone,
                  timestamp: `${dateStr} ${timeStr}`,
                  itemCount: pd.items.reduce((s, i) => s + i.quantity, 0),
                  total: baseTotal,
                  status: fiscalIssued ? 'paid' : 'sent',
                  paymentMethod: pd.selectedMethod || (pd.splitAmounts ? 'split' as any : undefined),
                  cashPaymentSum: pd.splitAmounts?.cash ?? (pd.selectedMethod === 'cash' ? paymentTotal : 0),
                  cardPaymentSum: pd.splitAmounts ? pd.splitAmounts.card + pd.splitAmounts.click : (pd.selectedMethod && pd.selectedMethod !== 'cash' ? paymentTotal : 0),
                  createdByRole: userRole,
                  createdByName: staff?.name,
                  guestCount: pd.guestCount,
                  shiftNumber: shiftNumberStr,
                  items: pd.items.map(i => ({ id: i.id, name: i.menuItem.name, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, mxik: i.menuItem.mxik, photo: i.menuItem.photo, markCodes: i.markCodes })),
                  discountType: pd.discountType,
                  discountPercent: pd.discountPercent,
                  discountAmount: pd.discountAmount,
                  servicePercent: pd.servicePercent,
                  fiscalSign: fiscalIssued ? (fiscalData?.fiscalSign || '') : '',
                  qrCodeUrl: fiscalIssued ? (fiscalData?.qrCodeUrl || '') : '',
                  terminalId: fiscalIssued ? (fiscalData?.terminalId || '') : '',
                  receiptSeq: fiscalIssued ? (fiscalData?.receiptSeq || 0) : 0,
                  cabinetReceiptId: fiscalIssued ? (fiscalData?.receiptId || '') : '',
                  cabinetLocId: fiscalIssued ? (fiscalData?.locId || '') : '',
                  ofdStatus: fiscalIssued ? ((fiscalData as any)?.ofdStatus || (fiscalData?.factoryId ? 'synced' : undefined)) : undefined,
                  factoryId: fiscalIssued ? (fiscalData?.factoryId || '') : '',
                  fiscalQueueId: fiscalIssued ? undefined : fiscalData?.queuedId,
                }, ...prev])
                bumpShiftStat(shiftKey, 'sales', paymentTotal)
                setOrderItems([])
                setOrderComment('')
                setOrderTags([])
                setOrderModifiers([])
              }
              setCashierPaymentData(null)
              setCpSplitAmounts(null)
              setMenuEntry(false)
              setCurrentScreen('tables')
              showToast(tr('Заказ завершен', 'Buyurtma yakunlandi', 'Order completed'))
            }}
          />
        ) : null
      }
      case 'admin_dashboard':
        return <AdminDashboard history={history} tables={tables} tableOrders={tableOrders} />
      case 'admin_branches':
        return <AdminBranches />
      case 'admin_tables':
        return <AdminTables tables={tables} tableOrders={tableOrders} tableBookings={tableBookings} staffName={staff?.name || ''} onTablesChange={setTables} />
      case 'admin_roles':
        return <AdminRoles />
      case 'admin_history':
        return <AdminHistory history={history} />
      case 'admin_menu':
        return <AdminMenu />
      case 'admin_stock':
        return <AdminStock />
      case 'admin_ingredients':
        return <AdminIngredients />
      case 'admin_settings':
        return <AdminSettings onLogout={() => { dataStore.removeItem(SESSION_KEY); setPhase('login'); setStaff(null) }} onChangeRole={() => setPhase('pin')} onDataDeleted={handleDataDeleted} />
      case 'admin_modifiers':
        return <AdminModifiers />
      case 'admin_reports':
        return <AdminReports history={history} presetDateFrom={reportsPreset?.from} presetDateTo={reportsPreset?.to} presetKey={reportsPreset?.key} onPresetConsumed={() => setReportsPreset(null)} />
      case 'admin_shift':
        return <AdminShift history={history} onShowShiftChecks={openShiftChecks} />
      case 'admin_support':
        return <AdminSupport />
      case 'fiscal_module':
        return <FiscalModule />
      case 'profile':
        const activeTableCount = tables.filter(t => t.status === 'ordered' || t.status === 'occupied' || t.status === 'payment_pending').length
        const networkBlocked = isNativeMobile()
          ? !!mobileConnection().host && netState.connection !== 'connected'
          : netState.role === 'neutral'
        return (
          <Profile
            onChangeRole={() => setPhase('pin')}
            shiftActive={shiftActive}
            shiftStartTime={shiftStartTime}
            shiftEndTime={shiftEndTime}
            shiftEnding={shiftEnding}
            onShiftStart={(time) => { updateShift(shiftKey, { active: true, startTime: time, number: shiftNumber + 1, sales: 0, served: 0 }) }}
            onShiftEnd={(time) => {
              if (isNativeMobile()) {
                updateShift(shiftKey, { active: false, endTime: time, ending: true })
                setShiftEndRedirectKey(shiftKey)
                return
              }
              const nextNumber = (shiftLog.reduce((m, e) => Math.max(m, e.number), 0)) + 1
              const receiptNumber = shiftNumberStr
              const entry: ShiftLogEntry = {
                id: cabinetShiftId(`SHIFT-${receiptNumber}-${staff?.id || 1}`),
                number: nextNumber,
                receiptShiftNumber: receiptNumber,
                cashierName: staff?.name || '',
                userId: Number(staff?.id || 0),
                openTime: currentShift.startTime,
                closeTime: time,
                sales: currentShift.sales || 0,
                served: currentShift.served || 0,
                cabinetStatus: 'pending',
              }
              appendShiftLog(entry)
              setTimeout(() => { void syncCabinetShifts(history, { shiftIds: [entry.id!] }) }, 0)
              updateShift(shiftKey, { endTime: time, ending: true })
              setShiftEndRedirectKey(shiftKey)
            }}
            activeTableCount={activeTableCount}
            userRole={userRole}
            staffName={staff?.name || tr('Пользователь', 'Foydalanuvchi', 'User')}
            staffId={staff ? `${userRole === 'cashier' ? 'CSH' : userRole === 'admin' ? 'ADM' : 'WTR'}-${String(staff.id).padStart(3, '0')}` : '—'}
            staffPhone={staff?.phone || '—'}
            shiftNumber={shiftNumber > 0 ? shiftNumberStr : '—'}
            shiftSales={currentShift.sales || 0}
            shiftServed={currentShift.served || 0}
            networkBlocked={networkBlocked}
          />
        )
      default:
        return <TableMap tables={tables} tableOrders={tableOrders} staffName={staff?.name || ''} role={userRole} onSelectTable={handleSelectTable} onUpdateStatus={(id, status) => setTables(prev => prev.map(t => t.id === id ? { ...t, status } : t))} />
    }
  }

  return (
    <UpdaterProvider>
      <Layout
        currentScreen={currentScreen}
        onNavigate={handleNavigate}
        staffName={staff?.name || tr('Пользователь', 'Foydalanuvchi', 'User')}
        onLogout={() => { dataStore.removeItem(SESSION_KEY); setPhase('login'); setStaff(null) }}
        role={userRole}
      >
        {renderScreen()}
        {bookingModalTable && (
          <BookingModal
            table={bookingModalTable}
            onSave={handleSaveBooking}
            onClose={() => setBookingModalTable(null)}
          />
        )}
        {toast && (
          <div className="toast-overlay">
            <div className="toast-msg">{toast}</div>
          </div>
        )}
      </Layout>
      <UpdateModals />
    </UpdaterProvider>
  )
}

export default App
