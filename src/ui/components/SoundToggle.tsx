// The mute switch as a round icon button (home screen corner).
import { toggleMuted } from '../logic/sound'
import { SOUND_LABEL, useSoundMuted } from '../logic/useSound'
import { SpeakerIcon, SpeakerOffIcon } from './Icons'

export function SoundToggle({ className }: { className?: string }) {
  const muted = useSoundMuted()
  return (
    <button
      type="button"
      className={`icon-btn${className ? ` ${className}` : ''}`}
      onClick={toggleMuted}
      aria-label={muted ? SOUND_LABEL.off : SOUND_LABEL.on}
      aria-pressed={!muted}
      title={muted ? SOUND_LABEL.off : SOUND_LABEL.on}
    >
      {muted ? <SpeakerOffIcon /> : <SpeakerIcon />}
    </button>
  )
}
