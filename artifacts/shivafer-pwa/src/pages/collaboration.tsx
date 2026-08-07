import { LandingShell, usePageData, SectionTitle, RichText, BulletList, glassCard, G } from "@/components/landing-page";

export default function CollaborationPage() {
  const { data, error } = usePageData("collab");
  const c = data?.content ?? {};

  return (
    <LandingShell
      title={c.title ?? "همکاری ۳۵ نفر"}
      ctaLabel={data?.ctaLabel}
      ctaUrl={data?.ctaUrl}
      loading={!data}
      error={error}
    >
      <div style={glassCard({ padding: "20px 18px", marginTop: 12, textAlign: "center", border: G.borderHi })}>
        <div style={{ fontSize: 38, marginBottom: 8 }}>🤝</div>
        <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 900, color: G.textBright }}>{c.title}</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 2, color: "rgba(255,255,255,0.8)" }}>{c.intro}</p>
      </div>

      {/* highlight stat */}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <div style={glassCard({ flex: 1, padding: "14px 10px", textAlign: "center" })}>
          <div style={{ fontSize: 22, fontWeight: 900, color: G.text }}>۳۵</div>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>نفر منتخب</div>
        </div>
        <div style={glassCard({ flex: 1, padding: "14px 10px", textAlign: "center" })}>
          <div style={{ fontSize: 22, fontWeight: 900, color: G.text }}>۳</div>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>پروژهٔ اولیه</div>
        </div>
        <div style={glassCard({ flex: 1, padding: "14px 10px", textAlign: "center" })}>
          <div style={{ fontSize: 22, fontWeight: 900, color: G.text }}>۷۵م</div>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>تومان فرصت</div>
        </div>
      </div>

      <SectionTitle>توضیحات همکاری</SectionTitle>
      <RichText text={c.body} />

      <SectionTitle>شرایط انتخاب</SectionTitle>
      <BulletList text={c.criteria} />
    </LandingShell>
  );
}
