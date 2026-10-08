// Strength ordering of the lower levels. Seats are alternated: every seed is
// played once from each seat. Results are deterministic (fixed seeds).

import { describe, expect, it } from 'vitest'
import { aiBot, describeMatch, playMatch, randomBot } from './testkit'

describe('tournaments', () => {
  it('easy beats a uniformly random legal player', () => {
    const result = playMatch(aiBot('easy'), randomBot(99), 50, 2000)
    console.log(describeMatch('easy vs random', result))
    expect(result.rateA).toBeGreaterThanOrEqual(0.85)
  }, 60_000)

  it('normal beats easy', () => {
    const result = playMatch(aiBot('normal'), aiBot('easy'), 150, 3000)
    console.log(describeMatch('normal vs easy', result))
    expect(result.rateA).toBeGreaterThanOrEqual(0.7)
  }, 60_000)
})
