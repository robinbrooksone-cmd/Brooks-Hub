import { createClient } from "@supabase/supabase-js";
import { buildFamiliesFromRoster } from "./roster";
import { BW_QUESTIONS, STORY } from "./content";
import { emptyStore, type Store } from "./types";
import { migrateAnswerMap, migrateBwQuestions, migrateSeatingLayout, migrateStoryItems } from "./migrateLegacy";

// Supabase-backed persistence. The whole site's state lives as a single JSON
// blob in the `site_state` table (see supabase/schema.sql) — simple, and
// good enough for a low-traffic wedding site. Writes are read-modify-write,
// not row-locked; fine for the light, human-paced concurrency this site sees.

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function hasSupabase() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function migrate(s: Store): void {
  if (!s.story) s.story = STORY;
  s.story = migrateStoryItems(s.story);
  if (!s.bwQuestions) s.bwQuestions = BW_QUESTIONS;
  s.bwQuestions = migrateBwQuestions(s.bwQuestions);
  if (s.bwState.ceremony.launched === undefined) s.bwState.ceremony.launched = false;
  if (s.bwState.reception.launched === undefined) s.bwState.reception.launched = false;
  s.bwState.ceremony.results = migrateAnswerMap(s.bwState.ceremony.results, s.bwQuestions.ceremony);
  s.bwState.reception.results = migrateAnswerMap(s.bwState.reception.results, s.bwQuestions.reception);
  s.bwSlips = (s.bwSlips || []).map((slip) => ({ ...slip, answers: migrateAnswerMap(slip.answers, s.bwQuestions[slip.game]) }));
  if (!s.photos) s.photos = {};
  if (!s.photoPositions) s.photoPositions = {};
  if (!s.notifiedEmails) s.notifiedEmails = [];
  if (!s.copy) s.copy = {};
  if (!s.payfast) s.payfast = { merchantId: "", merchantKey: "", passphrase: "", live: false };
  s.rsvps = (s.rsvps || []).map((r) => ({ ...r, notAttending: r.notAttending || [] }));
  s.seatingLayout = migrateSeatingLayout(s.seatingLayout, s.tables);
}

export async function readStore(): Promise<Store> {
  const sb = client();
  const { data, error } = await sb.from("site_state").select("data").eq("id", "main").maybeSingle();
  if (error) throw error;
  if (!data) {
    const initial = emptyStore(buildFamiliesFromRoster(), STORY, BW_QUESTIONS);
    const { error: insertErr } = await sb.from("site_state").insert({ id: "main", data: initial });
    if (insertErr) {
      // Another concurrent request already created the row (first-ever
      // page load can fire several reads at once) — just read what's there.
      if (insertErr.code === "23505") {
        const { data: retry, error: retryErr } = await sb.from("site_state").select("data").eq("id", "main").maybeSingle();
        if (retryErr) throw retryErr;
        if (retry) {
          const store = retry.data as Store;
          migrate(store);
          return store;
        }
      }
      throw insertErr;
    }
    return initial;
  }
  const store = data.data as Store;
  migrate(store);
  return store;
}

export async function mutate<T>(fn: (s: Store) => T): Promise<T> {
  const sb = client();
  const s = await readStore();
  const result = fn(s);
  const { error } = await sb.from("site_state").update({ data: s }).eq("id", "main");
  if (error) throw error;
  return result;
}
