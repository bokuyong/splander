// Hard against normal, plus the time a move takes.

import { describe, expect, it } from 'vitest'
import type { Difficulty, GameState } from '../shared/contract'
import { chooseAction } from './index'
import { aiBot, describeMatch, playGame, playMatch } from './testkit'
import type { Bot } from './testkit'

interface Stats {
  n: number
  mean: number
  median: number
  p95: number
  max: number
}

function stats(ms: number[]): Stats {
  const sorted = ms.slice().sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return {
    n: sorted.length,
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    median: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
  }
}

function fmt(label: string, s: Stats): string {
  return (
    `${label}: n=${s.n} mean ${s.mean.toFixed(2)} ms, median ${s.median.toFixed(2)} ms, ` +
    `p95 ${s.p95.toFixed(2)} ms, max ${s.max.toFixed(2)} ms`
  )
}

function timed(difficulty: Difficulty, sink: number[]): Bot {
  return (state: GameState) => {
    const t0 = performance.now()
    const action = chooseAction(state, difficulty)
    sink.push(performance.now() - t0)
    return action
  }
}

describe('hard', () => {
  it('beats normal clearly, within the time budget (2 players)', () => {
    const hardMs: number[] = []
    const normalMs: number[] = []
    const result = playMatch(timed('hard', hardMs), timed('normal', normalMs), 100, 4000)
    console.log(describeMatch('hard vs normal', result))
    const h = stats(hardMs)
    const n = stats(normalMs)
    console.log(fmt('hard move time, 2 players', h))
    console.log(fmt('normal move time, 2 players', n))
    expect(result.rateA).toBeGreaterThanOrEqual(0.7)
    expect(h.median).toBeLessThan(150)
    expect(h.p95).toBeLessThan(150)
    expect(n.median).toBeLessThan(5)
  }, 120_000)

  it('stays within the time budget with 4 players', () => {
    const hardMs: number[] = []
    const easyMs: number[] = []
    for (let seed = 1; seed <= 2; seed++) {
      playGame(
        [timed('hard', hardMs), aiBot('normal'), timed('easy', easyMs), timed('hard', hardMs)],
        5000 + seed,
      )
    }
    const h = stats(hardMs)
    const e = stats(easyMs)
    console.log(fmt('hard move time, 4 players', h))
    console.log(fmt('easy move time, 4 players', e))
    expect(h.median).toBeLessThan(150)
    expect(h.p95).toBeLessThan(300)
    expect(e.median).toBeLessThan(5)
  }, 60_000)
})
