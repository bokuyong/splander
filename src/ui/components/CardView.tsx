// A development card: parchment face in a double gold frame with filigree
// corners, a metallic tier band, an illustrated scene tinted by the gem it
// discounts, the prestige number top-left, the bonus stone top-right and the
// price as mini gem tokens along the bottom. `size` only switches CSS scale.
import { COLORS } from '../../shared/contract'
import type { Card, Tier } from '../../shared/contract'
import { THEME } from '../../data'
import { isHiddenCard } from '../logic/guests'
import { ArtImage } from './Art'
import { CardScene } from './CardScene'
import { GemToken } from './GemToken'
import { Glyph } from './Glyph'
import { AnvilIcon, MaskIcon, PalaceIcon, PickaxeIcon } from './Icons'

export type CardSize = 'board' | 'mini' | 'large'

interface CardViewProps {
  card: Card
  size?: CardSize
  /** Force the back side (pass-and-play concealment). Hidden placeholders are always face-down. */
  faceDown?: boolean
  affordable?: boolean
  /** Just arrived / just touched by the last move. */
  fresh?: boolean
  /** Small ribbon for cards reserved blind from a deck. */
  secret?: boolean
  onClick?: () => void
  label?: string
}

export function TierIcon({ tier, className }: { tier: Tier; className?: string }) {
  const Cmp = tier === 1 ? PickaxeIcon : tier === 2 ? AnvilIcon : PalaceIcon
  return <Cmp className={className} />
}

/** Four filigree corners, drawn from the shared #corner symbol. */
export function FrameCorners() {
  return (
    <span className="corners" aria-hidden="true">
      {(['tl', 'tr', 'br', 'bl'] as const).map((pos) => (
        <svg key={pos} className={`corner corner-${pos}`} viewBox="0 0 24 24">
          <use href="#corner" />
        </svg>
      ))}
    </span>
  )
}

export function CardBack({ tier, size = 'board', count }: { tier: Tier; size?: CardSize; count?: number }) {
  const t = THEME.tiers[tier]
  return (
    <span className={`card card-back card-${size} tier-${tier}`}>
      <svg className="card-lattice" aria-hidden="true">
        <rect width="100%" height="100%" fill="url(#lattice)" />
      </svg>
      <span className="card-back-seal" aria-hidden="true">
        <TierIcon tier={tier} />
      </span>
      {count !== undefined ? (
        <span className="card-back-count" key={count}>
          {count}
        </span>
      ) : (
        <span className="card-back-name">{t.name}</span>
      )}
      <FrameCorners />
    </span>
  )
}

export function CardFace({ card, size = 'board' }: { card: Card; size?: CardSize }) {
  const costs = COLORS.filter((c) => card.cost[c] > 0)
  return (
    <span className={`card card-face card-${size} c-${card.bonus} tier-${card.tier}`}>
      <svg className="card-paper" aria-hidden="true">
        <rect width="100%" height="100%" filter="url(#parchment)" />
      </svg>
      <span className="card-scene">
        <CardScene tier={card.tier} bonus={card.bonus} />
        <ArtImage path={`cards/t${card.tier}-${card.bonus}.webp`} />
        <span className="card-scene-fade" />
      </span>
      <span className="card-band" aria-hidden="true" />
      <span className="card-mark" aria-hidden="true">
        <TierIcon tier={card.tier} />
      </span>
      <span className="card-top">
        <span className="card-points">{card.points > 0 ? card.points : ''}</span>
        <Glyph color={card.bonus} className="card-bonus" />
      </span>
      <span className={`card-cost n${costs.length}`}>
        {costs.map((c) => (
          <GemToken key={c} color={c} variant="pip" className="pip" label={card.cost[c]} />
        ))}
      </span>
      <FrameCorners />
    </span>
  )
}

export function CardView({ card, size = 'board', faceDown, affordable, fresh, secret, onClick, label }: CardViewProps) {
  const hidden = faceDown || isHiddenCard(card)
  const cls = `card-btn${affordable ? ' is-affordable' : ''}${fresh ? ' is-fresh' : ''}`
  const inner = hidden ? <CardBack tier={card.tier} size={size} /> : <CardFace card={card} size={size} />
  const ribbon = secret ? (
    <span className="card-secret" aria-label="몰래 예약한 카드">
      <MaskIcon />
    </span>
  ) : null
  if (!onClick) {
    return (
      <span className={cls}>
        {inner}
        {ribbon}
      </span>
    )
  }
  return (
    <button type="button" className={cls} onClick={onClick} aria-label={label}>
      {inner}
      {ribbon}
    </button>
  )
}
