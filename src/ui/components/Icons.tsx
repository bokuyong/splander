// Consistent line icons (24x24, stroked in currentColor) that replace emoji
// as UI iconography. Each is a plain inline SVG; size via CSS (1em default).
import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string; className?: string }

function Icon({ size, className, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const CrownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5Z" fill="currentColor" fillOpacity="0.18" />
    <path d="M5 19h14" />
  </Icon>
)

export const GemIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 3h10l4 6-9 12L3 9Z" fill="currentColor" fillOpacity="0.15" />
    <path d="M3 9h18M9 3l3 6 3-6M12 9l-4 12M12 9l4 12" strokeWidth="1.4" />
  </Icon>
)

export const PickaxeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20 15 9" />
    <path d="M12.5 6.5c3-2.5 6.5-2.5 9 0M17.5 11.5c2.5 2.5 2.5 6 0 9" strokeWidth="2" />
    <path d="M13.5 5.5 18.5 10.5" />
  </Icon>
)

export const AnvilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8h16c1.5 0 2 1 2 2s-.5 2-2 2h-8l1 4h3v3H8v-3h3l1-4H9c-3 0-6-1-6-4Z" fill="currentColor" fillOpacity="0.18" />
  </Icon>
)

export const PalaceIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 21h18M4 10h16M5 10v11M9 10v11M15 10v11M19 10v11M12 3l8 7H4Z" />
    <path d="M12 3v-1" />
  </Icon>
)

export const ScrollIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4h12a2 2 0 0 1 2 2v1H8v10a2 2 0 0 1-2 2 2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    <path d="M8 17v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1h-9M10 10h7M10 13h7" />
  </Icon>
)

export const BookIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 6c-2-1.5-4.5-2-8-2v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V4c-3.5 0-6 .5-8 2Z" fill="currentColor" fillOpacity="0.12" />
    <path d="M12 6v14" />
  </Icon>
)

export const RobotIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="8" width="16" height="12" rx="3" fill="currentColor" fillOpacity="0.12" />
    <path d="M12 8V5M12 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM2 13v3M22 13v3M9 16h6" />
    <circle cx="9" cy="13" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="13" r="1.2" fill="currentColor" stroke="none" />
  </Icon>
)

export const KnightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M7 20h11l-1-3c-.5-1.5-.5-3 0-4.5C18.5 9 17 5 12 3.5L10.5 6 8 7l-2 4 2.5.8L10 10l1 2-3 3.5L7 20Z"
      fill="currentColor"
      fillOpacity="0.15"
    />
    <path d="M6 21h13" />
  </Icon>
)

export const PeopleIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.5 2.5-6 6-6s6 2.5 6 6" />
    <path d="M15.5 4.6a3 3 0 0 1 0 6.1M17 14.2c2.5.6 4 2.8 4 5.8" />
  </Icon>
)

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
  </Icon>
)

export const LinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5" />
  </Icon>
)

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const BackIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
)

export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
)

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Icon>
)

export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v5h-5" />
  </Icon>
)

export const BookmarkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4h12v17l-6-4-6 4Z" fill="currentColor" fillOpacity="0.15" />
  </Icon>
)

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1Z" />
  </Icon>
)

export const TrayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v10M8 9l4 4 4-4" />
    <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M4 15h4l1.5 2h5L16 15h4" />
  </Icon>
)

export const MaskIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8c3-1.5 6-2 9-2s6 .5 9 2c0 7-4 11-9 11S3 15 3 8Z" fill="currentColor" fillOpacity="0.15" />
    <path d="M7 11.5c1-1 2.5-1 3.5 0M13.5 11.5c1-1 2.5-1 3.5 0" />
  </Icon>
)

export const ScalesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v18M7 21h10M4 7h16M6 7l-3 7a3 3 0 0 0 6 0L6 7ZM18 7l-3 7a3 3 0 0 0 6 0l-3-7Z" />
  </Icon>
)

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4Z" fill="currentColor" fillOpacity="0.15" />
    <path d="M10 21h4" />
  </Icon>
)

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="13" r="8" fill="currentColor" fillOpacity="0.12" />
    <path d="M12 9v4l2.5 2M9 3h6" />
  </Icon>
)

export const SparkleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="currentColor" fillOpacity="0.2" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z" fill="currentColor" stroke="none" />
  </Icon>
)

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4l13 8-13 8Z" fill="currentColor" fillOpacity="0.2" />
  </Icon>
)

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" fillOpacity="0.15" />
  </Icon>
)

export const TrophyIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0Z" fill="currentColor" fillOpacity="0.18" />
    <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v3M9 21h6l-1-4h-4Z" />
  </Icon>
)

export const HandIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v5M17 11V8.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.8-2.4L4.6 14.9a1.6 1.6 0 0 1 2.5-2L8 14" />
  </Icon>
)

export const SpeakerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" fill="currentColor" fillOpacity="0.15" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
  </Icon>
)

export const SpeakerOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" fill="currentColor" fillOpacity="0.15" />
    <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
  </Icon>
)

export const EmoteIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity="0.12" />
    <path d="M8.5 14.2c.9 1.3 2.1 1.9 3.5 1.9s2.6-.6 3.5-1.9" />
    <circle cx="9.2" cy="9.8" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.8" cy="9.8" r="1" fill="currentColor" stroke="none" />
  </Icon>
)

export const CardsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="11" height="15" rx="2" fill="currentColor" fillOpacity="0.15" />
    <path d="M14 7l4.5-1.2a2 2 0 0 1 2.4 1.4l2.3 8.7a2 2 0 0 1-1.4 2.4L17 19.5" />
  </Icon>
)
