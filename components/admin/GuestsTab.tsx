"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addGuestAction,
  getFamiliesAction,
  getRsvpsAction,
  removeFamilyAction,
  removeMemberAction,
  setGuestIsBabyAction,
  toggleFamilySideAction,
} from "@/app/actions";
import type { Family } from "@/lib/roster";
import type { Rsvp } from "@/lib/types";
import { btnGhost, btnGold, inputStyle, panelStyle } from "./AdminDashboard";
import { buildGuestPool, type GuestStatus } from "./seating/floorPlanConfig";

type View = "individuals" | "households";

const STATUS_META: Record<GuestStatus, { label: string; color: string; bg: string }> = {
  attending: { label: "Attending", color: "#8fe3ad", bg: "rgba(143,227,173,0.12)" },
  declined: { label: "Not attending", color: "rgba(224,144,122,0.95)", bg: "rgba(224,144,122,0.12)" },
  pending: { label: "Awaiting reply", color: "var(--c-muted)", bg: "rgba(0,0,0,0.22)" },
};

const NEW_HOUSEHOLD = "__new__";

export function GuestsTab() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("individuals");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const [newName, setNewName] = useState("");
  const [newHousehold, setNewHousehold] = useState<string>(NEW_HOUSEHOLD);
  const [newSide, setNewSide] = useState<"Bride" | "Groom">("Bride");
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    getFamiliesAction().then(setFamilies);
    getRsvpsAction().then(setRsvps);
  };

  useEffect(() => {
    refresh();
  }, []);

  const guests = useMemo(() => buildGuestPool(rsvps, families), [rsvps, families]);
  const statusByKey = useMemo(() => new Map(guests.map((g) => [g.key, g.status])), [guests]);
  const babyKeys = useMemo(() => new Set(guests.filter((g) => g.isBaby).map((g) => g.key)), [guests]);

  const q = search.trim().toLowerCase();
  const totalGuests = families.reduce((n, f) => n + f.members.filter((m) => !m.isBaby).length, 0);
  const totalBabies = families.reduce((n, f) => n + f.members.filter((m) => m.isBaby).length, 0);

  const addGuest = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      await addGuestAction(name, newSide, newHousehold === NEW_HOUSEHOLD ? undefined : newHousehold);
      setNewName("");
      refresh();
    } finally {
      setAdding(false);
    }
  };

  const rows = families
    .flatMap((f) => f.members.map((m) => ({ familyId: f.id, family: f, member: m })))
    .filter(({ family, member }) => !q || member.name.toLowerCase().includes(q) || family.name.toLowerCase().includes(q));

  const filteredFamilies = q
    ? families.filter((f) => f.name.toLowerCase().includes(q) || f.members.some((m) => m.name.toLowerCase().includes(q)))
    : families;

  return (
    <div className="flex flex-col gap-5">
      <div style={panelStyle}>
        <h3 className="font-display" style={{ fontSize: 20, color: "var(--c-ivory)", margin: "0 0 4px" }}>
          Add a guest
        </h3>
        <p style={{ color: "var(--c-muted)", fontSize: 12, margin: "0 0 14px" }}>
          Every guest is a person. Add them to an existing household so they can RSVP together, or leave it on &ldquo;New household&rdquo; to
          give them their own invitation.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGuest()}
            placeholder="Guest's full name"
            style={{ ...inputStyle, flex: 2, minWidth: 200 }}
          />
          <select value={newHousehold} onChange={(e) => setNewHousehold(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 180 }}>
            <option value={NEW_HOUSEHOLD}>New household (their own invite)</option>
            {[...families]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  Add to: {f.name}
                </option>
              ))}
          </select>
          {newHousehold === NEW_HOUSEHOLD && (
            <select value={newSide} onChange={(e) => setNewSide(e.target.value as "Bride" | "Groom")} style={{ ...inputStyle, width: 130 }}>
              <option value="Bride">Bride&apos;s side</option>
              <option value="Groom">Groom&apos;s side</option>
            </select>
          )}
          <button style={{ ...btnGold, opacity: adding ? 0.6 : 1 }} onClick={addGuest} disabled={adding}>
            {adding ? "Adding…" : "Add guest"}
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div style={{ fontSize: 13, color: "var(--c-ivory)" }}>
          {totalGuests} guests{" "}
          <span style={{ color: "var(--c-muted)" }}>
            · {families.length} households{totalBabies > 0 ? ` · ${totalBabies} ${totalBabies === 1 ? "baby" : "babies"} (not counted)` : ""}
          </span>
        </div>
        <div className="flex" style={{ border: "1px solid var(--c-line)", borderRadius: 8, overflow: "hidden" }}>
          {(
            [
              ["individuals", "Individuals"],
              ["households", "By household"],
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

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guests…" style={inputStyle} />

      {view === "individuals" ? (
        <div className="flex flex-col gap-2">
          {rows.length === 0 && <div style={{ color: "var(--c-muted)", fontSize: 13 }}>No guests match that search.</div>}
          {rows.map(({ familyId, family, member }) => {
            const status = statusByKey.get(`${familyId}:${member.id}`) ?? "pending";
            const meta = STATUS_META[status];
            const isBaby = babyKeys.has(`${familyId}:${member.id}`);
            return (
              <div
                key={`${familyId}:${member.id}`}
                className="flex items-center gap-3 flex-wrap"
                style={{ padding: "12px 16px", background: "var(--c-panel)", border: "1px solid var(--c-line)", borderRadius: 8 }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: "var(--c-ivory)", fontSize: 15 }}>
                    {isBaby && <span style={{ marginRight: 6 }}>👶</span>}
                    {member.name}
                  </div>
                  <div style={{ color: "var(--c-muted)", fontSize: 12 }}>
                    {family.name} · {family.side}&apos;s side
                    {isBaby && <span style={{ color: "var(--c-gold)" }}> · baby, not counted as a guest</span>}
                  </div>
                </div>
                <span style={{ padding: "5px 12px", borderRadius: 14, fontSize: 11, fontWeight: 600, color: meta.color, background: meta.bg, whiteSpace: "nowrap" }}>
                  {meta.label}
                </span>
                <button
                  onClick={async () => {
                    await setGuestIsBabyAction(familyId, member.id, !isBaby);
                    refresh();
                  }}
                  className="cursor-pointer"
                  title={isBaby ? "Count this person as a guest again (gets a seat)" : "Mark as a baby — no seat, not counted as a guest"}
                  style={{
                    background: isBaby ? "rgba(203,177,144,0.2)" : "transparent",
                    border: `1px solid ${isBaby ? "var(--c-gold)" : "var(--c-line)"}`,
                    borderRadius: 6,
                    color: isBaby ? "var(--c-gold)" : "var(--c-muted)",
                    fontSize: 11,
                    padding: "5px 10px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isBaby ? "👶 Baby" : "Mark baby"}
                </button>
                <button
                  onClick={async () => {
                    await removeMemberAction(familyId, member.id);
                    refresh();
                  }}
                  className="cursor-pointer"
                  title="Remove this guest"
                  style={{ background: "transparent", border: "none", color: "rgba(248,243,236,0.4)", fontSize: 15 }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
          {filteredFamilies.map((f) => (
            <div key={f.id} style={panelStyle}>
              <div className="flex justify-between items-center">
                <div className="font-display" style={{ fontSize: 19, color: "var(--c-ivory)" }}>
                  {f.name}
                </div>
                <button
                  onClick={async () => {
                    await toggleFamilySideAction(f.id);
                    refresh();
                  }}
                  className="cursor-pointer"
                  style={{ ...btnGhost, padding: "4px 10px", fontSize: 10 }}
                >
                  {f.side}&apos;s side
                </button>
              </div>
              <div className="flex flex-col gap-1.5" style={{ marginTop: 12 }}>
                {f.members.map((m) => {
                  const status = statusByKey.get(`${f.id}:${m.id}`) ?? "pending";
                  const meta = STATUS_META[status];
                  return (
                    <div key={m.id} className="flex justify-between items-center gap-2" style={{ fontSize: 13, color: "var(--c-ivory)" }}>
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                      <span className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: meta.color }}>{meta.label}</span>
                        <button
                          onClick={async () => {
                            await removeMemberAction(f.id, m.id);
                            refresh();
                          }}
                          className="cursor-pointer"
                          style={{ background: "transparent", border: "none", color: "rgba(248,243,236,0.4)" }}
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2" style={{ marginTop: 12 }}>
                <input
                  value={drafts[f.id] || ""}
                  onChange={(e) => setDrafts((s) => ({ ...s, [f.id]: e.target.value }))}
                  onKeyDown={async (e) => {
                    if (e.key !== "Enter") return;
                    const draft = (drafts[f.id] || "").trim();
                    if (!draft) return;
                    await addGuestAction(draft, f.side, f.id);
                    setDrafts((s) => ({ ...s, [f.id]: "" }));
                    refresh();
                  }}
                  placeholder="Add guest to this household"
                  style={{ ...inputStyle, flex: 1, fontSize: 12, padding: "8px 10px" }}
                />
                <button
                  style={{ ...btnGhost, padding: "8px 12px", fontSize: 11 }}
                  onClick={async () => {
                    const draft = (drafts[f.id] || "").trim();
                    if (!draft) return;
                    await addGuestAction(draft, f.side, f.id);
                    setDrafts((s) => ({ ...s, [f.id]: "" }));
                    refresh();
                  }}
                >
                  Add
                </button>
              </div>
              <button
                onClick={async () => {
                  await removeFamilyAction(f.id);
                  refresh();
                }}
                className="cursor-pointer"
                style={{ marginTop: 10, background: "transparent", border: "none", color: "rgba(224,144,122,0.8)", fontSize: 11 }}
              >
                Remove household
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
