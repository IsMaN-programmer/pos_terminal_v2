/**
 * UzQR online payments — same cabinet endpoints as posvk_mobile
 * (/api/v1/payments/uzqr/...) reached through the local uzqr-proxy.
 */
import { dataStore } from './dataStore'
import { cabinetFetch } from './cabinetTransport'

export interface UzQrAvailability {
  configured: boolean
  available: boolean
  enabled: boolean
  status: number
}

export interface UzQrInvoice {
  invoiceId: string
  qrText: string
}

export interface UzQrStatus {
  status: number // 1 pending, 2 success, 3 failed
  invoiceId: string
  payId?: string
  payerPhone?: string
  cardType?: string
  cardNo?: string
  fiscalModule?: string
}

export class UzQrError extends Error {
  statusCode?: number
  constructor(message: string, statusCode?: number) {
    super(message)
    this.statusCode = statusCode
  }
}

function authHeaders(): Record<string, string> {
  const token = (dataStore.getItem('pos_v2_cabinet_token') || '').trim()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function unwrap<T>(json: any, what: string): T {
  // Cabinet envelope is { success, data, ... } like in posvk_mobile;
  // error answers ({ success: false, message }) have no data field.
  if (json && typeof json === 'object') {
    const b = json as any
    if (b.success === false) {
      throw new UzQrError(
        String(b.message || b.reason || b.errorText || 'UzQR xatosi'),
        typeof b.statusCode === 'number' ? b.statusCode : undefined,
      )
    }
    if ('data' in b) {
      if (b.data == null) throw new UzQrError(what)
      return b.data as T
    }
    return b as T
  }
  if (json == null) throw new UzQrError(what)
  return json as T
}

async function call<T>(path: string, payload: unknown, what: string): Promise<T> {
  let res: Response
  try {
    res = await cabinetFetch(`/api/uzqr-proxy/${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload || {}),
    })
  } catch (e) {
    throw new UzQrError(e instanceof Error ? e.message : 'Network error')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (json && typeof json === 'object' && ((json as any).message || (json as any).reason))
      || `HTTP ${res.status}`
    throw new UzQrError(String(msg), res.status)
  }
  return unwrap<T>(json, what)
}

async function callGet<T>(path: string, what: string): Promise<T> {
  let res: Response
  try {
    res = await cabinetFetch(`/api/uzqr-proxy/${path}`, { method: 'GET', headers: authHeaders() })
  } catch (e) {
    throw new UzQrError(e instanceof Error ? e.message : 'Network error')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new UzQrError(`HTTP ${res.status}`, res.status)
  return unwrap<T>(json, what)
}

// Same as posvk_mobile IdGenerator: 20 alphanumeric chars.
// Cabinet rejects longer ids ("size must be between 0 and 20").
function newId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint32Array(20)
      crypto.getRandomValues(buf)
      return Array.from(buf, x => chars[x % chars.length]).join('')
    }
  } catch { /* fall through */ }
  let s = ''
  for (let i = 0; i < 20; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export const uzqrApi = {
  newExternalId: () => newId(),

  checkAvailability(licenseKey: string): Promise<UzQrAvailability> {
    if (!licenseKey.trim()) throw new UzQrError('License key missing')
    return callGet<UzQrAvailability>(
      `api/v1/payments/uzqr/status/${encodeURIComponent(licenseKey.trim())}`,
      'UzQR status kelmadi',
    )
  },

  async createInvoice(args: {
    receiptId: string
    terminalId: string
    licenseKey: string
    externalId: string
    amount: number
  }): Promise<UzQrInvoice> {
    if (args.amount <= 0) throw new UzQrError('Amount must be positive')
    const data = await call<any>('api/v1/payments/uzqr/invoice', {
      receiptId: args.receiptId,
      terminalId: args.terminalId,
      licenseKey: args.licenseKey,
      externalId: args.externalId,
      amount: Math.round(args.amount),
    }, 'UzQR invoice javobi noto‘g‘ri')
    const invoiceId = String(data?.invoice_id ?? data?.invoiceId ?? '')
    const qrText = String(data?.qr_text ?? data?.qrText ?? '')
    if (!invoiceId || !qrText) {
      let raw = ''
      try { raw = JSON.stringify(data).slice(0, 300) } catch { /* ignore */ }
      throw new UzQrError(`UzQR invoice javobi noto‘g‘ri${raw ? `. Ответ: ${raw}` : ''}`)
    }
    return { invoiceId, qrText }
  },

  checkStatus(args: { invoiceId: string; terminalId: string; licenseKey: string }): Promise<UzQrStatus> {
    return call<UzQrStatus>('api/v1/payments/uzqr/invoice/status', {
      invoiceId: args.invoiceId,
      terminalId: args.terminalId,
      licenseKey: args.licenseKey,
    }, 'UzQR payment status kelmadi')
  },

  cancelInvoice(args: { invoiceId: string; terminalId: string; licenseKey: string }): Promise<UzQrStatus | null> {
    return call<UzQrStatus | null>('api/v1/payments/uzqr/invoice/cancel', {
      invoiceId: args.invoiceId,
      terminalId: args.terminalId,
      licenseKey: args.licenseKey,
    }, 'UzQR cancel failed').catch(() => null)
  },

  // Secondary sync like in posvk_mobile: links the fiscal receipt to the
  // paid invoice. Failures never cancel the payment itself.
  async sendReceipt(args: { payId: string; terminalId: string; licenseKey: string; fiscalReceiptUrl: string }): Promise<void> {
    await call<unknown>('api/v1/payments/uzqr/receipt', {
      payId: args.payId,
      terminalId: args.terminalId,
      licenseKey: args.licenseKey,
      fiscalReceiptUrl: args.fiscalReceiptUrl,
    }, 'UzQR receipt sync failed')
  },
}
