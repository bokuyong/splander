import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChooseAction } from '../shared/contract'
import { engine } from '../engine'
import {
  clearSavedGame,
  createLocalController,
  loadSavedGame,
  SAVE_KEY,
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
