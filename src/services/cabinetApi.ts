/**
 * Cabinet (POSVK) API client for the desktop terminal.
 * Mirrors the mobile app flow: login stores a token, then
 * /desktop/user-details returns the organization's requisites.
 */
import { dataStore } from './dataStore'
import { isNativeMobile } from './capacitor'
import { cabinetFetch } from './cabinetTransport'

export const CABINET_VERSION_KEY = '7760BA2B102041B99A24DD9D823FB9AE'

export function signInCabinet(username: string, password: string, terminalId: string): Promise<Response> {
  const mobile = isNativeMobile()
  return cabinetFetch(mobile ? '/api/cabinet-proxy/auth/sign-in' : '/api/cabinet-proxy/desktop/auth/sign-in', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mobile ? { username: username.trim(), password } : { username, password, terminalId, versionKey: CABINET_VERSION_KEY }),
    signal: AbortSignal.timeout(15000),
  })
}

export interface CabinetCompany {
  id?: number | string
  name?: string
  correctName?: string
  address?: string
  tin?: string
  cashId?: number | string
  userId?: number | string
  terminalId?: string
  pointKey?: string
  status?: number
}

export interface CabinetUserDetails {
  company?: CabinetCompany
  user?: Record<string, unknown>
}

export async function fetchCabinetUserDetails(token?: string): Promise<CabinetUserDetails> {
  const cleanToken = (token?.trim() || dataStore.getItem('pos_v2_cabinet_token') || '').trim()
  const terminalId = dataStore.getItem('pos_v2_fm_terminal_id') || ''
  if (!cleanToken) throw new Error('Cabinet token missing')

  const res = await cabinetFetch('/api/cabinet-proxy/desktop/user-details', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cleanToken}`,
    },
    body: JSON.stringify({ terminalId, versionKey: CABINET_VERSION_KEY }),
  })
  if (!res.ok) throw new Error(`Cabinet API error: ${res.status}`)

  const json = await res.json().catch(() => null)
  const payload =
    json && typeof json === 'object' && json.data && typeof json.data === 'object'
      ? (json.data as { company?: CabinetCompany; user?: Record<string, unknown> })
      : (json as { company?: CabinetCompany; user?: Record<string, unknown> })

  return {
    company: payload?.company ?? undefined,
    user: payload?.user ?? undefined,
  }
}
