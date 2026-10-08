// Online play, end to end: menu -> waiting room -> game table, all driven by
// the net session's snapshot. The room itself lives in roomStore (module
// scope); this component only renders it.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { ROOM_CODE_LENGTH, type HostSession, type SessionSnapshot } from '../../net'
import { BackIcon, PeopleIcon } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { GameScreen } from '../game/GameScreen'
import { OnlineLobby, OnlineMenu, type LobbySeatView } from '../home/OnlineScreens'
import { loadPrefs, savePrefs } from '../home/prefs'
import type { OnlineRoom } from './onlineController'
import {
  getRoom,
  getSavedRoom,
  leaveRoom,
  openGuestRoom,
  openHostRoom,
  resumeSavedRoom,
  subscribeRoom,
} from './roomStore'
import { connectionNotice, isConnectionError, isFatalError, netErrorText, type ConnectionNotice } from './text'
import './online.css'

const AI_NAMES = ['진주', '호박', '산호']

interface OnlineFlowProps {
  /** Back to the home screen. */
  onExit: () => void
  /** Go straight back into the saved room (after a reload in the middle of a game). */
  autoResume?: boolean
}

export function OnlineFlow({ onExit, autoResume = false }: OnlineFlowProps) {
  const room = useSyncExternalStore(subscribeRoom, getRoom)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [resuming, setResuming] = useState(autoResume)
  useEffect(() => {
    if (!autoResume) return
    resumeSavedRoom() // returns the already open room when called twice
    setResuming(false)
  }, [autoResume])

  if (room) {
    return (
      <RoomView
        key={room.id}
        room={room}
        onHome={onExit}
        onJoinFailed={(text, forget) => {
          leaveRoom(forget)
          setMenuError(text)
        }}
      />
    )
  }
  if (resuming) return null
  return <Menu error={menuError} onBack={onExit} onOpen={() => setMenuError(null)} />
}

function Menu({ error, onBack, onOpen }: { error: string | null; onBack: () => void; onOpen: () => void }) {
  const [prefs] = useState(loadPrefs)
  const [saved] = useState(getSavedRoom)
  return (
    <OnlineMenu
      defaultName={prefs.name}
      codeLength={ROOM_CODE_LENGTH}
      savedRoom={saved}
      error={error}
      onBack={onBack}
      onCreate={(name) => {
        savePrefs({ name })
        onOpen()
        openHostRoom(name)
      }}
      onJoin={(name, roomCode) => {
        savePrefs({ name })
        onOpen()
        openGuestRoom(roomCode, name)
      }}
      onRejoin={() => {
        onOpen()
        resumeSavedRoom()
      }}
    />
  )
}

function lobbySeats(snap: SessionSnapshot): LobbySeatView[] {
  return (snap.lobby?.seats ?? []).map((seat, i) => ({ ...seat, isMe: i === snap.mySeat }))
}

function RoomView({
  room,
  onHome,
  onJoinFailed,
}: {
  room: OnlineRoom
  onHome: () => void
  onJoinFailed: (text: string, forget: boolean) => void
}) {
  const snap = useSyncExternalStore(room.session.subscribe, room.session.getSnapshot)
  const [exitOpen, setExitOpen] = useState(false)
  const host = room.role === 'host'
  const inGame = snap.state !== null && room.hasGame()
  const notice = connectionNotice(snap)

  // A guest that never got in (wrong code, full room): back to the menu with the reason.
  const joinError = !host && snap.lobby === null && snap.status === 'disconnected' ? snap.lastError : null
  useEffect(() => {
    if (!joinError) return
    // A stale seat token is worthless; a version mismatch or bad network is not the token's fault.
    const forget = isFatalError(joinError) && joinError.code !== 'version-mismatch'
    onJoinFailed(netErrorText(joinError), forget)
  }, [joinError, onJoinFailed])

  const stepOut = () => {
    leaveRoom(false)
    onHome()
  }
  const leaveForGood = () => {
    const wasInGame = inGame
    leaveRoom(true)
    if (wasInGame) onHome()
  }
  const onNoticeAction = (action: NonNullable<ConnectionNotice['action']>) => {
    if (action === 'retry') room.session.retry()
    else leaveForGood()
  }

  const exitSheet = exitOpen && (
    <div className="online-exit">
      <Sheet title="방에서 나갈까요?" onClose={() => setExitOpen(false)}>
        <div className="menu">
          {host && inGame && (
            <button
              type="button"
              className="btn btn-block"
              onClick={() => {
                setExitOpen(false)
                room.returnToLobby()
              }}
            >
              <PeopleIcon /> 모두 대기실로 돌아가기
              {snap.state?.phase !== 'gameOver' && <small> (지금 판은 사라져요)</small>}
            </button>
          )}
          <button type="button" className="btn btn-block" onClick={stepOut}>
            <BackIcon /> 잠깐 나가기 <small>(방은 그대로 있어요)</small>
          </button>
          <button type="button" className="btn btn-block btn-ghost" onClick={leaveForGood}>
            {host ? '방 닫기' : '방에서 아주 나가기'}
          </button>
          <p className="sheet-note">
            {host
              ? '잠깐 나가도 방과 게임은 이 폰에 저장돼요. 다만 내가 돌아올 때까지 상대는 기다려야 해요. 방을 닫으면 모두 나가게 돼요.'
              : inGame
                ? '잠깐 나가면 같은 자리로 돌아올 수 있어요. 아주 나가면 이 게임에는 다시 들어올 수 없어요.'
                : '잠깐 나가면 같은 자리로 돌아올 수 있어요.'}
          </p>
        </div>
      </Sheet>
    </div>
  )

  if (inGame) {
    return (
      <div className={`online-game${notice ? ' has-banner' : ''}`}>
        {notice && (
          <div className={`online-banner is-${notice.tone}`} role="status">
            <i aria-hidden="true" />
            <span>{notice.text}</span>
            {notice.action && (
              <button type="button" className="btn btn-small" onClick={() => onNoticeAction(notice.action!)}>
                {notice.action === 'retry' ? '다시 시도' : '나가기'}
              </button>
            )}
          </div>
        )}
        <div className="online-table">
          <GameScreen controller={room} onExit={() => setExitOpen(true)} />
        </div>
        {exitSheet}
      </div>
    )
  }

  const seats = lobbySeats(snap)
  const openSeats = seats.some((seat) => seat.kind === 'remote' && !seat.claimed)
  const others = seats.some((seat, i) => seat.kind === 'remote' && seat.claimed && i !== snap.mySeat)
  const lobbyError =
    notice?.tone === 'error'
      ? notice.text
      : snap.lastError && !isConnectionError(snap.lastError)
        ? netErrorText(snap.lastError)
        : !host && snap.lobby === null && snap.status === 'reconnecting'
          ? '방 주인이 방을 열어 두어야 들어갈 수 있어요. 계속 찾아볼게요.'
          : null

  const addSeat = (kind: 'remote' | 'ai') => {
    const session = room.session as HostSession
    if (kind === 'remote') {
      session.setSeat(seats.length, { kind: 'remote' })
      return
    }
    const taken = new Set(seats.map((seat) => seat.name))
    const name = AI_NAMES.find((n) => !taken.has(n)) ?? `AI ${seats.length + 1}`
    session.setSeat(seats.length, { kind: 'ai', name, difficulty: loadPrefs().difficulty })
  }

  return (
    <>
      <OnlineLobby
        role={room.role}
        roomCode={snap.roomCode}
        status={snap.status}
        seats={seats}
        error={lobbyError}
        canStart={host && seats.length >= 2 && !openSeats}
        startHint={openSeats ? '친구가 들어오면 시작할 수 있어요' : undefined}
        onStart={host ? () => void room.startGame() : undefined}
        onAddSeat={host ? addSeat : undefined}
        onRemoveSeat={host ? (index) => void (room.session as HostSession).setSeat(index, null) : undefined}
        onRetry={isFatalError(snap.lastError) ? undefined : () => room.session.retry()}
        onLeave={() => {
          // Alone in the room there is nothing to lose: just leave.
          if (host ? others : snap.lobby !== null) setExitOpen(true)
          else leaveForGood()
        }}
      />
      {exitSheet}
    </>
  )
}
