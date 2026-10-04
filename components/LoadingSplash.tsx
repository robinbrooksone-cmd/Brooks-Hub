"use client";

import { useEffect, useState } from "react";
import { useLang } from "./LangProvider";

export function LoadingSplash() {
  const { t } = useLang();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setVisible(false), 1100);
    return () => clearTimeout(id);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center fade-in"
      style={{ background: "var(--c-choc)", gap: 28 }}
    >
      <div className="font-display text-[13px] uppercase" style={{ letterSpacing: "0.7em", color: "var(--c-champ)", paddingLeft: "0.7em" }}>
        {t("loading_wedding_of")}
      </div>
      <div className="font-display italic" style={{ fontSize: "clamp(44px,9vw,86px)", color: "var(--c-ivory)", lineHeight: 1 }}>
        Robin &amp; Annami
      </div>
      <div
        className="rounded-full"
        style={{
          width: 54,
          height: 54,
          border: "1.5px solid rgba(203,177,144,0.3)",
          borderTopColor: "var(--c-gold)",
          animation: "spin 1s linear infinite",
        }}
      />
      <div className="text-[11px] uppercase" style={{ letterSpacing: "0.45em", color: "rgba(248,243,236,0.55)", paddingLeft: "0.45em" }}>
        {t("wedding_date")}
      </div>
    </div>
  );
}
