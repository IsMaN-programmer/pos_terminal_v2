import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Screen } from '../data/types'
import { HomeIcon, BookIcon, BuildingIcon, TableIcon, SettingsIcon, FiscalIcon, SupportIcon } from './Icons'
import { UpdateButton } from '../updater'
import { useT } from '../i18n'

interface LayoutProps {
  currentScreen: Screen
  onNavigate: (screen: Screen) => void
  staffName: string
  onLogout: () => void
  role: string
  children: ReactNode
}

export default function Layout({ currentScreen, onNavigate, staffName, onLogout: _onLogout, role, children }: LayoutProps) {
  const [expanded, setExpanded] = useState(false)
  const t = useT()

  const LABEL: Record<string, string> = {
    tables: t('Столы', 'Stollar'),
    history: t('История', 'Tarix'),
    fiscal_module: t('ФМ', 'FM'),
    admin_dashboard: t('Панель', 'Panel'),
    admin_tables: t('Столы', 'Stollar'),
    admin_menu: t('Меню', 'Menyu'),
    admin_stock: t('Склад', 'Ombor'),
    admin_history: t('История', 'Tarix'),
    admin_reports: t('Отчеты', 'Hisobotlar'),
    admin_roles: t('Роли', 'Rollar'),
    admin_branches: t('Филиалы', 'Filiallar'),
    admin_settings: t('Настройки', 'Sozlamalar'),
    admin_support: t('Тех поддержка', 'Texnik yordam'),
  }

  const WAITER_NAV_ITEMS: { screen: Screen; icon: ReactNode; label: string }[] = [
    { screen: 'tables', icon: <HomeIcon />, label: LABEL.tables },
    { screen: 'history', icon: <BookIcon />, label: LABEL.history },
  ]

  const CASHIER_NAV_ITEMS: { screen: Screen; icon: ReactNode; label: string }[] = [
    { screen: 'tables', icon: <HomeIcon />, label: LABEL.tables },
    { screen: 'history', icon: <BookIcon />, label: LABEL.history },
    { screen: 'fiscal_module', icon: <FiscalIcon />, label: LABEL.fiscal_module },
  ]

  const ADMIN_NAV_ITEMS: { screen: Screen; icon: ReactNode; label: string }[] = [
    { screen: 'admin_dashboard', icon: <HomeIcon />, label: LABEL.admin_dashboard },
    { screen: 'admin_tables', icon: <TableIcon />, label: LABEL.admin_tables },
    { screen: 'admin_menu', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5v14" /><path d="M6 5v3a5 5 0 0 0 5 5" /><path d="M17 3v16" /><path d="M17 10a3 3 0 0 0 0-6" />
      </svg>
    ), label: LABEL.admin_menu },
    { screen: 'admin_stock', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ), label: LABEL.admin_stock },
    { screen: 'admin_history', icon: <BookIcon />, label: LABEL.admin_history },
    { screen: 'admin_reports', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ), label: LABEL.admin_reports },
    { screen: 'admin_roles', icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ), label: LABEL.admin_roles },
    { screen: 'admin_branches', icon: <BuildingIcon />, label: LABEL.admin_branches },
    { screen: 'admin_settings', icon: <SettingsIcon />, label: LABEL.admin_settings },
    { screen: 'admin_support', icon: <SupportIcon />, label: LABEL.admin_support },
  ]

  const navItems = role === 'admin' ? ADMIN_NAV_ITEMS : role === 'cashier' ? CASHIER_NAV_ITEMS : WAITER_NAV_ITEMS
  return (
    <div className="layout">
      <aside className={`sidebar${expanded ? ' expanded' : ''}`}>
        <div className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.screen}
              className={`sidebar-btn${currentScreen === item.screen ? ' active' : ''}`}
              onClick={() => onNavigate(item.screen)}
              title={item.label}
            >
              <span className="sidebar-icon">{item.icon}</span>
              {expanded && <span className="sidebar-label">{item.label}</span>}
            </button>
          ))}
        </div>
        <button className="sidebar-toggle" onClick={() => setExpanded(e => !e)} title={t('Навигация', 'Navigatsiya')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {role === 'admin' && (
          <div className="sidebar-bottom">
            <UpdateButton />
          </div>
        )}
        {role !== 'admin' && (
          <div className="sidebar-bottom">
            <button className={`sidebar-btn sidebar-profile-btn${currentScreen === 'profile' ? ' active' : ''}`} title={staffName} onClick={() => onNavigate('profile')}>
              <span className="sidebar-icon profile-nav-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              {expanded && <span className="sidebar-label">{staffName}</span>}
            </button>
          </div>
        )}
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}