// A jewelled gold crown: the game's emblem on the home and hand-off screens.
// Pure SVG, colored by CSS custom properties (--accent, --gold-light, --tok-*).
export function Crown({ className }: { className?: string }) {
  return (
    <svg
      className={`crown${className ? ` ${className}` : ''}`}
      viewBox="0 0 96 80"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="crown-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--gold-light)" />
          <stop offset="0.55" stopColor="var(--accent)" />
          <stop offset="1" stopColor="#9a7430" />
        </linearGradient>
      </defs>
      {/* body */}
      <path
        className="crown-body"
        d="M10 30 L26 46 L40 18 L48 40 L56 18 L70 46 L86 30 L80 66 L16 66 Z"
        fill="url(#crown-gold)"
        stroke="#6a4c14"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* band */}
      <rect x="14" y="58" width="68" height="12" rx="3" fill="url(#crown-gold)" stroke="#6a4c14" strokeWidth="2" />
      <path d="M18 61h60" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      {/* point gems */}
      <circle cx="10" cy="28" r="4.2" fill="var(--tok-blue)" stroke="#6a4c14" strokeWidth="1.2" />
      <circle cx="48" cy="14" r="5" fill="var(--tok-red)" stroke="#6a4c14" strokeWidth="1.2" />
      <circle cx="86" cy="28" r="4.2" fill="var(--tok-green)" stroke="#6a4c14" strokeWidth="1.2" />
      <circle cx="40" cy="16" r="3" fill="var(--tok-white)" stroke="#6a4c14" strokeWidth="1" />
      <circle cx="56" cy="16" r="3" fill="var(--tok-white)" stroke="#6a4c14" strokeWidth="1" />
      {/* band gems */}
      <polygon points="30,59 35,64 30,69 25,64" fill="var(--tok-green)" stroke="#6a4c14" strokeWidth="1" />
      <polygon points="48,58 54,64 48,70 42,64" fill="var(--tok-blue)" stroke="#6a4c14" strokeWidth="1" />
      <polygon points="66,59 71,64 66,69 61,64" fill="var(--tok-red)" stroke="#6a4c14" strokeWidth="1" />
      {/* shine */}
      <path d="M22 50 L36 32" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
