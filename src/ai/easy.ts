// Easy: buys whatever it can (preferring points), otherwise collects tokens
// toward one of the cheapest cards on the table, with a lot of randomness and
// no planning, no reserving for a purpose and no attention to opponents.

import { COLORS } from '../shared/contract'
import type { Action, GameState } from '../shared/contract'
import { getBonuses, tokenCount } from '../engine'
import { knownActions, missingTokens, pick, visibleCards } from './common'
import type { Rng } from './common'

export function chooseEasy(state: GameState, rng: Rng): Action {
  const legal = knownActions(state)
  if (legal.length === 1) return legal[0]
  const me = state.players[state.currentPlayer]

  if (state.phase === 'chooseNoble') return pick(legal, rng)

  if (state.phase === 'discard') {
    const keepGold = legal.filter((a) => a.type === 'discard' && !a.tokens.gold)
    return pick(keepGold.length > 0 ? keepGold : legal, rng)
  }

  const cards = visibleCards(state, me)
  const byId = new Map(cards.map((v) => [v.card.id, v.card]))
  const buys = legal.filter((a) => a.type === 'buy')
  if (buys.length > 0 && rng() < 0.7) {
    let best: Action[] = []
    let bestPoints = -1
    for (const a of buys) {
      if (a.type !== 'buy') continue
      const points = byId.get(a.cardId)?.points ?? 0
      if (points > bestPoints) {
        bestPoints = points
        best = [a]
      } else if (points === bestPoints) best.push(a)
    }
    return pick(best, rng)
  }

  const takes = legal.filter((a) => a.type === 'takeDifferent' || a.type === 'takeSame')
  const reserves = legal.filter((a) => a.type === 'reserveBoard')

  // Stuck with a full hand and nothing to buy: grab a card (and a honey token).
  if (reserves.length > 0 && tokenCount(me) >= 9 && rng() < 0.5) return pick(reserves, rng)
  if (takes.length === 0) {
    if (buys.length > 0) return pick(buys, rng)
    return pick(reserves.length > 0 ? reserves : legal, rng)
  }
  if (rng() < 0.5) return pick(takes, rng)

  // Aim at one of the four cards that need the fewest extra tokens.
  const bonuses = getBonuses(me)
  const ranked = cards
    .map((v) => {
      const miss = missingTokens(v.card, bonuses, me.tokens)
      let total = 0
      for (const c of COLORS) total += miss[c]
      return { miss, total }
    })
    .sort((a, b) => a.total - b.total)
  if (ranked.length === 0) return pick(takes, rng)
  const target = ranked[Math.floor(rng() * Math.min(4, ranked.length))]

  let best: Action[] = []
  let bestGain = -1
  for (const a of takes) {
    let gain = 0
    if (a.type === 'takeDifferent') {
      for (const c of a.colors) if (target.miss[c] > 0) gain += 1
    } else if (a.type === 'takeSame') {
      gain = Math.min(2, target.miss[a.color])
    }
    if (gain > bestGain) {
      bestGain = gain
      best = [a]
    } else if (gain === bestGain) best.push(a)
  }
  return pick(best, rng)
}
