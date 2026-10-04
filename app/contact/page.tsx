"use client";

import { useLang } from "@/components/LangProvider";
import { CoverSection, SectionShell } from "@/components/CoverSection";
import { CONTACTS } from "@/lib/content";

export default function ContactPage() {
  const { t, lang } = useLang();

  return (
    <SectionShell bg="#2e2019">
      <CoverSection image="/images/cover-contact.jpg" eyebrow={t("contact_eyebrow")} title={t("contact_title")} />

      <div className="grid gap-4 mx-auto" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", maxWidth: 1000 }}>
        {CONTACTS.map((c) => (
          <div key={c.name} className="text-center" style={{ background: "var(--c-panel)", border: "1px solid var(--c-line)", padding: 28 }}>
            <div className="text-[11px] uppercase" style={{ letterSpacing: "0.25em", color: "var(--c-gold)" }}>
              {c.role[lang]}
            </div>
            <h3 className="font-display" style={{ fontSize: 24, color: "var(--c-ivory)", margin: "10px 0 8px", fontWeight: 500 }}>
              {c.name}
            </h3>
            <div style={{ fontSize: 14, color: "var(--c-ivory)" }}>{c.phone}</div>
            <div style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 4 }}>{c.email}</div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
