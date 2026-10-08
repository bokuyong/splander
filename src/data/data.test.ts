import { describe, expect, it } from 'vitest'
import { COLORS, TIERS, TOKEN_COLORS } from '../shared/contract'
import type { Card, ColorMap, Tier } from '../shared/contract'
import { CARDS, NOBLES, THEME } from './index'

const byTier = (tier: Tier): Card[] => CARDS.filter((c) => c.tier === tier)
const total = (m: ColorMap): number => COLORS.reduce((s, c) => s + m[c], 0)
const sig = (m: ColorMap): string => COLORS.map((c) => m[c]).join(',')

describe('cards', () => {
  it('has 90 cards split 40/30/20', () => {
    expect(CARDS).toHaveLength(90)
    expect(byTier(1)).toHaveLength(40)
    expect(byTier(2)).toHaveLength(30)
    expect(byTier(3)).toHaveLength(20)
  })

  it('has unique, well-formed ids matching the tier', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(90)
    for (const tier of TIERS) {
      const ids = byTier(tier).map((c) => c.id)
      const expected = ids.map((_, i) => `t${tier}-${String(i + 1).padStart(2, '0')}`)
      expect(ids).toEqual(expected)
    }
  })

  it('has equal bonus colors per tier (8 / 6 / 4)', () => {
    const perColor: Record<Tier, number> = { 1: 8, 2: 6, 3: 4 }
    for (const tier of TIERS) {
      for (const color of COLORS) {
        expect(byTier(tier).filter((c) => c.bonus === color)).toHaveLength(perColor[tier])
      }
    }
  })

  it('keeps points within the range of each tier', () => {
    const range: Record<Tier, [number, number]> = { 1: [0, 1], 2: [1, 3], 3: [3, 5] }
    for (const c of CARDS) {
      expect(Number.isInteger(c.points)).toBe(true)
      expect(c.points).toBeGreaterThanOrEqual(range[c.tier][0])
      expect(c.points).toBeLessThanOrEqual(range[c.tier][1])
    }
  })

  it('has the exact points distribution per tier', () => {
    const hist = (tier: Tier) => {
      const h: Record<number, number> = {}
      for (const c of byTier(tier)) h[c.points] = (h[c.points] ?? 0) + 1
      return h
    }
    expect(hist(1)).toEqual({ 0: 35, 1: 5 })
    expect(hist(2)).toEqual({ 1: 10, 2: 15, 3: 5 })
    expect(hist(3)).toEqual({ 3: 5, 4: 10, 5: 5 })
    // every color has the same points profile inside a tier
    for (const tier of TIERS) {
      const profiles = COLORS.map((color) =>
        byTier(tier)
          .filter((c) => c.bonus === color)
          .map((c) => c.points)
          .sort()
          .join(','),
      )
      expect(new Set(profiles).size).toBe(1)
    }
  })

  it('has sane costs', () => {
    const totalRange: Record<Tier, [number, number]> = { 1: [3, 5], 2: [5, 8], 3: [7, 14] }
    const maxSingle: Record<Tier, number> = { 1: 4, 2: 6, 3: 7 }
    for (const c of CARDS) {
      expect(Object.keys(c.cost).sort()).toEqual([...COLORS].sort())
      for (const color of COLORS) {
        expect(Number.isInteger(c.cost[color])).toBe(true)
        expect(c.cost[color]).toBeGreaterThanOrEqual(0)
        expect(c.cost[color]).toBeLessThanOrEqual(maxSingle[c.tier])
      }
      expect(total(c.cost)).toBeGreaterThanOrEqual(totalRange[c.tier][0])
      expect(total(c.cost)).toBeLessThanOrEqual(totalRange[c.tier][1])
    }
  })

  it('has no two identical cards', () => {
    const keys = CARDS.map((c) => `${c.tier}|${c.bonus}|${c.points}|${sig(c.cost)}`)
    expect(new Set(keys).size).toBe(90)
  })

  // Note: cards costing their own bonus color DO exist in the real data
  // (6 in tier 1, 16 in tier 2, 10 in tier 3), so that count is pinned
  // instead of asserting there are none.
  it('has the known number of cards that cost their own color', () => {
    const own = (tier: Tier) => byTier(tier).filter((c) => c.cost[c.bonus] > 0).length
    expect([own(1), own(2), own(3)]).toEqual([6, 16, 10])
  })

  it('matches the checksums of the verified source', () => {
    const points = (tier: Tier) => byTier(tier).reduce((s, c) => s + c.points, 0)
    expect([points(1), points(2), points(3)]).toEqual([5, 55, 80])

    // The cost totals are perfectly symmetric across colors in every tier.
    const perColor: Record<Tier, number> = { 1: 33, 2: 41, 3: 43 }
    for (const tier of TIERS) {
      for (const color of COLORS) {
        expect(byTier(tier).reduce((s, c) => s + c.cost[color], 0)).toBe(perColor[tier])
      }
    }
    expect(CARDS.reduce((s, c) => s + total(c.cost), 0)).toBe(5 * (33 + 41 + 43))

    // Per bonus color the total cost is also identical within a tier.
    const perBonus: Record<Tier, number> = { 1: 33, 2: 41, 3: 43 }
    for (const tier of TIERS) {
      for (const color of COLORS) {
        const sum = byTier(tier)
          .filter((c) => c.bonus === color)
          .reduce((s, c) => s + total(c.cost), 0)
        expect(sum).toBe(perBonus[tier])
      }
    }

    // Position-weighted checksum: catches swapped columns or rows.
    const weighted = CARDS.reduce(
      (s, c, i) => s + (i + 1) * COLORS.reduce((t, color, j) => t + (j + 1) * c.cost[color], 0),
      0,
    )
    expect(weighted).toBe(WEIGHTED_CHECKSUM)
  })

  it('spot-checks a few well-known cards', () => {
    const find = (id: string) => CARDS.find((c) => c.id === id)!
    expect(find('t1-08')).toEqual({
      id: 't1-08', tier: 1, bonus: 'black', points: 1,
      cost: { white: 0, blue: 4, green: 0, red: 0, black: 0 },
    })
    expect(find('t2-18')).toEqual({
      id: 't2-18', tier: 2, bonus: 'white', points: 3,
      cost: { white: 6, blue: 0, green: 0, red: 0, black: 0 },
    })
    expect(find('t3-04')).toEqual({
      id: 't3-04', tier: 3, bonus: 'black', points: 5,
      cost: { white: 0, blue: 0, green: 0, red: 7, black: 3 },
    })
    expect(find('t3-17')).toEqual({
      id: 't3-17', tier: 3, bonus: 'red', points: 3,
      cost: { white: 3, blue: 5, green: 3, red: 0, black: 3 },
    })
  })
})

// sum over cards (1-based index i) of i * (1*white + 2*blue + 3*green + 4*red + 5*black),
// computed from the verified source list
const WEIGHTED_CHECKSUM = 95866

describe('guests', () => {
  it('has 10 guests worth 3 points each with unique ids and names', () => {
    expect(NOBLES).toHaveLength(10)
    for (const n of NOBLES) expect(n.points).toBe(3)
    expect(NOBLES.map((n) => n.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `n-${String(i + 1).padStart(2, '0')}`),
    )
    expect(new Set(NOBLES.map((n) => n.name)).size).toBe(10)
    for (const n of NOBLES) expect(n.name).toMatch(/[가-힣]/)
  })

  it('has five 4+4 guests and five 3+3+3 guests', () => {
    const shape = (m: ColorMap) =>
      COLORS.map((c) => m[c])
        .filter((v) => v > 0)
        .join('+')
    const shapes = NOBLES.map((n) => shape(n.requirement))
    expect(shapes.filter((s) => s === '4+4')).toHaveLength(5)
    expect(shapes.filter((s) => s === '3+3+3')).toHaveLength(5)
  })

  it('has the exact requirement set of the verified source', () => {
    // white,blue,green,red,black
    const expected = [
      '4,4,0,0,0', '0,4,4,0,0', '0,0,4,4,0', '0,0,0,4,4', '4,0,0,0,4',
      '3,3,3,0,0', '0,3,3,3,0', '0,0,3,3,3', '3,0,0,3,3', '3,3,0,0,3',
    ].sort()
    expect(NOBLES.map((n) => sig(n.requirement)).sort()).toEqual(expected)
    // each color is asked for by exactly two 4-guests and three 3-guests
    for (const color of COLORS) {
      expect(NOBLES.reduce((s, n) => s + n.requirement[color], 0)).toBe(4 * 2 + 3 * 3)
    }
  })
})

describe('theme', () => {
  it('covers every token color, tier and action', () => {
    expect(THEME.title).toBe('스플랜더')
    for (const color of TOKEN_COLORS) {
      const t = THEME.tokens[color]
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.emoji.length).toBeGreaterThan(0)
      for (const hex of [t.color, t.soft, t.ink]) expect(hex).toMatch(/^#[0-9A-F]{6}$/i)
    }
    expect(new Set(TOKEN_COLORS.map((c) => THEME.tokens[c].color)).size).toBe(6)
    for (const tier of TIERS) expect(THEME.tiers[tier].name.length).toBeGreaterThan(0)
    const actionTypes = [
      'takeDifferent', 'takeSame', 'reserveBoard', 'reserveDeck',
      'buy', 'pass', 'discard', 'chooseNoble',
    ] as const
    for (const a of actionTypes) {
      expect(THEME.actions[a].length).toBeGreaterThan(0)
      expect(THEME.actionHints[a].length).toBeGreaterThan(0)
    }
  })
})
