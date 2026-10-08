// Small shared pieces: storage, snapshot store, page lifecycle, timers.

import type { NetError } from './protocol.ts'

// ---- storage ---------------------------------------------------------------

/** The subset of the Web Storage API we need (localStorage satisfies it). */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function createMemoryStorage(): KeyValueStorage & { dump(): Record<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  }
}

/** localStorage when it exists and works, otherwise a per-page memory store. */
export function defaultStorage(): KeyValueStorage {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.getItem('mg-net:probe')
      return localStorage
    }
  } catch {
    // private mode or storage disabled
  }
  return (fallbackStorage ??= createMemoryStorage())
}
let fallbackStorage: KeyValueStorage | undefined

export function readJson<T>(storage: KeyValueStorage, key: string): T | null {
  try {
    const raw = storage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

export function writeJson(storage: KeyValueStorage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // quota or disabled storage: reconnection will not survive a reload, play goes on
  }
}

export function removeKey(storage: KeyValueStorage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // ignore
  }
}

// ---- page lifecycle --------------------------------------------------------

export interface Lifecycle {
  /**
   * Calls `cb` whenever the page may have just come back to life (tab visible
   * again after a screen lock, network back). Returns an unsubscribe function.
   */
  onWake(cb: () => void): () => void
}

export const browserLifecycle: Lifecycle = {
  onWake(cb) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}
    const onVisible = () => {
      if (document.visibilityState === 'visible') cb()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    window.addEventListener('online', cb)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.removeEventListener('online', cb)
    }
  },
}

// ---- snapshot store --------------------------------------------------------

export interface Store<T extends object> {
  get(): T
  /** Shallow-merges; emits only when at least one field actually changed. */
  set(patch: Partial<T>): void
  subscribe(listener: () => void): () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let snapshot = Object.freeze({ ...initial })
  const listeners = new Set<() => void>()
  return {
    get: () => snapshot,
    set(patch) {
      let changed = false
      for (const key of Object.keys(patch) as (keyof T)[]) {
        if (!Object.is(snapshot[key], patch[key])) changed = true
      }
      if (!changed) return
      snapshot = Object.freeze({ ...snapshot, ...patch })
      for (const l of [...listeners]) l()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

// ---- misc ------------------------------------------------------------------

export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [300, 1000, 2000, 4000, 8000]

export function retryDelay(delays: readonly number[], attempt: number): number {
  if (delays.length === 0) return 0
  return delays[Math.min(attempt, delays.length - 1)]
}

/** A sleep that can be cut short (used to retry at once when the page wakes). */
export function createSleeper(): { sleep(ms: number): Promise<void>; wake(): void } {
  let wakeFn: (() => void) | null = null
  return {
    sleep(ms) {
      return new Promise<void>((resolve) => {
        const timer = setTimeout(done, ms)
        function done() {
          clearTimeout(timer)
          if (wakeFn === done) wakeFn = null
          resolve()
        }
        wakeFn = done
      })
    },
    wake() {
      wakeFn?.()
    },
  }
}

export function generateToken(): string {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function netError(code: NetError['code'], message: string): NetError {
  return Object.freeze({ code, message })
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
