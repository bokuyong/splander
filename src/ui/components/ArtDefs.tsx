// One hidden <svg> with every shared gradient, filter, pattern and symbol the
// art components reference by id (gem fills, parchment grain, tier metals,
// card corners). Rendered once in App so nothing is duplicated per card.
import { COLORS, TOKEN_COLORS } from '../../shared/contract'
import { THEME } from '../../data'
import { darken, lighten, mix } from '../logic/color'

/** Three stops (light, mid, dark) of a gem's body color. */
export function gemStops(color: string, id: string): [string, string, string] {
  if (id === 'white') return ['#ffffff', '#e8edf6', '#8b97b4']
  if (id === 'black') return ['#8d90aa', '#34354a', '#07070d']
  if (id === 'gold') return ['#fff6d2', '#ebc45e', '#8a5e10']
  return [lighten(color, 0.55), color, darken(color, 0.5)]
}

const METALS: Record<string, string[]> = {
  1: ['#5a2d10', '#c67a3f', '#f3c99a', '#d08a52', '#6b3a1a'], // copper
  2: ['#4b505e', '#b9c0cd', '#ffffff', '#aab0bf', '#454a57'], // silver
  3: ['#3a1d5e', '#9a6bc8', '#f3dc9a', '#8b5bb8', '#2e1649'], // purple-gold
}

export function ArtDefs() {
  return (
    <svg className="art-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {TOKEN_COLORS.map((c) => {
          const base = THEME.tokens[c].color
          const [hi, mid, lo] = gemStops(base, c)
          return (
            <g key={c}>
              {/* the gem body: lit from the top-left */}
              <radialGradient id={`gem-${c}`} cx="0.36" cy="0.28" r="0.8">
                <stop offset="0" stopColor={hi} />
                <stop offset="0.42" stopColor={mid} />
                <stop offset="1" stopColor={lo} />
              </radialGradient>
              {/* the token rim in the gem color */}
              <linearGradient id={`ring-${c}`} x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0" stopColor={c === 'white' ? '#ffffff' : lighten(mid, 0.4)} />
                <stop offset="0.5" stopColor={c === 'black' ? '#4a4c63' : mid} />
                <stop offset="1" stopColor={c === 'white' ? '#9aa5bf' : darken(mid, 0.45)} />
              </linearGradient>
              {/* a soft glow behind the gem */}
              <radialGradient id={`glow-${c}`} cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor={c === 'black' ? '#9a9dbb' : hi} stopOpacity="0.9" />
                <stop offset="0.55" stopColor={mid} stopOpacity="0.45" />
                <stop offset="1" stopColor={mid} stopOpacity="0" />
              </radialGradient>
            </g>
          )
        })}
        {COLORS.map((c) => {
          const base = c === 'white' ? '#9fb0d4' : c === 'black' ? '#5b5e7c' : THEME.tokens[c].color
          return (
            <g key={c}>
              {/* card scene sky: night tinted by the gem */}
              <linearGradient id={`sky-${c}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={darken(base, 0.8)} />
                <stop offset="0.65" stopColor={darken(base, 0.45)} />
                <stop offset="1" stopColor={mix(base, '#000000', 0.1)} />
              </linearGradient>
              <radialGradient id={`beam-${c}`} cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor={lighten(base, 0.6)} stopOpacity="1" />
                <stop offset="0.5" stopColor={lighten(base, 0.2)} stopOpacity="0.55" />
                <stop offset="1" stopColor={base} stopOpacity="0" />
              </radialGradient>
            </g>
          )
        })}

        {/* dark velvet well in the middle of a token */}
        <radialGradient id="tk-well" cx="0.5" cy="0.42" r="0.62">
          <stop offset="0" stopColor="#2c2f48" />
          <stop offset="0.7" stopColor="#171a2a" />
          <stop offset="1" stopColor="#07080f" />
        </radialGradient>
        {/* light catching the top edge of a rim */}
        <linearGradient id="tk-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.5" />
        </linearGradient>
        <radialGradient id="tk-spec" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {/* minted coin face */}
        <radialGradient id="coin-face" cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff2c2" />
          <stop offset="0.5" stopColor="#e6bd55" />
          <stop offset="1" stopColor="#9a6a16" />
        </radialGradient>
        {/* polished gold for frames, badges, titles */}
        <linearGradient id="gold-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.35" stopColor="#e9c45f" />
          <stop offset="0.6" stopColor="#b8872c" />
          <stop offset="1" stopColor="#f5e0a0" />
        </linearGradient>
        <linearGradient id="gold-metal-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a87a2a" />
          <stop offset="0.3" stopColor="#f6e3a8" />
          <stop offset="0.55" stopColor="#c99a3c" />
          <stop offset="0.8" stopColor="#fff0bf" />
          <stop offset="1" stopColor="#9d7026" />
        </linearGradient>
        {/* tier bands */}
        {Object.entries(METALS).map(([tier, stops]) => (
          <linearGradient key={tier} id={`metal-${tier}`} x1="0" y1="0" x2="1" y2="0">
            {stops.map((s, i) => (
              <stop key={i} offset={i / (stops.length - 1)} stopColor={s} />
            ))}
          </linearGradient>
        ))}

        {/* parchment grain: a tinted fractal noise, used as an overlay */}
        <filter id="parchment" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" seed="11" result="grain" />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0 0 0 0 0.42  0 0 0 0 0.30  0 0 0 0 0.12  0 0 0 0.55 -0.12"
          />
        </filter>
        {/* soft cloth noise for the table background */}
        <filter id="velvet" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.12 0" />
        </filter>

        {/* lattice for card backs */}
        <pattern id="lattice" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 6h12M6 0v12" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
        </pattern>

        {/* filigree corner mark: drawn in the top-left, rotated for the others */}
        <symbol id="corner" viewBox="0 0 24 24">
          <path
            d="M2 14V4a2 2 0 0 1 2-2h10M2 9c3-2 5-2 7 0M9 2c-2 3-2 5 0 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="5.5" cy="5.5" r="1.4" fill="currentColor" />
        </symbol>
      </defs>
    </svg>
  )
}
