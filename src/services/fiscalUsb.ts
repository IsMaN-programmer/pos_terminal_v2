import { registerPlugin } from '@capacitor/core'
import { isNativeMobile } from './capacitor'

export interface FiscalUsbReader {
  deviceId: number
  deviceName: string
  vendorId: number
  productId: number
  deviceClass: number
  interfaceCount: number
  isFeitian: boolean
  hasPermission: boolean
}

const FiscalUsb = registerPlugin<{
  listReaders: () => Promise<{ readers: FiscalUsbReader[] }>
}>('FiscalUsb')

export async function listFiscalUsbReaders(): Promise<FiscalUsbReader[]> {
  if (!isNativeMobile()) return []
  const result = await FiscalUsb.listReaders()
  return Array.isArray(result.readers) ? result.readers : []
}
