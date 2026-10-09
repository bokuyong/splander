// Forced decisions (discard down to 10, choose a noble) and the info sheets
// (a player's shop, a noble, the move log).
import { useState } from 'react'
import { COLORS, TOKEN_COLORS } from '../../shared/contract'
import type { Action, ColorMap, GameState, Noble, TokenMap } from '../../shared/contract'
import { THEME } from '../../data'
import { engine, MAX_TOKENS } from '../../engine'
import { CardView } from '../components/CardView'
import { Chip } from '../components/Chip'
import { Glyph } from '../components/Glyph'
import { GuestTile } from '../components/GuestTile'
import { CrownIcon, RobotIcon, ScrollIcon, TrayIcon, UserIcon } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import type { LogEntry } from './useGameFeed'

const NO_TOKENS: TokenMap = { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }

export function DiscardModal({
  state,
  onAction,
}: {
  state: GameState
  onAction: (action: Action) => void
}) {
  const player = state.players[state.currentPlayer]
  const excess = engine.tokenCount(player) - MAX_TOKENS
  const [give, setGive] = useState<TokenMap>(NO_TOKENS)
  const chosen = TOKEN_COLORS.reduce((sum, c) => sum + give[c], 0)
  const left = excess - chosen
  const action: Action = { type: 'discard', tokens: give }
  const ok = left === 0 && engine.isLegal(state, action)

  const change = (color: keyof TokenMap, by: number) => {
    setGive((g) => {
      const next = g[color] + by
      if (next < 0 || next > player.tokens[color]) return g
      if (by > 0 && chosen >= excess) return g
      return { ...g, [color]: next }
    })
  }

  return (
    <Sheet
      locked
      placement="center"
      title={
        <>
          <TrayIcon /> {THEME.actions.discard}
        </>
      }
    >
      <p className="sheet-note">
        {THEME.actionHints.discard}. {excess}개를 보석함에 돌려놓아요.
      </p>
      <div className="discard">
        {TOKEN_COLORS.filter((c) => player.tokens[c] > 0).map((c) => (
          <div className="discard-row" key={c}>
            <Chip color={c} size={36} count={player.tokens[c] - give[c]} />
            <span className="discard-name">{THEME.tokens[c].name}</span>
            <button
              type="button"
              className="step"
              onClick={() => change(c, -1)}
              disabled={give[c] === 0}
              aria-label={`${THEME.tokens[c].name} 되돌리기`}
            >
              −
            </button>
            <span className={`discard-n${give[c] ? ' is-on' : ''}`}>{give[c]}</span>
            <button
              type="button"
              className="step"
              onClick={() => change(c, 1)}
              disabled={give[c] >= player.tokens[c] || left === 0}
              aria-label={`${THEME.tokens[c].name} 내려놓기`}
            >
              +
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-primary btn-block" disabled={!ok} onClick={() => onAction(action)}>
        {left > 0 ? `${left}개 더 골라요` : `${excess}개 내려놓기`}
      </button>
    </Sheet>
  )
}

export function GuestChoiceModal({
  state,
  onAction,
}: {
  state: GameState
  onAction: (action: Action) => void
}) {
  const guests = state.nobles.filter((n) => state.eligibleNobles.includes(n.id))
  return (
    <Sheet
      locked
      placement="center"
      title={
        <>
          <CrownIcon /> {THEME.actions.chooseNoble}
        </>
      }
    >
      <p className="sheet-note">{THEME.actionHints.chooseNoble}. 한 번에 한 명만 맞이할 수 있어요.</p>
      <div className="guest-choice">
        {guests.map((g) => (
          <GuestTile
            key={g.id}
            guest={g}
            size="large"
            showName
            onClick={() => onAction({ type: 'chooseNoble', nobleId: g.id })}
          />
        ))}
      </div>
    </Sheet>
  )
}

export function GuestSheet({ guest, have, onClose }: { guest: Noble; have: ColorMap; onClose: () => void }) {
  const needs = COLORS.filter((c) => guest.requirement[c] > 0)
  const missing = needs.filter((c) => have[c] < guest.requirement[c])
  return (
    <Sheet onClose={onClose} title={THEME.labels.guest}>
      <GuestTile guest={guest} size="large" showName have={have} />
      <ul className="need-list">
        {needs.map((c) => (
          <li key={c} className={`c-${c}`}>
            <Glyph color={c} />
            {THEME.tokens[c].name} {THEME.labels.bonus} {Math.min(have[c], guest.requirement[c])}/
            {guest.requirement[c]}
          </li>
        ))}
      </ul>
      <p className="sheet-note">
        {missing.length === 0
          ? '조건을 다 채웠어요. 내 차례가 끝날 때 방문해요!'
          : `${THEME.labels.bonus}이 모이면 차례가 끝날 때 저절로 방문해 ${THEME.labels.points} ${guest.points}점을 줘요. 보석이 아니라 카드로 세요.`}
      </p>
    </Sheet>
  )
}

export function PlayerSheet({
  state,
  seat,
  viewer,
  onClose,
}: {
  state: GameState
  seat: number
  viewer: number
  onClose: () => void
}) {
  const player = state.players[seat]
  const bonuses = engine.getBonuses(player)
  const mine = seat === viewer
  return (
    <Sheet
      onClose={onClose}
      title={
        <>
          {player.kind === 'ai' ? <RobotIcon /> : <UserIcon />} {player.name}
          {player.kind === 'ai' && player.difficulty ? ` · ${THEME.difficulty[player.difficulty]}` : ''}
        </>
      }
    >
      <div className="psheet-stats">
        <span>
          <b>{engine.getScore(player)}</b>
          {THEME.labels.points}
        </span>
        <span>
          <b>{player.cards.length}</b>산 카드
        </span>
        <span>
          <b>
            {engine.tokenCount(player)}/{MAX_TOKENS}
          </b>
          {THEME.labels.tokens}
        </span>
      </div>
      <div className="psheet-res">
        {TOKEN_COLORS.map((c) => (
          <span key={c} className={`me-col c-${c}`}>
            {c === 'gold' ? (
              <span className="bloom is-none" />
            ) : (
              <span className={`bloom${bonuses[c] ? '' : ' is-zero'}`}>
                <Glyph color={c} />
                <b>{bonuses[c]}</b>
              </span>
            )}
            <Chip color={c} size={34} count={player.tokens[c]} dim={player.tokens[c] === 0} />
          </span>
        ))}
      </div>
      <h3 className="psheet-h">
        {THEME.labels.reserved} {player.reserved.length}/3
      </h3>
      {player.reserved.length === 0 ? (
        <p className="sheet-note">아직 예약한 카드가 없어요.</p>
      ) : (
        <div className="psheet-cards">
          {player.reserved.map((r) => (
            <span className="psheet-card" key={r.card.id}>
              <CardView card={r.card} size="board" faceDown={r.fromDeck && !mine} secret={r.fromDeck} />
            </span>
          ))}
        </div>
      )}
      <h3 className="psheet-h">
        {THEME.labels.guests} {player.nobles.length}
      </h3>
      {player.nobles.length === 0 ? (
        <p className="sheet-note">아직 방문한 귀족이 없어요.</p>
      ) : (
        <div className="psheet-guests">
          {player.nobles.map((n) => (
            <GuestTile key={n.id} guest={n} showName />
          ))}
        </div>
      )}
    </Sheet>
  )
}

export function LogSheet({
  log,
  viewer,
  onClose,
}: {
  log: LogEntry[]
  viewer: number
  onClose: () => void
}) {
  return (
    <Sheet
      onClose={onClose}
      title={
        <>
          <ScrollIcon /> 지난 차례
        </>
      }
    >
      {log.length === 0 ? (
        <p className="sheet-note">아직 아무도 움직이지 않았어요.</p>
      ) : (
        <ol className="log-list">
          {[...log].reverse().map((entry) => (
            <li key={entry.id} className={entry.seat === viewer ? 'is-me' : ''}>
              {entry.note && <small className="log-note">{entry.note}</small>}
              {entry.text}
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  )
}
