// A gem token with an optional count badge (bank piles, hands, trays).
import type { CSSProperties } from 'react'
import type { TokenColor } from '../../shared/contract'
import { THEME } from '../../data'
import { GemToken } from './GemToken'

interface ChipProps {
  color: TokenColor
  /** Diameter in px (default: the surrounding CSS decides via --chip). */
  size?: number
  count?: number
  /** Greyed out, e.g. an empty bank pile. */
  dim?: boolean
  className?: string
}

export function Chip({ color, size, count, dim, className }: ChipProps) {
  const style = size ? ({ '--chip': `${size}px` } as CSSProperties) : undefined
  return (
    <span
      className={`chip c-${color}${dim ? ' is-dim' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      title={THEME.tokens[color].name}
    >
      <GemToken color={color} />
      {count !== undefined && (
        <span className="chip-count" key={count}>
          {count}
        </span>
      )}
    </span>
  )
}
