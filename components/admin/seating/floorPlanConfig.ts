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
