// Home, setup pages and the rules page.
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Difficulty, NewGameConfig } from '../../shared/contract'
import { THEME } from '../../data'
import { ArtImage } from '../components/Art'
import { useArt } from '../logic/art'
import { GemToken } from '../components/GemToken'
import { BackIcon, BookIcon, GemIcon, LinkIcon, PeopleIcon, PlayIcon, RobotIcon } from '../components/Icons'
import type { SavedGame } from '../controller'
import { HowToPlayContent } from './HowToPlay'
import { KeyArt } from './KeyArt'
import { loadPrefs, savePrefs } from './prefs'
import '../styles/home.css'

type Players = NewGameConfig['players']

const AI_NAMES = ['진주', '호박', '산호']
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard']
const DIFFICULTY_NOTE: Record<Difficulty, string> = {
  easy: '느긋하게 보석을 모아요. 처음이라면 여기서부터!',
  normal: '제법 야무지게 장사를 꾸려요.',
  hard: '몇 수 앞을 내다봐요. 방심은 금물!',
}

export function Page({
  title,
  onBack,
  children,
  footer,
}: {
  title: string
  onBack: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="page">
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="뒤로">
          <BackIcon />
        </button>
        <h1>{title}</h1>
      </header>
      <div className="page-body">{children}</div>
      {footer && <footer className="page-foot">{footer}</footer>}
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface HomeProps {
  saved: SavedGame | null
  onResume: () => void
  onSolo: () => void
  onLocal: () => void
  onOnline: () => void
  onHowTo: () => void
}

export function HomeScreen({ saved, onResume, onSolo, onLocal, onOnline, onHowTo }: HomeProps) {
  // real key art (public/art/home/keyart.webp) goes full-bleed behind everything
  const art = useArt('home/keyart.webp')
  return (
    <div className={`home${art === 'ok' ? ' has-art' : ''}`}>
      <div className="home-sky" aria-hidden="true">
        <ArtImage path="home/keyart.webp" className="home-keyart-img" />
        <span className="home-shade" />
      </div>
      <div className="home-art" aria-hidden="true">
        <KeyArt className="home-keyart" />
      </div>
      <div className="home-title">
        <p className="home-en">{THEME.titleEn}</p>
        <h1>{THEME.title}</h1>
        <p className="home-tagline">{THEME.tagline}</p>
        <div className="home-gems" aria-hidden="true">
          <GemToken color="white" />
          <GemToken color="blue" />
          <GemToken color="green" />
          <GemToken color="red" />
          <GemToken color="black" />
          <GemToken color="gold" />
        </div>
      </div>
      <nav className="home-menu">
        {saved && (
          <button type="button" className="btn btn-primary btn-block home-resume" onClick={onResume}>
            <span>
              <PlayIcon /> 이어하기
            </span>
            <small>
              {saved.state.players.map((p) => p.name).join(' · ')} · {saved.state.turn + 1}번째 차례
            </small>
          </button>
        )}
        <button type="button" className={`btn btn-block${saved ? '' : ' btn-primary'}`} onClick={onSolo}>
          <RobotIcon /> 혼자 하기 <small>AI 대전</small>
        </button>
        <button type="button" className="btn btn-block" onClick={onLocal}>
          <PeopleIcon /> 같이 하기 <small>한 기기</small>
        </button>
        <button type="button" className="btn btn-block" onClick={onOnline}>
          <LinkIcon /> 온라인 <small>각자 폰으로</small>
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={onHowTo}>
          <BookIcon /> 놀이 방법
        </button>
      </nav>
    </div>
  )
}

export function SoloSetup({ onBack, onStart }: { onBack: () => void; onStart: (players: Players) => void }) {
  const [prefs] = useState(loadPrefs)
  const [name, setName] = useState(prefs.name)
  const [difficulty, setDifficulty] = useState<Difficulty>(prefs.difficulty)
  const [aiCount, setAiCount] = useState(prefs.aiCount)

  const start = () => {
    const mine = name.trim() || '나'
    savePrefs({ name: name.trim(), difficulty, aiCount })
    onStart([
      { name: mine, kind: 'human' },
      ...AI_NAMES.slice(0, aiCount).map((n) => ({ name: n, kind: 'ai' as const, difficulty })),
    ])
  }

  return (
    <Page
      title="혼자 하기"
      onBack={onBack}
      footer={
        <button type="button" className="btn btn-primary btn-block" onClick={start}>
          <GemIcon /> 장사 시작
        </button>
      }
    >
      <label className="field">
        <span>내 이름</span>
        <input value={name} maxLength={8} placeholder="나" onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <div className="field">
        <span>AI 실력</span>
        <Segmented
          label="AI 실력"
          value={difficulty}
          onChange={setDifficulty}
          options={DIFFICULTIES.map((d) => ({ value: d, label: THEME.difficulty[d] }))}
        />
        <p className="field-note">{DIFFICULTY_NOTE[difficulty]}</p>
      </div>
      <div className="field">
        <span>AI 상인 수</span>
        <Segmented
          label="AI 상인 수"
          value={aiCount}
          onChange={setAiCount}
          options={[1, 2, 3].map((n) => ({ value: n, label: `${n}명` }))}
        />
        <p className="field-note">
          {AI_NAMES.slice(0, aiCount).join(', ')}와 함께 {aiCount + 1}인 게임을 해요.
        </p>
      </div>
    </Page>
  )
}

export function LocalSetup({ onBack, onStart }: { onBack: () => void; onStart: (players: Players) => void }) {
  const [prefs] = useState(loadPrefs)
  const [count, setCount] = useState(Math.min(4, Math.max(2, prefs.localNames.length)))
  const [names, setNames] = useState<string[]>(() => [...prefs.localNames, '', '', '', ''].slice(0, 4))

  const start = () => {
    const used = names.slice(0, count).map((n, i) => n.trim() || `상인 ${i + 1}`)
    savePrefs({ localNames: names.slice(0, count).map((n) => n.trim()) })
    onStart(used.map((n) => ({ name: n, kind: 'human' as const })))
  }

  return (
    <Page
      title="같이 하기"
      onBack={onBack}
      footer={
        <button type="button" className="btn btn-primary btn-block" onClick={start}>
          <GemIcon /> 장사 시작
        </button>
      }
    >
      <p className="page-lead">폰 하나를 번갈아 건네며 놀아요. 차례가 바뀔 때마다 화면을 가려 줘요.</p>
      <div className="field">
        <span>인원</span>
        <Segmented
          label="인원"
          value={count}
          onChange={setCount}
          options={[2, 3, 4].map((n) => ({ value: n, label: `${n}명` }))}
        />
      </div>
      {names.slice(0, count).map((n, i) => (
        <label className="field" key={i}>
          <span>{i + 1}번째 상인</span>
          <input
            value={n}
            maxLength={8}
            placeholder={`상인 ${i + 1}`}
            autoComplete="off"
            onChange={(e) => setNames((list) => list.map((v, j) => (j === i ? e.target.value : v)))}
          />
        </label>
      ))}
      <p className="field-note">위에서부터 순서대로 차례가 돌아요.</p>
    </Page>
  )
}

export function HowToPage({ onBack }: { onBack: () => void }) {
  return (
    <Page title="놀이 방법" onBack={onBack}>
      <HowToPlayContent />
    </Page>
  )
}
