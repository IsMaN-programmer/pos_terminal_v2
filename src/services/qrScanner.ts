import { tr } from '../i18n'
import { isNativeMobile } from './capacitor'

// Camera code scanner for the Capacitor Android build.
// Same format coverage as posvk_mobile (mobile_scanner):
// EAN-13/8, UPC-A/E, Code 128/39/93, ITF, Codabar, DataMatrix, QR.
export async function scanCode(): Promise<string | null> {
  if (!isNativeMobile()) {
    throw new Error(tr('Сканирование камерой доступно только в мобильном приложении', 'Kamera orqali skanerlash faqat mobil ilovada mavjud', 'Camera scanning is only available in the mobile app'))
  }
  const mod = await import('@capacitor-mlkit/barcode-scanning')
  const { BarcodeScanner, BarcodeFormat } = mod
  const BarcodeScanning = BarcodeScanner

  const supported = await BarcodeScanning.isSupported().catch(() => ({ supported: false }))
  if (!supported.supported) {
    throw new Error(tr('На устройстве нет камеры', 'Qurilmada kamera yo‘q', 'No camera on this device'))
  }

  try {
    const avail = await BarcodeScanning.isGoogleBarcodeScannerModuleAvailable().catch(() => ({ available: true }))
    if (!avail.available) {
      await BarcodeScanning.installGoogleBarcodeScannerModule().catch(() => {})
    }
  } catch { /* module check is best-effort */ }

  const { barcodes } = await BarcodeScanning.scan({
    formats: [
      BarcodeFormat.Ean13,
      BarcodeFormat.Ean8,
      BarcodeFormat.UpcA,
      BarcodeFormat.UpcE,
      BarcodeFormat.Code128,
      BarcodeFormat.Code39,
      BarcodeFormat.Code93,
      BarcodeFormat.Itf,
      BarcodeFormat.Codabar,
      BarcodeFormat.DataMatrix,
      BarcodeFormat.QrCode,
    ],
    autoZoom: true,
  })

  for (const b of barcodes || []) {
    const v = (b.rawValue || '').trim()
    if (v) return v
  }
  return null
}
