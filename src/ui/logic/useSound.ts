// React side of the sound engine: the mute switch as subscribable state.
import { useSyncExternalStore } from 'react'
import { isMuted, subscribeSound } from './sound'

export const SOUND_LABEL = { on: '소리 끄기', off: '소리 켜기' } as const

export function useSoundMuted(): boolean {
  return useSyncExternalStore(subscribeSound, isMuted, isMuted)
}
