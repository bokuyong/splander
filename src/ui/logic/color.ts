// Tiny hex color helpers for building SVG gradients from the theme palette.

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Linear blend from `a` to `b`; t = 0 gives `a`, t = 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parse(a)
  const [r2, g2, b2] = parse(b)
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

export const lighten = (hex: string, t: number): string => mix(hex, '#ffffff', t)
export const darken = (hex: string, t: number): string => mix(hex, '#000000', t)

/** "r, g, b" for use inside rgba(). */
export function rgb(hex: string): string {
  return parse(hex).join(', ')
}
