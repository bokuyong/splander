// Online adapter tests: real engine, real AI, the net module's in-memory
// network. Every game here is played through the same OnlineRoom objects the
// screens use.
import { afterEach, describe, expect, it } from 'vitest'
import type { Action, ChooseAction, GameState } from '../../shared/contract'
import { chooseAction } from '../../ai'
import { engine } from '../../engine'
import { createMemoryNetwork, createMemoryStorage, isHiddenCard, type HostSession } from '../../net'
import type { MemoryNetwork } from '../../net/transport'
import { until } from '../../net/testkit'
import { createGuestRoom, createHostRoom, type HostRoomOptions, type OnlineRoom } from './onlineController'
import { connectionNotice, netErrorText } from './text'

type Storage = ReturnType<typeof createMemoryStorage>

const open: OnlineRoom[] = []
afterEach(() => {
  for (const room of open.splice(0)) room.leave()
})

function host(net: MemoryNetwork, storage: Storage, extra: Partial<HostRoomOptions> = {}): OnlineRoom {
  const room = createHostRoom({
    name: '민지',
    transport: net,
    storage,
    aiDelayMs: 0,
    heartbeatMs: 0,
    retryDelaysMs: [5],
    ...extra,
  })
  open.push(room)
  return room
}

function guest(net: MemoryNetwork, storage: Storage, roomCode: string, name = '지호'): OnlineRoom {
  const room = createGuestRoom({ roomCode, name, transport: net, storage, heartbeatMs: 0, retryDelaysMs: [5] })
  open.push(room)
  return room
}

/** Host + one guest, seated in the lobby. */
async function seated(extra: Partial<HostRoomOptions> = {}) {
  const net = createMemoryNetwork()
  const hostStorage = createMemoryStorage()
  const guestStorage = createMemoryStorage()
  const h = host(net, hostStorage, extra)
  await until(() => h.session.getSnapshot().status === 'connected', 'room registered')
  const code = h.session.getSnapshot().roomCode as string
  const g = guest(net, guestStorage, code)
  await until(() => g.session.getSnapshot().status === 'connected', 'guest welcomed')
  await until(() => h.session.getSnapshot().lobby?.seats[1].claimed === true, 'host sees the guest')
  return { net, hostStorage, guestStorage, h, g, code }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

/**
 * Plays the humans' turns (through whichever room may act) until `stop` holds
 * for the host's state. Each move is chosen on that device's own redacted view
 * and must be legal there. Returns the number of moves the humans made.
 */
async function play(rooms: OnlineRoom[], stop: (state: GameState, moves: number) => boolean): Promise<number> {
  const h = rooms[0]
  let moves = 0
  for (let guard = 0; guard < 20000; guard++) {
    const truth = h.session.getSnapshot()
    if (!truth.state) throw new Error('no game running')
    if (stop(truth.state, moves)) {
      await until(() => rooms.every((r) => r.session.getSnapshot().rev === truth.rev), 'everyone in sync')
      return moves
    }
    const actor = rooms.find((r) => r.session.getSnapshot().canAct)
    if (!actor) {
      await tick() // an AI seat is moving, or a message is on its way
      continue
    }
    const view = actor.getSnapshot()
    expect(view.mySeats).toContain(view.state.currentPlayer)
    const action: Action = chooseAction(view.state, 'normal')
    expect(engine.isLegal(view.state, action)).toBe(true)
    const rev = actor.session.getSnapshot().rev
    actor.sendAction(action)
    await until(() => actor.session.getSnapshot().rev > rev, 'the move to be applied')
    expect(actor.getSnapshot().error).toBeNull()
    moves++
  }
  throw new Error('the game did not finish')
}

const gameOver = (state: GameState) => state.phase === 'gameOver'

function publicParts(state: GameState) {
  return {
    bank: state.bank,
    board: state.board,
    nobles: state.nobles,
    winners: state.winners,
    turn: state.turn,
    scores: state.players.map((p) => engine.getScore(p)),
    tokens: state.players.map((p) => p.tokens),
    deckSizes: [state.decks[1].length, state.decks[2].length, state.decks[3].length],
  }
}

describe('online rooms', () => {
  it('host and guest play a whole game through their adapters', async () => {
    const { h, g } = await seated()
    expect(h.hasGame()).toBe(false)
    expect(g.hasGame()).toBe(false)
    expect(() => g.getSnapshot()).toThrow()
    expect(g.rematch).toBeUndefined()
    expect(g.startGame()).toBe(false)

    expect(h.startGame()).toBe(true)
    await until(() => g.hasGame(), 'the game to reach the guest')
    expect(h.getSnapshot().mySeats).toEqual([0])
    expect(g.getSnapshot().mySeats).toEqual([1])
    expect(h.getSnapshot().state.players.map((p) => p.name)).toEqual(['민지', '지호'])
    expect(h.getSnapshot().state.players.every((p) => p.kind === 'human')).toBe(true)
    // host to move: the guest shows "thinking" for seat 0, the host for nobody
    expect(h.getSnapshot().thinkingSeat).toBeNull()
    expect(g.getSnapshot().thinkingSeat).toBe(0)
    // nobody sees the decks, not even the host's own screen
    for (const room of [h, g]) {
      const { state } = room.getSnapshot()
      expect(state.decks[1].length).toBe(36)
      expect(state.decks[1].every(isHiddenCard)).toBe(true)
      expect(state.rngState).toBe(0)
    }

    // problems come back as short Korean messages and can be dismissed
    g.sendAction({ type: 'takeSame', color: 'red' })
    expect(g.getSnapshot().error).toBe('아직 내 차례가 아니에요')
    g.clearError()
    expect(g.getSnapshot().error).toBeNull()
    const before = h.getSnapshot().state
    h.sendAction({ type: 'buy', cardId: 'no-such-card' })
    expect(h.getSnapshot().error).toBe('지금은 할 수 없는 행동이에요')
    expect(h.getSnapshot().state).toBe(before)
    h.clearError()

    const moves = await play([h, g], gameOver)
    expect(moves).toBeGreaterThan(20)
    const hostEnd = h.getSnapshot().state
    const guestEnd = g.getSnapshot().state
    expect(hostEnd.phase).toBe('gameOver')
    expect(guestEnd.phase).toBe('gameOver')
    expect(hostEnd.winners?.length).toBeGreaterThan(0)
    expect(publicParts(guestEnd)).toEqual(publicParts(hostEnd))
    expect(h.getSnapshot().thinkingSeat).toBeNull()
    expect(g.getSnapshot().thinkingSeat).toBeNull()

    h.sendAction({ type: 'pass' })
    expect(h.getSnapshot().error).toBe('게임이 이미 끝났어요')
  })

  it('plays a game with AI seats, and the real AI copes with the redacted view', async () => {
    let illegalFromAi = 0
    const aiCalls: string[] = []
    const watched: ChooseAction = (view, difficulty) => {
      const action = chooseAction(view, difficulty)
      aiCalls.push(difficulty)
      if (!engine.isLegal(view, action)) illegalFromAi++
      return action
    }
    const { h, g } = await seated({ chooseAction: watched })
    const session = h.session as HostSession
    expect(session.setSeat(2, { kind: 'ai', name: '달이', difficulty: 'normal' })).toBe(true)
    expect(session.setSeat(3, { kind: 'ai', name: '별이', difficulty: 'hard' })).toBe(true)
    const errors: string[] = []
    session.subscribe(() => {
      const e = session.getSnapshot().lastError
      if (e) errors.push(e.code)
    })

    expect(h.startGame()).toBe(true)
    await until(() => g.hasGame(), 'the game to reach the guest')
    const start = h.getSnapshot().state
    expect(start.players.map((p) => p.kind)).toEqual(['human', 'human', 'ai', 'ai'])
    expect(start.players[3].difficulty).toBe('hard')

    await play([h, g], gameOver)
    const end = h.getSnapshot().state
    expect(end.phase).toBe('gameOver')
    expect(publicParts(g.getSnapshot().state)).toEqual(publicParts(end))
    expect(aiCalls).toContain('normal')
    expect(aiCalls).toContain('hard')
    expect(illegalFromAi).toBe(0)
    expect(errors).toEqual([])
    // every seat really played
    expect(end.players.every((p) => p.cards.length > 0)).toBe(true)
  }, 60000)

  it('survives a dropped link, a guest reload and a host reload in the middle of a game', async () => {
    const { net, hostStorage, guestStorage, h, g, code } = await seated()
    expect(h.startGame()).toBe(true)
    await until(() => g.hasGame(), 'the game to reach the guest')
    await play([h, g], (_, moves) => moves >= 8)

    // 1. the link drops: both sides say so, then it heals by itself
    net.dropConnections(code)
    await until(() => h.session.getSnapshot().lobby?.seats[1].online === false, 'host notices')
    expect(connectionNotice(h.session.getSnapshot())?.text).toContain('지호')
    await until(() => g.session.getSnapshot().status === 'connected', 'guest back')
    await until(() => h.session.getSnapshot().lobby?.seats[1].online === true, 'host sees the guest again')
    expect(connectionNotice(h.session.getSnapshot())).toBeNull()
    expect(connectionNotice(g.session.getSnapshot())).toBeNull()
    await play([h, g], (_, moves) => moves >= 6)

    // 2. the guest reloads the page: new room object, same storage -> same seat, same game
    const beforeReload = g.getSnapshot().state
    g.leave()
    await until(() => h.session.getSnapshot().lobby?.seats[1].online === false, 'host notices the reload')
    const g2 = guest(net, guestStorage, code)
    await until(() => g2.hasGame(), 'the reloaded guest to get the game')
    expect(g2.session.getSnapshot().mySeat).toBe(1)
    expect(g2.getSnapshot().mySeats).toEqual([1])
    expect(g2.getSnapshot().state).toEqual(beforeReload)
    await play([h, g2], (_, moves) => moves >= 6)

    // 3. the host reloads: the room comes back under the same code, the guest finds it again
    const truth = h.session.getSnapshot()
    h.leave()
    await until(() => g2.session.getSnapshot().status === 'reconnecting', 'guest notices the host is gone')
    expect(connectionNotice(g2.session.getSnapshot())?.tone).toBe('warn')
    // while cut off, a move is refused locally instead of being lost
    if (g2.getSnapshot().mySeats.includes(g2.getSnapshot().state.currentPlayer)) {
      g2.sendAction(chooseAction(g2.getSnapshot().state, 'normal'))
      expect(g2.getSnapshot().error).toBe('연결이 끊겨 있어요. 잠시만 기다려 주세요')
      g2.clearError()
    }
    const h2 = host(net, hostStorage, { resume: true })
    expect(h2.hasGame()).toBe(true)
    expect(h2.session.getSnapshot().roomCode).toBe(code)
    expect(h2.session.getSnapshot().rev).toBe(truth.rev)
    expect(h2.getSnapshot().state).toEqual(truth.state)
    await until(() => g2.session.getSnapshot().status === 'connected', 'guest back with the new host')
    await until(() => h2.session.getSnapshot().lobby?.seats[1].online === true, 'host sees the guest')

    await play([h2, g2], gameOver)
    expect(publicParts(g2.getSnapshot().state)).toEqual(publicParts(h2.getSnapshot().state))
  }, 30000)

  it('rematch, back to the lobby, and closing the room', async () => {
    const seeds = [11, 22, 33]
    const { h, g } = await seated({ seed: () => seeds.shift() ?? 99 })
    expect(h.startGame()).toBe(true)
    await until(() => g.hasGame(), 'the game to reach the guest')
    const firstBoard = h.getSnapshot().state.board
    await play([h, g], gameOver)

    // rematch: host only, same seats, a fresh shuffle, both tables reset
    expect(typeof h.rematch).toBe('function')
    h.rematch?.()
    await until(() => g.getSnapshot().state.phase === 'action', 'the rematch to reach the guest')
    for (const room of [h, g]) {
      const { state } = room.getSnapshot()
      expect(state.turn).toBe(0)
      expect(state.lastAction).toBeNull()
      expect(state.winners).toBeNull()
      expect(state.players.map((p) => p.name)).toEqual(['민지', '지호'])
      expect(state.players.every((p) => p.cards.length === 0)).toBe(true)
    }
    expect(h.getSnapshot().state.board).not.toEqual(firstBoard)
    await play([h, g], gameOver)
    expect(publicParts(g.getSnapshot().state)).toEqual(publicParts(h.getSnapshot().state))

    // back to the lobby: no game any more, but a still mounted game screen keeps its last state
    const last = g.getSnapshot()
    h.returnToLobby()
    await until(() => !g.hasGame(), 'the guest to be back in the lobby')
    expect(h.hasGame()).toBe(false)
    expect(g.getSnapshot()).toBe(last)
    expect(g.session.getSnapshot().lobby?.started).toBe(false)

    // an open seat blocks the start, with a Korean reason
    const session = h.session as HostSession
    session.setSeat(2, { kind: 'remote' })
    expect(h.startGame()).toBe(false)
    expect(netErrorText(session.getSnapshot().lastError!)).toBe('아직 시작할 수 없어요. 자리를 확인해 주세요')
    session.setSeat(2, null)
    expect(h.startGame()).toBe(true)
    await until(() => g.hasGame(), 'the third game to reach the guest')
    await play([h, g], (_, moves) => moves >= 4)

    // the host closes the room for good: the guest is told, and it is not a toast
    h.leave({ forget: true })
    await until(() => g.session.getSnapshot().status === 'disconnected', 'the guest to be told')
    const notice = connectionNotice(g.session.getSnapshot())
    expect(notice).toEqual({ tone: 'error', text: '방 주인이 방을 닫았어요', action: 'leave' })
    expect(g.getSnapshot().error).toBeNull()
    g.clearError() // the game screen does this on unmount: the reason must survive
    expect(connectionNotice(g.session.getSnapshot())?.text).toBe('방 주인이 방을 닫았어요')
  }, 30000)
})

describe('online turn timer', () => {
  it('exposes the clock, plays a legal move when it runs out, and flags the stand-in', async () => {
    const clock = { t: 5_000_000 }
    const { net, h, g, code } = await seated({ now: () => clock.t, tickMs: 5 })
    const session = h.session as HostSession
    expect(session.setTurnLimit(30)).toBe(true)
    expect(h.startGame()).toBe(true)
    await until(() => g.hasGame(), 'the game to reach the guest')
    await until(() => g.getSnapshot().timer?.limitSec === 30, 'guest sees the clock')
    expect(h.getSnapshot().timer).toEqual({ limitSec: 30, seat: 0, deadline: clock.t + 30_000 })
    expect(h.getSnapshot().forced).toBeNull()
    expect(h.getSnapshot().standIns).toEqual([])

    // The host dawdles: the real AI plays a legal move for seat 0.
    const before = h.getSnapshot().state
    clock.t += 30_000
    await until(() => h.getSnapshot().state.currentPlayer === 1, 'the host was played for')
    const after = h.getSnapshot().state
    expect(after.lastAction?.player).toBe(0)
    expect(engine.isLegal(before, after.lastAction!.action)).toBe(true)
    expect(h.getSnapshot().forced).toBe('timeout')
    expect(h.getSnapshot().error).toBeNull()
    await until(() => g.getSnapshot().state.turn === after.turn, 'guest in sync')
    expect(g.getSnapshot().forced).toBe('timeout')
    expect(g.getSnapshot().timer?.seat).toBe(1)

    // The guest vanishes for half a minute: the AI stands in, the screens know.
    net.offline = true
    net.dropConnections(code)
    await until(() => h.session.getSnapshot().lobby?.seats[1].online === false, 'host notices')
    clock.t += 30_000
    await until(() => h.getSnapshot().standIns?.length === 1, 'stand-in flagged')
    expect(h.getSnapshot().standIns).toEqual([1])
    expect(connectionNotice(h.session.getSnapshot())?.text).toBe('지호 대신 AI가 두는 중 · 돌아오면 바로 넘겨요')
    await until(() => h.getSnapshot().state.currentPlayer === 0, 'the AI played for the guest')
    expect(h.getSnapshot().forced).toBe('offline')
    net.offline = false
    await until(() => g.session.getSnapshot().status === 'connected', 'guest back')
    await until(() => h.getSnapshot().standIns?.length === 0, 'control handed back')
    expect(connectionNotice(h.session.getSnapshot())).toBeNull()
  })
})

describe('online emotes', () => {
  it('carries emotes between the rooms, tagged with the sender’s seat', async () => {
    let clock = 1_000_000
    const { h, g } = await seated({ now: () => clock })
    expect(h.startGame()).toBe(true)
    await until(() => g.hasGame(), 'guest has the game')
    const hostHeard: { seat: number; id: string }[] = []
    const guestHeard: { seat: number; id: string }[] = []
    h.subscribeEmotes!((e) => hostHeard.push({ seat: e.seat, id: e.id }))
    const off = g.subscribeEmotes!((e) => guestHeard.push({ seat: e.seat, id: e.id }))

    g.sendEmote!('clap')
    await until(() => hostHeard.length === 1, 'host heard the guest')
    await until(() => guestHeard.length === 1, 'guest saw its own bubble')
    expect(hostHeard).toEqual([{ seat: 1, id: 'clap' }])
    expect(guestHeard).toEqual(hostHeard)

    h.sendEmote!('nice')
    await until(() => guestHeard.length === 2, 'guest heard the host')
    expect(guestHeard[1]).toEqual({ seat: 0, id: 'nice' })
    expect(hostHeard[1]).toEqual({ seat: 0, id: 'nice' })

    // Not an emote: never leaves the device, never arrives.
    g.sendEmote!('not-an-emote')
    h.sendEmote!('🎉')
    await tick()
    await tick()
    expect(hostHeard).toHaveLength(2)
    expect(guestHeard).toHaveLength(2)
    expect(h.getSnapshot().error).toBeNull()
    expect(g.getSnapshot().error).toBeNull()

    // The host's seat is still inside its rate-limit window: dropped without a word.
    h.sendEmote!('gg')
    await tick()
    expect(hostHeard).toHaveLength(2)

    off()
    clock += 2000
    h.sendEmote!('gg')
    await until(() => hostHeard.length === 3, 'host heard itself')
    expect(guestHeard).toHaveLength(2)
  })
})
