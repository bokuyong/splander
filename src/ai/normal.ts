// Normal: a rule-based heuristic player. Each turn it rates every card it could
// buy (points, usefulness of the bonus toward nobles and toward its best
// cards, distance in turns), picks a target, and then buys, reserves or takes
// tokens toward that target. It looks at opponents only for the two classic
// reserve reasons: securing its own key card and denying a winning buy.

import { COLORS } from '../shared/contract'
import type { Action, Card, Color, ColorMap, GameState, PlayerState } from '../shared/contract'
import { canAfford, getBonuses, getScore, tokenCount } from '../engine'
import { colorMapOf, gatherTurns, isUnknown, knownActions, missingTokens, visibleCards } from './common'
import type { Rng } from './common'

interface Rated {
  card: Card
  mine: boolean
  turns: number
  value: number
  rating: number
  miss: ColorMap
}

function rateCards(state: GameState, me: PlayerState, rng: Rng): Rated[] {
  const bonuses = getBonuses(me)
  const score = getScore(me)
  const pointWeight = score >= 10 ? 5 : 3

  // How much one more bonus of each color helps toward the nobles.
  const nobleUse = colorMapOf(0)
  for (const noble of state.nobles) {
    let missing = 0
    for (const c of COLORS) missing += Math.max(0, noble.requirement[c] - bonuses[c])
    if (missing === 0) continue
    for (const c of COLORS) {
      if (noble.requirement[c] > bonuses[c]) nobleUse[c] += 3 / (missing + 1)
    }
  }

  const cards = visibleCards(state, me)
  const rated: Rated[] = cards.map(({ card, mine }) => {
    const turns = gatherTurns(card, bonuses, me.tokens, state.bank)
    let value = card.points * pointWeight + 1 + nobleUse[card.bonus]
    if (bonuses[card.bonus] >= 4) value -= 0.5
    if (score + card.points >= 15) value += 30
    return { card, mine, turns, value, rating: 0, miss: missingTokens(card, bonuses, me.tokens) }
  })

  // A bonus is also worth more when the best point cards cost that color.
  const big = rated
    .filter((r) => r.card.points >= 2)
    .sort((a, b) => b.value / (b.turns + 2) - a.value / (a.turns + 2))
    .slice(0, 3)
  for (const r of rated) {
    for (const b of big) {
      if (b.card !== r.card && b.card.cost[r.card.bonus] > bonuses[r.card.bonus]) r.value += 0.6
    }
    r.rating = (r.value / (r.turns + 1.5)) * (0.95 + 0.1 * rng())
  }
  rated.sort((a, b) => b.rating - a.rating)
  return rated
}

function takeGain(action: Action, first: ColorMap, second: ColorMap | null): number {
  const colors: Color[] =
    action.type === 'takeDifferent'
      ? action.colors
      : action.type === 'takeSame'
        ? [action.color, action.color]
        : []
  const a = { ...first }
  const b = second ? { ...second } : colorMapOf(0)
  let gain = 0
  for (const c of colors) {
    if (a[c] > 0) {
      a[c] -= 1
      gain += 3
    } else if (b[c] > 0) {
      b[c] -= 1
      gain += 1
    } else gain += 0.1
  }
  return gain
}

export function chooseNormal(state: GameState, rng: Rng): Action {
  const legal = knownActions(state)
  if (legal.length === 1) return legal[0]
  const meIndex = state.currentPlayer
  const me = state.players[meIndex]

  if (state.phase === 'chooseNoble') return legal[0]

  const rated = rateCards(state, me, rng)
  const target = rated[0] as Rated | undefined
  const second = rated[1] as Rated | undefined

  if (state.phase === 'discard') {
    const bonuses = getBonuses(me)
    let best = legal[0]
    let bestKeep = -Infinity
    for (const a of legal) {
      if (a.type !== 'discard') continue
      let keep = 0
      for (const c of COLORS) {
        const left = me.tokens[c] - (a.tokens[c] ?? 0)
        const need1 = target ? Math.max(0, target.card.cost[c] - bonuses[c]) : 0
        const need2 = second ? Math.max(0, second.card.cost[c] - bonuses[c]) : 0
        keep += 3 * Math.min(left, need1) + Math.min(left, need2) + 0.1 * left
      }
      keep += 5 * (me.tokens.gold - (a.tokens.gold ?? 0))
      if (keep > bestKeep) {
        bestKeep = keep
        best = a
      }
    }
    return best
  }

  const legalBuy = new Set<string>()
  const legalReserve = new Set<string>()
  for (const a of legal) {
    if (a.type === 'buy') legalBuy.add(a.cardId)
    else if (a.type === 'reserveBoard') legalReserve.add(a.cardId)
  }
  const score = getScore(me)
  const affordable = rated.filter((r) => legalBuy.has(r.card.id))

  // 1. Win now if possible.
  const winning = affordable
    .filter((r) => score + r.card.points >= 15)
    .sort((a, b) => b.card.points - a.card.points)
  if (winning.length > 0) return { type: 'buy', cardId: winning[0].card.id }

  // 2. Buy the target, or another card that is worth having.
  if (target && legalBuy.has(target.card.id)) return { type: 'buy', cardId: target.card.id }
  if (affordable.length > 0) {
    const best = affordable.slice().sort((a, b) => b.value - a.value)[0]
    const helpsTarget = target !== undefined && target.miss[best.card.bonus] > 0
    if (best.card.points >= 1 || helpsTarget || me.cards.length < 7 || best.value >= 2) {
      return { type: 'buy', cardId: best.card.id }
    }
  }

  // 3. Deny an opponent who could win with a card on the board.
  if (legalReserve.size > 0) {
    let deny: Card | null = null
    for (let i = 0; i < state.players.length; i++) {
      if (i === meIndex) continue
      const opp = state.players[i]
      const oppScore = getScore(opp)
      for (const r of rated) {
        if (r.mine || !legalReserve.has(r.card.id) || isUnknown(r.card)) continue
        if (oppScore + r.card.points >= 15 && canAfford(opp, r.card)) {
          if (deny === null || r.card.points > deny.points) deny = r.card
        }
      }
    }
    if (deny) return { type: 'reserveBoard', cardId: deny.id }
  }

  // 4. Secure a key card that is nearly within reach.
  if (
    target &&
    !target.mine &&
    legalReserve.has(target.card.id) &&
    target.card.points >= 3 &&
    target.turns <= 2 &&
    me.reserved.length < 2
  ) {
    const contested = state.players.some((p, i) => i !== meIndex && canAfford(p, target.card))
    if (contested || rng() < 0.3) return { type: 'reserveBoard', cardId: target.card.id }
  }

  // 5. Tokens toward the target (and the runner-up).
  let bestTake: Action | null = null
  let bestGain = -1
  for (const a of legal) {
    if (a.type !== 'takeDifferent' && a.type !== 'takeSame') continue
    const gain = takeGain(a, target ? target.miss : colorMapOf(0), second ? second.miss : null)
    if (gain > bestGain) {
      bestGain = gain
      bestTake = a
    }
  }
  const full = tokenCount(me) >= 10
  if (bestTake && !(full && bestGain < 3)) return bestTake

  // 6. Nothing useful to take: buy anything, reserve for the honey, or take.
  if (affordable.length > 0) return { type: 'buy', cardId: affordable[0].card.id }
  if (target && !target.mine && legalReserve.has(target.card.id)) {
    return { type: 'reserveBoard', cardId: target.card.id }
  }
  if (bestTake) return bestTake
  const anyReserve = legal.find((a) => a.type === 'reserveBoard' || a.type === 'reserveDeck')
  return anyReserve ?? legal[0]
}
