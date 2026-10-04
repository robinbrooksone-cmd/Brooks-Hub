"use client";

import { useState } from "react";
import { useLang } from "@/components/LangProvider";
import { CoverSection, SectionShell } from "@/components/CoverSection";
import { FAQ } from "@/lib/content";

export default function FaqPage() {
  const { t, tc } = useLang();
  const [open, setOpen] = useState<Record<number, boolean>>({});

  return (
    <SectionShell bg="#3a2a21">
      <CoverSection image="/images/cover-faq.jpg" eyebrow={t("faq_eyebrow")} title={t("faq_title")} />

      <div className="mx-auto" style={{ maxWidth: 760 }}>
        {FAQ.map((item, i) => {
          const q = tc(`faq_${i}_q`, { en: item.en[0], af: item.af[0] });
          const a = tc(`faq_${i}_a`, { en: item.en[1], af: item.af[1] });
          const isOpen = !!open[i];
          return (
            <div
              key={i}
              onClick={() => setOpen((s) => ({ ...s, [i]: !s[i] }))}
              className="cursor-pointer"
              style={{ borderBottom: "1px solid var(--c-line)", padding: "22px 4px" }}
            >
              <div className="flex justify-between items-center gap-4">
                <h3 className="font-display" style={{ fontSize: 23, color: "var(--c-ivory)", margin: 0, fontWeight: 500 }}>
                  {q}
                </h3>
                <span
                  style={{
                    fontSize: 22,
                    color: "var(--c-gold)",
                    transition: "transform .3s",
                    transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                    display: "inline-block",
                  }}
                >
                  +
                </span>
              </div>
              {isOpen && (
                <p style={{ fontSize: 15, color: "var(--c-muted)", lineHeight: 1.8, margin: "14px 0 0" }}>{a}</p>
              )}
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}
