// Small DOM motion helpers: reduced-motion check and "fly from A to B" sprites.
// Elements opt in as flight endpoints with a data-anchor attribute.
import type { TokenColor } from '../../shared/contract'

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function anchorRect(name: string): DOMRect | null {
  const el = document.querySelector<HTMLElement>(`[data-anchor="${name}"]`)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return rect.width > 0 ? rect : null
}

export interface Flight {
  from: string
  to: string
  kind: 'token' | 'card'
  color?: TokenColor
  delay?: number
}

/** Animates small sprites between anchors inside `layer`. No-op without motion. */
export function playFlights(layer: HTMLElement | null, flights: Flight[]): void {
  if (!layer || flights.length === 0 || prefersReducedMotion()) return
  if (typeof layer.animate !== 'function') return
  for (const flight of flights) {
    const a = anchorRect(flight.from)
    const b = anchorRect(flight.to)
    if (!a || !b) continue
    const el = document.createElement('span')
    el.className =
      flight.kind === 'token' ? `flight flight-token c-${flight.color ?? 'gold'}` : 'flight flight-card'
    layer.appendChild(el)
    const size = flight.kind === 'token' ? 26 : 34
    const x0 = a.left + a.width / 2 - size / 2
    const y0 = a.top + a.height / 2 - size / 2
    const x1 = b.left + b.width / 2 - size / 2
    const y1 = b.top + b.height / 2 - size / 2
    const lift = Math.min(60, Math.abs(y1 - y0) * 0.35 + 18)
    const anim = el.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${x0}px, ${y0}px) scale(1.1)`, opacity: 1, offset: 0.15 },
        {
          transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2 - lift}px) scale(1.15)`,
          opacity: 1,
          offset: 0.55,
        },
        { transform: `translate(${x1}px, ${y1}px) scale(0.7)`, opacity: 0.2 },
      ],
      { duration: 620, delay: flight.delay ?? 0, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' },
    )
    const done = () => el.remove()
    anim.onfinish = done
    anim.oncancel = done
  }
}
