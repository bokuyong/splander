// Home key art: a cluster of large faceted gems under a jewelled crown, with
// light rays and sparkles. Pure SVG; public/art/home/keyart.webp replaces it
// as a full-bleed background when present (see HomeScreen).
import type { CSSProperties } from 'react'
import type { Color } from '../../shared/contract'

type Pt = [number, number]

/** Regular n-gon, optionally squashed (ry) and rotated. */
function ngon(cx: number, cy: number, r: number, n: number, rot = -90, ry = r): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180
    return [cx + r * Math.cos(a), cy + ry * Math.sin(a)]
  })
}

/** Cut-corner rectangle (step cut). */
function octRect(cx: number, cy: number, w: number, h: number, cut: number): Pt[] {
  const x0 = cx - w / 2
  const y0 = cy - h / 2
  const x1 = cx + w / 2
  const y1 = cy + h / 2
  return [
    [x0 + cut, y0],
    [x1 - cut, y0],
    [x1, y0 + cut],
    [x1, y1 - cut],
    [x1 - cut, y1],
    [x0 + cut, y1],
    [x0, y1 - cut],
    [x0, y0 + cut],
  ]
}

const pts = (p: Pt[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

/** A big faceted stone: gradient body, crown facets lit from the top-left, a table, a glint. */
function Facets({ outer, color, rotate = 0, cx, cy }: { outer: Pt[]; color: Color; rotate?: number; cx: number; cy: number }) {
  const table = outer.map(([x, y]) => [cx + (x - cx) * 0.52, cy + (y - cy) * 0.52] as Pt)
  const n = outer.length
  const light: Pt = [-0.55, -0.83]
  const facets = outer.map((o, i) => {
    const j = (i + 1) % n
    const quad = [o, outer[j], table[j], table[i]]
    const mx = (o[0] + outer[j][0]) / 2 - cx
    const my = (o[1] + outer[j][1]) / 2 - cy
    const len = Math.hypot(mx, my) || 1
    const b = (mx / len) * light[0] + (my / len) * light[1]
    return { quad, b }
  })
  return (
    <g transform={rotate ? `rotate(${rotate} ${cx} ${cy})` : undefined}>
      <polygon points={pts(outer)} fill={`url(#gem-${color})`} />
      {facets.map((f, i) => (
        <polygon
          key={i}
          points={pts(f.quad)}
          fill={f.b > 0 ? '#ffffff' : '#000000'}
          opacity={f.b > 0 ? f.b * 0.42 : -f.b * 0.38}
        />
      ))}
      <polygon points={pts(table)} fill="#ffffff" opacity={color === 'black' ? 0.14 : 0.28} />
      <polygon points={pts(outer)} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="1.2" />
      <polygon points={pts(outer)} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.8" />
      {outer.map((o, i) => (
        <line key={i} x1={o[0]} y1={o[1]} x2={table[i][0]} y2={table[i][1]} stroke="#fff" strokeOpacity="0.35" strokeWidth="0.8" />
      ))}
    </g>
  )
}

const SPARK = 'M0 -7 L1.6 -1.6 L7 0 L1.6 1.6 L0 7 L-1.6 1.6 L-7 0 L-1.6 -1.6Z'

const SPARKS: [number, number, number, number][] = [
  // x, y, scale, delay(s)
  [130, 182, 1.1, 0],
  [226, 170, 0.8, 1.2],
  [96, 214, 0.7, 2.1],
  [270, 206, 0.9, 0.6],
  [198, 250, 0.7, 1.7],
  [152, 258, 0.6, 2.6],
  [182, 44, 0.9, 0.9],
  [118, 96, 0.6, 2.9],
  [246, 92, 0.7, 1.4],
]

export function KeyArt({ className }: { className?: string }) {
  const rays = Array.from({ length: 14 }, (_, i) => (360 / 14) * i)
  return (
    <svg className={`keyart${className ? ` ${className}` : ''}`} viewBox="30 0 300 320" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="ka-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f3dc9a" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#d9b45c" stopOpacity="0.14" />
          <stop offset="1" stopColor="#d9b45c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ka-ray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3dc9a" stopOpacity="0.22" />
          <stop offset="1" stopColor="#f3dc9a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ka-shade" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.7" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* light */}
      <circle cx="180" cy="150" r="170" fill="url(#ka-halo)" />
      <g className="keyart-rays" style={{ transformOrigin: '180px 150px' } as CSSProperties}>
        {rays.map((a) => (
          <polygon
            key={a}
            points="180,150 173,-40 187,-40"
            fill="url(#ka-ray)"
            transform={`rotate(${a} 180 150)`}
            opacity={a % 2 === 0 ? 0.8 : 0.4}
          />
        ))}
      </g>

      {/* crown */}
      <g transform="translate(108 18) scale(1.5)">
        <path
          d="M10 30 L26 46 L40 18 L48 40 L56 18 L70 46 L86 30 L80 66 L16 66 Z"
          fill="url(#gold-metal)"
          stroke="#5a3e0e"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M18 62 L24 40 M78 62 L72 40" stroke="#5a3e0e" strokeOpacity="0.35" strokeWidth="1" />
        <rect x="14" y="58" width="68" height="12" rx="3" fill="url(#gold-metal)" stroke="#5a3e0e" strokeWidth="1.6" />
        <path d="M17 61h62" stroke="#fff" strokeOpacity="0.45" strokeWidth="1" />
        <circle cx="10" cy="28" r="4.4" fill="url(#gem-blue)" stroke="#5a3e0e" strokeWidth="1" />
        <circle cx="48" cy="14" r="5.4" fill="url(#gem-red)" stroke="#5a3e0e" strokeWidth="1" />
        <circle cx="86" cy="28" r="4.4" fill="url(#gem-green)" stroke="#5a3e0e" strokeWidth="1" />
        <circle cx="40" cy="16" r="3" fill="url(#gem-white)" stroke="#5a3e0e" strokeWidth="0.8" />
        <circle cx="56" cy="16" r="3" fill="url(#gem-white)" stroke="#5a3e0e" strokeWidth="0.8" />
        <polygon points="30,59 35,64 30,69 25,64" fill="url(#gem-green)" stroke="#5a3e0e" strokeWidth="0.8" />
        <polygon points="48,58 54,64 48,70 42,64" fill="url(#gem-blue)" stroke="#5a3e0e" strokeWidth="0.8" />
        <polygon points="66,59 71,64 66,69 61,64" fill="url(#gem-red)" stroke="#5a3e0e" strokeWidth="0.8" />
        <path d="M22 50 L36 32" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* the gems resting on the cloth */}
      <ellipse cx="182" cy="290" rx="120" ry="22" fill="url(#ka-shade)" />
      <Facets color="black" cx={140} cy={262} outer={ngon(140, 262, 30, 6, -90, 26)} rotate={8} />
      <Facets color="red" cx={110} cy={226} outer={ngon(110, 226, 40, 12, -90, 46)} rotate={-18} />
      <Facets color="green" cx={254} cy={228} outer={octRect(254, 228, 62, 80, 14)} rotate={14} />
      <Facets color="blue" cx={182} cy={214} outer={octRect(182, 214, 92, 92, 24)} />
      <Facets color="white" cx={212} cy={272} outer={ngon(212, 272, 32, 10)} />

      {/* sparkles */}
      {SPARKS.map(([x, y, s, d], i) => (
        <path
          key={i}
          className="twinkle"
          d={SPARK}
          fill="#fff8dc"
          transform={`translate(${x} ${y}) scale(${s})`}
          style={{ animationDelay: `${d}s` } as CSSProperties}
        />
      ))}
    </svg>
  )
}
