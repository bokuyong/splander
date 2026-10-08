// Guest side: joins a room by code, mirrors the host's lobby and state, sends
// actions, and keeps trying to get back in when the link drops.

import type { Action, GameState } from '../shared/contract.ts'
import {
  PROTOCOL_VERSION,
  normalizeRoomCode,
  parseHostMessage,
  type GuestMessage,
  type HostMessage,
  type Lobby,
  type NetErrorCode,
} from './protocol.ts'
import { transportErrorCode, type Connection, type Transport } from './transport.ts'
import type { GuestSession, SessionSnapshot } from './types.ts'
import {
  DEFAULT_RETRY_DELAYS_MS,
  browserLifecycle,
  createSleeper,
  createStore,
  defaultStorage,
  errorMessage,
  netError,
  readJson,
  removeKey,
  retryDelay,
  writeJson,
  type KeyValueStorage,
  type Lifecycle,
} from './util.ts'

export const GUEST_STORAGE_PREFIX = 'mg-net:guest:'
export const GUEST_LAST_ROOM_KEY = 'mg-net:guest-last'

const FATAL: ReadonlySet<NetErrorCode> = new Set<NetErrorCode>([
  'version-mismatch',
  'room-full',
  'room-closed',
  'kicked',
])
/** After these the saved token is worthless. */
const FORGET_TOKEN: ReadonlySet<NetErrorCode> = new Set<NetErrorCode>(['room-closed', 'kicked'])

export interface GuestSessionOptions {
  transport: Transport
  /** As typed by the user; it is normalised (case, spaces, dashes). */
  roomCode: string
  name: string
  /** Where the player token is kept. Default: localStorage. */
  storage?: KeyValueStorage
  /** Backoff between reconnect attempts; the last value repeats forever. */
  retryDelaysMs?: readonly number[]
  /**
   * Ping interval. The link counts as dead after 3 silent intervals, and the
   * guest then reconnects. 0 disables. Default 5000.
   */
  heartbeatMs?: number
  /** How long the host may take to answer the probe sent when the page wakes. Default 3000. */
  wakeProbeMs?: number
  lifecycle?: Lifecycle
}

interface SavedGuest {
  token: string
  name: string
}

/** The room this device last joined as a guest, to offer "rejoin" after a reload. */
export interface SavedGuestRoomInfo {
  roomCode: string
  name: string
}

export function getSavedGuestRoom(storage: KeyValueStorage = defaultStorage()): SavedGuestRoomInfo | null {
  const last = readJson<SavedGuestRoomInfo>(storage, GUEST_LAST_ROOM_KEY)
  if (!last || typeof last.roomCode !== 'string') return null
  const saved = readJson<SavedGuest>(storage, GUEST_STORAGE_PREFIX + last.roomCode)
  if (!saved || typeof saved.token !== 'string') return null
  return { roomCode: last.roomCode, name: typeof last.name === 'string' ? last.name : saved.name }
}

export function createGuestSession(opts: GuestSessionOptions): GuestSession {
  const { transport } = opts
  const storage = opts.storage ?? defaultStorage()
  const roomCode = normalizeRoomCode(opts.roomCode)
  const storageKey = GUEST_STORAGE_PREFIX + roomCode
  const retryDelays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const heartbeatMs = opts.heartbeatMs ?? 5000
  const wakeProbeMs = opts.wakeProbeMs ?? 3000
  const sleeper = createSleeper()

  let token: string | null = readJson<SavedGuest>(storage, storageKey)?.token ?? null
  if (typeof token !== 'string') token = null

  let closed = false
  let running = false
  let generation = 0 // bumped whenever the current run loop must die
  let everWelcomed = false
  let conn: Connection | null = null
  let welcomed = false // on the current connection
  let lastHeard = 0
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let probeTimer: ReturnType<typeof setTimeout> | null = null

  // Mirrors of what the host sent last.
  let lobby: Lobby | null = null
  let state: GameState | null = null
  let rev = 0
  let mySeat: number | null = null

  const store = createStore<SessionSnapshot>({
    role: 'guest',
    status: 'connecting',
    roomCode,
    lobby: null,
    state: null,
    rev: 0,
    mySeat: null,
    localSeats: Object.freeze([]),
    canAct: false,
    lastError: null,
  })

  function publish(patch: Partial<SessionSnapshot> = {}): void {
    const status = patch.status ?? store.get().status
    const prevLocals = store.get().localSeats
    const sameLocals = mySeat === null ? prevLocals.length === 0 : prevLocals.length === 1 && prevLocals[0] === mySeat
    store.set({
      lobby,
      state,
      rev,
      mySeat,
      localSeats: sameLocals ? prevLocals : Object.freeze(mySeat === null ? [] : [mySeat]),
      ...patch,
      canAct:
        status === 'connected' && state !== null && state.phase !== 'gameOver' && state.currentPlayer === mySeat,
    })
  }

  function send(msg: GuestMessage): void {
    try {
      conn?.send(msg)
    } catch {
      // the close event follows
    }
  }

  function stopTimers(): void {
    if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
    if (probeTimer !== null) clearTimeout(probeTimer)
    heartbeatTimer = null
    probeTimer = null
  }

  /** Stops for good (until retry()): no more reconnect attempts. */
  function giveUp(code: NetErrorCode, message: string): void {
    running = false
    generation++
    if (FORGET_TOKEN.has(code)) {
      token = null
      removeKey(storage, storageKey)
    }
    const c = conn
    conn = null
    welcomed = false
    stopTimers()
    c?.close()
    sleeper.wake()
    publish({ status: 'disconnected', lastError: netError(code, message) })
  }

  function handleMessage(from: Connection, raw: unknown): void {
    if (closed || from !== conn) return
    lastHeard = Date.now()
    const parsed = parseHostMessage(raw)
    if (!parsed.ok) {
      if (parsed.reason === 'version') {
        giveUp(
          'version-mismatch',
          `Host speaks protocol v${parsed.theirs}, this device v${PROTOCOL_VERSION}. Reload both devices.`,
        )
      }
      return // malformed: ignore
    }
    const msg: HostMessage = parsed.msg
    switch (msg.type) {
      case 'welcome':
        welcomed = true
        everWelcomed = true
        token = msg.token
        mySeat = msg.seat
        lobby = msg.lobby
        state = msg.state
        rev = msg.rev
        writeJson(storage, storageKey, { token, name: opts.name } satisfies SavedGuest)
        writeJson(storage, GUEST_LAST_ROOM_KEY, { roomCode, name: opts.name } satisfies SavedGuestRoomInfo)
        publish({ status: 'connected', lastError: null })
        return
      case 'lobby':
        lobby = msg.lobby
        publish()
        return
      case 'state':
        // Revisions only go up; an older one is a late duplicate.
        if (msg.rev < rev) return
        state = msg.state
        rev = msg.rev
        publish()
        return
      case 'error':
        if (FATAL.has(msg.code)) giveUp(msg.code, msg.message)
        else publish({ lastError: netError(msg.code, msg.message) })
        return
      case 'pong':
        return
    }
  }

  function startHeartbeat(c: Connection): void {
    if (heartbeatMs <= 0) return
    heartbeatTimer = setInterval(() => {
      if (conn !== c) return
      if (Date.now() - lastHeard > heartbeatMs * 3) {
        c.close() // silent link: the run loop reconnects
        return
      }
      send({ v: PROTOCOL_VERSION, type: 'ping' })
    }, heartbeatMs)
  }

  async function run(): Promise<void> {
    if (running || closed) return
    running = true
    const gen = ++generation
    const alive = () => gen === generation && !closed
    let attempt = 0
    while (alive()) {
      publish({ status: attempt === 0 && !everWelcomed ? 'connecting' : 'reconnecting' })
      let c: Connection
      try {
        c = await transport.connect(roomCode)
      } catch (e) {
        if (!alive()) return
        const code = transportErrorCode(e)
        // Someone who was never in this room gets a quick, clear answer.
        // Someone with a seat keeps trying: the host may just be reloading.
        const known = everWelcomed || token !== null
        if (!known && (code === 'room-not-found' || attempt >= 2)) {
          giveUp(
            code === 'room-not-found' ? 'room-not-found' : 'network',
            code === 'room-not-found' ? `No room with code ${roomCode}` : `Could not reach the room: ${errorMessage(e)}`,
          )
          return
        }
        publish({ status: 'reconnecting' })
        await sleeper.sleep(retryDelay(retryDelays, attempt))
        attempt++
        continue
      }
      if (!alive()) {
        c.close()
        return
      }

      conn = c
      welcomed = false
      lastHeard = Date.now()
      const closedPromise = new Promise<void>((resolve) => c.onClose(resolve))
      c.onMessage((raw) => handleMessage(c, raw))
      const hello: GuestMessage = { v: PROTOCOL_VERSION, type: 'hello', name: opts.name }
      if (token) hello.token = token
      send(hello)
      startHeartbeat(c)

      await closedPromise
      const wasWelcomed = welcomed
      if (conn === c) {
        conn = null
        welcomed = false
        stopTimers()
      }
      if (!alive()) return
      if (wasWelcomed) attempt = 0
      publish({ status: 'reconnecting' })
      await sleeper.sleep(retryDelay(retryDelays, attempt))
      attempt++
    }
  }

  const stopLifecycle = (opts.lifecycle ?? browserLifecycle).onWake(() => {
    if (closed || !running) return
    const c = conn
    if (!c) {
      sleeper.wake() // waiting out a backoff: try right now
      return
    }
    if (!welcomed) return
    // The page slept. Ask for the truth again, and make sure the link is alive:
    // mobile browsers kill data channels without telling the page.
    const askedAt = Date.now()
    send({ v: PROTOCOL_VERSION, type: 'sync' })
    if (probeTimer !== null) clearTimeout(probeTimer)
    probeTimer = setTimeout(() => {
      probeTimer = null
      if (conn === c && lastHeard < askedAt) c.close()
    }, wakeProbeMs)
  })

  void run()

  return {
    subscribe: store.subscribe,
    getSnapshot: store.get,

    sendAction(action: Action) {
      const snap = store.get()
      if (closed || !conn || !welcomed || snap.status !== 'connected') {
        publish({ lastError: netError('not-connected', 'Not connected to the host') })
        return false
      }
      if (!state) {
        publish({ lastError: netError('not-started', 'The game has not started') })
        return false
      }
      publish({ lastError: null })
      send({ v: PROTOCOL_VERSION, type: 'action', action, rev })
      return true
    },

    clearError() {
      store.set({ lastError: null })
    },

    retry() {
      if (closed) return
      if (running) sleeper.wake()
      else {
        store.set({ lastError: null })
        void run()
      }
    },

    close(closeOpts) {
      if (closed) return
      if (closeOpts?.forget) {
        if (conn && welcomed) send({ v: PROTOCOL_VERSION, type: 'leave' })
        removeKey(storage, storageKey)
        const last = readJson<SavedGuestRoomInfo>(storage, GUEST_LAST_ROOM_KEY)
        if (last?.roomCode === roomCode) removeKey(storage, GUEST_LAST_ROOM_KEY)
      }
      closed = true
      running = false
      generation++
      stopLifecycle()
      stopTimers()
      const c = conn
      conn = null
      welcomed = false
      if (c) {
        // With `forget` the host closes the channel after reading 'leave';
        // close it ourselves shortly after in case it does not.
        if (closeOpts?.forget) setTimeout(() => c.close(), 150)
        else c.close()
      }
      sleeper.wake()
      publish({ status: 'disconnected' })
    },
  }
}
