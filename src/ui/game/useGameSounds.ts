// Turns consecutive game states into sound cues (and the tab-title alert).
// The pure helpers decide what happened; the hook only plays it.
import { useEffect, useRef } from 'react'
import type { GameState } from '../../shared/contract'
import type { ControllerSnapshot } from '../controller'
import { diffEvents } from '../logic/describe'
import { play } from '../logic/sound'
import type { SoundName } from '../logic/sound'
import { setTurnAlert } from '../logic/turnAlert'

type TurnFacts = Pick<GameState, 'currentPlayer' | 'phase'>

export function isMyTurn(state: TurnFacts, mySeats: readonly number[]): boolean {
  return state.phase === 'action' && mySeats.includes(state.currentPlayer)
}

/**
 * "The previous current player was not mine, and now it is" (and the game is
 * waiting for an action). Deliberately false on the first render, on resume
 * and in pass-and-play where every seat is mine: the hand-off screen chimes.
 */
export function becameMyTurn(prev: TurnFacts, next: TurnFacts, mySeats: readonly number[]): boolean {
  if (!isMyTurn(next, mySeats)) return false
  return !mySeats.includes(prev.currentPlayer)
}

function isNewGame(prev: GameState, next: GameState): boolean {
  return next.turn < prev.turn || (next.lastAction === null && prev.lastAction !== null)
}

/** Sounds for the change from `prev` to `next`, in the order they should start. */
export function soundCues(prev: GameState, next: GameState, mySeats: readonly number[]): SoundName[] {
  if (prev === next || isNewGame(prev, next)) return []
  const cues: SoundName[] = []
  const ev = diffEvents(prev, next)
  const mine = !!ev && mySeats.includes(ev.actor)
  const turn = becameMyTurn(prev, next, mySeats)
  if (ev) {
    if (mine) {
      if (ev.action.type === 'buy') cues.push('buy')
      else if (ev.action.type === 'reserveBoard' || ev.action.type === 'reserveDeck') cues.push('reserve')
    } else if (!turn) {
      // the turn chime already says "they moved"
      cues.push('opponentMove')
    }
    if (ev.guest) cues.push('noble')
  }
  if (turn) cues.push('yourTurn')
  return cues
}

/** What to play when the result screen appears. */
export function resultSound(state: GameState, mySeats: readonly number[]): SoundName {
  const winners = state.winners ?? []
  return mySeats.some((seat) => winners.includes(seat)) ? 'gameWin' : 'gameLose'
}

/**
 * Plays the cues for every state change and keeps the tab title in sync.
 * Pass-and-play games chime from the hand-off screen instead, so
 * `hotseat` silences the turn chime here.
 */
export function useGameSounds(snap: ControllerSnapshot, hotseat: boolean): void {
  const { state, mySeats } = snap
  const prevRef = useRef<GameState>(state)

  useEffect(() => {
    const prev = prevRef.current
    if (prev === state) return
    prevRef.current = state
    const cues = soundCues(prev, state, mySeats).filter((c) => !(hotseat && c === 'yourTurn'))
    for (const cue of cues) play(cue)
    if (cues.includes('yourTurn') && typeof document !== 'undefined' && document.hidden) setTurnAlert(true)
  }, [state, mySeats, hotseat])

  const myTurn = !hotseat && isMyTurn(state, mySeats)
  useEffect(() => {
    if (!myTurn) setTurnAlert(false)
  }, [myTurn])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisible = () => {
      if (!document.hidden) setTurnAlert(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      setTurnAlert(false)
    }
  }, [])
}
