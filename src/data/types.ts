export type TableStatus = 'free' | 'occupied' | 'ordered' | 'payment_pending' | 'reserved'

export interface Table {
  id: number
  name: string
  zone: string
  seats: number
  status: TableStatus
  guests?: number
  total?: number
  items?: number
  time?: string
}

export interface MenuItem {
  id: number
  name: string
  price: number
  category: string
  unit?: string
  unitCode?: string
  photo?: string
  mxik?: string
  mxikName?: string
  mxikMarking?: boolean
}

export interface OrderItem {
  id: number
  menuItem: MenuItem
  quantity: number
  unitPrice: number
  total: number
  comment?: string
}

export interface Order {
  id: string
  tableId: number
  tableName: string
  items: OrderItem[]
  guestCount: number
  timestamp: string
  status: 'active' | 'sent' | 'preparing' | 'ready' | 'paid' | 'cancelled'
  total: number
  comment?: string
}

export interface KitchenItem {
  id: number
  name: string
  quantity: number
  unitPrice: number
  total: number
  status: 'sent' | 'preparing' | 'ready' | 'waiting'
}

export interface ServiceCall {
  id: number
  type: string
  icon: string
  tableId: number
  tableName: string
  time: string
  status: 'new' | 'in_progress' | 'done'
}

export interface StaffMember {
  id: number
  name: string
  pin: string
  role: string
  position?: string
  staffId?: string
  rating?: number
}

export interface ShiftInfo {
  startTime: string
  endTime?: string
  totalSales: number
  tablesServed: number
}

export interface Notification {
  id: number
  category: string
  message: string
  time: string
  color: 'green' | 'blue' | 'orange' | 'red'
}

export type Screen =
  | 'tables'
  | 'menu'
  | 'order'
  | 'kitchen'
  | 'history'
  | 'payment'
  | 'cashier_payment'
  | 'check_receipt'
  | 'profile'
  | 'admin_dashboard'
  | 'admin_branches'
  | 'admin_tables'
  | 'admin_roles'
  | 'admin_history'
  | 'admin_menu'
  | 'admin_stock'
  | 'admin_settings'
  | 'admin_modifiers'
  | 'admin_reports'
  | 'fiscal_module'

export interface HistoryEntry {
  id: string
  tableId: number
  tableName: string
  zone: string
  timestamp: string
  itemCount: number
  total: number
  status: 'sent' | 'paid' | 'cancelled'
  paymentMethod?: 'cash' | 'card' | 'click'
  createdByRole?: string
  createdByName?: string
  items?: { id: number; name: string; quantity: number; unitPrice: number; total: number; mxik?: string; photo?: string }[]
  discountType?: 'percent' | 'amount'
  discountPercent?: number
  discountAmount?: number
  fiscalSign?: string
  qrCodeUrl?: string
  terminalId?: string
  receiptSeq?: number
  cabinetReceiptId?: string
  cabinetLocId?: string
  ofdStatus?: 'pending' | 'synced'
  factoryId?: string
}

export interface Branch {
  id: number
  name: string
  address: string
  phone: string
}

export interface StaffRecord {
  id: number
  name: string
  pin: string
  role: string
  phone: string
}

export interface ActiveTask {
  tableName: string
  description: string
  time: string
}
