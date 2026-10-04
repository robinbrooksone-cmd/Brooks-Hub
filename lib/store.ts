import * as local from "./localStore";
import * as remote from "./supabaseStore";
import type { Family } from "./roster";
import type { BwGame, BwGameState, BwQuestion, BwSlip, Payment, PayfastSettings, PhotoPosition, RsvpMember, SeatingLayout, Store, StoryItem, Task } from "./types";

function backend() {
  return remote.hasSupabase() ? remote : local;
}

export function usingSupabase() {
  return remote.hasSupabase();
}

export async function readStore(): Promise<Store> {
  return backend().readStore();
}

async function mutate<T>(fn: (s: Store) => T): Promise<T> {
  return backend().mutate(fn);
}

const uid = (prefix: string) => prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- RSVP / families ----------

export async function searchFamilies(query: string): Promise<Family[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const s = await readStore();
  return s.families.filter(
    (f) => f.members.some((m) => m.name.toLowerCase().includes(q)) || f.name.toLowerCase().includes(q)
  );
}

export async function getFamily(id: string): Promise<Family | undefined> {
  const s = await readStore();
  return s.families.find((f) => f.id === id);
}

export async function submitRsvp(input: {
  familyId: string;
  members: RsvpMember[];
  notAttending: RsvpMember[];
  accommodation: string;
  transport: string;
  song: string;
  allergies: string;
  message: string;
  email: string;
  phone: string;
}) {
  return mutate((s) => {
    const family = s.families.find((f) => f.id === input.familyId);
    if (!family) throw new Error("Family not found");
    const rsvp = {
      id: uid("rsvp"),
      familyId: family.id,
      family: family.name,
      side: family.side,
      members: input.members,
      notAttending: input.notAttending || [],
      accommodation: input.accommodation || "—",
      transport: input.transport || "—",
      song: input.song || "—",
      allergies: input.allergies || "—",
      message: input.message || "",
      email: input.email || "—",
      phone: input.phone || "—",
      createdAt: Date.now(),
    };
    s.rsvps = [rsvp, ...s.rsvps.filter((r) => r.familyId !== family.id)];
    return rsvp;
  });
}

export async function getRsvps() {
  const s = await readStore();
  return s.rsvps;
}

// ---------- Guest list (admin) ----------

export async function getFamilies() {
  const s = await readStore();
  return s.families;
}

export async function addFamily(name: string, side: "Bride" | "Groom") {
  return mutate((s) => {
    const family: Family = { id: uid("fam"), name, side, members: [] };
    s.families.push(family);
    return family;
  });
}

/**
 * Add one guest. Everything downstream (RSVP, counts, seating) works off
 * individual members, so a brand-new household is created WITH this person
 * already in it — a household with no members is a guest nobody can see.
 */
export async function addGuest(name: string, side: "Bride" | "Groom", familyId?: string, isBaby?: boolean) {
  return mutate((s) => {
    const member = isBaby ? { id: uid("g"), name, isBaby: true } : { id: uid("g"), name };
    if (familyId) {
      const f = s.families.find((x) => x.id === familyId);
      if (!f) throw new Error("Household not found");
      f.members.push(member);
      return f;
    }
    const family: Family = { id: uid("fam"), name, side, members: [member] };
    s.families.push(family);
    return family;
  });
}

/** Flip a person between "counts as a guest" and "is a baby". */
export async function setGuestIsBaby(familyId: string, memberId: string, isBaby: boolean) {
  return mutate((s) => {
    const f = s.families.find((x) => x.id === familyId);
    if (!f) throw new Error("Household not found");
    const m = f.members.find((x) => x.id === memberId);
    if (!m) throw new Error("Guest not found");
    if (isBaby) m.isBaby = true;
    else delete m.isBaby;
  });
}

export async function addMember(familyId: string, name: string) {
  return mutate((s) => {
    const f = s.families.find((x) => x.id === familyId);
    if (!f) throw new Error("Family not found");
    f.members.push({ id: uid("g"), name });
    return f;
  });
}

export async function removeMember(familyId: string, memberId: string) {
  return mutate((s) => {
    s.families = s.families
      .map((f) => (f.id === familyId ? { ...f, members: f.members.filter((m) => m.id !== memberId) } : f))
      .filter((f) => f.members.length > 0);
  });
}

export async function toggleFamilySide(familyId: string) {
  return mutate((s) => {
    const f = s.families.find((x) => x.id === familyId);
    if (f) f.side = f.side === "Bride" ? "Groom" : "Bride";
  });
}

export async function removeFamily(familyId: string) {
  return mutate((s) => {
    s.families = s.families.filter((f) => f.id !== familyId);
  });
}

// ---------- Planner: tasks + payments ----------

export async function getPlanner() {
  const s = await readStore();
  return { tasks: s.tasks, payments: s.payments };
}

export async function addTask(title: string, date: string) {
  return mutate((s) => {
    const task: Task = { id: uid("task"), title, date, done: false };
    s.tasks.push(task);
    return task;
  });
}

export async function toggleTask(id: string) {
  return mutate((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (t) t.done = !t.done;
  });
}

export async function removeTask(id: string) {
  return mutate((s) => {
    s.tasks = s.tasks.filter((x) => x.id !== id);
  });
}

export async function addPayment(vendor: string, amount: string, date: string) {
  return mutate((s) => {
    const p: Payment = { id: uid("pay"), vendor, amount, date, paid: false };
    s.payments.push(p);
    return p;
  });
}

export async function togglePayment(id: string) {
  return mutate((s) => {
    const p = s.payments.find((x) => x.id === id);
    if (p) p.paid = !p.paid;
  });
}

export async function removePayment(id: string) {
  return mutate((s) => {
    s.payments = s.payments.filter((x) => x.id !== id);
  });
}

// ---------- Seating floor plan ----------

export async function getSeatingLayout(): Promise<SeatingLayout> {
  const s = await readStore();
  return s.seatingLayout;
}

/** Full-replace save — the floor-plan editor owns the whole layout client-side and autosaves it here. */
export async function saveSeatingLayout(layout: SeatingLayout) {
  return mutate((s) => {
    s.seatingLayout = layout;
  });
}

// ---------- BrooksWay ----------

export async function submitBwSlip(input: { game: BwGame; name: string; answers: Record<number, number> }) {
  return mutate((s) => {
    const ticket = Math.floor(100000 + Math.random() * 900000).toString();
    const slip: BwSlip = { id: uid("slip"), ticket, game: input.game, name: input.name, answers: input.answers, paid: false, createdAt: Date.now() };
    s.bwSlips.push(slip);
    return slip;
  });
}

export async function markSlipPaid(id: string, paid = true) {
  return mutate((s) => {
    const slip = s.bwSlips.find((x) => x.id === id);
    if (slip) slip.paid = paid;
  });
}

export async function getBwSlips() {
  const s = await readStore();
  return s.bwSlips;
}

export async function getBwState() {
  const s = await readStore();
  return s.bwState;
}

export async function setBwResult(game: BwGame, questionIndex: number, answer: number) {
  return mutate((s) => {
    s.bwState[game].results[questionIndex] = answer;
  });
}

export async function setBwRevealed(game: BwGame, revealed: boolean) {
  return mutate((s) => {
    s.bwState[game].revealed = revealed;
  });
}

export async function setBwLaunched(game: BwGame, launched: boolean) {
  return mutate((s) => {
    s.bwState[game].launched = launched;
  });
}

export async function setBwPrize(game: BwGame, prize: number) {
  return mutate((s) => {
    s.bwState[game].prize = prize;
  });
}

// ---------- BrooksWay question bank ----------

export async function getBwQuestions() {
  const s = await readStore();
  return s.bwQuestions;
}

export async function addBwQuestion(game: BwGame) {
  return mutate((s) => {
    s.bwQuestions[game].push({
      q: { en: "New question", af: "Nuwe vraag" },
      options: [
        { en: "Option A", af: "Opsie A" },
        { en: "Option B", af: "Opsie B" },
      ],
    });
  });
}

export async function updateBwQuestion(game: BwGame, index: number, item: BwQuestion) {
  return mutate((s) => {
    if (!s.bwQuestions[game][index]) throw new Error("Question not found");
    s.bwQuestions[game][index] = item;
  });
}

export async function removeBwQuestion(game: BwGame, index: number) {
  return mutate((s) => {
    s.bwQuestions[game] = s.bwQuestions[game].filter((_, i) => i !== index);
  });
}

export async function moveBwQuestion(game: BwGame, index: number, direction: "up" | "down") {
  return mutate((s) => {
    const list = s.bwQuestions[game];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= list.length) return;
    const copy = [...list];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    s.bwQuestions[game] = copy;
  });
}

// ---------- Site photo overrides ----------

export async function getPhotos() {
  const s = await readStore();
  return s.photos;
}

export async function setPhoto(slot: string, url: string) {
  return mutate((s) => {
    if (url) s.photos[slot] = url;
    else delete s.photos[slot];
  });
}

export async function getPhotoPositions() {
  const s = await readStore();
  return s.photoPositions;
}

export async function setPhotoPosition(slot: string, position: PhotoPosition) {
  return mutate((s) => {
    s.photoPositions[slot] = position;
  });
}

// ---------- Site copy (English / Afrikaans text overrides) ----------

export async function getCopy() {
  const s = await readStore();
  return s.copy;
}

export async function setCopyEntry(key: string, en: string, af: string) {
  return mutate((s) => {
    s.copy[key] = { en, af };
  });
}

// ---------- PayFast settings (BrooksWay payments) ----------

export async function getPayfastSettings() {
  const s = await readStore();
  return s.payfast;
}

export async function setPayfastSettings(settings: PayfastSettings) {
  return mutate((s) => {
    s.payfast = settings;
  });
}

// ---------- Guest notifications ----------

export async function getUnnotifiedRsvpEmails(): Promise<string[]> {
  const s = await readStore();
  const notified = new Set(s.notifiedEmails);
  const emails = new Set<string>();
  s.rsvps.forEach((r) => {
    if (r.email && r.email !== "—" && !notified.has(r.email)) emails.add(r.email);
  });
  return [...emails];
}

export async function markEmailsNotified(emails: string[]) {
  return mutate((s) => {
    const set = new Set(s.notifiedEmails);
    emails.forEach((e) => set.add(e));
    s.notifiedEmails = [...set];
  });
}

// ---------- Story timeline ----------

export async function getStory(): Promise<StoryItem[]> {
  const s = await readStore();
  return s.story;
}

export async function updateStoryItem(index: number, item: StoryItem) {
  return mutate((s) => {
    if (!s.story[index]) throw new Error("Story item not found");
    s.story[index] = item;
  });
}

export async function setStoryItemImage(index: number, image: string) {
  return mutate((s) => {
    if (!s.story[index]) throw new Error("Story item not found");
    s.story[index].image = image;
  });
}

export async function setStoryItemPosition(index: number, position: PhotoPosition) {
  return mutate((s) => {
    if (!s.story[index]) throw new Error("Story item not found");
    s.story[index].position = position;
  });
}

export async function addStoryItem() {
  return mutate((s) => {
    s.story.push({ year: "", title: { en: "New moment", af: "Nuwe oomblik" }, image: "" });
  });
}

export async function removeStoryItem(index: number) {
  return mutate((s) => {
    s.story = s.story.filter((_, i) => i !== index);
  });
}

export async function moveStoryItem(index: number, direction: "up" | "down") {
  return mutate((s) => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= s.story.length) return;
    const copy = [...s.story];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    s.story = copy;
  });
}

export type { BwGameState };
