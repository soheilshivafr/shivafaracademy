import { LandingShell, usePageData, glassCard, G } from "@/components/landing-page";

const TYPE_BADGE: Record<string, { label: string; icon: string }> = {
  audio: { label: "پیام صوتی", icon: "🎧" },
  video: { label: "ویدئو", icon: "🎬" },
  text: { label: "پیام متنی", icon: "💬" },
  screenshot: { label: "اسکرین‌شات", icon: "🖼️" },
};

export default function StudentResultsPage() {
  const { data, error } = usePageData("results");
  const c = data?.content ?? {};
  const results = data?.results ?? [];

  return (
    <LandingShell
      title={c.title ?? "نتایج دانشجوها"}
      ctaLabel={data?.ctaLabel}
      ctaUrl={data?.ctaUrl}
      loading={!data}
      error={error}
    >
      <div style={glassCard({ padding: "18px 18px", marginTop: 12, textAlign: "center", border: G.borderHi })}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>⭐</div>
        <h2 style={{ margin: "0 0 10px", fontSize: 19, fontWeight: 900, color: G.textBright }}>{c.title}</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 2, color: "color-mix(in srgb, var(--color-foreground) 80%, transparent)" }}>{c.intro}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
        {results.map(r => {
          const badge = TYPE_BADGE[r.type] ?? TYPE_BADGE.text;
          return (
            <div key={r.id} style={glassCard({ padding: "14px 15px" })}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>{badge.icon}</span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: G.text,
                    background: "rgba(255,218,100,0.10)",
                    border: "1px solid rgba(255,218,100,0.25)",
                    borderRadius: 8,
                    padding: "3px 9px",
                  }}
                >
                  {badge.label}
                </span>
                {r.name && (
                  <span style={{ marginRight: "auto", fontSize: 13, fontWeight: 700, color: G.textBright }}>{r.name}</span>
                )}
              </div>

              {r.type === "text" && r.body && (
                <p style={{ margin: 0, fontSize: 14, lineHeight: 2, color: "color-mix(in srgb, var(--color-foreground) 85%, transparent)" }}>{r.body}</p>
              )}

              {r.type === "audio" && r.mediaUrl && (
                <audio controls src={r.mediaUrl} style={{ width: "100%" }} />
              )}

              {r.type === "video" && r.mediaUrl && (
                <video controls src={r.mediaUrl} style={{ width: "100%", borderRadius: 12, display: "block" }} />
              )}

              {r.type === "screenshot" && r.mediaUrl && (
                <img
                  src={r.mediaUrl}
                  alt={r.name ?? "نتیجه دانشجو"}
                  loading="lazy"
                  style={{ width: "100%", borderRadius: 12, display: "block" }}
                />
              )}

              {/* fallback caption under media */}
              {r.type !== "text" && r.body && (
                <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.9, color: "color-mix(in srgb, var(--color-foreground) 70%, transparent)" }}>{r.body}</p>
              )}
            </div>
          );
        })}
      </div>
    </LandingShell>
  );
}
