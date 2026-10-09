// Full-screen moments: handing the phone over, a noble visiting, the finish.
import type { CSSProperties } from 'react'
import { COLORS } from '../../shared/contract'
import type { GameState, Noble, PlayerState } from '../../shared/contract'
import { THEME } from '../../data'
import { WINNING_SCORE } from '../../engine'
import { Crown } from '../components/Crown'
import { CrownIcon, GemIcon, RefreshIcon, ScalesIcon } from '../components/Icons'
import { NobleCrest } from '../components/NobleCrest'
import { josa, rankPlayers, tieBreakNote } from '../logic/describe'

export function HandoffScreen({
  player,
  lastText,
  first,
  onReady,
}: {
  player: PlayerState
  lastText: string | null
  first: boolean
  onReady: () => void
}) {
  return (
    <div className="handoff" role="dialog" aria-modal="true">
      <Crown className="crown-small" />
      <p className="handoff-kicker">{first ? '첫 번째 차례' : '다음 차례'}</p>
      <h2 className="handoff-name">{player.name}</h2>
      <p className="handoff-text">
        {josa(player.name, '에게', '에게')} 폰을 건네주세요.
        <br />
        몰래 예약한 카드는 본인만 볼 수 있어요.
      </p>
      {lastText && <p className="handoff-last">방금: {lastText}</p>}
      <button type="button" className="btn btn-primary" onClick={onReady}>
        {player.name}, 준비됐어요
      </button>
    </div>
  )
}

export function GuestArrival({ guest, name }: { guest: Noble; name: string }) {
  return (
    <div className="arrival" aria-live="polite">
      <div className="arrival-card">
        <NobleCrest noble={guest} className="arrival-face" />
        <span className="arrival-name">{guest.name}</span>
        <span className="arrival-text">
          {josa(name, '의', '의')} 상점을 방문했어요 · {THEME.labels.pointsShort} +{guest.points}
        </span>
      </div>
    </div>
  )
}

const GEMS = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: ((i * 53) % 40) / 10,
  duration: 4.5 + ((i * 29) % 30) / 10,
  size: 10 + ((i * 17) % 10),
  color: COLORS[i % COLORS.length],
  drift: ((i * 41) % 60) - 30,
}))

function GemRain() {
  return (
    <div className="gem-rain" aria-hidden="true">
      {GEMS.map((p, i) => (
        <i
          key={i}
          className={`c-${p.color === 'black' ? 'gold' : p.color}`}
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 1.3,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--drift': `${p.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

export function GameOverScreen({
  state,
  mySeats,
  onRematch,
  onPeek,
  onHome,
}: {
  state: GameState
  mySeats: number[]
  onRematch?: () => void
  onPeek: () => void
  onHome: () => void
}) {
  const rows = rankPlayers(state)
  const note = tieBreakNote(state)
  const winners = state.winners ?? []
  const names = winners.map((w) => state.players[w].name).join(' · ')
  const solo = mySeats.length === 1
  const iWon = solo && winners.includes(mySeats[0])
  const headline =
    winners.length > 1
      ? `공동 ${THEME.labels.winner}!`
      : solo
        ? iWon
          ? '내가 이겼어요!'
          : `${josa(names, '이', '가')} 이겼어요`
        : `${names} ${THEME.labels.winner}!`
  return (
    <div className="gameover" role="dialog" aria-modal="true">
      <GemRain />
      <div className="gameover-box">
        <div className="gameover-crown" aria-hidden="true">
          {solo && !iWon ? <GemIcon /> : <CrownIcon />}
        </div>
        <p className="gameover-kicker">{THEME.phases.gameOver}</p>
        <h2 className="gameover-title">{headline}</h2>
        <p className="gameover-sub">
          {solo && !iWon
            ? '명성은 하루아침에 쌓이지 않아요. 한 판 더 어때요?'
            : `${THEME.labels.points} ${WINNING_SCORE}점, 보석 상인의 명성이 완성됐어요`}
        </p>
        <ol className="rank">
          {rows.map((row) => (
            <li key={row.seat} className={row.winner ? 'is-winner' : ''}>
              <span className="rank-no">{row.winner ? <CrownIcon /> : row.rank}</span>
              <span className="rank-name">{row.name}</span>
              <span className="rank-detail">
                카드 {row.cards} · {THEME.labels.guests} {row.guests}
              </span>
              <span className="rank-score">
                {row.score}
                <small>점</small>
              </span>
            </li>
          ))}
        </ol>
        {note && (
          <p className="gameover-note">
            <ScalesIcon /> {note}
          </p>
        )}
        <div className="gameover-actions">
          {onRematch && (
            <button type="button" className="btn btn-primary btn-block" onClick={onRematch}>
              <RefreshIcon /> 한 판 더
            </button>
          )}
          <div className="gameover-row">
            <button type="button" className="btn btn-small btn-ghost" onClick={onPeek}>
              판 둘러보기
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={onHome}>
              처음으로
            </button>
          </div>
        </div>
        <p className="gameover-credit">
          {THEME.title} · by {THEME.author}
        </p>
      </div>
    </div>
  )
}
