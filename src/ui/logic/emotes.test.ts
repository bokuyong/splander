import { describe, expect, it } from 'vitest'
import { isEmoteIdShape } from '../../net'
import { EMOJI_EMOTES, EMOTES, PHRASE_EMOTES, findEmote, isEmoteId } from './emotes'

describe('emote set', () => {
  it('has unique, wire-safe ids and splits into emoji and phrases', () => {
    const ids = EMOTES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of EMOTES) {
      expect(isEmoteIdShape(e.id)).toBe(true) // what the net layer accepts
      expect(e.text.length).toBeGreaterThan(0)
      expect(e.label.length).toBeGreaterThan(0)
    }
    expect(EMOJI_EMOTES).toHaveLength(8)
    expect(PHRASE_EMOTES).toHaveLength(8)
    expect(EMOJI_EMOTES.length + PHRASE_EMOTES.length).toBe(EMOTES.length)
    expect(Object.isFrozen(EMOTES)).toBe(true)
  })

  it('looks emotes up by id and rejects anything else', () => {
    expect(findEmote('clap')).toMatchObject({ kind: 'emoji', text: '👏' })
    expect(findEmote('nice')).toMatchObject({ kind: 'phrase', text: '잘했어요!' })
    expect(findEmote('gg')?.text).toBe('GG')
    expect(findEmote('nope')).toBeUndefined()
    expect(findEmote(undefined)).toBeUndefined()
    expect(findEmote(3)).toBeUndefined()
    expect(isEmoteId('cool')).toBe(true)
    expect(isEmoteId('COOL')).toBe(false)
    expect(isEmoteId('')).toBe(false)
    expect(isEmoteId(null)).toBe(false)
  })

  it('contains the reaction ids the AI uses', () => {
    for (const id of ['cool', 'lucky', 'clap', 'nice', 'cry']) expect(isEmoteId(id)).toBe(true)
  })
})
