import type { BwGame, BwQuestion, FloorItem, SeatingLayout, SeatingTable, StoryItem } from "./types";
import { emptySeatingLayout } from "./types";

// One-time, non-destructive upgrade path from the pre-bilingual data shapes
// (plain-string question/title text, option-text-keyed answers) to the
// current bilingual shapes. Existing text is preserved in BOTH languages
// (nothing is translated automatically) so nothing disappears — the couple
// can then refine either language via the admin Story/BrooksWay tabs.

type LegacyBwQuestion = { q: string; options: string[] };
type LegacyStoryItem = { year: string; title: string; text?: string; image: string; position?: { x: number; y: number } };

function isLegacyQuestion(q: BwQuestion | LegacyBwQuestion): q is LegacyBwQuestion {
  return typeof q.q === "string";
}

export function migrateBwQuestions(
  questions: Record<BwGame, (BwQuestion | LegacyBwQuestion)[]>
): Record<BwGame, BwQuestion[]> {
  const out = {} as Record<BwGame, BwQuestion[]>;
  for (const game of Object.keys(questions) as BwGame[]) {
    out[game] = questions[game].map((q) =>
      isLegacyQuestion(q) ? { q: { en: q.q, af: q.q }, options: q.options.map((o) => ({ en: o, af: o })) } : q
    );
  }
  return out;
}

/** Old answers/results were keyed by option TEXT; new ones are keyed by option INDEX. */
export function migrateAnswerMap(
  map: Record<number, string | number> | undefined,
  questions: BwQuestion[]
): Record<number, number> {
  if (!map) return {};
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(map)) {
    const qIndex = Number(key);
    if (typeof value === "number") {
      out[qIndex] = value;
      continue;
    }
    const idx = (questions[qIndex]?.options || []).findIndex((o) => o.en === value || o.af === value);
    if (idx >= 0) out[qIndex] = idx;
  }
  return out;
}

export function migrateStoryItems(story: (StoryItem | LegacyStoryItem)[]): StoryItem[] {
  return story.map((item) => (typeof item.title === "string" ? { ...item, title: { en: item.title, af: item.title } } : item)) as StoryItem[];
}

/**
 * One-time upgrade from the old flat seating-table list to the new
 * positioned floor-plan layout. Runs only when no layout has ever been
 * saved yet, so it never clobbers a couple's real edits — old tables are
 * dropped onto a simple grid with their names, capacities, shapes and
 * (most importantly) existing guest assignments carried over untouched.
 */
export function migrateSeatingLayout(layout: SeatingLayout | undefined, legacyTables: SeatingTable[] | undefined): SeatingLayout {
  if (layout && layout.items) return layout;
  const tables = legacyTables || [];
  if (tables.length === 0) return emptySeatingLayout();
  const cols = 4;
  const spacing = 220;
  const originX = 220;
  const originY = 200;
  const items: FloorItem[] = tables.map((t, i) => ({
    id: t.id,
    type: t.head ? "headTable" : "table",
    name: t.name,
    x: originX + (i % cols) * spacing,
    y: originY + Math.floor(i / cols) * spacing,
    w: t.shape === "long" ? 200 : 120,
    h: t.shape === "long" ? 90 : 120,
    rotation: 0,
    color: t.head ? "#cbb190" : "#b3884e",
    shape: t.shape === "long" ? "rect" : t.shape,
    cap: t.cap,
    seats: t.seats,
  }));
  return { ...emptySeatingLayout(), items };
}
