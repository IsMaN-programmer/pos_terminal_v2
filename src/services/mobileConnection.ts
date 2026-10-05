import { CapacitorHttp } from '@capacitor/core'
import { isNativeMobile } from './capacitor'

const KEY = 'pos_v2_mobile_connection'
export function mobileConnection(): { host: string; name: string } {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return { host: '', name: '' } }
}
export function mobileTerminalName(): string {
  const cfg = mobileConnection()
  if (cfg.name) return cfg.name
  const name = `WAITER-${crypto.randomUUID().slice(0, 8)}`
  localStorage.setItem(KEY, JSON.stringify({ ...cfg, name }))
  return name
}
export function normalizeMasterHost(input: string): string {
  const value = input.trim().replace(/^http:\/\//, '').replace(/\/$/, '')
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(value)
  if (!match || match[1].split('.').some(x => Number(x) > 255) || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) throw new Error('invalid')
  return `${match[1]}:${match[2] || '5000'}`
}
export function saveMobileConnection(host: string): void {
  localStorage.setItem(KEY, JSON.stringify({ host, name: mobileTerminalName() }))
}
export function masterOrigin(): string {
  const host = mobileConnection().host
  return host ? `http://${host}` : ''
}

/** Native HTTP avoids WebView mixed-content and CORS restrictions on the LAN. */
export async function nativeHttp(url: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {}
  new Headers(init.headers).forEach((value, key) => { headers[key] = value })
  let data: unknown = init.body
  if (typeof data === 'string' && headers['content-type']?.includes('application/json')) data = JSON.parse(data)
  const result = await CapacitorHttp.request({ url, method: init.method || 'GET', headers, data, connectTimeout: 8000, readTimeout: 15000 })
  return new Response(result.status === 204 ? null : typeof result.data === 'string' ? result.data : JSON.stringify(result.data), {
    status: result.status || 502, headers: { 'Content-Type': result.headers?.['content-type'] || 'application/json' },
  })
}

export async function posFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!isNativeMobile()) return fetch(path, init)
  if (!masterOrigin()) throw new Error('Подключитесь к кассе в настройках Wi-Fi')
  return nativeHttp(masterOrigin() + path, init)
}
