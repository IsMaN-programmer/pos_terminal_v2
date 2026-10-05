import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { isNativeMobile } from './capacitor'

const FiscalNative = registerPlugin<{
  invoke: (input: { method: string; args?: Record<string, unknown> }) => Promise<{ value: unknown }>
  addListener: (eventName: 'onFmAttached' | 'onFmDetached', listenerFunc: () => void) => Promise<PluginListenerHandle>
}>('FiscalNative')

export function onFiscalUsbChange(listener: () => void): Promise<PluginListenerHandle[]> {
  return Promise.all([
    FiscalNative.addListener('onFmAttached', listener),
    FiscalNative.addListener('onFmDetached', listener),
  ])
}

export async function fiscalNative<T = any>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isNativeMobile()) throw new Error('Фискальный модуль недоступен в приложении официанта')
  const result = await FiscalNative.invoke({ method, args })
  return result.value as T
}

function asDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value.replace(' ', 'T'))
  return Number.isFinite(date.getTime()) ? date : null
}

async function encodeNativeReceipt(payload: any): Promise<{ txid: string }> {
  const info = await fiscalNative<any>('memoryInfo')
  const requested = asDate(payload.Time)?.getTime() || 0
  const lastOperation = asDate(info?.LastOperationTime)?.getTime() || 0
  const timeMillis = Math.max(Date.now() + 5 * 60_000, requested, lastOperation + 30_000)
  const items = (payload.Items || []).map((item: any) => ({
    Name: String(item.Name || ''),
    Barcode: item.Barcode || null,
    label: item.label || null,
    spic: String(item.SPIC || ''),
    units: Number(item.Units || 0),
    packageCode: item.PackageCode == null ? null : String(item.PackageCode),
    ownerType: Number(item.OwnerType || 0),
    price: Number(item.Price || 0),
    vatPercent: Number(item.VATPercent || 0),
    vat: Number(item.VAT || 0),
    amount: Number(item.Amount || 0),
    discount: Number(item.Discount || 0),
    other: Number(item.Other || 0),
  }))
  const encoded = await fiscalNative<{ txid: string }>('encodeReceipt', {
    receiptKey: String(payload._receiptId || ''),
    type: Number(payload.Type || 0),
    operation: Number(payload.Operation || 0),
    cash: Number(payload.ReceivedCash || 0),
    card: Number(payload.ReceivedCard || 0),
    timeMillis,
    items,
    latitude: Number(payload.Location?.latitude) || undefined,
    longitude: Number(payload.Location?.longitude) || undefined,
  })
  if (!encoded?.txid) throw new Error('Fiscal module did not return TXID')
  return encoded
}

export async function registerNativeReceipt(payload: any): Promise<any> {
  const encoded = await encodeNativeReceipt(payload)
  const registered = await fiscalNative<any>('registerTxid', { txid: encoded.txid })
  return {
    fiscalSign: registered.FiscalSign || '',
    qrCodeUrl: registered.QRCodeURL || '',
    receiptNumber: Number(registered.ReceiptSeq || 0),
    receiptSeq: Number(registered.ReceiptSeq || 0),
    receiptId: payload._receiptId || `FM-${encoded.txid}`,
    locId: `FM-${encoded.txid}`,
    txId: Number(encoded.txid),
    terminalId: registered.TerminalID || '',
    dateTime: registered.DateTime || '',
  }
}

export async function nativeFiscalDriveRequest(endpoint: string, params: any = {}): Promise<any> {
  if (endpoint === 'FiscalDrive/List') return fiscalNative('listDevices')
  if (/^FiscalDrive\/FiscalMemory\/Info\//.test(endpoint)) return fiscalNative('memoryInfo')
  if (/^FiscalDrive\/ZReport\/Info\//.test(endpoint)) return fiscalNative('shiftInfo', { index: Number(params.Index || 0) })
  if (/^FiscalDrive\/ZReport\/Open\//.test(endpoint)) return fiscalNative('openShift', { dateTime: params.DateTime })
  if (/^FiscalDrive\/ZReport\/Close\//.test(endpoint)) return fiscalNative('closeShift', { dateTime: params.DateTime })
  if (endpoint === 'DataBase/Files/Count') return { FM: 0 }
  if (/^FiscalDrive\/Receipt\/GetTXID\//.test(endpoint)) {
    const encoded = await encodeNativeReceipt(params)
    return { TXID: Number(encoded.txid) }
  }
  if (/^FiscalDrive\/Receipt\/RegisterTXID\//.test(endpoint)) {
    return fiscalNative('registerTxid', { txid: String(params.TXID) })
  }
  if (/^DataBase\/Files\/Sync\//.test(endpoint) || /^FiscalDrive\/State\/Sync\//.test(endpoint)) {
    return fiscalNative('sync', { maxItems: Number(params.ItemsCount || 32), stateSync: true })
  }
  throw new Error(`Android fiscal operation is not supported: ${endpoint}`)
}
