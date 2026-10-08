// Hard: a positional evaluation plus a shallow search.
//
// 1. Every legal action is applied (own discard / guest choice resolved) and
//    the resulting position is scored: own evaluation minus a share of the
//    strongest opponent's evaluation.
// 2. The best few candidates are then played forward for a couple of rounds
//    with every player following a greedy one-ply policy on the same
//    evaluation, and the position at the end decides. Because the game-over
//    state is detected exactly, this covers the race to 15, the final round
//    and its tie-break, and "the opponent wins next turn unless I take that
//    card" (a denial reserve simply scores better than anything else).
//
// The search runs on fairView(state): unknown cards are placeholders that can
// be neither bought nor evaluated, so hidden information cannot leak in.

import { COLORS, TIERS, TOKEN_COLORS } from '../shared/contract'
import type { Action, Card, GameState, TokenColor } from '../shared/contract'
import { applyAction, getBonuses, getScore } from '../engine'
import { colorMapOf, gatherTurns, isUnknown, knownActions } from './common'

export interface HardParams {
  point: number // value of one point
  pointLate: number // extra value of a point as the game approaches its end
  win: number // reaching 15
  bonus: number[] // marginal value of the n-th bonus of one color
  bonusFade: number // how much bonuses lose value late in the game
  noble: number // value scale of noble progress
  token: number
  gold: number
  ready: number // potential of a card that can be bought right now
  gamma: number // potential decay per turn of token gathering
  contest: number // discount for board cards somebody else may take first
  w2: number
  w3: number
  reservedSlot: number // cost of a clogged reserve slot
  unknown: number // value of a blind reserved card
  discard: number // cost of each token a move forces back to the bank
  alpha: number // weight of the best opponent's evaluation
  beam: number // candidates searched deeper
  rounds: number // look-ahead length in rounds
}

export const DEFAULT_PARAMS: HardParams = {
  point: 10,
  pointLate: 6,
  win: 60,
  bonus: [4.5, 4.2, 3.8, 3.2, 2.2, 1.2, 0.6, 0.3],
  bonusFade: 0.6,
  noble: 30,
  token: 0.35,
  gold: 1.4,
  ready: 0.62,
  gamma: 0.8,
  contest: 0.9,
  w2: 0.5,
  w3: 0.25,
  reservedSlot: 0.8,
  unknown: 1.5,
  discard: 4,
  alpha: 0.5,
  beam: 6,
  rounds: 2,
}

// Share of the 3 noble points credited when `missing` bonuses are still needed.
const NOBLE_PROGRESS = [1, 0.6, 0.42, 0.28, 0.18, 0.11, 0.06, 0.03, 0.01]

const WIN = 100000

interface Ctx {
  P: HardParams
  stage: number // 0 at the start, 1 when somebody is at 15
  gammaPow: number[]
}

function makeCtx(state: GameState, P: HardParams): Ctx {
  let top = 0
  for (const p of state.players) top = Math.max(top, getScore(p))
  const gammaPow: number[] = []
  for (let i = 0; i < 40; i++) gammaPow.push(Math.pow(P.gamma, i))
  return { P, stage: Math.min(1, top / 15), gammaPow }
}

// How good the position looks for player `p`, from public information and
// p's own reserve.
export function evaluate(state: GameState, p: number, ctx: Ctx): number {
  const P = ctx.P
  const player = state.players[p]
  const bonuses = getBonuses(player)
  const tokens = player.tokens
  const score = getScore(player)
  const pointValue = P.point + P.pointLate * ctx.stage
  const bonusScale = 1 - P.bonusFade * ctx.stage

  let e = score * pointValue
  if (score >= 15) e += P.win + (score - 15) * pointValue - player.cards.length * 2

  for (const c of COLORS) {
    const n = bonuses[c]
    for (let i = 0; i < n; i++) e += (P.bonus[i] ?? 0.2) * bonusScale
  }

  const nobleGain = colorMapOf(0)
  for (const noble of state.nobles) {
    let missing = 0
    for (const c of COLORS) {
      const d = noble.requirement[c] - bonuses[c]
      if (d > 0) missing += d
    }
    e += P.noble * (NOBLE_PROGRESS[missing] ?? 0)
    if (missing > 0) {
      const gain = P.noble * ((NOBLE_PROGRESS[missing - 1] ?? 0) - (NOBLE_PROGRESS[missing] ?? 0))
      for (const c of COLORS) if (noble.requirement[c] > bonuses[c]) nobleGain[c] += gain
    }
  }

  e +=
    P.token * (tokens.white + tokens.blue + tokens.green + tokens.red + tokens.black) +
    P.gold * tokens.gold

  let top1 = 0
  let top2 = 0
  let top3 = 0
  const consider = (card: Card, mine: boolean): void => {
    let v = card.points * pointValue + (P.bonus[bonuses[card.bonus]] ?? 0.2) * bonusScale
    v += nobleGain[card.bonus]
    if (score + card.points >= 15) v += P.win
    const turns = gatherTurns(card, bonuses, tokens, state.bank)
    let pot = v * P.ready * (ctx.gammaPow[turns] ?? 0)
    if (!mine) pot *= P.contest
    if (pot > top1) {
      top3 = top2
      top2 = top1
      top1 = pot
    } else if (pot > top2) {
      top3 = top2
      top2 = pot
    } else if (pot > top3) top3 = pot
  }
  for (const tier of TIERS) {
    for (const card of state.board[tier]) {
      if (card !== null && !isUnknown(card)) consider(card, false)
    }
  }
  for (const r of player.reserved) {
    e -= P.reservedSlot
    if (isUnknown(r.card)) e += P.unknown
    else consider(r.card, true)
  }
  e += top1 + P.w2 * top2 + P.w3 * top3
  return e
}

// Position value for `me`: own evaluation against the strongest opponent.
function positionValue(state: GameState, me: number, ctx: Ctx): number {
  if (state.phase === 'gameOver' && state.winners) {
    const mine = getScore(state.players[me])
    let other = 0
    for (let i = 0; i < state.players.length; i++) {
      if (i !== me) other = Math.max(other, getScore(state.players[i]))
    }
    if (state.winners.includes(me)) return WIN / state.winners.length + (mine - other)
    return -WIN + (mine - other)
  }
  let best = -Infinity
  for (let i = 0; i < state.players.length; i++) {
    if (i !== me) best = Math.max(best, evaluate(state, i, ctx))
  }
  return evaluate(state, me, ctx) - ctx.P.alpha * best
}

// The guest (noble) an opponent is closest to: taking it first costs nothing,
// the other one can still visit on a later turn.
function chooseGuest(state: GameState, me: number): Action {
  let bestId = state.eligibleNobles[0]
  let bestMissing = Infinity
  for (const id of state.eligibleNobles) {
    const noble = state.nobles.find((n) => n.id === id)
    if (!noble) continue
    for (let i = 0; i < state.players.length; i++) {
      if (i === me) continue
      const b = getBonuses(state.players[i])
      let missing = 0
      for (const c of COLORS) missing += Math.max(0, noble.requirement[c] - b[c])
      if (missing < bestMissing) {
        bestMissing = missing
        bestId = id
      }
    }
  }
  return { type: 'chooseNoble', nobleId: bestId }
}

// Returns tokens one at a time, each time the one whose loss hurts least.
function greedyDiscard(state: GameState, me: number, ctx: Ctx): Action {
  const player = state.players[me]
  let excess = -10
  for (const c of TOKEN_COLORS) excess += player.tokens[c]
  const tokens = { ...player.tokens }
  const bank = { ...state.bank }
  const out: Partial<Record<TokenColor, number>> = {}
  for (let k = 0; k < excess; k++) {
    let bestColor: TokenColor | null = null
    let bestValue = -Infinity
    for (const c of TOKEN_COLORS) {
      if (tokens[c] === 0) continue
      tokens[c] -= 1
      bank[c] += 1
      const players = state.players.slice()
      players[me] = { ...player, tokens }
      const value = evaluate({ ...state, players, bank }, me, ctx)
      tokens[c] += 1
      bank[c] -= 1
      if (value > bestValue) {
        bestValue = value
        bestColor = c
      }
    }
    if (bestColor === null) break
    tokens[bestColor] -= 1
    bank[bestColor] += 1
    out[bestColor] = (out[bestColor] ?? 0) + 1
  }
  return { type: 'discard', tokens: out }
}

// Tokens the action will force the player to give back (the 10-token limit).
// Such turns are mostly wasted; charging for them also keeps two hoarding
// players from circling forever.
function wastedTokens(state: GameState, action: Action): number {
  let gain = 0
  if (action.type === 'takeDifferent') gain = action.colors.length
  else if (action.type === 'takeSame') gain = 2
  else if (action.type === 'reserveBoard' || action.type === 'reserveDeck') {
    gain = state.bank.gold > 0 ? 1 : 0
  } else return 0
  let held = 0
  const tokens = state.players[state.currentPlayer].tokens
  for (const c of TOKEN_COLORS) held += tokens[c]
  return Math.max(0, held + gain - 10)
}

// Applies a main action and resolves the mover's follow-up phases.
function playTurn(state: GameState, action: Action, ctx: Ctx): GameState {
  const me = state.currentPlayer
  let s = applyAction(state, action)
  while (s.currentPlayer === me && (s.phase === 'discard' || s.phase === 'chooseNoble')) {
    s = applyAction(s, s.phase === 'discard' ? greedyDiscard(s, me, ctx) : chooseGuest(s, me))
  }
  return s
}

// One greedy turn of the player to move (used inside the look-ahead).
function greedyTurn(state: GameState, ctx: Ctx): GameState {
  const p = state.currentPlayer
  let best: GameState | null = null
  let bestValue = -Infinity
  for (const action of knownActions(state)) {
    if (action.type === 'reserveDeck') continue
    const next = playTurn(state, action, ctx)
    let value: number
    if (next.phase === 'gameOver' && next.winners) {
      value = (next.winners.includes(p) ? WIN : -WIN) + evaluate(next, p, ctx)
    } else value = evaluate(next, p, ctx)
    value -= ctx.P.discard * wastedTokens(state, action)
    if (value > bestValue) {
      bestValue = value
      best = next
    }
  }
  return best ?? playTurn(state, knownActions(state)[0], ctx)
}

export function chooseHard(state: GameState, P: HardParams = DEFAULT_PARAMS): Action {
  const legal = knownActions(state)
  if (legal.length === 1) return legal[0]
  const me = state.currentPlayer
  const ctx = makeCtx(state, P)

  if (state.phase === 'chooseNoble') return chooseGuest(state, me)

  const candidates: { action: Action; next: GameState; value: number; waste: number }[] = []
  for (const action of legal) {
    const next = state.phase === 'discard' ? applyAction(state, action) : playTurn(state, action, ctx)
    const waste = P.discard * wastedTokens(state, action)
    candidates.push({ action, next, value: positionValue(next, me, ctx) - waste, waste })
  }
  candidates.sort((a, b) => b.value - a.value)
  if (state.phase === 'discard') return candidates[0].action

  const plies = P.rounds * state.players.length
  let best = candidates[0]
  let bestValue = -Infinity
  const n = Math.min(P.beam, candidates.length)
  for (let i = 0; i < n; i++) {
    const cand = candidates[i]
    let s = cand.next
    for (let d = 0; d < plies && s.phase !== 'gameOver'; d++) s = greedyTurn(s, ctx)
    const value = positionValue(s, me, ctx) - cand.waste + 0.05 * cand.value
    if (value > bestValue) {
      bestValue = value
      best = cand
    }
  }
  return best.action
}
