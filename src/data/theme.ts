// Display texts and colors for the UI. Plain data only: no logic lives here.
// Theme: Renaissance gem merchants. Tokens are gems, cards are 개발 카드,
// nobles are 귀족, points are 명성.
import type { Action, Difficulty, Phase, Tier, TokenColor } from '../shared/contract'

export interface TokenTheme {
  name: string // gem name, e.g. 다이아몬드
  short: string // one-syllable label for tight spaces
  emoji: string
  color: string // main hex color (chip rims, card headers)
  soft: string // pale background tint
  ink: string // readable text color on top of `color`
}

export interface TierTheme {
  name: string
  label: string // e.g. "1단계 광산"
  emoji: string
  color: string
}

export interface Theme {
  title: string
  titleEn: string
  tagline: string
  tokens: Record<TokenColor, TokenTheme>
  tiers: Record<Tier, TierTheme>
  labels: {
    points: string
    pointsShort: string
    bonus: string
    token: string
    tokens: string
    gold: string
    card: string
    guest: string
    guests: string
    reserved: string
    deck: string
    bank: string
    turn: string
    yourTurn: string
    finalRound: string
    winner: string
    draw: string
    confirm: string
    cancel: string
  }
  actions: Record<Action['type'], string>
  actionHints: Record<Action['type'], string>
  phases: Record<Phase, string>
  difficulty: Record<Difficulty, string>
  ui: {
    background: string
    surface: string
    surfaceAlt: string
    text: string
    textMuted: string
    accent: string
    /** Bright gold highlight (titles, score coins). Key kept for compatibility. */
    moon: string
  }
}

export const THEME: Theme = {
  title: '스플랜더',
  titleEn: 'Splander',
  tagline: '보석을 모아, 둘이서 쌓는 명성',
  tokens: {
    white: { name: '다이아몬드', short: '다', emoji: '💎', color: '#E9EDF3', soft: '#F6F8FB', ink: '#2B2F3A' },
    blue: { name: '사파이어', short: '사', emoji: '🔷', color: '#2E62D9', soft: '#D8E2F7', ink: '#FFFFFF' },
    green: { name: '에메랄드', short: '에', emoji: '🟢', color: '#1C9E68', soft: '#D3F0E2', ink: '#FFFFFF' },
    red: { name: '루비', short: '루', emoji: '🔴', color: '#CF2F4F', soft: '#F8DADF', ink: '#FFFFFF' },
    black: { name: '오닉스', short: '오', emoji: '⚫', color: '#2F3040', soft: '#DBDAE3', ink: '#FFFFFF' },
    gold: { name: '황금', short: '금', emoji: '🪙', color: '#E2B54C', soft: '#F9EBC5', ink: '#3B2A00' },
  },
  tiers: {
    1: { name: '광산', label: '1단계 광산', emoji: '⛏️', color: '#A5753F' },
    2: { name: '공방', label: '2단계 공방', emoji: '⚒️', color: '#9AA3B6' },
    3: { name: '상점', label: '3단계 상점', emoji: '🏛️', color: '#7E5CB2' },
  },
  labels: {
    points: '명성 점수',
    pointsShort: '명성',
    bonus: '보석 할인',
    token: '보석',
    tokens: '보석',
    gold: '황금',
    card: '개발 카드',
    guest: '귀족',
    guests: '귀족',
    reserved: '예약한 카드',
    deck: '카드 더미',
    bank: '보석함',
    turn: '차례',
    yourTurn: '내 차례',
    finalRound: '마지막 바퀴',
    winner: '우승',
    draw: '무승부',
    confirm: '확인',
    cancel: '취소',
  },
  actions: {
    takeDifferent: '보석 3개 가져오기',
    takeSame: '보석 2개 가져오기',
    reserveBoard: '카드 예약하기',
    reserveDeck: '더미에서 예약하기',
    buy: '카드 구매하기',
    pass: '쉬어가기',
    discard: '보석 내려놓기',
    chooseNoble: '귀족 맞이하기',
  },
  actionHints: {
    takeDifferent: '서로 다른 색 보석을 3개 가져와요 (남은 색이 모자라면 있는 만큼)',
    takeSame: '같은 색 보석 2개 (보석함에 4개 이상 있을 때)',
    reserveBoard: '카드를 예약하고 황금 1개를 받아요 (최대 3장)',
    reserveDeck: '더미 맨 위 카드를 몰래 예약하고 황금 1개를 받아요',
    buy: '보석을 내고 카드를 가져와요',
    pass: '할 수 있는 일이 없을 때만 쉬어가요',
    discard: '보석은 10개까지만 들 수 있어요',
    chooseNoble: '방문한 귀족 중 한 명을 골라요',
  },
  phases: {
    action: '행동 고르기',
    discard: '보석 내려놓기',
    chooseNoble: '귀족 고르기',
    gameOver: '게임 끝',
  },
  difficulty: {
    easy: '쉬움',
    normal: '보통',
    hard: '어려움',
  },
  ui: {
    background: '#120F20',
    surface: '#1C2036',
    surfaceAlt: '#272C48',
    text: '#F4EBD6',
    textMuted: '#B4AB99',
    accent: '#D9B45C',
    moon: '#F3DC9A',
  },
}
