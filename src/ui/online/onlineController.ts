// GameController adapters over a src/net session, so the game screen plays an
// online game exactly like a local one.
//
//   const room = createHostRoom({ name })              // or { resume: true }
//   const room = createGuestRoom({ roomCode, name })
//
//   room.session        the net session (lobby, connection status)
//   room.hasGame()      false in the lobby: do not render the game screen
//   room (itself)       a GameController once hasGame() is true
//   room.startGame()    host: build a fresh game from the lobby and start it
//   room.rematch()      host only (undefined on a guest): same, after a game
//   room.returnToLobby()  host
//   room.leave({ forget })  close the session (forget = really leave)
import type { Action, ChooseAction, Difficulty, EngineApi, GameState } from '../../shared/contract'
import { chooseAction as realChooseAction } from '../../ai'
import { CARDS, NOBLES } from '../../data'
import { engine as realEngine } from '../../engine'
import {
  createGuestSession,
  createHostSession,
  lobbyToPlayers,
  type GuestSession,
  type GuestSessionOptions,
  type HostSession,
  type HostSessionOptions,
  type SessionSnapshot,
} from '../../net'
import { randomSeed, type ControllerSnapshot, type GameController } from '../controller'
import { isEmoteId } from '../logic/emotes'
import { isConnectionError, netErrorText } from './text'

export interface OnlineRoom extends GameController {
  /** Unique per room object on this page (a React key). */
  readonly id: number
  readonly role: 'host' | 'guest'
  readonly session: HostSession | GuestSession
  /** Dismisses a move error. Connection problems (shown by the banner / lobby) stay. */
  clearError(): void
  /** True once a game state has arrived; getSnapshot() throws before that. */
  hasGame(): boolean
  /** Host: creates a new game for the current seats. False (with an error) when not possible. */
  startGame(): boolean
  /** Host: drop the game, everyone goes back to the waiting room. */
  returnToLobby(): void
  /** Closes the session. Default keeps the room resumable; `forget` leaves for good. */
  leave(opts?: { forget?: boolean }): void
}

export interface OnlineDeps {
  engine?: EngineApi
  chooseAction?: ChooseAction
  /** Seed source for new games. */
  seed?: () => number
}

/**
 * The AI as the host session calls it. The host hands it a redacted view; a
 * wrong or throwing choice must never stall a game two people are playing, so
 * anything illegal falls back to the first legal action.
 */
export function safeAiChooser(engine: EngineApi, choose: ChooseAction) {
  return (view: GameState, difficulty: Difficulty): Action => {
    try {
      const action = choose(view, difficulty)
      if (engine.isLegal(view, action)) return action
    } catch {
      // fall through
    }
    return engine.getLegalActions(view)[0]
  }
}

let nextRoomId = 1

function sameSeats(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function createRoom(
  role: 'host' | 'guest',
  session: HostSession | GuestSession,
  engine: EngineApi,
  seed: () => number,
): OnlineRoom {
  const listeners = new Set<() => void>()
  let disposed = false
  /** A problem found on this device before anything was sent. */
  let localError: string | null = null
  let snapshot: ControllerSnapshot | null = null

  function derive(): void {
    const s: SessionSnapshot = session.getSnapshot()
    // The game screen needs a state for as long as it is mounted: keep the
    // last one while the session is back in the lobby.
    const state = s.state ?? snapshot?.state ?? null
    if (!state) return
    const mySeats = snapshot && sameSeats(snapshot.mySeats, s.localSeats) ? snapshot.mySeats : [...s.localSeats]
    const current = state.currentPlayer
    const seat = s.lobby?.seats[current]
    const waitingOnOther =
      s.state !== null && state.phase !== 'gameOver' && !mySeats.includes(current) && (seat ? seat.online : true)
    const thinkingSeat = waitingOnOther ? current : null
    const error =
      localError ?? (s.lastError && !isConnectionError(s.lastError) ? netErrorText(s.lastError) : null)
    if (
      snapshot &&
      snapshot.state === state &&
      snapshot.mySeats === mySeats &&
      snapshot.thinkingSeat === thinkingSeat &&
      snapshot.error === error
    ) {
      return
    }
    snapshot = { state, mySeats, thinkingSeat, error }
    for (const listener of [...listeners]) listener()
  }

  const unsubscribe = session.subscribe(derive)
  derive()

  function fail(text: string): void {
    localError = text
    derive()
  }

  const room: OnlineRoom = {
    id: nextRoomId++,
    role,
    session,
    hasGame: () => session.getSnapshot().state !== null,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    getSnapshot() {
      if (!snapshot) throw new Error('online room: no game yet (check hasGame() first)')
      return snapshot
    },

    sendAction(action) {
      if (disposed) return
      const s = session.getSnapshot()
      localError = null
      if (!s.state) return fail('아직 게임이 시작되지 않았어요')
      if (s.state.phase === 'gameOver') return fail('게임이 이미 끝났어요')
      if (!s.localSeats.includes(s.state.currentPlayer)) return fail('아직 내 차례가 아니에요')
      if (s.status !== 'connected' && role === 'guest') return fail('연결이 끊겨 있어요. 잠시만 기다려 주세요')
      // The redacted view is enough to judge my own moves, and it saves a
      // round trip (and a confusing late error) for a guest.
      if (!engine.isLegal(s.state, action)) return fail('지금은 할 수 없는 행동이에요')
      session.sendAction(action)
      derive()
    },

    clearError() {
      localError = null
      // Connection problems belong to the banner / lobby and stay.
      const last = session.getSnapshot().lastError
      if (last && !isConnectionError(last)) session.clearError()
      derive()
    },

    sendEmote(id, seat) {
      if (disposed || !isEmoteId(id)) return
      session.sendEmote(id, seat) // fire and forget; dropped extras are fine
    },

    subscribeEmotes(listener) {
      // The host already validates, but a guest trusts nobody: unknown ids
      // (a newer host with more emotes) are skipped.
      return session.onEmote((event) => {
        if (isEmoteId(event.id)) listener(event)
      })
    },

    startGame() {
      if (disposed || role !== 'host') return false
      const host = session as HostSession
      const lobby = host.getSnapshot().lobby
      if (!lobby) return false
      localError = null
      // The first move rotates from game to game, as it does in local rematches.
      const players = lobbyToPlayers(lobby)
      const previous = host.getSnapshot().state ?? snapshot?.state ?? null
      const startPlayer = previous ? ((previous.startPlayer ?? 0) + 1) % players.length : 0
      const state = engine.createGame({
        players,
        seed: seed(),
        startPlayer,
        cards: CARDS,
        nobles: NOBLES,
      })
      return host.startGame(state)
    },

    returnToLobby() {
      if (disposed || role !== 'host') return
      ;(session as HostSession).returnToLobby()
    },

    leave(opts) {
      room.dispose?.()
      session.close(opts)
    },

    dispose() {
      if (disposed) return
      disposed = true
      unsubscribe()
      listeners.clear()
    },
  }
  // Only the host can start another game; without `rematch` the button is hidden.
  if (role === 'host') room.rematch = () => void room.startGame()
  return room
}

export interface HostRoomOptions
  extends OnlineDeps,
    Partial<
      Pick<HostSessionOptions, 'transport' | 'storage' | 'aiDelayMs' | 'heartbeatMs' | 'retryDelaysMs' | 'lifecycle' | 'now'>
    > {
  name?: string
  /** Re-open the room saved on this device instead of creating a new one. */
  resume?: boolean
}

/** Creates (or resumes) a room on this device and starts hosting it. */
export function createHostRoom(opts: HostRoomOptions = {}): OnlineRoom {
  const { name, engine = realEngine, chooseAction = realChooseAction, seed = randomSeed, ...net } = opts
  const session = createHostSession({
    ...net,
    hostName: name,
    applyAction: engine.applyAction,
    chooseAiAction: safeAiChooser(engine, chooseAction),
    validEmote: isEmoteId,
  })
  return createRoom('host', session, engine, seed)
}

export interface GuestRoomOptions
  extends Pick<OnlineDeps, 'engine'>,
    Partial<Pick<GuestSessionOptions, 'transport' | 'storage' | 'heartbeatMs' | 'retryDelaysMs' | 'lifecycle'>> {
  roomCode: string
  name: string
}

/** Joins (or rejoins) a room by code. */
export function createGuestRoom(opts: GuestRoomOptions): OnlineRoom {
  const { engine = realEngine, ...net } = opts
  return createRoom('guest', createGuestSession(net), engine, randomSeed)
}
