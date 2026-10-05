import { dataStore } from './dataStore'
import { isNativeMobile } from './capacitor'

type AutoSyncSection = 'menu' | 'stock' | 'receipts'

const RUN_KEY = 'pos_v2_auto_cabinet_sync_run'

export function beginAutoCabinetSync(): void {
  dataStore.setItem(RUN_KEY, `${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

export function claimAutoCabinetSync(section: AutoSyncSection): boolean {
  if (isNativeMobile() && section === 'receipts') return false
  if (!(dataStore.getItem('pos_v2_cabinet_token') || '').trim()) return false
  const runId = dataStore.getItem(RUN_KEY)
  if (!runId) return false
  const sectionKey = `${RUN_KEY}_${section}`
  if (dataStore.getItem(sectionKey) === runId) return false
  dataStore.setItem(sectionKey, runId)
  return true
}
