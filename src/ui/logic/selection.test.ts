import { describe, expect, it } from 'vitest'
import type { Color, TokenMap } from '../../shared/contract'
import {
  addToSelection,
  removeFromSelection,
  requiredDifferent,
  selectionHint,
  selectionToAction,
} from './selection'

const bank = (over: Partial<TokenMap> = {}): TokenMap => ({
  white: 4,
  blue: 4,
  green: 4,
  red: 4,
  black: 4,
  gold: 5,
  ...over,
})

function pick(b: TokenMap, ...colors: Color[]): Color[] {
  let sel: Color[] = []
  for (const c of colors) {
    const r = addToSelection(b, sel, c)
    if (!r.ok) throw new Error(r.reason)
    sel = r.selection
  }
  return sel
}

describe('token selection', () => {
  it('builds a three-different move', () => {
    const b = bank()
    const sel = pick(b, 'red', 'blue')
    expect(selectionToAction(b, sel)).toBeNull()
    expect(selectionHint(b, sel)).toContain('1개 더')
    const full = pick(b, 'red', 'blue', 'white')
    expect(selectionToAction(b, full)).toEqual({
      type: 'takeDifferent',
      colors: ['red', 'blue', 'white'],
    })
    expect(addToSelection(b, full, 'green').ok).toBe(false)
  })

  it('builds a two-same move only when the bank has 4+', () => {
    const b = bank({ red: 3 })
    expect(selectionToAction(b, pick(b, 'blue', 'blue'))).toEqual({ type: 'takeSame', color: 'blue' })
    expect(addToSelection(b, ['red'], 'red').ok).toBe(false)
    // a pair is complete: nothing more can be added
    expect(addToSelection(b, ['blue', 'blue'], 'green').ok).toBe(false)
  })

  it('refuses a repeat once two different colors are picked', () => {
    expect(addToSelection(bank(), ['red', 'blue'], 'red').ok).toBe(false)
  })

  it('never lets gold or an empty pile be picked', () => {
    expect(addToSelection(bank(), [], 'gold').ok).toBe(false)
    expect(addToSelection(bank({ green: 0 }), [], 'green').ok).toBe(false)
  })

  it('needs fewer colors when the bank runs low', () => {
    const b = bank({ white: 0, blue: 0, green: 0 })
    expect(requiredDifferent(b)).toBe(2)
    expect(selectionToAction(b, ['red'])).toBeNull()
    expect(selectionToAction(b, ['red', 'black'])).toEqual({
      type: 'takeDifferent',
      colors: ['red', 'black'],
    })
    const one = bank({ white: 0, blue: 0, green: 0, red: 0, black: 2 })
    expect(selectionToAction(one, ['black'])).toEqual({ type: 'takeDifferent', colors: ['black'] })
  })

  it('removes by position', () => {
    expect(removeFromSelection(['red', 'blue', 'white'], 1)).toEqual(['red', 'white'])
  })
})
