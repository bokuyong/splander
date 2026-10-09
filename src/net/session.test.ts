import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../shared/contract.ts'
import { GUEST_STORAGE_PREFIX, createGuestSession, getSavedGuestRoom, type GuestSessionOptions } from './guest.ts'
import {
  EMOTE_MIN_INTERVAL_MS,
  HOST_STORAGE_KEY,
  createHostSession,
  getSavedHostRoom,
  type HostSessionOptions,
} from './host.ts'
import { PROTOCOL_VERSION, isValidRoomCode, type HostMessage } from './protocol.ts'
import { isHiddenCard } from './redact.ts'
import { fakeApplyAction, fakeLifecycle, fakeState, settle, until } from './testkit.ts'
import { createMemoryNetwork, type MemoryNetwork } from './transport.ts'
import type { GuestSession, HostSession, Session } from './types.ts'
import { createMemoryStorage, type KeyValueStorage } from './util.ts'

const open: Session[] = []
afterEach(() => {
  for (const s of open.splice(0)) s.close()
})

function makeHost(net: MemoryNetwork, storage: KeyValueStorage, extra: Partial<HostSessionOptions> = {}): HostSession {
  const s = createHostSession({
    transport: net,
    applyAction: fakeApplyAction,
    storage,
    hostName: 'Hana',
    heartbeatMs: 0,
    aiDelayMs: 0,
    retryDelaysMs: [1],
    lifecycle: fakeLifecycle(),
    ...extra,
  })
  open.push(s)
  return s
}

function makeGuest(
  net: MemoryNetwork,
  roomCode: string,
  name: string,
  storage: KeyValueStorage,
  extra: Partial<GuestSessionOptions> = {},
): GuestSession {
  const s = createGuestSession({
    transport: net,
    roomCode,
    name,
    storage,
    heartbeatMs: 0,
    retryDelaysMs: [1],
    lifecycle: fakeLifecycle(),
    ...extra,
  })
  open.push(s)
  return s
}

async function hostedRoom(extra: Partial<HostSessionOptions> = {}) {
  const net = createMemoryNetwork()
  const hostStorage = createMemoryStorage()
  const host = makeHost(net, hostStorage, extra)
  await until(() => host.getSnapshot().status === 'connected', 'host connected')
  const code = host.getSnapshot().roomCode as string
  return { net, hostStorage, host, code }
}

/** Host + one joined guest, game not started. */
async function pair(extra: Partial<HostSessionOptions> = {}) {
  const room = await hostedRoom(extra)
  const guestStorage = createMemoryStorage()
  const guest = makeGuest(room.net, room.code, 'Jiho', guestStorage)
  await until(() => guest.getSnapshot().status === 'connected', 'guest connected')
  return { ...room, guest, guestStorage }
}

/** A bare connection speaking the protocol by hand (a buggy or hostile client). */
async function rawClient(net: MemoryNetwork, code: string) {
  const conn = await net.connect(code)
  const inbox: HostMessage[] = []
  conn.onMessage((m) => inbox.push(m as HostMessage))
  return { conn, inbox }
}

const hostState = (host: HostSession): GameState => host.getSnapshot().state as GameState

describe('room creation', () => {
  it('registers a room under a 5-character unambiguous code', async () => {
    const { net, host, code } = await hostedRoom()
    expect(isValidRoomCode(code)).toBe(true)
    expect(code).toHaveLength(5)
    expect(net.rooms()).toEqual([code])
    const snap = host.getSnapshot()
    expect(snap.role).toBe('host')
    expect(snap.mySeat).toBe(0)
    expect(snap.lobby?.seats).toEqual([
      { kind: 'local', name: 'Hana', claimed: true, online: true },
      { kind: 'remote', name: '', claimed: false, online: false },
    ])
  })

  it('picks another code when the first one is taken', async () => {
    const net = createMemoryNetwork()
    await net.listen('AAAAA', () => {})
    // random() === 0 yields 'A'; the first 5 draws collide, later ones do not.
    let draws = 0
    const host = makeHost(net, createMemoryStorage(), { random: () => (draws++ < 5 ? 0 : 0.5) })
    expect(host.getSnapshot().roomCode).toBeNull()
    await until(() => host.getSnapshot().status === 'connected', 'host connected')
    const code = host.getSnapshot().roomCode
    expect(code).not.toBe('AAAAA')
    expect(net.rooms()).toContain(code)
    expect(host.getSnapshot().lobby?.roomCode).toBe(code)
  })

  it('reports failure when the network is down', async () => {
    const net = createMemoryNetwork()
    net.offline = true
    const host = makeHost(net, createMemoryStorage())
    await until(() => host.getSnapshot().status === 'disconnected', 'host gave up')
    expect(host.getSnapshot().lastError?.code).toBe('network')
    net.offline = false
    host.retry()
    await until(() => host.getSnapshot().status === 'connected', 'host connected after retry')
  })
})

describe('join flow', () => {
  it('seats a guest and tells both sides', async () => {
    const { host, guest, guestStorage, code } = await pair()
    const g = guest.getSnapshot()
    expect(g.role).toBe('guest')
    expect(g.mySeat).toBe(1)
    expect(g.localSeats).toEqual([1])
    expect(g.roomCode).toBe(code)
    expect(g.state).toBeNull()
    expect(g.lobby?.seats[1]).toEqual({ kind: 'remote', name: 'Jiho', claimed: true, online: true })
    expect(g.lobby?.started).toBe(false)
    await until(() => host.getSnapshot().lobby?.seats[1].online === true, 'host sees guest')
    expect(host.getSnapshot().lobby).toEqual(g.lobby)
    // The secret token is stored for later reconnects, and never appears in the lobby.
    const saved = JSON.parse(guestStorage.getItem(GUEST_STORAGE_PREFIX + code) as string)
    expect(typeof saved.token).toBe('string')
    expect(saved.token.length).toBeGreaterThanOrEqual(16)
    expect(JSON.stringify(g.lobby)).not.toContain(saved.token)
    expect(getSavedGuestRoom(guestStorage)).toEqual({ roomCode: code, name: 'Jiho' })
  })

  it('accepts a sloppily typed code', async () => {
    const { net, code } = await hostedRoom()
    const guest = makeGuest(net, ` ${code.slice(0, 2).toLowerCase()}-${code.slice(2).toLowerCase()} `, 'Jiho', createMemoryStorage())
    await until(() => guest.getSnapshot().status === 'connected', 'guest connected')
    expect(guest.getSnapshot().roomCode).toBe(code)
  })

  it('rejects an unknown room without retrying forever', async () => {
    const net = createMemoryNetwork()
    const guest = makeGuest(net, 'ZZZZZ', 'Jiho', createMemoryStorage())
    await until(() => guest.getSnapshot().status === 'disconnected', 'guest gave up')
    expect(guest.getSnapshot().lastError?.code).toBe('room-not-found')
  })

  it('rejects a second guest when there is one guest seat', async () => {
    const { net, code, host } = await pair()
    const late = makeGuest(net, code, 'Late', createMemoryStorage())
    await until(() => late.getSnapshot().status === 'disconnected', 'late guest rejected')
    expect(late.getSnapshot().lastError?.code).toBe('room-full')
    expect(late.getSnapshot().mySeat).toBeNull()
    expect(host.getSnapshot().lobby?.seats[1].name).toBe('Jiho')
  })

  it('lets the host reshape the lobby, kicking a replaced guest', async () => {
    const { host, guest, guestStorage, code } = await pair()
    expect(host.setSeat(2, { kind: 'ai', name: 'Bunny', difficulty: 'hard' })).toBe(true)
    await until(() => guest.getSnapshot().lobby?.seats.length === 3, 'guest sees 3 seats')
    expect(guest.getSnapshot().lobby?.seats[2]).toEqual({
      kind: 'ai',
      name: 'Bunny',
      difficulty: 'hard',
      claimed: true,
      online: true,
    })
    expect(host.setSeat(1, { kind: 'local', name: 'Mina' })).toBe(true)
    await until(() => guest.getSnapshot().status === 'disconnected', 'guest kicked')
    expect(guest.getSnapshot().lastError?.code).toBe('kicked')
    expect(guestStorage.getItem(GUEST_STORAGE_PREFIX + code)).toBeNull()
    expect(host.getSnapshot().localSeats).toEqual([0, 1])
    // Limits.
    expect(host.setSeat(3, { kind: 'remote' })).toBe(true)
    expect(host.setSeat(4, { kind: 'remote' })).toBe(false)
    expect(host.getSnapshot().lastError?.code).toBe('bad-lobby')
    expect(host.setSeat(3, null)).toBe(true)
    expect(host.setSeat(2, null)).toBe(true)
    expect(host.setSeat(1, null)).toBe(false)
    expect(host.getSnapshot().lobby?.seats).toHaveLength(2)
  })

  it('refuses to start with an empty guest seat or a wrong player count', async () => {
    const { host } = await hostedRoom()
    expect(host.startGame(fakeState(2))).toBe(false)
    expect(host.getSnapshot().lastError?.code).toBe('bad-lobby')
    host.setSeat(1, { kind: 'local', name: 'Mina' })
    expect(host.startGame(fakeState(3))).toBe(false)
    expect(host.startGame(fakeState(2))).toBe(true)
    expect(host.getSnapshot().lobby?.started).toBe(true)
    expect(host.setSeat(1, { kind: 'remote' })).toBe(false)
  })
})

describe('playing', () => {
  it('broadcasts the state after start and after every action', async () => {
    const { host, guest } = await pair()
    expect(host.startGame(fakeState())).toBe(true)
    await until(() => guest.getSnapshot().state !== null, 'guest got state')
    expect(guest.getSnapshot().lobby?.started).toBe(true)
    expect(guest.getSnapshot().canAct).toBe(false)
    expect(host.getSnapshot().canAct).toBe(true)

    const rev0 = host.getSnapshot().rev
    expect(host.sendAction({ type: 'pass' })).toBe(true)
    expect(host.getSnapshot().rev).toBe(rev0 + 1)
    await until(() => guest.getSnapshot().state?.currentPlayer === 1, 'guest sees its turn')
    expect(guest.getSnapshot().rev).toBe(rev0 + 1)
    expect(guest.getSnapshot().canAct).toBe(true)
    expect(host.getSnapshot().canAct).toBe(false)

    expect(guest.sendAction({ type: 'pass' })).toBe(true)
    await until(() => hostState(host).currentPlayer === 0, 'host applied guest action')
    await until(() => guest.getSnapshot().state?.currentPlayer === 0, 'guest got the result')
    expect(hostState(host).turn).toBe(2)
    expect(guest.getSnapshot().state?.lastAction).toEqual({ player: 1, action: { type: 'pass' } })
    expect(guest.getSnapshot().lastError).toBeNull()
  })

  it('only lets the owner of the current seat act', async () => {
    const { net, host, guest, code } = await pair()
    host.startGame(fakeState())
    await until(() => guest.getSnapshot().state !== null, 'guest got state')

    // Seat 0 (the host) is to move; the guest tries anyway.
    expect(guest.sendAction({ type: 'pass' })).toBe(true) // "sent", not "accepted"
    await until(() => guest.getSnapshot().lastError !== null, 'guest got an error')
    expect(guest.getSnapshot().lastError?.code).toBe('not-your-turn')
    expect(hostState(host).currentPlayer).toBe(0)
    expect(hostState(host).turn).toBe(0)

    // A connection that never said hello owns no seat at all.
    const stranger = await rawClient(net, code)
    stranger.conn.send({ v: PROTOCOL_VERSION, type: 'action', action: { type: 'pass' }, rev: host.getSnapshot().rev })
    await until(() => stranger.inbox.length > 0, 'stranger answered')
    expect(stranger.inbox[0]).toMatchObject({ type: 'error', code: 'bad-message' })
    expect(hostState(host).turn).toBe(0)

    // And the host cannot move for the guest.
    host.sendAction({ type: 'pass' })
    expect(hostState(host).currentPlayer).toBe(1)
    expect(host.sendAction({ type: 'pass' })).toBe(false)
    expect(host.getSnapshot().lastError?.code).toBe('not-your-turn')
    expect(hostState(host).currentPlayer).toBe(1)
  })

  it('keeps two guests from playing each other’s seat', async () => {
    const { net, host, code } = await hostedRoom()
    host.setSeat(2, { kind: 'remote' })
    const a = makeGuest(net, code, 'A', createMemoryStorage())
    await until(() => a.getSnapshot().status === 'connected', 'A connected')
    const b = makeGuest(net, code, 'B', createMemoryStorage())
    await until(() => b.getSnapshot().status === 'connected', 'B connected')
    expect([a.getSnapshot().mySeat, b.getSnapshot().mySeat]).toEqual([1, 2])
    host.startGame(fakeState(3))
    host.sendAction({ type: 'pass' }) // now seat 1 (A) is to move
    await until(() => b.getSnapshot().state?.currentPlayer === 1, 'B sees A to move')
    expect(b.getSnapshot().canAct).toBe(false)
    b.sendAction({ type: 'pass' })
    await until(() => b.getSnapshot().lastError !== null, 'B refused')
    expect(b.getSnapshot().lastError?.code).toBe('not-your-turn')
    expect(hostState(host).currentPlayer).toBe(1)
    a.sendAction({ type: 'pass' })
    await until(() => hostState(host).currentPlayer === 2, 'A moved')
  })

  it('answers an illegal action with an error and keeps the state', async () => {
    const { host, guest, hostStorage } = await pair()
    host.startGame(fakeState())
    host.sendAction({ type: 'pass' })
    await until(() => guest.getSnapshot().canAct, 'guest to move')
    const before = hostState(host)
    const revBefore = host.getSnapshot().rev
    const savedBefore = hostStorage.getItem(HOST_STORAGE_KEY)

    guest.sendAction({ type: 'takeSame', color: 'red' }) // the fake engine throws on this
    await until(() => guest.getSnapshot().lastError !== null, 'guest got an error')
    expect(guest.getSnapshot().lastError).toEqual({ code: 'illegal-action', message: 'illegal action: takeSame' })
    expect(hostState(host)).toBe(before)
    expect(host.getSnapshot().rev).toBe(revBefore)
    expect(hostStorage.getItem(HOST_STORAGE_KEY)).toBe(savedBefore)
    expect(guest.getSnapshot().canAct).toBe(true)

    // The guest can simply try again; the error clears.
    guest.sendAction({ type: 'pass' })
    expect(guest.getSnapshot().lastError).toBeNull()
    await until(() => hostState(host).currentPlayer === 0, 'legal action applied')

    // Same for the host's own illegal action.
    expect(host.sendAction({ type: 'takeSame', color: 'red' })).toBe(false)
    expect(host.getSnapshot().lastError?.code).toBe('illegal-action')
    expect(hostState(host).currentPlayer).toBe(0)
    host.clearError()
    expect(host.getSnapshot().lastError).toBeNull()
  })

  it('rejects an action based on an outdated state', async () => {
    const { net, host, code } = await hostedRoom()
    const client = await rawClient(net, code)
    client.conn.send({ v: PROTOCOL_VERSION, type: 'hello', name: 'Raw' })
    await until(() => client.inbox.some((m) => m.type === 'welcome'), 'welcome')
    host.startGame(fakeState())
    host.sendAction({ type: 'pass' })
    const staleRev = host.getSnapshot().rev - 1
    await settle() // let the broadcasts of start + pass arrive first
    client.inbox.length = 0
    client.conn.send({ v: PROTOCOL_VERSION, type: 'action', action: { type: 'pass' }, rev: staleRev })
    await until(() => client.inbox.some((m) => m.type === 'error'), 'error')
    expect(client.inbox.find((m) => m.type === 'error')).toMatchObject({ code: 'stale-state' })
    // The current state is re-sent so the client can catch up.
    expect(client.inbox.find((m) => m.type === 'state')).toMatchObject({ rev: host.getSnapshot().rev })
    expect(hostState(host).currentPlayer).toBe(1)
  })

  it('refuses actions before the game starts and after it ends', async () => {
    const { host, guest } = await pair()
    expect(host.sendAction({ type: 'pass' })).toBe(false)
    expect(host.getSnapshot().lastError?.code).toBe('not-started')
    expect(guest.sendAction({ type: 'pass' })).toBe(false)
    expect(guest.getSnapshot().lastError?.code).toBe('not-started')
    host.startGame(fakeState())
    host.sendAction({ type: 'chooseNoble', nobleId: 'end' })
    expect(hostState(host).phase).toBe('gameOver')
    expect(host.getSnapshot().canAct).toBe(false)
    expect(host.sendAction({ type: 'pass' })).toBe(false)
    await until(() => guest.getSnapshot().state?.phase === 'gameOver', 'guest sees the end')
    expect(guest.getSnapshot().state?.winners).toEqual([0])
    // Rematch, then back to the lobby.
    expect(host.startGame(fakeState())).toBe(true)
    await until(() => guest.getSnapshot().state?.phase === 'action', 'guest sees the rematch')
    host.returnToLobby()
    await until(() => guest.getSnapshot().state === null, 'guest back in lobby')
    expect(guest.getSnapshot().lobby?.started).toBe(false)
  })
})

describe('hidden information on the wire', () => {
  it('sends each device only what its seat may see', async () => {
    const { net, host, guest } = await pair()
    host.startGame(fakeState())
    host.sendAction({ type: 'reserveDeck', tier: 1 }) // host blind-reserves t1-01
    await until(() => guest.getSnapshot().canAct, 'guest to move')
    guest.sendAction({ type: 'reserveDeck', tier: 2 }) // guest blind-reserves t2-01
    await until(() => guest.getSnapshot().state?.currentPlayer === 0, 'guest move applied')

    const g = guest.getSnapshot().state as GameState
    const h = hostState(host)
    // Guest: own blind card visible, host's hidden; decks hidden but counted.
    expect(g.players[1].reserved).toEqual([{ card: expect.objectContaining({ id: 't2-01' }), fromDeck: true }])
    expect(g.players[0].reserved).toHaveLength(1)
    expect(isHiddenCard(g.players[0].reserved[0].card)).toBe(true)
    expect(g.players[0].reserved[0].card.tier).toBe(1)
    expect(g.decks[1]).toHaveLength(2)
    expect(g.decks[1].every(isHiddenCard)).toBe(true)
    expect(g.rngState).toBe(0)
    expect(g.board[1][0]?.id).toBe('t1-10')
    // Host UI: the mirror image.
    expect(h.players[0].reserved[0].card.id).toBe('t1-01')
    expect(isHiddenCard(h.players[1].reserved[0].card)).toBe(true)
    expect(h.decks[2].every(isHiddenCard)).toBe(true)

    // Nothing that ever crossed the network names a deck card or the host's
    // blind card. (t2-01 legitimately travels: it is the guest's own.)
    const wire = JSON.stringify(net.sent)
    for (const secret of ['t1-01', 't1-02', 't1-03', 't2-02', 't3-01', '12345']) {
      expect(wire).not.toContain(secret)
    }
    expect(wire).toContain('t2-01')
  })
})

describe('guest reconnection', () => {
  it('gets the same seat and the latest state after a dropped link', async () => {
    const { net, host, guest, code } = await pair()
    host.startGame(fakeState())
    await until(() => guest.getSnapshot().state !== null, 'guest got state')

    net.offline = true // the guest cannot come back yet
    net.dropConnections(code)
    await until(() => guest.getSnapshot().status === 'reconnecting', 'guest reconnecting')
    await until(() => host.getSnapshot().lobby?.seats[1].online === false, 'host sees guest offline')
    expect(host.getSnapshot().lobby?.seats[1].claimed).toBe(true)
    expect(guest.getSnapshot().canAct).toBe(false)
    expect(guest.sendAction({ type: 'pass' })).toBe(false)
    expect(guest.getSnapshot().lastError?.code).toBe('not-connected')

    host.sendAction({ type: 'pass' }) // the game moves on while the guest is away
    expect(guest.getSnapshot().state?.currentPlayer).toBe(0)

    net.offline = false
    await until(() => guest.getSnapshot().status === 'connected', 'guest back')
    expect(guest.getSnapshot().mySeat).toBe(1)
    expect(guest.getSnapshot().state?.currentPlayer).toBe(1)
    expect(guest.getSnapshot().rev).toBe(host.getSnapshot().rev)
    expect(guest.getSnapshot().lastError).toBeNull()
    await until(() => host.getSnapshot().lobby?.seats[1].online === true, 'host sees guest online')
    guest.sendAction({ type: 'pass' })
    await until(() => hostState(host).currentPlayer === 0, 'guest can play again')
  })

  it('gets the same seat after a page reload, thanks to the stored token', async () => {
    const { net, host, guest, guestStorage, code } = await pair()
    host.startGame(fakeState())
    host.sendAction({ type: 'reserveDeck', tier: 1 })
    await until(() => guest.getSnapshot().canAct, 'guest to move')
    guest.close() // page unload: the token stays in storage
    await until(() => host.getSnapshot().lobby?.seats[1].online === false, 'host sees guest offline')

    const saved = getSavedGuestRoom(guestStorage)
    expect(saved).toEqual({ roomCode: code, name: 'Jiho' })
    const again = makeGuest(net, code, 'Jiho', guestStorage)
    await until(() => again.getSnapshot().status === 'connected', 'guest back')
    expect(again.getSnapshot().mySeat).toBe(1)
    expect(again.getSnapshot().canAct).toBe(true)
    expect(again.getSnapshot().state?.turn).toBe(1)

    // Without the token the room is full: the seat cannot be stolen.
    const thief = makeGuest(net, code, 'Jiho', createMemoryStorage())
    await until(() => thief.getSnapshot().status === 'disconnected', 'thief rejected')
    expect(thief.getSnapshot().lastError?.code).toBe('room-full')
    expect(again.getSnapshot().status).toBe('connected')
  })

  it('resyncs when the page wakes up, and reconnects if the link died silently', async () => {
    const room = await hostedRoom()
    const lifecycle = fakeLifecycle()
    const guest = makeGuest(room.net, room.code, 'Jiho', createMemoryStorage(), { lifecycle, wakeProbeMs: 20 })
    await until(() => guest.getSnapshot().status === 'connected', 'guest connected')

    // Healthy link: waking asks for a resync and nothing else happens.
    room.net.sent.length = 0
    lifecycle.wake()
    await settle(40)
    expect(room.net.sent).toContainEqual({ v: PROTOCOL_VERSION, type: 'sync' })
    expect(room.net.sent.filter((m) => (m as HostMessage).type === 'lobby')).toHaveLength(1)
    expect(guest.getSnapshot().status).toBe('connected')

    // Dead link that nobody reported (screen lock): messages vanish.
    room.net.blackhole = true
    room.host.setSeat(2, { kind: 'ai', name: 'Bunny' }) // an update the guest misses
    lifecycle.wake()
    await until(() => guest.getSnapshot().status === 'reconnecting', 'guest noticed the dead link')
    room.net.blackhole = false
    await until(() => guest.getSnapshot().status === 'connected', 'guest back')
    expect(guest.getSnapshot().lobby?.seats).toHaveLength(3)
    expect(guest.getSnapshot().mySeat).toBe(1)
  })

  it('detects a silent link through the heartbeat', async () => {
    const room = await hostedRoom({ heartbeatMs: 10 })
    const guest = makeGuest(room.net, room.code, 'Jiho', createMemoryStorage(), { heartbeatMs: 10 })
    await until(() => guest.getSnapshot().status === 'connected', 'guest connected')
    await settle(60) // several heartbeats on a healthy link: nothing drops
    expect(guest.getSnapshot().status).toBe('connected')
    expect(room.host.getSnapshot().lobby?.seats[1].online).toBe(true)

    room.net.blackhole = true
    await until(() => room.host.getSnapshot().lobby?.seats[1].online === false, 'host marks guest offline')
    await until(() => guest.getSnapshot().status === 'reconnecting', 'guest reconnecting')
    room.net.blackhole = false
    await until(() => guest.getSnapshot().status === 'connected', 'guest back')
    await until(() => room.host.getSnapshot().lobby?.seats[1].online === true, 'host sees guest online')
  })

  it('frees the seat when a guest leaves for good in the lobby', async () => {
    const { net, host, guest, guestStorage, code } = await pair()
    guest.close({ forget: true })
    await until(() => host.getSnapshot().lobby?.seats[1].claimed === false, 'seat freed')
    expect(host.getSnapshot().lobby?.seats[1].name).toBe('')
    expect(guestStorage.getItem(GUEST_STORAGE_PREFIX + code)).toBeNull()
    expect(getSavedGuestRoom(guestStorage)).toBeNull()
    const other = makeGuest(net, code, 'Other', createMemoryStorage())
    await until(() => other.getSnapshot().status === 'connected', 'someone else can join')
    expect(other.getSnapshot().mySeat).toBe(1)
  })
})

describe('host restore', () => {
  it('re-creates the room from storage under the same code and resumes the game', async () => {
    const { net, host, guest, hostStorage, code } = await pair()
    host.startGame(fakeState())
    host.sendAction({ type: 'reserveDeck', tier: 1 })
    await until(() => guest.getSnapshot().canAct, 'guest to move')
    const revBefore = host.getSnapshot().rev

    expect(getSavedHostRoom(hostStorage)).toMatchObject({
      roomCode: code,
      started: true,
      gameOver: false,
      seatNames: ['Hana', 'Jiho'],
    })

    host.close() // host page reload
    await until(() => guest.getSnapshot().status === 'reconnecting', 'guest lost the host')
    expect(net.rooms()).toEqual([])

    const host2 = makeHost(net, hostStorage, { resume: true, hostName: 'ignored' })
    expect(host2.getSnapshot().roomCode).toBe(code)
    await until(() => host2.getSnapshot().status === 'connected', 'host back')
    expect(net.rooms()).toEqual([code])
    const h = host2.getSnapshot()
    expect(h.rev).toBe(revBefore)
    expect(h.lobby?.started).toBe(true)
    expect(h.lobby?.seats.map((s) => s.name)).toEqual(['Hana', 'Jiho'])
    expect(h.state?.currentPlayer).toBe(1)
    // The full state was restored, not a redacted one: the host still sees its blind card.
    expect(h.state?.players[0].reserved[0].card.id).toBe('t1-01')

    // The guest finds its way back alone, into the same seat, and plays on.
    await until(() => guest.getSnapshot().status === 'connected', 'guest back')
    expect(guest.getSnapshot().mySeat).toBe(1)
    expect(guest.getSnapshot().canAct).toBe(true)
    guest.sendAction({ type: 'pass' })
    await until(() => host2.getSnapshot().state?.currentPlayer === 0, 'game continues')
    expect(host2.getSnapshot().state?.turn).toBe(2)
    expect(host2.sendAction({ type: 'pass' })).toBe(true)
  })

  it('waits for the old registration to go away instead of changing the code', async () => {
    const net = createMemoryNetwork()
    const storage = createMemoryStorage()
    const host = makeHost(net, storage)
    await until(() => host.getSnapshot().status === 'connected', 'host connected')
    const code = host.getSnapshot().roomCode as string
    // The reloaded page comes up while the broker still holds the old id.
    const host2 = makeHost(net, storage, { resume: true })
    await settle(30)
    expect(host2.getSnapshot().status).toBe('reconnecting')
    expect(host2.getSnapshot().roomCode).toBe(code)
    host.close()
    await until(() => host2.getSnapshot().status === 'connected', 'host2 took over')
    expect(host2.getSnapshot().roomCode).toBe(code)
  })

  it('re-registers when the room registration is lost', async () => {
    const { net, host, guest, code } = await pair()
    net.killRoom(code)
    await until(() => host.getSnapshot().status === 'connected' && net.rooms().includes(code), 'host re-registered')
    await until(() => guest.getSnapshot().status === 'connected', 'guest back')
    await until(() => host.getSnapshot().lobby?.seats[1].online === true, 'guest online again')
    expect(guest.getSnapshot().mySeat).toBe(1)
  })

  it('starts a fresh room when resume is not requested, and forgets on close({forget})', async () => {
    const { net, host, guest, guestStorage, hostStorage, code } = await pair()
    host.close({ forget: true })
    await until(() => guest.getSnapshot().status === 'disconnected', 'guest told the room closed')
    expect(guest.getSnapshot().lastError?.code).toBe('room-closed')
    expect(guestStorage.getItem(GUEST_STORAGE_PREFIX + code)).toBeNull()
    expect(getSavedHostRoom(hostStorage)).toBeNull()
    await until(() => net.rooms().length === 0, 'room unregistered')

    const fresh = makeHost(net, hostStorage, { resume: true }) // nothing to resume
    await until(() => fresh.getSnapshot().status === 'connected', 'fresh host')
    expect(fresh.getSnapshot().lobby?.seats[1].claimed).toBe(false)
    expect(fresh.getSnapshot().state).toBeNull()
  })
})

describe('AI seats', () => {
  it('plays AI seats automatically with a redacted view', async () => {
    const seen: { state: GameState; difficulty: string }[] = []
    const { host } = await hostedRoom({
      chooseAiAction: (state, difficulty) => {
        seen.push({ state, difficulty })
        return { type: 'pass' }
      },
    })
    host.setSeat(1, { kind: 'ai', name: 'Bunny', difficulty: 'hard' })
    host.startGame(fakeState())
    await settle()
    expect(seen).toHaveLength(0) // not the AI's turn yet

    host.sendAction({ type: 'reserveDeck', tier: 1 })
    await until(() => hostState(host).currentPlayer === 0 && hostState(host).turn === 2, 'AI moved')
    expect(seen).toHaveLength(1)
    expect(seen[0].difficulty).toBe('hard')
    expect(seen[0].state.currentPlayer).toBe(1)
    // The AI cannot see the human's blind reserve or the decks.
    expect(isHiddenCard(seen[0].state.players[0].reserved[0].card)).toBe(true)
    expect(seen[0].state.decks[1].every(isHiddenCard)).toBe(true)
    expect(hostState(host).lastAction).toEqual({ player: 1, action: { type: 'pass' } })
  })

  it('chains consecutive AI turns and tells guests', async () => {
    let moves = 0
    const { net, host, code } = await hostedRoom({
      chooseAiAction: async () => (++moves >= 4 ? { type: 'chooseNoble', nobleId: 'end' } : { type: 'pass' }),
    })
    host.setSeat(0, { kind: 'ai', name: 'Fox' })
    host.setSeat(2, { kind: 'ai', name: 'Owl' })
    const guest = makeGuest(net, code, 'Jiho', createMemoryStorage())
    await until(() => guest.getSnapshot().status === 'connected', 'guest connected')
    expect(host.getSnapshot().mySeat).toBeNull()
    host.startGame(fakeState(3))
    // Fox (0) passes, then it is the guest's turn: the AI must wait.
    await until(() => guest.getSnapshot().canAct, 'guest to move')
    await settle()
    expect(moves).toBe(1)
    guest.sendAction({ type: 'pass' })
    // Owl (2) and Fox (0) pass back to back, guest again.
    await until(() => guest.getSnapshot().state?.turn === 4, 'two AI turns')
    expect(guest.getSnapshot().canAct).toBe(true)
    guest.sendAction({ type: 'pass' })
    await until(() => guest.getSnapshot().state?.phase === 'gameOver', 'AI ended the game')
    expect(moves).toBe(4)
    await settle()
    expect(moves).toBe(4) // no AI moves after the end
  })

  it('reports an AI that picks an illegal action instead of looping', async () => {
    let calls = 0
    const { host } = await hostedRoom({
      chooseAiAction: () => {
        calls++
        return { type: 'takeSame', color: 'red' }
      },
    })
    host.setSeat(1, { kind: 'ai', name: 'Bunny' })
    host.startGame(fakeState())
    host.sendAction({ type: 'pass' })
    await until(() => host.getSnapshot().lastError !== null, 'AI failure reported')
    expect(host.getSnapshot().lastError?.code).toBe('ai-failed')
    await settle()
    expect(calls).toBe(1)
    expect(hostState(host).currentPlayer).toBe(1)
  })
})

describe('protocol version', () => {
  it('host refuses a guest speaking another version', async () => {
    const { net, host, code } = await hostedRoom()
    const client = await rawClient(net, code)
    let closed = false
    client.conn.onClose(() => (closed = true))
    client.conn.send({ v: PROTOCOL_VERSION + 1, type: 'hello', name: 'Future' })
    await until(() => client.inbox.length > 0, 'answer')
    expect(client.inbox[0]).toMatchObject({ v: PROTOCOL_VERSION, type: 'error', code: 'version-mismatch' })
    await until(() => closed, 'connection closed by host')
    expect(host.getSnapshot().lobby?.seats[1].claimed).toBe(false)
  })

  it('guest stops with a clear error when the host speaks another version', async () => {
    const net = createMemoryNetwork()
    let connections = 0
    await net.listen('QQQQQ', (conn) => {
      connections++
      conn.onMessage(() => {
        conn.send({ v: PROTOCOL_VERSION + 1, type: 'welcome', seat: 1, token: 't', lobby: {}, state: null, rev: 0, extra: true })
      })
    })
    const guest = makeGuest(net, 'QQQQQ', 'Jiho', createMemoryStorage())
    await until(() => guest.getSnapshot().status === 'disconnected', 'guest stopped')
    expect(guest.getSnapshot().lastError?.code).toBe('version-mismatch')
    expect(guest.getSnapshot().mySeat).toBeNull()
    await settle()
    expect(connections).toBe(1) // no retry loop
  })

  it('ignores garbage without disturbing the room', async () => {
    const { net, host, guest, code } = await pair()
    const client = await rawClient(net, code)
    for (const junk of [null, 42, 'hi', [], {}, { v: PROTOCOL_VERSION }, { v: PROTOCOL_VERSION, type: 'hello' }]) {
      client.conn.send(junk)
    }
    await until(() => client.inbox.length === 7, 'all junk answered')
    expect(client.inbox.every((m) => m.type === 'error' && m.code === 'bad-message')).toBe(true)
    expect(host.getSnapshot().lobby?.seats[1].name).toBe('Jiho')
    expect(guest.getSnapshot().status).toBe('connected')
  })

  it('ignores an unknown message type instead of treating it as fatal', async () => {
    // Host side: a right-version message of a type this build does not know gets no answer.
    const { net, host, code } = await hostedRoom()
    const client = await rawClient(net, code)
    client.conn.send({ v: PROTOCOL_VERSION, type: 'hello', name: 'Raw' })
    await until(() => client.inbox.some((m) => m.type === 'welcome'), 'welcome')
    client.inbox.length = 0
    client.conn.send({ v: PROTOCOL_VERSION, type: 'high-five', with: 'everyone' })
    await settle()
    expect(client.inbox).toEqual([])
    expect(host.getSnapshot().lobby?.seats[1].online).toBe(true)

    // Guest side: a newer host's extra message is dropped and the game goes on.
    const net2 = createMemoryNetwork()
    await net2.listen('QQQQQ', (conn) => {
      conn.onMessage((raw) => {
        const m = raw as { type: string }
        if (m.type !== 'hello') return
        const lobby = { roomCode: 'QQQQQ', started: true, seats: [] }
        conn.send({ v: PROTOCOL_VERSION, type: 'welcome', seat: 1, token: 't', lobby, state: null, rev: 0 })
        conn.send({ v: PROTOCOL_VERSION, type: 'confetti', amount: 'lots' })
        conn.send({ v: PROTOCOL_VERSION, type: 'state', state: fakeState(), rev: 1 })
      })
    })
    const guest = makeGuest(net2, 'QQQQQ', 'Jiho', createMemoryStorage())
    await until(() => guest.getSnapshot().rev === 1, 'guest got the state after the unknown message')
    expect(guest.getSnapshot().status).toBe('connected')
    expect(guest.getSnapshot().lastError).toBeNull()
  })
})

describe('emotes', () => {
  it('broadcasts a guest emote to everyone with its seat, the host included', async () => {
    const { host, guest } = await pair({ validEmote: (id) => id === 'clap' || id === 'cool' })
    const hostHeard: unknown[] = []
    const guestHeard: unknown[] = []
    host.onEmote((e) => hostHeard.push(e))
    guest.onEmote((e) => guestHeard.push(e))
    expect(guest.sendEmote('clap')).toBe(true)
    await until(() => hostHeard.length === 1, 'host heard the emote')
    await until(() => guestHeard.length === 1, 'guest got its own emote back')
    expect(hostHeard[0]).toEqual({ seat: 1, id: 'clap', at: expect.any(Number) })
    expect(guestHeard[0]).toEqual(hostHeard[0])
    expect(Object.isFrozen(hostHeard[0])).toBe(true)
    // The guest may not impersonate another seat.
    expect(guest.sendEmote('clap', 0)).toBe(false)
  })

  it('sends the host’s own emote to guests and to its own listeners', async () => {
    const { host, guest } = await pair()
    const guestHeard: unknown[] = []
    const hostHeard: unknown[] = []
    guest.onEmote((e) => guestHeard.push(e))
    const off = host.onEmote((e) => hostHeard.push(e))
    expect(host.sendEmote('cool')).toBe(true)
    await until(() => guestHeard.length === 1, 'guest heard the host')
    expect(guestHeard[0]).toEqual({ seat: 0, id: 'cool', at: expect.any(Number) })
    expect(hostHeard).toEqual(guestHeard)
    // Only local seats can speak from the host device.
    expect(host.sendEmote('cool', 1)).toBe(false)
    off()
  })

  it('drops unknown or malformed ids on the host and on the guest', async () => {
    const { net, host, guest, code } = await pair({ validEmote: (id) => id === 'clap' })
    const hostHeard: unknown[] = []
    const guestHeard: unknown[] = []
    host.onEmote((e) => hostHeard.push(e))
    guest.onEmote((e) => guestHeard.push(e))
    expect(guest.sendEmote('🎉')).toBe(false) // not even well-formed: never sent
    expect(guest.sendEmote('wave')).toBe(true) // well-formed, but not in the host's set
    expect(host.sendEmote('wave')).toBe(false)
    expect(host.sendEmote('')).toBe(false)
    host.setSeat(2, { kind: 'remote' }) // a seat for the hand-rolled client
    const client = await rawClient(net, code)
    client.conn.send({ v: PROTOCOL_VERSION, type: 'hello', name: 'Raw' })
    await until(() => client.inbox.some((m) => m.type === 'welcome'), 'welcome')
    client.inbox.length = 0
    client.conn.send({ v: PROTOCOL_VERSION, type: 'emote', id: 42 })
    client.conn.send({ v: PROTOCOL_VERSION, type: 'emote', id: 'x'.repeat(40) })
    client.conn.send({ v: PROTOCOL_VERSION, type: 'emote' })
    await until(() => client.inbox.length === 3, 'malformed emotes answered')
    expect(client.inbox.every((m) => m.type === 'error' && m.code === 'bad-message')).toBe(true)
    await settle()
    expect(hostHeard).toEqual([])
    expect(guestHeard).toEqual([])
  })

  it('rate-limits each seat to one emote per interval, silently', async () => {
    let clock = 1_000_000
    const { host, guest } = await pair({ now: () => clock })
    const hostHeard: { seat: number; id: string }[] = []
    const guestHeard: { seat: number; id: string }[] = []
    host.onEmote((e) => hostHeard.push({ seat: e.seat, id: e.id }))
    guest.onEmote((e) => guestHeard.push({ seat: e.seat, id: e.id }))

    expect(host.sendEmote('clap')).toBe(true)
    expect(host.sendEmote('cool')).toBe(false) // too soon
    clock += EMOTE_MIN_INTERVAL_MS - 1
    expect(host.sendEmote('cool')).toBe(false)
    clock += 1
    expect(host.sendEmote('cool')).toBe(true)
    // Seats are limited independently: the guest is not blocked by the host.
    expect(guest.sendEmote('wow')).toBe(true)
    expect(guest.sendEmote('cry')).toBe(true) // "sent"; the host drops it without a word
    await until(() => guestHeard.length === 3, 'guest heard what got through')
    await settle()
    expect(guestHeard).toEqual([
      { seat: 0, id: 'clap' },
      { seat: 0, id: 'cool' },
      { seat: 1, id: 'wow' },
    ])
    expect(hostHeard).toEqual(guestHeard)
    expect(guest.getSnapshot().lastError).toBeNull()
    expect(host.getSnapshot().lastError).toBeNull()
  })

  it('refuses to send while disconnected and stops listening after close', async () => {
    const { net, host, guest, code } = await pair()
    const heard: unknown[] = []
    guest.onEmote((e) => heard.push(e))
    net.offline = true
    net.dropConnections(code)
    await until(() => guest.getSnapshot().status === 'reconnecting', 'guest reconnecting')
    expect(guest.sendEmote('clap')).toBe(false)
    net.offline = false
    await until(() => guest.getSnapshot().status === 'connected', 'guest back')
    guest.close()
    expect(guest.sendEmote('clap')).toBe(false)
    expect(host.sendEmote('clap')).toBe(true) // fine with nobody listening
    await settle()
    expect(heard).toEqual([])
    host.close()
    expect(host.sendEmote('clap')).toBe(false)
  })
})

describe('snapshots', () => {
  it('are frozen and keep their identity until something changes', async () => {
    const { host, guest } = await pair()
    await until(() => host.getSnapshot().lobby?.seats[1].online === true, 'host sees guest')
    const h1 = host.getSnapshot()
    const g1 = guest.getSnapshot()
    expect(Object.isFrozen(h1)).toBe(true)
    expect(Object.isFrozen(g1)).toBe(true)
    let hostNotified = 0
    let guestNotified = 0
    const offHost = host.subscribe(() => hostNotified++)
    const offGuest = guest.subscribe(() => guestNotified++)
    host.clearError() // nothing to clear: no change, no notification
    await settle()
    expect(host.getSnapshot()).toBe(h1)
    expect(guest.getSnapshot()).toBe(g1)
    expect(hostNotified).toBe(0)

    host.startGame(fakeState())
    await until(() => guest.getSnapshot().state !== null, 'guest got state')
    expect(host.getSnapshot()).not.toBe(h1)
    expect(h1.state).toBeNull() // the old snapshot was not touched
    expect(hostNotified).toBeGreaterThan(0)
    expect(guestNotified).toBeGreaterThan(0)
    const h2 = host.getSnapshot()
    expect(host.getSnapshot().state).toBe(h2.state)

    offHost()
    offGuest()
    const count = hostNotified
    host.sendAction({ type: 'pass' })
    expect(hostNotified).toBe(count)
    expect(h2.state?.currentPlayer).toBe(0)
    expect(host.getSnapshot().state?.currentPlayer).toBe(1)
  })
})
