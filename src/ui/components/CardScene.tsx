// Stylised vignettes for the illustration area of a development card, one per
// tier, tinted by the card's gem color: a mine shaft (1), a smith's workshop
// (2), a palace facade (3). Replaced by public/art/cards/t{tier}-{color}.webp
// when that file exists. Colors: #sky-* / #beam-* gradients from ArtDefs and
// the CSS --c of the enclosing .c-<color>.
import type { Color, Tier } from '../../shared/contract'

const STARS = [
  [8, 6],
  [22, 11],
  [37, 4],
  [55, 9],
  [70, 3],
  [86, 8],
  [93, 15],
  [14, 18],
]

function Stars({ n = 8 }: { n?: number }) {
  return (
    <g className="scene-stars" fill="#fff">
      {STARS.slice(0, n).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 0.9 : 0.6} opacity={i % 2 ? 0.55 : 0.85} />
      ))}
    </g>
  )
}

function Mine({ color }: { color: Color }) {
  return (
    <>
      <rect width="100" height="64" fill={`url(#sky-${color})`} />
      <Stars />
      {/* far ridge */}
      <path d="M0 34 L14 22 L26 30 L40 16 L54 28 L66 20 L80 30 L92 24 L100 30 V64 H0Z" fill="#000" opacity="0.32" />
      {/* near hill holding the shaft */}
      <path d="M0 44 L18 34 L34 38 L50 28 L68 36 L84 32 L100 40 V64 H0Z" fill="#0b0912" opacity="0.92" />
      {/* light spilling from the tunnel */}
      <ellipse cx="50" cy="56" rx="26" ry="14" fill={`url(#beam-${color})`} opacity="0.75" />
      {/* timber frame */}
      <path d="M38 64 V42 Q50 30 62 42 V64" fill="#040309" />
      <path d="M36 64 V43 Q50 29 64 43 V64" fill="none" stroke="#4d3118" strokeWidth="2.6" />
      <path d="M40 46 H60" stroke="#4d3118" strokeWidth="1.6" />
      {/* a glint deep inside */}
      <polygon className="scene-gem" points="50,48 54,52 50,58 46,52" fill="var(--c)" />
      <polygon points="50,48 54,52 50,52 46,52" fill="#fff" opacity="0.55" />
      {/* rails */}
      <path d="M30 64 L44 48 M70 64 L56 48" stroke="#9b94a8" strokeWidth="1" opacity="0.8" />
      <path d="M34 60 H66 M38 56 H62 M42 52 H58" stroke="#5e5768" strokeWidth="0.8" opacity="0.7" />
      {/* a pickaxe leaning on the frame */}
      <path d="M26 64 L31 50" stroke="#6b4a2a" strokeWidth="1.3" />
      <path d="M27 50 Q31 46 35 50" fill="none" stroke="#c9c2d6" strokeWidth="1.6" />
    </>
  )
}

function Workshop({ color }: { color: Color }) {
  return (
    <>
      <rect width="100" height="64" fill={`url(#sky-${color})`} />
      {/* back wall stones */}
      <path d="M0 0h100v64H0Z" fill="#000" opacity="0.25" />
      <path d="M0 14h100M0 28h100M0 42h100M20 0v14M60 0v14M40 14v14M80 14v14M10 28v14M50 28v14M90 28v14" stroke="#fff" strokeWidth="0.5" opacity="0.07" />
      {/* arched window with the night outside */}
      <path d="M66 30 V14 Q78 2 90 14 V30Z" fill={`url(#sky-${color})`} />
      <path d="M66 30 V14 Q78 2 90 14 V30Z" fill={`url(#beam-${color})`} opacity="0.6" />
      <path d="M66 30 V14 Q78 2 90 14 V30Z" fill="none" stroke="#2a2232" strokeWidth="2" />
      <path d="M78 6 V30 M66 20 H90" stroke="#2a2232" strokeWidth="1.2" />
      {/* floor */}
      <rect y="48" width="100" height="16" fill="#0d0a13" />
      <path d="M0 48h100" stroke="#fff" strokeWidth="0.6" opacity="0.08" />
      {/* forge glow on the left */}
      <ellipse cx="14" cy="40" rx="18" ry="12" fill={`url(#beam-${color})`} opacity="0.5" />
      <rect x="2" y="32" width="18" height="16" rx="1" fill="#1a1119" />
      <path d="M5 44 Q11 34 17 44Z" fill="var(--c)" opacity="0.9" />
      {/* stump and anvil */}
      <rect x="40" y="44" width="20" height="10" rx="1" fill="#2d1b10" />
      <path d="M30 34 H62 C66 34 67 36 67 38 S66 42 62 42 H50 L52 46 H48 L46 42 H42 C36 42 32 40 30 36Z" fill="#171521" />
      <path d="M32 35 H62" stroke="#fff" strokeWidth="0.9" opacity="0.22" />
      {/* hammer */}
      <path d="M70 48 L58 36" stroke="#6b4a2a" strokeWidth="1.4" />
      <rect x="54" y="30" width="9" height="6" rx="1" transform="rotate(45 58.5 33)" fill="#3a3650" />
      {/* sparks */}
      <g className="scene-sparks" fill="var(--c)">
        <circle cx="34" cy="27" r="0.9" />
        <circle cx="39" cy="22" r="0.7" opacity="0.8" />
        <circle cx="45" cy="25" r="1.1" />
        <circle cx="52" cy="20" r="0.7" opacity="0.7" />
        <circle cx="58" cy="26" r="0.9" />
      </g>
    </>
  )
}

function Palace({ color }: { color: Color }) {
  return (
    <>
      <rect width="100" height="64" fill={`url(#sky-${color})`} />
      <Stars />
      <circle cx="50" cy="26" r="26" fill={`url(#beam-${color})`} opacity="0.55" />
      {/* side towers */}
      <rect x="10" y="26" width="14" height="38" fill="#0e0b16" />
      <rect x="76" y="26" width="14" height="38" fill="#0e0b16" />
      <path d="M8 27 L17 16 L26 27Z M74 27 L83 16 L92 27Z" fill="#0a0812" />
      {/* main body */}
      <rect x="22" y="34" width="56" height="30" fill="#110d1a" />
      {/* dome */}
      <path d="M34 34 Q50 10 66 34Z" fill="#0c0914" />
      <path d="M50 10 V6 M47 7 H53" stroke="#f3dc9a" strokeWidth="1" />
      <path d="M38 34 Q50 18 62 34" fill="none" stroke="#f3dc9a" strokeWidth="0.6" opacity="0.5" />
      {/* columns */}
      <g fill="#1b1626">
        <rect x="26" y="38" width="3" height="22" />
        <rect x="34" y="38" width="3" height="22" />
        <rect x="63" y="38" width="3" height="22" />
        <rect x="71" y="38" width="3" height="22" />
      </g>
      <path d="M24 38 H76" stroke="#f3dc9a" strokeWidth="0.8" opacity="0.55" />
      {/* lit doorway */}
      <path d="M43 60 V46 Q50 38 57 46 V60Z" fill={`url(#beam-${color})`} />
      <path d="M43 60 V46 Q50 38 57 46 V60Z" fill="var(--c)" opacity="0.45" />
      {/* windows */}
      <g fill="var(--c)" opacity="0.7">
        <rect x="14" y="32" width="3" height="5" rx="1.5" />
        <rect x="83" y="32" width="3" height="5" rx="1.5" />
        <rect x="14" y="44" width="3" height="5" rx="1.5" />
        <rect x="83" y="44" width="3" height="5" rx="1.5" />
      </g>
      {/* steps */}
      <rect x="38" y="60" width="24" height="1.6" fill="#2a2338" />
      <rect x="34" y="61.6" width="32" height="1.6" fill="#241e30" />
      <rect x="30" y="63.2" width="40" height="1" fill="#1d1827" />
    </>
  )
}

export function CardScene({ tier, bonus }: { tier: Tier; bonus: Color }) {
  return (
    <svg className="scene" viewBox="0 0 100 64" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {tier === 1 ? <Mine color={bonus} /> : tier === 2 ? <Workshop color={bonus} /> : <Palace color={bonus} />}
    </svg>
  )
}
