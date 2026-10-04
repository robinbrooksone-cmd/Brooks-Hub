"use client";

import { useEffect, useState } from "react";
import { TARGET_MS } from "@/lib/content";
import { useLang } from "./LangProvider";

function parts(ms: number) {
  const d = Math.max(0, ms);
  return {
    days: Math.floor(d / 86400000),
    hours: Math.floor((d / 3600000) % 24),
    minutes: Math.floor((d / 60000) % 60),
    seconds: Math.floor((d / 1000) % 60),
  };
}

export function Countdown() {
  const { t } = useLang();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(TARGET_MS - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const p = parts(remaining ?? TARGET_MS - Date.now());
  const items = [
    { val: p.days, label: t("cd_days") },
    { val: p.hours, label: t("cd_hours") },
    { val: p.minutes, label: t("cd_minutes") },
    { val: p.seconds, label: t("cd_seconds") },
  ];

  return (
    <div className="flex justify-center" style={{ marginTop: 46, gap: "clamp(14px,4vw,40px)" }}>
      {items.map((it) => (
        <div key={it.label} className="text-center" style={{ minWidth: 62 }}>
          <div className="font-display" style={{ fontSize: "clamp(34px,6vw,54px)", color: "var(--c-ivory)", lineHeight: 1 }}>
            {remaining === null ? "–" : it.val}
          </div>
          <div className="text-[10px] uppercase mt-2" style={{ letterSpacing: "0.28em", color: "var(--c-champ)" }}>
            {it.label}
          </div>
        </div>
      ))}
    </div>
  );
}
