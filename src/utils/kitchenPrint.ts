import { dataStore } from '../services/dataStore'
import type { KitchenItem, OrderItem } from '../data/types'
import { buildKitchenReceiptHtml, printReceiptHtml, type PaperSize } from './receiptHtml'
import { formatKitchenReceipt, printText, resolveLogicalPrinter } from './printService'
import { locale } from '../i18n'

export const KITCHEN_PAPER_KEY = 'pos_v2_kitchen_paper_size'

export function getManualModifiers(mods: string[]): string[] {
  try {
    const raw = dataStore.getItem('pos_v2_modifier_groups')
    const groups: { label: string; options: string[] }[] = raw ? JSON.parse(raw) : []
    const addonNames = new Set(
      groups.filter(g => g.label === 'Добавка').flatMap(g => g.options || [])
    )
    return mods.filter(m => !addonNames.has(m))
  } catch { return mods }
}

export interface KitchenPrintTask {
  items: KitchenItem[]
  kitchenName: string
  printer?: string
  paperSize?: PaperSize
}

export interface KitchenPrintContext {
  tableLabel?: string
  guestCount?: number
  orderComment?: string
  orderTags?: string[]
  orderModifiers?: string[]
  orderItems?: OrderItem[]
}

export async function runKitchenPrint(p: KitchenPrintTask, ctx: KitchenPrintContext = {}) {
  const printer = p.printer || (await resolveLogicalPrinter('kitchen')) || ''
  const paperSize: PaperSize = p.paperSize || ((dataStore.getItem(KITCHEN_PAPER_KEY) as PaperSize) || '58')
  const now = new Date()
  const dateStr = now.toLocaleDateString(locale())
  const timeStr = now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  const receiptData = {
    kitchenName: p.kitchenName,
    tableLabel: ctx.tableLabel || 'Стол',
    guestCount: ctx.guestCount || 2,
    dateStr,
    timeStr,
    items: p.items.map(i => ({
      name: i.name,
      quantity: i.quantity,
      sub: i.sub,
      comment: (ctx.orderItems || []).find(oi => oi.id === i.id)?.comment,
    })),
    orderComment: ctx.orderComment || '',
    orderTags: ctx.orderTags || [],
    orderModifiers: getManualModifiers(ctx.orderModifiers || []),
  }
  const html = buildKitchenReceiptHtml(receiptData)
  try {
    await printReceiptHtml(printer, html, paperSize, 'kitchen')
  } catch (e) {
    console.error('Печать изображением не удалась, пробуем текстом:', e)
    const text = formatKitchenReceipt(receiptData, paperSize)
    await printText(printer, text, 'kitchen')
  }
}
