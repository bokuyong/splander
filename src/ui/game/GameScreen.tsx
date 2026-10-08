// The game table. Talks only to a GameController: local, AI and online games
// all look the same from here.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { TIERS } from '../../shared/contract'
import type { Action, Card, Color, Noble, Tier, TokenColor } from '../../shared/contract'
import { THEME } from '../../data'
import { engine, WINNING_SCORE } from '../../engine'
import { Sheet } from '../components/Sheet'
import type { ControllerSnapshot, GameController } from '../controller'
import { HowToPlayContent } from '../home/HowToPlay'
import { addToSelection, removeFromSelection, selectionHint, selectionToAction } from '../logic/selection'
import { Chip } from '../components/Chip'
import { BellIcon, BookIcon, CloseIcon, CrownIcon, GemIcon, HomeIcon, MenuIcon, ScrollIcon } from '../components/Icons'
import { CardSheet, DeckSheet } from './CardSheet'
import type { CardPlace } from './CardSheet'
import { DiscardModal, GuestChoiceModal, GuestSheet, LogSheet, PlayerSheet } from './Modals'
import { GameOverScreen, GuestArrival, HandoffScreen } from './Overlays'
import { MyArea, OpponentPanel } from './PlayerPanels'
import { Bank, Board, GuestsRow } from './Table'
import { useGameFeed } from './useGameFeed'
import type { GameFeed } from './useGameFeed'
import '../styles/game.css'

interface GameScreenProps {
  controller: GameController
  /** Leave the table (the local game stays saved). */
  onExit: () => void
}

export function GameScreen({ controller, onExit }: GameScreenProps) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const layer = useRef<HTMLDivElement>(null)
  const feed = useGameFeed(snap.state, layer)
  return (
    <>
      {/* keyed by epoch: a rematch starts with fresh local UI state */}
      <GameTable key={feed.epoch} controller={controller} snap={snap} feed={feed} onExit={onExit} />
      <div className="flight-layer" ref={layer} aria-hidden="true" />
    </>
  )
}

type Open =
  | { kind: 'card'; card: Card; place: CardPlace }
  | { kind: 'deck'; tier: Tier }
  | { kind: 'player'; seat: number }
  | { kind: 'guest'; guest: Noble }
  | { kind: 'menu' }
  | { kind: 'log' }
  | { kind: 'howto' }
  | null

const HANDOFF_DELAY_MS = 1100
const RESULT_DELAY_MS = 1500

interface GameTableProps extends GameScreenProps {
  snap: ControllerSnapshot
  feed: GameFeed
}

function GameTable({ controller, snap, feed, onExit }: GameTableProps) {
  const { state, mySeats, thinkingSeat } = snap
  const current = state.currentPlayer
  const over = state.phase === 'gameOver'
  const hotseat = mySeats.length > 1

  // --- whose eyes are on the screen ------------------------------------------
  const [ackSeat, setAckSeat] = useState<number | null>(hotseat ? null : (mySeats[0] ?? 0))
  const [dueTurn, setDueTurn] = useState<number | null>(null)
  const wantsHandoff = hotseat && !over && mySeats.includes(current) && ackSeat !== current
  const guestJustCame = feed.fresh && !!feed.last?.guest
  useEffect(() => {
    if (!wantsHandoff) return
    // let the last move's animation play before covering the table
    const turn = state.turn
    const timer = setTimeout(() => setDueTurn(turn), guestJustCame ? HANDOFF_DELAY_MS * 2 : HANDOFF_DELAY_MS)
    return () => clearTimeout(timer)
  }, [wantsHandoff, state.turn, guestJustCame])
  const showHandoff = wantsHandoff && (ackSeat === null || dueTurn === state.turn)
  const viewer = hotseat ? (ackSeat ?? mySeats[0]) : (mySeats[0] ?? 0)
  const me = state.players[viewer] ?? state.players[0]
  const myTurn = !over && mySeats.includes(current) && viewer === current && !wantsHandoff
  const canAct = myTurn && state.phase === 'action'

  // --- local UI state --------------------------------------------------------
  const [open, setOpen] = useState<Open>(null)
  const [selection, setSelectionState] = useState<Color[]>([])
  // mirrored in a ref so two taps landing in the same frame both count
  const selectionRef = useRef<Color[]>([])
  const setSelection = useCallback((next: Color[]) => {
    selectionRef.current = next
    setSelectionState(next)
  }, [])
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [peek, setPeek] = useState(false)
  // the result waits a moment so the winning move can be seen
  const [resultDue, setResultDue] = useState(over)
  useEffect(() => {
    if (!over) return
    const timer = setTimeout(() => setResultDue(true), RESULT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [over])
  const toastId = useRef(0)

  const say = useCallback((text: string) => {
    toastId.current += 1
    setToast({ id: toastId.current, text })
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    if (!snap.error) return
    say(snap.error)
    controller.clearError?.()
  }, [snap.error, controller, say])
  // any change of the game invalidates a half-built selection
  useEffect(() => {
    setSelection([])
  }, [state, setSelection])
  useEffect(() => () => controller.clearError?.(), [controller])

  const blocked: string | null = over
    ? '게임이 끝났어요'
    : !myTurn
      ? mySeats.includes(current)
        ? '폰을 넘겨받은 뒤에 할 수 있어요'
        : `지금은 ${state.players[current].name} 차례예요`
      : state.phase !== 'action'
        ? `먼저 ${THEME.phases[state.phase]}를 끝내 주세요`
        : null

  const legal = useMemo(() => (canAct ? engine.getLegalActions(state) : []), [canAct, state])
  const affordableIds = useMemo(() => {
    const ids = new Set<string>()
    for (const a of legal) if (a.type === 'buy') ids.add(a.cardId)
    return ids
  }, [legal])
  const mustPass = canAct && legal.length === 1 && legal[0].type === 'pass'

  const send = useCallback(
    (action: Action) => {
      setOpen(null)
      setSelection([])
      controller.sendAction(action)
    },
    [controller, setSelection],
  )

  const tapBank = (color: TokenColor) => {
    if (blocked) return say(blocked)
    const result = addToSelection(state.bank, selectionRef.current, color)
    if (result.ok) setSelection(result.selection)
    else say(result.reason)
  }
  const trayAction = selectionToAction(state.bank, selection)
  const trayOk = trayAction !== null && canAct && engine.isLegal(state, trayAction)

  const openCard = (card: Card, place: CardPlace) => setOpen({ kind: 'card', card, place })

  // --- derived display data --------------------------------------------------
  const opponents = state.players
    .map((_, i) => (viewer + 1 + i) % state.players.length)
    .filter((seat) => seat !== viewer)
  const freshSlots = useMemo(() => {
    const set = new Set<string>()
    if (feed.fresh && feed.last) for (const s of feed.last.changedSlots) set.add(`${s.tier}-${s.slot}`)
    return set
  }, [feed.fresh, feed.last])
  const hitSeat = feed.fresh && feed.last ? feed.last.actor : null
  const lastEntry = feed.log[feed.log.length - 1] ?? null
  const arrival = feed.fresh && feed.last?.guest ? feed.last : null
  const deckTotal = TIERS.reduce((n, t) => n + state.decks[t].length, 0)

  const turnLabel = over
    ? THEME.phases.gameOver
    : myTurn
      ? hotseat
        ? `${me.name} ${THEME.labels.turn}`
        : THEME.labels.yourTurn
      : `${state.players[current].name} ${THEME.labels.turn}`

  const openCardNow = open?.kind === 'card' ? open : null

  return (
    <div className={`game p${state.players.length}${myTurn ? ' my-turn' : ''}`}>
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={() => setOpen({ kind: 'menu' })} aria-label="메뉴">
          <MenuIcon />
        </button>
        <div className={`turn-pill${myTurn ? ' is-me' : ''}`} key={`${current}-${myTurn}`} aria-live="polite">
          <span className="turn-dot" aria-hidden="true" />
          <span className="turn-text">{turnLabel}</span>
          {!over && thinkingSeat === current && (
            <span className="dots" aria-label="생각 중">
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
        <div className={`goal${state.finalRound && !over ? ' is-final' : ''}`}>
          {state.finalRound && !over ? (
            <>
              <BellIcon /> {THEME.labels.finalRound}
            </>
          ) : (
            <>
              <CrownIcon /> {engine.getScore(me)}/{WINNING_SCORE}
            </>
          )}
        </div>
      </header>

      <div className={`opps n${opponents.length}`}>
        {opponents.map((seat) => (
          <OpponentPanel
            key={seat}
            seat={seat}
            player={state.players[seat]}
            active={!over && current === seat}
            thinking={!over && thinkingSeat === seat}
            highlight={hitSeat === seat}
            winner={over && (state.winners?.includes(seat) ?? false)}
            onOpen={() => setOpen({ kind: 'player', seat })}
          />
        ))}
      </div>

      <GuestsRow
        guests={state.nobles}
        have={engine.getBonuses(me)}
        onOpen={(guest) => setOpen({ kind: 'guest', guest })}
      />

      <Board
        state={state}
        affordableIds={affordableIds}
        freshSlots={freshSlots}
        onOpenCard={(card) => openCard(card, 'board')}
        onOpenDeck={(tier) => setOpen({ kind: 'deck', tier })}
      />

      <div className="actionbar">
        {selection.length > 0 ? (
          <div className="tray">
            <button type="button" className="icon-btn tray-cancel" onClick={() => setSelection([])} aria-label={THEME.labels.cancel}>
              <CloseIcon />
            </button>
            <div className="tray-chips">
              {selection.map((color, i) => (
                <button
                  type="button"
                  key={`${color}-${i}`}
                  className="tray-chip"
                  onClick={() => setSelection(removeFromSelection(selectionRef.current, i))}
                  aria-label={`${THEME.tokens[color].name} 빼기`}
                >
                  <Chip color={color} size={32} />
                </button>
              ))}
              <span className="tray-hint">{toast?.text ?? selectionHint(state.bank, selection)}</span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={!trayOk}
              onClick={() => trayAction && send(trayAction)}
            >
              가져오기
            </button>
          </div>
        ) : toast ? (
          <p className="logline is-toast" key={toast.id} role="status">
            {toast.text}
          </p>
        ) : over && peek ? (
          <button type="button" className="btn btn-primary btn-small" onClick={() => setPeek(false)}>
            <CrownIcon /> 결과 보기
          </button>
        ) : mustPass ? (
          <button type="button" className="btn btn-primary btn-small" onClick={() => send({ type: 'pass' })}>
            {THEME.actions.pass} <small>(할 수 있는 일이 없어요)</small>
          </button>
        ) : (
          <button
            type="button"
            className={`logline${feed.fresh ? ' is-fresh' : ''}`}
            key={lastEntry?.id ?? 'none'}
            onClick={() => setOpen({ kind: 'log' })}
          >
            {lastEntry
              ? lastEntry.text
              : myTurn
                ? '카드를 누르거나, 보석을 골라 보세요'
                : `${state.players[current].name}의 차례를 기다려요`}
            {lastEntry && canAct && <span className="logline-cue"> · 내 차례예요</span>}
          </button>
        )}
      </div>

      <Bank bank={state.bank} selection={selection} enabled={canAct} onTap={tapBank} />

      <MyArea
        player={me}
        seat={viewer}
        active={myTurn}
        highlight={hitSeat === viewer}
        affordableIds={affordableIds}
        onOpenReserved={(r) => openCard(r.card, 'myReserve')}
        onOpenSelf={() => setOpen({ kind: 'player', seat: viewer })}
      />

      {/* --- sheets --- */}
      {openCardNow && (
        <CardSheet
          card={openCardNow.card}
          place={openCardNow.place}
          state={state}
          viewer={viewer}
          blocked={blocked}
          onAction={send}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === 'deck' && (
        <DeckSheet tier={open.tier} state={state} viewer={viewer} blocked={blocked} onAction={send} onClose={() => setOpen(null)} />
      )}
      {open?.kind === 'player' && (
        <PlayerSheet state={state} seat={open.seat} viewer={viewer} onClose={() => setOpen(null)} />
      )}
      {open?.kind === 'guest' && (
        <GuestSheet guest={open.guest} have={engine.getBonuses(me)} onClose={() => setOpen(null)} />
      )}
      {open?.kind === 'log' && <LogSheet log={feed.log} viewer={viewer} onClose={() => setOpen(null)} />}
      {open?.kind === 'howto' && (
        <Sheet title="놀이 방법" onClose={() => setOpen(null)}>
          <HowToPlayContent />
        </Sheet>
      )}
      {open?.kind === 'menu' && (
        <Sheet
          title={
            <>
              <GemIcon /> {THEME.title}
            </>
          }
          onClose={() => setOpen(null)}
        >
          <div className="menu">
            <button type="button" className="btn btn-block" onClick={() => setOpen({ kind: 'howto' })}>
              <BookIcon /> 놀이 방법
            </button>
            <button type="button" className="btn btn-block" onClick={() => setOpen({ kind: 'log' })}>
              <ScrollIcon /> 지난 차례 보기
            </button>
            <button type="button" className="btn btn-block" onClick={onExit}>
              <HomeIcon /> 처음 화면으로
            </button>
            <p className="sheet-note">
              남은 카드 {deckTotal}장 · {state.turn + 1}번째 차례. 게임은 저절로 저장돼서 나중에 이어할 수 있어요.
            </p>
          </div>
        </Sheet>
      )}

      {/* --- forced decisions --- */}
      {myTurn && state.phase === 'discard' && <DiscardModal key={state.turn} state={state} onAction={send} />}
      {myTurn && state.phase === 'chooseNoble' && <GuestChoiceModal state={state} onAction={send} />}

      {arrival?.guest && <GuestArrival key={arrival.key} guest={arrival.guest} name={state.players[arrival.actor].name} />}

      {showHandoff && (
        <HandoffScreen
          player={state.players[current]}
          first={ackSeat === null}
          lastText={lastEntry?.text ?? null}
          onReady={() => {
            setOpen(null)
            setAckSeat(current)
          }}
        />
      )}

      {over && resultDue && !peek && (
        <GameOverScreen
          state={state}
          mySeats={mySeats}
          onRematch={controller.rematch ? () => controller.rematch?.() : undefined}
          onPeek={() => setPeek(true)}
          onHome={onExit}
        />
      )}
    </div>
  )
}
