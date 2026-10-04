"use client";

import { useRef, useState } from "react";
import type { FloorItem } from "@/lib/types";
import { ITEM_DEFAULTS, dietColor } from "./floorPlanConfig";

type Corner = "nw" | "ne" | "sw" | "se";

export function FloorItemView({
  item,
  selected,
  toWorld,
  gridSize,
  snap,
  guestName,
  guestDiet,
  onGestureStart,
  onLiveChange,
  onGestureEnd,
  onSelect,
  onOpenPanel,
  onRename,
  onContextMenu,
  isDropTarget,
}: {
  item: FloorItem;
  selected: boolean;
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  gridSize: number;
  snap: boolean;
  guestName: (key: string) => string;
  guestDiet: (key: string) => string | undefined;
  onGestureStart: () => void;
  onLiveChange: (patch: Partial<FloorItem>) => void;
  onGestureEnd: (patch: Partial<FloorItem>) => void;
  onSelect: () => void;
  onOpenPanel: () => void;
  onRename: (name: string) => void;
  onContextMenu: (clientX: number, clientY: number) => void;
  isDropTarget: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(item.name);
  const movedRef = useRef(false);

  const snapVal = (v: number) => (snap ? Math.round(v / gridSize) * gridSize : v);

  const startMove = (e: React.PointerEvent) => {
    if (item.locked || renaming) return;
    if ((e.target as HTMLElement).closest("[data-handle]")) return;
    e.stopPropagation();
    e.preventDefault();
    const startWorld = toWorld(e.clientX, e.clientY);
    const startX = item.x;
    const startY = item.y;
    movedRef.current = false;
    onGestureStart();
    const move = (ev: PointerEvent) => {
      const w = toWorld(ev.clientX, ev.clientY);
      const dx = w.x - startWorld.x;
      const dy = w.y - startWorld.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true;
      onLiveChange({ x: snapVal(startX + dx), y: snapVal(startY + dy) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const w = toWorld(ev.clientX, ev.clientY);
      const dx = w.x - startWorld.x;
      const dy = w.y - startWorld.y;
      if (movedRef.current) {
        onGestureEnd({ x: snapVal(startX + dx), y: snapVal(startY + dy) });
      } else {
        onGestureEnd({});
        onSelect();
        if (item.seats) onOpenPanel();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startResize = (corner: Corner) => (e: React.PointerEvent) => {
    if (item.locked) return;
    e.stopPropagation();
    e.preventDefault();
    const startWorld = toWorld(e.clientX, e.clientY);
    const start = { x: item.x, y: item.y, w: item.w, h: item.h };
    const signX = corner === "ne" || corner === "se" ? 1 : -1;
    const signY = corner === "sw" || corner === "se" ? 1 : -1;
    onGestureStart();
    const move = (ev: PointerEvent) => {
      const w = toWorld(ev.clientX, ev.clientY);
      const dx = (w.x - startWorld.x) * signX;
      const dy = (w.y - startWorld.y) * signY;
      const newW = Math.max(30, snapVal(start.w + dx * 2));
      const newH = Math.max(30, snapVal(start.h + dy * 2));
      onLiveChange({ w: newW, h: newH });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const w = toWorld(ev.clientX, ev.clientY);
      const dx = (w.x - startWorld.x) * signX;
      const dy = (w.y - startWorld.y) * signY;
      const newW = Math.max(30, snapVal(start.w + dx * 2));
      const newH = Math.max(30, snapVal(start.h + dy * 2));
      onGestureEnd({ w: newW, h: newH });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startRotate = (e: React.PointerEvent) => {
    if (item.locked) return;
    e.stopPropagation();
    e.preventDefault();
    const startAngle = (Math.atan2(item.y - toWorld(e.clientX, e.clientY).y, toWorld(e.clientX, e.clientY).x - item.x) * 180) / Math.PI;
    const startRotation = item.rotation;
    onGestureStart();
    const angleAt = (clientX: number, clientY: number) => {
      const w = toWorld(clientX, clientY);
      return (Math.atan2(item.y - w.y, w.x - item.x) * 180) / Math.PI;
    };
    const move = (ev: PointerEvent) => {
      const a = angleAt(ev.clientX, ev.clientY);
      let rotation = startRotation - (a - startAngle);
      if (ev.shiftKey) rotation = Math.round(rotation / 15) * 15;
      rotation = ((rotation % 360) + 360) % 360;
      onLiveChange({ rotation });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const a = angleAt(ev.clientX, ev.clientY);
      let rotation = startRotation - (a - startAngle);
      if (ev.shiftKey) rotation = Math.round(rotation / 15) * 15;
      rotation = ((rotation % 360) + 360) % 360;
      onGestureEnd({ rotation });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const def = ITEM_DEFAULTS[item.type];
  const isRound = item.shape === "round";
  const cap = item.cap ?? 0;
  const seats = item.seats ?? [];
  const over = cap > 0 && seats.length > cap;

  const commitRename = () => {
    setRenaming(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== item.name) onRename(trimmed);
    else setNameDraft(item.name);
  };

  // Seat dots around the table perimeter — round tables get a ring, rect/square get two rows.
  const seatDots =
    item.seats && cap > 0
      ? Array.from({ length: cap }).map((_, i) => {
          let sx = 0;
          let sy = 0;
          if (isRound) {
            const angle = (i / cap) * Math.PI * 2 - Math.PI / 2;
            sx = Math.cos(angle) * (item.w / 2 + 14);
            sy = Math.sin(angle) * (item.h / 2 + 14);
          } else {
            const perSide = Math.ceil(cap / 2);
            const row = i < perSide ? 0 : 1;
            const idx = i < perSide ? i : i - perSide;
            const spread = item.w / (perSide + 1);
            sx = -item.w / 2 + spread * (idx + 1);
            sy = row === 0 ? -item.h / 2 - 14 : item.h / 2 + 14;
          }
          const key = seats[i];
          const filled = !!key;
          return (
            <div
              key={i}
              title={filled ? guestName(key) : "Empty seat"}
              style={{
                position: "absolute",
                left: item.w / 2 + sx - 6,
                top: item.h / 2 + sy - 6,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: filled ? dietColor(guestDiet(key)) : "rgba(0,0,0,0.25)",
                border: `1px solid ${filled ? "rgba(0,0,0,0.3)" : "rgba(203,177,144,0.4)"}`,
              }}
            />
          );
        })
      : null;

  return (
    <div
      data-floor-item-id={item.id}
      onPointerDown={startMove}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect();
        onContextMenu(e.clientX, e.clientY);
      }}
      className="absolute"
      style={{
        left: item.x - item.w / 2,
        top: item.y - item.h / 2,
        width: item.w,
        height: item.h,
        touchAction: "none",
        cursor: item.locked ? "default" : "move",
        zIndex: selected ? 5 : 1,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `rotate(${item.rotation}deg)`,
          transformOrigin: "center center",
        }}
      >
        <div
          className="absolute flex flex-col items-center justify-center text-center"
          style={{
            inset: 0,
            borderRadius: isRound ? "50%" : 10,
            background: item.color,
            border: `2px solid ${selected ? "#f8f3ec" : isDropTarget ? "#8fe3ad" : "rgba(0,0,0,0.25)"}`,
            boxShadow: isDropTarget ? "0 0 0 4px rgba(143,227,173,0.35)" : selected ? "0 4px 18px rgba(0,0,0,0.35)" : "0 2px 8px rgba(0,0,0,0.2)",
            padding: 6,
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: Math.min(22, item.h * 0.28), lineHeight: 1 }}>{def.icon}</div>
          {renaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setNameDraft(item.name);
                  setRenaming(false);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                marginTop: 4,
                width: "90%",
                fontSize: 12,
                textAlign: "center",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: 4,
                color: "#fff",
                padding: "2px 4px",
              }}
            />
          ) : (
            <div
              onDoubleClick={(e) => {
                e.stopPropagation();
                setRenaming(true);
              }}
              style={{
                marginTop: 4,
                fontSize: Math.min(13, Math.max(9, item.w * 0.09)),
                color: "#fff",
                fontWeight: 600,
                textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "92%",
              }}
            >
              {item.name}
            </div>
          )}
          {cap > 0 && (
            <div
              style={{
                marginTop: 2,
                fontSize: 11,
                fontWeight: 700,
                color: over ? "#ffb4a3" : "rgba(255,255,255,0.85)",
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              }}
            >
              {seats.length}/{cap}
              {over && " ⚠"}
            </div>
          )}
          {item.locked && (
            <div style={{ position: "absolute", top: 4, right: 4, fontSize: 11 }} title="Locked">
              🔒
            </div>
          )}
        </div>
        {seatDots}
      </div>

      {selected && !item.locked && (
        <>
          {(["nw", "ne", "sw", "se"] as Corner[]).map((corner) => (
            <div
              key={corner}
              data-handle
              onPointerDown={startResize(corner)}
              style={{
                position: "absolute",
                width: 12,
                height: 12,
                borderRadius: 3,
                background: "#f8f3ec",
                border: "1.5px solid var(--c-gold)",
                touchAction: "none",
                cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize",
                left: corner.includes("w") ? -6 : item.w - 6,
                top: corner.includes("n") ? -6 : item.h - 6,
                zIndex: 6,
              }}
            />
          ))}
          <div
            data-handle
            onPointerDown={startRotate}
            title="Drag to rotate — hold Shift to snap to 15°"
            style={{
              position: "absolute",
              left: item.w / 2 - 8,
              top: -32,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#f8f3ec",
              border: "1.5px solid var(--c-gold)",
              touchAction: "none",
              cursor: "grab",
              zIndex: 6,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: item.w / 2 - 1,
              top: -32 + 16,
              width: 2,
              height: 16,
              background: "rgba(203,177,144,0.5)",
              zIndex: 5,
            }}
          />
        </>
      )}
    </div>
  );
}
