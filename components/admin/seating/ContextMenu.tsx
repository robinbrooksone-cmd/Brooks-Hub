"use client";

import type { FloorItem } from "@/lib/types";

const SWATCHES = ["#b3884e", "#cbb190", "#8fe3ad", "#7cc4e0", "#c98fe3", "#e0907a", "#e0c26f", "#4a3527"];

export function ContextMenu({
  x,
  y,
  item,
  onClose,
  onDuplicate,
  onDelete,
  onRotate90,
  onBringToFront,
  onSendToBack,
  onToggleLock,
  onColorChange,
}: {
  x: number;
  y: number;
  item: FloorItem;
  onClose: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRotate90: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onToggleLock: () => void;
  onColorChange: (color: string) => void;
}) {
  const row: React.CSSProperties = {
    padding: "8px 12px",
    background: "transparent",
    border: "none",
    color: "var(--c-ivory)",
    fontSize: 13,
    textAlign: "left",
    cursor: "pointer",
    borderRadius: 5,
  };

  const item_ = (label: string, action: () => void) => (
    <button
      style={row}
      onClick={() => {
        action();
        onClose();
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(179,136,78,0.15)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="fixed" style={{ inset: 0, zIndex: 59 }} onClick={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div
        className="fixed flex flex-col"
        style={{
          left: Math.min(x, window.innerWidth - 200),
          top: Math.min(y, window.innerHeight - 320),
          zIndex: 60,
          background: "#2e2019",
          border: "1px solid var(--c-line)",
          borderRadius: 8,
          padding: 6,
          minWidth: 190,
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        }}
      >
        {item_("⎘ Duplicate", onDuplicate)}
        {item_("↻ Rotate 90°", onRotate90)}
        {item_("⬆ Bring to front", onBringToFront)}
        {item_("⬇ Send to back", onSendToBack)}
        {item_(item.locked ? "🔓 Unlock" : "🔒 Lock", onToggleLock)}
        <div style={{ padding: "6px 12px" }}>
          <div style={{ fontSize: 10, color: "var(--c-muted)", marginBottom: 6, textTransform: "uppercase" }}>Colour</div>
          <div className="flex gap-1.5 flex-wrap">
            {SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onColorChange(c);
                  onClose();
                }}
                className="cursor-pointer"
                style={{ width: 18, height: 18, borderRadius: "50%", background: c, border: item.color === c ? "2px solid #fff" : "1px solid rgba(0,0,0,0.3)" }}
              />
            ))}
          </div>
        </div>
        <div style={{ height: 1, background: "var(--c-line)", margin: "4px 0" }} />
        {item_("🗑 Delete", onDelete)}
      </div>
    </>
  );
}
