import { dataStore } from '../services/dataStore'

export function getPhoto(name: string): string | undefined {
  try {
    const raw = dataStore.getItem('pos_v2_menu')
    const items = raw ? JSON.parse(raw) : []
    const item = items.find((m: any) => m.name === name)
    if (item?.photo) return item.photo
  } catch {}
  try {
    const raw = dataStore.getItem('pos_v2_stock_goods')
    const goods = raw ? JSON.parse(raw) : []
    const good = goods.find((g: any) => g.name === name && g.type === 'additive')
    return good?.photo || undefined
  } catch { return undefined }
}
