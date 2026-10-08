// Pure rules for composing a "take gems" move in the bank tray.
// The engine stays the final judge (isLegal); this module only decides what
// the tray lets the player tap and which Action the tray stands for.
import { COLORS } from '../../shared/contract'
import type { Action, Color, TokenColor, TokenMap } from '../../shared/contract'
import { THEME } from '../../data'

export const TAKE_SAME_MIN_BANK = 4
export const TAKE_DIFFERENT_MAX = 3

/** Picked gems in tap order. Either all different, or exactly two of one color. */
export type TokenSelection = readonly Color[]

export type AddResult =
  | { ok: true; selection: Color[] }
  | { ok: false; reason: string }

export function availableColors(bank: TokenMap): Color[] {
  return COLORS.filter((color) => bank[color] > 0)
}

/** How many different colors a takeDifferent move must contain right now. */
export function requiredDifferent(bank: TokenMap): number {
  return Math.min(TAKE_DIFFERENT_MAX, availableColors(bank).length)
}

function isPair(selection: TokenSelection): boolean {
  return selection.length === 2 && selection[0] === selection[1]
}

export function addToSelection(
  bank: TokenMap,
  selection: TokenSelection,
  color: TokenColor,
): AddResult {
  if (color === 'gold') {
    return { ok: false, reason: `${THEME.tokens.gold.name}은 카드를 예약할 때만 받을 수 있어요` }
  }
  const name = THEME.tokens[color].name
  if (bank[color] <= 0) return { ok: false, reason: `보석함에 ${name} 보석이 없어요` }
  if (isPair(selection)) {
    return { ok: false, reason: '같은 색 2개를 골랐어요. 확인을 눌러 주세요' }
  }
  if (selection.length >= TAKE_DIFFERENT_MAX) {
    return { ok: false, reason: '한 번에 3개까지만 가져올 수 있어요' }
  }
  if (selection.includes(color)) {
    if (selection.length > 1) {
      return { ok: false, reason: '서로 다른 색 3개나 같은 색 2개만 가져올 수 있어요' }
    }
    if (bank[color] < TAKE_SAME_MIN_BANK) {
      return {
        ok: false,
        reason: `같은 색 2개는 보석함에 ${TAKE_SAME_MIN_BANK}개 이상 있을 때만 가능해요`,
      }
    }
    return { ok: true, selection: [...selection, color] }
  }
  return { ok: true, selection: [...selection, color] }
}

export function removeFromSelection(selection: TokenSelection, index: number): Color[] {
  return selection.filter((_, i) => i !== index)
}

/** The move the tray currently stands for, or null while it is incomplete. */
export function selectionToAction(bank: TokenMap, selection: TokenSelection): Action | null {
  if (selection.length === 0) return null
  if (isPair(selection)) {
    return bank[selection[0]] >= TAKE_SAME_MIN_BANK
      ? { type: 'takeSame', color: selection[0] }
      : null
  }
  if (new Set(selection).size !== selection.length) return null
  if (selection.some((color) => bank[color] <= 0)) return null
  if (selection.length !== requiredDifferent(bank)) return null
  return { type: 'takeDifferent', colors: [...selection] }
}

/** Short Korean guidance shown next to the tray. */
export function selectionHint(bank: TokenMap, selection: TokenSelection): string {
  if (selection.length === 0) return ''
  if (selectionToAction(bank, selection)) {
    return isPair(selection) ? '같은 색 2개' : `서로 다른 색 ${selection.length}개`
  }
  const more = requiredDifferent(bank) - selection.length
  if (selection.length === 1 && bank[selection[0]] >= TAKE_SAME_MIN_BANK) {
    return `다른 색 ${more}개 더, 또는 같은 색 한 번 더`
  }
  return `다른 색 ${more}개 더 골라요`
}
