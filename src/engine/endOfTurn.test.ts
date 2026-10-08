import { describe, expect, it } from 'vitest'
import type { Action, GameState } from '../shared/contract'
import { applyAction, getLegalActions, getScore, IllegalActionError, isLegal, tokenCount } from './index'
import { bonusCards, card, newGame, noble, patchPlayer, putOnBoard, tokenMap, totalTokens } from './testHelpers'

const illegal = (s: GameState, a: Action) => {
  expect(isLegal(s, a)).toBe(false)
  expect(() => applyAction(s, a)).toThrow(IllegalActionError)
}

describe('discard down to 10', () => {
  const at = (tokens: Parameters<typeof tokenMap>[0]) =>
    patchPlayer(newGame(4), 0, { tokens: tokenMap(tokens) })

  it('holding exactly 10 after the action ends the turn normally', () => {
    const n = applyAction(at({ white: 4, blue: 3 }), { type: 'takeDifferent', colors: ['red', 'green', 'black'] })
    expect(n.phase).toBe('action')
    expect(n.currentPlayer).toBe(1)
    expect(tokenCount(n.players[0])).toBe(10)
  })

  it('more than 10 puts the same player in the discard phase', () => {
    const s = at({ white: 5, blue: 4 })
    const n = applyAction(s, { type: 'takeDifferent', colors: ['red', 'green', 'black'] })
    expect(n.phase).toBe('discard')
    expect(n.currentPlayer).toBe(0)
    expect(n.turn).toBe(0)
    expect(tokenCount(n.players[0])).toBe(12)
    // nothing but a discard is accepted
    illegal(n, { type: 'takeSame', color: 'white' })
    illegal(n, { type: 'pass' })
    illegal(n, { type: 'reserveDeck', tier: 1 })
    illegal(n, { type: 'chooseNoble', nobleId: n.nobles[0].id })
    expect(getLegalActions(n).every((a) => a.type === 'discard')).toBe(true)
  })

  it('must return exactly the excess, in any colors including gold', () => {
    const s = at({ white: 5, blue: 4, gold: 1 })
    const n = applyAction(s, { type: 'takeSame', color: 'red' }) // 12 tokens
    expect(n.phase).toBe('discard')
    illegal(n, { type: 'discard', tokens: { white: 1 } }) // too few
    illegal(n, { type: 'discard', tokens: { white: 3 } }) // too many
    illegal(n, { type: 'discard', tokens: {} })
    illegal(n, { type: 'discard', tokens: { gold: 2 } }) // holds only 1 gold
    illegal(n, { type: 'discard', tokens: { green: 2 } }) // holds none
    illegal(n, { type: 'discard', tokens: { white: 3, blue: -1 } })
    illegal(n, { type: 'discard', tokens: { white: 1.5, blue: 0.5 } })
    illegal(n, { type: 'discard', tokens: { purple: 2 } as never })

    const d = applyAction(n, { type: 'discard', tokens: { gold: 1, red: 1, green: 0 } })
    expect(d.players[0].tokens).toEqual(tokenMap({ white: 5, blue: 4, red: 1 }))
    expect(tokenCount(d.players[0])).toBe(10)
    expect(d.bank).toEqual(tokenMap({ white: 7, blue: 7, green: 7, red: 6, black: 7, gold: 6 }))
    expect(totalTokens(d)).toEqual(totalTokens(s))
    expect(d.phase).toBe('action')
    expect(d.currentPlayer).toBe(1)
    expect(d.turn).toBe(1)
    expect(d.lastAction?.action.type).toBe('discard')
  })

  it('a reservation whose gold makes 11 tokens also triggers a discard', () => {
    const s = at({ white: 5, blue: 5 })
    const n = applyAction(s, { type: 'reserveDeck', tier: 1 })
    expect(n.phase).toBe('discard')
    const d = applyAction(n, { type: 'discard', tokens: { gold: 1 } })
    expect(tokenCount(d.players[0])).toBe(10)
    expect(d.players[0].reserved).toHaveLength(1)
  })

  it('getLegalActions enumerates every distinct way to get down to 10', () => {
    // white 6, blue 5, gold 1 = 12: ww, wb, wg, bb, bg
    let s = at({ white: 6, blue: 5, gold: 1 })
    s = { ...s, phase: 'discard' }
    const legal = getLegalActions(s)
    expect(legal).toHaveLength(5)
    expect(new Set(legal.map((a) => JSON.stringify(a))).size).toBe(5)
    expect(legal).toContainEqual({ type: 'discard', tokens: { white: 1, gold: 1 } })
    expect(legal).toContainEqual({ type: 'discard', tokens: { blue: 2 } })
    for (const a of legal) {
      expect(isLegal(s, a)).toBe(true)
      expect(tokenCount(applyAction(s, a).players[0])).toBe(10)
    }
    // 13 tokens over 6 colors (3,2,2,2,2,2), remove 3: 6 (aab... ) -> count multisets
    let t = at({ white: 3, blue: 2, green: 2, red: 2, black: 2, gold: 2 })
    t = { ...t, phase: 'discard' }
    // 3 distinct: C(6,3)=20; one pair + one other: 6*5=30; triple: only white = 1
    expect(getLegalActions(t)).toHaveLength(51)
  })

  it('discard is illegal outside the discard phase', () => {
    illegal(at({ white: 5 }), { type: 'discard', tokens: {} })
    illegal(at({ white: 5 }), { type: 'discard', tokens: { white: 1 } })
  })
})

describe('nobles', () => {
  const n1 = noble('n-a', { red: 3, green: 3 })
  const n2 = noble('n-b', { red: 3, blue: 3 })
  const n3 = noble('n-c', { black: 4, white: 4 })
  const base = (bonuses: Parameters<typeof bonusCards>[1], nobles = [n1, n2, n3]): GameState =>
    patchPlayer({ ...newGame(2), nobles }, 0, { cards: bonusCards('b', bonuses) })

  it('a single satisfied noble is received automatically at the end of the turn', () => {
    const s = base({ red: 3, green: 3 })
    const n = applyAction(s, { type: 'takeSame', color: 'white' })
    expect(n.players[0].nobles).toEqual([n1])
    expect(n.nobles).toEqual([n2, n3])
    expect(getScore(n.players[0])).toBe(3)
    expect(n.phase).toBe('action')
    expect(n.currentPlayer).toBe(1)
  })

  it('buying the card that completes the requirement brings the noble the same turn', () => {
    const last = card('x-last', 1, 'green', 0)
    const s = putOnBoard(base({ red: 3, green: 2 }), 1, 0, last)
    const before = applyAction(s, { type: 'takeSame', color: 'white' })
    expect(before.players[0].nobles).toEqual([])
    const n = applyAction(s, { type: 'buy', cardId: last.id })
    expect(n.players[0].nobles).toEqual([n1])
  })

  it('tokens do not count toward a noble, and exceeding the requirement is fine', () => {
    const s = patchPlayer(base({ red: 2, green: 5 }), 0, { tokens: tokenMap({ red: 4 }) })
    expect(applyAction(s, { type: 'takeSame', color: 'white' }).players[0].nobles).toEqual([])
    const t = base({ red: 5, green: 4, white: 1 })
    expect(applyAction(t, { type: 'takeSame', color: 'white' }).players[0].nobles).toEqual([n1])
  })

  it('only the current player is checked', () => {
    const s = patchPlayer({ ...newGame(2), nobles: [n1] }, 1, { cards: bonusCards('b', { red: 3, green: 3 }) })
    const n = applyAction(s, { type: 'takeSame', color: 'white' })
    expect(n.players[1].nobles).toEqual([])
    expect(n.nobles).toEqual([n1])
    const m = applyAction(n, { type: 'takeSame', color: 'blue' })
    expect(m.players[1].nobles).toEqual([n1])
  })

  it('several satisfied nobles: the player chooses one, and only one per turn', () => {
    const s = base({ red: 3, green: 3, blue: 3 })
    const n = applyAction(s, { type: 'takeSame', color: 'white' })
    expect(n.phase).toBe('chooseNoble')
    expect(n.currentPlayer).toBe(0)
    expect(n.eligibleNobles).toEqual(['n-a', 'n-b'])
    expect(n.players[0].nobles).toEqual([])
    expect(getLegalActions(n)).toEqual([
      { type: 'chooseNoble', nobleId: 'n-a' },
      { type: 'chooseNoble', nobleId: 'n-b' },
    ])
    illegal(n, { type: 'chooseNoble', nobleId: 'n-c' })
    illegal(n, { type: 'chooseNoble', nobleId: 'nope' })
    illegal(n, { type: 'takeSame', color: 'blue' })
    illegal(n, { type: 'pass' })
    illegal(n, { type: 'discard', tokens: {} })

    const c = applyAction(n, { type: 'chooseNoble', nobleId: 'n-b' })
    expect(c.players[0].nobles).toEqual([n2])
    expect(c.nobles).toEqual([n1, n3])
    expect(c.eligibleNobles).toEqual([])
    expect(c.phase).toBe('action')
    expect(c.currentPlayer).toBe(1)
    expect(c.turn).toBe(1)

    // the other noble comes at the end of that player's next turn
    const d = applyAction(c, { type: 'takeSame', color: 'blue' })
    expect(d.players[0].nobles).toEqual([n2])
    const e = applyAction(d, { type: 'takeSame', color: 'green' })
    expect(e.players[0].nobles).toEqual([n2, n1])
    expect(e.nobles).toEqual([n3])
    expect(getScore(e.players[0])).toBe(6)
  })

  it('chooseNoble is illegal outside its phase', () => {
    illegal(base({ red: 3, green: 3 }), { type: 'chooseNoble', nobleId: 'n-a' })
  })

  it('the discard comes before the noble check', () => {
    const s = patchPlayer(base({ red: 3, green: 3, blue: 3 }), 0, {
      tokens: tokenMap({ white: 5, black: 4 }),
      cards: bonusCards('b', { red: 3, green: 3, blue: 3 }),
    })
    const n = applyAction(s, { type: 'takeSame', color: 'red' })
    expect(n.phase).toBe('discard')
    expect(n.players[0].nobles).toEqual([])
    expect(n.eligibleNobles).toEqual([])
    const d = applyAction(n, { type: 'discard', tokens: { white: 1 } })
    expect(d.phase).toBe('chooseNoble')
    expect(d.currentPlayer).toBe(0)
    const c = applyAction(d, { type: 'chooseNoble', nobleId: 'n-a' })
    expect(c.currentPlayer).toBe(1)
    expect(c.players[0].nobles).toEqual([n1])

    const single = patchPlayer(base({ red: 3, green: 3 }), 0, {
      tokens: tokenMap({ white: 5, black: 4 }),
      cards: bonusCards('b', { red: 3, green: 3 }),
    })
    const afterDiscard = applyAction(applyAction(single, { type: 'takeSame', color: 'red' }), {
      type: 'discard',
      tokens: { red: 1 },
    })
    expect(afterDiscard.players[0].nobles).toEqual([n1])
    expect(afterDiscard.currentPlayer).toBe(1)
  })

  it('a noble can bring the player to 15 and trigger the final round', () => {
    const s = patchPlayer(base({ red: 3, green: 3 }), 0, {
      cards: [...bonusCards('b', { red: 3, green: 3 }), card('big', 3, 'white', 12)],
    })
    const n = applyAction(s, { type: 'takeSame', color: 'white' })
    expect(getScore(n.players[0])).toBe(15)
    expect(n.finalRound).toBe(true)
    expect(n.phase).toBe('action')
  })
})

describe('end of the game', () => {
  const winning = card('x-win', 1, 'red', 1) // free, 1 point
  const fourteen = (id: string) => card(id, 3, 'blue', 14)
  const anyAction = (s: GameState): Action => getLegalActions(s).find((a) => a.type === 'takeDifferent')!

  it('nothing ends below 15 points', () => {
    let s = putOnBoard(newGame(2), 1, 0, winning)
    s = patchPlayer(s, 1, { cards: [card('p13', 3, 'blue', 13)] })
    s = { ...s, currentPlayer: 1 }
    const n = applyAction(s, { type: 'buy', cardId: winning.id })
    expect(getScore(n.players[1])).toBe(14)
    expect(n.finalRound).toBe(false)
    expect(n.phase).toBe('action')
    expect(n.winners).toBeNull()
    expect(n.currentPlayer).toBe(0)
  })

  for (const players of [2, 3, 4]) {
    for (let seat = 0; seat < players; seat++) {
      it(`${players} players, seat ${seat} reaches 15: the round is completed, then the game ends`, () => {
        let s = putOnBoard(newGame(players), 1, 0, winning)
        s = patchPlayer(s, seat, { cards: [fourteen('p14')] })
        s = { ...s, currentPlayer: seat, turn: seat }
        s = applyAction(s, { type: 'buy', cardId: winning.id })
        expect(s.finalRound).toBe(true)
        expect(getScore(s.players[seat])).toBe(15)

        for (let next = seat + 1; next < players; next++) {
          expect(s.phase).toBe('action')
          expect(s.winners).toBeNull()
          expect(s.currentPlayer).toBe(next)
          expect(s.finalRound).toBe(true)
          s = applyAction(s, anyAction(s))
        }
        expect(s.phase).toBe('gameOver')
        expect(s.winners).toEqual([seat])
        // everyone has played the same number of turns: the last seat moved last
        expect(s.currentPlayer).toBe(players - 1)
        expect(s.turn).toBe(players - 1)
        expect(getLegalActions(s)).toEqual([])
        illegal(s, { type: 'pass' })
        illegal(s, { type: 'takeSame', color: 'white' })
      })
    }
  }

  it('a later player can overtake during the final round', () => {
    let s = putOnBoard(newGame(3), 1, 0, winning)
    s = putOnBoard(s, 1, 1, card('x-big', 1, 'green', 3))
    s = patchPlayer(s, 0, { cards: [fourteen('a')] })
    s = patchPlayer(s, 2, { cards: [fourteen('c')] })
    s = applyAction(s, { type: 'buy', cardId: winning.id }) // seat 0: 15
    s = applyAction(s, anyAction(s)) // seat 1
    expect(s.phase).toBe('action')
    s = applyAction(s, { type: 'buy', cardId: 'x-big' }) // seat 2: 17
    expect(s.phase).toBe('gameOver')
    expect(s.winners).toEqual([2])
  })

  it('the final round also waits for a pending discard and noble choice', () => {
    const nA = noble('n-a', { red: 1 })
    const nB = noble('n-b', { red: 1 })
    let s: GameState = { ...newGame(2), nobles: [nA, nB], currentPlayer: 1, turn: 1 }
    s = patchPlayer(s, 1, {
      cards: [card('p12', 3, 'red', 12)],
      tokens: tokenMap({ white: 5, black: 4 }),
    })
    s = applyAction(s, { type: 'takeSame', color: 'blue' })
    expect(s.phase).toBe('discard')
    expect(s.finalRound).toBe(false)
    s = applyAction(s, { type: 'discard', tokens: { blue: 1 } })
    expect(s.phase).toBe('chooseNoble')
    expect(s.winners).toBeNull()
    s = applyAction(s, { type: 'chooseNoble', nobleId: 'n-b' })
    expect(s.phase).toBe('gameOver')
    expect(s.finalRound).toBe(true)
    expect(s.winners).toEqual([1])
    expect(getScore(s.players[1])).toBe(15)
  })

  describe('winner', () => {
    // seat 1 (last seat of a 2-player game) makes the last move of the final round
    const finish = (cards0: ReturnType<typeof card>[], cards1: ReturnType<typeof card>[]): GameState => {
      let s: GameState = { ...newGame(2), currentPlayer: 1, turn: 1, finalRound: true }
      s = patchPlayer(s, 0, { cards: cards0 })
      s = patchPlayer(s, 1, { cards: cards1 })
      return applyAction(s, { type: 'takeSame', color: 'white' })
    }

    it('highest score wins, whatever the number of cards', () => {
      const s = finish(
        [card('a1', 1, 'red', 4), card('a2', 1, 'red', 4), card('a3', 1, 'red', 4), card('a4', 1, 'red', 4)],
        [card('b1', 3, 'red', 15)],
      )
      expect(s.phase).toBe('gameOver')
      expect(s.winners).toEqual([0])
    })

    it('a tie is broken by the fewest purchased cards', () => {
      expect(finish([card('a1', 1, 'red', 8), card('a2', 1, 'red', 7)], [card('b1', 3, 'red', 15)]).winners).toEqual([1])
      expect(finish([card('a1', 3, 'red', 15)], [card('b1', 1, 'red', 8), card('b2', 1, 'red', 7)]).winners).toEqual([0])
    })

    it('nobles count for the score but not as purchased cards', () => {
      let s: GameState = { ...newGame(2), nobles: [], currentPlayer: 1, turn: 1, finalRound: true }
      s = patchPlayer(s, 0, { cards: [card('a1', 3, 'red', 12)], nobles: [noble('n-x', { red: 1 })] })
      s = patchPlayer(s, 1, { cards: [card('b1', 1, 'red', 8), card('b2', 1, 'red', 7)] })
      expect(applyAction(s, { type: 'takeSame', color: 'white' }).winners).toEqual([0])
    })

    it('a full tie makes every tied player a winner', () => {
      expect(finish([card('a1', 3, 'red', 15)], [card('b1', 3, 'red', 15)]).winners).toEqual([0, 1])
      let s: GameState = { ...newGame(3), currentPlayer: 2, turn: 2, finalRound: true }
      s = patchPlayer(s, 0, { cards: [card('a1', 3, 'red', 16)] })
      s = patchPlayer(s, 1, { cards: [card('b1', 3, 'red', 15)] })
      s = patchPlayer(s, 2, { cards: [card('c1', 3, 'red', 16)] })
      expect(applyAction(s, { type: 'takeSame', color: 'white' }).winners).toEqual([0, 2])
    })
  })
})
