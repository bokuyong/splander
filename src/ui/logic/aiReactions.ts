// How a computer opponent reacts to what just happened: a pure function of
// two consecutive states, so the same game always produces the same emotes.
//
//   its own big move (a 3+ point card, a noble)   -> 😎 or "운이 좋네요"
//   a human takes a noble                          -> 👏 or "잘했어요!"
//   the game ends: the AI won / lost               -> 😎 / 😢
//
// Reactions are rare on purpose: at most one per REACTION_GAP_TURNS turns per
// seat, except the end of the game, which always gets one.
import type { GameState } from '../../shared/contract'
import { diffEvents, findCard } from './describe'

export const REACTION_GAP_TURNS = 4
/** A card worth this much is worth gloating about. */
export const BIG_CARD_POINTS = 3

/** Small deterministic mixer; picks one of `n` variants for a given moment. */
function pick(state: GameState, seat: number, n: number): number {
  let h = (state.turn * 2654435761 + seat * 40503 + state.rngState * 97) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995) >>> 0
  h ^= h >>> 15
  return h % n
}

/**
 * The emote id the AI in `seat` flashes after `prev` became `next`, or null.
 * `lastReactionTurn` is the turn of this seat's previous reaction (null when
 * it has not reacted yet); it enforces the gap.
 */
export function aiReaction(
  prev: GameState,
  next: GameState,
  seat: number,
  lastReactionTurn: number | null,
): string | null {
  if (prev === next) return null
  const me = next.players[seat]
  if (!me || me.kind !== 'ai') return null

  // The end of the game is always worth a word.
  if (next.phase === 'gameOver' && prev.phase !== 'gameOver') {
    return (next.winners ?? []).includes(seat) ? 'cool' : 'cry'
  }
  if (next.phase === 'gameOver') return null

  if (lastReactionTurn !== null && next.turn - lastReactionTurn < REACTION_GAP_TURNS) return null
  const ev = diffEvents(prev, next)
  if (!ev) return null

  if (ev.actor === seat) {
    const card = ev.action.type === 'buy' ? findCard(next, ev.action.cardId) : null
    const bigCard = card !== null && card.points >= BIG_CARD_POINTS
    if (ev.guest || bigCard) return pick(next, seat, 2) === 0 ? 'cool' : 'lucky'
    return null
  }

  const actor = next.players[ev.actor]
  if (actor?.kind === 'human' && ev.guest) return pick(next, seat, 2) === 0 ? 'clap' : 'nice'
  return null
}

/** Seats whose player is an AI. */
export function aiSeats(state: GameState): number[] {
  return state.players.map((p, i) => (p.kind === 'ai' ? i : -1)).filter((i) => i >= 0)
}
