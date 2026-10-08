// Publishes the data module's THEME as CSS custom properties, so stylesheets
// never hardcode the palette. Called once before the first render.
import { TIERS, TOKEN_COLORS } from '../shared/contract'
import { THEME } from '../data'

export function applyThemeVars(root: HTMLElement = document.documentElement): void {
  const set = (name: string, value: string) => root.style.setProperty(name, value)
  set('--bg', THEME.ui.background)
  set('--surface', THEME.ui.surface)
  set('--surface-alt', THEME.ui.surfaceAlt)
  set('--text', THEME.ui.text)
  set('--muted', THEME.ui.textMuted)
  set('--accent', THEME.ui.accent)
  set('--gold-light', THEME.ui.moon)
  for (const color of TOKEN_COLORS) {
    const t = THEME.tokens[color]
    set(`--tok-${color}`, t.color)
    set(`--tok-${color}-soft`, t.soft)
    set(`--tok-${color}-ink`, t.ink)
  }
  for (const tier of TIERS) set(`--tier-${tier}`, THEME.tiers[tier].color)
}
