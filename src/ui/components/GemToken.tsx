// A gem as a physical object. Three variants share the same cut shapes:
//  - 'token': a minted chip (colored rim, milled ticks, dark velvet well, gem)
//  - 'pip':   a cabochon disc with a number on it (card costs, noble needs)
//  - 'bare':  just the cut stone (card bonus marks, inline icons)
// Gradients come from ArtDefs (#gem-*, #ring-*). Shapes differ per gem kind
// so they stay distinguishable at 14px and for color-blind eyes.
import type { CSSProperties, ReactNode } from 'react'
import type { TokenColor } from '../../shared/contract'
import { THEME } from '../../data'

export type GemVariant = 'token' | 'pip' | 'bare'

interface GemTokenProps {
  color: TokenColor
  /** Box size in px; omitted = 1em / CSS decides. */
  size?: number
  variant?: GemVariant
  /** Text drawn over the stone (pip numbers). */
  label?: ReactNode
  dim?: boolean
  className?: string
  title?: string
}

/** Cut stones in a 24x24 space. */
function Stone({ color }: { color: TokenColor }) {
  const fill = `url(#gem-${color})`
  switch (color) {
    case 'white':
      // round brilliant: octagonal table, eight crown facets
      return (
        <>
          <circle className="gem-body" cx="12" cy="12" r="10" fill={fill} />
          <path
            className="gem-facet"
            d="M12 2V6.5M19.1 4.9 15.9 8.1M22 12h-4.5M19.1 19.1l-3.2-3.2M12 22v-4.5M4.9 19.1l3.2-3.2M2 12h4.5M4.9 4.9l3.2 3.2"
          />
          <polygon className="gem-table" points="12,6.5 15.9,8.1 17.5,12 15.9,15.9 12,17.5 8.1,15.9 6.5,12 8.1,8.1" />
          <circle className="gem-edge" cx="12" cy="12" r="10" />
        </>
      )
    case 'blue':
      // cushion cut
      return (
        <>
          <rect className="gem-body" x="3" y="3" width="18" height="18" rx="5.5" fill={fill} />
          <path className="gem-facet" d="M4.6 4.6l3.4 3.4M19.4 4.6 16 8M19.4 19.4 16 16M4.6 19.4 8 16M12 3v4.6M21 12h-4.6M12 21v-4.6M3 12h4.6" />
          <rect className="gem-table" x="7.6" y="7.6" width="8.8" height="8.8" rx="2.4" />
          <rect className="gem-edge" x="3" y="3" width="18" height="18" rx="5.5" />
        </>
      )
    case 'green':
      // emerald (step) cut
      return (
        <>
          <polygon className="gem-body" points="7,3 17,3 21,7 21,17 17,21 7,21 3,17 3,7" fill={fill} />
          <polygon className="gem-step" points="8.3,5.6 15.7,5.6 18.4,8.3 18.4,15.7 15.7,18.4 8.3,18.4 5.6,15.7 5.6,8.3" />
          <path className="gem-facet" d="M7 3l2.6 5.2M17 3l-2.6 5.2M21 7l-5.2 2.6M21 17l-5.2-2.6M17 21l-2.6-5.2M7 21l2.6-5.2M3 17l5.2-2.6M3 7l5.2 2.6" />
          <polygon className="gem-table" points="9.6,8.2 14.4,8.2 15.8,9.6 15.8,14.4 14.4,15.8 9.6,15.8 8.2,14.4 8.2,9.6" />
          <polygon className="gem-edge" points="7,3 17,3 21,7 21,17 17,21 7,21 3,17 3,7" />
        </>
      )
    case 'red':
      // oval cut
      return (
        <>
          <ellipse className="gem-body" cx="12" cy="12" rx="8" ry="10" fill={fill} />
          <path
            className="gem-facet"
            d="M20 12h-4M17.7 19.1l-2.9-3.4M12 22v-4.8M6.3 19.1l2.9-3.4M4 12h4M6.3 4.9l2.9 3.4M12 2v4.8M17.7 4.9l-2.9 3.4"
          />
          <ellipse className="gem-table" cx="12" cy="12" rx="4" ry="5.2" />
          <ellipse className="gem-edge" cx="12" cy="12" rx="8" ry="10" />
        </>
      )
    case 'black':
      // hexagonal cut
      return (
        <>
          <polygon className="gem-body" points="12,2 21,7 21,17 12,22 3,17 3,7" fill={fill} />
          <path className="gem-facet" d="M12 2v5.5M21 7l-4.8 2.8M21 17l-4.8-2.8M12 22v-5.5M3 17l4.8-2.8M3 7l4.8 2.8" />
          <polygon className="gem-table" points="12,7.5 16.2,9.8 16.2,14.2 12,16.5 7.8,14.2 7.8,9.8" />
          <polygon className="gem-edge" points="12,2 21,7 21,17 12,22 3,17 3,7" />
        </>
      )
    case 'gold':
      // a minted coin with a crown in relief
      return (
        <>
          <circle className="gem-body" cx="12" cy="12" r="10" fill="url(#coin-face)" />
          <circle cx="12" cy="12" r="8.2" fill="none" stroke="rgba(120,80,10,0.45)" strokeWidth="0.6" />
          <path className="coin-relief-hi" d="M7.4 15.1V9.3l2.9 2.3L12 7.7l1.7 3.9 2.9-2.3v5.8Z" />
          <path className="coin-relief" d="M7.4 15.6V9.8l2.9 2.3L12 8.2l1.7 3.9 2.9-2.3v5.8Z" />
          <circle className="gem-edge" cx="12" cy="12" r="10" />
        </>
      )
  }
}

export function GemToken({ color, size, variant = 'token', label, dim, className, title }: GemTokenProps) {
  const style = size ? ({ '--tok': `${size}px` } as CSSProperties) : undefined
  const cls = `tok tok-${variant} c-${color}${dim ? ' is-dim' : ''}${className ? ` ${className}` : ''}`
  const gold = color === 'gold'
  return (
    <span className={cls} style={style} title={title ?? THEME.tokens[color].name}>
      {variant === 'bare' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <Stone color={color} />
          {!gold && (
            <ellipse className="gem-spec" cx="9" cy="7.5" rx="2.6" ry="1.5" fill="url(#tk-spec)" transform="rotate(-30 9 7.5)" />
          )}
        </svg>
      ) : variant === 'pip' ? (
        <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <circle cx="24" cy="24" r="22" fill={gold ? 'url(#coin-face)' : `url(#gem-${color})`} />
          <circle cx="24" cy="24" r="22" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="2" />
          <circle cx="24" cy="24" r="20.5" fill="none" stroke="url(#tk-edge)" strokeWidth="1.6" opacity="0.8" />
          <ellipse cx="17" cy="13" rx="7" ry="3.5" fill="url(#tk-spec)" transform="rotate(-30 17 13)" />
        </svg>
      ) : (
        <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          {/* rim */}
          <circle cx="24" cy="24" r="23" fill={`url(#ring-${color})`} />
          <circle cx="24" cy="24" r="22.2" fill="none" stroke="url(#tk-edge)" strokeWidth="1.5" />
          {/* milled ticks */}
          <circle
            cx="24"
            cy="24"
            r="19.6"
            fill="none"
            stroke={gold ? 'rgba(90,60,5,0.5)' : color === 'white' ? 'rgba(60,70,100,0.4)' : 'rgba(0,0,0,0.42)'}
            strokeWidth="1.6"
            strokeDasharray="1.3 2.1"
          />
          {/* well / coin face */}
          <circle cx="24" cy="24" r="17.6" fill={gold ? 'url(#coin-face)' : 'url(#tk-well)'} />
          <circle cx="24" cy="24" r="17.6" fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="1" />
          {gold ? (
            <g transform="translate(24 24) scale(1.35) translate(-12 -12)">
              <path className="coin-relief-hi" d="M6.6 16.1V8.3l3.6 3L12 5.6l1.8 5.7 3.6-3v7.8Z" />
              <path className="coin-relief" d="M6.6 16.6V8.8l3.6 3L12 6.1l1.8 5.7 3.6-3v7.8Z" />
              <path d="M8 17.6h8" stroke="#7a4e0c" strokeWidth="1.1" strokeLinecap="round" />
            </g>
          ) : (
            <>
              <circle cx="24" cy="24" r="16" fill={`url(#glow-${color})`} opacity="0.55" />
              <g transform="translate(24 24) scale(1.12) translate(-12 -12)">
                <Stone color={color} />
              </g>
            </>
          )}
          {/* specular on the rim and the stone */}
          <ellipse className="gem-spec" cx="17" cy="15" rx="5" ry="2.6" fill="url(#tk-spec)" transform="rotate(-35 17 15)" />
        </svg>
      )}
      {label !== undefined && <span className="tok-label">{label}</span>}
    </span>
  )
}
