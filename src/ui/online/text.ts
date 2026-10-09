// Korean texts for online play, and the pure "what should the screen say
// about the connection right now" logic. No React, no side effects.
import type { NetError, NetErrorCode, SessionSnapshot } from '../../net'

const ERROR_TEXT: Record<NetErrorCode, string> = {
  'version-mismatch': '두 폰의 앱 버전이 달라요. 둘 다 새로고침해 주세요',
  'room-full': '방에 빈 자리가 없어요',
  'room-closed': '방 주인이 방을 닫았어요',
  kicked: '방 주인이 이 자리를 뺐어요',
  'room-not-found': '그런 방이 없어요. 코드를 다시 확인해 주세요',
  network: '연결이 잘 안 돼요. 인터넷을 확인해 주세요',
  'not-connected': '연결이 끊겨 있어요. 잠시만 기다려 주세요',
  'not-started': '아직 게임이 시작되지 않았어요',
  'not-your-turn': '아직 내 차례가 아니에요',
  'illegal-action': '지금은 할 수 없는 행동이에요',
  'stale-state': '판이 먼저 바뀌었어요. 다시 골라 주세요',
  'bad-message': '알 수 없는 신호가 왔어요. 다시 해 주세요',
  'bad-lobby': '아직 시작할 수 없어요. 자리를 확인해 주세요',
  'ai-failed': 'AI가 잠깐 멈췄어요',
}

/** Short Korean message for a net error (the English `message` is for logs). */
export function netErrorText(error: NetError): string {
  return ERROR_TEXT[error.code] ?? '문제가 생겼어요. 다시 해 주세요'
}

/** Errors after which a guest session stops for good: there is nothing to wait for. */
const FATAL_CODES: ReadonlySet<NetErrorCode> = new Set<NetErrorCode>([
  'version-mismatch',
  'room-full',
  'room-closed',
  'kicked',
  'room-not-found',
])

export function isFatalError(error: NetError | null): boolean {
  return error !== null && FATAL_CODES.has(error.code)
}

/**
 * Errors that describe the connection, not a move. They are shown by the
 * lobby / the connection banner and must survive the game screen's
 * "toast it, then clear it" handling.
 */
export function isConnectionError(error: NetError | null): boolean {
  return error !== null && (FATAL_CODES.has(error.code) || error.code === 'network')
}

export interface ConnectionNotice {
  tone: 'info' | 'warn' | 'error'
  text: string
  /** A button to offer next to the text. */
  action?: 'retry' | 'leave'
}

/** What to tell the player about the connection; null when all is well. */
export function connectionNotice(snap: SessionSnapshot): ConnectionNotice | null {
  if (snap.status === 'disconnected') {
    if (isFatalError(snap.lastError)) {
      return { tone: 'error', text: netErrorText(snap.lastError as NetError), action: 'leave' }
    }
    return {
      tone: 'error',
      text: snap.role === 'host' ? '방을 열지 못했어요' : '연결이 끊겼어요',
      action: 'retry',
    }
  }
  if (snap.role === 'guest') {
    if (snap.status !== 'connected') return { tone: 'warn', text: '방 주인과 다시 연결하는 중…' }
  }
  const gone = (snap.lobby?.seats ?? []).filter(
    (seat, i) => seat.kind === 'remote' && seat.claimed && !seat.online && i !== snap.mySeat,
  )
  const away = gone.filter((seat) => !seat.standIn).map((seat) => seat.name)
  const standIns = gone.filter((seat) => seat.standIn).map((seat) => seat.name)
  if (away.length > 0) {
    return { tone: 'warn', text: `${away.join(', ')} 연결이 끊겼어요 · 돌아오길 기다려요` }
  }
  if (standIns.length > 0) {
    return { tone: 'warn', text: `${standIns.join(', ')} 대신 AI가 두는 중 · 돌아오면 바로 넘겨요` }
  }
  if (snap.role === 'host' && snap.status !== 'connected') {
    return {
      tone: 'info',
      text: snap.status === 'connecting' ? '방을 여는 중…' : '방을 다시 여는 중… (게임은 계속할 수 있어요)',
    }
  }
  return null
}
