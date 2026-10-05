import type { HistoryEntry } from '../data/types'

export function entryDiscount(entry: HistoryEntry): number {
  return entry.discountType === 'percent'
    ? Math.round(entry.total * (entry.discountPercent || 0) / 100)
    : (entry.discountAmount || 0)
}

export function entryService(entry: HistoryEntry): number {
  return Math.round(entry.total * (entry.servicePercent || 0) / 100)
}

export function entryItogo(entry: HistoryEntry): number {
  return entry.total + entryService(entry) - entryDiscount(entry)
}

export function entryQqs(entry: HistoryEntry): number {
  return Math.round(entryItogo(entry) * 12 / 100)
}
