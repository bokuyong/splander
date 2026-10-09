// Host side: owns the room, the lobby and the authoritative GameState.
//
// Turn timer and stand-ins (so a game is never stuck on someone who left)
// ------------------------------------------------------------------------
// - `turnStartedAt` is reset on every state change (every applied action
//   hands the move to someone, or changes the phase for the same seat, e.g.
//   'discard' / 'chooseNoble'). With a turn limit, a ticker (tickMs) checks
//   `now() - turnStartedAt` and, once the limit is up, plays a move for the
//   seat with `chooseAiAction` (normal difficulty), whoever owns the seat: a
//   guest or the host's own local seat. The result is broadcast with
//   `forced: 'timeout'` so every screen can say so.
// - A remote seat offline for STAND_IN_AFTER_MS during a game is flagged
//   `standIn` (lobby broadcast). While flagged, its turns are played by the AI
//   right away (after aiDelayMs, like an AI seat) with `forced: 'offline'`.
//   The flag clears the moment the guest says hello again; a move already
//   being chosen still lands (it is legal either way). Stand-ins do not
//   depend on the turn limit: a walked-away player blocks nobody.
// - Nothing ticks in the lobby or after the game: the ticker only runs while
//   a game is on, and every check re-reads the state first.

import type { Action, Difficulty, GameState } from '../shared/contract.ts'
import {
  DEFAULT_TURN_LIMIT_SEC,
  PROTOCOL_VERSION,
  STAND_IN_AFTER_MS,
  generateRoomCode,
  isEmoteIdShape,
  isTurnLimit,
  isValidRoomCode,
  parseGuestMessage,
  type EmoteEvent,
  type ForcedReason,
  type HostMessage,
  type Lobby,
  type LobbySeat,
  type NetError,
  type NetErrorCode,
  type SeatKind,
  type WireTimer,
} from './protocol.ts'
import { redactStateFor } from './redact.ts'
import { transportErrorCode, type Connection, type RoomListener, type Transport } from './transport.ts'
import type { HostSession, SessionSnapshot, TurnTimer } from './types.ts'
import {
  DEFAULT_RETRY_DELAYS_MS,
  browserLifecycle,
  createSleeper,
  createStore,
  defaultStorage,
  errorMessage,
  generateToken as defaultGenerateToken,
  netError,
  readJson,
  removeKey,
  retryDelay,
  writeJson,
  type KeyValueStorage,
  type Lifecycle,
} from './util.ts'

export const HOST_STORAGE_KEY = 'mg-net:host'
export const MAX_SEATS = 4
export const MIN_SEATS = 2
const MAX_NAME_LENGTH = 16
const SAVE_VERSION = 1
/** How long a connection stays up after a final error message, so it can arrive. */
const GOODBYE_MS = 150
/** A seat may flash one emote per this interval; extras are dropped silently. */
export const EMOTE_MIN_INTERVAL_MS = 1500

export interface HostSessionOptions {
  transport: Transport
  /**
   * The rules engine's applyAction. Must be pure and throw on an illegal
   * action; whatever it throws is reported to the sender and the state is kept.
   */
  applyAction: (state: GameState, action: Action) => GameState
  /** Name of the host's own seat in a freshly created room. */
  hostName?: string
  /**
   * Chooses for state.currentPlayer (same signature as the contract's
   * ChooseAction; may also return a promise). It receives the state redacted
   * for the AI's seat, so it cannot peek. Without it AI seats never move, and
   * neither the turn limit nor stand-ins can play for anyone.
   */
  chooseAiAction?: (state: GameState, difficulty: Difficulty) => Action | Promise<Action>
  /** Pause before each AI move, so humans can follow. Default 900. */
  aiDelayMs?: number
  /**
   * Which emote ids exist (the UI owns the set). Anything else from a guest
   * or from sendEmote is dropped. Default: any well-formed id.
   */
  validEmote?: (id: string) => boolean
  /** Where the room is saved. Default: localStorage. */
  storage?: KeyValueStorage
  /**
   * true: re-create the room saved in storage (same code, seats, tokens, game)
   * when there is one, otherwise create a fresh room. Default false: always
   * create a fresh room, overwriting any saved one.
   */
  resume?: boolean
  /** Backoff between attempts to (re)register the room. */
  retryDelaysMs?: readonly number[]
  /** A guest silent for 3 heartbeats is treated as offline. 0 disables. Default 5000. */
  heartbeatMs?: number
  /** A guest offline this long during a game gets a stand-in. Default STAND_IN_AFTER_MS. */
  standInAfterMs?: number
  /** How often the turn clock and stand-ins are checked while a game is on. Default 500. */
  tickMs?: number
  lifecycle?: Lifecycle
  /** Test hooks. */
  random?: () => number
  generateToken?: () => string
  now?: () => number
}

interface SeatRec {
  kind: SeatKind
  name: string
  difficulty?: Difficulty
  /** remote seats only: the secret of the guest holding the seat. */
  token: string | null
  conn: Connection | null
  lastSeen: number
  /** When this seat last flashed an emote (rate limiting). */
  lastEmoteAt: number
  /** remote seats: `now()` when the connection was last lost (0 = never had one). */
  offlineSince: number
  /** remote seats: the AI is playing for the absent guest. */
  standIn: boolean
}

interface SavedSeat {
  kind: SeatKind
  name: string
  difficulty?: Difficulty
  token: string | null
}

interface SavedHostRoom {
  v: number
  roomCode: string
  seats: SavedSeat[]
  started: boolean
  state: GameState | null
  rev: number
  savedAt: number
  /** Missing in rooms saved by older builds: no limit then. */
  turnLimitSec?: number | null
}

/** What the UI needs to offer "resume my room" after a reload. */
export interface SavedHostRoomInfo {
  roomCode: string
  started: boolean
  gameOver: boolean
  seatNames: string[]
  savedAt: number
}

function loadSavedRoom(storage: KeyValueStorage): SavedHostRoom | null {
  const saved = readJson<SavedHostRoom>(storage, HOST_STORAGE_KEY)
  if (!saved || saved.v !== SAVE_VERSION) return null
  if (typeof saved.roomCode !== 'string' || !isValidRoomCode(saved.roomCode)) return null
  if (!Array.isArray(saved.seats) || saved.seats.length < MIN_SEATS || saved.seats.length > MAX_SEATS) return null
  return saved
}

export function getSavedHostRoom(storage: KeyValueStorage = defaultStorage()): SavedHostRoomInfo | null {
  const saved = loadSavedRoom(storage)
  if (!saved) return null
  return {
    roomCode: saved.roomCode,
    started: saved.started,
    gameOver: saved.state?.phase === 'gameOver',
    seatNames: saved.seats.map((s) => s.name),
    savedAt: saved.savedAt,
  }
}

export function clearSavedHostRoom(storage: KeyValueStorage = defaultStorage()): void {
  removeKey(storage, HOST_STORAGE_KEY)
}

function cleanName(name: string, fallback: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
  return trimmed || fallback
}

function newSeat(kind: SeatKind, name: string): SeatRec {
  return { kind, name, token: null, conn: null, lastSeen: 0, lastEmoteAt: 0, offlineSince: 0, standIn: false }
}

export function createHostSession(opts: HostSessionOptions): HostSession {
  const { transport, applyAction } = opts
  const storage = opts.storage ?? defaultStorage()
  const aiDelayMs = opts.aiDelayMs ?? 900
  const retryDelays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const heartbeatMs = opts.heartbeatMs ?? 5000
  const standInAfterMs = opts.standInAfterMs ?? STAND_IN_AFTER_MS
  const tickMs = opts.tickMs ?? 500
  const newToken = opts.generateToken ?? defaultGenerateToken
  const random = opts.random ?? Math.random
  const now = opts.now ?? Date.now
  const validEmote = opts.validEmote ?? (() => true)
  const emoteListeners = new Set<(event: EmoteEvent) => void>()
  const sleeper = createSleeper()

  // ---- authoritative data ----
  let seats: SeatRec[]
  let started = false
  let state: GameState | null = null
  let rev = 0
  let roomCode: string
  let resumed = false
  let turnLimitSec: number | null = DEFAULT_TURN_LIMIT_SEC
  /** `now()` when the current turn (or decision phase) began. */
  let turnStartedAt = now()
  /** Who really played state.lastAction, when it was not the seat's owner. */
  let forced: ForcedReason | null = null

  const saved = opts.resume ? loadSavedRoom(storage) : null
  if (saved) {
    resumed = true
    roomCode = saved.roomCode
    // Guests are all "just gone" until they come back; stand-ins start counting now.
    seats = saved.seats.map((s) => ({ ...newSeat(s.kind, s.name), difficulty: s.difficulty, token: s.token, offlineSince: now() }))
    started = saved.started && saved.state !== null
    state = started ? saved.state : null
    rev = saved.rev
    turnLimitSec = isTurnLimit(saved.turnLimitSec) ? saved.turnLimitSec : null
  } else {
    roomCode = generateRoomCode(random)
    seats = [newSeat('local', cleanName(opts.hostName ?? '', '방장')), newSeat('remote', '')]
  }

  // ---- runtime ----
  let closed = false
  let registered = false // the room is currently reachable under roomCode
  let everRegistered = false
  let opening = false
  let listener: RoomListener | null = null
  /** One pending automatic move (AI seat, stand-in or timeout). */
  let autoTimer: ReturnType<typeof setTimeout> | null = null
  /** An automatic move is being chosen right now (chooseAiAction may be async). */
  let autoBusy = false
  /** The rev at which the AI last failed: it is not asked again until the state moves on. */
  let autoFailedAtRev = -1
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null

  // ---- derived views (cached so snapshots stay referentially stable) ----
  let lobbyJson = ''
  let lobby: Lobby = buildLobby()
  lobbyJson = JSON.stringify(lobby)
  let viewOf: GameState | null = null
  let viewSeat = -2
  let view: GameState | null = null
  let timerOf: GameState | null = null
  let timerLimit: number | null = null
  let timer: TurnTimer | null = null

  function buildLobby(): Lobby {
    return {
      roomCode,
      started,
      turnLimitSec,
      seats: seats.map((s): LobbySeat => {
        const seat: LobbySeat = {
          kind: s.kind,
          name: s.name,
          claimed: s.kind !== 'remote' || s.token !== null,
          online: s.kind !== 'remote' || s.conn !== null,
          standIn: s.kind === 'remote' && s.standIn,
        }
        if (s.kind === 'ai') seat.difficulty = s.difficulty ?? 'normal'
        return seat
      }),
    }
  }

  function localSeatList(): number[] {
    const out: number[] = []
    seats.forEach((s, i) => {
      if (s.kind === 'local') out.push(i)
    })
    return out
  }

  function hostViewSeat(locals: number[]): number {
    // Hot-seat: show the hand of whichever local player is to move.
    if (state && locals.includes(state.currentPlayer)) return state.currentPlayer
    return locals.length > 0 ? locals[0] : -1
  }

  /** The clock for the current turn, or null when nothing is counting down. */
  function currentTimer(): TurnTimer | null {
    if (!state || state.phase === 'gameOver' || turnLimitSec === null) return null
    if (seats[state.currentPlayer]?.kind === 'ai') return null
    return { limitSec: turnLimitSec, seat: state.currentPlayer, deadline: turnStartedAt + turnLimitSec * 1000 }
  }

  function wireTimer(): WireTimer | null {
    const t = currentTimer()
    return t ? { limitSec: t.limitSec, remainingMs: Math.max(0, t.deadline - now()) } : null
  }

  const store = createStore<SessionSnapshot>({
    role: 'host',
    status: 'connecting',
    roomCode: resumed ? roomCode : null,
    lobby,
    state: null,
    rev,
    mySeat: null,
    localSeats: Object.freeze([]),
    canAct: false,
    lastError: null,
    timer: null,
    forced: null,
  })

  /** Recomputes the snapshot. Returns true when the public lobby changed. */
  function publish(): boolean {
    const nextLobby = buildLobby()
    const json = JSON.stringify(nextLobby)
    const lobbyChanged = json !== lobbyJson
    if (lobbyChanged) {
      lobby = nextLobby
      lobbyJson = json
    }
    const locals = localSeatList()
    const seat = hostViewSeat(locals)
    if (state !== viewOf || seat !== viewSeat) {
      viewOf = state
      viewSeat = seat
      view = state ? redactStateFor(state, seat) : null
    }
    if (state !== timerOf || turnLimitSec !== timerLimit) {
      timerOf = state
      timerLimit = turnLimitSec
      const t = currentTimer()
      timer = t ? Object.freeze(t) : null
    }
    const prevLocals = store.get().localSeats
    const sameLocals = prevLocals.length === locals.length && prevLocals.every((v, i) => v === locals[i])
    store.set({
      roomCode: registered || everRegistered || resumed ? roomCode : null,
      lobby,
      state: view,
      rev,
      mySeat: locals.length > 0 ? locals[0] : null,
      localSeats: sameLocals ? prevLocals : Object.freeze(locals),
      canAct: !closed && state !== null && state.phase !== 'gameOver' && locals.includes(state.currentPlayer),
      timer,
      forced,
    })
    return lobbyChanged
  }

  function persist(): void {
    const data: SavedHostRoom = {
      v: SAVE_VERSION,
      roomCode,
      seats: seats.map((s) => {
        const out: SavedSeat = { kind: s.kind, name: s.name, token: s.token }
        if (s.difficulty) out.difficulty = s.difficulty
        return out
      }),
      started,
      state,
      rev,
      savedAt: Date.now(),
      turnLimitSec,
    }
    writeJson(storage, HOST_STORAGE_KEY, data)
  }

  // ---- sending ----

  function send(conn: Connection, msg: HostMessage): void {
    try {
      conn.send(msg)
    } catch {
      // a dying connection: its close event will mark the seat offline
    }
  }

  function sendError(conn: Connection, code: NetErrorCode, message: string): void {
    send(conn, { v: PROTOCOL_VERSION, type: 'error', code, message })
  }

  function sendState(conn: Connection, seat: number): void {
    send(conn, {
      v: PROTOCOL_VERSION,
      type: 'state',
      state: state ? redactStateFor(state, seat) : null,
      rev,
      timer: wireTimer(),
      forced,
    })
  }

  function broadcastLobby(): void {
    for (const s of seats) if (s.conn) send(s.conn, { v: PROTOCOL_VERSION, type: 'lobby', lobby })
  }

  function broadcastState(): void {
    seats.forEach((s, i) => {
      if (s.conn) sendState(s.conn, i)
    })
  }

  /** After any lobby-affecting change: save, refresh snapshot, tell guests. */
  function lobbyChanged(): void {
    persist()
    if (publish()) broadcastLobby()
  }

  /** After any game-state change (rev was bumped). */
  function stateChanged(): void {
    turnStartedAt = now()
    if (!state || state.phase === 'gameOver') {
      // Nobody is standing in for anyone once there is nothing to play.
      for (const s of seats) s.standIn = false
    }
    persist()
    if (publish()) broadcastLobby()
    broadcastState()
    syncTicker()
    scheduleAuto()
  }

  function closeSoon(conn: Connection): void {
    setTimeout(() => conn.close(), GOODBYE_MS)
  }

  /** The seat's link is gone (closed, silent, or replaced): remember since when. */
  function dropConn(seat: SeatRec): void {
    if (seat.conn === null) return
    seat.conn = null
    seat.offlineSince = now()
  }

  function kick(seat: SeatRec, code: NetErrorCode, message: string): void {
    const conn = seat.conn
    dropConn(seat)
    if (conn) {
      sendError(conn, code, message)
      closeSoon(conn)
    }
  }

  // ---- emotes ----

  /**
   * Validates, rate-limits and broadcasts an emote from `seatIndex` (a guest's
   * or one of the host's own). Everyone hears it, the host's own UI through
   * the onEmote listeners. Returns false when it was dropped.
   */
  function emote(seatIndex: number, id: unknown): boolean {
    const seat = seats[seatIndex]
    if (!seat || !isEmoteIdShape(id) || !validEmote(id)) return false
    const at = now()
    if (at - seat.lastEmoteAt < EMOTE_MIN_INTERVAL_MS) return false
    seat.lastEmoteAt = at
    const event: EmoteEvent = Object.freeze({ seat: seatIndex, id, at })
    for (const s of seats) if (s.conn) send(s.conn, { v: PROTOCOL_VERSION, type: 'emote', ...event })
    for (const l of [...emoteListeners]) l(event)
    return true
  }

  // ---- game ----

  function tryApply(action: Action, reason: ForcedReason | null = null): NetError | null {
    if (!state) return netError('not-started', 'The game has not started')
    let next: GameState
    try {
      next = applyAction(state, action)
    } catch (e) {
      return netError('illegal-action', errorMessage(e))
    }
    if (typeof next !== 'object' || next === null) {
      return netError('illegal-action', 'applyAction returned no state')
    }
    state = next
    rev++
    forced = reason
    stateChanged()
    return null
  }

  // ---- automatic moves: AI seats, stand-ins, the turn clock ----

  function cancelAuto(): void {
    if (autoTimer !== null) clearTimeout(autoTimer)
    autoTimer = null
  }

  /** True once the current seat's time is up. */
  function timeIsUp(): boolean {
    return turnLimitSec !== null && now() - turnStartedAt >= turnLimitSec * 1000
  }

  /**
   * Arms the one pending automatic move when the seat to move needs one:
   * an AI seat (after aiDelayMs), a stand-in (same pace), or any human seat
   * whose clock ran out (at once). Idempotent; called after every change and
   * on every tick.
   */
  function scheduleAuto(): void {
    const choose = opts.chooseAiAction
    if (autoTimer !== null || autoBusy || closed || !choose || !state || state.phase === 'gameOver') return
    if (rev === autoFailedAtRev) return
    const seat = seats[state.currentPlayer]
    if (!seat) return
    let reason: ForcedReason | null
    let delay: number
    if (seat.kind === 'ai') {
      reason = null
      delay = aiDelayMs
    } else if (seat.kind === 'remote' && seat.standIn) {
      reason = 'offline'
      delay = aiDelayMs
    } else if (timeIsUp()) {
      reason = 'timeout'
      delay = 0
    } else return
    const atRev = rev
    autoTimer = setTimeout(() => {
      autoTimer = null
      void playAuto(choose, atRev, reason)
    }, delay)
  }

  async function playAuto(
    choose: NonNullable<HostSessionOptions['chooseAiAction']>,
    atRev: number,
    reason: ForcedReason | null,
  ): Promise<void> {
    if (closed || !state || state.phase === 'gameOver') return
    if (rev !== atRev) return scheduleAuto()
    const seatIndex = state.currentPlayer
    const seat = seats[seatIndex]
    // The guest came back in the meantime: the move is theirs again.
    if (reason === 'offline' && !seat?.standIn) return
    if (reason === 'timeout' && !timeIsUp()) return scheduleAuto()
    autoBusy = true
    let action: Action
    try {
      // Forced moves for humans are played at normal strength, AI seats at theirs.
      action = await choose(redactStateFor(state, seatIndex), seat?.kind === 'ai' ? (seat.difficulty ?? 'normal') : 'normal')
    } catch (e) {
      autoBusy = false
      autoFailedAtRev = rev
      store.set({ lastError: netError('ai-failed', `AI could not choose: ${errorMessage(e)}`) })
      return
    }
    autoBusy = false
    if (closed) return
    if (rev !== atRev) return scheduleAuto()
    const err = tryApply(action, reason)
    if (err) {
      autoFailedAtRev = rev
      store.set({ lastError: netError('ai-failed', `AI chose an illegal action: ${err.message}`) })
    }
  }

  /** Every tickMs while a game is on: flag stand-ins, fire the turn clock. */
  function tick(): void {
    if (closed || !state || state.phase === 'gameOver') return syncTicker()
    const t = now()
    let flagged = false
    for (const s of seats) {
      if (s.kind === 'remote' && s.conn === null && !s.standIn && t - s.offlineSince >= standInAfterMs) {
        s.standIn = true
        flagged = true
      }
    }
    if (flagged) lobbyChanged()
    scheduleAuto()
  }

  function syncTicker(): void {
    const wanted = !closed && started && state !== null && state.phase !== 'gameOver' && tickMs > 0
    if (wanted && tickTimer === null) tickTimer = setInterval(tick, tickMs)
    else if (!wanted && tickTimer !== null) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }

  // ---- guests ----

  function seatOf(conn: Connection): number {
    return seats.findIndex((s) => s.conn === conn)
  }

  function handleConnection(conn: Connection): void {
    if (closed) {
      conn.close()
      return
    }
    conn.onMessage((raw) => handleMessage(conn, raw))
    conn.onClose(() => {
      const i = seatOf(conn)
      if (i === -1) return
      dropConn(seats[i])
      if (publish()) broadcastLobby()
    })
  }

  function handleMessage(conn: Connection, raw: unknown): void {
    if (closed) return
    const parsed = parseGuestMessage(raw)
    if (!parsed.ok) {
      if (parsed.reason === 'version') {
        const i = seatOf(conn)
        if (i !== -1) dropConn(seats[i])
        sendError(
          conn,
          'version-mismatch',
          `Host speaks protocol v${PROTOCOL_VERSION}, guest v${parsed.theirs}. Reload both devices.`,
        )
        closeSoon(conn)
        if (i !== -1 && publish()) broadcastLobby()
      } else if (parsed.reason === 'malformed') {
        sendError(conn, 'bad-message', 'Malformed message')
      }
      // unknown-type: a newer-but-compatible client; nothing to do
      return
    }
    const msg = parsed.msg

    if (msg.type === 'hello') {
      handleHello(conn, msg.name, msg.token)
      return
    }

    const seatIndex = seatOf(conn)
    if (seatIndex === -1) {
      sendError(conn, 'bad-message', 'Say hello first')
      return
    }
    const seat = seats[seatIndex]
    seat.lastSeen = Date.now()

    switch (msg.type) {
      case 'ping':
        send(conn, { v: PROTOCOL_VERSION, type: 'pong' })
        return
      case 'sync':
        send(conn, { v: PROTOCOL_VERSION, type: 'lobby', lobby })
        sendState(conn, seatIndex)
        return
      case 'leave':
        dropConn(seat)
        if (!started) {
          // Mid-game the seat stays reserved: the player index must not change hands.
          seat.token = null
          seat.name = ''
        }
        closeSoon(conn)
        lobbyChanged()
        return
      case 'action': {
        if (!state) return sendError(conn, 'not-started', 'The game has not started')
        if (msg.rev !== rev) {
          sendError(conn, 'stale-state', 'The game moved on before your action arrived')
          sendState(conn, seatIndex)
          return
        }
        if (state.phase === 'gameOver') return sendError(conn, 'illegal-action', 'The game is over')
        if (state.currentPlayer !== seatIndex) return sendError(conn, 'not-your-turn', 'It is not your turn')
        const err = tryApply(msg.action)
        if (err) sendError(conn, err.code, err.message)
        return
      }
      case 'emote':
        emote(seatIndex, msg.id) // dropped silently when invalid or too soon
        return
    }
  }

  function handleHello(conn: Connection, name: string, token: string | undefined): void {
    const current = seatOf(conn)
    let index = token ? seats.findIndex((s) => s.kind === 'remote' && s.token === token) : -1
    if (index === -1 && current !== -1) index = current // repeated hello on a seated connection
    let fresh = false
    if (index === -1) {
      index = seats.findIndex((s) => s.kind === 'remote' && s.token === null)
      fresh = true
    }
    if (index === -1) {
      sendError(conn, 'room-full', started ? 'The game already started without you' : 'The room is full')
      closeSoon(conn)
      return
    }
    const seat = seats[index]
    if (fresh) {
      seat.token = newToken()
      seat.name = cleanName(name, `친구 ${index + 1}`)
    } else if (!started && name.trim()) {
      seat.name = cleanName(name, seat.name)
    }
    if (seat.conn && seat.conn !== conn) {
      // The same player came back on a new connection: the old one is dead weight.
      const old = seat.conn
      seat.conn = null
      old.close()
    }
    seat.conn = conn
    seat.lastSeen = Date.now()
    seat.offlineSince = 0
    if (seat.standIn) {
      // Back in control. A stand-in move still waiting its turn is dropped;
      // one already being chosen lands (it is a legal move either way).
      seat.standIn = false
      if (state && state.currentPlayer === index) cancelAuto()
    }
    persist()
    const changed = publish()
    send(conn, {
      v: PROTOCOL_VERSION,
      type: 'welcome',
      seat: index,
      token: seat.token as string,
      lobby,
      state: state ? redactStateFor(state, index) : null,
      rev,
      timer: wireTimer(),
      forced,
    })
    if (changed) for (const s of seats) if (s.conn && s.conn !== conn) send(s.conn, { v: PROTOCOL_VERSION, type: 'lobby', lobby })
    scheduleAuto() // the clock may already have run out while they were away
  }

  // ---- room registration ----

  async function openRoom(): Promise<void> {
    if (opening || closed || registered) return
    opening = true
    let attempt = 0
    let collisions = 0
    try {
      while (!closed) {
        try {
          const l = await transport.listen(roomCode, handleConnection)
          if (closed) {
            l.close()
            return
          }
          listener = l
          registered = true
          everRegistered = true
          l.onClose(() => {
            if (listener !== l) return
            listener = null
            registered = false
            if (closed) return
            store.set({ status: 'reconnecting' })
            void openRoom()
          })
          persist()
          store.set({ status: 'connected' })
          if (publish()) broadcastLobby()
          scheduleAuto()
          return
        } catch (e) {
          if (closed) return
          const code = transportErrorCode(e)
          const mayRename = !resumed && !everRegistered
          if (code === 'id-taken' && mayRename && collisions < 20) {
            // Somebody else's room: pick another code and try again at once.
            collisions++
            roomCode = generateRoomCode(random)
            publish()
            continue
          }
          // A room that guests already know keeps its code and retries for as
          // long as it takes (after a reload the broker may hold the old id
          // for a moment). A brand-new room gives up after a few attempts.
          if (mayRename && attempt >= 4) {
            store.set({
              status: 'disconnected',
              lastError: netError('network', `Could not create the room: ${errorMessage(e)}`),
            })
            return
          }
          store.set({ status: mayRename ? 'connecting' : 'reconnecting' })
          await sleeper.sleep(retryDelay(retryDelays, attempt))
          attempt++
        }
      }
    } finally {
      opening = false
    }
  }

  function checkHeartbeats(): void {
    const now = Date.now()
    let dropped = false
    for (const s of seats) {
      if (s.conn && now - s.lastSeen > heartbeatMs * 3) {
        const conn = s.conn
        dropConn(s)
        conn.close()
        dropped = true
      }
    }
    if (dropped && publish()) broadcastLobby()
  }

  const stopLifecycle = (opts.lifecycle ?? browserLifecycle).onWake(() => {
    if (closed) return
    if (store.get().status === 'disconnected') void openRoom()
    else sleeper.wake()
  })
  if (heartbeatMs > 0) heartbeatTimer = setInterval(checkHeartbeats, heartbeatMs)

  publish()
  syncTicker()
  void openRoom()

  // ---- facade ----

  function fail(code: NetErrorCode, message: string): false {
    store.set({ lastError: netError(code, message) })
    return false
  }

  return {
    subscribe: store.subscribe,
    getSnapshot: store.get,

    sendAction(action) {
      if (closed) return fail('not-connected', 'The session is closed')
      store.set({ lastError: null })
      if (!state) return fail('not-started', 'The game has not started')
      if (state.phase === 'gameOver') return fail('illegal-action', 'The game is over')
      if (seats[state.currentPlayer]?.kind !== 'local') return fail('not-your-turn', 'It is not your turn')
      const err = tryApply(action)
      if (err) return fail(err.code, err.message)
      return true
    },

    sendEmote(id, seat) {
      if (closed) return false
      const locals = localSeatList()
      const from = seat ?? hostViewSeat(locals)
      if (!locals.includes(from)) return false
      return emote(from, id)
    },

    onEmote(listener) {
      emoteListeners.add(listener)
      return () => void emoteListeners.delete(listener)
    },

    setSeat(index, config) {
      if (closed) return false
      if (started) return fail('bad-lobby', 'Seats cannot change during a game')
      if (!Number.isInteger(index) || index < 0 || index > seats.length || index >= MAX_SEATS) {
        return fail('bad-lobby', 'No such seat')
      }
      if (config === null) {
        if (index >= seats.length) return fail('bad-lobby', 'No such seat')
        if (seats.length <= MIN_SEATS) return fail('bad-lobby', `At least ${MIN_SEATS} seats are needed`)
        kick(seats[index], 'kicked', 'The host removed your seat')
        seats.splice(index, 1)
        // Seat numbers shifted: tell everyone still seated where they sit now.
        lobbyChanged()
        seats.forEach((s, i) => {
          if (s.conn) {
            send(s.conn, {
              v: PROTOCOL_VERSION,
              type: 'welcome',
              seat: i,
              token: s.token as string,
              lobby,
              state: null,
              rev,
              timer: null,
              forced: null,
            })
          }
        })
        return true
      }
      const old: SeatRec | undefined = seats[index]
      if (config.kind === 'remote') {
        if (old?.kind === 'remote') return true // already an open/claimed guest seat
        seats[index] = newSeat('remote', '')
      } else {
        if (old) kick(old, 'kicked', 'The host gave your seat to someone else')
        const rec = newSeat(
          config.kind,
          cleanName(config.name, config.kind === 'ai' ? `AI ${index + 1}` : `플레이어 ${index + 1}`),
        )
        if (config.kind === 'ai') rec.difficulty = config.difficulty ?? 'normal'
        seats[index] = rec
      }
      lobbyChanged()
      return true
    },

    setTurnLimit(seconds) {
      if (closed) return false
      if (started) return fail('bad-lobby', 'The turn limit cannot change during a game')
      if (!isTurnLimit(seconds)) return fail('bad-lobby', 'The turn limit must be null or 10..600 seconds')
      if (seconds === turnLimitSec) return true
      turnLimitSec = seconds
      lobbyChanged()
      return true
    },

    startGame(initialState) {
      if (closed) return false
      if (!initialState || !Array.isArray(initialState.players) || initialState.players.length !== seats.length) {
        return fail('bad-lobby', `The game needs exactly ${seats.length} players, one per seat`)
      }
      if (seats.some((s) => s.kind === 'remote' && s.token === null)) {
        return fail('bad-lobby', 'A guest seat is still empty')
      }
      cancelAuto()
      started = true
      state = initialState
      rev++
      forced = null
      store.set({ lastError: null })
      stateChanged()
      return true
    },

    returnToLobby() {
      if (closed || !started) return
      cancelAuto()
      started = false
      state = null
      rev++
      forced = null
      stateChanged()
    },

    clearError() {
      store.set({ lastError: null })
    },

    retry() {
      if (closed) return
      if (registered) return
      if (opening) sleeper.wake()
      else {
        store.set({ status: everRegistered || resumed ? 'reconnecting' : 'connecting', lastError: null })
        void openRoom()
      }
    },

    close(closeOpts) {
      if (closed) return
      closed = true
      stopLifecycle()
      cancelAuto()
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
      heartbeatTimer = null
      if (tickTimer !== null) clearInterval(tickTimer)
      tickTimer = null
      const l = listener
      listener = null
      registered = false
      const conns = seats.map((s) => s.conn).filter((c): c is Connection => c !== null)
      for (const s of seats) s.conn = null
      emoteListeners.clear()
      if (closeOpts?.forget) {
        removeKey(storage, HOST_STORAGE_KEY)
        for (const c of conns) sendError(c, 'room-closed', 'The host closed the room')
        // Give the goodbye a moment to leave before the channel goes away.
        setTimeout(() => {
          for (const c of conns) c.close()
          l?.close()
        }, GOODBYE_MS)
      } else {
        for (const c of conns) c.close()
        l?.close()
      }
      sleeper.wake()
      store.set({ status: 'disconnected', canAct: false, timer: null })
    },
  }
}
