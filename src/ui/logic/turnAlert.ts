// A "your turn" marker in the browser tab title, for when the page is in the
// background while the other side moves.
import { THEME } from '../../data'

export const TURN_ALERT_TITLE = `🔔 내 차례! · ${THEME.title}`

let original: string | null = null

export function setTurnAlert(on: boolean): void {
  if (typeof document === 'undefined') return
  try {
    if (on) {
      if (original === null) original = document.title
      document.title = TURN_ALERT_TITLE
    } else if (original !== null) {
      document.title = original
      original = null
    }
  } catch {
    // nothing to alert with
  }
}

export function isTurnAlertOn(): boolean {
  return original !== null
}
