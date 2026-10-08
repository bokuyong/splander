import { describe, expect, it } from 'vitest'
import { COLORS, TIERS, TOKEN_COLORS } from '../shared/contract'
import type { Action, GameState } from '../shared/contract'
import { applyAction, getLegalActions, getScore, isLegal, tokenCount } from './index'
import { allCardIds, deepFreeze, newGame, totalTokens } from './testHelpers'

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function checkInvariants(s: GameState, initial: GameState): void {
  const n = s.players.length
  // tokens: conserved per color, never negative
  expect(totalTokens(s)).toEqual(totalTokens(initial))
  for (const c of TOKEN_COLORS) {
    expect(s.bank[c]).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(s.bank[c])).toBe(true)
    for (const p of s.players) {
      expect(p.tokens[c]).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(p.tokens[c])).toBe(true)
    }
  }
  // cards: all 90, each exactly once
  const ids = allCardIds(s)
  expect(ids.length).toBe(90)
  expect(new Set(ids).size).toBe(90)
  // nobles: conserved
  const nobleIds = [...s.nobles, ...s.players.flatMap((p) => p.nobles)].map((x) => x.id)
  expect(nobleIds.length).toBe(n + 1)
  expect(new Set(nobleIds).size).toBe(n + 1)
  // board shape: 4 slots, holes only once the deck ran out
  for (const tier of TIERS) {
    expect(s.board[tier].length).toBe(4)
    if (s.board[tier].some((c) => c === null)) expect(s.decks[tier].length).toBe(0)
  }
  // hand limits
  s.players.forEach((p, i) => {
    expect(p.reserved.length).toBeLessThanOrEqual(3)
    const overLimitAllowed = s.phase === 'discard' && i === s.currentPlayer
    if (!overLimitAllowed) expect(tokenCount(p)).toBeLessThanOrEqual(10)
  })
  if (s.phase === 'discard') expect(tokenCount(s.players[s.currentPlayer])).toBeGreaterThan(10)
  if (s.phase === 'chooseNoble') expect(s.eligibleNobles.length).toBeGreaterThan(1)
  else expect(s.eligibleNobles).toEqual([])
  expect(s.currentPlayer).toBe(s.phase === 'gameOver' ? n - 1 : s.turn % n)
  expect(s.winners === null).toBe(s.phase !== 'gameOver')
  if (!s.finalRound) for (const p of s.players) if (p !== s.players[s.currentPlayer]) expect(getScore(p)).toBeLessThan(15)
}

function pick(s: GameState, rand: () => number): Action {
  const legal = getLegalActions(s)
  expect(legal.length).toBeGreaterThan(0)
  if (legal.some((a) => a.type === 'pass')) expect(legal).toEqual([{ type: 'pass' }])
  else expect(isLegal(s, { type: 'pass' })).toBe(false)
  const buys = legal.filter((a) => a.type === 'buy')
  let action = buys.length > 0 && rand() < 0.8 ? buys[Math.floor(rand() * buys.length)] : legal[Math.floor(rand() * legal.length)]
  // sometimes overpay with gold
  if (action.type === 'buy' && rand() < 0.3) {
    const overpay: Action = { ...action, gold: Math.floor(rand() * (s.players[s.currentPlayer].tokens.gold + 1)) }
    if (isLegal(s, overpay)) action = overpay
  }
  return action
}

describe('fuzz', () => {
  it('plays 300 random games to completion while keeping every invariant', () => {
    const stats = { steps: 0, discards: 0, nobleChoices: 0, passes: 0, ties: 0, nobles: 0, overpaid: 0 }
    for (let game = 0; game < 300; game++) {
      const players = 2 + (game % 3)
      const rand = rng(1000 + game)
      const initial = deepFreeze(newGame(players, game * 7919 + 1))
      let s = initial
      checkInvariants(s, initial)
      let steps = 0
      while (s.phase !== 'gameOver') {
        const action = pick(s, rand)
        expect(isLegal(s, action)).toBe(true)
        const mover = s.currentPlayer
        const before = s.players[mover]
        s = deepFreeze(applyAction(s, action)) // frozen: any later mutation would throw
        expect(s.lastAction).toEqual({ player: mover, action })
        checkInvariants(s, initial)
        // at most one noble per turn step
        expect(s.players[mover].nobles.length - before.nobles.length).toBeLessThanOrEqual(1)
        if (action.type === 'discard') stats.discards++
        if (action.type === 'chooseNoble') stats.nobleChoices++
        if (action.type === 'pass') stats.passes++
        if (action.type === 'buy' && action.gold !== undefined) stats.overpaid++
        steps++
        if (steps > 20000) throw new Error(`game ${game} did not finish`)
      }
      stats.steps += steps
      // end state
      const scores = s.players.map(getScore)
      const best = Math.max(...scores)
      expect(best).toBeGreaterThanOrEqual(15)
      expect(s.finalRound).toBe(true)
      expect((s.turn + 1) % players).toBe(0) // same number of turns for everyone
      const top = scores.map((_, i) => i).filter((i) => scores[i] === best)
      const fewest = Math.min(...top.map((i) => s.players[i].cards.length))
      expect(s.winners).toEqual(top.filter((i) => s.players[i].cards.length === fewest))
      if (s.winners!.length > 1) stats.ties++
      stats.nobles += s.players.reduce((sum, p) => sum + p.nobles.length, 0)
      expect(getLegalActions(s)).toEqual([])
      expect(JSON.parse(JSON.stringify(s))).toEqual(s)
      for (const c of COLORS) expect(initial.bank[c]).toBe(players === 2 ? 4 : players === 3 ? 5 : 7)
    }
    console.log('fuzz stats', JSON.stringify(stats))
    expect(stats.discards).toBeGreaterThan(0)
    expect(stats.nobles).toBeGreaterThan(0)
  }, 120_000)
})
