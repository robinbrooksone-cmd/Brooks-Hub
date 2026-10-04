"use client";

import { useState } from "react";
import type { FloorItem } from "@/lib/types";
import { FloorItemView } from "./FloorItemView";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

export function FloorCanvas({
  containerRef,
  items,
  selectedId,
  zoom,
  panX,
  panY,
  gridSize,
  snap,
  dropTargetId,
  onSelect,
  onDeselect,
  onViewChange,
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
  dropTargetId: string | null;
  onSelect: (id: string) => void;
  onDeselect: () => void;
  onViewChange: (patch: { zoom?: number; panX?: number; panY?: number }) => void;
  onGestureStart: () => void;
  onLiveChange: (id: string, patch: Partial<FloorItem>) => void;
  onGestureEnd: (id: string, patch: Partial<FloorItem>) => void;
  onOpenPanel: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onContextMenu: (id: string, clientX: number, clientY: number) => void;
  guestName: (key: string) => string;
  guestDiet: (key: string) => string | undefined;
}) {
  const [panning, setPanning] = useState(false);

  const toWorld = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - panX) / zoom, y: (clientY - rect.top - panY) / zoom };
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const worldX = (cursorX - panX) / zoom;
      const worldY = (cursorY - panY) / zoom;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (1 - e.deltaY * 0.0016)));
      onViewChange({ zoom: nextZoom, panX: cursorX - worldX * nextZoom, panY: cursorY - worldY * nextZoom });
    } else {
      onViewChange({ panX: panX - e.deltaX, panY: panY - e.deltaY });
    }
  };

  const startPan = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    onDeselect();
    setPanning(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startPanX = panX;
    const startPanY = panY;
    const move = (ev: PointerEvent) => {
      onViewChange({ panX: startPanX + (ev.clientX - startX), panY: startPanY + (ev.clientY - startY) });
    };
    const up = () => {
      setPanning(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      onPointerDown={startPan}
      className="relative"
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#241a13",
        backgroundImage: "radial-gradient(rgba(203,177,144,0.25) 1px, transparent 1px)",
        backgroundSize: `${gridSize * zoom}px ${gridSize * zoom}px`,
        backgroundPosition: `${panX}px ${panY}px`,
        cursor: panning ? "grabbing" : "grab",
        touchAction: "none",
        borderRadius: 10,
        border: "1px solid var(--c-line)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: "0 0",
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
