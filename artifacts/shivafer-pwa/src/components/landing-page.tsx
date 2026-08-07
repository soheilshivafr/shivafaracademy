import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";

/* ── Champagne Foil Gold + glassy liquid tokens (shared with guide.tsx) ── */
export const G = {
  metal:
    "linear-gradient(105deg,#5c3a00 0%,#c89c1a 7%,#ffe870 14%,#fffef2 21%,#ffd840 27%,#a87c10 35%,#e4be3c 43%,#fffce4 50%,#ffd040 57%,#a07610 65%,#d8ae2e 72%,#fff8de 80%,#cca01e 87%,#5c3a00 100%)",
  glass: "linear-gradient(135deg,rgba(255,218,100,0.12) 0%,rgba(175,115,0,0.05) 50%,rgba(255,218,100,0.09) 100%)",
  border: "1px solid rgba(255,218,100,0.30)",
  borderHi: "1.5px solid rgba(255,230,120,0.52)",
  borderMetal: "1.5px solid rgba(255,252,200,0.50)",
  text: "var(--gold-primary)",
  textBright: "var(--landing-text-hi, var(--color-foreground))",
  textDim: "var(--landing-text-dim)",
  blur: "blur(16px) saturate(190%)",
  shadowGlass: "inset 0 1.5px 0 rgba(255,252,200,0.18), inset 0 -1px 0 rgba(0,0,0,0.30), 0 4px 20px rgba(0,0,0,0.48)",
  shadowMetal: "inset 0 2px 0 rgba(255,252,200,0.40), inset 0 -2px 0 rgba(50,25,0,0.60), 0 6px 26px rgba(150,95,0,0.52)",
  shadowGlow: "0 8px 36px rgba(190,130,0,0.60)",
};

export const glassCard = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: "var(--landing-glass-bg)",
  backdropFilter: G.blur,
  WebkitBackdropFilter: G.blur,
  border: "1px solid var(--landing-glass-border)",
  boxShadow: "var(--landing-glass-shadow)",
  borderRadius: 20,
  ...extra,
});

export interface PageContent {
  slug: string;
  content: Record<string, string>;
  ctaUrl: string;
  ctaLabel: string;
  media?: Array<{ id: number; kind?: string; url: string; caption?: string | null }>;
  faqs?: Array<{ id: number; question: string; answer: string }>;
  results?: Array<{ id: number; type: string; name?: string | null; body?: string | null; mediaUrl?: string | null }>;
}

const API = import.meta.env.VITE_API_BASE_URL ?? "";

export function usePageData(slug: string) {
  const [data, setData] = useState<PageContent | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    fetch(`${API}/api/pages/${slug}`)
      .then(r => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      })
      .then(d => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  return { data, error };
}

/* Section title with gold accent */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "26px 0 14px" }}>
      <span style={{ width: 4, height: 20, borderRadius: 4, background: G.metal, boxShadow: G.shadowGlow }} />
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: G.textBright }}>{children}</h2>
    </div>
  );
}

/* Renders text with \n as paragraphs */
export function RichText({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <>
      {text.split("\n").filter(Boolean).map((p, i) => (
        <p key={i} style={{ margin: "0 0 12px", fontSize: 14.5, lineHeight: 2, color: "color-mix(in srgb, var(--color-foreground) 82%, transparent)" }}>
          {p}
        </p>
      ))}
    </>
  );
}

/* Renders a \n-separated list as gold check bullets */
export function BulletList({ text }: { text?: string }) {
  if (!text) return null;
  const items = text.split("\n").map(s => s.trim()).filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item, i) => (
        <div key={i} style={glassCard({ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 14 })}>
          <span
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: G.metal,
              color: "#3a2600",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 900,
              marginTop: 1,
            }}
          >
            ✓
          </span>
          <span style={{ fontSize: 14, lineHeight: 1.9, color: "color-mix(in srgb, var(--color-foreground) 88%, transparent)" }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

interface LandingShellProps {
  title: string;
  ctaLabel?: string;
  ctaUrl?: string;
  loading?: boolean;
  error?: boolean;
  children: React.ReactNode;
}

export function LandingShell({ title, ctaLabel, ctaUrl, loading, error, children }: LandingShellProps) {
  const [, navigate] = useLocation();

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else navigate("/products");
  };

  return (
    <div
      dir="rtl"
      className="mx-auto w-full max-w-[430px] relative flex flex-col"
      style={{
        background: "var(--landing-bg)",
        height: "100dvh",
        overflowY: "auto",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
        fontFamily: "var(--app-font-sans)",
      } as React.CSSProperties}
    >
      {/* ambient gold glow */}
      <div
        style={{
          position: "fixed",
          top: -120,
          right: "50%",
          transform: "translateX(50%)",
          width: 360,
          height: 360,
          background: "radial-gradient(circle, rgba(200,140,0,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* top bar */}
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-4"
        style={{
          height: 56,
          background: "var(--landing-header-bg)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--landing-header-border)",
        }}
      >
        <button
          onClick={goBack}
          aria-label="بازگشت"
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            ...glassCard({ borderRadius: 12 }),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <ChevronRight style={{ width: 22, height: 22, color: G.text }} />
        </button>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: G.textBright, flex: 1 }}>{title}</h1>
      </header>

      {/* content */}
      <main
        className="flex-1 px-4 relative z-10"
        style={{ paddingTop: 8, paddingBottom: ctaUrl ? 110 : 32, WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 24 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={glassCard({ height: 90, opacity: 0.5 })} />
            ))}
          </div>
        )}
        {error && !loading && (
          <div style={{ textAlign: "center", paddingTop: 60, color: "var(--landing-text-body)" }}>
            <p style={{ color: "var(--landing-text-body)" }}>خطا در بارگذاری اطلاعات. لطفاً دوباره تلاش کنید.</p>
          </div>
        )}
        {!loading && !error && children}
      </main>

      {/* sticky CTA */}
      {ctaUrl && ctaLabel && !loading && !error && (
        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-30 px-4"
          style={{
            paddingTop: 12,
            paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
            background: "var(--landing-cta-overlay)",
          }}
        >
          <button
            onClick={() => navigate(ctaUrl)}
            className="w-full active:scale-[0.98] transition-transform"
            style={{
              height: 56,
              borderRadius: 18,
              background: G.metal,
              border: G.borderMetal,
              boxShadow: G.shadowMetal,
              color: "#3a2600",
              fontSize: 16.5,
              fontWeight: 900,
              cursor: "pointer",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {ctaLabel}
          </button>
        </div>
      )}
    </div>
  );
}
