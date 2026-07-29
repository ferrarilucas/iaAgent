type MarkProps = { className?: string };

export function PilinhaMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 64 96" className={className} role="img" aria-label="pilinha">
      <defs>
        <clipPath id="pill-clip">
          <rect x="8" y="6" width="48" height="84" rx="24" />
        </clipPath>
      </defs>
      <g clipPath="url(#pill-clip)">
        <rect x="8" y="6" width="24" height="84" fill="#163a5b" />
        <rect x="32" y="6" width="24" height="84" fill="#c6a15b" />
        <path d="M8 48 L56 6 V90 H8 Z" fill="#c6a15b" opacity="0" />
      </g>
      <path
        d="M16 68 L28 54 L37 62 L51 36"
        fill="none"
        stroke="#f5f1e8"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M43 35 L54 32 L52 43 Z" fill="#f5f1e8" />
    </svg>
  );
}

type LogoProps = { className?: string; tagline?: boolean; light?: boolean };

export function PilinhaLogo({ className, tagline = false, light = false }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <PilinhaMark className="h-9 w-auto" />
      <div className="flex flex-col leading-none">
        <span
          className={`text-xl font-extrabold tracking-tight ${light ? "text-white" : "text-navy-700"}`}
        >
          pilinha
        </span>
        {tagline ? (
          <span className={`mt-1 text-[11px] font-medium ${light ? "text-cream-200" : "text-ink-soft"}`}>
            Gestão Financeira Inteligente
          </span>
        ) : null}
      </div>
    </div>
  );
}
