// 귀족 10명. Each is worth 3 points. Requirements count card bonuses
// (보석 할인), not tokens, and follow the original rules exactly:
// five nobles need 4+4 of two colors, five need 3+3+3 of three colors.
// Titles are invented for this game, not the historical figures of the original.
import type { Noble } from '../shared/contract'

function n(
  id: string,
  name: string,
  white: number,
  blue: number,
  green: number,
  red: number,
  black: number,
): Noble {
  return { id, name, points: 3, requirement: { white, blue, green, red, black } }
}

// Argument order after name: white, blue, green, red, black.
export const NOBLES: Noble[] = [
  n('n-01', '공작 부인', 4, 4, 0, 0, 0),
  n('n-02', '대상인 길드장', 0, 4, 4, 0, 0),
  n('n-03', '추기경', 0, 0, 4, 4, 0),
  n('n-04', '백작', 0, 0, 0, 4, 4),
  n('n-05', '항해왕', 4, 0, 0, 0, 4),
  n('n-06', '왕실 보석상', 3, 3, 3, 0, 0),
  n('n-07', '궁정 화가', 0, 3, 3, 3, 0),
  n('n-08', '후작 부인', 0, 0, 3, 3, 3),
  n('n-09', '총독', 3, 0, 0, 3, 3),
  n('n-10', '대공', 3, 3, 0, 0, 3),
]
