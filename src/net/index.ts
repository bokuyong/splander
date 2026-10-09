// Online multiplayer for 스플랜더. No server: the host's browser is the
// authority, guests connect to it over WebRTC (PeerJS, public broker).
//
// =============================================================================
// HOW TO USE THIS FROM THE UI
// =============================================================================
//
// Two factories, one per role. Both return a framework-free "session" object:
//
//   const session = createHostSession({ applyAction, hostName, chooseAiAction })
//   const session = createGuestSession({ roomCode, name })
//
//   session.subscribe(listener)   -> unsubscribe     (listener takes no args)
//   session.getSnapshot()         -> SessionSnapshot (immutable, stable ref)
//   session.sendAction(action)    -> boolean
//   session.sendEmote(id, seat?)  -> boolean   (see "Emotes" below)
//   session.onEmote(listener)     -> unsubscribe
//   session.clearError()
//   session.retry()
//   session.close({ forget? })
//   // host only:
//   session.setSeat(index, seatConfig | null) -> boolean
//   session.setTurnLimit(seconds | null)      -> boolean   (lobby only)
//   session.startGame(initialState)           -> boolean
//   session.returnToLobby()
//
// React:
//
//   const snap = useSyncExternalStore(session.subscribe, session.getSnapshot)
//
// Create the session ONCE (module scope, a zustand store, or a ref) and not
// in a component body. Creating it starts connecting immediately.
//
// SessionSnapshot (identical shape for host and guest; see types.ts):
//
//   role       'host' | 'guest'
//   status     'connecting' | 'connected' | 'reconnecting' | 'disconnected'
//   roomCode   string | null     5 chars to show/share; host: null until the
//                                room is registered (status 'connected')
//   lobby      Lobby | null      { roomCode, started, turnLimitSec, seats }
//                                LobbySeat = { kind: 'local'|'remote'|'ai',
//                                  name, difficulty?, claimed, online, standIn }
//                                seat index === player index in GameState.
//                                'local' means "on the host's device".
//                                guest: null until it has been let in
//   state      GameState | null  null while in the lobby. This is a REDACTED
//                                view: see "Hidden cards" below
//   rev        number            +1 per applied action
//   mySeat     number | null     which player this device is
//   localSeats number[]          all seats played on this device (host
//                                hot-seat may have several; guest: [mySeat])
//   canAct     boolean           it is this device's turn and the link is up
//   lastError  { code, message } | null
//   timer      TurnTimer | null  { limitSec, seat, deadline } for the turn
//                                being played; deadline is on this device's
//                                Date.now() clock. null = nothing counting
//   forced     'timeout' | 'offline' | null   the host, not the seat's owner,
//                                played state.lastAction (see below)
//
// Turn limit and stand-ins (online games only; local games have none)
// --------------------------------------------------------------------
// The host picks lobby.turnLimitSec in the lobby (setTurnLimit; default 60,
// null = no limit). When a human seat's time is up, the host plays a move
// for it with chooseAiAction (normal difficulty) and broadcasts the state
// with forced: 'timeout'. That applies to the host's own seat too. A guest
// offline for 30 s during a game gets standIn: true in the lobby, and the
// AI plays its turns at once (forced: 'offline') until it reconnects, when
// control returns to it by itself. Both need chooseAiAction.
// Clocks: the host sends how much time is LEFT in every state message and a
// guest anchors that to its own clock on receipt, so clock skew between the
// phones never matters (protocol.ts has the details).
//
// Typical host flow
// -----------------
//   1. const s = createHostSession({
//        applyAction: engine.applyAction,
//        hostName: '민지',
//        chooseAiAction: chooseAction,       // from src/ai, optional
//      })
//      A fresh room starts with seat 0 = local (the host) and seat 1 = remote
//      (open, waiting for a guest): the two-phone case needs no setSeat call.
//   2. Show snap.roomCode once status is 'connected'. The partner types it in.
//   3. Watch snap.lobby.seats: a remote seat is ready when `claimed` is true
//      (`online` tells whether that guest is connected right now).
//      Optional seat editing, lobby only:
//        s.setSeat(1, { kind: 'ai', name: '토끼', difficulty: 'hard' })
//        s.setSeat(1, { kind: 'remote' })              // open seat for a guest
//        s.setSeat(2, { kind: 'local', name: '지호' })  // append a 3rd seat
//        s.setSeat(2, null)                            // remove it again
//        s.setTurnLimit(30)                            // or null: no limit
//   4. Build the game and start it:
//        const players = lobbyToPlayers(snap.lobby)    // helper below
//        s.startGame(engine.createGame({ players, seed, cards, nobles }))
//      Returns false and sets lastError (code 'bad-lobby') when a remote seat
//      is still empty or the player count does not match the seat count.
//      Calling startGame again later starts a rematch; returnToLobby() goes
//      back to seat editing.
//   5. Render snap.state. When snap.canAct, call s.sendAction(action).
//      Illegal actions come back as lastError.code === 'illegal-action' and
//      leave the state untouched. AI seats move by themselves (aiDelayMs,
//      default 900 ms, between moves).
//
// Typical guest flow
// ------------------
//   1. const s = createGuestSession({ roomCode: typedCode, name: '지호' })
//      (the code is normalised: lower case, spaces and dashes are fine)
//   2. status 'connecting' -> 'connected'. On failure status becomes
//      'disconnected' with lastError.code one of:
//        'room-not-found'   no such room (typo, or the host is not up yet)
//        'room-full'        no free guest seat / game started without you
//        'version-mismatch' the two devices run different builds: reload both
//        'room-closed'      the host ended the room
//        'kicked'           the host replaced or removed the seat
//        'network'          could not reach the broker
//      Offer a retry button that calls s.retry().
//   3. snap.lobby is the waiting room; when snap.state turns non-null the
//      game is on. Same rendering code as the host; sendAction only when
//      canAct. For a guest sendAction() === true means "sent": the result is
//      a new snap.state, or lastError ('illegal-action', 'not-your-turn',
//      'stale-state' = the game moved on first; the fresh state follows).
//
// Hidden cards
// ------------
// snap.state never contains information this device must not see:
//   - state.decks[tier] has the right LENGTH but every card is a placeholder
//   - other players' reserved cards with fromDeck === true are placeholders
//     (their real `tier` is kept, as on a real card back)
//   - state.rngState is 0
// Test with isHiddenCard(card) and draw a card back. Placeholder ids look
// like "hidden-d2-7" / "hidden-r1-0" and are unique within a state, so they
// are safe as React keys. Engine helpers such as getLegalActions still work on
// the redacted view for the device's own player. On a host with several local
// seats (hot-seat) the view follows whichever local player is to move.
//
// Emotes (speech bubbles)
// -----------------------
// Transient, not part of the snapshot (they are events, not state):
//   session.sendEmote('clap')           // from my seat (host hot-seat: the
//                                       // local seat to move; or pass a seat)
//   session.onEmote(({ seat, id, at }) => showBubble(seat, id))
// Only the id travels. The host validates it (option `validEmote`, give it
// the UI's isEmoteId), drops a seat's extras beyond one per
// EMOTE_MIN_INTERVAL_MS (1.5 s) silently, and broadcasts { seat, id, at } to
// every guest and to its own onEmote listeners. A guest sees its own emote
// come back the same way, so one code path shows every bubble. Unknown ids
// should still be ignored on receipt (look the id up, skip when missing).
//
// Reconnection (mostly automatic)
// -------------------------------
//   - Guest: phones drop the link when the screen locks. The session notices
//     (heartbeat, visibilitychange, online events), shows status
//     'reconnecting', retries with backoff forever, and resyncs lobby + state.
//     The seat is tied to a secret token in localStorage, so even a full page
//     reload gets the same seat back: call getSavedGuestRoom() on startup and,
//     if it returns { roomCode, name }, offer/auto-run createGuestSession with
//     those values.
//   - Host: the whole room (code, seats, tokens, game) is saved to localStorage
//     on every change. After a host reload call getSavedHostRoom(); if it
//     returns a room, createHostSession({ ..., resume: true }) re-creates it
//     under the SAME code with the game where it was; guests reconnect by
//     themselves. Without `resume: true` a brand-new room replaces the saved one.
//   - While a guest is away its seat shows online: false. The game simply
//     waits on that player's turn.
//   - close() keeps everything resumable (safe in a React effect cleanup).
//     close({ forget: true }) is the "leave / end room" button: the host
//     notifies guests and deletes the saved room; a guest frees its seat.
//
// Options worth knowing (all optional unless noted)
// -------------------------------------------------
//   host:  applyAction (required), hostName, chooseAiAction, aiDelayMs,
//          validEmote, resume, storage, transport, heartbeatMs, retryDelaysMs
//   guest: roomCode (required), name (required), storage, transport,
//          heartbeatMs, retryDelaysMs
//   `transport` defaults to PeerJS on its public broker (loaded lazily). To
//   use your own PeerServer or TURN servers:
//     transport: createLazyPeerTransport({ peerOptions: { host, port, config } })
//   Tests / storybook: createMemoryNetwork() gives an in-memory Transport that
//   several sessions in one page can share.
// =============================================================================

import type { NewGameConfig } from '../shared/contract.ts'
import { createGuestSession as createGuestCore, type GuestSessionOptions as GuestCoreOptions } from './guest.ts'
import { createHostSession as createHostCore, type HostSessionOptions as HostCoreOptions } from './host.ts'
import type { PeerTransportOptions } from './peerTransport.ts'
import type { Lobby } from './protocol.ts'
import type { Transport } from './transport.ts'
import type { GuestSession, HostSession } from './types.ts'

export type HostSessionOptions = Omit<HostCoreOptions, 'transport'> & { transport?: Transport }
export type GuestSessionOptions = Omit<GuestCoreOptions, 'transport'> & { transport?: Transport }

/**
 * The PeerJS transport, with the PeerJS library loaded on first use only (so
 * it stays out of the main bundle and out of node-based tests).
 */
export function createLazyPeerTransport(options?: PeerTransportOptions): Transport {
  let real: Promise<Transport> | null = null
  const get = (): Promise<Transport> =>
    (real ??= import('./peerTransport.ts').then((m) => m.createPeerTransport(options)))
  return {
    listen: async (roomCode, onConnection) => (await get()).listen(roomCode, onConnection),
    connect: async (roomCode) => (await get()).connect(roomCode),
  }
}

let sharedPeerTransport: Transport | null = null
const defaultTransport = (): Transport => (sharedPeerTransport ??= createLazyPeerTransport())

/** Creates a room (or resumes the saved one with `resume: true`) and starts hosting. */
export function createHostSession(opts: HostSessionOptions): HostSession {
  return createHostCore({ ...opts, transport: opts.transport ?? defaultTransport() })
}

/** Joins (or rejoins) the room `opts.roomCode` as `opts.name`. */
export function createGuestSession(opts: GuestSessionOptions): GuestSession {
  return createGuestCore({ ...opts, transport: opts.transport ?? defaultTransport() })
}

/** The `players` array for the engine's createGame, in seat order. */
export function lobbyToPlayers(lobby: Lobby): NewGameConfig['players'] {
  return lobby.seats.map((seat, i) =>
    seat.kind === 'ai'
      ? { name: seat.name || `AI ${i + 1}`, kind: 'ai' as const, difficulty: seat.difficulty ?? 'normal' }
      : { name: seat.name || `플레이어 ${i + 1}`, kind: 'human' as const },
  )
}

export { getSavedHostRoom, clearSavedHostRoom, EMOTE_MIN_INTERVAL_MS, type SavedHostRoomInfo } from './host.ts'
export { getSavedGuestRoom, type SavedGuestRoomInfo } from './guest.ts'
export { redactStateFor, isHiddenCard, hiddenCard, HIDDEN_CARD_PREFIX } from './redact.ts'
export {
  PROTOCOL_VERSION,
  ROOM_CODE_LENGTH,
  ROOM_CODE_ALPHABET,
  TURN_LIMIT_CHOICES,
  DEFAULT_TURN_LIMIT_SEC,
  STAND_IN_AFTER_MS,
  normalizeRoomCode,
  isValidRoomCode,
  isEmoteIdShape,
  isTurnLimit,
  type EmoteEvent,
  type ForcedReason,
  type Lobby,
  type LobbySeat,
  type SeatKind,
  type NetError,
  type NetErrorCode,
  type GuestMessage,
  type HostMessage,
  type WireTimer,
} from './protocol.ts'
export { createMemoryNetwork, TransportError, type Transport, type Connection, type RoomListener } from './transport.ts'
export { createMemoryStorage, type KeyValueStorage, type Lifecycle } from './util.ts'
export type { PeerTransportOptions } from './peerTransport.ts'
export type {
  ConnectionStatus,
  SessionSnapshot,
  Session,
  HostSession,
  GuestSession,
  SeatConfig,
  TurnTimer,
} from './types.ts'
