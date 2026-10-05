import { useCallback, useEffect, useState } from 'react'
import { useT } from '../i18n'
import {
  btDeviceName,
  cacheBtDeviceName,
  extractBtMac,
  listBluetoothPrinters,
  testBluetoothPrint,
  type BtDevice,
} from '../services/bluetoothPrinter'

interface BluetoothPrinterSelectProps {
  value: string
  onChange: (mac: string) => void
  paperWidth?: number
}

/**
 * Bluetooth thermal printer picker for the Capacitor Android build.
 * Flow mirrors posvk_mobile: printers must be paired in Android Settings
 * first, then they appear in the scan list (MAC address is stored).
 */
export default function BluetoothPrinterSelect({ value, onChange, paperWidth = 58 }: BluetoothPrinterSelectProps) {
  const t = useT()
  const [devices, setDevices] = useState<BtDevice[]>([])
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await listBluetoothPrinters()
      for (const d of list) cacheBtDeviceName(d.address, d.name)
      setDevices(list)
      if (list.length === 0) {
        setError(t('Принтеры не найдены. Выполните сопряжение в настройках Bluetooth телефона.', 'Printerlar topilmadi. Telefon Bluetooth sozlamalarida ulang.', 'No printers found. Pair the printer in the phone Bluetooth settings first.'))
      }
    } catch (e: any) {
      setError(e?.message || t('Ошибка Bluetooth', 'Bluetooth xatosi', 'Bluetooth error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void refresh() }, [refresh])

  const currentMac = extractBtMac(value)
  const shown: BtDevice[] = [...devices]
  if (currentMac && !shown.some(d => d.address.toUpperCase() === currentMac)) {
    shown.unshift({ name: btDeviceName(currentMac), address: currentMac })
  }

  async function handleTest() {
    if (!currentMac || testing) return
    setTesting(true)
    setError('')
    try {
      await testBluetoothPrint(currentMac, paperWidth)
    } catch (e: any) {
      setError(e?.message || t('Ошибка печати', 'Chop etish xatosi', 'Print error'))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="admin-settings-printer-group">
      <label>{t('Bluetooth-принтер', 'Bluetooth-printer', 'Bluetooth printer')}</label>
      <select
        className="admin-settings-printer-select"
        value={currentMac}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">— {t('Выберите принтер', 'Printerni tanlang', 'Select printer')} —</option>
        {shown.map(d => (
          <option key={d.address} value={d.address}>
            {d.name} ({d.address})
          </option>
        ))}
      </select>
      <div className="bt-printer-actions">
        <button type="button" className="bt-printer-btn" onClick={() => void refresh()} disabled={loading}>
          {loading ? t('Поиск...', 'Qidirilmoqda...', 'Scanning...') : t('Обновить', 'Yangilash', 'Refresh')}
        </button>
        <button type="button" className="bt-printer-btn" onClick={() => void handleTest()} disabled={!currentMac || testing}>
          {testing ? t('Печать...', 'Chop etilmoqda...', 'Printing...') : t('Тест', 'Test', 'Test')}
        </button>
      </div>
      {error && <div className="bt-printer-error">{error}</div>}
    </div>
  )
}
