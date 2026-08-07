export function AcademyLogo({ size = 88 }: { size?: number }) {
  return (
    <img
      src="/logo-main.webp"
      alt="آکادمی شیوافر"
      width={size}
      height={size}
      style={{ objectFit: "contain", display: "block" }}
      draggable={false}
    />
  );
}

/** Compact mark for tight spaces (header bar etc.) */
export function AcademyMark({ size = 28 }: { size?: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`m-gv-${s}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#fde68a" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id={`m-gh-${s}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect x="8"  y="38" width="14" height="24" rx="3" fill={`url(#m-gv-${s})`} opacity="0.85" />
      <rect x="26" y="24" width="14" height="38" rx="3" fill={`url(#m-gv-${s})`} />
      <rect x="44" y="32" width="14" height="30" rx="3" fill={`url(#m-gv-${s})`} opacity="0.90" />
      <path d="M4 65 Q33 76 76 65" stroke={`url(#m-gh-${s})`} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M18 15 L33 7 L48 15 L33 23 Z" fill={`url(#m-gv-${s})`} />
      <line x1="33" y1="23" x2="33" y2="31" stroke={`url(#m-gh-${s})`} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
