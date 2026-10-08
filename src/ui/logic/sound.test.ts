import { describe, expect, it, vi } from 'vitest'
import type { StorageLike } from '../controller'
import { createSoundEngine, loadSoundPrefs, saveSoundPrefs, SOUND_KEY } from './sound'

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

describe('sound prefs', () => {
  it('defaults to sound on at a sensible volume', () => {
    expect(loadSoundPrefs(null)).toEqual({ muted: false, volume: 0.8 })
    expect(loadSoundPrefs(memoryStorage())).toEqual({ muted: false, volume: 0.8 })
  })

  it('round-trips through storage and tolerates junk', () => {
    const storage = memoryStorage()
    saveSoundPrefs(storage, { muted: true, volume: 0.3 })
    expect(storage.map.get(SOUND_KEY)).toBeTruthy()
    expect(loadSoundPrefs(storage)).toEqual({ muted: true, volume: 0.3 })
    storage.map.set(SOUND_KEY, '{not json')
    expect(loadSoundPrefs(storage)).toEqual({ muted: false, volume: 0.8 })
    storage.map.set(SOUND_KEY, JSON.stringify({ muted: 'yes', volume: 'loud' }))
    expect(loadSoundPrefs(storage)).toEqual({ muted: false, volume: 0.8 })
    storage.map.set(SOUND_KEY, JSON.stringify({ muted: true, volume: 7 }))
    expect(loadSoundPrefs(storage)).toEqual({ muted: true, volume: 1 })
  })

  it('never throws on a broken storage', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('private mode')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {},
    }
    expect(loadSoundPrefs(broken)).toEqual({ muted: false, volume: 0.8 })
    expect(() => saveSoundPrefs(broken, { muted: true, volume: 1 })).not.toThrow()
  })
})

describe('sound engine without AudioContext', () => {
  it('is a safe no-op that still remembers the mute switch', () => {
    const storage = memoryStorage()
    const onPlay = vi.fn()
    const vibrate = vi.fn()
    const engine = createSoundEngine({ storage, AudioContextCtor: null, vibrate, onPlay })
    expect(engine.status()).toBe('unavailable')
    expect(engine.isMuted()).toBe(false)
    expect(() => engine.play('yourTurn')).not.toThrow()
    expect(() => engine.unlock()).not.toThrow()
    expect(onPlay).toHaveBeenCalledWith('yourTurn', 'unavailable', false)
    // vibration does not need audio
    expect(vibrate).toHaveBeenCalledWith([60, 40, 60])
    vibrate.mockClear()

    const listener = vi.fn()
    engine.subscribe(listener)
    engine.setMuted(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(engine.isMuted()).toBe(true)
    engine.play('yourTurn')
    expect(vibrate).not.toHaveBeenCalled()
    engine.setMuted(true) // no change, no notification
    expect(listener).toHaveBeenCalledTimes(1)

    // a fresh engine on the same storage starts muted
    const again = createSoundEngine({ storage, AudioContextCtor: null, vibrate: null })
    expect(again.isMuted()).toBe(true)
  })

  it('clamps and persists the volume', () => {
    const storage = memoryStorage()
    const engine = createSoundEngine({ storage, AudioContextCtor: null, vibrate: null })
    engine.setVolume(4)
    expect(engine.getVolume()).toBe(1)
    engine.setVolume(-1)
    expect(engine.getVolume()).toBe(0)
    engine.setVolume(0.25)
    expect(createSoundEngine({ storage, AudioContextCtor: null, vibrate: null }).getVolume()).toBe(0.25)
  })

  it('survives a context class that throws', () => {
    const Broken = class {
      constructor() {
        throw new Error('no audio here')
      }
    } as unknown as new () => AudioContext
    const engine = createSoundEngine({ storage: null, AudioContextCtor: Broken, vibrate: null })
    expect(() => engine.play('buy')).not.toThrow()
    expect(() => engine.unlock()).not.toThrow()
    expect(engine.status()).toBe('idle')
  })
})
