"use client";

import { inputStyle } from "../AdminDashboard";
import { dietColor, type Guest, type GuestStatus } from "./floorPlanConfig";

const STATUS_LABEL: Record<GuestStatus, string> = { attending: "Attending", declined: "Not attending", pending: "Not responded" };

export function GuestSidebar({
  guests,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  seatedAt,
  hoveredFamilyId,
  setHoveredFamilyId,
  onGuestPointerDown,
}: {
  guests: Guest[];
  search: string;
  setSearch: (v: string) => void;
  statusFilter: GuestStatus;
  setStatusFilter: (v: GuestStatus) => void;
  seatedAt: Record<string, string>;
  hoveredFamilyId: string | null;
  setHoveredFamilyId: (id: string | null) => void;
  onGuestPointerDown: (guest: Guest, e: React.PointerEvent) => void;
}) {
  const q = search.trim().toLowerCase();
  const filtered = guests
    .filter((g) => g.status === statusFilter)
    .filter((g) => !q || g.name.toLowerCase().includes(q) || g.family.toLowerCase().includes(q));

  const counts = { attending: 0, declined: 0, pending: 0 } as Record<GuestStatus, number>;
  guests.forEach((g) => counts[g.status]++);

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search guests…"
        style={{ ...inputStyle, fontSize: 13, marginBottom: 8 }}
      />
      <div className="flex gap-1.5" style={{ marginBottom: 10 }}>
        {(["attending", "declined", "pending"] as GuestStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="cursor-pointer"
            style={{
              flex: 1,
              padding: "6px 4px",
              borderRadius: 6,
              fontSize: 10,
              letterSpacing: "0.03em",
              border: `1px solid ${statusFilter === s ? "var(--c-gold)" : "var(--c-line)"}`,
              background: statusFilter === s ? "var(--c-gold)" : "transparent",
              color: statusFilter === s ? "#fff" : "var(--c-muted)",
            }}
          >
            {STATUS_LABEL[s]} ({counts[s]})
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5" style={{ overflowY: "auto", flex: 1, paddingRight: 2 }}>
        {filtered.length === 0 && <div style={{ color: "var(--c-muted)", fontSize: 12, padding: "8px 0" }}>No guests in this view.</div>}
        {filtered.map((g) => {
          const draggable = g.status === "attending";
          const seated = seatedAt[g.key];
          const dimmed = hoveredFamilyId && hoveredFamilyId !== g.familyId;
          return (
            <div
              key={g.key}
              onPointerDown={draggable ? (e) => onGuestPointerDown(g, e) : undefined}
              onPointerEnter={() => setHoveredFamilyId(g.familyId)}
              onPointerLeave={() => setHoveredFamilyId(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 6,
                background: hoveredFamilyId === g.familyId ? "rgba(179,136,78,0.16)" : "rgba(0,0,0,0.18)",
                border: `1px solid ${hoveredFamilyId === g.familyId ? "var(--c-gold)" : "transparent"}`,
                opacity: dimmed ? 0.45 : 1,
                cursor: draggable ? "grab" : "default",
                touchAction: draggable ? "none" : undefined,
                transition: "opacity .12s, background .12s",
              }}
            >
              {draggable && (
                <span
                  title={g.diet || ""}
                  style={{ width: 9, height: 9, borderRadius: "50%", background: dietColor(g.diet), flexShrink: 0 }}
                />
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: "var(--c-ivory)", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</div>
                <div style={{ color: "var(--c-muted)", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.family}</div>
              </div>
              {seated && (
                <span style={{ fontSize: 10, color: "#8fe3ad", background: "rgba(143,227,173,0.12)", padding: "3px 7px", borderRadius: 10, whiteSpace: "nowrap" }}>
                  {seated}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
