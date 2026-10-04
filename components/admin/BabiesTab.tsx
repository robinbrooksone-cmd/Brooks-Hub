"use client";

import { useEffect, useMemo, useState } from "react";
import { addGuestAction, getFamiliesAction, getRsvpsAction, setGuestIsBabyAction } from "@/app/actions";
import type { Family } from "@/lib/roster";
import type { Rsvp } from "@/lib/types";
import { btnGold, inputStyle, panelStyle } from "./AdminDashboard";
import { splitGuestsAndBabies, type GuestStatus } from "./seating/floorPlanConfig";

const STATUS_META: Record<GuestStatus, { label: string; color: string; bg: string }> = {
  attending: { label: "Coming", color: "#8fe3ad", bg: "rgba(143,227,173,0.12)" },
  declined: { label: "Not coming", color: "rgba(224,144,122,0.95)", bg: "rgba(224,144,122,0.12)" },
  pending: { label: "Awaiting reply", color: "var(--c-muted)", bg: "rgba(0,0,0,0.22)" },
};

export function BabiesTab() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [householdId, setHouseholdId] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    Promise.all([getFamiliesAction(), getRsvpsAction()]).then(([f, r]) => {
      setFamilies(f);
      setRsvps(r);
      setLoaded(true);
    });

  useEffect(() => {
    refresh();
  }, []);

  const { babies } = useMemo(() => splitGuestsAndBabies(rsvps, families), [rsvps, families]);
  const counts = { attending: 0, declined: 0, pending: 0 } as Record<GuestStatus, number>;
  babies.forEach((b) => counts[b.status]++);

  const addBaby = async () => {
    const n = name.trim();
    if (!n || !householdId || busy) return;
    setBusy(true);
    try {
      const fam = families.find((f) => f.id === householdId);
      await addGuestAction(n, fam?.side ?? "Bride", householdId, true);
      setName("");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <div style={{ color: "var(--c-muted)" }}>Loading…</div>;

  return (
    <div className="flex flex-col gap-5">
      <p style={{ color: "var(--c-muted)", fontSize: 13, margin: 0 }}>
        Babies attend and can RSVP with their household, but aren&apos;t counted as guests — no seat, no place setting, and they don&apos;t
        appear in the seating planner. Add a baby to the household they&apos;ll be RSVP&apos;d with so their parents see them on the RSVP form.
      </p>

      <div style={panelStyle}>
        <h3 className="font-display" style={{ fontSize: 20, color: "var(--c-ivory)", margin: "0 0 12px" }}>
          Add a baby
        </h3>
        <div className="flex gap-2 flex-wrap">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addBaby()}
            placeholder="Baby's name"
            style={{ ...inputStyle, flex: 2, minWidth: 180 }}
          />
          <select value={householdId} onChange={(e) => setHouseholdId(e.target.value)} style={{ ...inputStyle, flex: 2, minWidth: 200 }}>
            <option value="">Choose their household…</option>
            {[...families]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
          <button style={{ ...btnGold, opacity: !name.trim() || !householdId || busy ? 0.5 : 1 }} onClick={addBaby} disabled={busy}>
            {busy ? "Adding…" : "Add baby"}
          </button>
        </div>
        {!householdId && name.trim() && (
          <p style={{ color: "rgba(224,144,122,0.9)", fontSize: 12, marginTop: 10 }}>Pick the household this baby belongs to.</p>
        )}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        {[
          { k: "Babies", v: babies.length, sub: "on the list" },
          { k: "Coming", v: counts.attending, sub: "confirmed" },
          { k: "Not Coming", v: counts.declined, sub: "declined" },
          { k: "Awaiting Reply", v: counts.pending, sub: "still to answer" },
        ].map((s) => (
          <div key={s.k} style={panelStyle}>
            <div className="text-[11px] uppercase" style={{ letterSpacing: "0.2em", color: "var(--c-gold)" }}>
              {s.k}
            </div>
            <div className="font-display" style={{ fontSize: 30, color: "var(--c-ivory)", marginTop: 6 }}>
              {s.v}
            </div>
            <div style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {babies.length === 0 && (
          <div style={{ color: "var(--c-muted)", fontSize: 13 }}>
            No babies on the list yet. Add one above, or mark an existing guest as a baby from the Guest List tab.
          </div>
        )}
        {babies.map((b) => {
          const meta = STATUS_META[b.status];
          return (
            <div
              key={b.key}
              className="flex items-center gap-3 flex-wrap"
              style={{ padding: "12px 16px", background: "var(--c-panel)", border: "1px solid var(--c-line)", borderRadius: 8 }}
            >
              <span style={{ fontSize: 15 }}>👶</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: "var(--c-ivory)", fontSize: 15 }}>{b.name}</div>
                <div style={{ color: "var(--c-muted)", fontSize: 12 }}>{b.family}</div>
              </div>
              <span style={{ padding: "5px 12px", borderRadius: 14, fontSize: 11, fontWeight: 600, color: meta.color, background: meta.bg, whiteSpace: "nowrap" }}>
                {meta.label}
              </span>
              <button
                onClick={async () => {
                  const [famId, memberId] = b.key.split(":");
                  await setGuestIsBabyAction(famId, memberId, false);
                  refresh();
                }}
                className="cursor-pointer"
                title="Move back to the main guest list (counts as a guest, gets a seat)"
                style={{ background: "transparent", border: "1px solid var(--c-line)", borderRadius: 6, color: "var(--c-champ)", fontSize: 11, padding: "6px 10px" }}
              >
                Not a baby
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
