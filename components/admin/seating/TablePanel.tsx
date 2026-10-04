"use client";

import { useState } from "react";
import type { FloorItem, TableShape } from "@/lib/types";
import { btnGhost, btnGold, inputStyle } from "../AdminDashboard";
import { dietColor, type Guest } from "./floorPlanConfig";

const SWATCHES = ["#b3884e", "#cbb190", "#8fe3ad", "#7cc4e0", "#c98fe3", "#e0907a", "#e0c26f", "#4a3527"];

export function TablePanel({
  item,
  guests,
  onClose,
  onUpdate,
  onRemoveSeat,
  onReorderSeats,
  onDelete,
  onDuplicate,
}: {
  item: FloorItem;
  guests: Guest[];
  onClose: () => void;
  onUpdate: (patch: Partial<FloorItem>) => void;
  onRemoveSeat: (guestKey: string) => void;
  onReorderSeats: (seats: string[]) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(item.name);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== item.name) onUpdate({ name: trimmed });
    else setNameDraft(item.name);
  };
  const guestByKey = new Map(guests.map((g) => [g.key, g]));
  const seats = item.seats ?? [];
  const cap = item.cap ?? 0;
  const remaining = Math.max(0, cap - seats.length);

  return (
    <div
      className="fixed"
      style={{ inset: 0, zIndex: 40, pointerEvents: "none" }}
    >
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(20,14,9,0.45)", pointerEvents: "auto" }}
      />
      <div
        className="absolute flex flex-col"
        style={{
          right: 0,
          top: 0,
          bottom: 0,
          width: "min(380px, 92vw)",
          background: "#2e2019",
          borderLeft: "1px solid var(--c-line)",
          padding: 22,
          overflowY: "auto",
          pointerEvents: "auto",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.4)",
        }}
      >
        <div className="flex justify-between items-start" style={{ marginBottom: 18 }}>
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitName();
                (e.target as HTMLInputElement).blur();
              }
            }}
            style={{ ...inputStyle, fontSize: 18, fontWeight: 600, flex: 1, marginRight: 10 }}
          />
          <button onClick={onClose} className="cursor-pointer" style={{ background: "transparent", border: "none", color: "var(--c-muted)", fontSize: 20 }}>
            ✕
          </button>
        </div>

        <div className="flex gap-2" style={{ marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "var(--c-muted)" }}>Capacity</label>
            <input
              type="number"
              min={1}
              value={cap}
              onChange={(e) => onUpdate({ cap: Math.max(1, Number(e.target.value)) })}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "var(--c-muted)" }}>Shape</label>
            <select value={item.shape} onChange={(e) => onUpdate({ shape: e.target.value as TableShape })} style={{ ...inputStyle, width: "100%" }}>
              <option value="round">Round</option>
              <option value="rect">Rectangle</option>
              <option value="square">Square</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: "var(--c-muted)" }}>Colour</label>
          <div className="flex gap-2" style={{ marginTop: 6 }}>
            {SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => onUpdate({ color: c })}
                className="cursor-pointer"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: c,
                  border: item.color === c ? "2px solid #fff" : "1px solid rgba(0,0,0,0.3)",
                }}
              />
            ))}
            <input
              type="color"
              value={item.color}
              onChange={(e) => onUpdate({ color: e.target.value })}
              style={{ width: 24, height: 24, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
            />
          </div>
        </div>

        <div
          className="flex justify-between items-center"
          style={{ marginBottom: 12, padding: "10px 12px", background: "rgba(0,0,0,0.2)", borderRadius: 8 }}
        >
          <span style={{ fontSize: 13, color: "var(--c-ivory)" }}>
            {seats.length} / {cap} seated
          </span>
          <span style={{ fontSize: 12, color: remaining > 0 ? "#8fe3ad" : "var(--c-muted)" }}>{remaining} seat{remaining === 1 ? "" : "s"} left</span>
        </div>

        <div style={{ fontSize: 11, color: "var(--c-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Seated guests — drag ⋮⋮ to reorder
        </div>
        <div className="flex flex-col gap-1.5" style={{ marginBottom: 18 }}>
          {seats.map((key, i) => {
            const g = guestByKey.get(key);
            return (
              <div
                key={key}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex === null || dragIndex === i) return;
                  const next = [...seats];
                  const [moved] = next.splice(dragIndex, 1);
                  next.splice(i, 0, moved);
                  onReorderSeats(next);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className="flex items-center gap-2"
                style={{ padding: "8px 10px", background: "rgba(0,0,0,0.18)", borderRadius: 6, cursor: "grab" }}
              >
                <span style={{ color: "var(--c-muted)", fontSize: 12 }}>⋮⋮</span>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: dietColor(g?.diet), flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--c-ivory)", fontSize: 13 }}>{g?.name || key}</div>
                  <div style={{ color: "var(--c-muted)", fontSize: 11 }}>{g?.family}</div>
                </div>
                <button onClick={() => onRemoveSeat(key)} className="cursor-pointer" style={{ background: "transparent", border: "none", color: "rgba(224,144,122,0.8)" }}>
                  ✕
                </button>
              </div>
            );
          })}
          {seats.length === 0 && <div style={{ color: "var(--c-muted)", fontSize: 12 }}>Drag a guest from the sidebar onto this table.</div>}
        </div>

        <div className="flex gap-2">
          <button style={btnGhost} onClick={onDuplicate}>
            Duplicate
          </button>
          <button style={{ ...btnGold, background: "rgba(224,144,122,0.85)" }} onClick={onDelete}>
            Delete table
          </button>
        </div>
      </div>
    </div>
  );
}
