// IndexedDB-backed KVAdapter for the shared sync outbox (@lospor/core/sync).
// No dependencies; a single "kv" object store keyed by string. Browser-only —
// callers are client components/hooks, so IndexedDB is never touched on the
// server.
import type { KVAdapter } from "@lospor/core/sync"

const DB_NAME = "lospor-sync"
const STORE = "kv"
const OWNER_PREFIX = "account:"

let dbPromise: Promise<IDBDatabase> | null = null
let activeOwnerId: string | null = null

export function setIdbClinicalOwner(ownerId: string | null): void {
  activeOwnerId = ownerId
}

function scopedKey(key: string): string | null {
  return activeOwnerId ? `${OWNER_PREFIX}${encodeURIComponent(activeOwnerId)}:${key}` : null
}

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    // A failed open (private mode, storage denied) should be retried next call.
    dbPromise.catch(() => { dbPromise = null })
  }
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const t = d.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export const idbKV: KVAdapter = {
  async get(key) {
    const storageKey = scopedKey(key)
    if (!storageKey) return null
    const value = await tx<string | undefined>("readonly", (s) => s.get(storageKey) as IDBRequest<string | undefined>)
    return value ?? null
  },
  async set(key, value) {
    const storageKey = scopedKey(key)
    if (!storageKey) throw new Error("Clinical sync account is not selected")
    await tx("readwrite", (s) => s.put(value, storageKey))
  },
  async delete(key) {
    const storageKey = scopedKey(key)
    if (!storageKey) return
    await tx("readwrite", (s) => s.delete(storageKey))
  },
  async keys(prefix) {
    if (!activeOwnerId) return []
    const ownerPrefix = `${OWNER_PREFIX}${encodeURIComponent(activeOwnerId)}:`
    const storagePrefix = `${ownerPrefix}${prefix}`
    // Prefix range scan: lets the sync engine reconcile its queue indexes
    // from actual storage (rediscovers entries a multi-tab race dropped).
    const range = IDBKeyRange.bound(storagePrefix, storagePrefix + "￿")
    const keys = await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys(range))
    return keys.map(String).map(key => key.slice(ownerPrefix.length))
  },
}
