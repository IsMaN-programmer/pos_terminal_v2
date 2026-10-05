import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import './App.css'
import './mobileWaiter.css'
import { isNativeMobile } from './services/capacitor'
import { prepareMobileData } from './services/dataStore'

if (isNativeMobile()) document.documentElement.classList.add('waiter-mobile')

void prepareMobileData().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary><App /></AppErrorBoundary>
    </StrictMode>,
  )
})
