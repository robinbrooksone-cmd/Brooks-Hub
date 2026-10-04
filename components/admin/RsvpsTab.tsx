"use client";

import { useEffect, useMemo, useState } from "react";
import { getFamiliesAction, getRsvpsAction } from "@/app/actions";
import type { Family } from "@/lib/roster";
import type { Rsvp } from "@/lib/types";
import { inputStyle, panelStyle } from "./AdminDashboard";
import { dietColor, splitGuestsAndBabies, type GuestStatus } from "./seating/floorPlanConfig";

type Filter = "all" | "attending" | "declined" | "pending";
type View = "individuals" | "families";

const STATUS_META: Record<GuestStatus, { label: string; color: string; bg: string }> = {
  attending: { label: "Attending", color: "#8fe3ad", bg: "rgba(143,227,173,0.12)" },
  declined: { label: "Not attending", color: "rgba(224,144,122,0.95)", bg: "rgba(224,144,122,0.12)" },
  pending: { label: "No answer yet", color: "var(--c-muted)", bg: "rgba(0,0,0,0.2)" },
};

function csvEscape(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

export function RsvpsTab() {
  const [rsvps, setRsvps] = useState<Rsvp[] | null>(null);
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("individuals");
  const [search, setSearch] = useState("");

  useEffect(() => {
    getRsvpsAction().then(setRsvps);
    getFamiliesAction().then(setFamilies);
  }, []);

  const guests = useMemo(() => (rsvps && families ? splitGuestsAndBabies(rsvps, families).guests : []), [rsvps, families]);
  const rsvpByFamilyId = useMemo(() => new Map((rsvps || []).map((r) => [r.familyId, r])), [rsvps]);

  if (!rsvps || !families) return <div style={{ color: "var(--c-muted)" }}>Loading…</div>;

  const counts: Record<GuestStatus, number> = { attending: 0, declined: 0, pending: 0 };
  guests.forEach((g) => counts[g.status]++);

  const q = search.trim().toLowerCase();
  const matchesSearch = (name: string, family: string) => !q || name.toLowerCase().includes(q) || family.toLowerCase().includes(q);

  const filteredGuests = guests
    .filter((g) => (filter === "all" ? true : filter === "attending" ? g.status === "attending" : filter === "declined" ? g.status === "declined" : g.status === "pending"))
    .filter((g) => matchesSearch(g.name, g.family));

  const downloadCsv = () => {
    const header = ["Name", "Family", "Status", "Meal choice", "Responded"].map(csvEscape).join(",");
    const rows = filteredGuests.map((g) => {
      const r = rsvpByFamilyId.get(g.familyId);
      return [g.name, g.family, STATUS_META[g.status].label, g.status === "attending" ? g.diet || "" : "", r ? new Date(r.createdAt).toLocaleString() : ""]
        .map(csvEscape)
        .join(",");
    });
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rsvp-guests.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filterChips = (
    <div className="flex gap-2 flex-wrap">
      {(
        [
          ["all", `All (${guests.length})`],
          ["attending", `Attending (${counts.attending})`],
          ["declined", `Not attending (${counts.declined})`],
          ["pending", `No answer yet (${counts.pending})`],
        ] as [Filter, string][]
      ).map(([k, label]) => (
        <button
          key={k}
          onClick={() => setFilter(k)}
          className="cursor-pointer"
          style={{
            padding: "8px 16px",
            borderRadius: 20,
            fontSize: 12,
            border: `1px solid ${filter === k ? "var(--c-gold)" : "var(--c-line)"}`,
            background: filter === k ? "var(--c-gold)" : "transparent",
            color: filter === k ? "#fff" : "var(--c-muted)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // ---------- Families view (grouped, with every member's status shown) ----------

  const familiesView = () => {
    const byFamily = new Map<string, typeof guests>();
    for (const g of filteredGuests) {
      const arr = byFamily.get(g.familyId) || [];
      arr.push(g);
      byFamily.set(g.familyId, arr);
    }
    const entries = [...byFamily.entries()];
    if (entries.length === 0) return <div style={{ color: "var(--c-muted)" }}>No guests in this view.</div>;
    return entries.map(([familyId, members]) => {
      const r = rsvpByFamilyId.get(familyId);
      return (
        <div key={familyId} style={panelStyle}>
          <div className="flex justify-between items-start flex-wrap gap-2">
            <div>
              <div className="font-display" style={{ fontSize: 22, color: "var(--c-ivory)" }}>
                {members[0].family}
              </div>
              <div style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 2 }}>
                {r ? `Responded ${new Date(r.createdAt).toLocaleString()}` : "Has not responded yet"}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2" style={{ marginTop: 14 }}>
            {members.map((g) => {
              const meta = STATUS_META[g.status];
              return (
                <span
                  key={g.key}
                  style={{
                    padding: "6px 12px",
                    background: meta.bg,
                    borderRadius: 20,
                    fontSize: 12,
                    color: "var(--c-ivory)",
                    textDecoration: g.status === "declined" ? "line-through" : "none",
                    opacity: g.status === "pending" ? 0.75 : 1,
                  }}
                >
                  {g.name} <span style={{ color: meta.color }}>· {meta.label}</span>
                  {g.status === "attending" && g.diet && <span style={{ color: "var(--c-muted)" }}> · {g.diet}</span>}
                </span>
              );
            })}
          </div>
          {r && (
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginTop: 14, fontSize: 13 }}>
              <div>
                <span style={{ color: "var(--c-muted)" }}>Song: </span>
                <span style={{ color: "var(--c-ivory)" }}>{r.song}</span>
              </div>
              <div>
                <span style={{ color: "var(--c-muted)" }}>Allergies: </span>
                <span style={{ color: "var(--c-ivory)" }}>{r.allergies}</span>
              </div>
              <div>
                <span style={{ color: "var(--c-muted)" }}>Phone: </span>
                <span style={{ color: "var(--c-ivory)" }}>{r.phone}</span>
              </div>
              <div>
                <span style={{ color: "var(--c-muted)" }}>Email: </span>
                <span style={{ color: "var(--c-ivory)" }}>{r.email}</span>
              </div>
            </div>
          )}
          {r?.message && (
            <div style={{ marginTop: 14, padding: 12, background: "rgba(0,0,0,0.18)", borderRadius: 8, fontSize: 13, color: "var(--c-ivory)", fontStyle: "italic" }}>
              &ldquo;{r.message}&rdquo;
            </div>
          )}
        </div>
      );
    });
  };

  // ---------- Individuals view (one row per guest) ----------

  const individualsView = () => {
    if (filteredGuests.length === 0) return <div style={{ color: "var(--c-muted)" }}>No guests in this view.</div>;
    return filteredGuests.map((g) => {
      const meta = STATUS_META[g.status];
      const r = rsvpByFamilyId.get(g.familyId);
      return (
        <div
          key={g.key}
          className="flex items-center gap-3 flex-wrap"
          style={{ padding: "12px 16px", background: "var(--c-panel)", border: "1px solid var(--c-line)", borderRadius: 8 }}
        >
          {g.status === "attending" && (
            <span title={g.diet || ""} style={{ width: 9, height: 9, borderRadius: "50%", background: dietColor(g.diet), flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: "var(--c-ivory)", fontSize: 15 }}>{g.name}</div>
            <div style={{ color: "var(--c-muted)", fontSize: 12 }}>{g.family}</div>
          </div>
          {g.status === "attending" && g.diet && (
            <span style={{ fontSize: 12, color: "var(--c-muted)" }}>{g.diet}</span>
          )}
          {r && g.status !== "pending" && (
            <span style={{ fontSize: 11, color: "var(--c-muted)" }}>{new Date(r.createdAt).toLocaleDateString()}</span>
          )}
          <span style={{ padding: "5px 12px", borderRadius: 14, fontSize: 11, fontWeight: 600, color: meta.color, background: meta.bg, whiteSpace: "nowrap" }}>
            {STATUS_META[g.status].label}
          </span>
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        {filterChips}
        <div className="flex gap-2 items-center">
          <button
            onClick={downloadCsv}
            className="cursor-pointer"
            style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, border: "1px solid var(--c-line)", background: "transparent", color: "var(--c-champ)" }}
          >
            Download CSV
          </button>
          <div className="flex" style={{ border: "1px solid var(--c-line)", borderRadius: 8, overflow: "hidden" }}>
            {(
              [
                ["individuals", "Individuals"],
                ["families", "By family"],
              ] as [View, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className="cursor-pointer"
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  border: "none",
                  background: view === k ? "var(--c-gold)" : "transparent",
                  color: view === k ? "#fff" : "var(--c-muted)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a guest or family…" style={inputStyle} />
      <div className="flex flex-col gap-2">{view === "individuals" ? individualsView() : familiesView()}</div>
    </div>
  );
}
