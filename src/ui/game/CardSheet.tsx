// Detail sheets for a card (buy / reserve) and for a deck (blind reserve).
import { COLORS, TOKEN_COLORS } from '../../shared/contract'
import type { Action, Card, GameState, Tier } from '../../shared/contract'
import { THEME } from '../../data'
import { engine } from '../../engine'
import { CardBack, CardFace, TierIcon } from '../components/CardView'
import { Chip } from '../components/Chip'
import { BookmarkIcon, MaskIcon } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { netCost, paymentPreview, reserveBlockReason, shortfallText } from '../logic/describe'
import { isHiddenCard } from '../logic/guests'

export type CardPlace = 'board' | 'myReserve' | 'otherReserve'

interface CardSheetProps {
  card: Card
  place: CardPlace
  state: GameState
  viewer: number
  /** Null when the viewer may act now, otherwise why not (e.g. not their turn). */
  blocked: string | null
  onAction: (action: Action) => void
  onClose: () => void
}

export function CardSheet({ card, place, state, viewer, blocked, onAction, onClose }: CardSheetProps) {
  const me = state.players[viewer]
  const hidden = isHiddenCard(card)
  const need = netCost(me, card)
  const bonuses = engine.getBonuses(me)
  const costColors = COLORS.filter((c) => card.cost[c] > 0)
  const canBuyHere = place !== 'otherReserve' && !hidden
  const buy: Action = { type: 'buy', cardId: card.id }
  const reserve: Action = { type: 'reserveBoard', cardId: card.id }

  const shortfall = canBuyHere ? shortfallText(me, card) : null
  const buyReason = blocked ?? shortfall
  const buyOk = canBuyHere && buyReason === null && engine.isLegal(state, buy)
  const reserveReason = blocked ?? reserveBlockReason(me)
  const reserveOk = place === 'board' && reserveReason === null && engine.isLegal(state, reserve)
  const pay = paymentPreview(me, card)
  const payColors = TOKEN_COLORS.filter((c) => pay[c] > 0)
  const tier = THEME.tiers[card.tier]

  return (
    <Sheet
      onClose={onClose}
      title={
        hidden ? (
          `${tier.label} 카드`
        ) : (
          <>
            <TierIcon tier={card.tier} /> {tier.label} · {THEME.tokens[card.bonus].name}
          </>
        )
      }
    >
      <div className="cardsheet">
        <div className="cardsheet-card card-btn">
          {hidden ? <CardBack tier={card.tier} size="large" /> : <CardFace card={card} size="large" />}
        </div>
        {hidden ? (
          <p className="sheet-note">몰래 예약한 카드예요. 주인만 볼 수 있어요.</p>
        ) : (
          <div className="cardsheet-info">
            <p className="cardsheet-line">
              <span className={`tag c-${card.bonus}`}>{THEME.tokens[card.bonus].name}</span>
              {THEME.labels.bonus} +1
            </p>
            <p className="cardsheet-line">
              <span className="tag tag-score">{card.points}</span>
              {THEME.labels.points}
            </p>
            <table className="cost-table">
              <thead>
                <tr>
                  <th />
                  <th>값</th>
                  <th>할인</th>
                  <th>내 보석</th>
                </tr>
              </thead>
              <tbody>
                {costColors.map((c) => {
                  const ok = me.tokens[c] >= need[c]
                  return (
                    <tr key={c} className={`c-${c}`}>
                      <td>
                        <Chip color={c} size={22} />
                      </td>
                      <td>{card.cost[c]}</td>
                      <td className="dim">{bonuses[c] > 0 ? `−${Math.min(bonuses[c], card.cost[c])}` : '·'}</td>
                      <td className={ok ? 'ok' : 'bad'}>
                        {me.tokens[c]}/{need[c]}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {place === 'otherReserve' && !hidden && <p className="sheet-note">다른 사람이 예약한 카드라 살 수 없어요.</p>}

      {canBuyHere && (
        <div className="sheet-actions">
          <div className="sheet-action">
            <button type="button" className="btn btn-primary btn-block" disabled={!buyOk} onClick={() => onAction(buy)}>
              {THEME.actions.buy}
              {buyOk && payColors.length > 0 && (
                <span className="pay">
                  {payColors.map((c) => (
                    <span key={c} className={`pay-item c-${c}`}>
                      <Chip color={c} size={18} />
                      {pay[c]}
                    </span>
                  ))}
                </span>
              )}
              {buyOk && payColors.length === 0 && <span className="pay">공짜!</span>}
            </button>
            <p className={`reason${buyOk ? ' is-info' : ''}`}>
              {buyOk ? (pay.gold > 0 ? `${THEME.tokens.gold.name} ${pay.gold}개로 모자란 보석을 채워요` : '') : buyReason}
            </p>
          </div>
          {place === 'board' && (
            <div className="sheet-action">
              <button type="button" className="btn btn-block" disabled={!reserveOk} onClick={() => onAction(reserve)}>
                <BookmarkIcon /> {THEME.actions.reserveBoard}
              </button>
              <p className={`reason${reserveOk ? ' is-info' : ''}`}>
                {reserveOk
                  ? state.bank.gold > 0
                    ? `${THEME.tokens.gold.name} 1개를 받아요`
                    : `보석함에 ${THEME.tokens.gold.name}이 없어 카드만 예약해요`
                  : reserveReason}
              </p>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

interface DeckSheetProps {
  tier: Tier
  state: GameState
  viewer: number
  blocked: string | null
  onAction: (action: Action) => void
  onClose: () => void
}

export function DeckSheet({ tier, state, viewer, blocked, onAction, onClose }: DeckSheetProps) {
  const left = state.decks[tier].length
  const action: Action = { type: 'reserveDeck', tier }
  const reason =
    blocked ?? (left === 0 ? '더미에 카드가 없어요' : reserveBlockReason(state.players[viewer]))
  const ok = reason === null && engine.isLegal(state, action)
  const t = THEME.tiers[tier]
  return (
    <Sheet
      onClose={onClose}
      title={
        <>
          <TierIcon tier={tier} /> {t.label} {THEME.labels.deck}
        </>
      }
    >
      <div className="cardsheet">
        <div className="cardsheet-card card-btn">
          <CardBack tier={tier} size="large" count={left} />
        </div>
        <div className="cardsheet-info">
          <p>{THEME.actionHints.reserveDeck}.</p>
          <p className="sheet-note">어떤 카드인지는 나만 알 수 있어요. 남은 카드 {left}장.</p>
        </div>
      </div>
      <div className="sheet-actions">
        <div className="sheet-action">
          <button type="button" className="btn btn-primary btn-block" disabled={!ok} onClick={() => onAction(action)}>
            <MaskIcon /> {THEME.actions.reserveDeck}
          </button>
          <p className={`reason${ok ? ' is-info' : ''}`}>
            {ok
              ? state.bank.gold > 0
                ? `${THEME.tokens.gold.name} 1개를 받아요`
                : `보석함에 ${THEME.tokens.gold.name}이 없어 카드만 예약해요`
              : reason}
          </p>
        </div>
      </div>
    </Sheet>
  )
}
