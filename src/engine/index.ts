// Pure rules engine. Implements `EngineApi` from the shared contract.
//
// Every function here is pure: the input state is never mutated, a new state
// (sharing untouched sub-objects) is returned instead. State is plain JSON data.
//
// Turn structure implemented by applyAction:
//   main action ('action' phase)
//     -> more than 10 tokens?  phase 'discard' until exactly 10 remain
//     -> noble check: exactly one satisfied noble is awarded automatically,
//        several put the game in phase 'chooseNoble' (one noble per turn at most)
//     -> end-of-game check, then the next player starts (or 'gameOver').

import { COLORS, TIERS, TOKEN_COLORS } from '../shared/contract'
import type {
  Action,
  Card,
  Color,
  ColorMap,
  EngineApi,
  GameState,
  NewGameConfig,
  Noble,
  PlayerState,
  Tier,
  TokenColor,
  TokenMap,
} from '../shared/contract'

export const MAX_TOKENS = 10
export const MAX_RESERVED = 3
export const WINNING_SCORE = 15
export const BOARD_SLOTS = 4
export const GOLD_IN_BANK = 5
export const TAKE_SAME_MIN_BANK = 4

export class IllegalActionError extends Error {
  readonly action: Action

  constructor(message: string, action: Action) {
    super(message)
    this.name = 'IllegalActionError'
    this.action = action
  }
}

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32). The whole generator state is one uint32, kept in
// GameState.rngState, so a seed fully reproduces a game.
// ---------------------------------------------------------------------------

function rngNext(rngState: number): { value: number; rngState: number } {
  const next = (rngState + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, rngState: next }
}

// Fisher-Yates on a copy.
function shuffle<T>(items: readonly T[], rngState: number): { items: T[]; rngState: number } {
  const out = items.slice()
  let s = rngState
  for (let i = out.length - 1; i > 0; i--) {
    const r = rngNext(s)
    s = r.rngState
    const j = Math.floor(r.value * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return { items: out, rngState: s }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function emptyTokens(): TokenMap {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isColor(value: unknown): value is Color {
  return typeof value === 'string' && (COLORS as readonly string[]).includes(value)
}

function isTier(value: unknown): value is Tier {
  return value === 1 || value === 2 || value === 3
}

export function getBonuses(player: PlayerState): ColorMap {
  const bonuses: ColorMap = { white: 0, blue: 0, green: 0, red: 0, black: 0 }
  for (const card of player.cards) bonuses[card.bonus] += 1
  return bonuses
}

export function getScore(player: PlayerState): number {
  let score = 0
  for (const card of player.cards) score += card.points
  for (const noble of player.nobles) score += noble.points
  return score
}

export function tokenCount(player: PlayerState): number {
  let total = 0
  for (const color of TOKEN_COLORS) total += player.tokens[color]
  return total
}

// What the player still owes per color after card bonuses (never negative).
function netCost(player: PlayerState, card: Card): ColorMap {
  const bonuses = getBonuses(player)
  const need: ColorMap = { white: 0, blue: 0, green: 0, red: 0, black: 0 }
  for (const color of COLORS) need[color] = Math.max(0, card.cost[color] - bonuses[color])
  return need
}

export function canAfford(player: PlayerState, card: Card): boolean {
  const need = netCost(player, card)
  let shortfall = 0
  for (const color of COLORS) shortfall += Math.max(0, need[color] - player.tokens[color])
  return shortfall <= player.tokens.gold
}

// ---------------------------------------------------------------------------
// Payment
//
// need[c] = max(0, cost[c] - bonuses[c]) is what must be covered for color c,
// by colored tokens of that color and/or gold (one gold = one token).
//
// Semantics of the optional `gold` / `goldFor` fields of a 'buy' action:
//
// * neither given: the minimum gold is spent, i.e. gold only covers what the
//   player's colored tokens cannot.
// * `goldFor` given: it is the exact, complete allocation. goldFor[c] gold
//   tokens replace color c (missing colors mean 0); the remaining
//   need[c] - goldFor[c] is paid with tokens of color c. It is rejected when
//   an entry is not a non-negative integer, names an unknown color, exceeds
//   need[c] (gold can never be thrown away on nothing), leaves more of color c
//   to pay than the player holds, or when the total exceeds the player's gold.
//   If `gold` is given too it must equal the sum of goldFor.
// * only `gold` given: it is the exact total number of gold tokens to spend.
//   It must be an integer between the minimum needed and
//   min(gold held, sum of need). The engine distributes it deterministically:
//   first the unavoidable shortfall of each color, then the extra gold
//   replaces colored tokens in contract COLORS order (white, blue, green,
//   red, black), as many as possible per color before moving to the next.
//
// Returns the tokens leaving the player (and going back to the bank), or a
// string describing why the payment is not valid.
// ---------------------------------------------------------------------------

function resolvePayment(
  player: PlayerState,
  card: Card,
  gold: unknown,
  goldFor: unknown,
): TokenMap | string {
  const need = netCost(player, card)
  const goldUsed: ColorMap = { white: 0, blue: 0, green: 0, red: 0, black: 0 }

  if (goldFor !== undefined) {
    if (typeof goldFor !== 'object' || goldFor === null || Array.isArray(goldFor)) {
      return 'goldFor must be an object'
    }
    let total = 0
    for (const [key, value] of Object.entries(goldFor)) {
      if (!isColor(key)) return `goldFor has an unknown color "${key}"`
      if (!isCount(value)) return `goldFor.${key} must be a non-negative integer`
      if (value > need[key]) return `goldFor.${key} exceeds what is owed in that color`
      goldUsed[key] = value
      total += value
    }
    if (gold !== undefined && gold !== total) return 'gold does not match the sum of goldFor'
    if (total > player.tokens.gold) return 'not enough gold tokens'
    for (const color of COLORS) {
      if (need[color] - goldUsed[color] > player.tokens[color]) {
        return `not enough ${color} tokens for this goldFor allocation`
      }
    }
  } else {
    let minGold = 0
    let totalNeed = 0
    for (const color of COLORS) {
      goldUsed[color] = Math.max(0, need[color] - player.tokens[color])
      minGold += goldUsed[color]
      totalNeed += need[color]
    }
    if (minGold > player.tokens.gold) return 'cannot afford this card'
    if (gold !== undefined) {
      if (!isCount(gold)) return 'gold must be a non-negative integer'
      if (gold < minGold) return 'gold is less than the minimum needed'
      if (gold > player.tokens.gold) return 'not enough gold tokens'
      if (gold > totalNeed) return 'gold exceeds the price left to pay'
      let extra = gold - minGold
      for (const color of COLORS) {
        const more = Math.min(extra, need[color] - goldUsed[color])
        goldUsed[color] += more
        extra -= more
      }
    }
  }

  const spent = emptyTokens()
  for (const color of COLORS) {
    spent[color] = need[color] - goldUsed[color]
    spent.gold += goldUsed[color]
  }
  return spent
}

// ---------------------------------------------------------------------------
// Locating cards
// ---------------------------------------------------------------------------

type CardLocation =
  | { where: 'board'; tier: Tier; slot: number; card: Card }
  | { where: 'reserved'; index: number; card: Card }

function findOnBoard(state: GameState, cardId: unknown): CardLocation | null {
  if (typeof cardId !== 'string') return null
  for (const tier of TIERS) {
    const row = state.board[tier]
    for (let slot = 0; slot < row.length; slot++) {
      const card = row[slot]
      if (card !== null && card.id === cardId) return { where: 'board', tier, slot, card }
    }
  }
  return null
}

// Board cards, plus the current player's own reserve.
function findBuyable(state: GameState, cardId: unknown): CardLocation | null {
  const onBoard = findOnBoard(state, cardId)
  if (onBoard) return onBoard
  const reserved = state.players[state.currentPlayer].reserved
  for (let index = 0; index < reserved.length; index++) {
    if (reserved[index].card.id === cardId) {
      return { where: 'reserved', index, card: reserved[index].card }
    }
  }
  return null
}

function eligibleNobles(state: GameState): Noble[] {
  const bonuses = getBonuses(state.players[state.currentPlayer])
  return state.nobles.filter((noble) =>
    COLORS.every((color) => bonuses[color] >= noble.requirement[color]),
  )
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createGame(config: NewGameConfig): GameState {
  const playerCount = config.players.length
  if (playerCount < 2 || playerCount > 4) {
    throw new Error(`a game needs 2 to 4 players, got ${playerCount}`)
  }
  if (config.nobles.length < playerCount + 1) {
    throw new Error(`a game with ${playerCount} players needs ${playerCount + 1} nobles`)
  }

  const perColor = playerCount === 2 ? 4 : playerCount === 3 ? 5 : 7
  const bank: TokenMap = {
    white: perColor,
    blue: perColor,
    green: perColor,
    red: perColor,
    black: perColor,
    gold: GOLD_IN_BANK,
  }

  let rngState = config.seed >>> 0
  const decks = {} as Record<Tier, Card[]>
  const board = {} as Record<Tier, (Card | null)[]>
  for (const tier of TIERS) {
    const shuffled = shuffle(
      config.cards.filter((card) => card.tier === tier),
      rngState,
    )
    rngState = shuffled.rngState
    const row: (Card | null)[] = []
    for (let slot = 0; slot < BOARD_SLOTS; slot++) row.push(shuffled.items[slot] ?? null)
    board[tier] = row
    decks[tier] = shuffled.items.slice(BOARD_SLOTS)
  }

  const shuffledNobles = shuffle(config.nobles, rngState)
  rngState = shuffledNobles.rngState

  const players: PlayerState[] = config.players.map((p) => {
    const player: PlayerState = {
      name: p.name,
      kind: p.kind,
      tokens: emptyTokens(),
      cards: [],
      reserved: [],
      nobles: [],
    }
    if (p.difficulty !== undefined) player.difficulty = p.difficulty
    return player
  })

  const startPlayer = config.startPlayer ?? 0
  if (!Number.isInteger(startPlayer) || startPlayer < 0 || startPlayer >= playerCount) {
    throw new Error(`startPlayer must be a seat index, got ${startPlayer}`)
  }

  return {
    players,
    currentPlayer: startPlayer,
    startPlayer,
    phase: 'action',
    bank,
    decks,
    board,
    nobles: shuffledNobles.items.slice(0, playerCount + 1),
    eligibleNobles: [],
    finalRound: false,
    winners: null,
    turn: 0,
    rngState,
    lastAction: null,
  }
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]]
  const out: T[][] = []
  for (let i = 0; i + size <= items.length; i++) {
    for (const rest of combinations(items.slice(i + 1), size - 1)) out.push([items[i], ...rest])
  }
  return out
}

// How many colors a 'takeDifferent' must name: 3, or every color left in the
// bank when fewer than 3 are left.
function takeDifferentSize(state: GameState): number {
  return Math.min(3, COLORS.filter((color) => state.bank[color] > 0).length)
}

// The four main actions, without 'pass'.
function mainActions(state: GameState): Action[] {
  const player = state.players[state.currentPlayer]
  const actions: Action[] = []

  const available = COLORS.filter((color) => state.bank[color] > 0)
  const size = Math.min(3, available.length)
  if (size > 0) {
    for (const colors of combinations(available, size)) {
      actions.push({ type: 'takeDifferent', colors })
    }
  }
  for (const color of COLORS) {
    if (state.bank[color] >= TAKE_SAME_MIN_BANK) actions.push({ type: 'takeSame', color })
  }

  if (player.reserved.length < MAX_RESERVED) {
    for (const tier of TIERS) {
      for (const card of state.board[tier]) {
        if (card !== null) actions.push({ type: 'reserveBoard', cardId: card.id })
      }
    }
    for (const tier of TIERS) {
      if (state.decks[tier].length > 0) actions.push({ type: 'reserveDeck', tier })
    }
  }

  for (const tier of TIERS) {
    for (const card of state.board[tier]) {
      if (card !== null && canAfford(player, card)) actions.push({ type: 'buy', cardId: card.id })
    }
  }
  for (const reserved of player.reserved) {
    if (canAfford(player, reserved.card)) actions.push({ type: 'buy', cardId: reserved.card.id })
  }

  return actions
}

// Every distinct multiset of `count` tokens the player could return.
function discardChoices(player: PlayerState, count: number): Partial<TokenMap>[] {
  const out: Partial<TokenMap>[] = []
  const walk = (index: number, left: number, picked: Partial<TokenMap>): void => {
    if (left === 0) {
      out.push({ ...picked })
      return
    }
    if (index >= TOKEN_COLORS.length) return
    const color = TOKEN_COLORS[index]
    for (let n = Math.min(left, player.tokens[color]); n >= 0; n--) {
      if (n > 0) picked[color] = n
      else delete picked[color]
      walk(index + 1, left - n, picked)
    }
    delete picked[color]
  }
  walk(0, count, {})
  return out
}

export function getLegalActions(state: GameState): Action[] {
  const player = state.players[state.currentPlayer]
  switch (state.phase) {
    case 'action': {
      const actions = mainActions(state)
      return actions.length > 0 ? actions : [{ type: 'pass' }]
    }
    case 'discard':
      return discardChoices(player, tokenCount(player) - MAX_TOKENS).map((tokens) => ({
        type: 'discard',
        tokens,
      }))
    case 'chooseNoble':
      return state.eligibleNobles.map((nobleId) => ({ type: 'chooseNoble', nobleId }))
    default:
      return []
  }
}

// Returns null when the action is legal, otherwise the reason it is not.
function illegalReason(state: GameState, action: Action): string | null {
  if (typeof action !== 'object' || action === null) return 'malformed action'
  if (state.phase === 'gameOver') return 'the game is over'
  const player = state.players[state.currentPlayer]

  if (action.type === 'discard') {
    if (state.phase !== 'discard') return 'there is nothing to discard now'
    const tokens: unknown = action.tokens
    if (typeof tokens !== 'object' || tokens === null || Array.isArray(tokens)) {
      return 'tokens must be an object'
    }
    let total = 0
    for (const [key, value] of Object.entries(tokens)) {
      if (!(TOKEN_COLORS as readonly string[]).includes(key)) return `unknown token color "${key}"`
      if (!isCount(value)) return `tokens.${key} must be a non-negative integer`
      if (value > player.tokens[key as TokenColor]) return `not enough ${key} tokens to discard`
      total += value
    }
    const excess = tokenCount(player) - MAX_TOKENS
    if (total !== excess) return `exactly ${excess} token(s) must be discarded`
    return null
  }

  if (action.type === 'chooseNoble') {
    if (state.phase !== 'chooseNoble') return 'there is no noble to choose now'
    if (!state.eligibleNobles.includes(action.nobleId)) return 'this noble cannot be chosen'
    return null
  }

  if (state.phase === 'discard') return 'tokens must be discarded first'
  if (state.phase === 'chooseNoble') return 'a noble must be chosen first'

  switch (action.type) {
    case 'takeDifferent': {
      const colors: unknown = action.colors
      if (!Array.isArray(colors)) return 'colors must be an array'
      if (!colors.every(isColor)) return 'only the five colors can be taken (never gold)'
      if (new Set(colors).size !== colors.length) return 'the colors must all be different'
      if (colors.some((color) => state.bank[color as Color] <= 0)) {
        return 'the bank has none of a requested color'
      }
      const size = takeDifferentSize(state)
      if (size === 0) return 'the bank has no colored tokens'
      if (colors.length !== size) return `exactly ${size} different color(s) must be taken`
      return null
    }
    case 'takeSame': {
      if (!isColor(action.color)) return 'only the five colors can be taken (never gold)'
      if (state.bank[action.color] < TAKE_SAME_MIN_BANK) {
        return `the bank needs at least ${TAKE_SAME_MIN_BANK} tokens of that color`
      }
      return null
    }
    case 'reserveBoard': {
      if (player.reserved.length >= MAX_RESERVED) return 'the reserve is full'
      if (!findOnBoard(state, action.cardId)) return 'this card is not on the board'
      return null
    }
    case 'reserveDeck': {
      if (!isTier(action.tier)) return 'unknown tier'
      if (player.reserved.length >= MAX_RESERVED) return 'the reserve is full'
      if (state.decks[action.tier].length === 0) return 'this deck is empty'
      return null
    }
    case 'buy': {
      const location = findBuyable(state, action.cardId)
      if (!location) return 'this card is neither on the board nor in your reserve'
      const payment = resolvePayment(player, location.card, action.gold, action.goldFor)
      return typeof payment === 'string' ? payment : null
    }
    case 'pass':
      return mainActions(state).length > 0 ? 'another action is possible' : null
    default:
      return 'unknown action type'
  }
}

export function isLegal(state: GameState, action: Action): boolean {
  return illegalReason(state, action) === null
}

// ---------------------------------------------------------------------------
// Applying actions
// ---------------------------------------------------------------------------

function withCurrentPlayer(state: GameState, player: PlayerState): GameState {
  const players = state.players.slice()
  players[state.currentPlayer] = player
  return { ...state, players }
}

// Moves tokens from the bank to the player (negative amounts go back).
function moveTokens(
  state: GameState,
  player: PlayerState,
  toPlayer: Partial<TokenMap>,
): { bank: TokenMap; player: PlayerState } {
  const bank = { ...state.bank }
  const tokens = { ...player.tokens }
  for (const color of TOKEN_COLORS) {
    const amount = toPlayer[color] ?? 0
    bank[color] -= amount
    tokens[color] += amount
  }
  return { bank, player: { ...player, tokens } }
}

// Removes the card in a board slot and refills it from the top of its deck.
function refillSlot(state: GameState, tier: Tier, slot: number): GameState {
  const deck = state.decks[tier]
  const row = state.board[tier].slice()
  row[slot] = deck.length > 0 ? deck[0] : null
  return {
    ...state,
    board: { ...state.board, [tier]: row },
    decks: { ...state.decks, [tier]: deck.slice(1) },
  }
}

function computeWinners(players: readonly PlayerState[]): number[] {
  const best = Math.max(...players.map(getScore))
  const top = players.map((_, index) => index).filter((i) => getScore(players[i]) === best)
  const fewest = Math.min(...top.map((i) => players[i].cards.length))
  return top.filter((i) => players[i].cards.length === fewest)
}

// Step 3 of the end of a turn: end-of-game check, then next player.
function endTurn(state: GameState): GameState {
  const finalRound =
    state.finalRound || getScore(state.players[state.currentPlayer]) >= WINNING_SCORE
  const nextPlayer = (state.currentPlayer + 1) % state.players.length
  const lastSeat = nextPlayer === (state.startPlayer ?? 0)
  if (finalRound && lastSeat) {
    return {
      ...state,
      phase: 'gameOver',
      eligibleNobles: [],
      finalRound: true,
      winners: computeWinners(state.players),
    }
  }
  return {
    ...state,
    phase: 'action',
    eligibleNobles: [],
    finalRound,
    currentPlayer: nextPlayer,
    turn: state.turn + 1,
  }
}

function awardNoble(state: GameState, nobleId: string): GameState {
  const noble = state.nobles.find((n) => n.id === nobleId)
  if (!noble) return state
  const player = state.players[state.currentPlayer]
  return {
    ...withCurrentPlayer(state, { ...player, nobles: [...player.nobles, noble] }),
    nobles: state.nobles.filter((n) => n.id !== nobleId),
  }
}

// Step 2 of the end of a turn: at most one noble.
function nobleStep(state: GameState): GameState {
  const eligible = eligibleNobles(state)
  if (eligible.length > 1) {
    return { ...state, phase: 'chooseNoble', eligibleNobles: eligible.map((n) => n.id) }
  }
  return endTurn(eligible.length === 1 ? awardNoble(state, eligible[0].id) : state)
}

// Step 1 of the end of a turn: the 10-token limit.
function afterMainAction(state: GameState): GameState {
  if (tokenCount(state.players[state.currentPlayer]) > MAX_TOKENS) {
    return { ...state, phase: 'discard' }
  }
  return nobleStep(state)
}

export function applyAction(state: GameState, action: Action): GameState {
  const reason = illegalReason(state, action)
  if (reason !== null) throw new IllegalActionError(reason, action)

  const player = state.players[state.currentPlayer]
  const base: GameState = { ...state, lastAction: { player: state.currentPlayer, action } }

  switch (action.type) {
    case 'takeDifferent': {
      const gain: Partial<TokenMap> = {}
      for (const color of action.colors) gain[color] = 1
      const moved = moveTokens(base, player, gain)
      return afterMainAction({ ...withCurrentPlayer(base, moved.player), bank: moved.bank })
    }
    case 'takeSame': {
      const moved = moveTokens(base, player, { [action.color]: 2 })
      return afterMainAction({ ...withCurrentPlayer(base, moved.player), bank: moved.bank })
    }
    case 'reserveBoard':
    case 'reserveDeck': {
      let next: GameState
      let card: Card
      if (action.type === 'reserveBoard') {
        const location = findOnBoard(base, action.cardId) as CardLocation & { where: 'board' }
        card = location.card
        next = refillSlot(base, location.tier, location.slot)
      } else {
        const deck = base.decks[action.tier]
        card = deck[0]
        next = { ...base, decks: { ...base.decks, [action.tier]: deck.slice(1) } }
      }
      // One gold comes with the reservation, if the bank still has any.
      const moved = moveTokens(next, player, { gold: next.bank.gold > 0 ? 1 : 0 })
      const reserved = [...player.reserved, { card, fromDeck: action.type === 'reserveDeck' }]
      return afterMainAction({
        ...withCurrentPlayer(next, { ...moved.player, reserved }),
        bank: moved.bank,
      })
    }
    case 'buy': {
      const location = findBuyable(base, action.cardId) as CardLocation
      const spent = resolvePayment(player, location.card, action.gold, action.goldFor) as TokenMap
      const refund: Partial<TokenMap> = {}
      for (const color of TOKEN_COLORS) refund[color] = -spent[color]
      const moved = moveTokens(base, player, refund)
      const buyer: PlayerState = {
        ...moved.player,
        cards: [...player.cards, location.card],
        reserved:
          location.where === 'reserved'
            ? player.reserved.filter((_, index) => index !== location.index)
            : player.reserved,
      }
      const next =
        location.where === 'board' ? refillSlot(base, location.tier, location.slot) : base
      return afterMainAction({ ...withCurrentPlayer(next, buyer), bank: moved.bank })
    }
    case 'pass':
      return afterMainAction(base)
    case 'discard': {
      const giveBack: Partial<TokenMap> = {}
      for (const color of TOKEN_COLORS) giveBack[color] = -(action.tokens[color] ?? 0)
      const moved = moveTokens(base, player, giveBack)
      return nobleStep({ ...withCurrentPlayer(base, moved.player), bank: moved.bank })
    }
    case 'chooseNoble':
      return endTurn(awardNoble(base, action.nobleId))
  }
}

export const engine: EngineApi = {
  createGame,
  getLegalActions,
  isLegal,
  applyAction,
  getBonuses,
  getScore,
  tokenCount,
  canAfford,
}
