"use client";

import type { FloorItem } from "@/lib/types";
import { ITEM_DEFAULTS } from "./floorPlanConfig";
import type { Guest } from "./floorPlanConfig";

// Usable area of an A4 landscape page at ~96dpi, minus 12mm margins and the
// header block. The plan is scaled to fit inside this so it never spills onto
// a second page.
const BOX_W = 1020;
const BOX_H = 600;

function PrintHeader({ title, date, venue, subtitle }: { title: string; date: string; venue: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 21, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#444", marginTop: 2 }}>
        {date} · {venue}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>{subtitle}</div>
    </div>
  );
}

/**
 * The vendor-facing document. Hidden on screen, revealed only by @media print
 * (see globals.css). Three parts: a scaled floor plan, a table-by-table guest
 * list, and an A–Z lookup of every guest and their table.
 */
export function SeatingPrintSheet({
  items,
  guests,
  babies,
  eventTitle,
  eventDate,
  venue,
}: {
  items: FloorItem[];
  guests: Guest[];
  babies: Guest[];
  eventTitle: string;
  eventDate: string;
  venue: string;
}) {
  const guestByKey = new Map(guests.map((g) => [g.key, g]));
  const tables = items.filter((it) => Array.isArray(it.seats));
  const seatedKeys = new Set(tables.flatMap((t) => t.seats || []));

  // Fit the whole plan into a fixed-width box so it prints on one page.
  const pad = 60;
  const xs = items.flatMap((i) => [i.x - i.w / 2, i.x + i.w / 2]);
  const ys = items.flatMap((i) => [i.y - i.h / 2, i.y + i.h / 2]);
  const minX = xs.length ? Math.min(...xs) - pad : 0;
  const maxX = xs.length ? Math.max(...xs) + pad : BOX_W;
  const minY = ys.length ? Math.min(...ys) - pad : 0;
  const maxY = ys.length ? Math.max(...ys) + pad : BOX_H;
  const planW = Math.max(1, maxX - minX);
  const planH = Math.max(1, maxY - minY);
  // Fit to BOTH dimensions so a tall layout shrinks to one page too.
  const scale = Math.min(BOX_W / planW, BOX_H / planH, 1.5);

  const alphabetical = [...guests]
    .filter((g) => g.status === "attending")
    .sort((a, b) => a.name.localeCompare(b.name));

  const tableOf = (key: string) => tables.find((t) => (t.seats || []).includes(key))?.name || "—";

  const h2: React.CSSProperties = { fontSize: 17, fontWeight: 700, margin: "0 0 10px", borderBottom: "2px solid #111", paddingBottom: 5 };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #999", padding: "5px 6px" };
  const td: React.CSSProperties = { fontSize: 12, padding: "4px 6px", borderBottom: "1px solid #e4e4e4" };

  return (
    <div id="seating-print-doc" style={{ color: "#111", background: "#fff", fontFamily: "Arial, Helvetica, sans-serif" }}>
      {/* ---------- Page 1: floor plan ---------- */}
      <section style={{ breakAfter: "page", pageBreakAfter: "always" }}>
        <PrintHeader title={eventTitle} date={eventDate} venue={venue} subtitle="Reception Floor Plan" />
        <div style={{ position: "relative", width: planW * scale, height: planH * scale, margin: "0 auto" }}>
          <div style={{ position: "absolute", inset: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
            {items.map((it) => {
              const def = ITEM_DEFAULTS[it.type];
              const isRound = it.shape === "round";
              const seatCount = (it.seats || []).length;
              return (
                <div
                  key={it.id}
                  style={{
                    position: "absolute",
                    left: it.x - it.w / 2 - minX,
                    top: it.y - it.h / 2 - minY,
                    width: it.w,
                    height: it.h,
                    transform: `rotate(${it.rotation}deg)`,
                    transformOrigin: "center center",
                    border: "2px solid #111",
                    borderRadius: isRound ? "50%" : 8,
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    padding: 4,
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.15 }}>{it.name}</div>
                  {it.cap !== undefined ? (
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      {seatCount}/{it.cap} seats
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, marginTop: 2, color: "#555" }}>{def.label}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- Page 2: table by table ---------- */}
      <section style={{ breakAfter: "page", pageBreakAfter: "always" }}>
        <PrintHeader title={eventTitle} date={eventDate} venue={venue} subtitle="Guests by Table" />
        <div style={{ columnCount: 2, columnGap: 28 }}>
          {tables.map((t) => {
            const seats = t.seats || [];
            return (
              <div key={t.id} style={{ breakInside: "avoid", pageBreakInside: "avoid", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, borderBottom: "1px solid #111", paddingBottom: 3, marginBottom: 5 }}>
                  {t.name} <span style={{ fontWeight: 400, color: "#555" }}>— {seats.length}/{t.cap ?? seats.length} seated</span>
                </div>
                {seats.length === 0 && <div style={{ fontSize: 11, color: "#777" }}>No one seated yet</div>}
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {seats.map((k) => {
                    const g = guestByKey.get(k);
                    return (
                      <li key={k} style={{ fontSize: 12, padding: "1.5px 0" }}>
                        {g?.name || k}
                        {g?.diet && g.diet !== "No restrictions" && (
                          <span style={{ color: "#555" }}> — {g.diet}</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- Page 3: A–Z guest -> table ---------- */}
      <section>
        <PrintHeader title={eventTitle} date={eventDate} venue={venue} subtitle="All Guests — Alphabetical, with Table" />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Guest</th>
              <th style={th}>Household</th>
              <th style={th}>Table</th>
              <th style={th}>Meal</th>
            </tr>
          </thead>
          <tbody>
            {alphabetical.map((g) => (
              <tr key={g.key}>
                <td style={td}>{g.name}</td>
                <td style={{ ...td, color: "#555" }}>{g.family}</td>
                <td style={{ ...td, fontWeight: seatedKeys.has(g.key) ? 700 : 400 }}>{tableOf(g.key)}</td>
                <td style={{ ...td, color: "#555" }}>{g.diet || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 18, fontSize: 12 }}>
          <strong>{alphabetical.length}</strong> guests attending ·{" "}
          <strong>{alphabetical.filter((g) => seatedKeys.has(g.key)).length}</strong> seated ·{" "}
          <strong>{alphabetical.filter((g) => !seatedKeys.has(g.key)).length}</strong> not yet seated
        </div>

        {babies.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h2 style={h2}>Babies — no seat or place setting required</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Household</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {babies.map((b) => (
                  <tr key={b.key}>
                    <td style={td}>{b.name}</td>
                    <td style={{ ...td, color: "#555" }}>{b.family}</td>
                    <td style={td}>{b.status === "attending" ? "Coming" : b.status === "declined" ? "Not coming" : "Awaiting reply"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
