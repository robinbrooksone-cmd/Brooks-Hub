"use client";

import { useState } from "react";
import type { FloorItemType } from "@/lib/types";
import { ADD_MENU } from "./floorPlanConfig";

export function Toolbar({
  onAdd,
  zoom,
  onZoomChange,
  onZoomBy,
  snap,
  onToggleSnap,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAutoSeat,
  onPrint,
  saveStatus,
}: {
  onAdd: (type: FloorItemType) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  onZoomBy: (delta: number) => void;
  snap: boolean;
  onToggleSnap: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAutoSeat: () => void;
  onPrint: () => void;
  saveStatus: "saved" | "saving";
}) {
  const [addOpen, setAddOpen] = useState(false);

  const btn: React.CSSProperties = {
    padding: "8px 12px",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid var(--c-line)",
    borderRadius: 6,
    color: "var(--c-ivory)",
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  const btnDisabled: React.CSSProperties = { ...btn, opacity: 0.35, cursor: "default" };

  return (
    <div
      className="flex items-center gap-2 flex-wrap"
      style={{
        padding: "10px 12px",
        background: "rgba(20,14,9,0.85)",
        border: "1px solid var(--c-line)",
        borderRadius: 10,
        backdropFilter: "blur(6px)",
        marginBottom: 10,
      }}
    >
      <div className="relative">
        <button style={{ ...btn, background: "var(--c-gold)", border: "none", fontWeight: 600 }} onClick={() => setAddOpen((v) => !v)}>
          + Add ▾
        </button>
        {addOpen && (
          <>
            <div className="fixed" style={{ inset: 0, zIndex: 49 }} onClick={() => setAddOpen(false)} />
            <div
              className="absolute flex flex-col"
              style={{
                top: "110%",
                left: 0,
                zIndex: 50,
                background: "#2e2019",
                border: "1px solid var(--c-line)",
                borderRadius: 8,
                padding: 6,
                minWidth: 190,
                boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
                maxHeight: 340,
                overflowY: "auto",
              }}
            >
              {ADD_MENU.map((m) => (
                <button
                  key={m.type}
                  onClick={() => {
                    onAdd(m.type);
                    setAddOpen(false);
                  }}
                  className="flex items-center gap-2 cursor-pointer text-left"
                  style={{ padding: "8px 10px", background: "transparent", border: "none", color: "var(--c-ivory)", fontSize: 13, borderRadius: 5 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(179,136,78,0.15)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ width: 1, height: 22, background: "var(--c-line)" }} />

      <button style={canUndo ? btn : btnDisabled} disabled={!canUndo} onClick={onUndo} title="Undo (Ctrl+Z)">
        ↶ Undo
      </button>
      <button style={canRedo ? btn : btnDisabled} disabled={!canRedo} onClick={onRedo} title="Redo (Ctrl+Shift+Z)">
        ↷ Redo
      </button>

      <div style={{ width: 1, height: 22, background: "var(--c-line)" }} />

      <button style={btn} onClick={() => onZoomBy(-0.1)}>
        −
      </button>
      <span style={{ fontSize: 12, color: "var(--c-muted)", minWidth: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
      <button style={btn} onClick={() => onZoomBy(0.1)}>
        +
      </button>
      <button style={btn} onClick={() => onZoomChange(1)}>
        Reset
      </button>

      <div style={{ width: 1, height: 22, background: "var(--c-line)" }} />

      <button style={{ ...btn, background: snap ? "rgba(179,136,78,0.25)" : btn.background, borderColor: snap ? "var(--c-gold)" : "var(--c-line)" }} onClick={onToggleSnap}>
        {snap ? "✓ Snap to grid" : "Snap to grid"}
      </button>

      <button style={btn} onClick={onAutoSeat} title="Auto-seat remaining confirmed guests, keeping families together where possible">
        ✨ Auto-seat
      </button>

      <button style={btn} onClick={onPrint}>
        🖨️ Print
      </button>

      <span style={{ marginLeft: "auto", fontSize: 11, color: saveStatus === "saving" ? "var(--c-gold)" : "#8fe3ad" }}>
        {saveStatus === "saving" ? "Saving…" : "Saved"}
      </span>
    </div>
  );
}
