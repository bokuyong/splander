// The shared middle of the table: nobles, the three card rows with their
// decks, and the gem bank.
import { TOKEN_COLORS } from '../../shared/contract'
import type { Card, ColorMap, GameState, Noble, Tier, TokenColor } from '../../shared/contract'
import { THEME } from '../../data'
import { CardBack, CardView } from '../components/CardView'
import { Chip } from '../components/Chip'
import { GuestTile } from '../components/GuestTile'
import type { TokenSelection } from '../logic/selection'

const ROWS: Tier[] = [3, 2, 1]

export function GuestsRow({
  guests,
  have,
  onOpen,
}: {
  guests: Noble[]
  have: ColorMap
  onOpen: (guest: Noble) => void
}) {
  return (
    <div className={`guests n${guests.length}`} aria-label={THEME.labels.guests}>
      {guests.length === 0 && <span className="guests-empty">귀족이 모두 떠났어요</span>}
      {guests.map((g) => (
        <GuestTile key={g.id} guest={g} have={have} onClick={() => onOpen(g)} />
      ))}
    </div>
  )
}

interface BoardProps {
  state: GameState
  affordableIds: ReadonlySet<string>
  /** Slots refilled by the last move, as "tier-slot". */
  freshSlots: ReadonlySet<string>
  onOpenCard: (card: Card) => void
  onOpenDeck: (tier: Tier) => void
}

export function Board({ state, affordableIds, freshSlots, onOpenCard, onOpenDeck }: BoardProps) {
  return (
    <div className="board">
      {ROWS.map((tier) => {
        const left = state.decks[tier].length
        return (
          <div className="board-row" key={tier}>
            <button
              type="button"
              className={`card-btn deck${left === 0 ? ' is-empty' : ''}`}
              data-anchor={`deck-${tier}`}
              onClick={() => onOpenDeck(tier)}
              aria-label={`${THEME.tiers[tier].label} ${THEME.labels.deck}, ${left}장 남음`}
            >
              <CardBack tier={tier} count={left} />
            </button>
            {state.board[tier].map((card, slot) => (
              <div
                className={`slot${freshSlots.has(`${tier}-${slot}`) ? " is-new" : ""}`}
                key={slot}
                data-anchor={`slot-${tier}-${slot}`}
              >
                {card ? (
                  <CardView
                    key={card.id}
                    card={card}
                    affordable={affordableIds.has(card.id)}
                    fresh
                    onClick={() => onOpenCard(card)}
                    label={`${THEME.tiers[tier].name} 카드`}
                  />
                ) : (
                  <span className="slot-empty" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

interface BankProps {
  bank: GameState['bank']
  selection: TokenSelection
  enabled: boolean
  onTap: (color: TokenColor) => void
}

export function Bank({ bank, selection, enabled, onTap }: BankProps) {
  return (
    <div className={`bank${enabled ? ' is-enabled' : ''}`} aria-label={THEME.labels.bank}>
      {TOKEN_COLORS.map((color) => {
        const picked = selection.filter((c) => c === color).length
        const left = bank[color] - picked
        return (
          <button
            type="button"
            key={color}
            className={`bank-pile${picked ? ' is-picked' : ''}`}
            data-anchor={`bank-${color}`}
            onClick={() => onTap(color)}
            aria-label={`${THEME.tokens[color].name} ${left}개`}
          >
            <Chip color={color} count={left} dim={left === 0} />
          </button>
        )
      })}
    </div>
  )
}
