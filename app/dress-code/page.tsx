"use client";

import { useLang } from "@/components/LangProvider";
import { CoverSection, SectionShell } from "@/components/CoverSection";
import { SitePhoto } from "@/components/PhotoProvider";

export default function DressCodePage() {
  const { t } = useLang();

  return (
    <SectionShell bg="#2e2019">
      <CoverSection image="/images/cover-dress.jpg" eyebrow={t("dress_kicker")} title={t("dress_title")} />

      <div className="text-center mx-auto" style={{ maxWidth: 620, marginBottom: "clamp(40px,6vw,56px)" }}>
        <div className="font-display italic" style={{ fontSize: "clamp(24px,3.4vw,32px)", color: "var(--c-champ)", lineHeight: 1.5 }}>
          {t("dress_intro")}
        </div>
      </div>

      <div className="mx-auto" style={{ maxWidth: 1100 }}>
        <div style={{ background: "#fff", padding: "clamp(10px,1.4vw,18px)", boxShadow: "0 40px 90px rgba(0,0,0,0.45)" }}>
          <div className="relative" style={{ width: "100%", aspectRatio: "1402/1122" }}>
            <SitePhoto
              slot="/images/dress-cover.webp"
              alt="Dress code palette"
              sizes="1100px"
              className="object-contain"
              style={{ background: "#f3efe9" }}
            />
          </div>
        </div>
        <p className="text-center italic mx-auto" style={{ fontSize: 14, color: "var(--c-muted)", lineHeight: 1.7, margin: "26px auto 0", maxWidth: 640 }}>
          {t("dress_note")}
        </p>
      </div>
    </SectionShell>
  );
}
