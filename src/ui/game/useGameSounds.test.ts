import { describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract'
import { CARDS, NOBLES } from '../../data'
import { engine } from '../../engine'
import { becameMyTurn, isMyTurn, resultSound, soundCues } from './useGameSounds'

const game = (): GameState =>
  engine.createGame({
    players: [
      { name: '민지', kind: 'human' },
      { name: '진주', kind: 'ai', difficulty: 'easy' },
    ],
    seed: 9,
    cards: CARDS,
    nobles: NOBLES,
  })

const take = (s: GameState): GameState =>
  engine.applyAction(s, { type: 'takeDifferent', colors: ['red', 'blue', 'white'] })

describe('becameMyTurn', () => {
  it('fires only when the seat changes from theirs to mine during the action phase', () => {
    expect(becameMyTurn({ currentPlayer: 1, phase: 'action' }, { currentPlayer: 0, phase: 'action' }, [0])).toBe(true)
    // same seat (first render, resume, my own follow-up decision): quiet
    expect(becameMyTurn({ currentPlayer: 0, phase: 'action' }, { currentPlayer: 0, phase: 'action' }, [0])).toBe(false)
    expect(becameMyTurn({ currentPlayer: 0, phase: 'action' }, { currentPlayer: 0, phase: 'discard' }, [0])).toBe(false)
    // not mine
    expect(becameMyTurn({ currentPlayer: 0, phase: 'action' }, { currentPlayer: 1, phase: 'action' }, [0])).toBe(false)
    // mine, but the game wants something else first / is over
    expect(becameMyTurn({ currentPlayer: 1, phase: 'action' }, { currentPlayer: 0, phase: 'gameOver' }, [0])).toBe(false)
    // pass-and-play: every seat is mine, so the hand-off screen chimes instead
    expect(becameMyTurn({ currentPlayer: 1, phase: 'action' }, { currentPlayer: 0, phase: 'action' }, [0, 1])).toBe(false)
    expect(isMyTurn({ currentPlayer: 0, phase: 'action' }, [0])).toBe(true)
    expect(isMyTurn({ currentPlayer: 0, phase: 'chooseNoble' }, [0])).toBe(false)
  })
})

describe('soundCues', () => {
  it('is silent for the same state and for a brand-new game', () => {
    const a = game()
    expect(soundCues(a, a, [0])).toEqual([])
    const b = take(a)
    expect(soundCues(b, game(), [0])).toEqual([])
  })

  it('ticks quietly for an opponent move and chimes when the turn comes back', () => {
    const a = game()
    const b = take(a) // my move: now the AI's turn
    expect(soundCues(a, b, [0])).toEqual([])
    const c = engine.applyAction(b, { type: 'takeDifferent', colors: ['green', 'black', 'red'] })
    // their move handed the turn to me: the chime replaces the tick
    expect(soundCues(b, c, [0])).toEqual(['yourTurn'])
    // seen from the other side my move is what hands them the turn
    expect(soundCues(a, b, [1])).toEqual(['yourTurn'])

    // three seats: a move by someone else that does not reach me is only a tick
    const three = engine.createGame({
      players: [
        { name: '민지', kind: 'human' },
        { name: '진주', kind: 'ai', difficulty: 'easy' },
        { name: '호박', kind: 'ai', difficulty: 'easy' },
      ],
      seed: 3,
      cards: CARDS,
      nobles: NOBLES,
    })
    expect(soundCues(three, take(three), [2])).toEqual(['opponentMove'])
  })

  it('plays buy and reserve for my own moves', () => {
    const a = game()
    const target = a.board[1][0]!
    const reserved = engine.applyAction(a, { type: 'reserveBoard', cardId: target.id })
    expect(soundCues(a, reserved, [0])).toEqual(['reserve'])
    const blind = engine.applyAction(a, { type: 'reserveDeck', tier: 1 })
    expect(soundCues(a, blind, [0])).toEqual(['reserve'])

    // give myself a hand (8 gems, so no discard follows) and buy a cheap card from the board
    const rich: GameState = {
      ...a,
      players: a.players.map((p, i) =>
        i === 0 ? { ...p, tokens: { white: 2, blue: 1, green: 1, red: 1, black: 3, gold: 0 } } : p,
      ),
    }
    const card = rich.board[1].find((c) => c && engine.canAfford(rich.players[0], c))!
    expect(card).toBeTruthy()
    const bought = engine.applyAction(rich, { type: 'buy', cardId: card.id })
    expect(bought.phase).toBe('action')
    expect(soundCues(rich, bought, [0])).toEqual(['buy'])
    expect(soundCues(rich, bought, [1])).toEqual(['yourTurn'])
  })

  it('announces a noble for whoever receives one', () => {
    const a = game()
    const noble = a.nobles[0]
    // hand the actor the matching bonus cards, then let any action end the turn
    const cards = Object.entries(noble.requirement).flatMap(([color, n]) =>
      CARDS.filter((c) => c.tier === 1 && c.bonus === color)
        .slice(0, n)
        .map((c) => ({ ...c, points: 0 })),
    )
    const staged: GameState = {
      ...a,
      players: a.players.map((p, i) => (i === 0 ? { ...p, cards } : p)),
    }
    const after = engine.applyAction(staged, { type: 'takeDifferent', colors: ['red', 'blue', 'white'] })
    expect(after.players[0].nobles.length).toBe(1)
    expect(soundCues(staged, after, [0])).toEqual(['noble'])
    expect(soundCues(staged, after, [1])).toEqual(['noble', 'yourTurn'])
  })

  it('picks the result sound by whether one of my seats won', () => {
    const a = game()
    const over: GameState = { ...a, phase: 'gameOver', winners: [1] }
    expect(resultSound(over, [0])).toBe('gameLose')
    expect(resultSound(over, [1])).toBe('gameWin')
    expect(resultSound(over, [0, 1])).toBe('gameWin')
    expect(resultSound({ ...over, winners: null }, [0])).toBe('gameLose')
  })
})
