// The emote set: a few emoji and short Korean phrases players can flash at
// each other during a game (a speech bubble over their panel). Only the `id`
// ever travels over the network or through a controller; everything else is
// looked up on the receiving side, so an unknown id is simply ignored.

export type EmoteKind = 'emoji' | 'phrase'

export interface Emote {
  /** Stable, lower-case, URL-safe. This is what goes on the wire. */
  id: string
  kind: EmoteKind
  /** What is shown in the bubble: the emoji character or the phrase. */
  text: string
  /** Korean accessible name (emoji) or the phrase itself. */
  label: string
}

const emoji = (id: string, text: string, label: string): Emote => ({ id, kind: 'emoji', text, label })
const phrase = (id: string, text: string): Emote => ({ id, kind: 'phrase', text, label: text })

export const EMOTES: readonly Emote[] = Object.freeze([
  emoji('smile', '😀', '웃음'),
  emoji('laugh', '😂', '폭소'),
  emoji('wow', '😮', '놀람'),
  emoji('cry', '😢', '눈물'),
  emoji('angry', '😡', '화남'),
  emoji('clap', '👏', '박수'),
  emoji('think', '🤔', '고민'),
  emoji('cool', '😎', '여유'),
  phrase('nice', '잘했어요!'),
  phrase('oops', '아이고…'),
  phrase('hurry', '빨리요~'),
  phrase('lucky', '운이 좋네요'),
  phrase('learn', '한 수 배웁니다'),
  phrase('wait', '잠깐만요'),
  phrase('argh', '으악!'),
  phrase('gg', 'GG'),
])

const BY_ID: ReadonlyMap<string, Emote> = new Map(EMOTES.map((e) => [e.id, e]))

export const EMOJI_EMOTES: readonly Emote[] = EMOTES.filter((e) => e.kind === 'emoji')
export const PHRASE_EMOTES: readonly Emote[] = EMOTES.filter((e) => e.kind === 'phrase')

/** The emote for `id`, or undefined for anything not in the set. */
export function findEmote(id: unknown): Emote | undefined {
  return typeof id === 'string' ? BY_ID.get(id) : undefined
}

/** True for ids in the set. Use it to validate anything that arrived from outside. */
export function isEmoteId(id: unknown): id is string {
  return findEmote(id) !== undefined
}

/** An emote shown on screen: who sent it, which one, when (ms since epoch). */
export interface EmoteEvent {
  seat: number
  id: string
  at: number
}

/** How long a bubble stays up before it fades. */
export const EMOTE_HOLD_MS = 2500
