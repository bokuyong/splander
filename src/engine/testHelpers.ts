// Fixtures shared by the engine tests. Not real game data: the real cards live
// in src/data and are owned by another module.

import { COLORS, TIERS, TOKEN_COLORS } from '../shared/contract'
import type {
  Card,
  Color,
  ColorMap,
  GameState,
  Noble,
  PlayerState,
  Tier,
  TokenMap,
} from '../shared/contract'
import { createGame } from './index'

export function colorMap(partial: Partial<ColorMap> = {}): ColorMap {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0, ...partial }
}

export function tokenMap(partial: Partial<TokenMap> = {}): TokenMap {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0, ...partial }
}

export function card(
  id: string,
  tier: Tier,
  bonus: Color,
  points: number,
  cost: Partial<ColorMap> = {},
): Card {
  return { id, tier, bonus, points, cost: colorMap(cost) }
}

export function noble(id: string, requirement: Partial<ColorMap>): Noble {
  return { id, name: `guest ${id}`, points: 3, requirement: colorMap(requirement) }
}

// Free, pointless cards that only grant bonuses, e.g. bonusCards('x', { red: 2 }).
export function bonusCards(prefix: string, counts: Partial<ColorMap>, points = 0): Card[] {
  const out: Card[] = []
  for (const color of COLORS) {
    for (let i = 0; i < (counts[color] ?? 0); i++) {
      out.push(card(`${prefix}-${color}-${i}`, 1, color, points))
    }
  }
  return out
}

function fixtureRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Generated full-size set: 40 / 30 / 20 cards, bonuses spread evenly.
export function fullCards(): Card[] {
  const rand = fixtureRng(20261005)
  const spec: Record<Tier, { perColor: number; total: [number, number]; max: number; points: [number, number] }> = {
    1: { perColor: 8, total: [3, 5], max: 4, points: [0, 0] },
    2: { perColor: 6, total: [5, 8], max: 6, points: [1, 3] },
    3: { perColor: 4, total: [10, 14], max: 7, points: [3, 5] },
  }
  const between = ([lo, hi]: [number, number]) => lo + Math.floor(rand() * (hi - lo + 1))
  const cards: Card[] = []
  for (const tier of TIERS) {
    const s = spec[tier]
    let n = 0
    for (const bonus of COLORS) {
      for (let i = 0; i < s.perColor; i++) {
        const cost = colorMap()
        let total = between(s.total)
        while (total > 0) {
          const color = COLORS[Math.floor(rand() * COLORS.length)]
          if (cost[color] < s.max) {
            cost[color] += 1
            total -= 1
          }
        }
        // one tier-1 card per color is worth a point, like the real set
        const points = tier === 1 ? (i === 0 ? 1 : 0) : between(s.points)
        n += 1
        cards.push({ id: `t${tier}-${String(n).padStart(2, '0')}`, tier, bonus, points, cost })
      }
    }
  }
  return cards
}

// 10 nobles: five 4+4 and five 3+3+3.
export function fullNobles(): Noble[] {
  const nobles: Noble[] = []
  for (let i = 0; i < 5; i++) {
    nobles.push(noble(`n-${String(i + 1).padStart(2, '0')}`, { [COLORS[i]]: 4, [COLORS[(i + 1) % 5]]: 4 }))
  }
  for (let i = 0; i < 5; i++) {
    nobles.push(
      noble(`n-${String(i + 6).padStart(2, '0')}`, {
        [COLORS[i]]: 3,
        [COLORS[(i + 2) % 5]]: 3,
        [COLORS[(i + 3) % 5]]: 3,
      }),
    )
  }
  return nobles
}

export function playerConfigs(count: number) {
  return Array.from({ length: count }, (_, i) => ({ name: `P${i}`, kind: 'human' as const }))
}

export function newGame(players = 2, seed = 1): GameState {
  return createGame({ players: playerConfigs(players), seed, cards: fullCards(), nobles: fullNobles() })
}

export function patchPlayer(state: GameState, index: number, patch: Partial<PlayerState>): GameState {
  return {
    ...state,
    players: state.players.map((p, i) => (i === index ? { ...p, ...patch } : p)),
  }
}

// Overwrites a board slot (the card that was there simply leaves the fixture).
export function putOnBoard(state: GameState, tier: Tier, slot: number, c: Card | null): GameState {
  const row = state.board[tier].slice()
  row[slot] = c
  return { ...state, board: { ...state.board, [tier]: row } }
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

export function totalTokens(state: GameState): TokenMap {
  const total = tokenMap(state.bank)
  for (const p of state.players) for (const c of TOKEN_COLORS) total[c] += p.tokens[c]
  return total
}

export function allCardIds(state: GameState): string[] {
  const ids: string[] = []
  for (const tier of TIERS) {
    for (const c of state.decks[tier]) ids.push(c.id)
    for (const c of state.board[tier]) if (c) ids.push(c.id)
  }
  for (const p of state.players) {
    for (const c of p.cards) ids.push(c.id)
    for (const r of p.reserved) ids.push(r.card.id)
  }
  return ids
}
