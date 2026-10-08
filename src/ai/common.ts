// Helpers shared by the three difficulty levels.
//
// Fairness: every AI works on `fairView(state)`, a copy in which everything the
// current player is not allowed to know (deck contents, other players' blind
// reserves, the rng state) is replaced by canonical placeholders. Whatever the
// caller passes in (the full host state or an already redacted view), the AI
// therefore sees exactly the same thing and makes exactly the same choice.

import { COLORS, TIERS, TOKEN_COLORS } from '../shared/contract'
import type {
  Action,
  Card,
  Color,
  ColorMap,
  GameState,
  PlayerState,
  Tier,
  TokenMap,
} from '../shared/contract'
import { getLegalActions } from '../engine'

export const UNKNOWN_ID = 'hidden'

// Never affordable, so look-ahead can never "buy" an unknown card.
const UNKNOWN_COST: ColorMap = { white: 99, blue: 99, green: 99, red: 99, black: 99 }

function unknownCard(tier: Tier): Card {
  return { id: UNKNOWN_ID, tier, bonus: 'white', points: 0, cost: UNKNOWN_COST }
}

const UNKNOWN: Record<Tier, Card> = { 1: unknownCard(1), 2: unknownCard(2), 3: unknownCard(3) }

// True for our own placeholders and for the ones made by the net layer
// ("hidden-d2-7", ...).
export function isUnknown(card: Card): boolean {
  return card.id.startsWith(UNKNOWN_ID)
}

export function fairView(state: GameState): GameState {
  const me = state.currentPlayer
  const decks = {} as Record<Tier, Card[]>
  for (const tier of TIERS) {
    const n = state.decks[tier].length
    const deck = new Array<Card>(n)
    for (let i = 0; i < n; i++) deck[i] = UNKNOWN[tier]
    decks[tier] = deck
  }
  const players: PlayerState[] = state.players.map((player, index) => {
    let touched = false
    const reserved = player.reserved.map((r) => {
      if ((index !== me && r.fromDeck) || isUnknown(r.card)) {
        touched = true
        return { card: UNKNOWN[r.card.tier], fromDeck: r.fromDeck }
      }
      return r
    })
    return touched ? { ...player, reserved } : player
  })
  return { ...state, decks, players, rngState: 0 }
}

// Legal actions that do not refer to an unknown card (those only appear on the
// board during look-ahead, when a slot is refilled from a placeholder deck).
export function knownActions(state: GameState): Action[] {
  const all = getLegalActions(state)
  let clean = true
  for (const a of all) {
    if ((a.type === 'buy' || a.type === 'reserveBoard') && a.cardId.startsWith(UNKNOWN_ID)) {
      clean = false
      break
    }
  }
  if (clean) return all
  const out = all.filter(
    (a) => !((a.type === 'buy' || a.type === 'reserveBoard') && a.cardId.startsWith(UNKNOWN_ID)),
  )
  return out.length > 0 ? out : all
}

// ---------------------------------------------------------------------------
// Deterministic randomness, derived from public information only (the rng
// state itself is hidden from online clients, so it cannot be used).
// ---------------------------------------------------------------------------

export type Rng = () => number

export function publicHash(state: GameState, salt: number): number {
  let h = (0x811c9dc5 ^ salt) >>> 0
  const mix = (n: number): void => {
    h = Math.imul(h ^ (n & 0xffff), 0x01000193) >>> 0
  }
  mix(state.turn)
  mix(state.currentPlayer)
  mix(state.phase.length)
  for (const c of TOKEN_COLORS) mix(state.bank[c])
  for (const p of state.players) {
    for (const c of TOKEN_COLORS) mix(p.tokens[c])
    mix(p.cards.length)
    mix(p.reserved.length)
    mix(p.nobles.length)
  }
  for (const tier of TIERS) {
    for (const card of state.board[tier]) {
      if (card === null) mix(7)
      else for (let i = 0; i < card.id.length; i++) mix(card.id.charCodeAt(i))
    }
  }
  for (const n of state.nobles) for (let i = 0; i < n.id.length; i++) mix(n.id.charCodeAt(i))
  return h >>> 0
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)]
}

// ---------------------------------------------------------------------------
// Card analysis
// ---------------------------------------------------------------------------

// Cards the player may buy: the face-up board plus the own (known) reserve.
export function visibleCards(state: GameState, player: PlayerState): { card: Card; mine: boolean }[] {
  const out: { card: Card; mine: boolean }[] = []
  for (const tier of TIERS) {
    for (const card of state.board[tier]) {
      if (card !== null && !isUnknown(card)) out.push({ card, mine: false })
    }
  }
  for (const r of player.reserved) if (!isUnknown(r.card)) out.push({ card: r.card, mine: true })
  return out
}

// Tokens still missing per color after bonuses and held colored tokens.
export function missingTokens(card: Card, bonuses: ColorMap, tokens: TokenMap): ColorMap {
  const miss: ColorMap = { white: 0, blue: 0, green: 0, red: 0, black: 0 }
  for (const c of COLORS) miss[c] = Math.max(0, card.cost[c] - bonuses[c] - tokens[c])
  return miss
}

// Rough number of token-taking turns before the card can be bought (0 = now).
export function gatherTurns(card: Card, bonuses: ColorMap, tokens: TokenMap, bank: TokenMap): number {
  let scarce = 0
  let pay = 0
  let gold = tokens.gold
  // Gold covers the color with the largest gap first. Costs are tiny, so a
  // simple repeated scan is fine.
  let m0 = 0
  let m1 = 0
  let m2 = 0
  let m3 = 0
  let m4 = 0
  for (let i = 0; i < 5; i++) {
    const c: Color = COLORS[i]
    const net = card.cost[c] - bonuses[c]
    if (net <= 0) continue
    pay += net
    const m = net - tokens[c]
    if (m <= 0) continue
    if (m > bank[c]) scarce += m - bank[c]
    if (i === 0) m0 = m
    else if (i === 1) m1 = m
    else if (i === 2) m2 = m
    else if (i === 3) m3 = m
    else m4 = m
  }
  while (gold > 0) {
    const mx = Math.max(m0, m1, m2, m3, m4)
    if (mx === 0) break
    if (m0 === mx) m0--
    else if (m1 === mx) m1--
    else if (m2 === mx) m2--
    else if (m3 === mx) m3--
    else m4--
    gold--
    if (scarce > 0) scarce--
  }
  const total = m0 + m1 + m2 + m3 + m4
  const largest = Math.max(m0, m1, m2, m3, m4)
  if (total === 0) return 0
  let turns = Math.max(Math.ceil(total / 3), Math.ceil(largest / 2), largest - 1)
  turns += scarce * 2
  if (pay > 10) turns += (pay - 10) * 2
  return turns
}

export function colorMapOf(value = 0): ColorMap {
  return { white: value, blue: value, green: value, red: value, black: value }
}
