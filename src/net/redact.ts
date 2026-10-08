// Hidden information. The host holds the only complete GameState; everything
// that leaves it (to a guest, to the host's own UI, to an AI seat) is a view
// redacted for one seat.

import type { Card, GameState, PlayerState, Tier } from '../shared/contract.ts'
import { TIERS } from '../shared/contract.ts'

export const HIDDEN_CARD_PREFIX = 'hidden'

/** True for the placeholder cards produced by redactStateFor. */
export function isHiddenCard(card: Card): boolean {
  return card.id.startsWith(HIDDEN_CARD_PREFIX)
}

/**
 * A face-down card. Only the tier is real (it is printed on the card back).
 * Ids are unique within a state ("hidden-d2-7", "hidden-r1-0") so they can be
 * used as React keys; test with isHiddenCard, not by comparing ids.
 */
export function hiddenCard(tier: Tier, idSuffix: string): Card {
  return {
    id: `${HIDDEN_CARD_PREFIX}-${idSuffix}`,
    tier,
    bonus: 'white',
    points: 0,
    cost: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
  }
}

/**
 * The state as `seat` is allowed to see it. Pass a seat that does not exist
 * (e.g. -1) for a spectator view.
 *
 * - every deck card becomes a placeholder (deck order and content are secret;
 *   array lengths are kept so the UI can show how many cards are left)
 * - other players' reserved cards that were taken blind (fromDeck) become
 *   placeholders; the entry and its fromDeck flag stay
 * - rngState is zeroed (it could be used to predict the decks)
 *
 * The input is never mutated; untouched parts are shared by reference.
 */
export function redactStateFor(state: GameState, seat: number): GameState {
  const decks = {} as Record<Tier, Card[]>
  for (const tier of TIERS) {
    decks[tier] = state.decks[tier].map((_, i) => hiddenCard(tier, `d${tier}-${i}`))
  }
  const players: PlayerState[] = state.players.map((player, p) => {
    if (p === seat || !player.reserved.some((r) => r.fromDeck)) return player
    return {
      ...player,
      reserved: player.reserved.map((r, i) =>
        r.fromDeck ? { card: hiddenCard(r.card.tier, `r${p}-${i}`), fromDeck: true } : r,
      ),
    }
  })
  return { ...state, decks, players, rngState: 0 }
}
