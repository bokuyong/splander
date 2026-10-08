// Test-only helpers for the AI test files (not imported by the game).

import { CARDS, NOBLES } from '../data'
import { applyAction, createGame, getLegalActions, isLegal } from '../engine'
import { TIERS } from '../shared/contract'
import type { Action, Card, Difficulty, GameState, PlayerState, Tier } from '../shared/contract'
import { chooseAction } from './index'

export type Bot = (state: GameState) => Action

export const TURN_CAP = 400

export function aiBot(difficulty: Difficulty): Bot {
  return (state) => chooseAction(state, difficulty)
}

// Uniformly random legal player with its own deterministic generator.
export function randomBot(seed: number): Bot {
  let a = seed >>> 0
  return (state) => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0
    const legal = getLegalActions(state)
    return legal[Math.floor((a / 4294967296) * legal.length)]
  }
}

export function newGame(players: number, seed: number): GameState {
  return createGame({
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i}`, kind: 'ai' as const })),
    seed,
    cards: CARDS,
    nobles: NOBLES,
  })
}

export interface GameResult {
  final: GameState
  steps: number
  phases: Record<string, number>
}

// Plays a full game, checking every chosen action with the engine. Throws when
// an action is illegal or the game does not end within TURN_CAP turns.
export function playGame(
  bots: Bot[],
  seed: number,
  onStep?: (state: GameState, action: Action) => void,
): GameResult {
  let state = newGame(bots.length, seed)
  let steps = 0
  const phases: Record<string, number> = { action: 0, discard: 0, chooseNoble: 0 }
  while (state.phase !== 'gameOver') {
    if (state.turn > TURN_CAP) throw new Error(`seed ${seed}: no winner after ${TURN_CAP} turns`)
    const action = bots[state.currentPlayer](state)
    if (!isLegal(state, action)) {
      throw new Error(
        `seed ${seed}, turn ${state.turn}, phase ${state.phase}: illegal ${JSON.stringify(action)}`,
      )
    }
    phases[state.phase] += 1
    onStep?.(state, action)
    state = applyAction(state, action)
    steps += 1
  }
  return { final: state, steps, phases }
}

export interface MatchResult {
  games: number
  winsA: number // a shared win counts as a fraction
  winsB: number
  rateA: number
  avgTurns: number // total turns per game (all players together)
  avgRounds: number // turns per player
}

// Two-player match with seats alternated: every seed is played twice, once
// with A moving first and once with B moving first.
export function playMatch(a: Bot, b: Bot, seeds: number, firstSeed: number): MatchResult {
  let winsA = 0
  let winsB = 0
  let turns = 0
  let games = 0
  for (let i = 0; i < seeds; i++) {
    for (const aSeat of [0, 1]) {
      const { final } = playGame(aSeat === 0 ? [a, b] : [b, a], firstSeed + i)
      const winners = final.winners ?? []
      if (winners.includes(aSeat)) winsA += 1 / winners.length
      if (winners.includes(1 - aSeat)) winsB += 1 / winners.length
      turns += final.turn + 1
      games += 1
    }
  }
  return {
    games,
    winsA,
    winsB,
    rateA: winsA / games,
    avgTurns: turns / games,
    avgRounds: turns / games / 2,
  }
}

export function describeMatch(label: string, r: MatchResult): string {
  return (
    `${label}: ${(r.rateA * 100).toFixed(1)}% - ${((r.winsB / r.games) * 100).toFixed(1)}% ` +
    `over ${r.games} games, avg ${r.avgTurns.toFixed(1)} turns ` +
    `(${r.avgRounds.toFixed(1)} per player)`
  )
}

// The same redaction the online layer applies for `seat`: decks and other
// players' blind reserves become placeholder cards, the rng state is zeroed.
export function redactFor(state: GameState, seat: number): GameState {
  const hidden = (tier: Tier, suffix: string): Card => ({
    id: `hidden-${suffix}`,
    tier,
    bonus: 'white',
    points: 0,
    cost: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
  })
  const decks = {} as Record<Tier, Card[]>
  for (const tier of TIERS) {
    decks[tier] = state.decks[tier].map((_, i) => hidden(tier, `d${tier}-${i}`))
  }
  const players: PlayerState[] = state.players.map((player, p) =>
    p === seat
      ? player
      : {
          ...player,
          reserved: player.reserved.map((r, i) =>
            r.fromDeck ? { card: hidden(r.card.tier, `r${p}-${i}`), fromDeck: true } : r,
          ),
        },
  )
  return { ...state, decks, players, rngState: 0 }
}
