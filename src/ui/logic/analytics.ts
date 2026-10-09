// Visit counting with GoatCounter (no cookies, no personal data), web only.
// The script is loaded here rather than in index.html so dev builds and the
// native (Capacitor) app never send anything.
import { Capacitor } from '@capacitor/core'

const ENDPOINT = 'https://bokuyong88.goatcounter.com/count'
// Cloudflare Web Analytics (page views only; the token is public by design).
const CF_TOKEN = 'c8ac3142afc1426aa19a65777f478063'

type GoatCounter = { count: (opts: { path: string; title?: string; event?: boolean }) => void }

function enabled(): boolean {
  return import.meta.env.PROD && typeof window !== 'undefined' && !Capacitor.isNativePlatform()
}

export function installAnalytics(): void {
  if (!enabled()) return
  try {
    const s = document.createElement('script')
    s.async = true
    s.src = 'https://gc.zgo.at/count.js'
    s.dataset.goatcounter = ENDPOINT
    document.head.appendChild(s)
    const cf = document.createElement('script')
    cf.defer = true
    cf.src = 'https://static.cloudflareinsights.com/beacon.min.js'
    cf.dataset.cfBeacon = JSON.stringify({ token: CF_TOKEN })
    document.head.appendChild(cf)
  } catch {
    // an adblocker or a strict WebView: counting is optional
  }
}

/** Counts a named event such as "start-solo" or "game-over". */
export function track(name: string): void {
  if (!enabled()) return
  try {
    const gc = (window as unknown as { goatcounter?: GoatCounter }).goatcounter
    gc?.count({ path: name, title: name, event: true })
  } catch {
    // never let analytics break the game
  }
}
