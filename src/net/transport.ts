// Transport abstraction. All protocol logic (host.ts, guest.ts) is written
// against these interfaces; peerTransport.ts implements them over PeerJS and
// createMemoryNetwork() below implements them in memory for tests.

/** One bidirectional, ordered, reliable channel between a guest and the host. */
export interface Connection {
  /** Sends a JSON-serialisable message. Silently dropped once closed. */
  send(msg: unknown): void
  /** Closes both directions. onClose listeners fire on both ends, once. */
  close(): void
  onMessage(cb: (msg: unknown) => void): void
  onClose(cb: () => void): void
}

/** The host's registration under a room code. */
export interface RoomListener {
  /** Stops accepting connections and frees the room code. */
  close(): void
  /** Fires when the registration is lost for good (not on close()). */
  onClose(cb: () => void): void
}

export type TransportErrorCode = 'id-taken' | 'room-not-found' | 'network'

export class TransportError extends Error {
  code: TransportErrorCode
  constructor(code: TransportErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'TransportError'
    this.code = code
  }
}

export interface Transport {
  /**
   * Host side: claim `roomCode` and accept guest connections.
   * Rejects with TransportError 'id-taken' when the code is in use.
   */
  listen(roomCode: string, onConnection: (conn: Connection) => void): Promise<RoomListener>
  /**
   * Guest side: open a connection to the host of `roomCode`.
   * Rejects with TransportError 'room-not-found' or 'network'.
   */
  connect(roomCode: string): Promise<Connection>
}

export function transportErrorCode(e: unknown): TransportErrorCode {
  return e instanceof TransportError ? e.code : 'network'
}

// ---- in-memory implementation ----------------------------------------------

class MemoryEnd implements Connection {
  peer: MemoryEnd | null = null
  open = true
  private messageCbs: ((msg: unknown) => void)[] = []
  private closeCbs: (() => void)[] = []
  private inbox: unknown[] = []
  private network: MemoryNetwork

  constructor(network: MemoryNetwork) {
    this.network = network
  }

  send(msg: unknown): void {
    if (!this.open || !this.peer) return
    if (this.network.blackhole) return
    // Round-trip through JSON so tests catch anything that would not survive
    // the real wire, and so the two sides never share object references.
    const copy: unknown = JSON.parse(JSON.stringify(msg))
    const peer = this.peer
    this.network.sent.push(copy)
    queueMicrotask(() => peer.receive(copy))
  }

  private receive(msg: unknown): void {
    if (!this.open) return
    if (this.messageCbs.length === 0) this.inbox.push(msg)
    else for (const cb of [...this.messageCbs]) cb(msg)
  }

  close(): void {
    if (!this.open) return
    this.open = false
    const peer = this.peer
    for (const cb of [...this.closeCbs]) cb()
    // The far end learns about it asynchronously, like a real network.
    if (peer) queueMicrotask(() => peer.close())
  }

  onMessage(cb: (msg: unknown) => void): void {
    this.messageCbs.push(cb)
    const pending = this.inbox
    this.inbox = []
    for (const msg of pending) cb(msg)
  }

  onClose(cb: () => void): void {
    this.closeCbs.push(cb)
  }
}

interface MemoryRoom {
  onConnection: (conn: Connection) => void
  closeCbs: (() => void)[]
  ends: MemoryEnd[]
}

export interface MemoryNetwork extends Transport {
  /** Every message that went over the wire (after JSON round-trip), in order. */
  sent: unknown[]
  /** While true, messages are silently lost (connections stay "open"). */
  blackhole: boolean
  /** While true, connect() and listen() reject with 'network'. */
  offline: boolean
  /** Room codes that currently have a host. */
  rooms(): string[]
  /** Simulates every connection of a room dropping (host stays registered). */
  dropConnections(roomCode: string): void
  /** Simulates the host losing its registration; its listener's onClose fires. */
  killRoom(roomCode: string): void
}

/** A fake network shared by any number of host and guest sessions in a test. */
export function createMemoryNetwork(): MemoryNetwork {
  const rooms = new Map<string, MemoryRoom>()

  const network: MemoryNetwork = {
    sent: [],
    blackhole: false,
    offline: false,

    async listen(roomCode, onConnection) {
      await Promise.resolve()
      if (network.offline) throw new TransportError('network')
      if (rooms.has(roomCode)) throw new TransportError('id-taken')
      const room: MemoryRoom = { onConnection, closeCbs: [], ends: [] }
      rooms.set(roomCode, room)
      return {
        close() {
          if (rooms.get(roomCode) !== room) return
          rooms.delete(roomCode)
          for (const end of [...room.ends]) end.close()
        },
        onClose(cb) {
          room.closeCbs.push(cb)
        },
      }
    },

    async connect(roomCode) {
      await Promise.resolve()
      if (network.offline) throw new TransportError('network')
      const room = rooms.get(roomCode)
      if (!room) throw new TransportError('room-not-found')
      const guestEnd = new MemoryEnd(network)
      const hostEnd = new MemoryEnd(network)
      guestEnd.peer = hostEnd
      hostEnd.peer = guestEnd
      room.ends.push(hostEnd)
      room.onConnection(hostEnd)
      return guestEnd
    },

    rooms: () => [...rooms.keys()],

    dropConnections(roomCode) {
      const room = rooms.get(roomCode)
      if (!room) return
      const ends = room.ends
      room.ends = []
      for (const end of ends) end.close()
    },

    killRoom(roomCode) {
      const room = rooms.get(roomCode)
      if (!room) return
      rooms.delete(roomCode)
      for (const end of [...room.ends]) end.close()
      for (const cb of [...room.closeCbs]) cb()
    },
  }
  return network
}
