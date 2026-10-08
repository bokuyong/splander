// Test helpers shared by the net test files: a tiny fake game and a fake
// applyAction, so protocol logic is tested without the real rules engine.

import type { Action, Card, GameState, PlayerState, Tier } from '../shared/contract.ts'
import type { Lifecycle } from './util.ts'

export function fakeCard(id: string, tier: Tier): Card {
  return { id, tier, bonus: 'red', points: 1, cost: { white: 1, blue: 0, green: 0, red: 0, black: 2 } }
}

function fakePlayer(name: string): PlayerState {
  return {
    name,
    kind: 'human',
    tokens: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 },
    cards: [],
    reserved: [],
    nobles: [],
  }
}

export function fakeState(playerCount = 2): GameState {
  return {
    players: Array.from({ length: playerCount }, (_, i) => fakePlayer(`P${i}`)),
    currentPlayer: 0,
    phase: 'action',
    bank: { white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 5 },
    decks: {
      1: [fakeCard('t1-01', 1), fakeCard('t1-02', 1), fakeCard('t1-03', 1)],
      2: [fakeCard('t2-01', 2), fakeCard('t2-02', 2)],
      3: [fakeCard('t3-01', 3)],
    },
    board: {
      1: [fakeCard('t1-10', 1), fakeCard('t1-11', 1), fakeCard('t1-12', 1), fakeCard('t1-13', 1)],
      2: [fakeCard('t2-10', 2), null, null, null],
      3: [null, null, null, null],
    },
    nobles: [],
    eligibleNobles: [],
    finalRound: false,
    winners: null,
    turn: 0,
    rngState: 12345,
    lastAction: null,
  }
}

/**
 * Fake rules:
 *   pass                      -> next player
 *   reserveDeck               -> current player takes the top deck card blind, next player
 *   reserveBoard              -> current player reserves a face-up card (by id), next player
 *   chooseNoble 'end'         -> game over, current player wins
 *   anything else             -> throws (illegal)
 */
export function fakeApplyAction(state: GameState, action: Action): GameState {
  if (state.phase === 'gameOver') throw new Error('game is over')
  const p = state.currentPlayer
  const advance = (s: GameState): GameState => ({
    ...s,
    currentPlayer: (p + 1) % s.players.length,
    turn: s.turn + 1,
    lastAction: { player: p, action },
  })
  const withPlayer = (s: GameState, player: PlayerState): GameState => ({
    ...s,
    players: s.players.map((old, i) => (i === p ? player : old)),
  })
  switch (action.type) {
    case 'pass':
      return advance(state)
    case 'reserveDeck': {
      const [top, ...rest] = state.decks[action.tier]
      if (!top) throw new Error('deck is empty')
      const me = state.players[p]
      const next = withPlayer(state, { ...me, reserved: [...me.reserved, { card: top, fromDeck: true }] })
      return advance({ ...next, decks: { ...state.decks, [action.tier]: rest } })
    }
    case 'reserveBoard': {
      const card = state.board[1].find((c) => c?.id === action.cardId)
      if (!card) throw new Error('no such card')
      const me = state.players[p]
      return advance(withPlayer(state, { ...me, reserved: [...me.reserved, { card, fromDeck: false }] }))
    }
    case 'chooseNoble':
      if (action.nobleId !== 'end') throw new Error('no such noble')
      return { ...state, phase: 'gameOver', winners: [p], lastAction: { player: p, action } }
    default:
      throw new Error(`illegal action: ${action.type}`)
  }
}

/** Polls until `cond` holds; fails the test after `timeoutMs`. */
export async function until(cond: () => boolean, what = 'condition', timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

/** Lets pending messages and zero-delay timers run. */
export async function settle(ms = 20): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export function fakeLifecycle(): Lifecycle & { wake(): void } {
  const cbs = new Set<() => void>()
  return {
    onWake(cb) {
      cbs.add(cb)
      return () => void cbs.delete(cb)
    },
    wake() {
      for (const cb of [...cbs]) cb()
    },
  }
}
