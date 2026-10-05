import { useSyncExternalStore, type ReactNode } from 'react'
import { isNativeMobile } from '../services/capacitor'
import { mobileConnection } from '../services/mobileConnection'
import { getMobileSyncState, subscribeMobileSync } from '../services/dataStore'
import type { Screen } from '../data/types'
import { UpdateButton } from '../updater'
import { MobileUpdateButton, MobileUpdateModals, useMobileUpdate } from '../mobileUpdater'

function MobileUpdateEntry() {
  const { info, infoOpen, setInfoOpen, checking, openPanel } = useMobileUpdate()
  return (
    <>
      <MobileUpdateButton hasUpdate={!!info} busy={checking} onClick={openPanel} />
      <MobileUpdateModals info={info} infoOpen={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  )
}
import exitIcon from '../assets/icons/exit.png'
import { useT } from '../i18n'
import { useNetworkStore } from '../services/networkSocket'
import chairIcon from '../assets/icons/chair.png'
import fileIcon from '../assets/icons/file.png'
import shiftIcon from '../assets/icons/shift.png'
import cutleryIcon from '../assets/icons/cutlery.png'
import clipboardIcon from '../assets/icons/clipboard.png'
import usbIcon from '../assets/icons/usb.png'
import dashboardIcon from '../assets/icons/dashboard.png'
import billIcon from '../assets/icons/bill.png'
import userIcon from '../assets/icons/user.png'
import locationIcon from '../assets/icons/location.png'
import featuresIcon from '../assets/icons/features.png'
import naturalIcon from '../assets/icons/natural.png'
import settingsIcon from '../assets/icons/settings.png'
import supportIcon from '../assets/icons/support.png'

interface LayoutProps {
  currentScreen: Screen
  onNavigate: (screen: Screen) => void
  staffName: string
  onLogout: () => void
  role: string
  children: ReactNode
}

export default function Layout({ currentScreen, onNavigate, staffName, onLogout: _onLogout, role, children }: LayoutProps) {
  const t = useT()
  const net = useNetworkStore()
  const sync = useSyncExternalStore(subscribeMobileSync, getMobileSyncState)
  const mobile = isNativeMobile()
  const blocked = mobile && !!mobileConnection().host && (net.connection !== 'connected' || !sync.ready)

  const isSlave = net.role === 'slave'
  const connLost = isSlave && net.connection !== 'connected'
  const bannerText = isSlave && connLost
    ? net.connection === 'kicked'
      ? t('Отключено администратором кассы', 'Kassa administratori tomonidan uzildi', 'Disconnected by cash register administrator')
      : t('Нет связи с кассой — переподключение...', 'Kassa bilan aloqa yo\'q — qayta ulanmoqda...', 'No connection to cash register — reconnecting...')
    : ''

  const LABEL: Record<string, string> = {
    tables: t('Столы', 'Stollar', 'Tables'),
    menu: t('Меню', 'Menyu', 'Menu'),
    orders: t('Заказы', 'Buyurtmalar', 'Orders'),
    history: t('История', 'Tarix', 'History'),
    fiscal_module: t('ФМ', 'FM', 'FM'),
    admin_dashboard: t('Панель', 'Panel', 'Dashboard'),
    admin_tables: t('Столы', 'Stollar', 'Tables'),
    admin_menu: t('Меню', 'Menyu', 'Menu'),
    admin_stock: t('Товары', 'Mahsulotlar', 'Products'),
    admin_ingredients: t('Ингредиенты', 'Ingredientlar', 'Ingredients'),
    admin_history: t('Отчеты', 'Hisobotlar', 'Reports'),
    admin_reports: t('Чеки', 'Cheklar', 'Receipts'),
    admin_shift: t('Смена', 'Smena', 'Shift'),
    admin_roles: t('Роли', 'Rollar', 'Roles'),
    admin_branches: t('Филиалы', 'Filiallar', 'Branches'),
    admin_settings: t('Настройки', 'Sozlamalar', 'Settings'),
    admin_support: t('Помощь', 'Yordam', 'Help'),
  }

  const WAITER_NAV_ITEMS: { screen: Screen; icon: ReactNode; label: string }[] = [
    { screen: 'tables', icon: <img src={chairIcon} alt="" className="sidebar-nav-img" />, label: LABEL.tables },
    { screen: 'menu', icon: <img src={cutleryIcon} alt="" className="sidebar-nav-img" />, label: LABEL.menu },
    { screen: 'orders', icon: <img src={fileIcon} alt="" className="sidebar-nav-img" />, label: LABEL.orders },
    { screen: 'history', icon: <img src={clipboardIcon} alt="" className="sidebar-nav-img" />, label: LABEL.history },
  ]

  const CASHIER_NAV_ITEMS: { screen: Screen; icon: ReactNode; label: string }[] = [
    { screen: 'tables', icon: <img src={chairIcon} alt="" className="sidebar-nav-img" />, label: LABEL.tables },
    { screen: 'menu', icon: <img src={cutleryIcon} alt="" className="sidebar-nav-img" />, label: LABEL.menu },
    { screen: 'orders', icon: <img src={fileIcon} alt="" className="sidebar-nav-img" />, label: LABEL.orders },
    { screen: 'history', icon: <img src={clipboardIcon} alt="" className="sidebar-nav-img" />, label: LABEL.history },
    ...(!mobile ? [{ screen: 'fiscal_module' as Screen, icon: <img src={usbIcon} alt="" className="sidebar-nav-img usb-nav-img" />, label: LABEL.fiscal_module }] : []),
  ]

  const ADMIN_NAV_ITEMS: { screen: Screen; icon: ReactNode; label: string }[] = [
    { screen: 'admin_dashboard', icon: <img src={dashboardIcon} alt="" className="sidebar-nav-img" />, label: LABEL.admin_dashboard },
    { screen: 'admin_tables', icon: <img src={chairIcon} alt="" className="sidebar-nav-img" />, label: LABEL.admin_tables },
    { screen: 'admin_menu', icon: <img src={cutleryIcon} alt="" className="sidebar-nav-img" />, label: LABEL.admin_menu },
    { screen: 'admin_stock', icon: <img src={featuresIcon} alt="" className="sidebar-nav-img" />, label: LABEL.admin_stock },
    { screen: 'admin_ingredients', icon: <img src={naturalIcon} alt="" className="sidebar-nav-img" />, label: LABEL.admin_ingredients },
    { screen: 'admin_history', icon: <img src={clipboardIcon} alt="" className="sidebar-nav-img" />, label: LABEL.admin_history },
    { screen: 'admin_reports', icon: <img src={billIcon} alt="" className="sidebar-nav-img" />, label: LABEL.admin_reports },
    { screen: 'admin_shift', icon: <img src={shiftIcon} alt="" className="sidebar-nav-img" />, label: LABEL.admin_shift },
    { screen: 'admin_roles', icon: <img src={userIcon} alt="" className="sidebar-nav-img" />, label: LABEL.admin_roles },
    { screen: 'admin_branches', icon: <img src={locationIcon} alt="" className="sidebar-nav-img" />, label: LABEL.admin_branches },
    { screen: 'admin_settings', icon: <img src={settingsIcon} alt="" className="sidebar-nav-img" />, label: LABEL.admin_settings },
    { screen: 'admin_support', icon: <img src={supportIcon} alt="" className="sidebar-nav-img" />, label: LABEL.admin_support },
  ]

  const navItems = role === 'admin' ? ADMIN_NAV_ITEMS : role === 'cashier' ? CASHIER_NAV_ITEMS : WAITER_NAV_ITEMS
  return (
    <div className={`layout${blocked ? ' mobile-connection-blocked' : ''}`}>
      <aside className="sidebar" inert={blocked ? true : undefined}>
        <div className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.screen}
              className={`sidebar-btn${currentScreen === item.screen ? ' active' : ''}`}
              onClick={() => onNavigate(item.screen)}
              title={item.label}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </button>
          ))}
          {role === 'admin' && (isNativeMobile() ? <MobileUpdateEntry /> : <UpdateButton />)}
          {role !== 'waiter' && (
            <button
              className="sidebar-btn sidebar-exit-btn"
              onClick={() => { window.electronAPI?.exitFullscreen?.() }}
              title={t('Выйти', 'Chiqish', 'Exit')}
            >
              <span className="sidebar-icon">
                <img src={exitIcon} alt="" className="sidebar-nav-img" />
              </span>
              <span className="sidebar-label">{t('Выйти', 'Chiqish', 'Exit')}</span>
            </button>
          )}
        </div>
        {role !== 'admin' && (
          <div className="sidebar-bottom">
            <button className={`sidebar-btn sidebar-profile-btn${currentScreen === 'profile' ? ' active' : ''}`} title={staffName} onClick={() => onNavigate('profile')}>
              <span className="sidebar-icon profile-nav-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <span className="sidebar-label">{staffName}</span>
            </button>
          </div>
        )}
      </aside>
      <main className="main-content">
        {isSlave && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 50,
            padding: '8px 16px', fontSize: 13, fontWeight: 600, textAlign: 'center',
            background: connLost ? '#fef2f2' : '#f0fdf4',
            color: connLost ? '#dc2626' : '#16a34a',
            borderBottom: `1px solid ${connLost ? '#fecaca' : '#bbf7d0'}`,
          }}>
            {connLost ? bannerText : `${t('Подключено к кассе', 'Kassaga ulangan', 'Connected to cash register')} ${net.masterIp}`}
          </div>
        )}
        {mobile && !!mobileConnection().host && sync.error && <div role="alert" className="pin-error" style={{ padding: 12 }}>{sync.error}</div>}
        <div className="mobile-content-shell" inert={blocked ? true : undefined}>{children}</div>
      </main>
    </div>
  )
}
