import { io, type Socket } from 'socket.io-client'
import { useSyncExternalStore } from 'react'
import { getNetworkConfig } from './network'
import { dataStore, getMobileSyncState, mobileDisconnected, setMobileCommitHandler, syncMobileConnection } from './dataStore'
import { isNativeMobile } from './capacitor'
import { masterOrigin, posFetch } from './mobileConnection'
import { commitMobileChanges } from './mobileOrderSync'
import type { NetworkRole, TerminalInfo } from './network'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'kicked'

export interface NetworkState {
  ready: boolean
  role: NetworkRole
  terminalName: string
  masterIp: string
  connection: ConnectionState
  terminals: TerminalInfo[]
}

let state: NetworkState = {
  ready: false,
  role: 'neutral',
  terminalName: '',
  masterIp: '',
  connection: 'idle',
  terminals: [],
}

const listeners = new Set<() => void>()

function setState(patch: Partial<NetworkState>) {
  state = { ...state, ...patch }
  listeners.forEach(l => l())
}

let socket: Socket | null = null
let initPromise: Promise<void> | null = null
let mobileRetry: ReturnType<typeof setInterval> | undefined
let mobileHealthChecking = false
let mobileHealthAt = 0
let mobileLastPullAt = 0
function mobileWasKicked() { return state.connection === 'kicked' }

async function checkMobileHttpConnection(): Promise<void> {
  if (!isNativeMobile() || !masterOrigin() || mobileWasKicked() || mobileHealthChecking || Date.now() - mobileHealthAt < 8000) return
  mobileHealthChecking = true
  mobileHealthAt = Date.now()
  try {
    const response = await posFetch('/api/network/status')
    const status = await response.json()
    if (!response.ok || status.role !== 'master') throw new Error('Cash register unavailable')
    if (!mobileWasKicked() && !socket?.connected) {
      setState({ connection: 'connected' })
      if (!getMobileSyncState().ready || Date.now() - mobileLastPullAt >= 10000) {
        await syncMobileConnection()
        mobileLastPullAt = Date.now()
      }
    }
  } catch {
    if (!mobileWasKicked()) {
      mobileDisconnected()
      setState({ connection: 'reconnecting' })
    }
  } finally {
    mobileHealthChecking = false
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getState() {
  return state
}

export function useNetworkStore(): NetworkState {
  return useSyncExternalStore(subscribe, getState)
}

function socketOrigin(): string | undefined {
  if (isNativeMobile()) return masterOrigin()
  if (window.electronAPI?.isDesktop) return undefined
  return 'http://localhost:5000'
}

export async function reconnectNetwork(): Promise<void> {
  initPromise = null
  await initNetwork()
}

export function initNetwork(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const cfg = await getNetworkConfig()
    setState({ role: cfg.role, terminalName: cfg.terminalName, masterIp: cfg.masterIp, ready: true })
    connectSocket(cfg.role)
  })()
  return initPromise
}

export function waitForNetworkConfig(timeoutMs = 5000): Promise<void> {
  return new Promise(resolve => {
    if (state.ready) { resolve(); return }
    const timer = setTimeout(finish, timeoutMs)
    const listener = () => { if (state.ready) finish() }
    function finish() { clearTimeout(timer); listeners.delete(listener); resolve() }
    listeners.add(listener)
  })
}

export function waitForNetworkSocket(timeoutMs = 8000): Promise<void> {
  return new Promise(resolve => {
    if (state.connection !== 'idle') { resolve(); return }
    const timer = setTimeout(finish, timeoutMs)
    const listener = () => { if (state.connection !== 'idle') finish() }
    function finish() { clearTimeout(timer); listeners.delete(listener); resolve() }
    listeners.add(listener)
  })
}

export function setRoleLocal(role: NetworkRole) {
  setState({ role })
  if (socket) socket.disconnect()
  connectSocket(role)
}

function connectSocket(role: NetworkRole) {
  clearInterval(mobileRetry)
  mobileHealthAt = 0
  mobileLastPullAt = 0
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
  }
  if (isNativeMobile()) {
    setMobileCommitHandler(commitMobileChanges)
    mobileDisconnected()
    if (!masterOrigin()) { setState({ connection: 'disconnected' }); return }
  }

  socket = io(socketOrigin() as any, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 5000,
    ...(isNativeMobile() ? { transports: ['websocket'] } : {}),
  })

  if (isNativeMobile()) {
    mobileRetry = setInterval(() => {
      if (socket?.connected) {
        if (!getMobileSyncState().ready) void syncMobileConnection()
      } else void checkMobileHttpConnection()
    }, 10000)
  }

  socket.on('connect', () => {
    setState({ connection: 'connected' })
    if (role === 'slave') {
      socket?.emit('terminal:hello', {
        id: state.terminalName || 'TERMINAL',
        name: state.terminalName || 'TERMINAL',
      })
    }
    if (isNativeMobile()) {
      void syncMobileConnection()
    } else dataStore.syncAll()
  })

  socket.on('disconnect', () => {
    if (isNativeMobile()) { void checkMobileHttpConnection(); return }
    if (state.connection !== 'kicked') setState({ connection: 'reconnecting' })
  })

  socket.on('connect_error', () => {
    if (isNativeMobile()) { void checkMobileHttpConnection(); return }
    setState({ connection: state.connection === 'connected' ? 'reconnecting' : 'connecting' })
  })

  socket.on('kicked', () => {
    setState({ connection: 'kicked' })
    if (isNativeMobile()) { setMobileCommitHandler(null); mobileDisconnected() }
    socket?.disconnect()
  })

  socket.on('data:update', (payload: { key?: string; value?: string | null }) => {
    if (payload && typeof payload.key === 'string') {
      dataStore.applyExternal(payload.key, payload.value ?? null)
    }
  })

  socket.on('data:cleared', () => {
    dataStore.syncAll()
  })

  socket.on('terminals:update', (terminals: TerminalInfo[]) => {
    if (Array.isArray(terminals)) setState({ terminals })
  })

  socket.on('printers:request', async () => {
    if (isNativeMobile()) { socket?.emit('printers:list', { printers: [] }); return }
    try {
      const base = window.electronAPI?.isDesktop ? 'http://127.0.0.1:5000' : ''
      const r = await fetch(`${base}/api/printers`)
      const d = await r.json()
      socket?.emit('printers:list', { printers: Array.isArray(d?.printers) ? d.printers : [] })
    } catch {
      socket?.emit('printers:list', { printers: [] })
    }
  })
}

export function refreshTerminals() {
  if (state.role === 'master') {
    fetch('/api/network/printers/refresh', { method: 'POST' }).catch(() => {})
    fetch('/api/network/terminals')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d?.terminals)) setState({ terminals: d.terminals })
      })
      .catch(() => {})
  }
}
