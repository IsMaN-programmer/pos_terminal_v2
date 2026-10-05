import { dataStore } from '../services/dataStore'
export const RECEIPT_LOGO_KEY = 'pos_v2_receipt_logo'
export const DEFAULT_RECEIPT_LOGO = '/unnamed.png'
export const RECEIPT_LOGO_SIZE = 512

export function getReceiptLogo(): string {
  try {
    return dataStore.getItem(RECEIPT_LOGO_KEY) || DEFAULT_RECEIPT_LOGO
  } catch {
    return DEFAULT_RECEIPT_LOGO
  }
}

export function setReceiptLogo(dataUrl: string) {
  dataStore.setItem(RECEIPT_LOGO_KEY, dataUrl)
}

export function resetReceiptLogo() {
  dataStore.removeItem(RECEIPT_LOGO_KEY)
}

export function resizeReceiptLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const size = RECEIPT_LOGO_SIZE
      const scale = Math.min(size / img.width, size / img.height, 1)
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±СЂР°Р±РѕС‚Р°С‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ'))
    }
    img.src = url
  })
}
