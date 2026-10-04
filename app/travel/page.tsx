"use client";

import { useLang } from "@/components/LangProvider";
import { CoverSection, SectionShell } from "@/components/CoverSection";
import { ACCOMMODATION, TRAVEL_EXTRAS, VENUE } from "@/lib/content";

export default function TravelPage() {
  const { t, tc } = useLang();

  return (
    <SectionShell bg="#2e2019">
      <CoverSection image="/images/cover-travel.jpg" eyebrow={t("travel_eyebrow")} title={t("travel_title")} />

      <div className="text-center mx-auto" style={{ maxWidth: 700, marginBottom: "clamp(44px,6vw,60px)" }}>
        <p style={{ color: "var(--c-muted)", fontSize: 16, lineHeight: 1.7, margin: 0 }}>
          {t("travel_sub")} {VENUE}.
        </p>
      </div>

      <div className="mx-auto" style={{ maxWidth: 1080 }}>
        {ACCOMMODATION.map((tier, ti) => (
          <div key={tier.tier.en} style={{ marginBottom: 40 }}>
            <div className="flex items-baseline gap-3.5" style={{ marginBottom: 18 }}>
              <h3 className="font-display" style={{ fontSize: 30, color: "var(--c-ivory)", margin: 0, fontWeight: 500 }}>
                {tc(`accommodation_tier_${ti}_label`, tier.tier)}
              </h3>
              <span style={{ flex: 1, height: 1, background: "var(--c-line)" }} />
              <span style={{ fontSize: 12, color: "var(--c-gold)", letterSpacing: "0.15em" }}>{tc(`accommodation_tier_${ti}_note`, tier.note)}</span>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))" }}>
              {tier.items.map((h, ii) => (
                <div key={h.name} style={{ background: "var(--c-panel)", border: "1px solid var(--c-line)", padding: 24 }}>
                  <div className="font-display" style={{ fontSize: 22, color: "var(--c-ivory)" }}>
                    {h.name}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--c-muted)", margin: "8px 0 14px", lineHeight: 1.6 }}>
                    {tc(`accommodation_item_${ti}_${ii}_desc`, h.desc)}
                  </div>
                  <div className="flex justify-between items-center" style={{ fontSize: 12 }}>
                    <span style={{ color: "var(--c-gold)", letterSpacing: "0.1em" }}>{tc(`accommodation_item_${ti}_${ii}_dist`, h.dist)}</span>
                    <span style={{ color: "var(--c-ivory)" }}>{h.price}</span>
                  </div>
                  <a
                    href={h.url}
                    target="_blank"
                    rel="noopener"
                    className="block text-center mt-4"
                    style={{ width: "100%", padding: 10, background: "transparent", border: "1px solid var(--c-line)", color: "var(--c-ivory)", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", textDecoration: "none" }}
                  >
                    {t("book_cta")}
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", marginTop: 20 }}>
          {TRAVEL_EXTRAS.map((x, i) => (
            <div key={x.k.en} style={{ background: "var(--c-panel)", border: "1px solid var(--c-line)", padding: 24 }}>
              <div className="text-[11px] uppercase" style={{ letterSpacing: "0.3em", color: "var(--c-gold)" }}>
                {tc(`travel_extra_${i}_k`, x.k)}
              </div>
              {tc(`travel_extra_${i}_lines`, { en: x.lines.en.join("\n"), af: x.lines.af.join("\n") })
                .split("\n")
                .filter(Boolean)
                .map((l) => (
                  <div key={l} style={{ fontSize: 14, color: "var(--c-ivory)", marginTop: 10, lineHeight: 1.5 }}>
                    {l}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
