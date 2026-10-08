import { describe, expect, it } from 'vitest'
import { applyAction, createGame, getLegalActions } from './index'
import { fullCards, fullNobles, playerConfigs } from './testHelpers'

function playOut(players: number, startPlayer: number, seed: number) {
  let state = createGame({
    players: playerConfigs(players),
    seed,
    startPlayer,
    cards: fullCards(),
    nobles: fullNobles(),
  })
  const turnsTaken = new Array<number>(players).fill(0)
  let pick = seed
  for (let step = 0; step < 20000 && state.phase !== 'gameOver'; step++) {
    const actions = getLegalActions(state)
    pick = (pick * 1103515245 + 12345) >>> 0
    // Prefer buying so that random play reaches 15 quickly.
    const buys = actions.filter((a) => a.type === 'buy')
    const pool = buys.length > 0 ? buys : actions
    const mover = state.currentPlayer
    const turnBefore = state.turn
    state = applyAction(state, pool[pick % pool.length])
    if (state.turn !== turnBefore || state.phase === 'gameOver') turnsTaken[mover]++
  }
  return { state, turnsTaken }
}

describe('startPlayer', () => {
  it('defaults to seat 0', () => {
    const state = createGame({
      players: playerConfigs(3),
      seed: 1,
      cards: fullCards(),
      nobles: fullNobles(),
    })
    expect(state.currentPlayer).toBe(0)
    expect(state.startPlayer).toBe(0)
  })

  it('rejects a seat that does not exist', () => {
    const config = { players: playerConfigs(2), seed: 1, cards: fullCards(), nobles: fullNobles() }
    expect(() => createGame({ ...config, startPlayer: 2 })).toThrow()
    expect(() => createGame({ ...config, startPlayer: -1 })).toThrow()
  })

  it('gives every seat the same number of turns whoever starts', () => {
    for (const players of [2, 3, 4]) {
      for (let startPlayer = 0; startPlayer < players; startPlayer++) {
        for (let seed = 1; seed <= 5; seed++) {
          const { state, turnsTaken } = playOut(players, startPlayer, seed)
          expect(state.phase).toBe('gameOver')
          expect(new Set(turnsTaken).size).toBe(1)
          // The last move belongs to the seat just before the starting seat.
          expect(state.currentPlayer).toBe((startPlayer + players - 1) % players)
        }
      }
    }
  })
})
