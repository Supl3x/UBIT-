import { supabase, supabaseConfigured } from './supabase'

/**
 * Offline outbox. Every database write made by the app goes through `write()`.
 * Online: it runs immediately. Offline (or on a network failure): it is stored in IndexedDB and replayed, in order,
 * when connectivity returns. This is what makes the volunteer app work in a disaster.
 */

export type OutboxSpec = {
  table: string
  op: 'insert' | 'update' | 'upsert'
  values: Record<string, unknown>
  match?: Record<string, unknown>
  title: string
  description?: string
  priority?: number
}

export type OutboxRecord = OutboxSpec & {
  id: string
  createdAt: string
  status: 'queued' | 'syncing' | 'synced'
  syncedAt?: string
}

const DB_NAME = 'nlb-outbox'
const STORE = 'ops'
const HISTORY_KEEP = 12

let online = typeof navigator === 'undefined' ? true : navigator.onLine
let listener: ((items: OutboxRecord[]) => void) | null = null
let flushing = false
let notify: ((msg: string, kind: 'success' | 'error' | 'info') => void) | null = null

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    t.oncomplete = () => db.close()
  })
}

export async function listOutbox(): Promise<OutboxRecord[]> {
  try {
    const all = (await tx<OutboxRecord[]>('readonly', (s) => s.getAll() as IDBRequest<OutboxRecord[]>)) || []
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  } catch {
    return []
  }
}

async function put(rec: OutboxRecord) {
  try { await tx('readwrite', (s) => s.put(rec)) } catch { /* storage full or blocked */ }
}

async function remove(id: string) {
  try { await tx('readwrite', (s) => s.delete(id)) } catch { /* ignore */ }
}

async function emit() {
  if (!listener) return
  listener(await listOutbox())
}

/** Connect the outbox to the UI. `onChange` receives the full list (queued, syncing and recent history). */
export function initOutbox(opts: {
  onChange: (items: OutboxRecord[]) => void
  onNotify?: (msg: string, kind: 'success' | 'error' | 'info') => void
}) {
  listener = opts.onChange
  notify = opts.onNotify || null
  void emit()
}

export const isOnline = () => online

export function setOnline(next: boolean) {
  const wasOffline = !online
  online = next
  if (next && wasOffline) void flushOutbox()
}

const isNetworkError = (msg: string) => !online || (typeof navigator !== 'undefined' && !navigator.onLine) || /failed to fetch|network|load failed|fetch failed|timeout/i.test(msg)

type Result = { ok: true } | { ok: false; network: boolean; message: string }

async function exec(s: OutboxSpec): Promise<Result> {
  try {
    const q = supabase.from(s.table)
    let res
    if (s.op === 'insert') res = await q.insert(s.values)
    else if (s.op === 'upsert') res = await q.upsert(s.values)
    else {
      let u = q.update(s.values)
      for (const [k, v] of Object.entries(s.match || {})) u = u.eq(k, v as string)
      res = await u
    }
    if (res.error) return { ok: false, network: isNetworkError(res.error.message), message: res.error.message }
    return { ok: true }
  } catch (e) {
    const message = String((e as Error)?.message || e)
    return { ok: false, network: isNetworkError(message), message }
  }
}

async function enqueue(spec: OutboxSpec) {
  const rec: OutboxRecord = {
    ...spec,
    id: `ob-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    status: 'queued',
  }
  await put(rec)
  await emit()
}

/** Returns true when the write reached the server now; false when it was queued (or no backend is configured). */
export async function write(spec: OutboxSpec): Promise<boolean> {
  if (!supabaseConfigured) return false
  if (online) {
    const r = await exec(spec)
    if (r.ok) return true
    if (!r.network) {
      console.warn(`Write to ${spec.table} rejected: ${r.message}`)
      notify?.(`Not saved (${spec.table}): ${r.message}`, 'error')
      return false
    }
  }
  await enqueue(spec)
  return false
}

/** Replay queued writes oldest-first. Stops at the first network failure so order is preserved. */
export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  if (flushing || !supabaseConfigured) return { sent: 0, failed: 0 }
  flushing = true
  let sent = 0
  let failed = 0
  try {
    const queued = (await listOutbox()).filter((r) => r.status === 'queued')
    for (const rec of queued) {
      if (!online) break
      await put({ ...rec, status: 'syncing' })
      await emit()
      const r = await exec(rec)
      if (r.ok) {
        sent++
        await put({ ...rec, status: 'synced', syncedAt: new Date().toISOString() })
      } else if (r.network) {
        await put({ ...rec, status: 'queued' })
        break
      } else {
        failed++
        console.warn(`Outbox item rejected (${rec.title}): ${r.message}`)
        await remove(rec.id)
      }
      await emit()
    }
    // Trim old history so the outbox view stays readable.
    const hist = (await listOutbox()).filter((r) => r.status === 'synced')
    for (const old of hist.slice(0, Math.max(0, hist.length - HISTORY_KEEP))) await remove(old.id)
    if (sent) notify?.(`Synced ${sent} offline update${sent === 1 ? '' : 's'}`, 'success')
    if (failed) notify?.(`${failed} update${failed === 1 ? ' was' : 's were'} rejected by the server`, 'error')
  } finally {
    flushing = false
    await emit()
  }
  return { sent, failed }
}
