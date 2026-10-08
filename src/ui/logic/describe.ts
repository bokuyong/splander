// Pure helpers that turn game data into Korean sentences and UI facts:
// what an action was, why a card cannot be bought, what changed between two
// states, and how the final ranking came out.
import { COLORS, TIERS, TOKEN_COLORS } from '../../shared/contract'
import type {
  Action,
  Card,
  Color,
  ColorMap,
  GameState,
  Noble,
  PlayerState,
  Tier,
  TokenColor,
  TokenMap,
} from '../../shared/contract'
import { THEME } from '../../data'
import { getBonuses, getScore, MAX_RESERVED } from '../../engine'
import { isHiddenCard } from './guests'

// --- Korean particles --------------------------------------------------------

export function hasBatchim(word: string): boolean {
  const code = word.charCodeAt(word.length - 1)
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

/** josa('장미', '을', '를') -> '장미를' */
export function josa(word: string, withBatchim: string, without: string): string {
  return word + (hasBatchim(word) ? withBatchim : without)
}

// --- Cards -------------------------------------------------------------------

export function cardLabel(card: Card): string {
  if (isHiddenCard(card)) return `${THEME.tiers[card.tier].name} 카드`
  return `${THEME.tiers[card.tier].name} ${THEME.tokens[card.bonus].name} 카드`
}

export function findCard(state: GameState, cardId: string): Card | null {
  for (const tier of TIERS) {
    for (const card of state.board[tier]) if (card && card.id === cardId) return card
  }
  for (const player of state.players) {
    for (const card of player.cards) if (card.id === cardId) return card
    for (const r of player.reserved) if (r.card.id === cardId) return r.card
  }
  return null
}

/** What the player still owes per color once gem discounts are counted. */
export function netCost(player: PlayerState, card: Card): ColorMap {
  const bonuses = getBonuses(player)
  const need: ColorMap = { white: 0, blue: 0, green: 0, red: 0, black: 0 }
  for (const color of COLORS) need[color] = Math.max(0, card.cost[color] - bonuses[color])
  return need
}

/** Tokens that leave the player when buying with the minimum gold. */
export function paymentPreview(player: PlayerState, card: Card): TokenMap {
  const need = netCost(player, card)
  const spent: TokenMap = { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }
  for (const color of COLORS) {
    spent[color] = Math.min(need[color], player.tokens[color])
    spent.gold += need[color] - spent[color]
  }
  return spent
}

export interface Shortfall {
  /** Gems missing per color before gold is counted. */
  missing: ColorMap
  /** How many gems are still missing after spending all gold (0 = affordable). */
  short: number
}

export function buyShortfall(player: PlayerState, card: Card): Shortfall {
  const need = netCost(player, card)
  const missing: ColorMap = { white: 0, blue: 0, green: 0, red: 0, black: 0 }
  let total = 0
  for (const color of COLORS) {
    missing[color] = Math.max(0, need[color] - player.tokens[color])
    total += missing[color]
  }
  return { missing, short: Math.max(0, total - player.tokens.gold) }
}

/** e.g. "루비 2 · 사파이어 1 모자라요 (황금 1개를 써도 2개 부족)" */
export function shortfallText(player: PlayerState, card: Card): string | null {
  const { missing, short } = buyShortfall(player, card)
  if (short === 0) return null
  const parts = COLORS.filter((c) => missing[c] > 0).map(
    (c) => `${THEME.tokens[c].name} ${missing[c]}`,
  )
  const gold = player.tokens.gold
  const tail = gold > 0 ? ` (${THEME.tokens.gold.name} ${gold}개를 써도 ${short}개 부족)` : ''
  return `${parts.join(' · ')} 모자라요${tail}`
}

export function reserveBlockReason(player: PlayerState): string | null {
  return player.reserved.length >= MAX_RESERVED ? `예약은 ${MAX_RESERVED}장까지만 할 수 있어요` : null
}

// --- Action log --------------------------------------------------------------

function tokenList(tokens: Partial<Record<TokenColor, number>>): string {
  return TOKEN_COLORS.filter((c) => (tokens[c] ?? 0) > 0)
    .map((c) => `${THEME.tokens[c].name} ${tokens[c]}`)
    .join(' · ')
}

/**
 * One short sentence for the log. `after` is the state right after the action
 * was applied (cards are looked up there).
 */
export function describeAction(after: GameState, seat: number, action: Action): string {
  const name = after.players[seat]?.name ?? '?'
  const who = josa(name, '이', '가')
  switch (action.type) {
    case 'takeDifferent':
      return `${who} ${action.colors.map((c) => THEME.tokens[c].name).join(' · ')} 보석을 가져왔어요`
    case 'takeSame':
      return `${who} ${THEME.tokens[action.color].name} 보석 2개를 가져왔어요`
    case 'reserveBoard': {
      const card = findCard(after, action.cardId)
      return `${who} ${card ? josa(cardLabel(card), '을', '를') : '카드를'} 예약했어요`
    }
    case 'reserveDeck':
      return `${who} ${THEME.tiers[action.tier].name} 더미에서 몰래 한 장 예약했어요`
    case 'buy': {
      const card = findCard(after, action.cardId)
      if (!card) return `${who} 카드를 샀어요`
      const points = card.points > 0 ? ` (+${card.points}점)` : ''
      return `${who} ${josa(cardLabel(card), '을', '를')} 샀어요${points}`
    }
    case 'pass':
      return `${who} 한 번 쉬어갔어요`
    case 'discard':
      return `${who} ${tokenList(action.tokens)} 보석을 내려놓았어요`
    case 'chooseNoble': {
      const noble = after.players[seat]?.nobles.find((n) => n.id === action.nobleId)
      return `${who} ${noble ? josa(noble.name, '을', '를') : '귀족을'} 맞이했어요`
    }
  }
}

// --- State diff --------------------------------------------------------------

export interface TurnEvents {
  /** Unique per applied action; safe to dedupe on. */
  key: string
  actor: number
  action: Action
  text: string
  /** Positive = bank to player, negative = player to bank. */
  tokenMoves: { color: TokenColor; delta: number }[]
  /** Board slots whose card changed (bought or reserved, then refilled). */
  changedSlots: { tier: Tier; slot: number }[]
  /** A noble that visited the actor as a result of this action. */
  guest: Noble | null
  scoreBefore: number
  scoreAfter: number
}

export function actionKey(state: GameState): string | null {
  if (!state.lastAction) return null
  const { player, action } = state.lastAction
  const tokens = state.players.map((p) => TOKEN_COLORS.map((c) => p.tokens[c]).join('')).join('/')
  return `${state.turn}|${state.phase}|${player}|${tokens}|${JSON.stringify(action)}`
}

/** What happened between two consecutive snapshots, or null if no action did. */
export function diffEvents(prev: GameState, next: GameState): TurnEvents | null {
  const key = actionKey(next)
  if (!next.lastAction || key === null || key === actionKey(prev)) return null
  const { player: actor, action } = next.lastAction
  const before = prev.players[actor]
  const after = next.players[actor]
  if (!before || !after) return null

  const tokenMoves: TurnEvents['tokenMoves'] = []
  for (const color of TOKEN_COLORS) {
    const delta = after.tokens[color] - before.tokens[color]
    if (delta !== 0) tokenMoves.push({ color, delta })
  }
  const changedSlots: TurnEvents['changedSlots'] = []
  for (const tier of TIERS) {
    for (let slot = 0; slot < next.board[tier].length; slot++) {
      if ((prev.board[tier][slot]?.id ?? null) !== (next.board[tier][slot]?.id ?? null)) {
        changedSlots.push({ tier, slot })
      }
    }
  }
  const had = new Set(before.nobles.map((n) => n.id))
  const guest = after.nobles.find((n) => !had.has(n.id)) ?? null

  return {
    key,
    actor,
    action,
    text: describeAction(next, actor, action),
    tokenMoves,
    changedSlots,
    guest,
    scoreBefore: getScore(before),
    scoreAfter: getScore(after),
  }
}

// --- Final ranking -----------------------------------------------------------

export interface RankRow {
  seat: number
  name: string
  score: number
  cards: number
  guests: number
  rank: number // 1-based; equal rows share a rank
  winner: boolean
}

export function rankPlayers(state: GameState): RankRow[] {
  const rows = state.players.map((player, seat) => ({
    seat,
    name: player.name,
    score: getScore(player),
    cards: player.cards.length,
    guests: player.nobles.length,
    rank: 0,
    winner: state.winners?.includes(seat) ?? false,
  }))
  rows.sort((a, b) => b.score - a.score || a.cards - b.cards || a.seat - b.seat)
  rows.forEach((row, i) => {
    const prev = rows[i - 1]
    row.rank = prev && prev.score === row.score && prev.cards === row.cards ? prev.rank : i + 1
  })
  return rows
}

/** Explains the tie-break when the top score was shared, otherwise null. */
export function tieBreakNote(state: GameState): string | null {
  if (!state.winners || state.winners.length === 0) return null
  const scores = state.players.map(getScore)
  const best = Math.max(...scores)
  const top = scores.filter((s) => s === best).length
  if (top < 2) return null
  if (state.winners.length > 1) {
    return `${THEME.labels.pointsShort} 점수도, 산 카드 수도 같아서 공동 ${THEME.labels.winner}이에요`
  }
  const winner = state.players[state.winners[0]]
  return `${THEME.labels.pointsShort} 점수가 같을 땐 카드를 더 적게 산 쪽이 이겨요. ${josa(
    winner.name,
    '이',
    '가',
  )} ${winner.cards.length}장으로 ${THEME.labels.winner}!`
}

export function colorsWithCost(cost: ColorMap): Color[] {
  return COLORS.filter((c) => cost[c] > 0)
}
