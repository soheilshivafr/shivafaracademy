import { LandingShell, usePageData, SectionTitle, RichText, BulletList, glassCard, G } from "@/components/landing-page";

export default function GuaranteePage() {
  const { data, error } = usePageData("guarantee");
  const c = data?.content ?? {};
  const images = data?.media ?? [];

  return (
    <LandingShell
      title={c.title ?? "ضمانت‌نامهٔ کتبی"}
      ctaLabel={data?.ctaLabel}
      ctaUrl={data?.ctaUrl}
      loading={!data}
      error={error}
    >
      {/* hero badge */}
      <div style={glassCard({ padding: "20px 18px", marginTop: 12, textAlign: "center", border: G.borderHi })}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🛡️</div>
        <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 900, color: G.textBright }}>{c.title}</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 2, color: "var(--landing-text-body)" }}>{c.intro}</p>
      </div>

      <SectionTitle>توضیحات ضمانت</SectionTitle>
      <RichText text={c.body} />

      <SectionTitle>شرایط استفاده از گارانتی</SectionTitle>
      <BulletList text={c.terms} />

      {images.length > 0 && (
        <>
          <SectionTitle>تصاویر ضمانت‌نامه</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {images.map(img => (
              <figure key={img.id} style={{ margin: 0 }}>
                <div style={glassCard({ padding: 6, overflow: "hidden" })}>
                  <img
                    src={img.url}
                    alt={img.caption ?? "ضمانت‌نامه"}
                    loading="lazy"
                    style={{ width: "100%", borderRadius: 14, display: "block" }}
                  />
                </div>
                {img.caption && (
                  <figcaption style={{ marginTop: 8, fontSize: 12.5, color: G.textDim, textAlign: "center" }}>
                    {img.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </>
      )}

      {c.note && (
        <div style={glassCard({ padding: "14px 16px", marginTop: 22, display: "flex", gap: 10, alignItems: "flex-start" })}>
          <span style={{ fontSize: 18 }}>ℹ️</span>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.9, color: "var(--landing-text-body)" }}>{c.note}</p>
        </div>
      )}
    </LandingShell>
  );
}
