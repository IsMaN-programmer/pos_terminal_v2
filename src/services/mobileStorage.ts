// Android WebView localStorage has a small quota. Keep shared POS snapshots and
// the retry queue in IndexedDB, while exposing synchronous reads to the app.
let database: IDBDatabase | null = null
let values = new Map<string, string>()
let writes: Promise<void> = Promise.resolve()

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pos_v2_mobile_storage', 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('values')) request.result.createObjectStore('values')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function readAll(db: IDBDatabase): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const result = new Map<string, string>()
    const request = db.transaction('values', 'readonly').objectStore('values').openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        if (typeof cursor.key === 'string' && typeof cursor.value === 'string') result.set(cursor.key, cursor.value)
        cursor.continue()
      } else resolve(result)
    }
    request.onerror = () => reject(request.error)
  })
}

function write(db: IDBDatabase, key: string, value: string | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('values', 'readwrite')
    const store = tx.objectStore('values')
    if (value === null) store.delete(key)
    else store.put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** Migrate legacy localStorage data before React reads its initial state. */
export async function prepareMobileStorage(keys: Iterable<string>): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  let db: IDBDatabase | null = null
  try {
    db = await openDatabase()
    const loaded = await readAll(db)
    for (const key of keys) {
      const legacy = localStorage.getItem(key)
      if (legacy !== null) {
        await write(db, key, legacy)
        loaded.set(key, legacy)
      }
    }
    values = loaded
    database = db
    for (const key of keys) if (loaded.has(key)) localStorage.removeItem(key)
  } catch (error) {
    db?.close()
    console.error('IndexedDB is unavailable; mobile data remains in localStorage', error)
  }
}

export function getMobileStoredValue(key: string): string | null {
  return database ? values.get(key) ?? null : localStorage.getItem(key)
}

export function setMobileStoredValue(key: string, value: string): Promise<void> {
  if (!database) {
    try { localStorage.setItem(key, value); return Promise.resolve() }
    catch (error) { return Promise.reject(error) }
  }
  values.set(key, value)
  const db = database
  writes = writes.catch(() => {}).then(() => write(db, key, value))
  return writes
}

export function removeMobileStoredValue(key: string): Promise<void> {
  if (!database) {
    try { localStorage.removeItem(key); return Promise.resolve() }
    catch (error) { return Promise.reject(error) }
  }
  values.delete(key)
  const db = database
  writes = writes.catch(() => {}).then(() => write(db, key, null))
  return writes
}

export function waitForMobileStorage(): Promise<void> { return writes }
