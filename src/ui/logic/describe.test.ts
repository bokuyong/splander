import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../shared/contract'
import { CARDS, NOBLES } from '../../data'
import { engine } from '../../engine'
import {
  buyShortfall,
  describeAction,
  diffEvents,
  josa,
  paymentPreview,
  rankPlayers,
  shortfallText,
  tieBreakNote,
} from './describe'

const game = (): GameState =>
  engine.createGame({
    players: [
      { name: '민지', kind: 'human' },
      { name: '지호', kind: 'human' },
    ],
    seed: 9,
    cards: CARDS,
    nobles: NOBLES,
  })

const card = (id: string) => CARDS.find((c) => c.id === id)!

describe('describe helpers', () => {
  it('picks Korean particles by final consonant', () => {
    expect(josa('루비', '을', '를')).toBe('루비를')
    expect(josa('황금', '을', '를')).toBe('황금을')
    expect(josa('Jay', '이', '가')).toBe('Jay가')
  })

  it('explains what is missing for a card', () => {
    const base = game().players[0]
    const p: PlayerState = { ...base, tokens: { ...base.tokens, blue: 1, gold: 1 } }
    const c = card('t1-08') // 4 blue
    expect(buyShortfall(p, c)).toEqual({
      missing: { white: 0, blue: 3, green: 0, red: 0, black: 0 },
      short: 2,
    })
    expect(shortfallText(p, c)).toContain('사파이어 3')
    const rich: PlayerState = { ...p, tokens: { ...p.tokens, blue: 3 } }
    expect(shortfallText(rich, c)).toBeNull()
    expect(paymentPreview(rich, c)).toMatchObject({ blue: 3, gold: 1 })
    expect(engine.canAfford(rich, c)).toBe(true)
  })

  it('diffs two states into log text and token moves', () => {
    const a = game()
    const b = engine.applyAction(a, { type: 'takeDifferent', colors: ['red', 'blue', 'white'] })
    const ev = diffEvents(a, b)!
    expect(ev.actor).toBe(0)
    expect(ev.text).toBe('민지가 루비 · 사파이어 · 다이아몬드 보석을 가져왔어요')
    expect(ev.tokenMoves).toHaveLength(3)
    expect(diffEvents(b, b)).toBeNull()

    const target = b.board[1][2]!
    const c = engine.applyAction(b, { type: 'reserveBoard', cardId: target.id })
    const ev2 = diffEvents(b, c)!
    expect(ev2.changedSlots).toEqual([{ tier: 1, slot: 2 }])
    expect(ev2.tokenMoves).toEqual([{ color: 'gold', delta: 1 }])
    expect(describeAction(c, 1, { type: 'reserveDeck', tier: 2 })).toContain('몰래')
  })

  it('ranks players and explains the tie-break', () => {
    const s = game()
    const three = CARDS.filter((c) => c.points === 5).slice(0, 3)
    const five = CARDS.filter((c) => c.points === 3).slice(0, 5)
    const tied: GameState = {
      ...s,
      phase: 'gameOver',
      winners: [1],
      players: [
        { ...s.players[0], cards: five },
        { ...s.players[1], cards: three },
      ],
    }
    const rows = rankPlayers(tied)
    expect(rows.map((r) => r.seat)).toEqual([1, 0])
    expect(rows.map((r) => r.rank)).toEqual([1, 2])
    expect(tieBreakNote(tied)).toContain('지호가 3장')
    expect(tieBreakNote({ ...tied, winners: [0, 1] })).toContain('공동')
    const clear: GameState = { ...tied, players: [s.players[0], tied.players[1]] }
    expect(tieBreakNote(clear)).toBeNull()
  })
})
