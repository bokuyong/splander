// Wire protocol between the host (authoritative) and its guests.
//
// Every message is a plain JSON object carrying `v` (protocol version) and
// `type`. A peer that receives a message with a different `v` must not try to
// interpret it: the host answers `error/version-mismatch` and closes, the guest
// reports the mismatch and stops retrying.

import type { Action, Difficulty, GameState } from '../shared/contract.ts'

export const PROTOCOL_VERSION = 1

/** Who controls a seat. `local` and `ai` both live on the host's device. */
export type SeatKind = 'local' | 'remote' | 'ai'

/** Public description of one seat. Seat index === player index in GameState. */
export interface LobbySeat {
  kind: SeatKind
  /** Empty string for a remote seat nobody has joined yet. */
  name: string
  /** Only for kind === 'ai'. */
  difficulty?: Difficulty
  /** remote: a guest holds this seat (maybe offline). local/ai: always true. */
  claimed: boolean
  /** remote: the guest's connection is up right now. local/ai: always true. */
  online: boolean
}

export interface Lobby {
  roomCode: string
  seats: LobbySeat[]
  /** True once the host called startGame. */
  started: boolean
}

export type NetErrorCode =
  // fatal for a guest (it stops retrying)
  | 'version-mismatch'
  | 'room-full'
  | 'room-closed'
  | 'kicked'
  | 'room-not-found'
  // recoverable
  | 'network'
  | 'not-connected'
  | 'not-started'
  | 'not-your-turn'
  | 'illegal-action'
  | 'stale-state'
  | 'bad-message'
  | 'bad-lobby'
  | 'ai-failed'

export interface NetError {
  code: NetErrorCode
  message: string
}

// ---- guest -> host ---------------------------------------------------------

export type GuestMessage =
  /** First message on every connection. `token` present = reclaim my seat. */
  | { v: number; type: 'hello'; name: string; token?: string }
  /** `rev` is the state revision the guest was looking at when it acted. */
  | { v: number; type: 'action'; action: Action; rev: number }
  /** Ask for the current lobby and state again. */
  | { v: number; type: 'sync' }
  | { v: number; type: 'ping' }
  /** Give the seat up for good (the token is forgotten by the host). */
  | { v: number; type: 'leave' }

// ---- host -> guest ---------------------------------------------------------

export type HostMessage =
  /** Answer to `hello`. `state` is already redacted for `seat`. */
  | {
      v: number
      type: 'welcome'
      seat: number
      token: string
      lobby: Lobby
      state: GameState | null
      rev: number
    }
  | { v: number; type: 'lobby'; lobby: Lobby }
  /** Full (redacted) state. `rev` increases by one on every applied action. */
  | { v: number; type: 'state'; state: GameState | null; rev: number }
  | { v: number; type: 'error'; code: NetErrorCode; message: string }
  | { v: number; type: 'pong' }

export type ParseResult<T> =
  | { ok: true; msg: T }
  | { ok: false; reason: 'malformed' }
  | { ok: false; reason: 'version'; theirs: number }

const GUEST_TYPES = new Set(['hello', 'action', 'sync', 'ping', 'leave'])
const HOST_TYPES = new Set(['welcome', 'lobby', 'state', 'error', 'pong'])

function parse<T>(raw: unknown, types: Set<string>, check: (m: Record<string, unknown>) => boolean): ParseResult<T> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'malformed' }
  const m = raw as Record<string, unknown>
  if (typeof m.v !== 'number') return { ok: false, reason: 'malformed' }
  // The version is checked before anything else: an unknown version may have
  // message types and shapes we know nothing about.
  if (m.v !== PROTOCOL_VERSION) return { ok: false, reason: 'version', theirs: m.v }
  if (typeof m.type !== 'string' || !types.has(m.type)) return { ok: false, reason: 'malformed' }
  if (!check(m)) return { ok: false, reason: 'malformed' }
  return { ok: true, msg: m as unknown as T }
}

const isObj = (x: unknown): boolean => typeof x === 'object' && x !== null

export function parseGuestMessage(raw: unknown): ParseResult<GuestMessage> {
  return parse<GuestMessage>(raw, GUEST_TYPES, (m) => {
    switch (m.type) {
      case 'hello':
        return typeof m.name === 'string' && (m.token === undefined || typeof m.token === 'string')
      case 'action':
        return isObj(m.action) && typeof m.rev === 'number'
      default:
        return true
    }
  })
}

export function parseHostMessage(raw: unknown): ParseResult<HostMessage> {
  return parse<HostMessage>(raw, HOST_TYPES, (m) => {
    switch (m.type) {
      case 'welcome':
        return (
          typeof m.seat === 'number' &&
          typeof m.token === 'string' &&
          isObj(m.lobby) &&
          typeof m.rev === 'number' &&
          (m.state === null || isObj(m.state))
        )
      case 'lobby':
        return isObj(m.lobby)
      case 'state':
        return typeof m.rev === 'number' && (m.state === null || isObj(m.state))
      case 'error':
        return typeof m.code === 'string' && typeof m.message === 'string'
      default:
        return true
    }
  })
}

// ---- room codes ------------------------------------------------------------

/** No I, L, O, 0, 1: nothing that is easy to misread on a phone. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 5

export function generateRoomCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length) % ROOM_CODE_ALPHABET.length]
  }
  return code
}

/** Upper-cases and strips everything that cannot be part of a code. */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false
  return true
}
