import { CapacitorHttp } from '@capacitor/core'
import { isNativeMobile } from './capacitor'

const PROXY_PREFIX = '/api/cabinet-proxy/'
const CABINET_BASE = 'https://cabinet.posvk.uz/api/cabinet-api/'

/** Use the desktop proxy on web/Electron, native HTTP in the Android WebView. */
export async function cabinetFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!isNativeMobile()) return fetch(path, init)
  if (!path.startsWith(PROXY_PREFIX)) throw new Error('Invalid Cabinet API path')

  const headers: Record<string, string> = {}
  new Headers(init.headers).forEach((value, key) => { headers[key] = value })
  const method = (init.method || 'GET').toUpperCase()
  const rawBody = init.body
  let data: unknown
  if (typeof rawBody === 'string') {
    try { data = JSON.parse(rawBody) } catch { data = rawBody }
  } else if (rawBody != null) {
    throw new Error('Unsupported Cabinet request body')
  }

  const result = await CapacitorHttp.request({
    url: CABINET_BASE + path.slice(PROXY_PREFIX.length),
    method,
    headers,
    data,
    connectTimeout: 15000,
    readTimeout: 15000,
  })
  const body = typeof result.data === 'string'
    ? result.data
    : JSON.stringify(result.data ?? null)
  return new Response(result.status === 204 || result.status === 205 ? null : body, {
    status: result.status || 502,
    headers: { 'Content-Type': result.headers?.['content-type'] || 'application/json' },
  })
}
