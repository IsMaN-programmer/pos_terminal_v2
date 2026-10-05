import { isNativeMobile } from './capacitor'
import { mobileConnection, mobileTerminalName, nativeHttp, normalizeMasterHost, saveMobileConnection } from './mobileConnection'
import { hasMobilePendingChanges, resetMobileData, restoreMobileStandaloneData, saveMobileStandaloneData } from './dataStore'

export type NetworkRole = 'neutral' | 'master' | 'slave'

export interface NetworkConfig {
  role: NetworkRole
  masterIp: string
  terminalName: string
}

export interface TerminalInfo {
  id: string
  name: string
  ip: string
  connected: boolean
  connectedAt: string
  lostAt: string
  printers?: string[]
}

export interface PrinterTarget {
  terminal: string
  printer: string
}

export interface PrinterTargets {
  receipt: PrinterTarget
  kitchen: PrinterTarget
  waiter: PrinterTarget
}

export interface NetworkStatus {
  ok: boolean
  role: NetworkRole
  masterIp: string
  ip: string
  port: number
  hostname: string
  printers: PrinterTargets
  terminals: TerminalInfo[]
}

export async function getNetworkConfig(): Promise<NetworkConfig> {
  if (isNativeMobile()) return { role: mobileConnection().host ? 'slave' : 'neutral', masterIp: mobileConnection().host || '', terminalName: mobileTerminalName() }
  if (window.electronAPI?.getNetworkConfig) {
    const cfg = await window.electronAPI.getNetworkConfig()
    return { role: (cfg.role as NetworkRole) || 'neutral', masterIp: cfg.masterIp || '', terminalName: cfg.terminalName || '' }
  }
  try {
    const res = await fetch('/api/network/status')
    const data = await res.json()
    return { role: (data.role as NetworkRole) || 'neutral', masterIp: data.masterIp || '', terminalName: data.hostname || '' }
  } catch {
    return { role: 'neutral', masterIp: '', terminalName: '' }
  }
}

export async function getNetworkStatus(): Promise<NetworkStatus | null> {
  try {
    const res = await fetch('/api/network/status')
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function setMasterRole(): Promise<boolean> {
  try {
    const res = await fetch('/api/network/role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'master' }),
    })
    return (await res.json()).ok === true
  } catch {
    return false
  }
}

export async function setNeutralRole(): Promise<boolean> {
  try {
    const res = await fetch('/api/network/role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'neutral' }),
    })
    return (await res.json()).ok === true
  } catch {
    return false
  }
}

export async function setSlaveRole(masterIp: string): Promise<{ ok: boolean; error?: string }> {
  if (isNativeMobile()) {
    let host: string
    try { host = normalizeMasterHost(masterIp) } catch { return { ok: false, error: 'invalid' } }
    try {
      const res = await nativeHttp(`http://${host}/api/network/status`)
      const status = await res.json()
      if (!res.ok || status.role !== 'master') return { ok: false, error: 'Включите «Создать IP» в настройках главной кассы.' }
      if (mobileConnection().host !== host) {
        if (hasMobilePendingChanges()) return { ok: false, error: 'Сначала отправьте сохранённые заказы на прежнюю кассу.' }
        saveMobileStandaloneData()
        resetMobileData()
      }
      saveMobileConnection(host)
      window.dispatchEvent(new Event('pos:mobile-connection-changed'))
      return { ok: true }
    } catch { return { ok: false, error: 'Касса недоступна. Проверьте IP, общий Wi-Fi и разрешение входящих подключений на ПК (порт 5000).' } }
  }
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(masterIp.trim())) {
    return { ok: false, error: 'invalid' }
  }
  try {
    const res = await fetch('/api/network/role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'slave', masterIp: masterIp.trim() }),
    })
    const data = await res.json()
    return { ok: data.ok === true }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export async function kickTerminal(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/network/kick/${encodeURIComponent(id)}`, { method: 'POST' })
    return (await res.json()).ok === true
  } catch {
    return false
  }
}

export async function saveNetworkPrinters(receipt: PrinterTarget, kitchen: PrinterTarget, waiter: PrinterTarget): Promise<boolean> {
  try {
    const res = await fetch('/api/network/printers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipt, kitchen, waiter }),
    })
    return (await res.json()).ok === true
  } catch {
    return false
  }
}

export async function restartAsSlave(): Promise<void> {
  if (window.electronAPI?.restartApp) {
    await window.electronAPI.restartApp()
  }
}

export async function resetSlaveMode(): Promise<boolean> {
  if (isNativeMobile()) {
    if (hasMobilePendingChanges()) return false
    saveMobileConnection('')
    resetMobileData()
    restoreMobileStandaloneData()
    window.dispatchEvent(new Event('pos:mobile-connection-changed'))
    return true
  }
  if (window.electronAPI?.resetNetworkMode) {
    try {
      const res = await window.electronAPI.resetNetworkMode()
      return res?.ok === true
    } catch {
      return false
    }
  }
  return false
}
