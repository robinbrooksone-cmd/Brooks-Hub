"use client";

import { useEffect, useState } from "react";
import { getFamiliesAction, getRsvpsAction } from "@/app/actions";
import type { Family } from "@/lib/roster";
import type { Rsvp } from "@/lib/types";
import { panelStyle } from "./AdminDashboard";
import { splitGuestsAndBabies } from "./seating/floorPlanConfig";

export function OverviewTab({ onJump }: { onJump: (tab: string) => void }) {
  const [rsvps, setRsvps] = useState<Rsvp[] | null>(null);
  const [families, setFamilies] = useState<Family[] | null>(null);

  useEffect(() => {
    getRsvpsAction().then(setRsvps);
    getFamiliesAction().then(setFamilies);
  }, []);

  const { guests, babies } = rsvps && families ? splitGuestsAndBabies(rsvps, families) : { guests: [], babies: [] };
  const counts = { attending: 0, declined: 0, pending: 0 };
  guests.forEach((g) => counts[g.status]++);
  const babiesComing = babies.filter((b) => b.status === "attending").length;
  const ready = !!rsvps && !!families;
  const stats = [
    { k: "Total Guests", v: ready ? guests.length : "…", sub: babies.length ? `people invited · plus ${babies.length} ${babies.length === 1 ? "baby" : "babies"}` : "people invited" },
    { k: "Attending", v: ready ? counts.attending : "…", sub: babiesComing ? `guests confirmed · plus ${babiesComing} ${babiesComing === 1 ? "baby" : "babies"}` : "guests confirmed" },
    { k: "Not Attending", v: ready ? counts.declined : "…", sub: "guests declined" },
    { k: "Awaiting Reply", v: ready ? counts.pending : "…", sub: "guests still to answer" },
    { k: "Songs Requested", v: rsvps?.filter((r) => r.song !== "—").length ?? 0, sub: "song requests" },
    { k: "Messages", v: rsvps?.filter((r) => r.message?.trim()).length ?? 0, sub: "notes for the couple" },
  ];

  const jumps = [
    ["rsvps", "See all RSVPs"],
    ["songs", "Songs & messages"],
    ["planner", "To-Do & payments"],
    ["seating", "Plan the seating"],
    ["brookway", "Manage BrooksWay"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        {stats.map((s) => (
          <div key={s.k} style={panelStyle}>
            <div className="text-[11px] uppercase" style={{ letterSpacing: "0.2em", color: "var(--c-gold)" }}>
              {s.k}
            </div>
            <div className="font-display" style={{ fontSize: 34, color: "var(--c-ivory)", marginTop: 8 }}>
              {s.v}
            </div>
            <div style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {jumps.map(([k, label]) => (
          <button
            key={k}
            onClick={() => onJump(k)}
            className="cursor-pointer"
            style={{ padding: "12px 20px", background: "var(--c-panel)", border: "1px solid var(--c-line)", borderRadius: 8, color: "var(--c-ivory)", fontSize: 13 }}
          >
            {label} →
          </button>
        ))}
      </div>
    </div>
  );
}
