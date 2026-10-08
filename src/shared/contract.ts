// Shared contract between engine, data, AI, net and UI modules.
// Every module imports its types from here. Do not change this file without
// telling the orchestrator: other modules are written against it in parallel.

export type Color = 'white' | 'blue' | 'green' | 'red' | 'black'
export type TokenColor = Color | 'gold'
export type Tier = 1 | 2 | 3

export const COLORS: readonly Color[] = ['white', 'blue', 'green', 'red', 'black']
export const TOKEN_COLORS: readonly TokenColor[] = [...COLORS, 'gold']
export const TIERS: readonly Tier[] = [1, 2, 3]

export type ColorMap = Record<Color, number>
export type TokenMap = Record<TokenColor, number>

export interface Card {
  id: string // e.g. "t1-07", stable across sessions
  tier: Tier
  bonus: Color
  points: number
  cost: ColorMap
}

export interface Noble {
  id: string // e.g. "n-03"
  name: string
  points: number // always 3
  requirement: ColorMap // number of card bonuses (not tokens) needed per color
}

export interface ReservedCard {
  card: Card
  // true when taken blind from a deck: hidden from opponents until bought
  fromDeck: boolean
}

export type PlayerKind = 'human' | 'ai'
export type Difficulty = 'easy' | 'normal' | 'hard'

export interface PlayerState {
  name: string
  kind: PlayerKind
  difficulty?: Difficulty // only for kind === 'ai'
  tokens: TokenMap
  cards: Card[] // purchased
  reserved: ReservedCard[] // max 3
  nobles: Noble[]
}

// 'action'      : current player must take one of the four main actions (or pass)
// 'discard'     : current player holds more than 10 tokens and must return the excess
// 'chooseNoble' : current player qualifies for 2+ nobles and must pick one
// 'gameOver'    : winners is set
export type Phase = 'action' | 'discard' | 'chooseNoble' | 'gameOver'

export interface GameState {
  players: PlayerState[]
  currentPlayer: number
  // Seat that took the first turn (0 when absent). The final round ends with
  // the seat before it, so everyone gets the same number of turns.
  startPlayer?: number
  phase: Phase
  bank: TokenMap
  decks: Record<Tier, Card[]> // index 0 is the top of the deck
  board: Record<Tier, (Card | null)[]> // always 4 slots; null once the deck ran out
  nobles: Noble[] // still unclaimed
  eligibleNobles: string[] // noble ids, only meaningful in 'chooseNoble'
  finalRound: boolean // someone reached 15: play continues until the round ends
  winners: number[] | null // player indices; several only on a full tie
  turn: number // increments every time currentPlayer advances
  rngState: number // deterministic PRNG state, so a seed reproduces a game
  lastAction: { player: number; action: Action } | null
}

export type Action =
  // 3 different colors; fewer only when fewer than 3 colors are left in the bank
  | { type: 'takeDifferent'; colors: Color[] }
  // 2 of one color; only when the bank holds 4+ of that color
  | { type: 'takeSame'; color: Color }
  | { type: 'reserveBoard'; cardId: string }
  | { type: 'reserveDeck'; tier: Tier }
  // card on the board or in own reserve. `gold` = how many gold tokens to spend;
  // omitted means the minimum needed. Spending more than needed is allowed
  // (it replaces colored tokens the player would otherwise pay).
  | { type: 'buy'; cardId: string; gold?: number; goldFor?: Partial<ColorMap> }
  // only legal when no other action is possible
  | { type: 'pass' }
  // 'discard' phase: must bring the player down to exactly 10 tokens
  | { type: 'discard'; tokens: Partial<TokenMap> }
  // 'chooseNoble' phase
  | { type: 'chooseNoble'; nobleId: string }

export interface NewGameConfig {
  players: { name: string; kind: PlayerKind; difficulty?: Difficulty }[] // 2 to 4
  seed: number
  startPlayer?: number // seat that moves first; default 0
  cards: Card[] // full 90-card set
  nobles: Noble[] // full 10-noble set
}

// Implemented by src/engine/index.ts. All functions are pure; state is never mutated.
export interface EngineApi {
  createGame(config: NewGameConfig): GameState
  // Every legal action for the current player in the current phase.
  // For 'buy', one entry per card with the minimum gold payment is enough.
  // For 'discard', enumerate all distinct ways to get down to 10.
  getLegalActions(state: GameState): Action[]
  isLegal(state: GameState, action: Action): boolean
  // Throws IllegalActionError (exported by the engine) when the action is not legal.
  applyAction(state: GameState, action: Action): GameState
  getBonuses(player: PlayerState): ColorMap
  getScore(player: PlayerState): number
  tokenCount(player: PlayerState): number
  // Whether the player can pay for the card, counting bonuses and gold.
  canAfford(player: PlayerState, card: Card): boolean
}

// Implemented by src/ai/index.ts. Chooses for state.currentPlayer in any phase.
export type ChooseAction = (state: GameState, difficulty: Difficulty) => Action
