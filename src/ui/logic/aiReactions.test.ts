import { describe, expect, it } from 'vitest'
import type { Action, GameState } from '../../shared/contract'
import { CARDS, NOBLES } from '../../data'
import { engine } from '../../engine'
import { BIG_CARD_POINTS, REACTION_GAP_TURNS, aiReaction, aiSeats } from './aiReactions'

const HUMAN = 0
const AI = 1

const game = (seed = 9): GameState =>
  engine.createGame({
    players: [
      { name: '민지', kind: 'human' },
      { name: '토끼', kind: 'ai', difficulty: 'normal' },
    ],
    seed,
    cards: CARDS,
    nobles: NOBLES,
  })

const bigCard = CARDS.find((c) => c.points >= BIG_CARD_POINTS)!
const smallCard = CARDS.find((c) => c.points === 0)!

/** `prev` after `seat` did `action`, with optional extras on that seat's player. */
function after(
  prev: GameState,
  seat: number,
  action: Action,
  extra: Partial<GameState['players'][number]> = {},
  patch: Partial<GameState> = {},
): GameState {
  return {
    ...prev,
    players: prev.players.map((p, i) => (i === seat ? { ...p, ...extra } : p)),
    currentPlayer: (seat + 1) % prev.players.length,
    turn: prev.turn + 1,
    lastAction: { player: seat, action },
    ...patch,
  }
}

describe('aiReaction', () => {
  it('gloats after its own big card or noble, and only then', () => {
    const prev = game()
    const big = after(prev, AI, { type: 'buy', cardId: bigCard.id }, { cards: [bigCard] })
    expect(['cool', 'lucky']).toContain(aiReaction(prev, big, AI, null))
    const noble = after(prev, AI, { type: 'buy', cardId: smallCard.id }, { cards: [smallCard], nobles: [NOBLES[0]] })
    expect(['cool', 'lucky']).toContain(aiReaction(prev, noble, AI, null))
    const small = after(prev, AI, { type: 'buy', cardId: smallCard.id }, { cards: [smallCard] })
    expect(aiReaction(prev, small, AI, null)).toBeNull()
    const gems = after(prev, AI, { type: 'takeSame', color: 'red' })
    expect(aiReaction(prev, gems, AI, null)).toBeNull()
  })

  it('applauds a human who takes a noble, not one who merely buys', () => {
    const prev = game()
    const noble = after(prev, HUMAN, { type: 'buy', cardId: smallCard.id }, { cards: [smallCard], nobles: [NOBLES[2]] })
    expect(['clap', 'nice']).toContain(aiReaction(prev, noble, AI, null))
    const buy = after(prev, HUMAN, { type: 'buy', cardId: bigCard.id }, { cards: [bigCard] })
    expect(aiReaction(prev, buy, AI, null)).toBeNull()
  })

  it('reacts to the end of the game whatever the gap', () => {
    const prev = game()
    const lost = after(prev, HUMAN, { type: 'pass' }, {}, { phase: 'gameOver', winners: [HUMAN] })
    expect(aiReaction(prev, lost, AI, prev.turn)).toBe('cry')
    const won = after(prev, AI, { type: 'pass' }, {}, { phase: 'gameOver', winners: [AI] })
    expect(aiReaction(prev, won, AI, prev.turn)).toBe('cool')
    // ... but not twice for the same ending
    expect(aiReaction(lost, { ...lost, turn: lost.turn + 1 }, AI, null)).toBeNull()
  })

  it('keeps quiet for a few turns after speaking', () => {
    const prev = { ...game(), turn: 10 }
    const next = after(prev, AI, { type: 'buy', cardId: bigCard.id }, { cards: [bigCard] })
    expect(aiReaction(prev, next, AI, next.turn - 1)).toBeNull()
    expect(aiReaction(prev, next, AI, next.turn - REACTION_GAP_TURNS + 1)).toBeNull()
    expect(aiReaction(prev, next, AI, next.turn - REACTION_GAP_TURNS)).not.toBeNull()
  })

  it('is deterministic and uses both variants over time', () => {
    const seen = new Set<string>()
    for (let turn = 0; turn < 24; turn++) {
      const prev = { ...game(), turn }
      const next = after(prev, AI, { type: 'buy', cardId: bigCard.id }, { cards: [bigCard] })
      const a = aiReaction(prev, next, AI, null)
      const b = aiReaction(prev, next, AI, null)
      expect(a).toBe(b)
      if (a) seen.add(a)
    }
    expect([...seen].sort()).toEqual(['cool', 'lucky'])
  })

  it('never speaks for a human seat, and lists AI seats', () => {
    const prev = game()
    const next = after(prev, HUMAN, { type: 'buy', cardId: bigCard.id }, { cards: [bigCard] })
    expect(aiReaction(prev, next, HUMAN, null)).toBeNull()
    expect(aiReaction(prev, prev, AI, null)).toBeNull()
    expect(aiSeats(prev)).toEqual([AI])
  })
})
