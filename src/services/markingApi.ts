const MARKING_PATH = '/api/marking-proxy/validation-onkm'
const MARKING_USERNAME = 'reactMarkingUser'
const MARKING_PASSWORD = 'd3@T7*ZpL!aN$9mQ'
const VALIDATION_TIMEOUT = 8000

const GS = '\u001D'
const FIXED_LENGTH: Record<string, number> = { '00': 18, '01': 14, '02': 14, '11': 6, '13': 6, '17': 6 }
const VARIABLE_MAX_LENGTH: Record<string, number> = { '21': 20, '91': 4, '92': 44, '93': 4, '10': 20 }

export type MarkCodeErrorKey = 'empty' | 'no_gtin' | 'no_serial'

export class MarkCodeError extends Error {
  key: MarkCodeErrorKey
  constructor(key: MarkCodeErrorKey) {
    super(key)
    this.key = key
  }
}

export interface ParsedMarkCode {
  raw: string
  gtin: string
  serial: string
  checkCode?: string
  cryptoTail?: string
  kmId: string
  productCode: string
  packageCode: string
  safeCode: string
  fullKmId: string
}

export function parseMarkCode(scanned: string): ParsedMarkCode {
  const raw = scanned.trim()
  if (!raw) throw new MarkCodeError('empty')

  const ais: Record<string, string> = {}
  let i = 0
  while (i < raw.length) {
    if (raw[i] === GS) {
      i++
      continue
    }
    if (i + 2 > raw.length) break
    const ai = raw.substring(i, i + 2)
    i += 2

    const fixed = FIXED_LENGTH[ai]
    if (fixed != null) {
      if (i + fixed > raw.length) break
      ais[ai] = raw.substring(i, i + fixed)
      i += fixed
      continue
    }

    const gsIndex = raw.indexOf(GS, i)
    const maxLen = VARIABLE_MAX_LENGTH[ai] ?? raw.length
    const end = gsIndex === -1
      ? Math.min(i + maxLen, raw.length)
      : Math.min(gsIndex, i + maxLen)
    ais[ai] = raw.substring(i, end)
    i = end
  }

  const gtin = ais['01']
  const serial = ais['21']
  if (!gtin || gtin.length !== 14) throw new MarkCodeError('no_gtin')
  if (!serial || serial.length === 0) throw new MarkCodeError('no_serial')

  const checkCode = ais['91']
  const cryptoTail = ais['93'] ?? ais['92']

  return {
    raw,
    gtin,
    serial,
    checkCode,
    cryptoTail,
    kmId: `01${gtin}21${serial}`,
    productCode: gtin,
    packageCode: serial,
    safeCode: checkCode ?? cryptoTail ?? '',
    fullKmId: raw,
  }
}

export interface MarkingValidationParams {
  ownerTin: string
  terminalId: string
  productCode: string
  packageCode: string
  safeCode: string
  kmId: string
  fullKmId: string
  refund?: boolean
}

export class MarkingServerError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export class MarkingConnectivityError extends Error {
  constructor() {
    super('connectivity')
  }
}

export async function validateMarking(params: MarkingValidationParams): Promise<void> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), VALIDATION_TIMEOUT)
  try {
    const res = await fetch(MARKING_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(`${MARKING_USERNAME}:${MARKING_PASSWORD}`),
      },
      body: JSON.stringify({
        ownerTin: params.ownerTin.trim(),
        terminalId: params.terminalId.trim(),
        refund: params.refund ? 1 : 0,
        products: [
          {
            commitentTin: '',
            productCode: params.productCode.trim(),
            packageCode: params.packageCode.trim(),
            safeCode: params.safeCode.trim(),
            patientId: '',
            amount: 1,
            kmIds: [params.kmId],
            fullKmIds: [params.fullKmId],
          },
        ],
      }),
      signal: controller.signal,
    })

    const text = await res.text()
    let body: any = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }

    if (!res.ok) {
      if (res.status >= 500) throw new MarkingConnectivityError()
      throw new MarkingServerError(extractErrorMessage(body) || `Сервер вернул ошибку ${res.status}`)
    }
    if (body?.success !== true) {
      throw new MarkingServerError(extractErrorMessage(body) || 'Маркировка коди текширувдан ўтмади')
    }
  } catch (error) {
    if (error instanceof MarkingServerError || error instanceof MarkingConnectivityError) throw error
    throw new MarkingConnectivityError()
  } finally {
    clearTimeout(timer)
  }
}

function extractErrorMessage(body: any): string {
  if (body?.errors && Array.isArray(body.errors) && body.errors.length > 0) {
    const first = body.errors[0]
    if (first && typeof first === 'object') {
      const msg = first.messageLat ?? first.messageUz ?? first.messageRu ?? first.message
      if (msg && String(msg).trim().length > 0) return String(msg)
    }
  }
  const msg = body?.messageLat ?? body?.messageUz ?? body?.messageRu ?? body?.message ?? body?.reason
  if (msg && String(msg).trim().length > 0) return String(msg)
  return ''
}
