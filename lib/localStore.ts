import { promises as fs } from "fs";
import path from "path";
import { buildFamiliesFromRoster } from "./roster";
import { BW_QUESTIONS, STORY } from "./content";
import { emptyStore, type Store } from "./types";
import { migrateAnswerMap, migrateBwQuestions, migrateSeatingLayout, migrateStoryItems } from "./migrateLegacy";

// Local, filesystem-backed persistence used only when Supabase env vars are
// not configured. Handy for local development and previewing the site before
// a Supabase project exists. Does NOT persist across serverless deployments —
// see README for wiring up Supabase for real, shared, cross-device data.

const FILE = path.join(process.cwd(), "data", "store.local.json");

let cache: Store | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

function migrate(s: Store): boolean {
  let changed = false;
  if (!s.story) {
    s.story = STORY;
    changed = true;
  }
  const migratedStory = migrateStoryItems(s.story);
  if (JSON.stringify(migratedStory) !== JSON.stringify(s.story)) {
    s.story = migratedStory;
    changed = true;
  }
  if (!s.bwQuestions) {
    s.bwQuestions = BW_QUESTIONS;
    changed = true;
  }
  const migratedQuestions = migrateBwQuestions(s.bwQuestions);
  if (JSON.stringify(migratedQuestions) !== JSON.stringify(s.bwQuestions)) {
    s.bwQuestions = migratedQuestions;
    changed = true;
  }
  const migratedCeremonyResults = migrateAnswerMap(s.bwState.ceremony.results, s.bwQuestions.ceremony);
  if (JSON.stringify(migratedCeremonyResults) !== JSON.stringify(s.bwState.ceremony.results)) {
    s.bwState.ceremony.results = migratedCeremonyResults;
    changed = true;
  }
  const migratedReceptionResults = migrateAnswerMap(s.bwState.reception.results, s.bwQuestions.reception);
  if (JSON.stringify(migratedReceptionResults) !== JSON.stringify(s.bwState.reception.results)) {
    s.bwState.reception.results = migratedReceptionResults;
    changed = true;
  }
  const migratedSlips = (s.bwSlips || []).map((slip) => ({ ...slip, answers: migrateAnswerMap(slip.answers, s.bwQuestions[slip.game]) }));
  if (JSON.stringify(migratedSlips) !== JSON.stringify(s.bwSlips)) {
    s.bwSlips = migratedSlips;
    changed = true;
  }
  if (s.bwState.ceremony.launched === undefined || s.bwState.reception.launched === undefined) {
    s.bwState.ceremony.launched = s.bwState.ceremony.launched ?? false;
    s.bwState.reception.launched = s.bwState.reception.launched ?? false;
    changed = true;
  }
  if (!s.photos) {
    s.photos = {};
    changed = true;
  }
  if (!s.photoPositions) {
    s.photoPositions = {};
    changed = true;
  }
  if (!s.notifiedEmails) {
    s.notifiedEmails = [];
    changed = true;
  }
  if (!s.copy) {
    s.copy = {};
    changed = true;
  }
  if (!s.payfast) {
    s.payfast = { merchantId: "", merchantKey: "", passphrase: "", live: false };
    changed = true;
  }
  if ((s.rsvps || []).some((r) => !r.notAttending)) {
    s.rsvps = (s.rsvps || []).map((r) => ({ ...r, notAttending: r.notAttending || [] }));
    changed = true;
  }
  const migratedLayout = migrateSeatingLayout(s.seatingLayout, s.tables);
  if (JSON.stringify(migratedLayout) !== JSON.stringify(s.seatingLayout)) {
    s.seatingLayout = migratedLayout;
    changed = true;
  }
  return changed;
}

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    cache = JSON.parse(raw) as Store;
    if (migrate(cache)) await persist();
  } catch {
    cache = emptyStore(buildFamiliesFromRoster(), STORY, BW_QUESTIONS);
    await persist();
  }
  return cache;
}

async function persist() {
  if (!cache) return;
  const data = cache;
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf-8");
  });
  await writeQueue;
}

export async function readStore(): Promise<Store> {
  return load();
}

export async function mutate<T>(fn: (s: Store) => T): Promise<T> {
  const s = await load();
  const result = fn(s);
  await persist();
  return result;
}
