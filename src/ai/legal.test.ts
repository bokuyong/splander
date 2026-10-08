// Every difficulty must always answer with a legal action, in every phase, and
// games between AIs must end.

import { describe, expect, it } from 'vitest'
import { getLegalActions, isLegal } from '../engine'
import type { Difficulty, GameState } from '../shared/contract'
import { chooseAction } from './index'
import { aiBot, newGame, playGame, randomBot, TURN_CAP } from './testkit'

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard']

describe('self-play legality and termination', () => {
  const seedsFor: Record<Difficulty, number> = { easy: 15, normal: 15, hard: 4 }
  for (const difficulty of DIFFICULTIES) {
    for (const players of [2, 3, 4]) {
      it(`${difficulty}, ${players} players`, () => {
        let actions = 0
        for (let seed = 1; seed <= seedsFor[difficulty]; seed++) {
          const bots = Array.from({ length: players }, () => aiBot(difficulty))
          // playGame throws on an illegal action or when the turn cap is hit
          const result = playGame(bots, seed * 7919 + players)
          expect(result.final.phase).toBe('gameOver')
          expect(result.final.winners?.length).toBeGreaterThan(0)
          expect(result.final.turn).toBeLessThanOrEqual(TURN_CAP)
          actions += result.steps
        }
        expect(actions).toBeGreaterThan(0)
      }, 60_000)
    }
  }

  it('mixed tables, including a random player that creates odd positions', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const result = playGame(
        [aiBot('easy'), randomBot(seed), aiBot('normal'), aiBot('hard')].slice(0, 2 + (seed % 3)),
        seed + 500,
      )
      expect(result.final.phase).toBe('gameOver')
    }
  }, 60_000)
})

describe('forced phases', () => {
  const base = newGame(3, 42)

  it('discard: returns a legal discard down to 10', () => {
    const me = base.players[0]
    const state: GameState = {
      ...base,
      phase: 'discard',
      players: [
        { ...me, tokens: { white: 3, blue: 3, green: 2, red: 2, black: 2, gold: 1 } },
        ...base.players.slice(1),
      ],
    }
    for (const difficulty of DIFFICULTIES) {
      const action = chooseAction(state, difficulty)
      expect(action.type).toBe('discard')
      expect(isLegal(state, action)).toBe(true)
    }
  })

  it('chooseNoble: picks one of the eligible guests', () => {
    const state: GameState = {
      ...base,
      phase: 'chooseNoble',
      eligibleNobles: [base.nobles[1].id, base.nobles[2].id],
    }
    for (const difficulty of DIFFICULTIES) {
      const action = chooseAction(state, difficulty)
      expect(action.type).toBe('chooseNoble')
      expect(isLegal(state, action)).toBe(true)
    }
  })

  it('pass: when nothing else is possible', () => {
    const empty = { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }
    const filler = base.decks[3].slice(0, 3).map((card) => ({ card, fromDeck: true }))
    const state: GameState = {
      ...base,
      bank: empty,
      players: [{ ...base.players[0], reserved: filler }, ...base.players.slice(1)],
    }
    expect(getLegalActions(state)).toEqual([{ type: 'pass' }])
    for (const difficulty of DIFFICULTIES) {
      expect(chooseAction(state, difficulty)).toEqual({ type: 'pass' })
    }
  })

  it('refuses a finished game', () => {
    const over: GameState = { ...base, phase: 'gameOver', winners: [0] }
    expect(() => chooseAction(over, 'normal')).toThrow()
  })
})
