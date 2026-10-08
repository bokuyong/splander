// A noble tile: oval portrait, the gem discounts it asks for as mini gem
// tokens, and the 3 prestige as a crown badge.
import { COLORS } from '../../shared/contract'
import type { ColorMap, Noble } from '../../shared/contract'
import { GemToken } from './GemToken'
import { CheckIcon, CrownIcon } from './Icons'
import { NobleCrest } from './NobleCrest'

interface GuestTileProps {
  guest: Noble
  /** The viewer's gem discounts: satisfied requirements get a tick. */
  have?: ColorMap
  size?: 'row' | 'large'
  showName?: boolean
  fresh?: boolean
  onClick?: () => void
}

export function GuestTile({ guest, have, size = 'row', showName, fresh, onClick }: GuestTileProps) {
  const needs = COLORS.filter((c) => guest.requirement[c] > 0)
  const body = (
    <>
      <NobleCrest noble={guest} className="guest-face" />
      <span className="guest-info">
        {showName && <span className="guest-name">{guest.name}</span>}
        <span className="guest-needs">
          {needs.map((c) => {
            const met = have !== undefined && have[c] >= guest.requirement[c]
            return (
              <span key={c} className={`need${met ? ' is-met' : ''}`}>
                <GemToken color={c} variant="pip" label={guest.requirement[c]} />
                {met && (
                  <span className="need-tick" aria-hidden="true">
                    <CheckIcon />
                  </span>
                )}
              </span>
            )
          })}
        </span>
      </span>
      <span className="guest-points" aria-label={`명성 ${guest.points}`}>
        <CrownIcon />
        {guest.points}
      </span>
    </>
  )
  const cls = `guest guest-${size}${fresh ? ' is-fresh' : ''}`
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={guest.name}>
      {body}
    </button>
  ) : (
    <span className={cls}>{body}</span>
  )
}
