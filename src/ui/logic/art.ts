// Optional real artwork under public/art/ (see public/art/README.md).
// Remembers which files exist or are missing so each is requested only once.
import { useEffect, useState } from 'react'

const missing = new Set<string>()
const found = new Set<string>()
const listeners = new Set<() => void>()

export function artUrl(path: string): string {
  return `${import.meta.env.BASE_URL}art/${path}`
}

export type ArtState = 'unknown' | 'ok' | 'missing'

export function artState(url: string): ArtState {
  return missing.has(url) ? 'missing' : found.has(url) ? 'ok' : 'unknown'
}

export function markArt(url: string, state: 'ok' | 'missing'): void {
  if (artState(url) === state) return
  ;(state === 'ok' ? found : missing).add(url)
  for (const fn of listeners) fn()
}

/** Whether `path` (e.g. "cards/t1-white.webp") is known to exist, be missing, or untested. */
export function useArt(path: string | null): ArtState {
  const [, bump] = useState(0)
  useEffect(() => {
    const fn = () => bump((n) => n + 1)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return path === null ? 'missing' : artState(artUrl(path))
}
