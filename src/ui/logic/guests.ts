// Portraits for the nobles. The data module owns names and requirements;
// which silhouette and tint a tile shows is a UI concern keyed by the stable
// noble id (see src/ui/components/NobleCrest.tsx for the drawings).
import type { Card, Noble } from '../../shared/contract'

export type CrestKind =
  | 'duchess'
  | 'guildmaster'
  | 'cardinal'
  | 'count'
  | 'admiral'
  | 'jeweller'
  | 'painter'
  | 'marchioness'
  | 'governor'
  | 'archduke'

export interface Crest {
  kind: CrestKind
  /** Velvet tint behind the bust. */
  tint: string
}

const CRESTS: Record<string, Crest> = {
  'n-01': { kind: 'duchess', tint: '#7a3b6e' }, // 공작 부인
  'n-02': { kind: 'guildmaster', tint: '#8a5a1c' }, // 대상인 길드장
  'n-03': { kind: 'cardinal', tint: '#9c2a35' }, // 추기경
  'n-04': { kind: 'count', tint: '#2f5e9c' }, // 백작
  'n-05': { kind: 'admiral', tint: '#1f6a73' }, // 항해왕
  'n-06': { kind: 'jeweller', tint: '#5d4a9c' }, // 왕실 보석상
  'n-07': { kind: 'painter', tint: '#2f7a55' }, // 궁정 화가
  'n-08': { kind: 'marchioness', tint: '#9c4a7a' }, // 후작 부인
  'n-09': { kind: 'governor', tint: '#4f5a6e' }, // 총독
  'n-10': { kind: 'archduke', tint: '#9a7a1e' }, // 대공
}

const FALLBACK: Crest = { kind: 'count', tint: '#4a3f6a' }

export function guestCrest(noble: Noble): Crest {
  return CRESTS[noble.id] ?? FALLBACK
}

/** Placeholder cards sent by the online host for information this device may not see. */
export function isHiddenCard(card: Card): boolean {
  return card.id.startsWith('hidden')
}
