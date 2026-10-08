// Opponent summaries (top of the table) and the viewer's own area (bottom).
import { TOKEN_COLORS } from '../../shared/contract'
import type { ColorMap, PlayerState, ReservedCard, TokenColor } from '../../shared/contract'
import { THEME } from '../../data'
import { engine, MAX_RESERVED, MAX_TOKENS } from '../../engine'
import { AnimatedNumber } from '../components/AnimatedNumber'
import { CardView } from '../components/CardView'
import { Chip } from '../components/Chip'
import { Glyph } from '../components/Glyph'
import { CrownIcon, RobotIcon, UserIcon } from '../components/Icons'
import { NobleCrest } from '../components/NobleCrest'

function bonusOf(bonuses: ColorMap, color: TokenColor): number | null {
  return color === 'gold' ? null : bonuses[color]
}

/** Six columns: gem discounts (square) over gems in hand (round). */
function ResourceGrid({ player }: { player: PlayerState }) {
  const bonuses = engine.getBonuses(player)
  return (
    <span className="res-grid">
      {TOKEN_COLORS.map((color) => {
        const bonus = bonusOf(bonuses, color)
        const tokens = player.tokens[color]
        return (
          <span key={color} className={`res c-${color}`}>
            <span className={`res-bonus${bonus ? '' : ' is-zero'}${bonus === null ? ' is-none' : ''}`}>
              {bonus === null ? '' : bonus}
            </span>
            <span className={`res-tok${tokens ? '' : ' is-zero'}`} key={tokens}>
              {tokens}
            </span>
          </span>
        )
      })}
    </span>
  )
}

interface OpponentPanelProps {
  player: PlayerState
  seat: number
  active: boolean
  thinking: boolean
  highlight: boolean
  winner: boolean
  onOpen: () => void
}

export function OpponentPanel({ player, seat, active, thinking, highlight, winner, onOpen }: OpponentPanelProps) {
  const score = engine.getScore(player)
  return (
    <button
      type="button"
      className={`opp${active ? ' is-active' : ''}${highlight ? ' is-hit' : ''}`}
      data-anchor={`seat-${seat}`}
      onClick={onOpen}
      aria-label={`${player.name} 자세히 보기`}
    >
      <span className="opp-head">
        <span className="opp-name">
          <span className="opp-kind" aria-hidden="true">
            {winner ? <CrownIcon className="is-gold" /> : player.kind === 'ai' ? <RobotIcon /> : <UserIcon />}
          </span>
          <span className="opp-name-text">{player.name}</span>
          {thinking && (
            <span className="dots" aria-label="생각 중">
              <i />
              <i />
              <i />
            </span>
          )}
        </span>
        <span className="opp-meta">
          {player.nobles.length > 0 && (
            <span className="opp-guests" aria-label={`${THEME.labels.guests} ${player.nobles.length}`}>
              {player.nobles.map((n) => (
                <NobleCrest key={n.id} noble={n} className="portrait-xs" />
              ))}
            </span>
          )}
          <span className="opp-reserved" aria-label={`${THEME.labels.reserved} ${player.reserved.length}`}>
            {Array.from({ length: MAX_RESERVED }, (_, i) => (
              <i key={i} className={i < player.reserved.length ? 'is-on' : ''} />
            ))}
          </span>
          <span className="score">
            <AnimatedNumber value={score} />
          </span>
        </span>
      </span>
      <ResourceGrid player={player} />
    </button>
  )
}

interface MyAreaProps {
  player: PlayerState
  seat: number
  active: boolean
  highlight: boolean
  /** Reserved cards the viewer could buy right now. */
  affordableIds: ReadonlySet<string>
  onOpenReserved: (reserved: ReservedCard) => void
  onOpenSelf: () => void
}

export function MyArea({ player, seat, active, highlight, affordableIds, onOpenReserved, onOpenSelf }: MyAreaProps) {
  const bonuses = engine.getBonuses(player)
  const score = engine.getScore(player)
  const held = engine.tokenCount(player)
  return (
    <section
      className={`me${active ? ' is-active' : ''}${highlight ? ' is-hit' : ''}`}
      data-anchor={`seat-${seat}`}
      aria-label="내 상점"
    >
      <button type="button" className="me-head" onClick={onOpenSelf} aria-label="내 상점 자세히 보기">
        <span className="me-name">{player.name}</span>
        {player.nobles.length > 0 && (
          <span className="me-guests">
            {player.nobles.map((n) => (
              <NobleCrest key={n.id} noble={n} className="portrait-xs" />
            ))}
          </span>
        )}
        <span className={`me-held${held >= MAX_TOKENS ? ' is-full' : ''}`}>
          {THEME.labels.tokens} {held}/{MAX_TOKENS}
        </span>
        <span className="score score-big">
          <AnimatedNumber value={score} />
          <small>점</small>
        </span>
      </button>
      <div className="me-body">
        <div className="me-res">
          {TOKEN_COLORS.map((color) => {
            const bonus = bonusOf(bonuses, color)
            return (
              <span key={color} className={`me-col c-${color}`}>
                {bonus === null ? (
                  <span className="bloom is-none" />
                ) : (
                  <span className={`bloom${bonus ? '' : ' is-zero'}`} title={THEME.labels.bonus}>
                    <Glyph color={color} />
                    <b key={bonus}>{bonus}</b>
                  </span>
                )}
                <Chip color={color} count={player.tokens[color]} dim={player.tokens[color] === 0} />
              </span>
            )
          })}
        </div>
        <div className="me-reserved" aria-label={THEME.labels.reserved}>
          {Array.from({ length: MAX_RESERVED }, (_, i) => {
            const r = player.reserved[i]
            return r ? (
              <span className="me-slot" key={r.card.id}>
                <CardView
                  card={r.card}
                  size="mini"
                  secret={r.fromDeck}
                  affordable={affordableIds.has(r.card.id)}
                  fresh
                  onClick={() => onOpenReserved(r)}
                  label={`${THEME.labels.reserved} ${i + 1}`}
                />
              </span>
            ) : (
              <span className="me-slot is-empty" key={`empty-${i}`}>
                <span aria-hidden="true">예약</span>
              </span>
            )
          })}
        </div>
      </div>
    </section>
  )
}
