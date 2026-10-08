import { describe, expect, it } from 'vitest'
import { COLORS, TIERS } from '../shared/contract'
import type { Action, GameState } from '../shared/contract'
import { applyAction, createGame, engine, getLegalActions, IllegalActionError } from './index'
import { allCardIds, fullCards, fullNobles, newGame, playerConfigs } from './testHelpers'

describe('fixture', () => {
  it('is a full-size set', () => {
    const cards = fullCards()
    expect(cards).toHaveLength(90)
    expect(cards.filter((c) => c.tier === 1)).toHaveLength(40)
    expect(cards.filter((c) => c.tier === 2)).toHaveLength(30)
    expect(cards.filter((c) => c.tier === 3)).toHaveLength(20)
    expect(new Set(cards.map((c) => c.id)).size).toBe(90)
    expect(fullNobles()).toHaveLength(10)
  })
})

describe('createGame', () => {
  it.each([
    [2, 4],
    [3, 5],
    [4, 7],
  ])('%i players: %i tokens per color, 5 gold, players + 1 nobles', (players, perColor) => {
    const s = newGame(players)
    for (const color of COLORS) expect(s.bank[color]).toBe(perColor)
    expect(s.bank.gold).toBe(5)
    expect(s.nobles).toHaveLength(players + 1)
    expect(new Set(s.nobles.map((n) => n.id)).size).toBe(players + 1)
    expect(s.players).toHaveLength(players)
  })

  it('deals 4 face-up cards per tier and keeps the rest in the decks', () => {
    const s = newGame(2)
    expect(s.decks[1]).toHaveLength(36)
    expect(s.decks[2]).toHaveLength(26)
    expect(s.decks[3]).toHaveLength(16)
    for (const tier of TIERS) {
      expect(s.board[tier]).toHaveLength(4)
      for (const c of s.board[tier]) expect(c?.tier).toBe(tier)
      for (const c of s.decks[tier]) expect(c.tier).toBe(tier)
    }
    const ids = allCardIds(s)
    expect(ids).toHaveLength(90)
    expect(new Set(ids).size).toBe(90)
  })

  it('starts with player 0, empty hands, phase action', () => {
    const s = createGame({
      players: [
        { name: 'A', kind: 'human' },
        { name: 'B', kind: 'ai', difficulty: 'hard' },
      ],
      seed: 7,
      cards: fullCards(),
      nobles: fullNobles(),
    })
    expect(s.currentPlayer).toBe(0)
    expect(s.phase).toBe('action')
    expect(s.turn).toBe(0)
    expect(s.finalRound).toBe(false)
    expect(s.winners).toBeNull()
    expect(s.lastAction).toBeNull()
    expect(s.eligibleNobles).toEqual([])
    expect(s.players[0]).toEqual({
      name: 'A',
      kind: 'human',
      tokens: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 },
      cards: [],
      reserved: [],
      nobles: [],
    })
    expect(s.players[1].kind).toBe('ai')
    expect(s.players[1].difficulty).toBe('hard')
  })

  it('shuffles the decks (not the input order)', () => {
    const cards = fullCards()
    const s = newGame(2, 3)
    const dealt = [...s.board[1].map((c) => c!.id), ...s.decks[1].map((c) => c.id)]
    expect(dealt).not.toEqual(cards.filter((c) => c.tier === 1).map((c) => c.id))
  })

  it('puts null in board slots when a tier has fewer than 4 cards', () => {
    const cards = fullCards().filter((c) => c.tier !== 3 || c.id <= 't3-02')
    const s = createGame({ players: playerConfigs(2), seed: 1, cards, nobles: fullNobles() })
    expect(s.board[3]).toHaveLength(4)
    expect(s.board[3].filter((c) => c !== null)).toHaveLength(2)
    expect(s.decks[3]).toHaveLength(0)
  })

  it('rejects fewer than 2 or more than 4 players', () => {
    const base = { seed: 1, cards: fullCards(), nobles: fullNobles() }
    expect(() => createGame({ ...base, players: playerConfigs(1) })).toThrow()
    expect(() => createGame({ ...base, players: playerConfigs(5) })).toThrow()
  })

  it('does not mutate the config', () => {
    const cards = fullCards()
    const nobles = fullNobles()
    const before = JSON.stringify({ cards, nobles })
    createGame({ players: playerConfigs(4), seed: 99, cards, nobles })
    expect(JSON.stringify({ cards, nobles })).toBe(before)
  })
})

describe('determinism', () => {
  it('the same seed gives the same game', () => {
    expect(newGame(3, 12345)).toEqual(newGame(3, 12345))
  })

  it('different seeds give different games', () => {
    const a = newGame(3, 1)
    const b = newGame(3, 2)
    expect(a.board).not.toEqual(b.board)
    const layouts = new Set<string>()
    for (let seed = 0; seed < 20; seed++) layouts.add(JSON.stringify(newGame(2, seed).board))
    expect(layouts.size).toBe(20)
  })

  it('the same seed and the same actions give the same state', () => {
    const play = (): GameState => {
      let s = newGame(4, 2024)
      for (let i = 0; i < 60 && s.phase !== 'gameOver'; i++) {
        const legal = getLegalActions(s)
        s = applyAction(s, legal[(i * 7) % legal.length])
      }
      return s
    }
    expect(play()).toEqual(play())
  })

  it('state survives a JSON round trip (it is sent over the network)', () => {
    let s = newGame(2, 5)
    s = applyAction(s, { type: 'reserveDeck', tier: 2 })
    const copy = JSON.parse(JSON.stringify(s)) as GameState
    expect(copy).toEqual(s)
    const action: Action = { type: 'takeSame', color: 'red' }
    expect(applyAction(copy, action)).toEqual(applyAction(s, action))
  })
})

describe('api surface', () => {
  it('exports a named engine object with every function', () => {
    const s = engine.createGame({
      players: playerConfigs(2),
      seed: 1,
      cards: fullCards(),
      nobles: fullNobles(),
    })
    expect(engine.getLegalActions(s).length).toBeGreaterThan(0)
    expect(engine.isLegal(s, { type: 'takeSame', color: 'blue' })).toBe(true)
    expect(engine.tokenCount(s.players[0])).toBe(0)
    expect(engine.getScore(s.players[0])).toBe(0)
    expect(engine.getBonuses(s.players[0])).toEqual({ white: 0, blue: 0, green: 0, red: 0, black: 0 })
    expect(engine.canAfford(s.players[0], s.board[3][0]!)).toBe(false)
    expect(engine.applyAction(s, { type: 'takeSame', color: 'blue' }).currentPlayer).toBe(1)
  })

  it('throws IllegalActionError carrying the action', () => {
    const s = newGame(2)
    const action: Action = { type: 'pass' }
    let caught: unknown
    try {
      applyAction(s, action)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(IllegalActionError)
    expect(caught).toBeInstanceOf(Error)
    expect((caught as IllegalActionError).action).toBe(action)
    expect((caught as IllegalActionError).name).toBe('IllegalActionError')
  })

  it('treats malformed actions as illegal instead of crashing', () => {
    const s = newGame(2)
    const bad = [
      null,
      {},
      { type: 'nope' },
      { type: 'takeDifferent' },
      { type: 'takeDifferent', colors: 'red' },
      { type: 'takeSame' },
      { type: 'reserveDeck', tier: 4 },
      { type: 'reserveBoard' },
      { type: 'buy' },
    ] as unknown as Action[]
    for (const action of bad) {
      expect(engine.isLegal(s, action)).toBe(false)
      expect(() => applyAction(s, action)).toThrow(IllegalActionError)
    }
  })
})
