// The AI must not use hidden information: its choice has to be the same when
// deck contents and other players' blind reserves are replaced by placeholders
// (as the online layer does), or simply rearranged.

import { describe, expect, it } from 'vitest'
import { TIERS } from '../shared/contract'
import type { Card, Difficulty, GameState, Tier } from '../shared/contract'
import { chooseAction } from './index'
import { aiBot, playGame, randomBot, redactFor } from './testkit'

// Same public position, different secrets: decks reversed and every blind
// reserve of another player swapped for a card from the bottom of a deck.
function scramble(state: GameState): GameState {
  const decks = {} as Record<Tier, Card[]>
  for (const tier of TIERS) decks[tier] = state.decks[tier].slice().reverse()
  const players = state.players.map((player, p) =>
    p === state.currentPlayer
      ? player
      : {
          ...player,
          reserved: player.reserved.map((r) => {
            const deck = decks[r.card.tier]
            return r.fromDeck && deck.length > 0 ? { card: deck[0], fromDeck: true } : r
          }),
        },
  )
  return { ...state, decks, players, rngState: (state.rngState ^ 0x5bd1e995) >>> 0 }
}

describe('fairness', () => {
  const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard']

  it('chooses the same action with hidden information redacted or scrambled', () => {
    let checked = 0
    let withBlindReserve = 0
    let step = 0
    for (let seed = 1; seed <= 4; seed++) {
      // the random seat reserves from the decks all the time
      const bots = [aiBot('normal'), randomBot(seed), aiBot('easy')].slice(0, 2 + (seed % 2))
      playGame(bots, 300 + seed, (state) => {
        step += 1
        const blind = state.players.some(
          (p, i) => i !== state.currentPlayer && p.reserved.some((r) => r.fromDeck),
        )
        const redacted = redactFor(state, state.currentPlayer)
        const scrambled = scramble(state)
        for (const difficulty of DIFFICULTIES) {
          // the search is slower, so it is only sampled
          if (difficulty === 'hard' && step % 5 !== 0) continue
          const open = chooseAction(state, difficulty)
          expect(chooseAction(redacted, difficulty)).toEqual(open)
          expect(chooseAction(scrambled, difficulty)).toEqual(open)
          checked += 1
          if (blind) withBlindReserve += 1
        }
      })
    }
    expect(checked).toBeGreaterThan(300)
    expect(withBlindReserve).toBeGreaterThan(50)
  }, 60_000)

  it('is deterministic', () => {
    playGame([aiBot('normal'), aiBot('easy')], 77, (state) => {
      for (const difficulty of ['easy', 'normal'] as Difficulty[]) {
        expect(chooseAction(state, difficulty)).toEqual(chooseAction(state, difficulty))
      }
    })
  })
})
