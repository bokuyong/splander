// Emotes: the picker sheet, the speech bubble on a player's panel, and the
// hook that turns controller emote events into short-lived bubbles.
import { useEffect, useRef, useState } from 'react'
import { EmoteIcon } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import type { GameController } from '../controller'
import { EMOJI_EMOTES, EMOTE_HOLD_MS, PHRASE_EMOTES, findEmote } from '../logic/emotes'
import { play } from '../logic/sound'

/** A bubble on screen. `key` changes on every new emote so the pop-in replays. */
export interface Bubble {
  id: string
  key: number
}

/** Bubbles by seat; the sound engine pops for emotes from seats that are not mine. */
export type Bubbles = Readonly<Record<number, Bubble>>

/** Grace after the CSS animation ends before the element is dropped. */
const LINGER_MS = 400

/**
 * Subscribes to the controller's emotes and keeps one bubble per seat for
 * EMOTE_HOLD_MS. A new emote from the same seat replaces the current one.
 */
export function useEmotes(controller: GameController, mySeats: readonly number[]): Bubbles {
  const [bubbles, setBubbles] = useState<Bubbles>({})
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const keyRef = useRef(0)
  const mine = useRef(mySeats)
  useEffect(() => {
    mine.current = mySeats
  }, [mySeats])

  useEffect(() => {
    const subscribe = controller.subscribeEmotes
    if (!subscribe) return
    const pending = timers.current
    const off = subscribe((event) => {
      if (!findEmote(event.id)) return // an id this build does not know
      if (!mine.current.includes(event.seat)) play('emote')
      const key = ++keyRef.current
      setBubbles((current) => ({ ...current, [event.seat]: { id: event.id, key } }))
      const old = pending.get(event.seat)
      if (old) clearTimeout(old)
      pending.set(
        event.seat,
        setTimeout(() => {
          pending.delete(event.seat)
          setBubbles((current) => {
            if (current[event.seat]?.key !== key) return current
            const { [event.seat]: _gone, ...rest } = current
            return rest
          })
        }, EMOTE_HOLD_MS + LINGER_MS),
      )
    })
    return () => {
      off()
      for (const t of pending.values()) clearTimeout(t)
      pending.clear()
    }
  }, [controller])

  return bubbles
}

interface EmoteBubbleProps {
  bubble: Bubble | undefined
  /** Where the panel sits: a bubble hangs below a top panel, floats above a bottom one. */
  side: 'top' | 'bottom'
}

export function EmoteBubble({ bubble, side }: EmoteBubbleProps) {
  if (!bubble) return null
  const emote = findEmote(bubble.id)
  if (!emote) return null
  return (
    <span key={bubble.key} className={`emote-bubble is-${emote.kind} is-${side}`} title={emote.label} aria-hidden="true">
      {emote.text}
    </span>
  )
}

interface EmotePickerProps {
  onPick: (id: string) => void
  onClose: () => void
}

export function EmotePicker({ onPick, onClose }: EmotePickerProps) {
  return (
    <Sheet
      title={
        <>
          <EmoteIcon /> 감정 표현
        </>
      }
      onClose={onClose}
      className="emote-sheet"
    >
      <div className="emote-grid" role="group" aria-label="이모티콘">
        {EMOJI_EMOTES.map((e) => (
          <button type="button" key={e.id} className="emote-pick is-emoji" aria-label={e.label} onClick={() => onPick(e.id)}>
            {e.text}
          </button>
        ))}
      </div>
      <div className="emote-phrases" role="group" aria-label="한마디">
        {PHRASE_EMOTES.map((e) => (
          <button type="button" key={e.id} className="emote-pick is-phrase" onClick={() => onPick(e.id)}>
            {e.text}
          </button>
        ))}
      </div>
      <p className="sheet-note">상대방 화면에도 말풍선으로 보여요</p>
    </Sheet>
  )
}
