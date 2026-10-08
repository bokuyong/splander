// Tiny synthesized sound effects on the Web Audio API: no audio files, one
// lazily created AudioContext, short oscillator + envelope voices. Every call
// is a safe no-op where audio is unavailable (old WebViews, vitest).
import { Capacitor } from '@capacitor/core'
import { Haptics } from '@capacitor/haptics'
import type { StorageLike } from '../controller'

export type SoundName =
  | 'yourTurn'
  | 'tokenPick'
  | 'tokenDrop'
  | 'confirm'
  | 'buy'
  | 'reserve'
  | 'noble'
  | 'opponentMove'
  | 'gameWin'
  | 'gameLose'
  | 'error'

// --- Persisted setting ---------------------------------------------------------

export interface SoundPrefs {
  muted: boolean
  /** Master volume 0..1. */
  volume: number
}

export const SOUND_KEY = 'moonlit-garden:sound:v1'
const DEFAULTS: SoundPrefs = { muted: false, volume: 0.8 }
const VIBRATE_PATTERN = [60, 40, 60]

function clamp01(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback
}

export function loadSoundPrefs(storage: StorageLike | null): SoundPrefs {
  if (!storage) return DEFAULTS
  try {
    const raw = storage.getItem(SOUND_KEY)
    if (!raw) return DEFAULTS
    const p = JSON.parse(raw) as Partial<SoundPrefs>
    return {
      muted: typeof p.muted === 'boolean' ? p.muted : DEFAULTS.muted,
      volume: clamp01(p.volume, DEFAULTS.volume),
    }
  } catch {
    return DEFAULTS
  }
}

export function saveSoundPrefs(storage: StorageLike | null, prefs: SoundPrefs): void {
  try {
    storage?.setItem(SOUND_KEY, JSON.stringify(prefs))
  } catch {
    // private mode / quota: the setting simply does not survive a reload
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

// --- Voices --------------------------------------------------------------------

interface ToneOpts {
  freq: number
  /** Seconds after the recipe starts. */
  at: number
  dur: number
  type?: OscillatorType
  gain?: number
  attack?: number
  /** Slide the pitch to this frequency over `dur`. */
  glide?: number
  /** Cents. */
  detune?: number
}

interface NoiseOpts {
  at: number
  dur: number
  /** Band-pass centre, swept from -> to over `dur`. */
  from: number
  to: number
  gain?: number
  q?: number
}

interface Voice {
  tone(opts: ToneOpts): void
  noise(opts: NoiseOpts): void
}

function makeVoice(ctx: AudioContext, out: AudioNode, t0: number): Voice {
  return {
    tone({ freq, at, dur, type = 'sine', gain = 0.2, attack = 0.01, glide, detune = 0 }) {
      const start = t0 + at
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.setValueAtTime(freq, start)
      if (glide) osc.frequency.exponentialRampToValueAtTime(glide, start + dur)
      if (detune) osc.detune.setValueAtTime(detune, start)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, start)
      g.gain.linearRampToValueAtTime(gain, start + attack)
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(g)
      g.connect(out)
      osc.start(start)
      osc.stop(start + dur + 0.02)
    },
    noise({ at, dur, from, to, gain = 0.15, q = 1 }) {
      const start = t0 + at
      const length = Math.max(1, Math.ceil(ctx.sampleRate * dur))
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
      const src = ctx.createBufferSource()
      src.buffer = buffer
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.Q.setValueAtTime(q, start)
      filter.frequency.setValueAtTime(from, start)
      filter.frequency.exponentialRampToValueAtTime(to, start + dur)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, start)
      g.gain.linearRampToValueAtTime(gain, start + dur * 0.3)
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      src.connect(filter)
      filter.connect(g)
      g.connect(out)
      src.start(start)
      src.stop(start + dur + 0.01)
    },
  }
}

/** A soft bell: a sine fundamental plus a quieter, slightly detuned triangle. */
function bell(v: Voice, freq: number, at: number, dur: number, gain: number): void {
  v.tone({ freq, at, dur, type: 'sine', gain, attack: 0.008 })
  v.tone({ freq, at, dur: dur * 0.7, type: 'triangle', gain: gain * 0.35, attack: 0.008, detune: 6 })
}

// Pitches: C5 523.25, E5 659.25, G5 783.99, C6 1046.5, E6 1318.5, A6 1760.
const RECIPES: Record<SoundName, (v: Voice) => void> = {
  // E5 -> G5 -> C6, ascending bells; the one that matters
  yourTurn: (v) => {
    bell(v, 659.25, 0, 0.22, 0.22)
    bell(v, 783.99, 0.13, 0.22, 0.22)
    bell(v, 1046.5, 0.26, 0.34, 0.26)
  },
  // short bright tick (pitch flicks up) with a whisper of noise
  tokenPick: (v) => {
    v.tone({ freq: 1180, glide: 1500, at: 0, dur: 0.06, gain: 0.16, attack: 0.003 })
    v.noise({ at: 0, dur: 0.03, from: 3200, to: 4200, gain: 0.05 })
  },
  // the same click, lower and falling
  tokenDrop: (v) => {
    v.tone({ freq: 820, glide: 600, at: 0, dur: 0.07, gain: 0.14, attack: 0.003 })
    v.noise({ at: 0, dur: 0.035, from: 2200, to: 1500, gain: 0.05 })
  },
  // a plucked string: triangle sliding down a fourth
  confirm: (v) => v.tone({ freq: 740, glide: 520, at: 0, dur: 0.13, type: 'triangle', gain: 0.18, attack: 0.004 }),
  // "cha-ching": a tiny coin hiss, then E6 and A6
  buy: (v) => {
    v.noise({ at: 0, dur: 0.05, from: 4000, to: 6000, gain: 0.05 })
    bell(v, 1318.5, 0, 0.18, 0.2)
    bell(v, 1760, 0.09, 0.3, 0.22)
  },
  // a card sliding across felt: filtered noise sweeping upward
  reserve: (v) => v.noise({ at: 0, dur: 0.24, from: 700, to: 2600, gain: 0.22, q: 0.8 }),
  // a warm C-major chord, voices entering one after another
  noble: (v) => {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      v.tone({ freq, at: i * 0.045, dur: 0.5, type: 'triangle', gain: 0.1, attack: 0.03 }),
    )
  },
  // a barely-there tick
  opponentMove: (v) => v.tone({ freq: 520, at: 0, dur: 0.05, gain: 0.05, attack: 0.003 }),
  // C5 E5 G5 C6 E6 arpeggio
  gameWin: (v) => {
    ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) =>
      bell(v, freq, i * 0.08, i === 4 ? 0.28 : 0.2, 0.2),
    )
  },
  // A4 then E4, soft and descending
  gameLose: (v) => {
    v.tone({ freq: 440, at: 0, dur: 0.26, gain: 0.16, attack: 0.02 })
    v.tone({ freq: 329.63, at: 0.2, dur: 0.34, gain: 0.16, attack: 0.02 })
  },
  // a muted low bump
  error: (v) => {
    v.tone({ freq: 160, glide: 120, at: 0, dur: 0.12, gain: 0.22, attack: 0.004 })
    v.tone({ freq: 110, at: 0, dur: 0.1, type: 'triangle', gain: 0.1, attack: 0.004 })
  },
}

// --- Engine --------------------------------------------------------------------

type AudioContextCtor = new () => AudioContext

export interface SoundEngine {
  play(name: SoundName): void
  setMuted(muted: boolean): void
  isMuted(): boolean
  setVolume(volume: number): void
  getVolume(): number
  /** Notifies when muted / volume change (useSyncExternalStore-compatible). */
  subscribe(listener: () => void): () => void
  /** Call from a user gesture: creates the context and resumes it if suspended. */
  unlock(): void
  /** AudioContext state for diagnostics: 'unavailable' | 'idle' | 'running' | 'suspended' | 'closed'. */
  status(): string
}

export interface SoundEngineOptions {
  /** Where the setting lives. Default localStorage; null disables persistence. */
  storage?: StorageLike | null
  /** The AudioContext class. Default: the browser's; null means no audio. */
  AudioContextCtor?: AudioContextCtor | null
  /** navigator.vibrate-like function; null disables vibration. */
  vibrate?: ((pattern: number[]) => unknown) | null
  /** Called on every play() attempt (dev logging). */
  onPlay?: (name: SoundName, status: string, muted: boolean) => void
}

function browserAudioContext(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/**
 * Inside the native app (Capacitor) the web view has no usable
 * navigator.vibrate (iOS has none, Android's needs a permission the app does
 * not request), so the Haptics plugin plays the pattern: buzz, pause, buzz.
 */
function nativeVibrate(): ((pattern: number[]) => unknown) | null {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('Haptics')) return null
  return (pattern) => {
    let at = 0
    pattern.forEach((ms, i) => {
      if (i % 2 === 0) setTimeout(() => void Haptics.vibrate({ duration: ms }).catch(() => {}), at)
      at += ms
    })
  }
}

function browserVibrate(): ((pattern: number[]) => unknown) | null {
  const native = nativeVibrate()
  if (native) return native
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return null
  return (pattern) => navigator.vibrate(pattern)
}

export function createSoundEngine(options: SoundEngineOptions = {}): SoundEngine {
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const Ctor = options.AudioContextCtor === undefined ? browserAudioContext() : options.AudioContextCtor
  const vibrate = options.vibrate === undefined ? browserVibrate() : options.vibrate
  const listeners = new Set<() => void>()
  let prefs = loadSoundPrefs(storage)
  let ctx: AudioContext | null = null
  let master: GainNode | null = null

  function notify(): void {
    for (const listener of [...listeners]) listener()
  }

  function persist(next: SoundPrefs): void {
    prefs = next
    saveSoundPrefs(storage, prefs)
    if (master && ctx) master.gain.setValueAtTime(prefs.volume, ctx.currentTime)
    notify()
  }

  function context(): AudioContext | null {
    if (ctx) return ctx
    if (!Ctor) return null
    try {
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = prefs.volume
      master.connect(ctx.destination)
    } catch {
      ctx = null
      master = null
    }
    return ctx
  }

  function resume(): void {
    const c = context()
    if (!c || c.state !== 'suspended') return
    try {
      void c.resume().catch(() => {})
    } catch {
      // not inside a user gesture yet; the next tap will try again
    }
  }

  function status(): string {
    if (!Ctor) return 'unavailable'
    return ctx ? ctx.state : 'idle'
  }

  return {
    play(name) {
      options.onPlay?.(name, status(), prefs.muted)
      if (prefs.muted) return
      if (name === 'yourTurn' && vibrate) {
        try {
          vibrate(VIBRATE_PATTERN)
        } catch {
          // some browsers throw outside a gesture: ignore
        }
      }
      const c = context()
      if (!c || !master) return
      try {
        if (c.state === 'suspended') resume()
        const voice = makeVoice(c, master, c.currentTime + 0.005)
        RECIPES[name](voice)
      } catch {
        // a sound is never worth an error
      }
    },
    setMuted(muted) {
      if (muted === prefs.muted) return
      persist({ ...prefs, muted })
    },
    isMuted: () => prefs.muted,
    setVolume(volume) {
      const next = clamp01(volume, prefs.volume)
      if (next === prefs.volume) return
      persist({ ...prefs, volume: next })
    },
    getVolume: () => prefs.volume,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    unlock: resume,
    status,
  }
}

// --- The app's engine ------------------------------------------------------------

const engine = createSoundEngine({
  onPlay: import.meta.env.DEV
    ? (name, state, muted) => console.debug(`[sound] ${name}${muted ? ' (muted)' : ''} · ${state}`)
    : undefined,
})

export const play = engine.play
export const setMuted = engine.setMuted
export const isMuted = engine.isMuted
export const setVolume = engine.setVolume
export const getVolume = engine.getVolume
export const subscribeSound = engine.subscribe
export const soundStatus = engine.status

/** Flip the mute switch; plays a sound when turning it on so it is heard working. */
export function toggleMuted(): void {
  setMuted(!isMuted())
  if (!isMuted()) play('confirm')
}

/**
 * Mobile browsers only let audio start from a user gesture and suspend the
 * context when the page is hidden. Call once at startup.
 */
export function installSoundUnlock(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const unlock = () => engine.unlock()
  for (const type of ['pointerdown', 'touchstart', 'keydown'] as const) {
    window.addEventListener(type, unlock, { passive: true, capture: true })
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) engine.unlock()
  })
}
