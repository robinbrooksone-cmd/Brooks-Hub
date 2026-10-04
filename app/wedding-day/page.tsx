"use client";

import { useLang } from "@/components/LangProvider";
import { CoverSection, SectionShell } from "@/components/CoverSection";
import { DAY_TIMELINE, MAP_QUERY, VENUE } from "@/lib/content";

const ICONS: Record<string, string> = {
  arrive: "🚗",
  rings: "💍",
  camera: "📷",
  drinks: "🥂",
  dinner: "🍽️",
  dance: "💃",
  moon: "🌙",
  sun: "☀️",
};

function downloadIcs() {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "SUMMARY:Robin & Annami's Wedding",
    "DTSTART:20261205T140000Z",
    "DTEND:20261206T000000Z",
    `LOCATION:${VENUE}`,
    "DESCRIPTION:We can't wait to celebrate with you!",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "robin-annami-wedding.ics";
  a.click();
  URL.revokeObjectURL(url);
}

export default function WeddingDayPage() {
  const { t, tc } = useLang();
  const mapsUrl = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(MAP_QUERY);

  return (
    <SectionShell bg="#3a2a21">
      <CoverSection image="/images/cover-day.jpg" eyebrow={`${t("day_eyebrow")}, ${t("wedding_date")}`} title={t("day_title")} />

      <div className="mx-auto" style={{ maxWidth: 760, marginBottom: 50 }}>
        <h3 className="font-display text-center" style={{ fontSize: 30, color: "var(--c-ivory)", marginBottom: 30, fontWeight: 500 }}>
          {t("day_order")}
        </h3>
        {DAY_TIMELINE.map((item, i) => (
          <div key={i} className="flex gap-4 items-center" style={{ padding: "16px 0", borderBottom: "1px solid var(--c-line)" }}>
            <div
              className="flex-shrink-0 rounded-full flex items-center justify-center"
              style={{ width: 46, height: 46, border: "1px solid var(--c-line)", fontSize: 20 }}
            >
              {ICONS[item.icon]}
            </div>
            <div className="font-display" style={{ fontSize: 24, color: "var(--c-gold)", minWidth: 82 }}>
              {typeof item.time === "string" ? item.time : tc(`daytimeline_${i}_time`, item.time)}
            </div>
            <div>
              <div style={{ fontSize: 17, color: "var(--c-ivory)", fontWeight: 500 }}>{tc(`daytimeline_${i}_title`, item.title)}</div>
              <div style={{ fontSize: 14, color: "var(--c-muted)", marginTop: 3 }}>{tc(`daytimeline_${i}_note`, item.note)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3.5 justify-center">
        <button
          onClick={downloadIcs}
          className="cursor-pointer"
          style={{ padding: "14px 32px", background: "var(--c-choc)", color: "var(--c-ivory)", border: "none", fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", borderRadius: 2 }}
        >
          {t("day_addcal")}
        </button>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener"
          style={{ padding: "14px 32px", background: "transparent", color: "var(--c-ivory)", border: "1px solid var(--c-choc)", fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", borderRadius: 2, textDecoration: "none" }}
        >
          {t("day_directions")}
        </a>
      </div>

      <div className="mx-auto relative" style={{ maxWidth: 1000, marginTop: 46, height: 380, border: "1px solid var(--c-line)", overflow: "hidden", background: "#2e2019" }}>
        <iframe
          src={`https://www.google.com/maps?q=${encodeURIComponent(MAP_QUERY)}&output=embed`}
          title={`Map to ${VENUE}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{ border: 0, width: "100%", height: "100%" }}
        />
        <div className="absolute pointer-events-none" style={{ inset: 0, background: "linear-gradient(180deg, rgba(20,14,9,0) 78%, rgba(20,14,9,0.75))" }} />
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener"
          className="absolute inline-flex items-center gap-2 text-white"
          style={{ left: "50%", bottom: 22, transform: "translateX(-50%)", padding: "13px 26px", background: "var(--c-gold)", fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", borderRadius: 2, textDecoration: "none" }}
        >
          📍 Open {VENUE} in Maps
        </a>
      </div>
    </SectionShell>
  );
}
