// The one online room this device is in. It lives at module scope (not in a
// component) so React re-mounts and StrictMode's double effects can never
// create a second session for the same room.
import { getSavedGuestRoom, getSavedHostRoom } from '../../net'
import { createGuestRoom, createHostRoom, type OnlineRoom } from './onlineController'

const MARKER_KEY = 'moonlit-garden:online:v1'

/** Which room this device was last in, and whether it was still inside it. */
interface Marker {
  role: 'host' | 'guest'
  roomCode: string | null
  name: string
  /** True while the player is in the room: a reload goes straight back in. */
  active: boolean
}

function readMarker(): Marker | null {
  try {
    const raw = localStorage.getItem(MARKER_KEY)
    if (!raw) return null
    const m = JSON.parse(raw) as Partial<Marker>
    if (m.role !== 'host' && m.role !== 'guest') return null
    return {
      role: m.role,
      roomCode: typeof m.roomCode === 'string' ? m.roomCode : null,
      name: typeof m.name === 'string' ? m.name : '',
      active: m.active === true,
    }
  } catch {
    return null
  }
}

function writeMarker(marker: Marker | null): void {
  try {
    if (marker) localStorage.setItem(MARKER_KEY, JSON.stringify(marker))
    else localStorage.removeItem(MARKER_KEY)
  } catch {
    // storage disabled: no resume after a reload, play goes on
  }
}

export interface SavedRoom {
  role: 'host' | 'guest'
  roomCode: string
  name: string
}

/** The room this device can go back to, if any (the most recently used one). */
export function getSavedRoom(): SavedRoom | null {
  const host = getSavedHostRoom()
  const guest = getSavedGuestRoom()
  const asHost: SavedRoom | null = host ? { role: 'host', roomCode: host.roomCode, name: host.seatNames[0] ?? '' } : null
  const asGuest: SavedRoom | null = guest ? { role: 'guest', roomCode: guest.roomCode, name: guest.name } : null
  const marker = readMarker()
  if (marker?.role === 'guest' && asGuest) return asGuest
  if (marker?.role === 'host' && asHost) return asHost
  return asHost ?? asGuest
}

/** True when the app was closed / reloaded while inside a room. */
export function shouldAutoResume(): boolean {
  return readMarker()?.active === true && getSavedRoom() !== null
}

// --- the active room ----------------------------------------------------------

let active: OnlineRoom | null = null
const listeners = new Set<() => void>()

function setActive(room: OnlineRoom | null): void {
  active = room
  for (const listener of [...listeners]) listener()
}

export function subscribeRoom(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getRoom(): OnlineRoom | null {
  return active
}

/** Closes whatever is open (kept resumable) before another room is opened. */
function replaceActive(room: OnlineRoom, marker: Marker): OnlineRoom {
  active?.leave()
  writeMarker(marker)
  setActive(room)
  return room
}

export function openHostRoom(name: string): OnlineRoom {
  return replaceActive(createHostRoom({ name }), { role: 'host', roomCode: null, name, active: true })
}

export function openGuestRoom(roomCode: string, name: string): OnlineRoom {
  return replaceActive(createGuestRoom({ roomCode, name }), { role: 'guest', roomCode, name, active: true })
}

/** Goes back into the saved room. Returns null when there is none. */
export function resumeSavedRoom(): OnlineRoom | null {
  if (active) return active
  const saved = getSavedRoom()
  if (!saved) return null
  const marker: Marker = { ...saved, active: true }
  return saved.role === 'host'
    ? replaceActive(createHostRoom({ resume: true }), marker)
    : replaceActive(createGuestRoom({ roomCode: saved.roomCode, name: saved.name }), marker)
}

/**
 * Leaves the active room. `forget: false` keeps it resumable ("step out"),
 * `forget: true` closes the room (host) or gives the seat up (guest).
 */
export function leaveRoom(forget: boolean): void {
  const room = active
  if (!room) return
  room.leave({ forget })
  const marker = readMarker()
  writeMarker(forget || !marker ? null : { ...marker, active: false })
  setActive(null)
}
