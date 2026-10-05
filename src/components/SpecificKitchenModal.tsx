import { useState, useEffect } from 'react'
import { dataStore } from '../services/dataStore'
import type { KitchenItem } from '../data/types'
import { getConnectedPrinters } from '../utils/printService'
import { useT } from '../i18n'
function getPhoto(name: string): string | undefined {
  try {
    const raw = dataStore.getItem('pos_v2_menu')
    const items = raw ? JSON.parse(raw) : []
    const item = items.find((m: any) => m.name === name)
    return item?.photo || undefined
  } catch { return undefined }
}

const PRINTERS_KEY = 'pos_v2_printer_name'
const KITCHEN_PRINTERS_KEY = 'pos_v2_kitchen_printer_name'
const KITCHEN_PAPER_KEY = 'pos_v2_kitchen_paper_size'

type Step = 'select' | 'printer'

interface SpecificKitchenModalProps {
  items: KitchenItem[]
  kitchenName: string
  onPrint: (selectedItems: KitchenItem[], printer: string, paperSize: string) => void
  onBack: () => void
}

export default function SpecificKitchenModal({
  items, kitchenName, onPrint, onBack,
}: SpecificKitchenModalProps) {
  const t = useT()
  const [step, setStep] = useState<Step>('select')
  const [selected, setSelected] = useState<Set<number>>(new Set(items.map(i => i.id)))
  const [printer, setPrinter] = useState<string>(dataStore.getItem(KITCHEN_PRINTERS_KEY) || dataStore.getItem(PRINTERS_KEY) || '')
  const [paperSize, setPaperSize] = useState<string>(dataStore.getItem(KITCHEN_PAPER_KEY) || '58')
  const [printers, setPrinters] = useState<string[]>(() => {
    const saved = dataStore.getItem(KITCHEN_PRINTERS_KEY) || dataStore.getItem(PRINTERS_KEY)
    return saved ? [saved] : []
  })

  useEffect(() => {
    getConnectedPrinters().then(list => {
      const saved = dataStore.getItem(KITCHEN_PRINTERS_KEY) || dataStore.getItem(PRINTERS_KEY)
      setPrinters(saved && !list.includes(saved) ? [saved, ...list] : list)
    })
  }, [])

  useEffect(() => {
    setSelected(new Set(items.map(i => i.id)))
  }, [items])

  function toggleItem(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleConfirmSelection() {
    if (selected.size === 0) return
    setStep('printer')
  }

  function handleConfirmPrinter() {
    if (!printer) return
    const selectedItems = items.filter(i => selected.has(i.id))
    onPrint(selectedItems, printer, paperSize)
  }

  const selectedItems = items.filter(i => selected.has(i.id))

  return (
    <div className="modal-overlay" onClick={onBack}>
      <div className="specific-kitchen-modal" onClick={e => e.stopPropagation()}>
        {step === 'select' && (
          <>
            <div className="skm-header">
              <h3 className="skm-title">{kitchenName}</h3>
              <p className="skm-subtitle">{t('Выберите блюда для отправки', 'Yuborish uchun taomlarni tanlang', 'Select dishes to send')}</p>
            </div>
            <div className="skm-body">
              <div className="skm-items-list">
                {items.map(item => {
                  const isSelected = selected.has(item.id)
                  const photo = getPhoto(item.name)
                  return (
                    <label key={item.id} className={`skm-item-row${isSelected ? ' selected' : ''}`}>
                      <input
                        type="checkbox"
                        className="skm-checkbox"
                        checked={isSelected}
                        onChange={() => toggleItem(item.id)}
                      />
                      <div className="skm-item-img">
                        {photo ? (
                          <img src={photo} alt={item.name} className="skm-item-photo" />
                        ) : (
                          <span className="food-icon" style={{ background: '#3b82f6' }}>{item.name.charAt(0)}</span>
                        )}
                      </div>
                      <div className="skm-item-details">
                        <span className="skm-item-name">{item.name}</span>
                        <span className="skm-item-qty">{item.quantity} x {item.unitPrice.toLocaleString()} = {item.total.toLocaleString()}</span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="skm-actions">
              <button className="skm-btn back" onClick={onBack}>{t('Отмена', 'Bekor qilish', 'Cancel')}</button>
              <button
                className="skm-btn primary"
                onClick={handleConfirmSelection}
                disabled={selected.size === 0}
              >
                {t('Далее', 'Keyingi', 'Next')}
              </button>
            </div>
          </>
        )}

        {step === 'printer' && (
          <>
            <div className="skm-header">
              <h3 className="skm-title">{t('Выбор принтера', 'Printerni tanlash', 'Printer selection')}</h3>
              <p className="skm-subtitle">{t('На каком принтере печатать чек?', 'Chek qaysi printerda chop etiladi?', 'Which printer should print the receipt?')}</p>
            </div>
            <div className="skm-body">
              <div className="skm-printer-block">
                <div className="skm-printer-group">
                  <label>{t('Принтер', 'Printer', 'Printer')}</label>
                  <select className="admin-settings-printer-select" value={printer} onChange={e => setPrinter(e.target.value)}>
                    <option value="">{t('— Выберите принтер —', '— Printerni tanlang —', '— Select printer —')}</option>
                    {printers.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="skm-printer-group">
                  <label>{t('Формат бумаги', 'Qog\'oz formati', 'Paper format')}</label>
                  <select className="admin-settings-printer-select" value={paperSize} onChange={e => setPaperSize(e.target.value)}>
                    <option value="58">58 мм</option>
                    <option value="80">80 мм</option>
                  </select>
                </div>
              </div>
              <div className="skm-summary">
                {t('Будет напечатано блюд:', 'Chop etiladigan taomlar:', 'Dishes to be printed:')} <b>{selectedItems.length}</b>
              </div>
            </div>
            <div className="skm-actions">
              <button className="skm-btn back" onClick={() => setStep('select')}>{t('Назад', 'Orqaga', 'Back')}</button>
              <button
                className="skm-btn primary"
                onClick={handleConfirmPrinter}
                disabled={!printer}
              >
                {t('Печатать', 'Chop etish', 'Print')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
