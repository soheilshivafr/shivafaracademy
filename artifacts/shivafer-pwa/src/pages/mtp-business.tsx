import { useState } from "react";
import { LandingShell, usePageData, SectionTitle, RichText, BulletList, glassCard, G } from "@/components/landing-page";
import { ChevronDown } from "lucide-react";

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={glassCard({ overflow: "hidden" })}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "14px 15px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          textAlign: "right",
        }}
      >
        <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700, color: G.textBright }}>{q}</span>
        <ChevronDown
          style={{
            width: 18,
            height: 18,
            color: G.text,
            flexShrink: 0,
            transition: "transform 0.25s",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>
      {open && (
        <div style={{ padding: "0 15px 15px" }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 2, color: "rgba(255,255,255,0.8)" }}>{a}</p>
        </div>
      )}
    </div>
  );
}

export default function MtpBusinessPage() {
  const { data, error } = usePageData("mtp");
  const c = data?.content ?? {};
  const media = data?.media ?? [];
  const faqs = data?.faqs ?? [];
  const audios = media.filter(m => m.kind === "audio");
  const videos = media.filter(m => m.kind === "video");

  return (
    <LandingShell
      title={c.title ?? "بیزینس MTP"}
      ctaLabel={data?.ctaLabel}
      ctaUrl={data?.ctaUrl}
      loading={!data}
      error={error}
    >
      <div style={glassCard({ padding: "20px 18px", marginTop: 12, textAlign: "center", border: G.borderHi })}>
        <div style={{ fontSize: 38, marginBottom: 8 }}>🚀</div>
        <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 900, color: G.textBright }}>{c.title}</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 2, color: "rgba(255,255,255,0.8)" }}>{c.intro}</p>
      </div>

      <SectionTitle>دربارهٔ MTP</SectionTitle>
      <RichText text={c.body} />

      {videos.length > 0 && (
        <>
          <SectionTitle>ویدئوی معرفی</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {videos.map(v => (
              <div key={v.id} style={glassCard({ padding: 6, overflow: "hidden" })}>
                <video controls src={v.url} style={{ width: "100%", borderRadius: 14, display: "block" }} />
                {v.caption && <p style={{ margin: "8px 4px 2px", fontSize: 12.5, color: G.textDim }}>{v.caption}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {audios.length > 0 && (
        <>
          <SectionTitle>توضیحات صوتی</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {audios.map(a => (
              <div key={a.id} style={glassCard({ padding: "12px 14px" })}>
                {a.caption && <p style={{ margin: "0 0 8px", fontSize: 13, color: G.textBright, fontWeight: 600 }}>{a.caption}</p>}
                <audio controls src={a.url} style={{ width: "100%" }} />
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle>مزایای MTP</SectionTitle>
      <BulletList text={c.advantages} />

      {c.income && (
        <>
          <SectionTitle>درآمد</SectionTitle>
          <div style={glassCard({ padding: "16px 16px", border: G.borderHi })}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 2, color: "rgba(255,255,255,0.85)" }}>{c.income}</p>
          </div>
        </>
      )}

      {c.extras && (
        <>
          <SectionTitle>امکانات دوره</SectionTitle>
          <BulletList text={c.extras} />
        </>
      )}

      {faqs.length > 0 && (
        <>
          <SectionTitle>سؤالات متداول</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {faqs.map(f => (
              <FaqItem key={f.id} q={f.question} a={f.answer} />
            ))}
          </div>
        </>
      )}
    </LandingShell>
  );
}
