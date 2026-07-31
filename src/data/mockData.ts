import type { Table, MenuItem, Order, KitchenItem, ServiceCall, Notification, ActiveTask, ShiftInfo } from './types'

export const MOCK_TABLES: Table[] = [
  { id: 1, name: 'Стол 1', zone: 'ОСНОВНОЙ ЗАЛ', seats: 4, status: 'free' },
  { id: 2, name: 'Стол 2', zone: 'ОСНОВНОЙ ЗАЛ', seats: 4, status: 'free' },
  { id: 3, name: 'Стол 3', zone: 'ОСНОВНОЙ ЗАЛ', seats: 2, status: 'free' },
  { id: 4, name: 'Стол 4', zone: 'ОСНОВНОЙ ЗАЛ', seats: 4, status: 'free' },
  { id: 5, name: 'Стол 5', zone: 'ОСНОВНОЙ ЗАЛ', seats: 6, status: 'free' },
  { id: 6, name: 'Стол 6', zone: 'ОСНОВНОЙ ЗАЛ', seats: 4, status: 'free' },
  { id: 7, name: 'Стол 7', zone: 'ОСНОВНОЙ ЗАЛ', seats: 4, status: 'free' },
  { id: 8, name: 'Стол 8', zone: 'ОСНОВНОЙ ЗАЛ', seats: 2, status: 'free' },
  { id: 9, name: 'Стол 9', zone: 'ОСНОВНОЙ ЗАЛ', seats: 4, status: 'free' },
  { id: 10, name: 'Стол 10', zone: 'ОСНОВНОЙ ЗАЛ', seats: 4, status: 'free' },
  { id: 11, name: 'Терраса 1', zone: 'ТЕРРАСА', seats: 4, status: 'free' },
  { id: 12, name: 'Терраса 2', zone: 'ТЕРРАСА', seats: 4, status: 'free' },
  { id: 13, name: 'Терраса 3', zone: 'ТЕРРАСА', seats: 6, status: 'free' },
  { id: 14, name: 'Терраса 4', zone: 'ТЕРРАСА', seats: 4, status: 'free' },
  { id: 15, name: 'Терраса 5', zone: 'ТЕРРАСА', seats: 4, status: 'free' },
  { id: 16, name: 'VIP 1', zone: 'VIP ЗОНА', seats: 8, status: 'free' },
  { id: 17, name: 'VIP 2', zone: 'VIP ЗОНА', seats: 6, status: 'free' },
  { id: 18, name: 'VIP 3', zone: 'VIP ЗОНА', seats: 8, status: 'free' },
  { id: 19, name: 'VIP 4', zone: 'VIP ЗОНА', seats: 6, status: 'free' },
]

export const MENU_IMAGES: Record<string, string> = {
  'Лагман': '/menu-images/images (2).jfif',
  'Плов': '/menu-images/samarkandskiy-plov-3.jpg',
  'Манты': '/menu-images/samsa-iz-sloenogo-testa-samsa-iz-sloenogo-testa-v-duxovke14903002671ma.webp',
  'Шашлык': '/menu-images/shashlyk-iz-baraniny.jpg',
  'Пицца Пепперони': '/menu-images/750x750-9b2d792c-266d-41c6-af4c-e50ddcd703ed.jpg',
  'Цезарь': '/menu-images/htmlimage (36)-1024x683.jpg',
  'Coca Cola 1L': '/menu-images/e1a14270-9204-4675-b067-b748748ce74c.webp',
  'Американо': '/menu-images/black-tea-with-dry-tea-teapot-wooden-surface-side-view_176474-6302.avif',
  'Норин': '/menu-images/sup-ugra-oshi-2.jpg',
  'Чучвара': '/menu-images/7fe3ae940043cfaa.jpeg',
  'Греческий салат': '/menu-images/5a71adf5-3716-49f3-843e-001880cb3a49.webp',
  'Табуле': '/menu-images/imgonline-com-ua-Resize-pGO5fk7vFC.jpg',
  'Fanta 1L': '/menu-images/2951721_24651-710x550x.jpg',
  'Вода 1.5L': '/menu-images/images (1).jfif',
  'Латте': '/menu-images/DSC07809-1000x667.jpg',
  'Тирамису': '/menu-images/original.webp',
  'Панна Котта': '/menu-images/images (4).jfif',
  'Лагман + Салат': '/menu-images/Depositphotos_74432563_xl-2015_1556195455-e1556195544193-630x315.jpg',
  'Пицца + Напиток': '/menu-images/images (5).jfif',
  'Шашлык + Лаваш': '/menu-images/images (6).jfif',
}

export const MOCK_MENU: MenuItem[] = [
  { id: 1, name: "Лагман", price: 45000, category: 'Популярное', photo: MENU_IMAGES['Лагман'], mxik: '10202001002000000' },
  { id: 2, name: 'Плов', price: 40000, category: 'Популярное', photo: MENU_IMAGES['Плов'], mxik: '10202001002000000' },
  { id: 3, name: 'Манты', price: 40000, category: 'Популярное', photo: MENU_IMAGES['Манты'] },
  { id: 4, name: 'Шашлык', price: 65000, category: 'Популярное', photo: MENU_IMAGES['Шашлык'] },
  { id: 5, name: 'Пицца Пепперони', price: 60000, category: 'Популярное', photo: MENU_IMAGES['Пицца Пепперони'] },
  { id: 6, name: 'Цезарь', price: 38000, category: 'Популярное', photo: MENU_IMAGES['Цезарь'] },
  { id: 7, name: 'Coca Cola 1L', price: 10000, category: 'Популярное', photo: MENU_IMAGES['Coca Cola 1L'], mxik: '02202002001010009' },
  { id: 8, name: 'Американо', price: 18000, category: 'Популярное', photo: MENU_IMAGES['Американо'] },
  { id: 9, name: "Лагман", price: 45000, category: 'Кухня', photo: MENU_IMAGES['Лагман'] },
  { id: 10, name: 'Плов', price: 40000, category: 'Кухня', photo: MENU_IMAGES['Плов'] },
  { id: 11, name: 'Манты', price: 40000, category: 'Кухня', photo: MENU_IMAGES['Манты'] },
  { id: 12, name: 'Шашлык', price: 65000, category: 'Кухня', photo: MENU_IMAGES['Шашлык'] },
  { id: 13, name: 'Норин', price: 42000, category: 'Кухня', photo: MENU_IMAGES['Норин'] },
  { id: 14, name: 'Чучвара', price: 35000, category: 'Кухня', photo: MENU_IMAGES['Чучвара'] },
  { id: 15, name: 'Цезарь', price: 38000, category: 'Салаты', photo: MENU_IMAGES['Цезарь'] },
  { id: 16, name: 'Греческий салат', price: 32000, category: 'Салаты', photo: MENU_IMAGES['Греческий салат'] },
  { id: 17, name: 'Табуле', price: 35000, category: 'Салаты', photo: MENU_IMAGES['Табуле'] },
  { id: 18, name: 'Coca Cola 1L', price: 10000, category: 'Напитки', photo: MENU_IMAGES['Coca Cola 1L'], mxik: '02202002001010009' },
  { id: 19, name: 'Fanta 1L', price: 10000, category: 'Напитки', photo: MENU_IMAGES['Fanta 1L'], mxik: '02202002001010009' },
  { id: 20, name: 'Вода 1.5L', price: 5000, category: 'Напитки', photo: MENU_IMAGES['Вода 1.5L'] },
  { id: 21, name: 'Американо', price: 18000, category: 'Напитки', photo: MENU_IMAGES['Американо'] },
  { id: 22, name: 'Латте', price: 22000, category: 'Напитки', photo: MENU_IMAGES['Латте'] },
  { id: 23, name: 'Тирамису', price: 35000, category: 'Десерты', photo: MENU_IMAGES['Тирамису'] },
  { id: 24, name: 'Панна Котта', price: 30000, category: 'Десерты', photo: MENU_IMAGES['Панна Котта'] },
  { id: 25, name: "Лагман + Салат", price: 70000, category: 'Комбо', photo: MENU_IMAGES['Лагман + Салат'] },
  { id: 26, name: 'Пицца + Напиток', price: 60000, category: 'Комбо', photo: MENU_IMAGES['Пицца + Напиток'] },
  { id: 27, name: 'Шашлык + Лаваш', price: 60000, category: 'Комбо', photo: MENU_IMAGES['Шашлык + Лаваш'] },
]

export const MENU_CATEGORIES = ['Популярное', 'Кухня', 'Салаты', 'Напитки', 'Десерты', 'Комбо']

export const MOCK_ORDER: Order = {
  id: 'ord-001',
  tableId: 3,
  tableName: 'Стол 3',
  guestCount: 2,
  timestamp: '05.05.2025 13:45',
  status: 'active',
  total: 143000,
  items: [
    { id: 1, menuItem: MOCK_MENU[0], quantity: 1, unitPrice: 45000, total: 45000 },
    { id: 2, menuItem: MOCK_MENU[1], quantity: 1, unitPrice: 40000, total: 40000 },
    { id: 3, menuItem: MOCK_MENU[6], quantity: 2, unitPrice: 10000, total: 20000 },
    { id: 4, menuItem: MOCK_MENU[5], quantity: 1, unitPrice: 38000, total: 38000 },
  ],
}

export const MOCK_KITCHEN_ITEMS: KitchenItem[] = [
  { id: 1, name: "Лагман", quantity: 1, unitPrice: 45000, total: 45000, status: 'sent' },
  { id: 2, name: 'Плов', quantity: 1, unitPrice: 40000, total: 40000, status: 'preparing' },
  { id: 3, name: 'Coca Cola 1L', quantity: 2, unitPrice: 10000, total: 20000, status: 'sent' },
  { id: 4, name: 'Цезарь', quantity: 1, unitPrice: 38000, total: 38000, status: 'waiting' },
]

export const MOCK_SERVICE_CALLS: ServiceCall[] = [
  { id: 1, type: 'Вода', icon: 'water', tableId: 7, tableName: 'Стол 7', time: '13:40', status: 'new' },
  { id: 2, type: 'Счёт', icon: 'receipt', tableId: 3, tableName: 'Стол 3', time: '13:41', status: 'new' },
  { id: 3, type: 'Доп. посуда', icon: 'plate', tableId: 12, tableName: 'Терраса 2', time: '13:42', status: 'in_progress' },
  { id: 4, type: 'Вызов официанта', icon: 'wave', tableId: 17, tableName: 'VIP 2', time: '13:43', status: 'in_progress' },
  { id: 5, type: 'Уборка', icon: 'broom', tableId: 5, tableName: 'Стол 5', time: '13:39', status: 'done' },
]

const TABLES = [
  { name: 'Стол 1', zone: 'ОСНОВНОЙ ЗАЛ' }, { name: 'Стол 2', zone: 'ОСНОВНОЙ ЗАЛ' },
  { name: 'Стол 3', zone: 'ОСНОВНОЙ ЗАЛ' }, { name: 'Стол 4', zone: 'ОСНОВНОЙ ЗАЛ' },
  { name: 'Стол 5', zone: 'ОСНОВНОЙ ЗАЛ' }, { name: 'Стол 6', zone: 'ОСНОВНОЙ ЗАЛ' },
  { name: 'Терраса 1', zone: 'ТЕРРАСА' }, { name: 'Терраса 2', zone: 'ТЕРРАСА' },
  { name: 'Терраса 3', zone: 'ТЕРРАСА' }, { name: 'Терраса 4', zone: 'ТЕРРАСА' },
  { name: 'VIP 1', zone: 'VIP ЗОНА' }, { name: 'VIP 2', zone: 'VIP ЗОНА' },
  { name: 'VIP 3', zone: 'VIP ЗОНА' }, { name: 'VIP 4', zone: 'VIP ЗОНА' },
]

const STATUSES = ['sent', 'paid', 'cancelled'] as const
const ROLES = ['waiter', 'cashier'] as const

function generateMockHistory(count: number) {
  const items = []
  for (let i = 0; i < count; i++) {
    const table = TABLES[i % TABLES.length]
    const day = 5 + Math.floor(i / 5)
    const hour = 10 + (i % 8)
    const min = (i * 7) % 60
    items.push({
      id: String(i + 1),
      tableId: i + 1,
      tableName: table.name,
      zone: table.zone,
      timestamp: `${String(day).padStart(2, '0')}.05.2025 ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
      itemCount: 1 + (i % 5),
      total: 15000 * (i + 1),
      status: STATUSES[i % STATUSES.length] as 'sent' | 'paid' | 'cancelled',
      createdByRole: ROLES[i % ROLES.length],
    })
  }
  return items
}

export const MOCK_HISTORY = generateMockHistory(50)

export const MOCK_STAFF = {
  id: 1,
  name: 'Эльдор Сайдуллаев',
  position: 'Официант',
  staffId: 'WTR-021',
  rating: 4.8,
}

export const MOCK_SHIFT: ShiftInfo = {
  startTime: '05.05.2025 09:00',
  totalSales: 1245000,
  tablesServed: 24,
}

export const MOCK_ACTIVE_TASKS: ActiveTask[] = [
  { tableName: 'Стол 3', description: 'Заказ отправлен', time: '13:46' },
  { tableName: 'Стол 7', description: 'Вызов: принести воду', time: '13:40' },
  { tableName: 'Терраса 2', description: 'Вызов: доп. посуда', time: '13:42' },
]

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 1, category: 'Кухня', message: 'Лагман готов', time: '13:47', color: 'green' },
  { id: 2, category: 'Кухня', message: 'Цезарь готов', time: '13:47', color: 'green' },
  { id: 3, category: 'Касса', message: 'Стол V2: счёт оплачен', time: '13:43', color: 'blue' },
  { id: 4, category: 'Система', message: 'Интернет стабилен', time: '13:30', color: 'green' },
]
