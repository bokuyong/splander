// Watches consecutive game states and turns the differences into things the
// screen can show: a log, the latest move (for highlights), flying sprites.
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { GameState } from '../../shared/contract'
import { describeAction, diffEvents } from '../logic/describe'
import type { TurnEvents } from '../logic/describe'
import { playFlights } from '../logic/motion'
import type { Flight } from '../logic/motion'

export interface LogEntry {
  id: number
  seat: number
  text: string
}

export interface GameFeed {
  log: LogEntry[]
  /** The most recent move; `fresh` is true for a moment after it happened. */
  last: TurnEvents | null
  fresh: boolean
  /** Bumps when a brand-new game replaces the old one (rematch). */
  epoch: number
}

const FRESH_MS = 1800
const LOG_LIMIT = 60

function flightsFor(ev: TurnEvents): Flight[] {
  const flights: Flight[] = []
  const seat = `seat-${ev.actor}`
  let delay = 0
  for (const move of ev.tokenMoves) {
    for (let i = 0; i < Math.abs(move.delta); i++) {
      const bank = `bank-${move.color}`
      flights.push({
        kind: 'token',
        color: move.color,
        from: move.delta > 0 ? bank : seat,
        to: move.delta > 0 ? seat : bank,
        delay,
      })
      delay += 70
    }
  }
  const a = ev.action
  if ((a.type === 'buy' || a.type === 'reserveBoard') && ev.changedSlots.length > 0) {
    const { tier, slot } = ev.changedSlots[0]
    flights.push({ kind: 'card', from: `slot-${tier}-${slot}`, to: seat })
  } else if (a.type === 'reserveDeck') {
    flights.push({ kind: 'card', from: `deck-${a.tier}`, to: seat })
  }
  return flights
}

function isNewGame(prev: GameState, next: GameState): boolean {
  return next.turn < prev.turn || (next.lastAction === null && prev.lastAction !== null)
}

export function useGameFeed(state: GameState, layer: RefObject<HTMLElement | null>): GameFeed {
  const prevRef = useRef<GameState>(state)
  const idRef = useRef(1)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [feed, setFeed] = useState<GameFeed>(() => ({
    log: state.lastAction
      ? [
          {
            id: 0,
            seat: state.lastAction.player,
            text: describeAction(state, state.lastAction.player, state.lastAction.action),
          },
        ]
      : [],
    last: null,
    fresh: false,
    epoch: 0,
  }))

  useEffect(() => {
    const prev = prevRef.current
    if (prev === state) return
    prevRef.current = state
    if (isNewGame(prev, state)) {
      setFeed((f) => ({ log: [], last: null, fresh: false, epoch: f.epoch + 1 }))
      return
    }
    const ev = diffEvents(prev, state)
    if (!ev) return
    const entry: LogEntry = { id: idRef.current++, seat: ev.actor, text: ev.text }
    setFeed((f) => ({
      ...f,
      log: [...f.log, entry].slice(-LOG_LIMIT),
      last: ev,
      fresh: true,
    }))
    playFlights(layer.current, flightsFor(ev))
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(
      () => setFeed((f) => (f.last === ev ? { ...f, fresh: false } : f)),
      FRESH_MS,
    )
  }, [state, layer])

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    },
    [],
  )

  return feed
}
