import type { KitchenItem, OrderItem } from '../data/types'

export interface SentCount {
  menuItemId: number
  quantity: number
}

export function buildKitchenItems(orderItems: OrderItem[], sent: SentCount[] = []): { kitchenItems: KitchenItem[]; kitchenPrintItems: KitchenItem[] } {
  const dishItems = orderItems.filter(item => item.menuItem.category !== 'Добавка')
  const generalAddons = orderItems.filter(item => item.menuItem.category === 'Добавка' && !item.dishBindings?.length)
  const attachedAddons = orderItems.filter(item => item.menuItem.category === 'Добавка' && !!item.dishBindings?.length)
  const kitchenItems: KitchenItem[] = []
  const matchedDishIds = new Set<number>()
  for (const dish of dishItems) {
    const attached = attachedAddons.filter(a => a.dishBindings?.some(b => b.id === dish.menuItem.id))
    if (attached.length === 0) {
      kitchenItems.push({ id: dish.id, menuItemId: dish.menuItem.id, name: dish.menuItem.name, quantity: dish.quantity, unitPrice: dish.unitPrice, total: dish.total, status: 'waiting' as const })
      continue
    }
    matchedDishIds.add(dish.menuItem.id)
    const covered = Math.min(dish.quantity, Math.max(...attached.map(a => a.dishBindings!.find(b => b.id === dish.menuItem.id)!.count)))
    if (covered > 0) {
      kitchenItems.push({ id: dish.id, menuItemId: dish.menuItem.id, name: dish.menuItem.name, quantity: covered, unitPrice: dish.unitPrice, total: dish.unitPrice * covered, status: 'waiting' as const })
      for (const a of attached) {
        kitchenItems.push({ id: a.id, menuItemId: a.menuItem.id, name: a.menuItem.name, quantity: a.quantity, unitPrice: a.unitPrice, total: a.total, status: 'waiting' as const, sub: true })
      }
    }
    const rest = dish.quantity - covered
    if (rest > 0) {
      kitchenItems.push({ id: -dish.id, menuItemId: -dish.menuItem.id, name: dish.menuItem.name, quantity: rest, unitPrice: dish.unitPrice, total: dish.unitPrice * rest, status: 'waiting' as const, rest: true })
    }
  }
  for (const a of attachedAddons) {
    if (!matchedDishIds.has(a.dishBindings![0].id)) {
      kitchenItems.push({ id: a.id, menuItemId: a.menuItem.id, name: a.menuItem.name, quantity: a.quantity, unitPrice: a.unitPrice, total: a.total, status: 'waiting' as const })
    }
  }
  for (const ga of generalAddons) {
    kitchenItems.push({ id: ga.id, menuItemId: ga.menuItem.id, name: ga.menuItem.name, quantity: ga.quantity, unitPrice: ga.unitPrice, total: ga.total, status: 'waiting' as const })
  }
  const sentMap = new Map(sent.map(p => [p.menuItemId, p.quantity]))
  const kitchenPrintItems: KitchenItem[] = kitchenItems
    .map(item => {
      const printed = sentMap.get(item.menuItemId!) || 0
      const diff = Math.max(0, item.quantity - printed)
      return { ...item, quantity: diff, total: diff * item.unitPrice }
    })
    .filter(item => item.quantity > 0)
  return { kitchenItems, kitchenPrintItems }
}
