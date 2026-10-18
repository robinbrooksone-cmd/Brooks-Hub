"use client";

import { useState } from "react";
import type { FloorItemType, SeatingBackup } from "@/lib/types";
import { ADD_MENU } from "./floorPlanConfig";

const menuStyle: React.CSSProperties = {
  top: "calc(100% + 6px)",
  zIndex: 50,
  background: "#2a1d16",
  border: "1px solid rgba(203,177,144,0.22)",
  borderRadius: 10,
  padding: 6,
  minWidth: 220,
  boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
  maxHeight: 360,
  overflowY: "auto",
};

function MenuRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 cursor-pointer text-left font-body"
      style={{ padding: "9px 11px", background: "transparent", border: "none", color: "var(--c-ivory)", fontSize: 13, borderRadius: 6 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(179,136,78,0.16)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

export function Toolbar({
  onAdd,
  layoutLocked,
  onToggleLayoutLock,
  onFit,
  onArrange,
  backups,
  onRestore,
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
  layoutLocked: boolean;
  onToggleLayoutLock: () => void;
  onFit: () => void;
  onArrange: () => void;
  backups: SeatingBackup[];
  onRestore: (index: number) => void;
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
  const [restoreOpen, setRestoreOpen] = useState(false);

  const btn: React.CSSProperties = {
    height: 34,
    padding: "0 13px",
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 7,
    color: "var(--c-ivory)",
    fontSize: 12.5,
    letterSpacing: "0.02em",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  const active: React.CSSProperties = { ...btn, background: "rgba(179,136,78,0.2)", borderColor: "rgba(179,136,78,0.55)", color: "#f3e3c8" };
  const disabled: React.CSSProperties = { ...btn, opacity: 0.35, cursor: "default" };
  const group: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 2,
    padding: 3,
    background: "rgba(0,0,0,0.22)",
    border: "1px solid rgba(203,177,144,0.14)",
    borderRadius: 10,
  };
  const hover = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!e.currentTarget.disabled && !e.currentTarget.dataset.active) e.currentTarget.style.background = "rgba(248,243,236,0.06)";
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!e.currentTarget.dataset.active) e.currentTarget.style.background = "transparent";
    },
  };
  const time = (at: number) => new Date(at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className="flex items-center gap-2 flex-wrap font-body"
      style={{
        padding: 8,
        background: "linear-gradient(180deg, rgba(46,32,25,0.95), rgba(30,21,16,0.95))",
        border: "1px solid rgba(203,177,144,0.18)",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        marginBottom: 12,
      }}
    >
      <div className="relative">
        <button
          style={{ ...btn, background: "linear-gradient(180deg, #c49a5e, #a77c43)", color: "#fff", fontWeight: 600, boxShadow: "0 2px 8px rgba(179,136,78,0.35)" }}
          onClick={() => setAddOpen((v) => !v)}
        >
          + Add ▾
        </button>
        {addOpen && (
          <>
            <div className="fixed" style={{ inset: 0, zIndex: 49 }} onClick={() => setAddOpen(false)} />
            <div className="absolute flex flex-col" style={{ ...menuStyle, left: 0 }}>
              {ADD_MENU.map((m) => (
                <MenuRow
                  key={m.type}
                  onClick={() => {
                    onAdd(m.type);
                    setAddOpen(false);
                  }}
                >
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </MenuRow>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={group}>
        <button style={canUndo ? btn : disabled} disabled={!canUndo} onClick={onUndo} title="Undo (Ctrl+Z)" {...hover}>
          ↶ Undo
        </button>
        <button style={canRedo ? btn : disabled} disabled={!canRedo} onClick={onRedo} title="Redo (Ctrl+Shift+Z)" {...hover}>
          ↷ Redo
        </button>
        <div className="relative">
          <button
            style={backups.length ? btn : disabled}
            disabled={!backups.length}
            onClick={() => setRestoreOpen((v) => !v)}
            title="Go back to a layout saved before a table was deleted or the tables were rearranged"
            {...hover}
          >
            ⟲ Restore ▾
          </button>
          {restoreOpen && (
            <>
              <div className="fixed" style={{ inset: 0, zIndex: 49 }} onClick={() => setRestoreOpen(false)} />
              <div className="absolute flex flex-col" style={{ ...menuStyle, left: 0, minWidth: 260 }}>
                <div style={{ padding: "6px 11px 8px", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--c-muted)" }}>
                  Saved layouts
                </div>
                {backups.map((b, i) => (
                  <MenuRow
                    key={b.at + ":" + i}
                    onClick={() => {
                      setRestoreOpen(false);
                      onRestore(i);
                    }}
                  >
                    <span className="flex flex-col">
                      <span>{b.label}</span>
                      <span style={{ fontSize: 11, color: "var(--c-muted)" }}>
                        {time(b.at)} · {b.items.filter((it) => it.seats).length} tables
                      </span>
                    </span>
                  </MenuRow>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={group}>
        <button
          style={layoutLocked ? active : btn}
          data-active={layoutLocked ? "1" : undefined}
          onClick={onToggleLayoutLock}
          title={layoutLocked ? "Tables are locked in place. Click to move them again." : "Tables can be dragged. Click to lock them in place."}
          {...hover}
        >
          {layoutLocked ? "🔒 Locked · Unlock" : "🔓 Lock tables"}
        </button>
        <button
          style={layoutLocked ? disabled : btn}
          disabled={layoutLocked}
          onClick={onArrange}
          title="Line the tables up in rows by number, bridal table on top, dance floor and bar to the side"
          {...hover}
        >
          ▦ Arrange in rows
        </button>
        <button style={btn} onClick={onFit} title="Fit the whole floor plan in view" {...hover}>
          ⤢ Fit
        </button>
        <button style={snap ? active : btn} data-active={snap ? "1" : undefined} onClick={onToggleSnap} title="Snap tables to the grid while dragging" {...hover}>
          {snap ? "✓ Snap" : "Snap"}
        </button>
      </div>

      <div style={group}>
        <button style={btn} onClick={onAutoSeat} title="Auto-seat remaining confirmed guests, keeping families together where possible" {...hover}>
          ✨ Auto-seat
        </button>
        <button style={btn} onClick={onPrint} {...hover}>
          🖨️ Print
        </button>
      </div>

      <span className="flex items-center gap-1.5" style={{ marginLeft: "auto", padding: "0 6px", fontSize: 11.5, color: "var(--c-muted)" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: saveStatus === "saving" ? "var(--c-gold)" : "#8fe3ad" }} />
        {saveStatus === "saving" ? "Saving…" : "All changes saved"}
      </span>
    </div>
  );
}
