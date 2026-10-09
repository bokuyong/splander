// The turn countdown inside the turn pill (online games with a limit): a
// small ring that empties, the seconds left, amber for the last 10 seconds.
// Everyone sees every seat's clock; only the seat whose clock it is hears the
// soft ticks (once at 10 s, once at 3 s), and never while muted (play() checks).
import { useEffect, useRef, useState } from 'react'
import type { TurnTimer } from '../controller'
import { play } from '../logic/sound'

const TIMER_WARN_MS = 10_000
const TICK_AT_SEC = [10, 3]
const RADIUS = 7.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface TurnClockProps {
  timer: TurnTimer
  /** The clock is running for one of this device's seats. */
  mine: boolean
}

export function TurnClock({ timer, mine }: TurnClockProps) {
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, timer.deadline - Date.now()))
  // which ticks already played for this deadline
  const ticked = useRef<{ deadline: number; done: Set<number> }>({ deadline: timer.deadline, done: new Set() })

  useEffect(() => {
    const update = () => setRemainingMs(Math.max(0, timer.deadline - Date.now()))
    update()
    const id = setInterval(update, 200)
    return () => clearInterval(id)
  }, [timer.deadline])

  useEffect(() => {
    if (ticked.current.deadline !== timer.deadline) ticked.current = { deadline: timer.deadline, done: new Set() }
    if (!mine) return
    const sec = Math.ceil(remainingMs / 1000)
    const due = TICK_AT_SEC.find((t) => sec <= t && !ticked.current.done.has(t))
    if (due === undefined) return
    // a clock that arrives already low plays one tick, not one per threshold
    for (const t of TICK_AT_SEC) if (sec <= t) ticked.current.done.add(t)
    play('timerWarn')
  }, [remainingMs, mine, timer.deadline])

  const sec = Math.ceil(remainingMs / 1000)
  const fraction = Math.min(1, Math.max(0, remainingMs / (timer.limitSec * 1000)))
  const warn = remainingMs <= TIMER_WARN_MS
  return (
    <span
      className={`turn-clock${warn ? ' is-warn' : ''}`}
      role="timer"
      aria-live="off"
      aria-label={`남은 시간 ${sec}초`}
      title={`차례당 ${timer.limitSec}초`}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <circle className="turn-clock-track" cx="10" cy="10" r={RADIUS} />
        <circle
          className="turn-clock-arc"
          cx="10"
          cy="10"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
        />
      </svg>
      <b key={warn ? sec : 'calm'}>{sec}</b>
    </span>
  )
}
