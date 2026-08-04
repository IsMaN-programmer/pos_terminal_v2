import { useState, useEffect, useCallback, useRef } from 'react'
import Login from './Login'
import PinScreen from './PinScreen'
import Layout from './components/Layout'
import TableMap from './components/TableMap'
import MenuSelection from './components/MenuSelection'
import OrderWindow from './components/OrderWindow'
import SendToKitchen from './components/SendToKitchen'

import OrderHistory from './components/OrderHistory'
import AdminDashboard from './components/AdminDashboard'
import AdminBranches from './components/AdminBranches'
import AdminTables from './components/AdminTables'
import AdminRoles from './components/AdminRoles'
import AdminHistory from './components/AdminHistory'
import AdminMenu from './components/AdminMenu'
import AdminStock from './components/AdminStock'
import AdminSettings from './components/AdminSettings'
import AdminModifiers from './components/AdminModifiers'
import AdminReports from './components/AdminReports'
import AdminSupport from './components/AdminSupport'
import FiscalModule from './components/FiscalModule'

import PaymentPrecheck from './components/PaymentPrecheck'
import CashierPayment from './components/CashierPayment'
import type { CashierPaymentData } from './components/CashierPayment'
import CheckReceipt from './components/CheckReceipt'
import Profile from './components/Profile'
import { UpdaterProvider, UpdateModals } from './updater'
import { useT, tr } from './i18n'
import type { Screen, Table, OrderItem, KitchenItem, HistoryEntry } from './data/types'
import { MOCK_ORDER, MOCK_TABLES } from './data/mockData'

interface TableOrderData {
  items: OrderItem[]
  comment: string
  tags: string[]
  modifiers: string[]
  guestCount: number
}

interface Staff {
  id: number
  name: string
  pin: string
  role: string
}

const LOADING_STEPS: [string, string][] = [
  ['Инициализация...', 'Ishga tushirilmoqda...'],
  ['Загрузка базы данных...', 'Ma\'lumotlar bazasi yuklanmoqda...'],
  ['Подключение к серверу...', 'Serverga ulanmoqda...'],
  ['Загрузка меню...', 'Menyu yuklanmoqda...'],
  ['Синхронизация данных...', 'Ma\'lumotlar sinxronlanmoqda...'],
  ['Запуск приложения...', 'Ilova ishga tushirilmoqda...'],
]

const SESSION_KEY = 'pos_v2_session'

function App() {
  const t = useT()
  const [status, setStatus] = useState(t(LOADING_STEPS[0][0], LOADING_STEPS[0][1]))
  const [progress, setProgress] = useState(10)
  const [ready, setReady] = useState(false)
  const [phase, setPhase] = useState<'loading' | 'login' | 'pin' | 'app'>('loading')
  const [staff, setStaff] = useState<Staff | null>(null)
  const [currentScreen, setCurrentScreen] = useState<Screen>('tables')
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [changingTable, setChangingTable] = useState(false)
  const [tableOrders, setTableOrders] = useState<Record<number, TableOrderData>>(() => {
    try { return JSON.parse(localStorage.getItem('pos_v2_tableOrders') || '{}') } catch { return {} }
  })
  const [tables, setTables] = useState<Table[]>(() => {
    try { return JSON.parse(localStorage.getItem('pos_v2_tables') || 'null') || MOCK_TABLES } catch { return MOCK_TABLES }
  })
  const [orderComment, setOrderComment] = useState('')
  const [orderTags, setOrderTags] = useState<string[]>([])
  const [orderModifiers, setOrderModifiers] = useState<string[]>([])
  const [orderGuestCount, setOrderGuestCount] = useState(1)
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

  interface ShiftState {
    active: boolean
    startTime: string
    endTime: string
    ending: boolean
    number: number
  }
  const [shiftByRole, setShiftByRole] = useState<Record<string, ShiftState>>(() => {
    try { return JSON.parse(localStorage.getItem('pos_v2_shiftByRole') || '{}') } catch { return {} }
  })

  function getShift(role: string): ShiftState {
    return shiftByRole[role] || { active: false, startTime: '—', endTime: '—', ending: false, number: 0 }
  }

  const currentShift = getShift(userRole)
  const shiftActive = currentShift.active
  const shiftStartTime = currentShift.startTime
  const shiftEndTime = currentShift.endTime
  const shiftEnding = currentShift.ending
  const shiftNumber = currentShift.number || 0
  const shiftNumberStr = String(Math.max(1, shiftNumber)).padStart(3, '0')

  function updateShift(role: string, update: Partial<ShiftState>) {
    setShiftByRole(prev => ({ ...prev, [role]: { ...getShift(role), ...update } }))
  }

  const [shiftEndRedirectRole, setShiftEndRedirectRole] = useState<string | null>(null)

  // Track avans check printed per table
  const [avansPrintedSet, setAvansPrintedSet] = useState<Set<number>>(new Set())
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('pos_v2_history') || '[]') } catch { return [] }
  })


  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  const saveCurrentOrder = useCallback(() => {
    if (selectedTable) {
      setTableOrders(prev => ({ ...prev, [selectedTable.id]: { items: orderItems, comment: orderComment, tags: orderTags, modifiers: orderModifiers, guestCount: orderGuestCount } }))
    }
  }, [selectedTable, orderItems, orderComment, orderTags, orderModifiers, orderGuestCount])

  const loadTableOrder = useCallback((table: Table) => {
    const saved = tableOrders[table.id]
    if (saved) {
      setOrderItems(saved.items)
      setOrderComment(saved.comment)
      setOrderTags(saved.tags)
      setOrderModifiers(saved.modifiers)
      setOrderGuestCount(saved.guestCount || 1)
    } else {
      setOrderItems([])
      setOrderComment('')
      setOrderTags([])
      setOrderModifiers([])
      setOrderGuestCount(1)
    }
  }, [tableOrders])

  const handleSelectTable = useCallback((table: Table) => {
    if (!shiftActive) {
      showToast(tr('Сначала начните смену в профиле', 'Avval profilingizda smenani boshlang'))
      return
    }
    if (table.status === 'reserved') {
      return
    }
    if (userRole === 'cashier') {
      if (table.status !== 'payment_pending') {
        showToast(tr('Доступны только столы со статусом Ожидает оплаты', 'Faqat To\'lov kutilmoqda holatidagi stollar mavjud'))
        return
      }
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
      setTableOrders(prev => ({ ...prev, [table.id]: { items: orderItems, comment: orderComment, tags: orderTags, modifiers: orderModifiers, guestCount: orderGuestCount } }))
      setSelectedTable(table)
      setChangingTable(false)
      setCurrentScreen('order')
      return
    }
    loadTableOrder(table)
    setSelectedTable(table)
    setCurrentScreen('menu')
  }, [changingTable, shiftActive, showToast, loadTableOrder, userRole, orderItems, orderComment, orderTags, orderModifiers, orderGuestCount])

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
      const raw = localStorage.getItem('pos_v2_stock_goods')
      if (!raw) return
      const goods: any[] = JSON.parse(raw)
      let changed = false

      for (const item of orderItemsList) {
        const name = item.menuItem.name.toLowerCase()
        for (const g of goods) {
          if (g.name && g.name.toLowerCase() === name) {
            if (!g.unlimited && g.quantity != null) {
              const factor = getStockFactor(g.unit)
              g.quantity = Math.max(0, g.quantity - item.quantity * factor)
              changed = true
            }
            break
          }
        }
      }

      for (const mod of mods) {
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

      if (changed) localStorage.setItem('pos_v2_stock_goods', JSON.stringify(goods))
    } catch {}
  }

  const handlePrint = useCallback(() => {
    showToast(tr('Чек отправился на кухню', 'Chek oshxonaga yuborildi'))
    if (selectedTable) {
      saveCurrentOrder()
      setTables(prev => prev.map(t =>
        t.id === selectedTable.id ? { ...t, status: 'ordered' as const } : t
      ))
    }
    setCurrentScreen('tables')
  }, [selectedTable, showToast, saveCurrentOrder])

  const handleCancelOrder = useCallback(() => {
    if (selectedTable) {
      setTableOrders(prev => ({ ...prev, [selectedTable.id]: { items: [], comment: '', tags: [], modifiers: [], guestCount: 1 } }))
    }
    setOrderItems([])
    setOrderComment('')
    setOrderTags([])
    setOrderModifiers([])
    setCurrentScreen('tables')
  }, [selectedTable])

  const handleDelivered = useCallback(() => {
    if (selectedTable) {
      saveCurrentOrder()
      setTables(prev => prev.map(t =>
        t.id === selectedTable.id ? { ...t, status: 'occupied' as const } : t
      ))
    }
    setCurrentScreen('tables')
  }, [selectedTable, saveCurrentOrder])

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
  }, [tableOrders, tables, userRole, staff])

  const handleAvansPrinted = useCallback(() => {
    showToast(tr('Avans-check выдан', 'Avans-chek berildi'))
    if (selectedTable) {
      setAvansPrintedSet(prev => new Set(prev).add(selectedTable.id))
    }
  }, [selectedTable, showToast])

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
        items: orderItems.map(i => ({ id: i.id, name: i.menuItem.name, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, mxik: i.menuItem.mxik, photo: i.menuItem.photo })),
        servicePercent: cpServicePercent,
      }, ...prev])
    }
    setCurrentScreen('tables')
    showToast(tr('Чек отправлен на кассу', 'Chek kassaga yuborildi'))
  }, [selectedTable, showToast, orderItems, saveCurrentOrder, userRole, staff, cpServicePercent])

  useEffect(() => {
    let cancelled = false
    const runSteps = async () => {
      for (let i = 0; i < LOADING_STEPS.length; i++) {
        if (cancelled) return
        setStatus(t(LOADING_STEPS[i][0], LOADING_STEPS[i][1]))
        setProgress([10, 25, 45, 60, 80, 95][i] || 10)
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400))
      }
      if (!cancelled) {
        setStatus(tr('Готово!', 'Tayyor!'))
        setProgress(100)
        setReady(true)
        setTimeout(() => {
          if (cancelled) return
          const session = localStorage.getItem(SESSION_KEY)
          if (session) {
            setPhase('pin')
          } else {
            setPhase('login')
          }
        }, 600)
      }
    }
    runSteps()
    return () => { cancelled = true }
  }, [])

  const handleDataDeleted = useCallback(() => {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('pos_v2_')) keys.push(key)
    }
    keys.forEach(k => localStorage.removeItem(k))
    setTables(MOCK_TABLES)
    setHistory([])
    setTableOrders({})
    setShiftByRole({})
    setAvansPrintedSet(new Set())
    setOrderItems([])
    setOrderComment('')
    setOrderTags([])
    setOrderModifiers([])
    setCashierPaymentData(null)
    setCpSplitAmounts(null)
    setStaff(null)
    setCurrentScreen('tables')
    setPhase('login')
  }, [])

  useEffect(() => { localStorage.setItem('pos_v2_history', JSON.stringify(history)) }, [history])
  useEffect(() => { localStorage.setItem('pos_v2_tables', JSON.stringify(tables)) }, [tables])
  useEffect(() => { localStorage.setItem('pos_v2_tableOrders', JSON.stringify(tableOrders)) }, [tableOrders])
  useEffect(() => { localStorage.setItem('pos_v2_shiftByRole', JSON.stringify(shiftByRole)) }, [shiftByRole])

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
          <div className="loading-subtitle">{t('Виртуальная касса v2', 'Virtual kassa v2')}</div>
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

  if (phase === 'login') {
    return <Login onLogin={() => { localStorage.setItem(SESSION_KEY, '1'); setPhase('pin') }} />
  }

  if (phase === 'pin') {
    return <PinScreen onComplete={(s) => {
      if (shiftEndRedirectRole) {
        updateShift(shiftEndRedirectRole, { active: false, startTime: '—', endTime: '—', ending: false })
        setShiftEndRedirectRole(null)
        setHistory([])
      }
      setStaff(s); setPhase('app'); setCurrentScreen(s.role === 'admin' ? 'admin_dashboard' : 'tables')
    }} />
  }

  function renderScreen() {
    switch (currentScreen) {
      case 'tables':
        return <TableMap tables={tables} role={userRole} onSelectTable={handleSelectTable} onCancelOrder={handleCashierCancelOrder} onUpdateStatus={(id, status) => setTables(prev => prev.map(t => t.id === id ? { ...t, status } : t))} />
      case 'menu':
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
        const kitchenItems: KitchenItem[] = orderItems.map(item => ({
          id: item.id,
          name: item.menuItem.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          status: 'waiting' as const,
        }))
        return (
          <SendToKitchen
            items={kitchenItems}
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
      case 'payment':
        return (
          <PaymentPrecheck
            orderItems={orderItems}
            table={selectedTable}
            guestCount={orderGuestCount}
            staffName={staff?.name || tr('Пользователь', 'Foydalanuvchi')}
            userRole={userRole}
            shiftNumber={shiftNumberStr}
            onBack={() => setCurrentScreen('tables')}
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
            onBack={() => { saveCurrentOrder(); setCurrentScreen('order') }}
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
            staffName={staff?.name || tr('Пользователь', 'Foydalanuvchi')}
            userRole={userRole}
            shiftNumber={shiftNumberStr}
            servicePercent={pd.servicePercent}
            discountType={pd.discountType}
            discountPercent={pd.discountPercent}
            discountAmount={pd.discountAmount}
            selectedMethod={pd.selectedMethod}
            splitAmounts={pd.splitAmounts || null}
            onBack={() => { saveCurrentOrder(); setCurrentScreen('cashier_payment') }}
            onComplete={(fiscalData?: { fiscalSign?: string; qrCodeUrl?: string; terminalId?: string; receiptSeq?: number; receiptId?: string; locId?: string; factoryId?: string }) => {
              decrementStock(pd.items, orderModifiers)
              if (selectedTable) {
                setTables(prev => prev.map(t =>
                  t.id === selectedTable.id ? { ...t, status: 'free' as const } : t
                ))
      setTableOrders(prev => ({ ...prev, [selectedTable.id]: { items: [], comment: '', tags: [], modifiers: [], guestCount: 1 } }))
                const now = new Date()
                const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
                const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                setHistory(prev => [{
                  id: Date.now().toString(),
                  tableId: selectedTable.id,
                  tableName: selectedTable.name,
                  zone: selectedTable.zone,
                  timestamp: `${dateStr} ${timeStr}`,
                  itemCount: pd.items.reduce((s, i) => s + i.quantity, 0),
                  total: pd.items.reduce((s, i) => s + i.total, 0),
                  status: 'paid',
                  paymentMethod: pd.selectedMethod || (pd.splitAmounts ? 'split' as any : undefined),
                  createdByRole: userRole,
                  createdByName: staff?.name,
                  items: pd.items.map(i => ({ id: i.id, name: i.menuItem.name, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, mxik: i.menuItem.mxik, photo: i.menuItem.photo })),
                  discountType: pd.discountType,
                  discountPercent: pd.discountPercent,
                  discountAmount: pd.discountAmount,
                  servicePercent: pd.servicePercent,
                  fiscalSign: fiscalData?.fiscalSign || '',
                  qrCodeUrl: fiscalData?.qrCodeUrl || '',
                  terminalId: fiscalData?.terminalId || '',
                  receiptSeq: fiscalData?.receiptSeq || 0,
                  cabinetReceiptId: fiscalData?.receiptId || '',
                  cabinetLocId: fiscalData?.locId || '',
                  ofdStatus: (fiscalData as any)?.ofdStatus || (fiscalData?.factoryId ? 'synced' : undefined),
                  factoryId: fiscalData?.factoryId || '',
                }, ...prev])
                setOrderItems([])
                setOrderComment('')
                setOrderTags([])
                setOrderModifiers([])
              }
              setCashierPaymentData(null)
              setCpSplitAmounts(null)
              setCurrentScreen('tables')
              showToast(tr('Заказ завершен', 'Buyurtma yakunlandi'))
            }}
          />
        ) : null
      }
      case 'admin_dashboard':
        return <AdminDashboard history={history} tables={tables} tableOrders={tableOrders} />
      case 'admin_branches':
        return <AdminBranches />
      case 'admin_tables':
        return <AdminTables tables={tables} onTablesChange={setTables} />
      case 'admin_roles':
        return <AdminRoles />
      case 'admin_history':
        return <AdminHistory history={history} />
      case 'admin_menu':
        return <AdminMenu />
      case 'admin_stock':
        return <AdminStock />
      case 'admin_settings':
        return <AdminSettings onLogout={() => { localStorage.removeItem(SESSION_KEY); setPhase('login'); setStaff(null) }} onChangeRole={() => setPhase('pin')} onDataDeleted={handleDataDeleted} />
      case 'admin_modifiers':
        return <AdminModifiers />
      case 'admin_reports':
        return <AdminReports history={history} />
      case 'admin_support':
        return <AdminSupport />
      case 'fiscal_module':
        return <FiscalModule />
      case 'profile':
        const activeTableCount = tables.filter(t => t.status === 'ordered' || t.status === 'occupied').length
        return (
          <Profile
            history={history}
            onChangeRole={() => setPhase('pin')}
            shiftActive={shiftActive}
            shiftStartTime={shiftStartTime}
            shiftEndTime={shiftEndTime}
            shiftEnding={shiftEnding}
            onShiftStart={(time) => { updateShift(userRole, { active: true, startTime: time, number: shiftNumber + 1 }) }}
            onShiftEnd={(time) => { updateShift(userRole, { endTime: time, ending: true }); setShiftEndRedirectRole(userRole) }}
            activeTableCount={activeTableCount}
            userRole={userRole}
            staffName={staff?.name || tr('Пользователь', 'Foydalanuvchi')}
            staffId={staff ? `${userRole === 'cashier' ? 'CSH' : userRole === 'admin' ? 'ADM' : 'WTR'}-${String(staff.id).padStart(3, '0')}` : '—'}
            shiftNumber={shiftNumber > 0 ? shiftNumberStr : '—'}
          />
        )
      default:
        return <TableMap tables={tables} role={userRole} onSelectTable={handleSelectTable} onCancelOrder={handleCashierCancelOrder} onUpdateStatus={(id, status) => setTables(prev => prev.map(t => t.id === id ? { ...t, status } : t))} />
    }
  }

  return (
    <UpdaterProvider>
      <Layout
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
        staffName={staff?.name || tr('Пользователь', 'Foydalanuvchi')}
        onLogout={() => { localStorage.removeItem(SESSION_KEY); setPhase('login'); setStaff(null) }}
        role={userRole}
      >
        {renderScreen()}
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
