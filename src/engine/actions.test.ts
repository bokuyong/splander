import { describe, expect, it } from 'vitest'
import type { Action, Color, GameState } from '../shared/contract'
import {
  applyAction,
  canAfford,
  getBonuses,
  getLegalActions,
  getScore,
  IllegalActionError,
  isLegal,
  tokenCount,
} from './index'
import {
  bonusCards,
  card,
  deepFreeze,
  newGame,
  patchPlayer,
  putOnBoard,
  tokenMap,
} from './testHelpers'

const illegal = (s: GameState, a: Action) => {
  expect(isLegal(s, a)).toBe(false)
  expect(() => applyAction(s, a)).toThrow(IllegalActionError)
}
const ofType = (s: GameState, type: Action['type']) => getLegalActions(s).filter((a) => a.type === type)

describe('takeDifferent', () => {
  it('takes 3 tokens of different colors and ends the turn', () => {
    const s = newGame(2)
    const action: Action = { type: 'takeDifferent', colors: ['white', 'red', 'black'] }
    const n = applyAction(s, action)
    expect(n.players[0].tokens).toEqual(tokenMap({ white: 1, red: 1, black: 1 }))
    expect(n.bank).toEqual(tokenMap({ white: 3, blue: 4, green: 4, red: 3, black: 3, gold: 5 }))
    expect(n.currentPlayer).toBe(1)
    expect(n.turn).toBe(1)
    expect(n.phase).toBe('action')
    expect(n.lastAction).toEqual({ player: 0, action })
  })

  it('refuses duplicates, gold, wrong counts and empty colors', () => {
    const s = newGame(2)
    illegal(s, { type: 'takeDifferent', colors: ['white', 'white', 'red'] })
    illegal(s, { type: 'takeDifferent', colors: ['white', 'red', 'gold' as Color] })
    illegal(s, { type: 'takeDifferent', colors: ['white', 'red'] })
    illegal(s, { type: 'takeDifferent', colors: ['white'] })
    illegal(s, { type: 'takeDifferent', colors: [] })
    illegal(s, { type: 'takeDifferent', colors: ['white', 'red', 'blue', 'green'] })
    const noRed = { ...s, bank: tokenMap({ ...s.bank, red: 0 }) }
    illegal(noRed, { type: 'takeDifferent', colors: ['white', 'red', 'blue'] })
    expect(isLegal(noRed, { type: 'takeDifferent', colors: ['white', 'green', 'blue'] })).toBe(true)
  })

  it('lists the 10 combinations when all 5 colors are available', () => {
    expect(ofType(newGame(2), 'takeDifferent')).toHaveLength(10)
  })

  it('with only 2 colors left, exactly those 2 are taken', () => {
    const s = { ...newGame(2), bank: tokenMap({ blue: 1, black: 3, gold: 5 }) }
    expect(ofType(s, 'takeDifferent')).toEqual([{ type: 'takeDifferent', colors: ['blue', 'black'] }])
    illegal(s, { type: 'takeDifferent', colors: ['blue'] })
    illegal(s, { type: 'takeDifferent', colors: ['blue', 'black', 'red'] })
    const n = applyAction(s, { type: 'takeDifferent', colors: ['black', 'blue'] })
    expect(n.players[0].tokens).toEqual(tokenMap({ blue: 1, black: 1 }))
    expect(n.bank).toEqual(tokenMap({ black: 2, gold: 5 }))
  })

  it('with only 1 color left, 1 token is taken', () => {
    const s = { ...newGame(2), bank: tokenMap({ green: 2, gold: 5 }) }
    expect(ofType(s, 'takeDifferent')).toEqual([{ type: 'takeDifferent', colors: ['green'] }])
    illegal(s, { type: 'takeDifferent', colors: [] })
    const n = applyAction(s, { type: 'takeDifferent', colors: ['green'] })
    expect(n.players[0].tokens.green).toBe(1)
    expect(n.bank.green).toBe(1)
  })

  it('with no colored token left, nothing can be taken', () => {
    const s = { ...newGame(2), bank: tokenMap({ gold: 5 }) }
    expect(ofType(s, 'takeDifferent')).toEqual([])
    illegal(s, { type: 'takeDifferent', colors: [] })
  })
})

describe('takeSame', () => {
  it('takes 2 when the bank has exactly 4', () => {
    const s = newGame(2)
    expect(s.bank.green).toBe(4)
    const n = applyAction(s, { type: 'takeSame', color: 'green' })
    expect(n.players[0].tokens).toEqual(tokenMap({ green: 2 }))
    expect(n.bank.green).toBe(2)
    expect(n.currentPlayer).toBe(1)
  })

  it('is refused when the bank has exactly 3 (or fewer)', () => {
    const s = newGame(2)
    for (const left of [3, 2, 1, 0]) {
      const t = { ...s, bank: tokenMap({ ...s.bank, green: left }) }
      illegal(t, { type: 'takeSame', color: 'green' })
      expect(ofType(t, 'takeSame')).toHaveLength(4)
    }
  })

  it('is allowed with more than 4 and never for gold', () => {
    const s = newGame(4)
    expect(isLegal(s, { type: 'takeSame', color: 'red' })).toBe(true)
    illegal(s, { type: 'takeSame', color: 'gold' as Color })
    expect(ofType(s, 'takeSame')).toHaveLength(5)
  })
})

describe('reserve', () => {
  it('reserves a face-up card, gives 1 gold and refills the slot at once', () => {
    const s = newGame(2)
    const target = s.board[2][1]!
    const top = s.decks[2][0]
    const n = applyAction(s, { type: 'reserveBoard', cardId: target.id })
    expect(n.players[0].reserved).toEqual([{ card: target, fromDeck: false }])
    expect(n.players[0].tokens.gold).toBe(1)
    expect(n.bank.gold).toBe(4)
    expect(n.board[2][1]).toEqual(top)
    expect(n.decks[2]).toHaveLength(s.decks[2].length - 1)
    expect(n.decks[2][0]).toEqual(s.decks[2][1])
    expect(n.board[2][0]).toEqual(s.board[2][0])
    expect(n.currentPlayer).toBe(1)
  })

  it('reserves the top card of a deck, flagged as hidden (fromDeck)', () => {
    const s = newGame(2)
    const top = s.decks[3][0]
    const n = applyAction(s, { type: 'reserveDeck', tier: 3 })
    expect(n.players[0].reserved).toEqual([{ card: top, fromDeck: true }])
    expect(n.players[0].tokens.gold).toBe(1)
    expect(n.decks[3]).toHaveLength(s.decks[3].length - 1)
    expect(n.board).toEqual(s.board)
  })

  it('is still legal with no gold left, but gives none', () => {
    const s = { ...newGame(2), bank: tokenMap({ ...newGame(2).bank, gold: 0 }) }
    const n = applyAction(s, { type: 'reserveBoard', cardId: s.board[1][0]!.id })
    expect(n.players[0].reserved).toHaveLength(1)
    expect(n.players[0].tokens.gold).toBe(0)
    expect(n.bank.gold).toBe(0)
    const m = applyAction(s, { type: 'reserveDeck', tier: 1 })
    expect(m.players[0].reserved).toHaveLength(1)
    expect(m.players[0].tokens.gold).toBe(0)
  })

  it('refuses a 4th reserved card', () => {
    let s = newGame(2)
    for (let i = 0; i < 3; i++) {
      s = applyAction(s, { type: 'reserveDeck', tier: 1 }) // player 0
      s = applyAction(s, { type: 'takeDifferent', colors: ['white', 'blue', 'green'] }) // player 1
      if (s.phase === 'discard') s = applyAction(s, getLegalActions(s)[0])
    }
    expect(s.currentPlayer).toBe(0)
    expect(s.players[0].reserved).toHaveLength(3)
    illegal(s, { type: 'reserveDeck', tier: 2 })
    illegal(s, { type: 'reserveBoard', cardId: s.board[1][0]!.id })
    expect(ofType(s, 'reserveBoard')).toEqual([])
    expect(ofType(s, 'reserveDeck')).toEqual([])
  })

  it('refuses an empty deck, an unknown card and another player\'s reserve', () => {
    const s = newGame(2)
    const empty = { ...s, decks: { ...s.decks, 3: [] } }
    illegal(empty, { type: 'reserveDeck', tier: 3 })
    expect(ofType(empty, 'reserveDeck')).toEqual([
      { type: 'reserveDeck', tier: 1 },
      { type: 'reserveDeck', tier: 2 },
    ])
    illegal(s, { type: 'reserveBoard', cardId: 'no-such-card' })
    illegal(s, { type: 'reserveBoard', cardId: s.decks[1][0].id })
    const n = applyAction(s, { type: 'reserveDeck', tier: 1 })
    illegal(n, { type: 'reserveBoard', cardId: n.players[0].reserved[0].card.id })
  })

  it('leaves the slot null when the deck is empty', () => {
    const s = newGame(2)
    const empty = { ...s, decks: { ...s.decks, 3: [] } }
    const n = applyAction(empty, { type: 'reserveBoard', cardId: empty.board[3][2]!.id })
    expect(n.board[3]).toHaveLength(4)
    expect(n.board[3][2]).toBeNull()
    expect(n.decks[3]).toEqual([])
    expect(ofType(patchPlayer(n, 1, {}), 'reserveBoard')).toHaveLength(11)
  })

  it('lists 12 board reservations and 3 deck reservations at the start', () => {
    const s = newGame(2)
    expect(ofType(s, 'reserveBoard')).toHaveLength(12)
    expect(ofType(s, 'reserveDeck')).toHaveLength(3)
  })
})

describe('buy', () => {
  const target = card('x-target', 1, 'red', 2, { white: 2, blue: 1 })
  const withTarget = (tokens: Parameters<typeof tokenMap>[0], bonuses = {}): GameState =>
    patchPlayer(putOnBoard(newGame(2), 1, 0, target), 0, {
      tokens: tokenMap(tokens),
      cards: bonusCards('b', bonuses),
    })

  it('pays with tokens, which go back to the bank, and refills the slot', () => {
    const s = withTarget({ white: 3, blue: 1, green: 1 })
    expect(canAfford(s.players[0], target)).toBe(true)
    const n = applyAction(s, { type: 'buy', cardId: target.id })
    expect(n.players[0].tokens).toEqual(tokenMap({ white: 1, green: 1 }))
    expect(n.bank).toEqual(tokenMap({ white: 6, blue: 5, green: 4, red: 4, black: 4, gold: 5 }))
    expect(n.players[0].cards).toEqual([target])
    expect(n.board[1][0]).toEqual(s.decks[1][0])
    expect(n.decks[1]).toHaveLength(s.decks[1].length - 1)
    expect(getScore(n.players[0])).toBe(2)
    expect(getBonuses(n.players[0]).red).toBe(1)
    expect(n.currentPlayer).toBe(1)
  })

  it('is refused when the player cannot pay', () => {
    const s = withTarget({ white: 2 })
    expect(canAfford(s.players[0], target)).toBe(false)
    illegal(s, { type: 'buy', cardId: target.id })
    expect(ofType(s, 'buy')).toEqual([])
  })

  it('refuses unknown cards, deck cards and other players\' reserved cards', () => {
    const free = card('x-free', 1, 'blue', 0)
    let s = withTarget({ white: 5, blue: 5 })
    illegal(s, { type: 'buy', cardId: 'nope' })
    s = { ...s, decks: { ...s.decks, 1: [free, ...s.decks[1]] } }
    illegal(s, { type: 'buy', cardId: free.id })
    s = patchPlayer(s, 1, { reserved: [{ card: free, fromDeck: false }] })
    s = { ...s, decks: { ...s.decks, 1: s.decks[1].slice(1) } }
    illegal(s, { type: 'buy', cardId: free.id })
  })

  it('card bonuses reduce the price', () => {
    const s = withTarget({ white: 1, blue: 3 }, { white: 1 })
    const n = applyAction(s, { type: 'buy', cardId: target.id })
    expect(n.players[0].tokens).toEqual(tokenMap({ blue: 2 }))
    expect(n.players[0].cards).toHaveLength(2)
  })

  it('bonuses exceeding the cost make the card free and never refund anything', () => {
    const s = withTarget({ white: 1, gold: 1 }, { white: 5, blue: 3 })
    expect(canAfford(s.players[0], target)).toBe(true)
    const n = applyAction(s, { type: 'buy', cardId: target.id })
    expect(n.players[0].tokens).toEqual(tokenMap({ white: 1, gold: 1 }))
    expect(n.bank).toEqual(s.bank)
    illegal(s, { type: 'buy', cardId: target.id, gold: 1 })
    illegal(s, { type: 'buy', cardId: target.id, goldFor: { white: 1 } })
  })

  it('gold fills in for missing tokens one-for-one (minimum by default)', () => {
    const s = withTarget({ white: 1, blue: 1, gold: 3 })
    expect(canAfford(s.players[0], target)).toBe(true)
    const n = applyAction(s, { type: 'buy', cardId: target.id })
    expect(n.players[0].tokens).toEqual(tokenMap({ gold: 2 }))
    expect(n.bank.gold).toBe(6)
    expect(n.bank.white).toBe(5)
    expect(n.bank.blue).toBe(5)
    // not enough gold for the shortfall
    const poor = withTarget({ gold: 2 })
    expect(canAfford(poor.players[0], target)).toBe(false)
    illegal(poor, { type: 'buy', cardId: target.id })
    const allGold = withTarget({ gold: 3 })
    expect(applyAction(allGold, { type: 'buy', cardId: target.id }).players[0].tokens.gold).toBe(0)
  })

  it('`gold` alone overpays with gold, replacing colors in COLORS order', () => {
    const s = withTarget({ white: 2, blue: 1, gold: 3 })
    const zero = applyAction(s, { type: 'buy', cardId: target.id, gold: 0 })
    expect(zero.players[0].tokens).toEqual(tokenMap({ gold: 3 }))
    const one = applyAction(s, { type: 'buy', cardId: target.id, gold: 1 })
    expect(one.players[0].tokens).toEqual(tokenMap({ white: 1, gold: 2 }))
    const two = applyAction(s, { type: 'buy', cardId: target.id, gold: 2 })
    expect(two.players[0].tokens).toEqual(tokenMap({ white: 2, gold: 1 }))
    expect(two.bank).toEqual(tokenMap({ white: 4, blue: 5, green: 4, red: 4, black: 4, gold: 7 }))
    const three = applyAction(s, { type: 'buy', cardId: target.id, gold: 3 })
    expect(three.players[0].tokens).toEqual(tokenMap({ white: 2, blue: 1 }))
  })

  it('`gold` alone: the shortfall is covered first, then the extra', () => {
    // owes white 2, blue 1; holds white 2, no blue: 1 gold is forced onto blue
    const s = withTarget({ white: 2, gold: 2 })
    illegal(s, { type: 'buy', cardId: target.id, gold: 0 })
    const n = applyAction(s, { type: 'buy', cardId: target.id, gold: 2 })
    expect(n.players[0].tokens).toEqual(tokenMap({ white: 1 }))
  })

  it('`gold` alone is validated', () => {
    const s = withTarget({ white: 2, blue: 1, gold: 5 })
    illegal(s, { type: 'buy', cardId: target.id, gold: 4 }) // more than the price
    illegal(s, { type: 'buy', cardId: target.id, gold: -1 })
    illegal(s, { type: 'buy', cardId: target.id, gold: 1.5 })
    illegal(s, { type: 'buy', cardId: target.id, gold: '1' as unknown as number })
    const few = withTarget({ white: 2, blue: 1, gold: 1 })
    illegal(few, { type: 'buy', cardId: target.id, gold: 2 }) // more than held
    const short = withTarget({ white: 1, blue: 0, gold: 3 })
    illegal(short, { type: 'buy', cardId: target.id, gold: 1 }) // below the minimum (2)
    expect(isLegal(short, { type: 'buy', cardId: target.id, gold: 2 })).toBe(true)
  })

  it('`goldFor` says exactly which colors the gold replaces', () => {
    const s = withTarget({ white: 2, blue: 1, gold: 2 })
    const n = applyAction(s, { type: 'buy', cardId: target.id, goldFor: { blue: 1 } })
    expect(n.players[0].tokens).toEqual(tokenMap({ blue: 1, gold: 1 }))
    expect(n.bank).toEqual(tokenMap({ white: 6, blue: 4, green: 4, red: 4, black: 4, gold: 6 }))
    const m = applyAction(s, { type: 'buy', cardId: target.id, goldFor: { white: 1, blue: 1 } })
    expect(m.players[0].tokens).toEqual(tokenMap({ white: 1, blue: 1 }))
    const same = applyAction(s, { type: 'buy', cardId: target.id, goldFor: {} })
    expect(same.players[0].tokens).toEqual(tokenMap({ gold: 2 }))
    // gold + goldFor must agree
    expect(isLegal(s, { type: 'buy', cardId: target.id, gold: 1, goldFor: { blue: 1 } })).toBe(true)
    illegal(s, { type: 'buy', cardId: target.id, gold: 2, goldFor: { blue: 1 } })
  })

  it('`goldFor` is validated', () => {
    const s = withTarget({ white: 2, blue: 1, gold: 2 })
    illegal(s, { type: 'buy', cardId: target.id, goldFor: { blue: 2 } }) // more than owed
    illegal(s, { type: 'buy', cardId: target.id, goldFor: { red: 1 } }) // nothing owed in red
    illegal(s, { type: 'buy', cardId: target.id, goldFor: { white: 2, blue: 1 } }) // 3 gold, holds 2
    illegal(s, { type: 'buy', cardId: target.id, goldFor: { blue: -1 } })
    illegal(s, { type: 'buy', cardId: target.id, goldFor: { blue: 0.5 } })
    illegal(s, { type: 'buy', cardId: target.id, goldFor: { gold: 1 } as never })
    illegal(s, { type: 'buy', cardId: target.id, goldFor: null as never })
    // goldFor is complete: it must also cover what the colored tokens cannot
    const short = withTarget({ white: 1, blue: 1, gold: 2 })
    illegal(short, { type: 'buy', cardId: target.id, goldFor: { blue: 1 } })
    illegal(short, { type: 'buy', cardId: target.id, goldFor: {} })
    expect(isLegal(short, { type: 'buy', cardId: target.id, goldFor: { white: 1 } })).toBe(true)
    // with bonuses the owed amount shrinks
    const bonus = withTarget({ white: 2, blue: 1, gold: 2 }, { white: 1 })
    illegal(bonus, { type: 'buy', cardId: target.id, goldFor: { white: 2 } })
    expect(isLegal(bonus, { type: 'buy', cardId: target.id, goldFor: { white: 1 } })).toBe(true)
  })

  it('buys one of the player\'s own reserved cards without touching the board', () => {
    const hidden = card('x-hidden', 2, 'black', 3, { green: 2 })
    const s = patchPlayer(newGame(2), 0, {
      tokens: tokenMap({ green: 1, gold: 1 }),
      reserved: [
        { card: card('x-other', 1, 'white', 0, { red: 4 }), fromDeck: false },
        { card: hidden, fromDeck: true },
      ],
    })
    expect(ofType(s, 'buy')).toEqual([{ type: 'buy', cardId: hidden.id }])
    const n = applyAction(s, { type: 'buy', cardId: hidden.id })
    expect(n.players[0].cards).toEqual([hidden])
    expect(n.players[0].reserved.map((r) => r.card.id)).toEqual(['x-other'])
    expect(n.players[0].tokens).toEqual(tokenMap())
    expect(n.board).toEqual(s.board)
    expect(n.decks).toEqual(s.decks)
    expect(n.bank.green).toBe(5)
    expect(n.bank.gold).toBe(6)
  })

  it('leaves the slot null when the deck is empty', () => {
    const s0 = withTarget({ white: 2, blue: 1 })
    const s = { ...s0, decks: { ...s0.decks, 1: [] } }
    const n = applyAction(s, { type: 'buy', cardId: target.id })
    expect(n.board[1][0]).toBeNull()
    expect(n.board[1]).toHaveLength(4)
  })

  it('getLegalActions lists one minimum-gold entry per affordable card', () => {
    const s = withTarget({ white: 2, gold: 4 })
    const buys = ofType(s, 'buy')
    expect(buys).toContainEqual({ type: 'buy', cardId: target.id })
    expect(new Set(buys.map((a) => (a.type === 'buy' ? a.cardId : ''))).size).toBe(buys.length)
    for (const a of buys) expect(isLegal(s, a)).toBe(true)
  })
})

describe('pass', () => {
  it('is illegal whenever another action exists', () => {
    const s = newGame(2)
    illegal(s, { type: 'pass' })
    expect(ofType(s, 'pass')).toEqual([])
    // only a reservation is possible: still no pass
    const onlyReserve = { ...s, bank: tokenMap() }
    illegal(onlyReserve, { type: 'pass' })
    expect(getLegalActions(onlyReserve).every((a) => a.type.startsWith('reserve'))).toBe(true)
  })

  it('is the only legal action when nothing else is possible', () => {
    const dear = (id: string) => ({ card: card(id, 3, 'white' as const, 4, { black: 7 }), fromDeck: false })
    let s: GameState = { ...newGame(2), bank: tokenMap({ gold: 2 }) }
    s = patchPlayer(s, 0, { reserved: [dear('d1'), dear('d2'), dear('d3')], tokens: tokenMap({ gold: 2 }) })
    expect(getLegalActions(s)).toEqual([{ type: 'pass' }])
    expect(isLegal(s, { type: 'pass' })).toBe(true)
    const n = applyAction(s, { type: 'pass' })
    expect(n.currentPlayer).toBe(1)
    expect(n.turn).toBe(1)
    expect(n.players).toEqual(s.players)
    expect(n.bank).toEqual(s.bank)
    expect(n.lastAction).toEqual({ player: 0, action: { type: 'pass' } })
  })

  it('is legal with an empty board, empty decks and an empty bank', () => {
    const s0 = newGame(2)
    const s: GameState = {
      ...s0,
      bank: tokenMap(),
      decks: { 1: [], 2: [], 3: [] },
      board: { 1: [null, null, null, null], 2: [null, null, null, null], 3: [null, null, null, null] },
    }
    expect(getLegalActions(s)).toEqual([{ type: 'pass' }])
    // one affordable reserved card removes the pass
    const t = patchPlayer(s, 0, { reserved: [{ card: card('f', 1, 'red', 0), fromDeck: true }] })
    expect(getLegalActions(t)).toEqual([{ type: 'buy', cardId: 'f' }])
    illegal(t, { type: 'pass' })
  })
})

describe('immutability', () => {
  it('never mutates the input state, whatever the action', () => {
    const target = card('x-target', 1, 'red', 2, { white: 1 })
    let s = putOnBoard(newGame(3), 1, 0, target)
    s = patchPlayer(s, 0, {
      tokens: tokenMap({ white: 3, blue: 3, green: 2, gold: 1 }),
      reserved: [{ card: card('x-res', 1, 'blue', 0, { blue: 1 }), fromDeck: true }],
    })
    deepFreeze(s)
    const snapshot = JSON.stringify(s)
    const actions: Action[] = [
      { type: 'takeDifferent', colors: ['white', 'blue', 'green'] }, // goes to discard
      { type: 'takeSame', color: 'red' }, // goes to discard
      { type: 'reserveBoard', cardId: s.board[2][0]!.id },
      { type: 'reserveDeck', tier: 3 },
      { type: 'buy', cardId: target.id, gold: 1 },
      { type: 'buy', cardId: 'x-res' },
    ]
    for (const action of actions) {
      const n = applyAction(s, action)
      expect(n).not.toBe(s)
      if (n.phase === 'discard') {
        deepFreeze(n)
        for (const d of getLegalActions(n)) expect(tokenCount(applyAction(n, d).players[0])).toBe(10)
      }
    }
    getLegalActions(s)
    expect(JSON.stringify(s)).toBe(snapshot)
  })
})
