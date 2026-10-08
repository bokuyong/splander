// Public types of the session facade (see index.ts for the walkthrough).

import type { Action, Difficulty, GameState } from '../shared/contract.ts'
import type { Lobby, NetError } from './protocol.ts'

/**
 * connecting   : first attempt to create / join the room is in flight
 * connected    : host: room is registered and reachable; guest: seated, in sync
 * reconnecting : the link dropped and is being re-established automatically
 * disconnected : gave up or closed; `lastError` says why. retry() tries again.
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

/** Immutable. A new object is created whenever any field changes. */
export interface SessionSnapshot {
  readonly role: 'host' | 'guest'
  readonly status: ConnectionStatus
  /** Host: null until the room is registered. Guest: the code being joined. */
  readonly roomCode: string | null
  /** Seats with names, kinds and online flags. Guest: null until welcomed. */
  readonly lobby: Lobby | null
  /**
   * The game as this device may see it (see redactStateFor), null in the lobby.
   * Decks and opponents' blind reserves contain placeholder cards.
   */
  readonly state: GameState | null
  /** Bumps on every applied action. Handy as a cheap change key. */
  readonly rev: number
  /**
   * The seat (= player index) this device plays. Guest: its seat. Host: the
   * first 'local' seat, or null when the host only runs AI/remote seats.
   */
  readonly mySeat: number | null
  /** All seats controlled from this device (host hot-seat can have several). */
  readonly localSeats: readonly number[]
  /** True when sendAction would be accepted right now (my turn, game running, link up). */
  readonly canAct: boolean
  /** The most recent problem; cleared by clearError() or the next sendAction. */
  readonly lastError: NetError | null
}

export interface Session {
  /** useSyncExternalStore-compatible. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** Stable reference between changes. */
  getSnapshot(): SessionSnapshot
  /**
   * Plays `action` for the current player. Returns false (and sets lastError)
   * when it could not even be attempted. On a guest, true only means "sent":
   * the outcome arrives as a new `state` or as `lastError`.
   */
  sendAction(action: Action): boolean
  clearError(): void
  /** Restart connecting after status became 'disconnected' (or skip a backoff wait). */
  retry(): void
  /**
   * Tears the session down. By default the room stays resumable (host: saved
   * room; guest: saved token), which is what a React effect cleanup wants.
   * `forget: true` ends it for good: the host tells guests the room is closed
   * and deletes the saved room; a guest gives its seat up and deletes its token.
   */
  close(opts?: { forget?: boolean }): void
}

export type SeatConfig =
  | { kind: 'local'; name: string }
  /** An open seat for a guest; it takes the guest's name once joined. */
  | { kind: 'remote' }
  | { kind: 'ai'; name: string; difficulty?: Difficulty }

export interface HostSession extends Session {
  /**
   * Lobby only. Replaces seat `index` (0-based; `index === seats.length`
   * appends, up to 4 seats). `null` removes the seat (minimum 2 remain).
   * A guest sitting in a replaced/removed seat is kicked.
   */
  setSeat(index: number, seat: SeatConfig | null): boolean
  /**
   * Starts (or restarts, for a rematch) the game with a state built by the
   * engine. `initialState.players.length` must equal the number of seats and
   * every remote seat must have been joined.
   */
  startGame(initialState: GameState): boolean
  /** Drops the game and goes back to the lobby (seats are kept). */
  returnToLobby(): void
}

export type GuestSession = Session
