// The seam between the game screen and whoever owns the game.
//
// The whole game screen talks only to a GameController. `createLocalController`
// below is the implementation for solo (vs AI) and pass-and-play games; an
// online controller wraps a src/net session behind the same interface.
import type {
  Action,
  ChooseAction,
  EngineApi,
  GameState,
  NewGameConfig,
} from '../shared/contract'
import { CARDS, NOBLES } from '../data'
import { engine as realEngine } from '../engine'
import { aiReaction, aiSeats } from './logic/aiReactions'
import { isEmoteId, type EmoteEvent } from './logic/emotes'

export type { EmoteEvent } from './logic/emotes'

export interface ControllerSnapshot {
  /**
   * Current game. In online play this may be redacted: other players'
   * blind-reserved cards and all deck contents can be placeholder cards whose
   * id starts with "hidden" (only deck lengths are meaningful).
   */
  state: GameState
  /** Seats controlled from this device (one online / vs AI, all humans in pass-and-play). */
  mySeats: number[]
  /** Seat of an AI (or remote player) that is currently deciding, for the "thinking" hint. */
  thinkingSeat: number | null
  /** Last problem, already in Korean and ready to show. */
  error: string | null
}

export interface GameController {
  /** useSyncExternalStore-compatible. */
  subscribe(listener: () => void): () => void
  /** Stable reference between changes. */
  getSnapshot(): ControllerSnapshot
  /** Plays `action` for state.currentPlayer. Failures surface as snapshot.error. */
  sendAction(action: Action): void
  /** Optional: dismisses snapshot.error. */
  clearError?(): void
  /** Optional: starts a new game with the same seats. The rematch button is hidden without it. */
  rematch?(): void
  /** Optional: stops timers / closes connections when the game screen goes away. */
  dispose?(): void
  /**
   * Optional: flashes an emote (see src/ui/logic/emotes.ts) over `seat`'s
   * panel on every player's screen. `seat` must be one of mySeats and
   * defaults to the seat whose turn it is (or the first of mine). Unknown ids
   * are ignored. Without it the emote button is hidden.
   */
  sendEmote?(id: string, seat?: number): void
  /** Optional: emotes to show, from every seat including my own and AI seats. */
  subscribeEmotes?(listener: (event: EmoteEvent) => void): () => void
}

// --- Saved games -------------------------------------------------------------

export const SAVE_KEY = 'moonlit-garden:save:v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface SavedGame {
  version: 1
  savedAt: number
  state: GameState
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function looksLikeState(value: unknown): value is GameState {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Partial<GameState>
  return (
    Array.isArray(s.players) &&
    s.players.length >= 2 &&
    s.players.length <= 4 &&
    typeof s.currentPlayer === 'number' &&
    typeof s.phase === 'string' &&
    typeof s.bank === 'object' &&
    typeof s.board === 'object' &&
    typeof s.decks === 'object' &&
    Array.isArray(s.nobles)
  )
}

/** The unfinished local game on this device, if any. */
export function loadSavedGame(storage: StorageLike | null = defaultStorage()): SavedGame | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedGame>
    if (parsed.version !== 1 || !looksLikeState(parsed.state)) return null
    if (parsed.state.phase === 'gameOver') return null
    return { version: 1, savedAt: Number(parsed.savedAt) || 0, state: parsed.state }
  } catch {
    return null
  }
}

export function clearSavedGame(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY)
  } catch {
    // private mode etc.: nothing to clear
  }
}

function writeSave(storage: StorageLike | null, state: GameState): void {
  if (!storage) return
  try {
    if (state.phase === 'gameOver') storage.removeItem(SAVE_KEY)
    else {
      const save: SavedGame = { version: 1, savedAt: Date.now(), state }
      storage.setItem(SAVE_KEY, JSON.stringify(save))
    }
  } catch {
    // quota / private mode: the game simply is not resumable
  }
}

// --- Local controller --------------------------------------------------------

export interface LocalControllerConfig {
  /** New game: 2 to 4 seats in turn order. Ignored when `resume` is given. */
  players?: NewGameConfig['players']
  /** Seed for a new game; random when omitted. */
  seed?: number
  /** Continue this saved game instead of starting a new one. */
  resume?: SavedGame
  /** The AI brain (src/ai). Called for seats whose kind is 'ai'. */
  chooseAction: ChooseAction
  /** Pause before each AI move so a human can follow. 0 = move synchronously. Default 1100. */
  aiDelayMs?: number
  /**
   * Pause between a move and an AI's emote about it. Default 600, or 0
   * (synchronous) when aiDelayMs is 0.
   */
  aiReactionDelayMs?: number
  /** Where to save. Default localStorage; null disables saving. */
  storage?: StorageLike | null
  /** Rules engine; only replaced in tests. */
  engine?: EngineApi
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

export function createLocalController(config: LocalControllerConfig): GameController {
  const eng = config.engine ?? realEngine
  const storage = config.storage === undefined ? defaultStorage() : config.storage
  const aiDelayMs = config.aiDelayMs ?? 1100
  const reactionDelayMs = config.aiReactionDelayMs ?? (aiDelayMs <= 0 ? 0 : 600)
  const listeners = new Set<() => void>()
  const emoteListeners = new Set<(event: EmoteEvent) => void>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const reactionTimers = new Set<ReturnType<typeof setTimeout>>()
  /** Turn of each AI seat's last reaction, to keep them rare. */
  const lastReactionTurn = new Map<number, number>()
  let disposed = false

  function newGame(players: NewGameConfig['players'], seed: number): GameState {
    return eng.createGame({ players, seed, cards: CARDS, nobles: NOBLES })
  }

  let state: GameState
  if (config.resume) state = config.resume.state
  else if (config.players) state = newGame(config.players, config.seed ?? randomSeed())
  else throw new Error('createLocalController needs `players` or `resume`')

  const humanSeats = (s: GameState): number[] =>
    s.players.map((p, i) => (p.kind === 'human' ? i : -1)).filter((i) => i >= 0)
  const aiToMove = (s: GameState): number | null =>
    s.phase !== 'gameOver' && s.players[s.currentPlayer].kind === 'ai' ? s.currentPlayer : null

  let snapshot: ControllerSnapshot = {
    state,
    mySeats: humanSeats(state),
    thinkingSeat: aiToMove(state),
    error: null,
  }

  function publish(next: Partial<ControllerSnapshot>): void {
    snapshot = { ...snapshot, ...next }
    for (const listener of [...listeners]) listener()
  }

  function commit(next: GameState): void {
    const prev = state
    state = next
    writeSave(storage, state)
    publish({ state, mySeats: humanSeats(state), thinkingSeat: aiToMove(state), error: null })
    reactToMove(prev, next)
  }

  function emitEmote(event: EmoteEvent): void {
    for (const listener of [...emoteListeners]) listener(event)
  }

  function later(fn: () => void, delay: number): void {
    if (delay <= 0) {
      fn()
      return
    }
    const t = setTimeout(() => {
      reactionTimers.delete(t)
      if (!disposed) fn()
    }, delay)
    reactionTimers.add(t)
  }

  function clearReactions(): void {
    for (const t of reactionTimers) clearTimeout(t)
    reactionTimers.clear()
  }

  /**
   * Lets the computer seats comment on `prev` -> `next`. Only one AI speaks
   * about any one move (the first that has something to say), except at the
   * end of the game, where every AI reacts to its own result.
   */
  function reactToMove(prev: GameState, next: GameState): void {
    if (prev === next) return
    const ended = next.phase === 'gameOver' && prev.phase !== 'gameOver'
    for (const seat of aiSeats(next)) {
      const id = aiReaction(prev, next, seat, lastReactionTurn.get(seat) ?? null)
      if (!id) continue
      lastReactionTurn.set(seat, next.turn)
      later(() => emitEmote({ seat, id, at: Date.now() }), reactionDelayMs)
      if (!ended) return
    }
  }

  function aiMove(): void {
    const seat = aiToMove(state)
    if (seat === null) return
    const legal = eng.getLegalActions(state)
    if (legal.length === 0) return
    let action: Action
    try {
      action = config.chooseAction(state, state.players[seat].difficulty ?? 'normal')
      if (!eng.isLegal(state, action)) action = legal[0]
    } catch {
      action = legal[0] // a broken AI must never stall the game
    }
    commit(eng.applyAction(state, action))
  }

  function driveAi(): void {
    if (disposed) return
    if (aiDelayMs <= 0) {
      // Synchronous mode (tests): play every pending AI move right away.
      let guard = 0
      while (aiToMove(state) !== null && guard++ < 10000) aiMove()
      return
    }
    if (timer !== null || aiToMove(state) === null) return
    // Follow-up decisions (discard, guest choice) come a little quicker.
    const delay = state.phase === 'action' ? aiDelayMs : Math.round(aiDelayMs * 0.6)
    timer = setTimeout(() => {
      timer = null
      if (disposed) return
      aiMove()
      driveAi()
    }, delay)
  }

  writeSave(storage, state)
  driveAi()

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    sendAction(action) {
      if (disposed) return
      if (state.phase === 'gameOver') {
        publish({ error: '게임이 이미 끝났어요' })
        return
      }
      if (state.players[state.currentPlayer].kind !== 'human') {
        publish({ error: '아직 내 차례가 아니에요' })
        return
      }
      let next: GameState
      try {
        next = eng.applyAction(state, action)
      } catch {
        publish({ error: '지금은 할 수 없는 행동이에요' })
        return
      }
      commit(next)
      driveAi()
    },
    clearError() {
      if (snapshot.error !== null) publish({ error: null })
    },
    sendEmote(id, seat) {
      if (disposed || !isEmoteId(id)) return
      const humans = humanSeats(state)
      const from = seat ?? (humans.includes(state.currentPlayer) ? state.currentPlayer : humans[0])
      if (from === undefined || !humans.includes(from)) return
      emitEmote({ seat: from, id, at: Date.now() })
    },
    subscribeEmotes(listener) {
      emoteListeners.add(listener)
      return () => {
        emoteListeners.delete(listener)
      }
    },
    rematch() {
      if (disposed) return
      if (timer !== null) clearTimeout(timer)
      timer = null
      clearReactions()
      lastReactionTurn.clear()
      // Same people, next seat starts: taking turns at going first is only fair.
      const seats = state.players.map((p) => ({
        name: p.name,
        kind: p.kind,
        ...(p.difficulty ? { difficulty: p.difficulty } : {}),
      }))
      const rotated = [...seats.slice(1), seats[0]]
      commit(newGame(rotated, randomSeed()))
      driveAi()
    },
    dispose() {
      disposed = true
      if (timer !== null) clearTimeout(timer)
      timer = null
      clearReactions()
      listeners.clear()
      emoteListeners.clear()
    },
  }
}
