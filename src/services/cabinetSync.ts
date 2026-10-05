/**
 * Cabinet (POSVK) API client for catalogs (categories) and products (goods).
 * Mirrors the mobile app: /desktop/company-catalogs, /desktop/company-products,
 * /v1/api/mobile/catalog/upsert|delete, /api/sp-products/create|update|delete.
 */
import { dataStore } from './dataStore'
import { cabinetFetch } from './cabinetTransport'

export interface CabinetCatalog {
  id: number
  name: string
  sortOrder: number
  parentId?: number | null
  isDelete?: boolean
}

export interface CabinetProduct {
  id: number
  catalogId?: number | null
  name?: string
  className?: string
  shortName?: string
  classCode?: string
  mxikCode?: string
  barcode?: string
  skuCode?: string
  count?: number
  perAmount?: number
  buyPrice?: number
  salePrice?: number
  vatPercent?: number
  vatSum?: number
  commissionTin?: string
  isMark?: boolean | number
  ownerType?: number
  cashSale?: number
  packageCode?: string
  packageName?: string
  isDelete?: boolean | number | string
  companyId?: number
  cashId?: number
}

export interface CatalogMapping {
  id: number
  name: string
  sortOrder: number
}

export interface CabinetContext {
  token: string
  companyId: number
  cashId: number
}

export interface ProductPushInput {
  id?: number
  catalogId: number
  name: string
  shortName: string
  classCode: string
  className?: string
  barcode?: string
  skuCode?: string
  price: number
  vatPercent?: number
  vatSum?: number
  perAmount: number
  units?: number
  packageCode?: string
  packageName?: string
  commissionTin?: string
  isMark: number
  ownerType?: number
  cashSale?: number
}

const TIMEOUT_MS = 15000

export function getCabinetContext(): CabinetContext | null {
  const token = (dataStore.getItem('pos_v2_cabinet_token') || '').trim()
  const companyId = Number(dataStore.getItem('pos_v2_cabinet_company_id') || '0')
  const cashId = Number(dataStore.getItem('pos_v2_cabinet_cash_id') || '0')
  if (!token || !companyId || !cashId) return null
  return { token, companyId, cashId }
}

export function loadCatalogMapping(): CatalogMapping[] {
  try {
    const raw = dataStore.getItem('pos_v2_cabinet_catalogs')
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) {
      return parsed.filter(c => c && typeof c === 'object' && c.id != null && c.name)
    }
  } catch {}
  return []
}

export function saveCatalogMapping(list: CatalogMapping[]) {
  dataStore.setItem('pos_v2_cabinet_catalogs', JSON.stringify(list))
}

async function request(path: string, init: RequestInit = {}, context?: CabinetContext): Promise<any> {
  const ctx = context ?? getCabinetContext()
  if (!ctx) throw new Error('cabinet_no_context')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await cabinetFetch(`/api/cabinet-proxy${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.token}`,
        ...(init.headers || {}),
      },
    })
    const text = await res.text()
    let body: any = null
    try { body = text ? JSON.parse(text) : null } catch { body = null }

    if (!res.ok) {
      const msg = body?.reason ?? body?.message ?? `Cabinet API error ${res.status}`
      const error: any = new Error(msg)
      error.status = res.status
      throw error
    }
    return body
  } finally {
    clearTimeout(timer)
  }
}

function extractList(body: any): any[] {
  const data = body?.data
  if (Array.isArray(data)) return data
  return []
}

function extractPaging(body: any): { items: any[]; total: number } {
  const data = body?.data
  if (!data || typeof data !== 'object') return { items: [], total: 0 }
  const items = [data.content, data.items, data.list, data.data, data.rows].find(Array.isArray) || []
  const total = Number(data.totalElements ?? data.totalCount ?? data.total ?? data.recordsTotal ?? items.length)
  return { items, total: isNaN(total) ? items.length : total }
}

export async function fetchCatalogs(): Promise<CabinetCatalog[]> {
  const ctx = getCabinetContext()
  if (!ctx) throw new Error('cabinet_no_context')
  const body = await request(`/desktop/company-catalogs?companyId=${ctx.companyId}&cashId=${ctx.cashId}`, {}, ctx)
  return extractList(body)
    .map(c => ({
      id: Number(c?.id),
      name: String(c?.name ?? '').trim(),
      sortOrder: Number(c?.sortOrder ?? 0) || 0,
      parentId: c?.parentId != null && c?.parentId !== '' ? Number(c?.parentId) : null,
      isDelete: c?.isDelete === true || c?.isDelete === 1 || c?.isDelete === 'true',
    }))
    .filter(c => c.id > 0 && c.name)
}

export async function fetchAllProducts(): Promise<CabinetProduct[]> {
  const ctx = getCabinetContext()
  if (!ctx) throw new Error('cabinet_no_context')
  const all: any[] = []
  let page = 0
  let hasNext = true
  while (hasNext && page < 100) {
    const body = await request(
      `/desktop/company-products?companyId=${ctx.companyId}&cashId=${ctx.cashId}&page=${page}&size=1000`,
      {},
      ctx,
    )
    const { items, total } = extractPaging(body)
    all.push(...items)
    page++
    hasNext = items.length === 1000 && all.length < total
  }
  return all as CabinetProduct[]
}

export async function upsertCatalog(input: { id?: number; name: string; sortOrder: number; parentId?: number }): Promise<number> {
  const ctx = getCabinetContext()
  if (!ctx) throw new Error('cabinet_no_context')
  const payload: Record<string, unknown> = {
    cashId: ctx.cashId,
    name: input.name.trim(),
    sortOrder: input.sortOrder,
  }
  if (input.id != null) payload.id = input.id
  if (input.parentId != null) payload.parentId = input.parentId
  const body = await request('/v1/api/mobile/catalog/upsert', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, ctx)
  if (body?.success !== true) throw new Error(body?.reason ?? body?.message ?? 'cabinet_catalog_save_error')
  const savedId = Number(body?.data ?? input.id)
  if (!savedId) throw new Error('cabinet_catalog_no_id')
  return savedId
}

export async function deleteCatalogs(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const ctx = getCabinetContext()
  if (!ctx) throw new Error('cabinet_no_context')
  const qs = ids.map(id => `ids=${id}`).join('&')
  const body = await request(`/v1/api/mobile/catalog/delete?${qs}`, { method: 'DELETE' }, ctx)
  const ok = body === true || body === 'true' || body?.success === true || body?.data === true
  if (!ok) throw new Error(body?.reason ?? body?.message ?? 'cabinet_catalog_delete_error')
}

function productBody(input: ProductPushInput, ctx: CabinetContext): Record<string, unknown> {
  const body: Record<string, unknown> = {
    catalogId: input.catalogId,
    cashId: ctx.cashId,
    name: input.name.trim(),
    shortName: input.shortName.trim(),
    classCode: input.classCode,
    price: input.price,
    perAmount: input.perAmount,
    isMark: input.isMark,
    ownerType: input.ownerType ?? 0,
  }
  if (input.className) body.className = input.className
  if (input.barcode) body.barcode = input.barcode
  if (input.skuCode) body.skuCode = input.skuCode
  if (input.vatPercent != null) body.vatPercent = input.vatPercent
  if (input.vatSum != null) body.vatSum = input.vatSum
  if (input.units != null) body.units = input.units
  if (input.commissionTin) body.commissionTin = input.commissionTin
  if (input.cashSale != null) body.cashSale = input.cashSale
  if (input.packageCode && input.packageCode.trim() !== '') {
    body.packageCode = input.packageCode.trim()
    if (input.packageName && input.packageName.trim() !== '') {
      body.packageName = input.packageName.trim()
    }
  }
  if (input.id != null) body.id = input.id
  return body
}

function extractProductId(body: any): number | null {
  if (!body || typeof body !== 'object') return null
  if (body.success === false) return null
  const data = body.data
  if (typeof data === 'number') return data
  if (typeof data === 'string' && data.trim() !== '') {
    const n = Number(data)
    if (!isNaN(n)) return n
  }
  if (data && typeof data === 'object') {
    const v = data.id
    if (typeof v === 'number') return v
    const n = Number(v)
    if (!isNaN(n)) return n
  }
  return null
}

export async function createProduct(input: ProductPushInput): Promise<number> {
  const ctx = getCabinetContext()
  if (!ctx) throw new Error('cabinet_no_context')
  const body = await request('/api/sp-products/create', {
    method: 'POST',
    body: JSON.stringify(productBody(input, ctx)),
  }, ctx)
  if (body?.success === false) throw new Error(body?.reason ?? body?.message ?? 'cabinet_product_save_error')
  const id = extractProductId(body)
  if (id == null) throw new Error('cabinet_product_no_id')
  return id
}

export async function updateProduct(input: ProductPushInput): Promise<void> {
  const ctx = getCabinetContext()
  if (!ctx) throw new Error('cabinet_no_context')
  if (input.id == null) throw new Error('cabinet_product_no_id')
  const body = await request('/api/sp-products/update', {
    method: 'PUT',
    body: JSON.stringify(productBody(input, ctx)),
  }, ctx)
  if (body && typeof body === 'object' && body.success === false) {
    throw new Error(body?.reason ?? body?.message ?? 'cabinet_product_save_error')
  }
}

export async function deleteProducts(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const ctx = getCabinetContext()
  if (!ctx) throw new Error('cabinet_no_context')
  const body = await request('/api/sp-products/delete', {
    method: 'DELETE',
    body: JSON.stringify(ids),
  }, ctx)
  const ok = body === true || body === 'true' || body?.success === true || body?.data === true
  if (!ok) throw new Error(body?.reason ?? body?.message ?? 'cabinet_product_delete_error')
}

export function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const msg = String((e as any).message)
    if (msg && msg !== 'cabinet_no_context' && msg !== 'cabinet_catalog_save_error' && msg !== 'cabinet_catalog_no_id' && msg !== 'cabinet_catalog_delete_error' && msg !== 'cabinet_product_save_error' && msg !== 'cabinet_product_no_id' && msg !== 'cabinet_product_delete_error') {
      return msg
    }
  }
  return fallback
}
