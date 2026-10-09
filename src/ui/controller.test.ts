import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChooseAction, EngineApi, GameState } from '../shared/contract'
import { NOBLES } from '../data'
import { engine } from '../engine'
import {
  clearSavedGame,
  createLocalController,
  loadSavedGame,
  SAVE_KEY,
  type EmoteEvent,
  type StorageLike,
} from './controller'
import { selectionToAction } from './logic/selection'

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

const firstLegal: ChooseAction = (state) => engine.getLegalActions(state)[0]
const solo = [
  { name: '나', kind: 'human' as const },
  { name: '토끼', kind: 'ai' as const, difficulty: 'easy' as const },
]

afterEach(() => {
  vi.useRealTimers()
})

describe('local controller', () => {
  it('plays the AI seat after the human and hands the turn back', () => {
    const storage = memoryStorage()
    const chooseAction = vi.fn(firstLegal)
    const c = createLocalController({ players: solo, seed: 7, chooseAction, aiDelayMs: 0, storage })
    let calls = 0
    c.subscribe(() => calls++)
    const before = c.getSnapshot()
    expect(before.mySeats).toEqual([0])
    expect(before.state.currentPlayer).toBe(0)
    expect(before.thinkingSeat).toBeNull()

    c.sendAction({ type: 'takeDifferent', colors: ['white', 'blue', 'green'] })
    const after = c.getSnapshot()
    expect(after).not.toBe(before)
    expect(after.error).toBeNull()
    expect(after.state.currentPlayer).toBe(0)
    expect(after.state.turn).toBe(before.state.turn + 2)
    expect(after.state.lastAction?.player).toBe(1)
    expect(after.state.players[0].tokens.white).toBe(1)
    expect(chooseAction).toHaveBeenCalledTimes(1)
    expect(chooseAction.mock.calls[0][1]).toBe('easy')
    expect(calls).toBe(2) // my move, then the AI's
  })

  it('lets the AI open when it sits in seat 0', () => {
    const c = createLocalController({
      players: [solo[1], solo[0]],
      seed: 3,
      chooseAction: firstLegal,
      aiDelayMs: 0,
      storage: null,
    })
    const snap = c.getSnapshot()
    expect(snap.mySeats).toEqual([1])
    expect(snap.state.currentPlayer).toBe(1)
    expect(snap.state.lastAction?.player).toBe(0)
  })

  it('reports thinkingSeat while a delayed AI decides', () => {
    vi.useFakeTimers()
    const c = createLocalController({
      players: solo,
      seed: 7,
      chooseAction: firstLegal,
      aiDelayMs: 500,
      storage: null,
    })
    c.sendAction({ type: 'takeSame', color: 'red' })
    expect(c.getSnapshot().thinkingSeat).toBe(1)
    expect(c.getSnapshot().state.currentPlayer).toBe(1)
    // the human cannot move for the AI
    c.sendAction({ type: 'takeSame', color: 'blue' })
    expect(c.getSnapshot().error).not.toBeNull()
    vi.advanceTimersByTime(500)
    expect(c.getSnapshot().thinkingSeat).toBeNull()
    expect(c.getSnapshot().state.currentPlayer).toBe(0)
    expect(c.getSnapshot().error).toBeNull()
  })

  it('keeps the state and sets an error on an illegal action', () => {
    const c = createLocalController({
      players: solo,
      seed: 7,
      chooseAction: firstLegal,
      aiDelayMs: 0,
      storage: null,
    })
    const state = c.getSnapshot().state
    c.sendAction({ type: 'takeDifferent', colors: ['white', 'white', 'blue'] })
    expect(c.getSnapshot().state).toBe(state)
    expect(c.getSnapshot().error).toBeTruthy()
    c.clearError?.()
    expect(c.getSnapshot().error).toBeNull()
  })

  it('survives an AI that throws or cheats', () => {
    const broken: ChooseAction = () => {
      throw new Error('boom')
    }
    const cheat: ChooseAction = () => ({ type: 'buy', cardId: 'nope' })
    for (const chooseAction of [broken, cheat]) {
      const c = createLocalController({ players: solo, seed: 1, chooseAction, aiDelayMs: 0, storage: null })
      const turn = c.getSnapshot().state.turn
      c.sendAction({ type: 'takeSame', color: 'red' })
      expect(c.getSnapshot().state.currentPlayer).toBe(0)
      expect(c.getSnapshot().state.turn).toBe(turn + 2)
    }
  })

  it('treats every human seat as mine in pass-and-play', () => {
    const c = createLocalController({
      players: [
        { name: '민지', kind: 'human' },
        { name: '지호', kind: 'human' },
      ],
      seed: 5,
      chooseAction: firstLegal,
      aiDelayMs: 0,
      storage: null,
    })
    expect(c.getSnapshot().mySeats).toEqual([0, 1])
    c.sendAction({ type: 'takeSame', color: 'red' })
    expect(c.getSnapshot().state.currentPlayer).toBe(1)
    c.sendAction({ type: 'takeSame', color: 'blue' })
    expect(c.getSnapshot().state.currentPlayer).toBe(0)
  })

  it('saves after every change and resumes the same game', () => {
    const storage = memoryStorage()
    const c = createLocalController({ players: solo, seed: 11, chooseAction: firstLegal, aiDelayMs: 0, storage })
    expect(loadSavedGame(storage)?.state).toEqual(c.getSnapshot().state)
    c.sendAction({ type: 'takeDifferent', colors: ['red', 'green', 'black'] })
    const saved = loadSavedGame(storage)
    expect(saved?.state).toEqual(c.getSnapshot().state)

    const resumed = createLocalController({ resume: saved!, chooseAction: firstLegal, aiDelayMs: 0, storage })
    expect(resumed.getSnapshot().state).toEqual(c.getSnapshot().state)
    expect(resumed.getSnapshot().mySeats).toEqual([0])
    const turn = resumed.getSnapshot().state.turn
    resumed.sendAction(engine.getLegalActions(resumed.getSnapshot().state)[0])
    expect(resumed.getSnapshot().state.turn).toBe(turn + 2)
    expect(loadSavedGame(storage)?.state.turn).toBe(turn + 2)

    clearSavedGame(storage)
    expect(loadSavedGame(storage)).toBeNull()
  })

  it('ignores broken or finished saves', () => {
    const storage = memoryStorage()
    storage.setItem(SAVE_KEY, '{not json')
    expect(loadSavedGame(storage)).toBeNull()
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, state: { players: [] } }))
    expect(loadSavedGame(storage)).toBeNull()
  })

  it('plays a whole game to the end, clears the save, and offers a rematch', () => {
    const storage = memoryStorage()
    const c = createLocalController({ players: solo, seed: 21, chooseAction: firstLegal, aiDelayMs: 0, storage })
    // The human seat is driven by a simple greedy rule: buy when possible.
    for (let i = 0; i < 4000 && c.getSnapshot().state.phase !== 'gameOver'; i++) {
      const s = c.getSnapshot().state
      const legal = engine.getLegalActions(s)
      c.sendAction(legal.find((a) => a.type === 'buy') ?? legal[i % legal.length])
    }
    const end = c.getSnapshot()
    expect(end.state.phase).toBe('gameOver')
    expect(end.thinkingSeat).toBeNull()
    expect(storage.map.has(SAVE_KEY)).toBe(false)

    c.rematch?.()
    const again = c.getSnapshot().state
    expect(again.phase).not.toBe('gameOver')
    expect(again.players.map((p) => p.name)).toEqual(['토끼', '나'])
    expect(c.getSnapshot().mySeats).toEqual([1])
    expect(again.currentPlayer).toBe(1) // the AI already opened
    expect(storage.map.has(SAVE_KEY)).toBe(true)
  })

  it('agrees with the engine about tray moves', () => {
    const c = createLocalController({ players: solo, seed: 2, chooseAction: firstLegal, aiDelayMs: 0, storage: null })
    const { bank } = c.getSnapshot().state
    const action = selectionToAction(bank, ['red', 'blue', 'green'])
    expect(action && engine.isLegal(c.getSnapshot().state, action)).toBe(true)
    const pair = selectionToAction(bank, ['red', 'red'])
    expect(pair && engine.isLegal(c.getSnapshot().state, pair)).toBe(true)
  })
})

// --- Emotes ------------------------------------------------------------------

/** The real engine, except that `gift(before, after)` may rewrite the result of any move. */
function engineWith(gift: (before: GameState, after: GameState) => GameState): EngineApi {
  return { ...engine, applyAction: (s, a) => gift(s, engine.applyAction(s, a)) }
}

const giveNoble = (seat: number, noble = NOBLES[0]) => (before: GameState, after: GameState) =>
  before.currentPlayer === seat && after.players[seat].nobles.length === 0
    ? { ...after, players: after.players.map((p, i) => (i === seat ? { ...p, nobles: [noble] } : p)) }
    : after

describe('local controller emotes', () => {
  it('relays a human emote to subscribers, from my seat only, known ids only', () => {
    const c = createLocalController({ players: solo, seed: 7, chooseAction: firstLegal, aiDelayMs: 0, storage: null })
    const heard: EmoteEvent[] = []
    const off = c.subscribeEmotes!((e) => heard.push(e))
    c.sendEmote!('clap')
    expect(heard).toEqual([{ seat: 0, id: 'clap', at: expect.any(Number) }])
    c.sendEmote!('nope') // not an emote
    c.sendEmote!('clap', 1) // not my seat (the AI)
    c.sendEmote!('clap', 7) // not a seat at all
    expect(heard).toHaveLength(1)
    off()
    c.sendEmote!('cool')
    expect(heard).toHaveLength(1)
  })

  it('defaults to the human seat to move in pass-and-play', () => {
    const c = createLocalController({
      players: [
        { name: '민지', kind: 'human' },
        { name: '지호', kind: 'human' },
      ],
      seed: 5,
      chooseAction: firstLegal,
      aiDelayMs: 0,
      storage: null,
    })
    const heard: EmoteEvent[] = []
    c.subscribeEmotes!((e) => heard.push(e))
    c.sendEmote!('wow')
    c.sendAction({ type: 'takeSame', color: 'red' })
    c.sendEmote!('wow')
    c.sendEmote!('gg', 0) // an explicit seat wins
    expect(heard.map((e) => e.seat)).toEqual([0, 1, 0])
  })

  it('lets the AI gloat over its own noble, deterministically', () => {
    const run = () => {
      const c = createLocalController({
        players: solo,
        seed: 7,
        chooseAction: firstLegal,
        aiDelayMs: 0,
        storage: null,
        engine: engineWith(giveNoble(1)),
      })
      const heard: EmoteEvent[] = []
      c.subscribeEmotes!((e) => heard.push(e))
      c.sendAction({ type: 'takeDifferent', colors: ['white', 'blue', 'green'] })
      expect(c.getSnapshot().state.players[1].nobles).toHaveLength(1)
      return heard
    }
    const a = run()
    const b = run()
    expect(a).toHaveLength(1)
    expect(a[0].seat).toBe(1)
    expect(['cool', 'lucky']).toContain(a[0].id)
    expect(b.map((e) => e.id)).toEqual(a.map((e) => e.id))
  })

  it('applauds the human’s noble and sighs when it loses', () => {
    const c = createLocalController({
      players: solo,
      seed: 7,
      chooseAction: firstLegal,
      aiDelayMs: 0,
      storage: null,
      engine: engineWith((before, after) => {
        const gifted = giveNoble(0)(before, after)
        // the human's second move ends the game
        return before.currentPlayer === 0 && before.turn >= 2 ? { ...gifted, phase: 'gameOver', winners: [0] } : gifted
      }),
    })
    const heard: EmoteEvent[] = []
    c.subscribeEmotes!((e) => heard.push(e))
    c.sendAction({ type: 'takeDifferent', colors: ['white', 'blue', 'green'] })
    expect(heard).toHaveLength(1)
    expect(heard[0].seat).toBe(1)
    expect(['clap', 'nice']).toContain(heard[0].id)
    c.sendAction({ type: 'takeDifferent', colors: ['red', 'black', 'white'] })
    expect(c.getSnapshot().state.phase).toBe('gameOver')
    expect(heard.map((e) => e.id).slice(1)).toEqual(['cry'])
  })

  it('stays rare: one reaction, then silence for a few turns', () => {
    const c = createLocalController({
      players: solo,
      seed: 7,
      chooseAction: firstLegal,
      aiDelayMs: 0,
      storage: null,
      // every move of the AI "earns" a fresh noble
      engine: engineWith((before, after) =>
        before.currentPlayer === 1
          ? {
              ...after,
              players: after.players.map((p, i) =>
                i === 1 ? { ...p, nobles: [...p.nobles, NOBLES[p.nobles.length % NOBLES.length]] } : p,
              ),
            }
          : after,
      ),
    })
    const heard: EmoteEvent[] = []
    c.subscribeEmotes!((e) => heard.push(e))
    for (let i = 0; i < 6; i++) {
      const s = c.getSnapshot().state
      const legal = engine.getLegalActions(s)
      c.sendAction(legal.find((a) => a.type === 'takeDifferent') ?? legal[0])
    }
    // 6 AI moves (turns 1, 3, 5, 7, 9, 11), 6 nobles, but reactions are at
    // least 4 turns apart: turns 1, 5 and 9 only.
    expect(c.getSnapshot().state.players[1].nobles.length).toBe(6)
    expect(heard).toHaveLength(3)
    expect(heard.every((e) => e.seat === 1)).toBe(true)
  })

  it('waits a moment after the AI’s move before it reacts, and not after dispose', () => {
    vi.useFakeTimers()
    const make = () =>
      createLocalController({
        players: solo,
        seed: 7,
        chooseAction: firstLegal,
        aiDelayMs: 500,
        storage: null,
        engine: engineWith(giveNoble(1)),
      })
    const c = make()
    const heard: EmoteEvent[] = []
    c.subscribeEmotes!((e) => heard.push(e))
    c.sendAction({ type: 'takeDifferent', colors: ['white', 'blue', 'green'] })
    vi.advanceTimersByTime(500) // the AI moves
    expect(c.getSnapshot().state.players[1].nobles).toHaveLength(1)
    expect(heard).toHaveLength(0)
    vi.advanceTimersByTime(599)
    expect(heard).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(heard).toHaveLength(1)

    const d = make()
    const late: EmoteEvent[] = []
    d.subscribeEmotes!((e) => late.push(e))
    d.sendAction({ type: 'takeDifferent', colors: ['white', 'blue', 'green'] })
    vi.advanceTimersByTime(500)
    d.dispose?.()
    vi.advanceTimersByTime(2000)
    expect(late).toHaveLength(0)
  })
})
