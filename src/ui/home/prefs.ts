// Remembered setup choices (names, difficulty). Purely a convenience.
import type { Difficulty } from '../../shared/contract'

export interface Prefs {
  name: string
  difficulty: Difficulty
  aiCount: number
  localNames: string[]
}

const KEY = 'moonlit-garden:prefs:v1'
const DEFAULTS: Prefs = { name: '', difficulty: 'normal', aiCount: 1, localNames: ['', ''] }

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const p = JSON.parse(raw) as Partial<Prefs>
    return {
      name: typeof p.name === 'string' ? p.name : DEFAULTS.name,
      difficulty:
        p.difficulty === 'easy' || p.difficulty === 'hard' || p.difficulty === 'normal'
          ? p.difficulty
          : DEFAULTS.difficulty,
      aiCount: p.aiCount === 2 || p.aiCount === 3 ? p.aiCount : 1,
      localNames:
        Array.isArray(p.localNames) && p.localNames.every((n) => typeof n === 'string')
          ? p.localNames.slice(0, 4)
          : DEFAULTS.localNames,
    }
  } catch {
    return DEFAULTS
  }
}

export function savePrefs(patch: Partial<Prefs>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...patch }))
  } catch {
    // not essential
  }
}
