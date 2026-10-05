import type { StaffRecord, TableOrderData } from '../data/types'

type OrderOwner = Pick<TableOrderData, 'waiterId' | 'waiterName'>
type StaffIdentity = Pick<StaffRecord, 'id' | 'name'>

export function isOrderOwnedBy(order: TableOrderData | undefined, staffId: number | undefined): boolean {
  return staffId != null && order?.waiterId === staffId
}

export function orderOwnerForSave(order: TableOrderData | undefined, creator: StaffIdentity): OrderOwner {
  // Editing or taking payment must never transfer an existing order to the current user.
  if (order && order.items.length > 0) {
    return { waiterId: order.waiterId, waiterName: order.waiterName }
  }
  return { waiterId: creator.id, waiterName: creator.name }
}

export function migrateOrderOwners(
  orders: Record<number, TableOrderData>,
  staff: StaffIdentity[],
): Record<number, TableOrderData> {
  let result = orders
  for (const [tableId, order] of Object.entries(orders)) {
    if (order.waiterId != null || order.items.length === 0 || !order.waiterName?.trim()) continue
    const matches = staff.filter(person => person.name.trim() === order.waiterName!.trim())
    // Ambiguous and missing names remain unassigned and visible to the cashier.
    if (matches.length !== 1) continue
    if (result === orders) result = { ...orders }
    result[Number(tableId)] = { ...order, waiterId: matches[0].id }
  }
  return result
}
