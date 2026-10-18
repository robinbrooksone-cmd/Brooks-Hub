"use client";

import type { FloorItem } from "@/lib/types";
import { FloorItemView } from "./FloorItemView";

export function FloorCanvas({
  containerRef,
  items,
  selectedId,
  zoom,
  panX,
  panY,
  gridSize,
  snap,
  layoutLocked,
  dropTargetId,
  onSelect,
  onDeselect,
  onGestureStart,
  onLiveChange,
  onGestureEnd,
  onOpenPanel,
  onRename,
  onContextMenu,
  guestName,
  guestDiet,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  items: FloorItem[];
  selectedId: string | null;
  zoom: number;
  panX: number;
  panY: number;
  gridSize: number;
  snap: boolean;
  layoutLocked: boolean;
  dropTargetId: string | null;
  onSelect: (id: string) => void;
  onDeselect: () => void;
  onGestureStart: () => void;
  onLiveChange: (id: string, patch: Partial<FloorItem>) => void;
  onGestureEnd: (id: string, patch: Partial<FloorItem>) => void;
  onOpenPanel: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onContextMenu: (id: string, clientX: number, clientY: number) => void;
  guestName: (key: string) => string;
  guestDiet: (key: string) => string | undefined;
}) {
  const toWorld = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - panX) / zoom, y: (clientY - rect.top - panY) / zoom };
  };

  // The view is fixed: dragged items stay inside the visible floor so nothing gets lost off-screen.
  const clampToView = (x: number, y: number) => {
    const el = containerRef.current;
    if (!el) return { x, y };
    const margin = 20 / zoom;
    const minX = -panX / zoom + margin;
    const minY = -panY / zoom + margin;
    const maxX = (el.clientWidth - panX) / zoom - margin;
    const maxY = (el.clientHeight - panY) / zoom - margin;
    return { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(minY, y)) };
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDeselect();
      }}
      className="relative"
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "#211812",
        backgroundImage: [
          "radial-gradient(ellipse 120% 90% at 50% 40%, rgba(70,50,36,0.55), rgba(20,14,10,0) 70%)",
          "linear-gradient(rgba(203,177,144,0.07) 1px, transparent 1px)",
          "linear-gradient(90deg, rgba(203,177,144,0.07) 1px, transparent 1px)",
        ].join(", "),
        backgroundSize: `100% 100%, ${gridSize * zoom}px ${gridSize * zoom}px, ${gridSize * zoom}px ${gridSize * zoom}px`,
        backgroundPosition: `0 0, ${panX}px ${panY}px, ${panX}px ${panY}px`,
        transition: "background-size 300ms ease, background-position 300ms ease",
        borderRadius: 14,
        border: "1px solid rgba(203,177,144,0.22)",
        boxShadow: "inset 0 0 60px rgba(0,0,0,0.45), 0 10px 30px rgba(0,0,0,0.25)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: "0 0",
          transition: "transform 300ms ease",
        }}
      >
        {items.map((item) => (
          <FloorItemView
            key={item.id}
            item={item}
            selected={selectedId === item.id}
            toWorld={toWorld}
            gridSize={gridSize}
            snap={snap}
            layoutLocked={layoutLocked}
            clampToView={clampToView}
            guestName={guestName}
            guestDiet={guestDiet}
            isDropTarget={dropTargetId === item.id}
            onGestureStart={onGestureStart}
            onLiveChange={(patch) => onLiveChange(item.id, patch)}
            onGestureEnd={(patch) => onGestureEnd(item.id, patch)}
            onSelect={() => onSelect(item.id)}
            onOpenPanel={() => onOpenPanel(item.id)}
            onRename={(name) => onRename(item.id, name)}
            onContextMenu={(x, y) => onContextMenu(item.id, x, y)}
          />
        ))}
      </div>
    </div>
  );
}
