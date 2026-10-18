import type { Family } from "@/lib/roster";
import type { FloorItem, FloorItemType, Rsvp, TableShape } from "@/lib/types";

export type GuestStatus = "attending" | "declined" | "pending";
export type Guest = {
  key: string;
  name: string;
  family: string;
  familyId: string;
  diet?: string;
  status: GuestStatus;
  /** Infant — attends and can RSVP, but takes no seat and isn't counted as a guest. */
  isBaby?: boolean;
};

/**
 * Everyone on the roster, including babies (flagged `isBaby`). Most callers
 * want `splitGuestsAndBabies` — babies are excluded from headcounts and from
 * the seating planner, and are reported separately instead.
 */
export function buildGuestPool(rsvps: Rsvp[], families: Family[]): Guest[] {
  const babyKeys = new Set<string>();
  for (const f of families) for (const m of f.members) if (m.isBaby) babyKeys.add(`${f.id}:${m.id}`);

  const guests: Guest[] = [];
  const answered = new Set<string>();
  const push = (g: Guest) => guests.push(babyKeys.has(g.key) ? { ...g, isBaby: true } : g);

  for (const r of rsvps) {
    for (const m of r.members) {
      const key = `${r.familyId}:${m.id}`;
      if (answered.has(key)) continue;
      answered.add(key);
      push({ key, name: m.name, family: r.family, familyId: r.familyId, diet: m.diet, status: "attending" });
    }
    for (const m of r.notAttending) {
      const key = `${r.familyId}:${m.id}`;
      if (answered.has(key)) continue;
      answered.add(key);
      push({ key, name: m.name, family: r.family, familyId: r.familyId, status: "declined" });
    }
  }
  // Anyone without an explicit yes/no is pending — including members of families
  // that DID respond but (via the old check-in-only flow) never answered for
  // everyone. Those people used to vanish from the admin views entirely.
  for (const f of families) {
    for (const m of f.members) {
      const key = `${f.id}:${m.id}`;
      if (answered.has(key)) continue;
      push({ key, name: m.name, family: f.name, familyId: f.id, status: "pending" });
    }
  }
  return guests;
}

/** Split the roster into real guests (counted, seated) and babies (neither). */
export function splitGuestsAndBabies(rsvps: Rsvp[], families: Family[]): { guests: Guest[]; babies: Guest[] } {
  const all = buildGuestPool(rsvps, families);
  return { guests: all.filter((g) => !g.isBaby), babies: all.filter((g) => g.isBaby) };
}

export type ItemDefaults = {
  label: string;
  icon: string;
  w: number;
  h: number;
  color: string;
  hasSeats: boolean;
  shape?: TableShape;
};

export const ITEM_DEFAULTS: Record<FloorItemType, ItemDefaults> = {
  table: { label: "Table", icon: "🍽️", w: 120, h: 120, color: "#b3884e", hasSeats: true, shape: "round" },
  headTable: { label: "Bridal Table", icon: "💍", w: 280, h: 90, color: "#cbb190", hasSeats: true, shape: "rect" },
  danceFloor: { label: "Dance Floor", icon: "💃", w: 240, h: 240, color: "#5c4030", hasSeats: false },
  djBooth: { label: "DJ Booth", icon: "🎧", w: 120, h: 70, color: "#4a3527", hasSeats: false },
  stage: { label: "Stage", icon: "🎤", w: 220, h: 110, color: "#4a3527", hasSeats: false },
  bar: { label: "Bar", icon: "🍸", w: 170, h: 60, color: "#5c4030", hasSeats: false },
  cakeTable: { label: "Cake Table", icon: "🎂", w: 80, h: 80, color: "#cbb190", hasSeats: false, shape: "round" },
  giftTable: { label: "Gift Table", icon: "🎁", w: 100, h: 60, color: "#cbb190", hasSeats: false },
  photoBooth: { label: "Photo Booth", icon: "📸", w: 110, h: 110, color: "#4a3527", hasSeats: false },
  entrance: { label: "Entrance", icon: "🚪", w: 80, h: 40, color: "#6f9e78", hasSeats: false },
  exit: { label: "Exit", icon: "🚪", w: 80, h: 40, color: "#b0685a", hasSeats: false },
  buffet: { label: "Buffet", icon: "🍽️", w: 220, h: 60, color: "#5c4030", hasSeats: false },
  dessertTable: { label: "Dessert Table", icon: "🍰", w: 100, h: 60, color: "#cbb190", hasSeats: false },
  custom: { label: "Object", icon: "⬛", w: 100, h: 100, color: "#4a3527", hasSeats: false },
};

export const ADD_MENU: { type: FloorItemType; label: string; icon: string }[] = [
  { type: "table", label: "Round Table", icon: "🍽️" },
  { type: "headTable", label: "Bridal Table", icon: "💍" },
  { type: "danceFloor", label: "Dance Floor", icon: "💃" },
  { type: "djBooth", label: "DJ Booth", icon: "🎧" },
  { type: "stage", label: "Stage", icon: "🎤" },
  { type: "bar", label: "Bar", icon: "🍸" },
  { type: "cakeTable", label: "Cake Table", icon: "🎂" },
  { type: "giftTable", label: "Gift Table", icon: "🎁" },
  { type: "photoBooth", label: "Photo Booth", icon: "📸" },
  { type: "buffet", label: "Buffet Station", icon: "🍽️" },
  { type: "dessertTable", label: "Dessert Table", icon: "🍰" },
  { type: "entrance", label: "Entrance", icon: "🚪" },
  { type: "exit", label: "Exit", icon: "🚪" },
  { type: "custom", label: "Custom Object", icon: "⬛" },
];

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export function nextItemName(type: FloorItemType, existing: FloorItem[]): string {
  const base = ITEM_DEFAULTS[type].label;
  const count = existing.filter((it) => it.type === type).length + 1;
  return type === "table" ? `Table ${count}` : count === 1 ? base : `${base} ${count}`;
}

export function createFloorItem(type: FloorItemType, x: number, y: number, existing: FloorItem[]): FloorItem {
  const d = ITEM_DEFAULTS[type];
  const item: FloorItem = {
    id: uid(type),
    type,
    name: nextItemName(type, existing),
    x,
    y,
    w: d.w,
    h: d.h,
    rotation: 0,
    color: d.color,
    shape: d.shape,
  };
  if (d.hasSeats) {
    item.cap = type === "headTable" ? 10 : 8;
    item.seats = [];
  }
  return item;
}

export const DIET_COLORS: Record<string, string> = {
  "No restrictions": "#8fe3ad",
  "Geen beperkings": "#8fe3ad",
  Vegetarian: "#e0c26f",
  Vegetaries: "#e0c26f",
  Vegan: "#7cc4e0",
  Halaal: "#c98fe3",
  "Gluten-free": "#e0907a",
  Glutenvry: "#e0907a",
};

export function dietColor(diet: string | undefined): string {
  return (diet && DIET_COLORS[diet]) || "rgba(203,177,144,0.5)";
}

export type FloorView = { zoom: number; panX: number; panY: number };

const MAX_FIT_ZOOM = 1.6;
const FIT_PAD = 16;

/**
 * Scale and centre the plan so every item (plus its seat dots) fits inside a
 * box of the given size. Never zooms past 160%, so a small plan isn't blown up.
 */
export function fitView(items: FloorItem[], width: number, height: number): FloorView {
  if (items.length === 0 || width <= 0 || height <= 0) return { zoom: 1, panX: 0, panY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    // Half-diagonal covers any rotation; +24 leaves room for the seat dots.
    const r = Math.hypot(it.w, it.h) / 2 + 24;
    minX = Math.min(minX, it.x - r);
    minY = Math.min(minY, it.y - r);
    maxX = Math.max(maxX, it.x + r);
    maxY = Math.max(maxY, it.y + r);
  }
  const pad = FIT_PAD;
  const zoom = Math.max(0.2, Math.min(MAX_FIT_ZOOM, (width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY)));
  return {
    zoom,
    panX: width / 2 - ((minX + maxX) / 2) * zoom,
    panY: height / 2 - ((minY + maxY) / 2) * zoom,
  };
}

/** Room the seat dots take beyond a table's edge (ring offset 14 + half a 16px dot). */
const SEAT_RING = 22;
/** Space left between neighbouring tables (seat dot to seat dot) when arranging. */
const ARRANGE_GAP = 64;

/** Axis-aligned footprint of an item, including its seat dots. */
function footprint(it: FloorItem): { w: number; h: number } {
  const rad = (it.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const ring = it.seats ? SEAT_RING * 2 : 0;
  return { w: it.w * cos + it.h * sin + ring, h: it.w * sin + it.h * cos + ring };
}

/** Sort key that puts "Table 2" before "Table 10". */
function byTableNumber(a: FloorItem, b: FloorItem): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Line the tables up in neat rows by table number, with the bridal table
 * centred on top and everything else (dance floor, bar, …) stacked in a
 * column to the right. The number of tables per row is chosen so the result
 * fills a box of the given size as well as possible. Only positions (and the
 * bridal table's rotation) change — seats are untouched.
 */
export function arrangeInRows(items: FloorItem[], boxW: number, boxH: number): FloorItem[] {
  const tables = items.filter((it) => it.type === "table").sort(byTableNumber);
  const heads = items.filter((it) => it.type === "headTable").map((it) => ({ ...it, rotation: 0 })).sort(byTableNumber);
  const others = items.filter((it) => it.type !== "table" && it.type !== "headTable");
  if (tables.length === 0 && heads.length === 0) return items;

  const G = ARRANGE_GAP;
  const cellW = Math.max(0, ...tables.map((t) => footprint(t).w));
  const cellH = Math.max(0, ...tables.map((t) => footprint(t).h));
  const headFps = heads.map(footprint);
  const headRowW = headFps.reduce((n, f) => n + f.w, 0) + G * Math.max(0, heads.length - 1);
  const headRowH = Math.max(0, ...headFps.map((f) => f.h));
  const otherFps = others.map(footprint);
  const sideW = Math.max(0, ...otherFps.map((f) => f.w));
  const sideH = otherFps.reduce((n, f) => n + f.h, 0) + G * Math.max(0, others.length - 1);

  const plan = (cols: number) => {
    const rows = cols > 0 ? Math.ceil(tables.length / cols) : 0;
    const gridW = cols * cellW + G * Math.max(0, cols - 1);
    const gridH = rows * cellH + G * Math.max(0, rows - 1);
    const mainW = Math.max(gridW, headRowW);
    const mainH = headRowH + (heads.length && rows ? G : 0) + gridH;
    const totalW = mainW + (others.length ? G + sideW : 0);
    const totalH = Math.max(mainH, sideH);
    return { cols, rows, mainW, totalW, totalH };
  };

  // Pick the tables-per-row that lets the whole plan be drawn largest in the box.
  let best = plan(Math.max(1, Math.ceil(Math.sqrt(tables.length))));
  if (boxW > 0 && boxH > 0) {
    let bestZoom = -Infinity;
    for (let cols = 1; cols <= Math.max(1, tables.length); cols++) {
      const p = plan(cols);
      const zoom = Math.min((boxW - FIT_PAD * 2) / p.totalW, (boxH - FIT_PAD * 2) / p.totalH);
      if (zoom > bestZoom + 1e-6) {
        bestZoom = zoom;
        best = p;
      }
    }
  }

  const pos = new Map<string, { x: number; y: number; rotation?: number }>();
  const centreX = best.mainW / 2;

  let x = centreX - headRowW / 2;
  heads.forEach((h, i) => {
    pos.set(h.id, { x: x + headFps[i].w / 2, y: headRowH / 2, rotation: 0 });
    x += headFps[i].w + G;
  });

  const gridTop = heads.length ? headRowH + G : 0;
  for (let r = 0; r < best.rows; r++) {
    const row = tables.slice(r * best.cols, (r + 1) * best.cols);
    const rowW = row.length * cellW + G * (row.length - 1);
    row.forEach((t, c) => {
      pos.set(t.id, { x: centreX - rowW / 2 + c * (cellW + G) + cellW / 2, y: gridTop + r * (cellH + G) + cellH / 2 });
    });
  }

  let y = 0;
  const sideX = best.mainW + G + sideW / 2;
  others.forEach((o, i) => {
    pos.set(o.id, { x: sideX, y: y + otherFps[i].h / 2 });
    y += otherFps[i].h + G;
  });

  return items.map((it) => {
    const p = pos.get(it.id);
    return p ? { ...it, x: p.x, y: p.y, rotation: p.rotation ?? it.rotation } : it;
  });
}
