// Renders the app icons (PNG) from the same shapes as public/favicon.svg.
// No dependencies: a tiny supersampling rasteriser + a PNG encoder on node:zlib.
//
//   node scripts/make-icons.mjs
//
// Keep the shapes below in step with public/favicon.svg.
import { mkdirSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'

const BG = '#131726'
/** Polygons in the SVG's 64x64 user space, in paint order: [[x, y], ...], fill. */
const SHAPES = [
  // a faceted sapphire: crown (top), girdle at y=30, pavilion (bottom)
  { points: [[12, 30], [22, 18], [26, 30]], fill: '#5A86DE' },
  { points: [[22, 18], [42, 18], [38, 30], [26, 30]], fill: '#A6C2F2' },
  { points: [[42, 18], [52, 30], [38, 30]], fill: '#3461C1' },
  { points: [[12, 30], [26, 30], [32, 54]], fill: '#244A9C' },
  { points: [[26, 30], [38, 30], [32, 54]], fill: '#5A86DE' },
  { points: [[38, 30], [52, 30], [32, 54]], fill: '#1B3A80' },
  // a gold spark
  {
    points: [[50, 6], [51.6, 10.4], [56, 12], [51.6, 13.6], [50, 18], [48.4, 13.6], [44, 12], [48.4, 10.4]],
    fill: '#F3DC9A',
  },
]

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** Even-odd point-in-polygon test. */
function inside(points, x, y) {
  let hit = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/**
 * @param size   output width = height in pixels
 * @param radius corner radius of the background in SVG units (0 = full bleed)
 * @param art    scale of the artwork around the centre (maskable icons keep
 *               everything inside the central 80% safe zone)
 */
function render(size, { radius, art }) {
  const SS = 4
  const n = size * SS
  const buf = new Float32Array(n * n * 4)
  const unit = n / 64 // subpixels per SVG unit
  const paint = (test, hex) => {
    const [r, g, b] = rgb(hex)
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!test((x + 0.5) / unit, (y + 0.5) / unit)) continue
        const i = (y * n + x) * 4
        buf[i] = r
        buf[i + 1] = g
        buf[i + 2] = b
        buf[i + 3] = 255
      }
    }
  }
  // background: rounded square
  paint((x, y) => {
    const dx = Math.max(radius - x, x - (64 - radius), 0)
    const dy = Math.max(radius - y, y - (64 - radius), 0)
    return dx * dx + dy * dy <= radius * radius
  }, BG)
  for (const shape of SHAPES) {
    const points = shape.points.map(([x, y]) => [32 + (x - 32) * art, 32 + (y - 32) * art])
    paint((x, y) => inside(points, x, y), shape.fill)
  }
  // box-filter down to the output size (premultiplied, so edges do not darken)
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * n + x * SS + sx) * 4
          const alpha = buf[i + 3] / 255
          r += buf[i] * alpha
          g += buf[i + 1] * alpha
          b += buf[i + 2] * alpha
          a += alpha
        }
      }
      const o = (y * size + x) * 4
      out[o] = a ? Math.round(r / a) : 0
      out[o + 1] = a ? Math.round(g / a) : 0
      out[o + 2] = a ? Math.round(b / a) : 0
      out[o + 3] = Math.round((a / (SS * SS)) * 255)
    }
  }
  return out
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([head, body, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 6, 0, 0, 0], 8) // 8 bit RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const dir = new URL('../public/icons/', import.meta.url)
mkdirSync(dir, { recursive: true })
const ICONS = [
  ['icon-192.png', 192, { radius: 14, art: 1 }],
  ['icon-512.png', 512, { radius: 14, art: 1 }],
  // maskable: full-bleed background, artwork inside the safe zone
  ['icon-maskable-512.png', 512, { radius: 0, art: 0.72 }],
  // iOS rounds the corners itself and shows transparency as black: full bleed
  ['apple-touch-icon.png', 180, { radius: 0, art: 0.86 }],
]
for (const [name, size, opts] of ICONS) {
  const file = png(size, render(size, opts))
  writeFileSync(new URL(name, dir), file)
  console.log(`${name}  ${size}x${size}  ${file.length} bytes`)
}
