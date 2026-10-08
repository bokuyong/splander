// A noble's portrait: a silhouette bust with a distinctive headpiece inside an
// oval gold frame, over tinted velvet. Replaced by public/art/nobles/<id>.webp
// when that file exists (the frame stays).
import type { Noble } from '../../shared/contract'
import { guestCrest } from '../logic/guests'
import type { CrestKind } from '../logic/guests'
import { ArtImage } from './Art'

const INK = '#0d0a16'
const GOLD = 'url(#gold-metal)'

function Headpiece({ kind }: { kind: CrestKind }) {
  switch (kind) {
    case 'duchess': // tall coiffure with a small tiara
      return (
        <>
          <ellipse cx="24" cy="18" rx="9" ry="8" fill={INK} />
          <path d="M17 14 L19.5 9 L22 13 L24 7.5 L26 13 L28.5 9 L31 14Z" fill={GOLD} />
          <circle cx="24" cy="8" r="1.1" fill="#fff" />
        </>
      )
    case 'guildmaster': // flat merchant's cap and a chain of office
      return (
        <>
          <path d="M13 21 Q24 9 35 21 Z" fill={INK} />
          <path d="M12 21 H36" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M16 47 Q24 56 32 47" fill="none" stroke={GOLD} strokeWidth="1.6" />
          <circle cx="24" cy="52" r="2" fill={GOLD} />
        </>
      )
    case 'cardinal': // square biretta with a pom, wide cape
      return (
        <>
          <path d="M15 20 L17 11 H31 L33 20Z" fill={INK} />
          <path d="M24 11 V8" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="24" cy="7.2" r="1.6" fill="#b32738" />
          <path d="M8 60 C8 48 16 44 24 44 C32 44 40 48 40 60Z" fill="#7a1522" opacity="0.55" />
        </>
      )
    case 'count': // brimmed hat with a plume
      return (
        <>
          <rect x="16" y="12" width="16" height="9" rx="2" fill={INK} />
          <ellipse cx="24" cy="21" rx="14" ry="2.6" fill={INK} />
          <path d="M31 13 C35 6 41 5 43 9 C39 9 36 11 33 15Z" fill="#e8e3f0" opacity="0.9" />
          <path d="M18 15 H30" stroke={GOLD} strokeWidth="1.4" />
        </>
      )
    case 'admiral': // bicorne
      return (
        <>
          <path d="M7 21 Q24 6 41 21 Q24 15 7 21Z" fill={INK} />
          <path d="M22 13 L24 9 L26 13Z" fill={GOLD} />
          <path d="M14 50 L24 46 L34 50" fill="none" stroke={GOLD} strokeWidth="1.3" />
        </>
      )
    case 'jeweller': // turban with a jewel
      return (
        <>
          <ellipse cx="24" cy="17" rx="10.5" ry="8" fill={INK} />
          <path d="M14 18 Q24 24 34 18" fill="none" stroke="#2a2340" strokeWidth="1.2" />
          <polygon points="24,9 27.5,12.5 24,16 20.5,12.5" fill="#e8edf6" />
          <polygon points="24,9 27.5,12.5 20.5,12.5" fill="#fff" />
        </>
      )
    case 'painter': // tilted beret, brush
      return (
        <>
          <ellipse cx="22" cy="16" rx="12" ry="6" transform="rotate(-14 22 16)" fill={INK} />
          <circle cx="29" cy="10.5" r="1.4" fill={INK} />
          <path d="M34 60 L39 38" stroke="#b08a4a" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M38.2 38 L40.5 33" stroke="#1F9A66" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )
    case 'marchioness': // wide hair under a veil, diadem
      return (
        <>
          <path d="M11 44 C9 30 14 14 24 14 C34 14 39 30 37 44 C33 36 15 36 11 44Z" fill={INK} />
          <path d="M18 16 Q24 11 30 16" fill="none" stroke={GOLD} strokeWidth="1.5" />
          <circle cx="24" cy="12.6" r="1.3" fill="#fff" />
        </>
      )
    case 'governor': // crested helmet
      return (
        <>
          <path d="M13 24 Q13 10 24 10 Q35 10 35 24 Z" fill={INK} />
          <path d="M24 10 Q24 2 31 3 Q30 7 25 10Z" fill="#8b1e2b" />
          <path d="M14 23 H34" stroke={GOLD} strokeWidth="1.4" />
        </>
      )
    case 'archduke': // crown
      return (
        <>
          <path d="M14 20 L16 9 L20.5 14 L24 7 L27.5 14 L32 9 L34 20Z" fill={GOLD} />
          <path d="M15 20 H33" stroke="#6a4a10" strokeWidth="1" />
          <circle cx="24" cy="7" r="1.4" fill="#c9304b" />
          <circle cx="16" cy="9" r="1.1" fill="#3463c4" />
          <circle cx="32" cy="9" r="1.1" fill="#1f9a66" />
        </>
      )
  }
}

export function NobleCrest({ noble, className }: { noble: Noble; className?: string }) {
  const crest = guestCrest(noble)
  return (
    <span className={`portrait${className ? ` ${className}` : ''}`}>
      <svg viewBox="0 0 48 60" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={`clip-${noble.id}`}>
            <ellipse cx="24" cy="30" rx="21" ry="27" />
          </clipPath>
        </defs>
        <g clipPath={`url(#clip-${noble.id})`}>
          <rect width="48" height="60" fill="url(#tk-well)" />
          <rect width="48" height="60" fill={crest.tint} opacity="0.55" />
          <ellipse cx="24" cy="22" rx="20" ry="18" fill="#fff" opacity="0.1" />
          {/* shoulders, neck, head */}
          <path d="M4 60 C6 46 14 42 24 42 C34 42 42 46 44 60Z" fill={INK} />
          <rect x="20" y="33" width="8" height="10" fill={INK} />
          <circle cx="24" cy="27" r="9.5" fill={INK} />
          <Headpiece kind={crest.kind} />
          {/* rim light on the right */}
          <path d="M32 24 Q34 30 30 36" fill="none" stroke="#f3dc9a" strokeWidth="0.8" opacity="0.45" />
        </g>
      </svg>
      <ArtImage path={`nobles/${noble.id}.webp`} />
      <svg className="portrait-frame" viewBox="0 0 48 60" aria-hidden="true" focusable="false">
        <ellipse cx="24" cy="30" rx="21.5" ry="27.5" fill="none" stroke="#3b2a08" strokeWidth="3.2" />
        <ellipse cx="24" cy="30" rx="21.5" ry="27.5" fill="none" stroke="url(#gold-metal)" strokeWidth="2.2" />
        <ellipse cx="24" cy="30" rx="19.6" ry="25.6" fill="none" stroke="#f6e3a8" strokeWidth="0.5" opacity="0.55" />
      </svg>
    </span>
  )
}
