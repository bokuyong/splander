import { describe, expect, it } from 'vitest'
import type { GameState } from '../shared/contract.ts'
import { lobbyToPlayers } from './index.ts'
import { generateRoomCode, isValidRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET } from './protocol.ts'
import { isHiddenCard, redactStateFor } from './redact.ts'
import { fakeCard, fakeState } from './testkit.ts'

function stateWithReserves(): GameState {
  const base = fakeState(3)
  return {
    ...base,
    players: base.players.map((p, i) => ({
      ...p,
      reserved: [
        { card: fakeCard(`blind-${i}`, 2), fromDeck: true },
        { card: fakeCard(`open-${i}`, 3), fromDeck: false },
      ],
    })),
  }
}

describe('redactStateFor', () => {
  it('hides decks and other players’ blind reserves, keeping counts', () => {
    const full = stateWithReserves()
    const view = redactStateFor(full, 1)

    for (const tier of [1, 2, 3] as const) {
      expect(view.decks[tier]).toHaveLength(full.decks[tier].length)
      expect(view.decks[tier].every(isHiddenCard)).toBe(true)
      expect(view.decks[tier].every((c) => c.tier === tier)).toBe(true)
    }
    // Own reserve untouched (same reference, even).
    expect(view.players[1]).toBe(full.players[1])
    for (const other of [0, 2]) {
      const [blind, open] = view.players[other].reserved
      expect(isHiddenCard(blind.card)).toBe(true)
      expect(blind.fromDeck).toBe(true)
      expect(blind.card.tier).toBe(2)
      expect(open).toBe(full.players[other].reserved[1])
    }
    expect(view.rngState).toBe(0)
    expect(view.board).toBe(full.board)
    const json = JSON.stringify(view)
    expect(json).toContain('blind-1')
    expect(json).not.toContain('blind-0')
    expect(json).not.toContain('blind-2')
    expect(json).not.toMatch(/t[123]-0\d/) // deck card ids
    expect(json).toContain('open-0')
  })

  it('gives placeholders unique ids and never mutates the input', () => {
    const full = stateWithReserves()
    const before = JSON.stringify(full)
    const view = redactStateFor(full, -1) // spectator: everything blind is hidden
    expect(JSON.stringify(full)).toBe(before)
    const hidden = [
      ...view.decks[1],
      ...view.decks[2],
      ...view.decks[3],
      ...view.players.flatMap((p) => p.reserved.map((r) => r.card)),
    ].filter(isHiddenCard)
    expect(hidden).toHaveLength(6 + 3)
    expect(new Set(hidden.map((c) => c.id)).size).toBe(hidden.length)
    expect(hidden.every((c) => c.id.startsWith('hidden'))).toBe(true)
  })
})

describe('room codes', () => {
  it('generates valid codes and normalises typed ones', () => {
    for (let i = 0; i < 200; i++) expect(isValidRoomCode(generateRoomCode())).toBe(true)
    expect(generateRoomCode(() => 0.999999)).toBe(ROOM_CODE_ALPHABET.at(-1)?.repeat(5))
    for (const ch of 'ILO01') expect(ROOM_CODE_ALPHABET).not.toContain(ch)
    expect(normalizeRoomCode(' ab-c2 3\n')).toBe('ABC23')
    expect(isValidRoomCode('ABC23')).toBe(true)
    expect(isValidRoomCode('ABC2')).toBe(false)
    expect(isValidRoomCode('ABCO1')).toBe(false)
  })
})

describe('lobbyToPlayers', () => {
  it('maps seats to engine players in seat order', () => {
    expect(
      lobbyToPlayers({
        roomCode: 'ABC23',
        started: false,
        turnLimitSec: 60,
        seats: [
          { kind: 'local', name: 'Hana', claimed: true, online: true, standIn: false },
          { kind: 'remote', name: 'Jiho', claimed: true, online: false, standIn: true },
          { kind: 'ai', name: 'Bunny', difficulty: 'hard', claimed: true, online: true, standIn: false },
        ],
      }),
    ).toEqual([
      { name: 'Hana', kind: 'human' },
      { name: 'Jiho', kind: 'human' },
      { name: 'Bunny', kind: 'ai', difficulty: 'hard' },
    ])
  })
})
