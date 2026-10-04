"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getFamiliesAction, getRsvpsAction, getSeatingLayoutAction, saveSeatingLayoutAction } from "@/app/actions";
import type { Family } from "@/lib/roster";
import type { FloorItem, FloorItemType, Rsvp, SeatingLayout } from "@/lib/types";
import { ContextMenu } from "./seating/ContextMenu";
import { FloorCanvas } from "./seating/FloorCanvas";
import { createFloorItem, splitGuestsAndBabies, type Guest, type GuestStatus, uid } from "./seating/floorPlanConfig";
import { GuestSidebar } from "./seating/GuestSidebar";
import { TablePanel } from "./seating/TablePanel";
import { SeatingPrintSheet } from "./seating/SeatingPrintSheet";
import { Toolbar } from "./seating/Toolbar";

const HISTORY_LIMIT = 50;

export function SeatingTab() {
  const [layout, setLayout] = useState<SeatingLayout | null>(null);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [history, setHistory] = useState<SeatingLayout[]>([]);
  const [future, setFuture] = useState<SeatingLayout[]>([]);
  const gestureSnapshotRef = useRef<SeatingLayout | null>(null);
  const layoutRef = useRef<SeatingLayout | null>(null);
  const skipNextSaveRef = useRef(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpenId, setPanelOpenId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [guestDrag, setGuestDrag] = useState<{ key: string; name: string; diet?: string; x: number; y: number } | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GuestStatus>("attending");
  const [hoveredFamilyId, setHoveredFamilyId] = useState<string | null>(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [toast, setToast] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([getSeatingLayoutAction(), getRsvpsAction(), getFamiliesAction()]).then(([l, r, f]) => {
      setLayout(l);
      setRsvps(r);
      setFamilies(f);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Debounced autosave — fires ~700ms after the layout settles, skipped on the initial load.
  useEffect(() => {
    if (!layout) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    setSaveStatus("saving");
    const t = setTimeout(() => {
      saveSeatingLayoutAction(layout).then(() => setSaveStatus("saved"));
    }, 700);
    return () => clearTimeout(t);
  }, [layout]);

  // Best-effort flush when leaving the tab (AdminDashboard unmounts this component on tab switch).
  useEffect(() => {
    return () => {
      if (layoutRef.current) saveSeatingLayoutAction(layoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Babies take no seat and are managed in their own tab — keep them out of seating entirely.
  const { guests, babies } = useMemo(() => splitGuestsAndBabies(rsvps, families), [rsvps, families]);
  const guestByKey = useMemo(() => new Map(guests.map((g) => [g.key, g])), [guests]);
  const guestName = (key: string) => guestByKey.get(key)?.name || key;
  const guestDiet = (key: string) => guestByKey.get(key)?.diet;
  const seatedAt = useMemo(() => {
    const map: Record<string, string> = {};
    (layout?.items || []).forEach((it) => (it.seats || []).forEach((k) => (map[k] = it.name)));
    return map;
  }, [layout]);

  const selectedItem = layout?.items.find((it) => it.id === selectedId) || null;
  const panelItem = layout?.items.find((it) => it.id === panelOpenId) || null;
  const contextItem = contextMenu ? layout?.items.find((it) => it.id === contextMenu.itemId) || null : null;

  function commitAction(mutator: (l: SeatingLayout) => SeatingLayout) {
    if (!layout) return;
    setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), layout]);
    setFuture([]);
    setLayout(mutator(layout));
  }

  function beginGesture() {
    gestureSnapshotRef.current = layoutRef.current;
  }
  function liveChangeItem(id: string, patch: Partial<FloorItem>) {
    setLayout((prev) => (prev ? { ...prev, items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) } : prev));
  }
  function endGestureItem(id: string, patch: Partial<FloorItem>) {
    const snap = gestureSnapshotRef.current;
    gestureSnapshotRef.current = null;
    if (Object.keys(patch).length === 0) return; // pure click, nothing moved
    if (snap) {
      setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), snap]);
      setFuture([]);
    }
    setLayout((prev) => (prev ? { ...prev, items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) } : prev));
  }
  function onViewChange(patch: { zoom?: number; panX?: number; panY?: number }) {
    setLayout((prev) => (prev ? { ...prev, ...patch } : prev));
  }
  function zoomBy(delta: number) {
    setLayout((prev) => (prev ? { ...prev, zoom: Math.min(2.5, Math.max(0.25, prev.zoom + delta)) } : prev));
  }

  function undo() {
    if (history.length === 0 || !layout) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [layout, ...f].slice(0, HISTORY_LIMIT));
    setLayout(prev);
  }
  function redo() {
    if (future.length === 0 || !layout) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, layout].slice(-HISTORY_LIMIT));
    setLayout(next);
  }

  function addItem(type: FloorItemType) {
    if (!layout) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = rect ? (rect.width / 2 - layout.panX) / layout.zoom : 300;
    const cy = rect ? (rect.height / 2 - layout.panY) / layout.zoom : 300;
    const item = createFloorItem(type, cx, cy, layout.items);
    commitAction((l) => ({ ...l, items: [...l.items, item] }));
    setSelectedId(item.id);
  }

  function deleteItem(id: string) {
    commitAction((l) => ({ ...l, items: l.items.filter((it) => it.id !== id) }));
    setSelectedId((p) => (p === id ? null : p));
    setPanelOpenId((p) => (p === id ? null : p));
  }

  function duplicateItem(id: string) {
    if (!layout) return;
    const src = layout.items.find((it) => it.id === id);
    if (!src) return;
    const copy: FloorItem = { ...src, id: uid(src.type), name: `${src.name} copy`, x: src.x + 40, y: src.y + 40, seats: src.seats ? [] : undefined };
    commitAction((l) => ({ ...l, items: [...l.items, copy] }));
    setSelectedId(copy.id);
  }

  function rotateItem90(id: string) {
    commitAction((l) => ({ ...l, items: l.items.map((it) => (it.id === id ? { ...it, rotation: (it.rotation + 90) % 360 } : it)) }));
  }
  function bringToFront(id: string) {
    commitAction((l) => {
      const items = [...l.items];
      const idx = items.findIndex((it) => it.id === id);
      if (idx < 0) return l;
      const [it] = items.splice(idx, 1);
      items.push(it);
      return { ...l, items };
    });
  }
  function sendToBack(id: string) {
    commitAction((l) => {
      const items = [...l.items];
      const idx = items.findIndex((it) => it.id === id);
      if (idx < 0) return l;
      const [it] = items.splice(idx, 1);
      items.unshift(it);
      return { ...l, items };
    });
  }
  function toggleLock(id: string) {
    commitAction((l) => ({ ...l, items: l.items.map((it) => (it.id === id ? { ...it, locked: !it.locked } : it)) }));
  }
  function changeColor(id: string, color: string) {
    commitAction((l) => ({ ...l, items: l.items.map((it) => (it.id === id ? { ...it, color } : it)) }));
  }
  function renameItem(id: string, name: string) {
    commitAction((l) => ({ ...l, items: l.items.map((it) => (it.id === id ? { ...it, name } : it)) }));
  }
  function updateItemField(id: string, patch: Partial<FloorItem>) {
    commitAction((l) => ({ ...l, items: l.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  }
  function reorderSeats(id: string, seats: string[]) {
    commitAction((l) => ({ ...l, items: l.items.map((it) => (it.id === id ? { ...it, seats } : it)) }));
  }

  function assignGuestToTable(itemId: string, guestKey: string) {
    if (!layout) return;
    const target = layout.items.find((it) => it.id === itemId);
    if (!target || !target.seats) return;
    if (target.cap !== undefined && target.seats.length >= target.cap && !target.seats.includes(guestKey)) {
      setToast(`${target.name} is already at capacity (${target.cap}) — seated anyway.`);
    }
    commitAction((l) => ({
      ...l,
      items: l.items.map((it) => {
        if (!it.seats) return it;
        let seats = it.seats.filter((k) => k !== guestKey);
        if (it.id === itemId) seats = [...seats, guestKey];
        return { ...it, seats };
      }),
    }));
  }
  function unassignGuest(itemId: string, guestKey: string) {
    commitAction((l) => ({ ...l, items: l.items.map((it) => (it.id === itemId ? { ...it, seats: (it.seats || []).filter((k) => k !== guestKey) } : it)) }));
  }

  function startGuestDrag(guest: Guest, e: React.PointerEvent) {
    e.preventDefault();
    const fromItemId = layout?.items.find((it) => (it.seats || []).includes(guest.key))?.id;
    setGuestDrag({ key: guest.key, name: guest.name, diet: guest.diet, x: e.clientX, y: e.clientY });
    setMobileSidebar(false);
    const move = (ev: PointerEvent) => {
      setGuestDrag((gd) => (gd ? { ...gd, x: ev.clientX, y: ev.clientY } : gd));
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const itemEl = el?.closest("[data-floor-item-id]") as HTMLElement | null;
      setDropTargetId(itemEl?.dataset.floorItemId || null);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const itemEl = el?.closest("[data-floor-item-id]") as HTMLElement | null;
      const targetId = itemEl?.dataset.floorItemId || null;
      setGuestDrag(null);
      setDropTargetId(null);
      if (targetId) assignGuestToTable(targetId, guest.key);
      else if (fromItemId) unassignGuest(fromItemId, guest.key);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function autoSeat() {
    if (!layout) return;
    const seatedKeys = new Set(layout.items.flatMap((it) => it.seats || []));
    const unseated = guests.filter((g) => g.status === "attending" && !seatedKeys.has(g.key));
    if (unseated.length === 0) {
      setToast("Everyone confirmed is already seated.");
      return;
    }
    const totalFree = layout.items.reduce((n, it) => (it.cap !== undefined ? n + Math.max(0, it.cap - (it.seats?.length || 0)) : n), 0);
    const byFamily = new Map<string, Guest[]>();
    unseated.forEach((g) => {
      const arr = byFamily.get(g.familyId) || [];
      arr.push(g);
      byFamily.set(g.familyId, arr);
    });
    const familyGroups = [...byFamily.values()].sort((a, b) => b.length - a.length);
    commitAction((l) => {
      const items = l.items.map((it) => ({ ...it, seats: it.seats ? [...it.seats] : it.seats }));
      const tables = items.filter((it): it is FloorItem & { seats: string[]; cap: number } => !!it.seats && it.cap !== undefined);
      for (const fam of familyGroups) {
        const remaining = [...fam];
        while (remaining.length > 0) {
          tables.sort((a, b) => b.cap - b.seats.length - (a.cap - a.seats.length));
          const t = tables.find((tt) => tt.cap - tt.seats.length > 0);
          if (!t) break;
          const free = t.cap - t.seats.length;
          const chunk = remaining.splice(0, free);
          t.seats.push(...chunk.map((g) => g.key));
        }
      }
      return { ...l, items };
    });
    setToast(unseated.length > totalFree ? `Seated as many as possible — need more capacity for ${unseated.length - totalFree} guest(s).` : `Auto-seated ${unseated.length} guest(s).`);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteItem(selectedId);
      } else if (mod && e.key.toLowerCase() === "d" && selectedId) {
        e.preventDefault();
        duplicateItem(selectedId);
      } else if (e.key === "Escape") {
        setSelectedId(null);
        setPanelOpenId(null);
        setContextMenu(null);
      } else if (selectedId && layout && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.altKey ? 1 : layout.snap ? layout.gridSize : 10;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        commitAction((l) => ({ ...l, items: l.items.map((it) => (it.id === selectedId ? { ...it, x: it.x + dx, y: it.y + dy } : it)) }));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, layout, history, future]);

  if (!loaded || !layout) return <div style={{ color: "var(--c-muted)" }}>Loading floor plan…</div>;

  return (
    <div className="flex flex-col">
      <p style={{ color: "var(--c-muted)", fontSize: 13, marginBottom: 12 }}>
        Drag guests from the sidebar onto a table to seat them. Drag tables and objects to arrange your reception — resize from the corners, rotate from the top
        handle, double-click a name to rename. Everything autosaves.
      </p>

      <div className="seating-print-hide">
        <Toolbar
          onAdd={addItem}
          zoom={layout.zoom}
          onZoomChange={(z) => onViewChange({ zoom: z })}
          onZoomBy={zoomBy}
          snap={layout.snap}
          onToggleSnap={() => commitAction((l) => ({ ...l, snap: !l.snap }))}
          onUndo={undo}
          onRedo={redo}
          canUndo={history.length > 0}
          canRedo={future.length > 0}
          onAutoSeat={autoSeat}
          onPrint={() => window.print()}
          saveStatus={saveStatus}
        />
      </div>

      <button
        onClick={() => setMobileSidebar(true)}
        className="md:hidden cursor-pointer seating-print-hide"
        style={{ marginBottom: 10, padding: "8px 14px", background: "var(--c-panel)", border: "1px solid var(--c-line)", borderRadius: 8, color: "var(--c-ivory)", fontSize: 12, alignSelf: "flex-start" }}
      >
        👥 Guests ({guests.filter((g) => g.status === "attending").length})
      </button>

      <div className="flex gap-4" style={{ minHeight: 0 }}>
        <div className="hidden md:flex flex-col seating-print-hide" style={{ width: 240, flexShrink: 0, height: "72vh", minHeight: 480 }}>
          <GuestSidebar
            guests={guests}
            search={search}
            setSearch={setSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            seatedAt={seatedAt}
            hoveredFamilyId={hoveredFamilyId}
            setHoveredFamilyId={setHoveredFamilyId}
            onGuestPointerDown={startGuestDrag}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0, height: "72vh", minHeight: 480 }}>
          <FloorCanvas
            containerRef={containerRef}
            items={layout.items}
            selectedId={selectedId}
            zoom={layout.zoom}
            panX={layout.panX}
            panY={layout.panY}
            gridSize={layout.gridSize}
            snap={layout.snap}
            dropTargetId={dropTargetId}
            onSelect={setSelectedId}
            onDeselect={() => setSelectedId(null)}
            onViewChange={onViewChange}
            onGestureStart={beginGesture}
            onLiveChange={liveChangeItem}
            onGestureEnd={endGestureItem}
            onOpenPanel={setPanelOpenId}
            onRename={renameItem}
            onContextMenu={(id, x, y) => setContextMenu({ itemId: id, x, y })}
            guestName={guestName}
            guestDiet={guestDiet}
          />
        </div>
      </div>

      {mobileSidebar && (
        <div className="fixed md:hidden" style={{ inset: 0, zIndex: 70, background: "rgba(0,0,0,0.55)" }} onClick={() => setMobileSidebar(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "85vw", maxWidth: 340, background: "#2e2019", padding: 16 }}>
            <GuestSidebar
              guests={guests}
              search={search}
              setSearch={setSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              seatedAt={seatedAt}
              hoveredFamilyId={hoveredFamilyId}
              setHoveredFamilyId={setHoveredFamilyId}
              onGuestPointerDown={startGuestDrag}
            />
          </div>
        </div>
      )}

      {panelItem && (
        <TablePanel
          key={panelItem.id}
          item={panelItem}
          guests={guests}
          onClose={() => setPanelOpenId(null)}
          onUpdate={(patch) => updateItemField(panelItem.id, patch)}
          onRemoveSeat={(key) => unassignGuest(panelItem.id, key)}
          onReorderSeats={(seats) => reorderSeats(panelItem.id, seats)}
          onDelete={() => {
            deleteItem(panelItem.id);
            setPanelOpenId(null);
          }}
          onDuplicate={() => duplicateItem(panelItem.id)}
        />
      )}

      {contextMenu && contextItem && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextItem}
          onClose={() => setContextMenu(null)}
          onDuplicate={() => duplicateItem(contextItem.id)}
          onDelete={() => deleteItem(contextItem.id)}
          onRotate90={() => rotateItem90(contextItem.id)}
          onBringToFront={() => bringToFront(contextItem.id)}
          onSendToBack={() => sendToBack(contextItem.id)}
          onToggleLock={() => toggleLock(contextItem.id)}
          onColorChange={(c) => changeColor(contextItem.id, c)}
        />
      )}

      {guestDrag && (
        <div
          className="fixed pointer-events-none"
          style={{
            left: guestDrag.x + 14,
            top: guestDrag.y + 14,
            zIndex: 80,
            padding: "8px 14px",
            background: "var(--c-gold)",
            color: "#fff",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {guestDrag.name}
        </div>
      )}

      {toast && (
        <div
          className="fixed seating-print-hide"
          style={{
            left: "50%",
            bottom: 26,
            transform: "translateX(-50%)",
            zIndex: 90,
            padding: "12px 20px",
            background: "#2e2019",
            border: "1px solid var(--c-gold)",
            borderRadius: 10,
            color: "var(--c-ivory)",
            fontSize: 13,
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
          }}
        >
          {toast}
        </div>
      )}

      <SeatingPrintSheet
        items={layout.items}
        guests={guests}
        babies={babies}
        eventTitle="Robin & Annami"
        eventDate="5 December 2026"
        venue="Bona Bona Game Reserve"
      />

      {selectedItem && !panelItem && (
        <div className="seating-print-hide" style={{ marginTop: 10, fontSize: 11, color: "var(--c-muted)" }}>
          Selected: {selectedItem.name} · Delete to remove · Ctrl/Cmd+D to duplicate · Arrow keys to nudge
        </div>
      )}
    </div>
  );
}
