// Wire protocol between the host (authoritative) and its guests.
//
// Every message is a plain JSON object carrying `v` (protocol version) and
// `type`. A peer that receives a message with a different `v` must not try to
// interpret it: the host answers `error/version-mismatch` and closes, the guest
// reports the mismatch and stops retrying. A message of the right version but
// an unknown `type` is ignored by both sides (never fatal), so additive
// changes do not need a new version; this one still bumps it whenever a
// feature must exist on both ends to work (v2: emotes, v3: turn timer and
// stand-ins), so that a stale cached client gets the clear "reload both
// devices" error instead of a game that silently lacks the feature.
//
// Turn timer and clock skew
// -------------------------
// The host is the only clock that matters. It records when the current turn
// began and, in every `state` / `welcome` message, sends how many
// milliseconds are LEFT at the moment of sending (`timer.remainingMs`). A
// guest anchors that to its own clock on receipt (deadline = Date.now() +
// remainingMs), so the two devices' clocks are never compared and skew cannot
// matter; only the one-way delivery delay (tens of ms) is lost. A guest that
// wakes up asks for a `sync` and gets a fresh remainingMs.

import type { Action, Difficulty, GameState } from '../shared/contract.ts'

/** v1: lobby, state, actions. v2: + emotes. v3: + turn timer, stand-ins. */
export const PROTOCOL_VERSION = 3

/** Why the host played a move for a seat instead of its owner. */
export type ForcedReason = 'timeout' | 'offline'

/** The turn clock as sent on the wire (see "Turn timer and clock skew"). */
export interface WireTimer {
  /** Seconds per turn, as chosen in the lobby. */
  limitSec: number
  /** Milliseconds left for the current turn at the moment the host sent this. */
  remainingMs: number
}

/** The lobby's choices, in display order (null = no limit). */
export const TURN_LIMIT_CHOICES: readonly (number | null)[] = [null, 30, 60, 90]
export const DEFAULT_TURN_LIMIT_SEC = 60
/** A remote seat offline for this long during a game gets a stand-in. */
export const STAND_IN_AFTER_MS = 30_000

export function isTurnLimit(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 10 && value <= 600)
}

// Both fields may be left out (= null), so a minimal state message still parses.
function isForcedReason(value: unknown): value is ForcedReason | null | undefined {
  return value === undefined || value === null || value === 'timeout' || value === 'offline'
}

function isWireTimer(value: unknown): value is WireTimer | null | undefined {
  if (value === undefined || value === null) return true
  if (typeof value !== 'object') return false
  const t = value as Record<string, unknown>
  return typeof t.limitSec === 'number' && typeof t.remainingMs === 'number'
}

/** Emote ids are short lower-case tokens (the UI owns the actual set). */
const EMOTE_ID = /^[a-z0-9_-]{1,32}$/
export function isEmoteIdShape(id: unknown): id is string {
  return typeof id === 'string' && EMOTE_ID.test(id)
}

/** A player flashed an emote. `at` is the host's clock (ms since epoch). */
export interface EmoteEvent {
  seat: number
  id: string
  at: number
}

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
  /**
   * remote: the guest has been offline for STAND_IN_AFTER_MS during a game,
   * so the host's AI plays its turns until it comes back. Otherwise false.
   */
  standIn: boolean
}

export interface Lobby {
  roomCode: string
  seats: LobbySeat[]
  /** True once the host called startGame. */
  started: boolean
  /** Seconds a player gets per turn; null = no limit. Chosen by the host. */
  turnLimitSec: number | null
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
  /** Flash an emote over my seat. The host validates, stamps the seat and rebroadcasts. */
  | { v: number; type: 'emote'; id: string }

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
      /** Absent counts as null (see `state`). */
      timer?: WireTimer | null
      forced?: ForcedReason | null
    }
  | { v: number; type: 'lobby'; lobby: Lobby }
  /**
   * Full (redacted) state. `rev` increases by one on every applied action.
   * `timer` is null without a limit, in the lobby, after the game and on an
   * AI seat's turn. `forced` is set when the host played the last move for
   * the seat's owner (time ran out, or the owner is away with a stand-in).
   * The host always sends both; a receiver treats a missing one as null.
   */
  | {
      v: number
      type: 'state'
      state: GameState | null
      rev: number
      timer?: WireTimer | null
      forced?: ForcedReason | null
    }
  | { v: number; type: 'error'; code: NetErrorCode; message: string }
  | { v: number; type: 'pong' }
  /** Somebody (maybe you, maybe the host itself) flashed an emote. Broadcast to every guest. */
  | { v: number; type: 'emote'; seat: number; id: string; at: number }

export type ParseResult<T> =
  | { ok: true; msg: T }
  | { ok: false; reason: 'malformed' }
  /** Right version, a `type` this build does not know: ignore it. */
  | { ok: false; reason: 'unknown-type' }
  | { ok: false; reason: 'version'; theirs: number }

const GUEST_TYPES = new Set(['hello', 'action', 'sync', 'ping', 'leave', 'emote'])
const HOST_TYPES = new Set(['welcome', 'lobby', 'state', 'error', 'pong', 'emote'])

function parse<T>(raw: unknown, types: Set<string>, check: (m: Record<string, unknown>) => boolean): ParseResult<T> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'malformed' }
  const m = raw as Record<string, unknown>
  if (typeof m.v !== 'number') return { ok: false, reason: 'malformed' }
  // The version is checked before anything else: an unknown version may have
  // message types and shapes we know nothing about.
  if (m.v !== PROTOCOL_VERSION) return { ok: false, reason: 'version', theirs: m.v }
  if (typeof m.type !== 'string') return { ok: false, reason: 'malformed' }
  if (!types.has(m.type)) return { ok: false, reason: 'unknown-type' }
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
      case 'emote':
        return isEmoteIdShape(m.id)
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
          (m.state === null || isObj(m.state)) &&
          isWireTimer(m.timer) &&
          isForcedReason(m.forced)
        )
      case 'lobby':
        return isObj(m.lobby)
      case 'state':
        return (
          typeof m.rev === 'number' &&
          (m.state === null || isObj(m.state)) &&
          isWireTimer(m.timer) &&
          isForcedReason(m.forced)
        )
      case 'error':
        return typeof m.code === 'string' && typeof m.message === 'string'
      case 'emote':
        return Number.isInteger(m.seat) && (m.seat as number) >= 0 && isEmoteIdShape(m.id) && typeof m.at === 'number'
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
