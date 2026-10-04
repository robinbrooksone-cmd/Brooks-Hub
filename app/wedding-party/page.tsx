"use client";

import { useState } from "react";
import { useLang } from "@/components/LangProvider";
import { CoverSection, SectionShell } from "@/components/CoverSection";
import { SitePhoto, useHasPhoto } from "@/components/PhotoProvider";
import { BRIDESMAIDS, GROOMSMEN } from "@/lib/content";

function MemberPhoto({ name }: { name: string }) {
  const photo = useHasPhoto(`party:${name}`);
  return photo ? <SitePhoto slot={`party:${name}`} alt={name} className="object-cover" /> : <Initials name={name} />;
}

function TogoPhoto() {
  const photo = useHasPhoto("party:Togo");
  if (photo) return <SitePhoto slot="party:Togo" alt="Togo" className="object-cover" />;
  return (
    <div className="flex items-center justify-center h-full" style={{ background: "linear-gradient(135deg, rgba(179,136,78,0.28), rgba(58,42,33,0.9))", fontSize: 64 }}>
      🐾
    </div>
  );
}

function Initials({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <div
      className="flex items-center justify-center font-display"
      style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, rgba(179,136,78,0.28), rgba(58,42,33,0.9))", color: "var(--c-gold)", fontSize: 40 }}
    >
      {initials}
    </div>
  );
}

export default function WeddingPartyPage() {
  const { t } = useLang();
  const [tab, setTab] = useState<"groomsmen" | "bridesmaids">("groomsmen");
  const side = tab === "bridesmaids" ? BRIDESMAIDS : GROOMSMEN;
  const [lead, ...rest] = side;

  return (
    <SectionShell bg="#3a2a21">
      <CoverSection image="/images/cover-party.jpg" eyebrow={t("party_eyebrow")} title={t("party_title")} />

      <div className="text-center mx-auto" style={{ maxWidth: 700, marginBottom: 30 }}>
        <p style={{ color: "var(--c-muted)", fontSize: 16, lineHeight: 1.7, margin: 0 }}>{t("party_sub")}</p>
      </div>

      <div className="flex justify-center gap-2.5" style={{ marginBottom: 30 }}>
        {(["groomsmen", "bridesmaids"] as const).map((k) => {
          const on = tab === k;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="cursor-pointer font-body uppercase"
              style={{
                padding: "12px 28px",
                borderRadius: 2,
                fontSize: 12,
                letterSpacing: "0.2em",
                border: `1px solid ${on ? "var(--c-gold)" : "var(--c-line)"}`,
                background: on ? "var(--c-gold)" : "transparent",
                color: on ? "#fff" : "var(--c-champ)",
              }}
            >
              {t(k === "bridesmaids" ? "tab_bridesmaids" : "tab_groomsmen")}
            </button>
          );
        })}
      </div>

      {/* lead */}
      <div className="mx-auto" style={{ maxWidth: 1080, marginBottom: 22 }}>
        <div className="grid sm:grid-cols-[minmax(0,400px)_1fr]" style={{ background: "var(--c-panel)", border: "1px solid var(--c-line)", overflow: "hidden" }}>
          <div className="relative" style={{ minHeight: 320 }}>
            <MemberPhoto name={lead.name} />
          </div>
          <div className="flex flex-col justify-center" style={{ padding: "clamp(30px,5vw,60px)" }}>
            <div className="text-[11px] uppercase" style={{ letterSpacing: "0.4em", color: "var(--c-gold)" }}>
              {t(lead.role)}
            </div>
            <h3 className="font-display" style={{ fontSize: "clamp(38px,5.5vw,60px)", color: "var(--c-ivory)", margin: "8px 0 0", fontWeight: 500, lineHeight: 1.02 }}>
              {lead.name}
            </h3>
            <div style={{ width: 54, height: 2, background: "var(--c-gold)", marginTop: 24 }} />
          </div>
        </div>
      </div>

      {/* rest */}
      <div className="grid gap-3.5 mx-auto" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", maxWidth: 1080 }}>
        {rest.map((m) => (
          <div key={m.name} style={{ background: "var(--c-panel)", border: "1px solid var(--c-line)", overflow: "hidden" }}>
            <div className="relative" style={{ aspectRatio: "1/1" }}>
              <MemberPhoto name={m.name} />
            </div>
            <div className="text-center" style={{ padding: "16px 14px 18px", borderTop: "1px solid var(--c-line)" }}>
              <h4 className="font-display" style={{ fontSize: 21, color: "var(--c-ivory)", margin: "0 0 4px", fontWeight: 500 }}>
                {m.name}
              </h4>
              <div className="text-[10px] uppercase" style={{ letterSpacing: "0.22em", color: "var(--c-gold)" }}>
                {t(m.role)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* guest of honour */}
      <div className="mx-auto" style={{ maxWidth: 1080, marginTop: "clamp(40px,5vw,64px)" }}>
        <div className="grid sm:grid-cols-[minmax(0,300px)_1fr]" style={{ background: "var(--c-panel)", border: "1px solid var(--c-line)", overflow: "hidden" }}>
          <div className="relative" style={{ minHeight: 220 }}>
            <TogoPhoto />
          </div>
          <div className="flex flex-col justify-center" style={{ padding: "clamp(28px,4vw,52px)" }}>
            <div className="text-[11px] uppercase" style={{ letterSpacing: "0.4em", color: "var(--c-gold)" }}>
              {t("goh_tag")}
            </div>
            <h3 className="font-display" style={{ fontSize: "clamp(40px,6vw,64px)", color: "var(--c-ivory)", margin: "10px 0 0", fontWeight: 500, lineHeight: 1 }}>
              Togo
            </h3>
            <div className="text-[11px] uppercase mt-2" style={{ letterSpacing: "0.3em", color: "var(--c-champ)" }}>
              {t("goh_role")}
            </div>
            <div style={{ width: 54, height: 2, background: "var(--c-gold)", marginTop: 22 }} />
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
