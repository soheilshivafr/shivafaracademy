import { staticAssetUrl } from "./static-assets";

export interface AvatarMeta {
  id: string;
  name: string;
  gender: "female" | "male";
  free: boolean;
}

export const AVATARS: AvatarMeta[] = [
  { id: "ruby",  name: "روبی",  gender: "female", free: true  },
  { id: "aika",  name: "آیکا",  gender: "female", free: true  },
  { id: "av1",   name: "آوا",   gender: "female", free: false },
  { id: "av3",   name: "مهسا",  gender: "female", free: false },
  { id: "av4",   name: "سارا",  gender: "female", free: false },
  { id: "av5",   name: "لیلا",  gender: "female", free: false },
  { id: "av6",   name: "زهرا",  gender: "female", free: false },
  { id: "av7",   name: "رها",   gender: "female", free: false },
  { id: "av8",   name: "پریسا", gender: "female", free: false },
  { id: "av9",   name: "ندا",   gender: "female", free: false },
  { id: "av10",  name: "آرین",  gender: "female", free: false },
  { id: "av11",  name: "شیدا",  gender: "female", free: false },
  { id: "am1",   name: "آریا",  gender: "male",   free: false },
  { id: "am2",   name: "سینا",  gender: "male",   free: false },
  { id: "am3",   name: "رضا",   gender: "male",   free: false },
  { id: "am4",   name: "علی",   gender: "male",   free: false },
  { id: "am5",   name: "مهران", gender: "male",   free: false },
  { id: "am6",   name: "کیان",  gender: "male",   free: false },
  { id: "am7",   name: "پارسا", gender: "male",   free: false },
  { id: "am8",   name: "نیما",  gender: "male",   free: false },
  { id: "am9",   name: "دانیال",gender: "male",   free: false },
];

// Avatars that have real webp images in public/avatars/
const WEBP_IDS = new Set([
  "av1","av3","av4","av5","av6","av7","av8","av9","av10","av11",
  "am1","am2","am3","am4","am5","am6","am7","am8","am9",
]);

// SVG fallbacks for free avatars
const RUBY_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="50" fill="#f472b6"/>
  <circle cx="50" cy="38" r="18" fill="#fde68a"/>
  <ellipse cx="50" cy="80" rx="22" ry="16" fill="#fde68a"/>
  <circle cx="43" cy="35" r="2.5" fill="#1e1b4b"/>
  <circle cx="57" cy="35" r="2.5" fill="#1e1b4b"/>
  <path d="M44 43 Q50 48 56 43" stroke="#be185d" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <ellipse cx="43" cy="42" rx="4" ry="2" fill="#fca5a5" opacity="0.6"/>
  <ellipse cx="57" cy="42" rx="4" ry="2" fill="#fca5a5" opacity="0.6"/>
  <path d="M35 28 Q40 18 50 20 Q60 18 65 28" stroke="#7c3aed" stroke-width="3" fill="#7c3aed" opacity="0.7"/>
</svg>`;

const AIKA_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="50" fill="#818cf8"/>
  <circle cx="50" cy="38" r="18" fill="#fef3c7"/>
  <ellipse cx="50" cy="80" rx="22" ry="16" fill="#fef3c7"/>
  <circle cx="43" cy="35" r="2.5" fill="#1e1b4b"/>
  <circle cx="57" cy="35" r="2.5" fill="#1e1b4b"/>
  <path d="M44 43 Q50 48 56 43" stroke="#6d28d9" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <ellipse cx="43" cy="42" rx="4" ry="2" fill="#c4b5fd" opacity="0.6"/>
  <ellipse cx="57" cy="42" rx="4" ry="2" fill="#c4b5fd" opacity="0.6"/>
  <path d="M32 26 Q36 16 50 18 Q64 16 68 26" stroke="#312e81" stroke-width="2.5" fill="#312e81" opacity="0.8"/>
  <circle cx="34" cy="36" r="3" fill="#fde68a" opacity="0.9"/>
  <circle cx="66" cy="36" r="3" fill="#fde68a" opacity="0.9"/>
</svg>`;

const PLACEHOLDER_FEMALE_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="50" fill="#e879f9"/>
  <circle cx="50" cy="38" r="18" fill="#fce7f3"/>
  <ellipse cx="50" cy="80" rx="22" ry="16" fill="#fce7f3"/>
  <circle cx="44" cy="35" r="2.5" fill="#4a044e"/>
  <circle cx="56" cy="35" r="2.5" fill="#4a044e"/>
  <path d="M45 43 Q50 47 55 43" stroke="#9d174d" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <rect x="32" y="48" width="36" height="2" rx="1" fill="#c026d3" opacity="0.3"/>
  <text x="50" y="70" text-anchor="middle" font-size="8" fill="#9d174d" opacity="0.5" font-family="sans-serif">خریداری</text>
</svg>`;

const PLACEHOLDER_MALE_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="50" fill="#6366f1"/>
  <circle cx="50" cy="38" r="18" fill="#e0e7ff"/>
  <ellipse cx="50" cy="80" rx="22" ry="16" fill="#e0e7ff"/>
  <circle cx="44" cy="35" r="2.5" fill="#1e1b4b"/>
  <circle cx="56" cy="35" r="2.5" fill="#1e1b4b"/>
  <path d="M45 43 Q50 47 55 43" stroke="#3730a3" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <rect x="34" y="26" width="32" height="8" rx="4" fill="#312e81" opacity="0.7"/>
  <text x="50" y="70" text-anchor="middle" font-size="8" fill="#3730a3" opacity="0.5" font-family="sans-serif">خریداری</text>
</svg>`;

function svgFallbackSrc(id: string): string {
  let svgStr: string;
  if (id === "ruby") svgStr = RUBY_SVG;
  else if (id === "aika") svgStr = AIKA_SVG;
  else {
    const meta = AVATARS.find(a => a.id === id);
    svgStr = meta?.gender === "male" ? PLACEHOLDER_MALE_SVG : PLACEHOLDER_FEMALE_SVG;
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}`;
}

export function AvatarSvg({ id, size = 40 }: { id: string; size?: number }) {
  const hasWebp = WEBP_IDS.has(id);
  const webpSrc = hasWebp ? `${staticAssetUrl.avatar(id)}?v=2` : null;
  const fallbackSrc = svgFallbackSrc(id);

  if (webpSrc) {
    return (
      <img
        src={webpSrc}
        width={size}
        height={size}
        alt={id}
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallbackSrc; }}
        style={{ borderRadius: "50%", display: "block", objectFit: "cover" }}
      />
    );
  }

  return (
    <img
      src={fallbackSrc}
      width={size}
      height={size}
      alt={id}
      style={{ borderRadius: "50%", display: "block" }}
    />
  );
}

export function DefaultBotAvatar({ size = 40 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size, borderRadius: "50%" }}
      className="bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center"
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="10" rx="2"/>
        <circle cx="12" cy="5" r="2"/>
        <path d="M12 7v4"/>
        <line x1="8" y1="16" x2="8" y2="16"/>
        <line x1="16" y1="16" x2="16" y2="16"/>
      </svg>
    </div>
  );
}
