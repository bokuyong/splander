// Host side: owns the room, the lobby and the authoritative GameState.

import type { Action, Difficulty, GameState } from '../shared/contract.ts'
import {
  PROTOCOL_VERSION,
  generateRoomCode,
  isValidRoomCode,
  parseGuestMessage,
  type HostMessage,
  type Lobby,
  type LobbySeat,
  type NetError,
  type NetErrorCode,
  type SeatKind,
} from './protocol.ts'
import { redactStateFor } from './redact.ts'
import { transportErrorCode, type Connection, type RoomListener, type Transport } from './transport.ts'
import type { HostSession, SessionSnapshot } from './types.ts'
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
   * for the AI's seat, so it cannot peek. Without it AI seats never move.
   */
  chooseAiAction?: (state: GameState, difficulty: Difficulty) => Action | Promise<Action>
  /** Pause before each AI move, so humans can follow. Default 900. */
  aiDelayMs?: number
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
  lifecycle?: Lifecycle
  /** Test hooks. */
  random?: () => number
  generateToken?: () => string
}

interface SeatRec {
  kind: SeatKind
  name: string
  difficulty?: Difficulty
  /** remote seats only: the secret of the guest holding the seat. */
  token: string | null
  conn: Connection | null
  lastSeen: number
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

export function createHostSession(opts: HostSessionOptions): HostSession {
  const { transport, applyAction } = opts
  const storage = opts.storage ?? defaultStorage()
  const aiDelayMs = opts.aiDelayMs ?? 900
  const retryDelays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const heartbeatMs = opts.heartbeatMs ?? 5000
  const newToken = opts.generateToken ?? defaultGenerateToken
  const random = opts.random ?? Math.random
  const sleeper = createSleeper()

  // ---- authoritative data ----
  let seats: SeatRec[]
  let started = false
  let state: GameState | null = null
  let rev = 0
  let roomCode: string
  let resumed = false

  const saved = opts.resume ? loadSavedRoom(storage) : null
  if (saved) {
    resumed = true
    roomCode = saved.roomCode
    seats = saved.seats.map((s) => ({ ...s, conn: null, lastSeen: 0 }))
    started = saved.started && saved.state !== null
    state = started ? saved.state : null
    rev = saved.rev
  } else {
    roomCode = generateRoomCode(random)
    seats = [
      { kind: 'local', name: cleanName(opts.hostName ?? '', '방장'), token: null, conn: null, lastSeen: 0 },
      { kind: 'remote', name: '', token: null, conn: null, lastSeen: 0 },
    ]
  }

  // ---- runtime ----
  let closed = false
  let registered = false // the room is currently reachable under roomCode
  let everRegistered = false
  let opening = false
  let listener: RoomListener | null = null
  let aiTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  // ---- derived views (cached so snapshots stay referentially stable) ----
  let lobbyJson = ''
  let lobby: Lobby = buildLobby()
  lobbyJson = JSON.stringify(lobby)
  let viewOf: GameState | null = null
  let viewSeat = -2
  let view: GameState | null = null

  function buildLobby(): Lobby {
    return {
      roomCode,
      started,
      seats: seats.map((s): LobbySeat => {
        const seat: LobbySeat = {
          kind: s.kind,
          name: s.name,
          claimed: s.kind !== 'remote' || s.token !== null,
          online: s.kind !== 'remote' || s.conn !== null,
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
    send(conn, { v: PROTOCOL_VERSION, type: 'state', state: state ? redactStateFor(state, seat) : null, rev })
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

  /** After any game-state change. */
  function stateChanged(): void {
    persist()
    if (publish()) broadcastLobby()
    broadcastState()
    scheduleAi()
  }

  function closeSoon(conn: Connection): void {
    setTimeout(() => conn.close(), GOODBYE_MS)
  }

  function kick(seat: SeatRec, code: NetErrorCode, message: string): void {
    const conn = seat.conn
    seat.conn = null
    if (conn) {
      sendError(conn, code, message)
      closeSoon(conn)
    }
  }

  // ---- game ----

  function tryApply(action: Action): NetError | null {
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
    stateChanged()
    return null
  }

  function scheduleAi(): void {
    const choose = opts.chooseAiAction
    if (aiTimer !== null || closed || !choose || !state || state.phase === 'gameOver') return
    const seat = seats[state.currentPlayer]
    if (!seat || seat.kind !== 'ai') return
    const atRev = rev
    aiTimer = setTimeout(() => {
      aiTimer = null
      void playAi(choose, atRev)
    }, aiDelayMs)
  }

  async function playAi(choose: NonNullable<HostSessionOptions['chooseAiAction']>, atRev: number): Promise<void> {
    if (closed || !state) return
    if (rev !== atRev) return scheduleAi()
    const seatIndex = state.currentPlayer
    let action: Action
    try {
      action = await choose(redactStateFor(state, seatIndex), seats[seatIndex]?.difficulty ?? 'normal')
    } catch (e) {
      store.set({ lastError: netError('ai-failed', `AI could not choose: ${errorMessage(e)}`) })
      return
    }
    if (closed) return
    if (rev !== atRev) return scheduleAi()
    const err = tryApply(action)
    if (err) store.set({ lastError: netError('ai-failed', `AI chose an illegal action: ${err.message}`) })
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
      seats[i].conn = null
      if (publish()) broadcastLobby()
    })
  }

  function handleMessage(conn: Connection, raw: unknown): void {
    if (closed) return
    const parsed = parseGuestMessage(raw)
    if (!parsed.ok) {
      if (parsed.reason === 'version') {
        const i = seatOf(conn)
        if (i !== -1) seats[i].conn = null
        sendError(
          conn,
          'version-mismatch',
          `Host speaks protocol v${PROTOCOL_VERSION}, guest v${parsed.theirs}. Reload both devices.`,
        )
        closeSoon(conn)
        if (i !== -1 && publish()) broadcastLobby()
      } else {
        sendError(conn, 'bad-message', 'Malformed message')
      }
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
        seat.conn = null
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
    })
    if (changed) for (const s of seats) if (s.conn && s.conn !== conn) send(s.conn, { v: PROTOCOL_VERSION, type: 'lobby', lobby })
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
          scheduleAi()
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
        s.conn = null
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
            })
          }
        })
        return true
      }
      const old: SeatRec | undefined = seats[index]
      if (config.kind === 'remote') {
        if (old?.kind === 'remote') return true // already an open/claimed guest seat
        seats[index] = { kind: 'remote', name: '', token: null, conn: null, lastSeen: 0 }
      } else {
        if (old) kick(old, 'kicked', 'The host gave your seat to someone else')
        const rec: SeatRec = {
          kind: config.kind,
          name: cleanName(config.name, config.kind === 'ai' ? `AI ${index + 1}` : `플레이어 ${index + 1}`),
          token: null,
          conn: null,
          lastSeen: 0,
        }
        if (config.kind === 'ai') rec.difficulty = config.difficulty ?? 'normal'
        seats[index] = rec
      }
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
      if (aiTimer !== null) {
        clearTimeout(aiTimer)
        aiTimer = null
      }
      started = true
      state = initialState
      rev++
      store.set({ lastError: null })
      stateChanged()
      return true
    },

    returnToLobby() {
      if (closed || !started) return
      if (aiTimer !== null) {
        clearTimeout(aiTimer)
        aiTimer = null
      }
      started = false
      state = null
      rev++
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
      if (aiTimer !== null) clearTimeout(aiTimer)
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
      aiTimer = null
      heartbeatTimer = null
      const l = listener
      listener = null
      registered = false
      const conns = seats.map((s) => s.conn).filter((c): c is Connection => c !== null)
      for (const s of seats) s.conn = null
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
      store.set({ status: 'disconnected', canAct: false })
    },
  }
}
