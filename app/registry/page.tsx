"use client";

import { useLang } from "@/components/LangProvider";
import { CoverSection, SectionShell } from "@/components/CoverSection";
import { BANKING } from "@/lib/content";

export default function RegistryPage() {
  const { t, lang } = useLang();

  return (
    <SectionShell bg="#2e2019">
      <CoverSection image="/images/cover-registry.jpg" eyebrow={t("gifts_eyebrow")} title={t("registry_title")} />

      <div className="text-center mx-auto" style={{ maxWidth: 680, marginBottom: "clamp(34px,5vw,46px)" }}>
        <p style={{ color: "var(--c-muted)", fontSize: "clamp(17px,2.4vw,21px)", lineHeight: 1.85, margin: 0, whiteSpace: "pre-wrap" }}>
          {t("registry_message")}
        </p>
      </div>

      <div className="mx-auto" style={{ maxWidth: 560, background: "var(--c-panel)", border: "1px solid var(--c-line)", padding: "clamp(26px,4vw,38px)" }}>
        <div className="text-center text-[11px] uppercase" style={{ letterSpacing: "0.4em", color: "var(--c-gold)", marginBottom: 22 }}>
          {t("banking_title")}
        </div>
        {BANKING.map((b) => (
          <div key={b.k} className="flex justify-between gap-4" style={{ padding: "12px 0", borderBottom: "1px solid var(--c-line)", fontSize: 15 }}>
            <span style={{ color: "var(--c-muted)" }}>{lang === "af" ? b.af : b.k}</span>
            <span style={{ color: "var(--c-ivory)", fontFamily: "monospace", textAlign: "right" }}>{b.v}</span>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
