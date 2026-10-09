// Online play screens. PRESENTATIONAL ONLY: everything comes in through props.
// src/ui/online/OnlineFlow.tsx drives them from a src/net session.
import { useEffect, useState } from 'react'
import type { Difficulty } from '../../shared/contract'
import { THEME } from '../../data'
import {
  ClockIcon,
  CloseIcon,
  GemIcon,
  LinkIcon,
  MoonIcon,
  PalaceIcon,
  PlayIcon,
  RobotIcon,
  UserIcon,
} from '../components/Icons'
import { Page, Segmented } from './HomeScreens'

/** The lobby's turn-limit choices (seconds; null = no limit), as the net module offers them. */
const TURN_LIMIT_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: '없음' },
  { value: 30, label: '30초' },
  { value: 60, label: '60초' },
  { value: 90, label: '90초' },
]

function turnLimitText(sec: number | null): string {
  return sec === null ? '차례 시간 제한 없음' : `차례마다 ${sec}초 · 시간이 다 되면 AI가 대신 둬요`
}

/** Mirrors ConnectionStatus of src/net. */
export type OnlineStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

/** One row of the waiting room; structurally compatible with net's LobbySeat. */
export interface LobbySeatView {
  /** 'local' = on the host's device, 'remote' = a guest's phone, 'ai' = computer. */
  kind: 'local' | 'remote' | 'ai'
  name: string
  difficulty?: Difficulty
  /** remote seats: a guest has taken it. */
  claimed: boolean
  /** remote seats: that guest is connected right now. */
  online: boolean
  /** remote seats: away for a while, the AI plays their turns. */
  standIn?: boolean
  /** This device's own seat (highlighted). */
  isMe?: boolean
}

export interface OnlineMenuProps {
  /** Prefills the name field. */
  defaultName: string
  /** Characters in a room code (net: ROOM_CODE_LENGTH). */
  codeLength?: number
  /** A room this device can return to (net: getSavedHostRoom / getSavedGuestRoom). */
  savedRoom?: { roomCode: string; role: 'host' | 'guest' } | null
  /** Disables the buttons while a session is being created. */
  busy?: boolean
  /** Korean message shown under the form. */
  error?: string | null
  onCreate: (name: string) => void
  onJoin: (name: string, roomCode: string) => void
  onRejoin?: () => void
  onBack: () => void
}

export function OnlineMenu({
  defaultName,
  codeLength = 5,
  savedRoom,
  busy,
  error,
  onCreate,
  onJoin,
  onRejoin,
  onBack,
}: OnlineMenuProps) {
  const [name, setName] = useState(defaultName)
  const [code, setCode] = useState('')
  const cleanName = name.trim()
  const cleanCode = code.replace(/[\s-]/g, '')
  const nameOk = cleanName.length > 0
  return (
    <Page title="온라인" onBack={onBack}>
      <p className="page-lead">각자 폰으로 같은 방에 들어가서 놀아요. 한 사람이 방을 만들고 코드를 알려 주세요.</p>
      <label className="field">
        <span>내 이름</span>
        <input value={name} maxLength={8} placeholder="이름" autoComplete="off" onChange={(e) => setName(e.target.value)} />
      </label>

      {savedRoom && onRejoin && (
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={onRejoin}>
          <PlayIcon /> 하던 방으로 돌아가기 <small>{savedRoom.roomCode.toUpperCase()}</small>
        </button>
      )}

      <section className="panel">
        <h2>
          <PalaceIcon /> 방 만들기
        </h2>
        <p className="field-note">내 폰이 방이 돼요. 코드를 상대에게 알려 주세요.</p>
        <button type="button" className="btn btn-primary btn-block" disabled={busy || !nameOk} onClick={() => onCreate(cleanName)}>
          방 만들기
        </button>
      </section>

      <section className="panel">
        <h2>
          <LinkIcon /> 코드로 들어가기
        </h2>
        <input
          className="code-input"
          value={code}
          maxLength={codeLength + 2}
          placeholder={'•'.repeat(codeLength)}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          aria-label="방 코드"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button
          type="button"
          className="btn btn-block"
          disabled={busy || !nameOk || cleanCode.length !== codeLength}
          onClick={() => onJoin(cleanName, cleanCode)}
        >
          들어가기
        </button>
      </section>
      <p className={`reason${error ? '' : ' is-info'}`} role="status">
        {error ?? (nameOk ? '' : '이름을 먼저 적어 주세요')}
      </p>
    </Page>
  )
}

export interface OnlineLobbyProps {
  role: 'host' | 'guest'
  /** Null while the room is still being registered. */
  roomCode: string | null
  status: OnlineStatus
  seats: LobbySeatView[]
  /** Korean message (connection problem, bad lobby, ...). */
  error: string | null
  /** Host only: every remote seat is claimed and the game may begin. */
  canStart: boolean
  /** Shown under the start button when it is disabled. */
  startHint?: string
  /** Host only. */
  onStart?: () => void
  /** Host only: append an open guest seat or an AI seat (up to 4 seats). */
  onAddSeat?: (kind: 'remote' | 'ai') => void
  /** Host only: remove seat `index` (at least 2 remain). */
  onRemoveSeat?: (index: number) => void
  /** Seconds per turn, null = no limit (net: lobby.turnLimitSec). */
  turnLimitSec: number | null
  /** Host only: change the turn limit. Guests only see it. */
  onTurnLimit?: (seconds: number | null) => void
  /** Shown when status is 'disconnected'. */
  onRetry?: () => void
  /** Leave / close the room for good. */
  onLeave: () => void
}

const STATUS_TEXT: Record<OnlineStatus, string> = {
  connecting: '연결하는 중…',
  connected: '연결됨',
  reconnecting: '다시 연결하는 중…',
  disconnected: '연결이 끊겼어요',
}

function seatStatus(seat: LobbySeatView): string {
  if (seat.kind === 'ai') return `AI · ${THEME.difficulty[seat.difficulty ?? 'normal']}`
  if (seat.kind === 'local') return '이 방의 주인'
  if (!seat.claimed) return '기다리는 중…'
  if (seat.online) return '들어왔어요'
  return seat.standIn ? '자리 비움 · AI가 대신 둬요' : '잠깐 자리 비움'
}

export function OnlineLobby({
  role,
  roomCode,
  status,
  seats,
  error,
  canStart,
  startHint,
  onStart,
  onAddSeat,
  onRemoveSeat,
  turnLimitSec,
  onTurnLimit,
  onRetry,
  onLeave,
}: OnlineLobbyProps) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () => {
    if (!roomCode) return
    void navigator.clipboard
      ?.writeText(roomCode.toUpperCase())
      .then(() => setCopied(true))
      .catch(() => undefined)
  }
  const host = role === 'host'
  return (
    <Page
      title="대기실"
      onBack={onLeave}
      footer={
        host ? (
          <>
            <button type="button" className="btn btn-primary btn-block" disabled={!canStart} onClick={onStart}>
              <GemIcon /> 게임 시작
            </button>
            <p className="reason is-info">{canStart ? '' : (startHint ?? '모두 들어오면 시작할 수 있어요')}</p>
          </>
        ) : (
          <p className="reason is-info">방 주인이 시작하면 바로 게임이 열려요</p>
        )
      }
    >
      <section className="roomcode">
        <p className="roomcode-label">방 코드</p>
        <button type="button" className="roomcode-value" onClick={copy} disabled={!roomCode} aria-label="방 코드 복사">
          {roomCode ? (
            roomCode
              .toUpperCase()
              .split('')
              .map((ch, i) => <span key={i}>{ch}</span>)
          ) : (
            <span className="roomcode-wait">만드는 중…</span>
          )}
        </button>
        <p className="field-note">{copied ? '복사했어요!' : host ? '눌러서 복사하고 상대에게 보내 주세요' : '이 방에 들어와 있어요'}</p>
        <p className={`conn conn-${status}`}>
          <i aria-hidden="true" />
          {STATUS_TEXT[status]}
          {status === 'disconnected' && onRetry && (
            <button type="button" className="btn btn-small" onClick={onRetry}>
              다시 시도
            </button>
          )}
        </p>
      </section>

      <ul className="seats">
        {seats.map((seat, i) => (
          <li key={i} className={`seat${seat.isMe ? ' is-me' : ''}${seat.kind === 'remote' && !seat.claimed ? ' is-open' : ''}`}>
            <span className="seat-no">{i + 1}</span>
            <span className="seat-face" aria-hidden="true">
              {seat.kind === 'ai' ? <RobotIcon /> : seat.kind === 'remote' && !seat.claimed ? <MoonIcon /> : <UserIcon />}
            </span>
            <span className="seat-main">
              <b>
                {seat.kind === 'remote' && !seat.claimed ? '빈 자리' : seat.name}
                {seat.isMe ? ' (나)' : ''}
              </b>
              <small>{seatStatus(seat)}</small>
            </span>
            {seat.kind === 'remote' && seat.claimed && <i className={`seat-dot${seat.online ? ' is-on' : ''}`} aria-hidden="true" />}
            {host && onRemoveSeat && !seat.isMe && seats.length > 2 && (
              <button type="button" className="icon-btn" onClick={() => onRemoveSeat(i)} aria-label={`${i + 1}번 자리 빼기`}>
                <CloseIcon />
              </button>
            )}
          </li>
        ))}
      </ul>

      {host && onAddSeat && seats.length < 4 && (
        <div className="seat-add">
          <button type="button" className="btn btn-small btn-ghost" onClick={() => onAddSeat('remote')}>
            + 친구 자리
          </button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => onAddSeat('ai')}>
            + AI 자리
          </button>
        </div>
      )}

      <section className="panel turn-limit">
        <h2>
          <ClockIcon /> 차례 시간
        </h2>
        {host && onTurnLimit ? (
          <>
            {/* Segmented wants a string/number value: 0 stands for "no limit" */}
            <Segmented
              label="차례 시간"
              value={turnLimitSec ?? 0}
              options={TURN_LIMIT_OPTIONS.map((o) => ({ value: o.value ?? 0, label: o.label }))}
              onChange={(v) => onTurnLimit(v === 0 ? null : v)}
            />
            <p className="field-note">
              {turnLimitSec === null
                ? '시간 제한 없이 느긋하게. 자리를 오래 비운 친구 대신에는 AI가 둬요.'
                : `시간이 다 되면 AI가 그 사람 대신 한 수 둬요. 자리를 오래 비워도 게임은 계속돼요.`}
            </p>
          </>
        ) : (
          <p className="field-note">{turnLimitText(turnLimitSec)}</p>
        )}
      </section>
      {error && (
        <p className="reason" role="alert">
          {error}
        </p>
      )}
    </Page>
  )
}
