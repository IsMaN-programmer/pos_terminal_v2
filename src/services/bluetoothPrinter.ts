import { tr } from '../i18n'
import { isNativeMobile } from './capacitor'

// Bluetooth thermal printing for the Capacitor Android build.
// Logic mirrors posvk_mobile (Flutter):
//   lib/features/printer/data/bluetooth_printer_service.dart
//   lib/features/printer/data/printer_adapters.dart
//
// The SPP plugin transports text (UTF-8). To stay compatible with cheap
// 58mm printers without Cyrillic codepages, every receipt is transliterated
// to Latin first (same map as the Flutter app), so the whole ESC/POS job
// is pure ASCII and cannot be mangled in transit.

export interface BtDevice {
  name: string
  address: string
}

const BT_NAMES_KEY = 'pos_v2_bt_names'
const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/

/** Extract a MAC address from a stored value: plain MAC or "Name (MAC)". */
export function extractBtMac(value: string): string {
  const v = (value || '').trim()
  if (MAC_RE.test(v)) return v.toUpperCase()
  const m = v.match(/\(([0-9A-Fa-f:]{17})\)\s*$/)
  if (m && MAC_RE.test(m[1])) return m[1].toUpperCase()
  return ''
}

function loadBtNames(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(BT_NAMES_KEY) || '{}') } catch { return {} }
}

export function cacheBtDeviceName(mac: string, name: string) {
  try {
    const all = loadBtNames()
    all[mac.toUpperCase()] = name
    localStorage.setItem(BT_NAMES_KEY, JSON.stringify(all))
  } catch { /* local-only cache */ }
}

export function btDeviceName(mac: string): string {
  return loadBtNames()[mac.toUpperCase()] || mac
}

const TR_MAP: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Yo', Ж: 'J', З: 'Z',
  И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R',
  С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'X', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Sh',
  Ъ: '', Ы: 'I', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya', Ў: 'O', Қ: 'Q', Ғ: 'G', Ҳ: 'H',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
  'ʼ': "'", 'ʻ': "'", '`': "'",
}

/** Transliterate receipt text to printer-safe Latin (Flutter _printerText port). */
export function transliterateForPrinter(value: string, maxLength?: number): string {
  let text = value.trim()
  text = text
    .replace(/"/g, '')
    .replace(/[“”«»]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/№/g, 'N')
  let out = ''
  for (const ch of text) out += TR_MAP[ch] ?? ch
  out = out.replace(/\s+/g, ' ').trim()
  if (maxLength != null && out.length > maxLength) out = out.slice(0, maxLength)
  return out
}

const ESC_INIT = '\x1B@'
const ESC_FEED_3 = '\x1Bd\x03'
const GS_CUT = '\x1DV\x42\x00'

/**
 * Build the raw ESC/POS job as a JS string. ASCII-only by construction:
 * every byte is < 128, so it survives the UTF-8 string bridge of the
 * Bluetooth SPP plugin 1:1 (same bytes as backend buildTextEscposJob,
 * minus the CP866 codepage select which Latin text does not need).
 */
export function buildTextEscposPayload(text: string): string {
  const body = transliterateForPrinter(text.replace(/\r\n?/g, '\n'))
  return ESC_INIT + body + '\n\n' + ESC_FEED_3 + GS_CUT
}

async function btPlugin() {
  const mod = await import('@e-is/capacitor-bluetooth-serial')
  return mod.BluetoothSerial
}

function btError(key: 'off' | 'denied' | 'connect'): string {
  if (key === 'off') return tr('Bluetooth выключен', 'Bluetooth yoqilmagan', 'Bluetooth is off')
  if (key === 'denied') return tr('Нет разрешения Bluetooth', 'Bluetooth ruxsati berilmagan', 'Bluetooth permission denied')
  return tr('Не удалось подключиться к принтеру', 'Printerga ulanib bolmadi', 'Could not connect to printer')
}

const CHUNK = 512
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Paired/scan-result Bluetooth devices (printers must be paired in Android Settings first). */
export async function listBluetoothPrinters(): Promise<BtDevice[]> {
  if (!isNativeMobile()) return []
  const bt = await btPlugin()
  const st = await bt.isEnabled().catch(() => ({ enabled: false }))
  if (!st.enabled) throw new Error(btError('off'))
  let res: { devices?: { name?: string; address?: string }[] }
  try {
    res = await bt.scan()
  } catch {
    throw new Error(btError('denied'))
  }
  return (res.devices || [])
    .filter(d => (d.address || '').trim() !== '')
    .map(d => ({ name: d.name || d.address || '', address: (d.address || '').trim() }))
}

/**
 * Print receipt text on a Bluetooth thermal printer.
 * Session mirrors the Flutter app: drop a stale connection, connect,
 * small delay, chunked write, disconnect.
 */
export async function printViaBluetooth(macAddress: string, text: string): Promise<void> {
  if (!isNativeMobile()) throw new Error('Bluetooth printing is only available in the mobile app')
  const mac = macAddress.trim()
  if (!mac) throw new Error(tr('MAC-адрес принтера пуст', 'Printer MAC manzili bosh', 'Printer MAC address is empty'))
  const bt = await btPlugin()
  const st = await bt.isEnabled().catch(() => ({ enabled: false }))
  if (!st.enabled) throw new Error(btError('off'))

  try {
    const conn = await bt.isConnected({ address: mac }).catch(() => ({ connected: false }))
    if (conn.connected) {
      await bt.disconnect({ address: mac }).catch(() => {})
      await delay(600)
    }
  } catch { /* fresh connect below */ }

  let connected = false
  try {
    await bt.connect({ address: mac })
    connected = true
  } catch {
    throw new Error(btError('connect'))
  }
  await delay(500)

  try {
    const payload = buildTextEscposPayload(text)
    for (let i = 0; i < payload.length; i += CHUNK) {
      await bt.write({ address: mac, value: payload.slice(i, i + CHUNK) })
      await delay(60)
    }
  } finally {
    if (connected) await bt.disconnect({ address: mac }).catch(() => {})
  }
}

/** Short test ticket, mirrors Flutter _buildTestBytes (text variant). */
export async function testBluetoothPrint(mac: string, paperWidth: number): Promise<void> {
  const now = new Date()
  const p = (v: number) => String(v).padStart(2, '0')
  const text = [
    'POS Terminal v2 - TEST',
    '--------------------------------',
    `Printer: ${mac}`,
    `Paper: ${paperWidth} mm`,
    `Date: ${p(now.getDate())}.${p(now.getMonth() + 1)}.${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}`,
    '--------------------------------',
    'Printer OK',
  ].join('\n')
  await printViaBluetooth(mac, text)
}
