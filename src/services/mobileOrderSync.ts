import { posFetch } from './mobileConnection'

export interface MobileChange { key: string; before: string | null; value: string }
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Preserve orders belonging to other tables when using the existing desktop API. */
export function mergeMobileValue(currentRaw: string | null, beforeRaw: string | null, nextRaw: string): string {
  if (currentRaw === nextRaw) return nextRaw
  const next = JSON.parse(nextRaw)
  const before = beforeRaw == null ? (Array.isArray(next) ? [] : {}) : JSON.parse(beforeRaw)
  const current = currentRaw == null ? (Array.isArray(next) ? [] : {}) : JSON.parse(currentRaw)
  const conflict = () => { throw new Error('Заказ изменён на кассе. Данные обновлены; проверьте заказ.') }
  const mergeMap = (cur: Record<string, unknown>, prev: Record<string, unknown>, value: Record<string, unknown>) => {
    const result = { ...cur }
    for (const key of new Set([...Object.keys(prev), ...Object.keys(value)])) {
      if (equal(prev[key], value[key])) continue
      if (!equal(cur[key], prev[key]) && !equal(cur[key], value[key])) conflict()
      if (Object.prototype.hasOwnProperty.call(value, key)) result[key] = value[key]
      else delete result[key]
    }
    return result
  }
  if (Array.isArray(next) && Array.isArray(before) && Array.isArray(current)) {
    if ([...next, ...before, ...current].every(x => x && x.id != null)) {
      const map = (list: any[]) => Object.fromEntries(list.map(x => [String(x.id), x]))
      const merged = mergeMap(map(current), map(before), map(next))
      const ids = [...new Set([...next, ...current].map(x => String(x.id)))]
      return JSON.stringify(ids.filter(id => Object.prototype.hasOwnProperty.call(merged, id)).map(id => merged[id]))
    }
  } else if (next && before && current && typeof next === 'object' && typeof before === 'object' && typeof current === 'object') {
    return JSON.stringify(mergeMap(current, before, next))
  }
  if (!equal(current, before)) conflict()
  return nextRaw
}

export async function commitMobileChanges(changes: MobileChange[]): Promise<{ ok: boolean; data?: Record<string, string>; conflict?: boolean; error?: string }> {
  const data: Record<string, string> = {}
  // Save order contents before exposing the new table status to the cashier.
  const priority = (key: string) => key === 'pos_v2_tableOrders' ? 0 : key === 'pos_v2_tables' ? 2 : key === 'pos_v2_history' ? 3 : 1
  for (const change of [...changes].sort((a, b) => priority(a.key) - priority(b.key))) {
    const path = `/api/data/${encodeURIComponent(change.key)}`
    const read = await posFetch(path)
    if (!read.ok) throw new Error('Не удалось прочитать заказ с кассы')
    const snapshot = await read.json()
    if (!snapshot.ok) throw new Error('Касса не вернула данные заказа')
    let value: string
    try { value = mergeMobileValue(snapshot.value ?? null, change.before, change.value) }
    catch (error) { return { ok: false, conflict: true, error: error instanceof Error ? error.message : 'Заказ изменён' } }
    if (snapshot.value !== value) {
      const written = await posFetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) })
      if (!written.ok || !(await written.json()).ok) throw new Error('Касса не подтвердила сохранение заказа')
    }
    data[change.key] = value
  }
  return { ok: true, data }
}
