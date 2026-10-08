// PeerJS (WebRTC data channel) implementation of Transport.
//
// NOT covered by the test suite: vitest has no WebRTC. Keep this file thin;
// anything that can be decided without PeerJS belongs in host.ts / guest.ts.
//
// Notes:
// - The host registers on the public PeerJS broker as PEER_ID_PREFIX + code.
//   Guests register under a random id and open one data channel to the host.
// - Messages are sent as JSON *strings* over PeerJS's default binary
//   serialization, because that one chunks large payloads. PeerJS's own 'json'
//   serialization refuses anything over ~16 KB, which a full GameState can exceed.
// - Once a data channel is up it no longer needs the broker, so a guest ignores
//   broker disconnects; the host reconnects to the broker to stay joinable.

import { Peer, type DataConnection, type PeerOptions } from 'peerjs'
import { TransportError, type Connection, type RoomListener, type Transport } from './transport.ts'

export const PEER_ID_PREFIX = 'moonlit-garden-v1-'

export interface PeerTransportOptions {
  /** Passed to `new Peer(...)`: custom broker, ICE/TURN servers, debug level. */
  peerOptions?: PeerOptions
  /** How long listen()/connect() may take before failing with 'network'. Default 15000. */
  timeoutMs?: number
  /** Pause between attempts to get back onto the broker (host). Default 2000. */
  brokerRetryMs?: number
}

function wrap(dc: DataConnection, onDispose?: () => void): Connection & { fireClose(): void } {
  const messageCbs: ((msg: unknown) => void)[] = []
  const closeCbs: (() => void)[] = []
  let closed = false

  function fireClose(): void {
    if (closed) return
    closed = true
    try {
      dc.close()
    } catch {
      // already gone
    }
    onDispose?.()
    for (const cb of [...closeCbs]) cb()
  }

  dc.on('data', (data) => {
    if (closed) return
    let msg: unknown = data
    if (typeof data === 'string') {
      try {
        msg = JSON.parse(data)
      } catch {
        return
      }
    }
    for (const cb of [...messageCbs]) cb(msg)
  })
  dc.on('close', fireClose)
  dc.on('error', fireClose)
  dc.on('iceStateChanged', (state) => {
    // 'disconnected' can still recover; the sessions' heartbeat covers it.
    if (state === 'failed' || state === 'closed') fireClose()
  })

  return {
    send(msg) {
      if (closed || !dc.open) return
      dc.send(JSON.stringify(msg))
    },
    close: fireClose,
    onMessage(cb) {
      messageCbs.push(cb)
    },
    onClose(cb) {
      closeCbs.push(cb)
    },
    fireClose,
  }
}

export function createPeerTransport(options: PeerTransportOptions = {}): Transport {
  const timeoutMs = options.timeoutMs ?? 15000
  const brokerRetryMs = options.brokerRetryMs ?? 2000
  const newPeer = (id?: string): Peer =>
    id === undefined ? new Peer(options.peerOptions ?? {}) : new Peer(id, options.peerOptions ?? {})

  return {
    listen(roomCode, onConnection) {
      return new Promise<RoomListener>((resolve, reject) => {
        const peer = newPeer(PEER_ID_PREFIX + roomCode)
        const closeCbs: (() => void)[] = []
        const conns = new Set<{ fireClose(): void }>()
        let opened = false
        let done = false // closed by us or lost for good
        let retryTimer: ReturnType<typeof setTimeout> | null = null

        function shutdown(notify: boolean): void {
          if (done) return
          done = true
          clearTimeout(openTimer)
          if (retryTimer !== null) clearTimeout(retryTimer)
          for (const c of [...conns]) c.fireClose()
          try {
            peer.destroy()
          } catch {
            // already destroyed
          }
          if (notify) for (const cb of [...closeCbs]) cb()
        }

        const openTimer = setTimeout(() => {
          if (opened || done) return
          shutdown(false)
          reject(new TransportError('network', 'Timed out reaching the PeerJS broker'))
        }, timeoutMs)

        peer.on('open', () => {
          if (done || opened) return // also fires again after a broker reconnect
          opened = true
          clearTimeout(openTimer)
          resolve({
            close: () => shutdown(false),
            onClose(cb) {
              closeCbs.push(cb)
            },
          })
        })

        peer.on('connection', (dc) => {
          if (done) {
            dc.close()
            return
          }
          const conn = wrap(dc, () => conns.delete(conn))
          conns.add(conn)
          // Hand the connection over only once it can carry data.
          if (dc.open) onConnection(conn)
          else dc.on('open', () => onConnection(conn))
        })

        peer.on('disconnected', () => {
          // Lost the broker socket. Existing data channels keep working, but
          // nobody new (or returning) can find us until we are back.
          if (done || !opened || retryTimer !== null) return
          const attempt = () => {
            retryTimer = null
            if (done || peer.destroyed) return
            if (!peer.disconnected) return
            try {
              peer.reconnect()
            } catch {
              shutdown(true)
              return
            }
            retryTimer = setTimeout(attempt, brokerRetryMs * 2)
          }
          retryTimer = setTimeout(attempt, brokerRetryMs)
        })

        peer.on('error', (err) => {
          if (done) return
          const type = String(err.type)
          if (!opened) {
            shutdown(false)
            reject(new TransportError(type === 'unavailable-id' ? 'id-taken' : 'network', err.message))
            return
          }
          // After opening: 'unavailable-id' means the broker gave our code to
          // someone else while we were away, which cannot be repaired here.
          // Everything else is either per-connection noise or followed by a
          // 'disconnected' event, which the handler above retries.
          if (type === 'unavailable-id' || type === 'invalid-id' || type === 'browser-incompatible') shutdown(true)
        })

        peer.on('close', () => shutdown(true))
      })
    },

    connect(roomCode) {
      return new Promise<Connection>((resolve, reject) => {
        const peer = newPeer()
        let settled = false
        let conn: (Connection & { fireClose(): void }) | null = null

        function destroyPeer(): void {
          try {
            peer.destroy()
          } catch {
            // already destroyed
          }
        }

        function fail(code: 'room-not-found' | 'network', message: string): void {
          if (settled) return
          settled = true
          clearTimeout(timer)
          destroyPeer()
          reject(new TransportError(code, message))
        }

        const timer = setTimeout(() => fail('network', 'Timed out connecting to the host'), timeoutMs)

        peer.on('open', () => {
          if (settled) return
          const dc = peer.connect(PEER_ID_PREFIX + roomCode, { reliable: true })
          const wrapped = wrap(dc, destroyPeer)
          conn = wrapped
          wrapped.onClose(() => fail('network', 'The connection closed before it opened'))
          dc.on('open', () => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve(wrapped)
          })
        })

        peer.on('error', (err) => {
          const type = String(err.type)
          if (!settled) {
            fail(type === 'peer-unavailable' ? 'room-not-found' : 'network', err.message)
            return
          }
          // Established: broker trouble does not matter to an open data channel.
          if (type === 'browser-incompatible') conn?.fireClose()
        })

        peer.on('close', () => {
          if (!settled) fail('network', 'Peer closed')
          else conn?.fireClose()
        })
      })
    },
  }
}
