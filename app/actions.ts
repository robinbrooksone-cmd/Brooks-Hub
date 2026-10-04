"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import * as store from "@/lib/store";
import * as auth from "@/lib/adminAuth";
import { sendBrooksWayLaunchEmail, sendRsvpConfirmationEmail } from "@/lib/email";
import { uploadPhoto } from "@/lib/storage";
import { buildPayfastCheckout, resolvePayfastCredentials, type PayfastCheckout } from "@/lib/payfast";
import type { BwGame, BwQuestion, PayfastSettings, RsvpMember, SeatingLayout, StoryItem } from "@/lib/types";
import type { Family } from "@/lib/roster";

const GAME_TITLES: Record<BwGame, string> = { ceremony: "Ceremony Predictions", reception: "Reception Predictions" };

async function siteBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") || "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

// ---------- Public: Story ----------

export async function getStoryAction(): Promise<StoryItem[]> {
  return store.getStory();
}

// ---------- Public: RSVP ----------

export async function searchFamiliesAction(query: string): Promise<Family[]> {
  return store.searchFamilies(query);
}

export async function getFamilyAction(id: string): Promise<Family | undefined> {
  return store.getFamily(id);
}

export async function submitRsvpAction(input: {
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
  const rsvp = await store.submitRsvp(input);
  revalidatePath("/admin");

  if (input.email && input.email !== "—") {
    await sendRsvpConfirmationEmail(
      input.email,
      rsvp.family,
      input.members.map((m) => m.name),
      await siteBaseUrl()
    );
  }

  return rsvp;
}

// ---------- Public: BrooksWay ----------

export async function getBwStateAction() {
  return store.getBwState();
}

export async function getBwQuestionsAction() {
  return store.getBwQuestions();
}

export async function submitBwSlipAction(input: { game: BwGame; name: string; answers: Record<number, number> }) {
  const slip = await store.submitBwSlip(input);
  revalidatePath("/admin");
  return slip;
}

export async function getMySlipsAction(ids: string[]) {
  if (ids.length === 0) return [];
  const all = await store.getBwSlips();
  const set = new Set(ids);
  return all.filter((s) => set.has(s.id));
}

export async function startPayfastCheckoutAction(slipId: string): Promise<PayfastCheckout> {
  const all = await store.getBwSlips();
  const slip = all.find((s) => s.id === slipId);
  if (!slip) throw new Error("Slip not found");

  const settings = await store.getPayfastSettings();
  const creds = resolvePayfastCredentials(settings);
  const base = await siteBaseUrl();
  return buildPayfastCheckout(creds, {
    mPaymentId: slip.id,
    amount: 50,
    itemName: `BrooksWay slip — ${GAME_TITLES[slip.game]}`,
    itemDescription: `Slip #${slip.ticket} for ${slip.name}`,
    nameFirst: slip.name,
    returnUrl: `${base}/games?paid=${slip.id}`,
    cancelUrl: `${base}/games?cancelled=${slip.id}`,
    notifyUrl: `${base}/api/payfast/notify`,
  });
}

// ---------- Public: PayFast status (for the "test mode" banner) ----------

export async function getPayfastStatusAction(): Promise<{ isLive: boolean }> {
  const settings = await store.getPayfastSettings();
  const creds = resolvePayfastCredentials(settings);
  return { isLive: creds.live };
}

// ---------- Admin: PayFast settings ----------

export async function getPayfastSettingsAction(): Promise<PayfastSettings> {
  await auth.requireAdmin();
  return store.getPayfastSettings();
}

export async function setPayfastSettingsAction(settings: PayfastSettings) {
  await auth.requireAdmin();
  await store.setPayfastSettings(settings);
  revalidatePath("/admin");
  revalidatePath("/games");
}

// ---------- Public: photo overrides ----------

export async function getPhotosAction() {
  return store.getPhotos();
}

export async function getPhotoPositionsAction() {
  return store.getPhotoPositions();
}

// ---------- Public: copy overrides ----------

export async function getCopyAction() {
  return store.getCopy();
}


// ---------- Admin auth ----------

export async function adminLoginAction(pin: string): Promise<boolean> {
  const ok = await auth.checkPin(pin);
  if (ok) await auth.setAdminCookie();
  return ok;
}

export async function adminLogoutAction() {
  await auth.clearAdminCookie();
  revalidatePath("/admin");
}

// ---------- Admin: overview / rsvps ----------

export async function getRsvpsAction() {
  await auth.requireAdmin();
  return store.getRsvps();
}

// ---------- Admin: guest list ----------

export async function getFamiliesAction() {
  await auth.requireAdmin();
  return store.getFamilies();
}

export async function addFamilyAction(name: string, side: "Bride" | "Groom") {
  await auth.requireAdmin();
  const f = await store.addFamily(name, side);
  revalidatePath("/admin");
  return f;
}

export async function addMemberAction(familyId: string, name: string) {
  await auth.requireAdmin();
  await store.addMember(familyId, name);
  revalidatePath("/admin");
}

export async function addGuestAction(name: string, side: "Bride" | "Groom", familyId?: string, isBaby?: boolean) {
  await auth.requireAdmin();
  await store.addGuest(name, side, familyId, isBaby);
  revalidatePath("/admin");
}

export async function setGuestIsBabyAction(familyId: string, memberId: string, isBaby: boolean) {
  await auth.requireAdmin();
  await store.setGuestIsBaby(familyId, memberId, isBaby);
  revalidatePath("/admin");
}

export async function removeMemberAction(familyId: string, memberId: string) {
  await auth.requireAdmin();
  await store.removeMember(familyId, memberId);
  revalidatePath("/admin");
}

export async function toggleFamilySideAction(familyId: string) {
  await auth.requireAdmin();
  await store.toggleFamilySide(familyId);
  revalidatePath("/admin");
}

export async function removeFamilyAction(familyId: string) {
  await auth.requireAdmin();
  await store.removeFamily(familyId);
  revalidatePath("/admin");
}

// ---------- Admin: planner ----------

export async function getPlannerAction() {
  await auth.requireAdmin();
  return store.getPlanner();
}

export async function addTaskAction(title: string, date: string) {
  await auth.requireAdmin();
  await store.addTask(title, date);
  revalidatePath("/admin");
}

export async function toggleTaskAction(id: string) {
  await auth.requireAdmin();
  await store.toggleTask(id);
  revalidatePath("/admin");
}

export async function removeTaskAction(id: string) {
  await auth.requireAdmin();
  await store.removeTask(id);
  revalidatePath("/admin");
}

export async function addPaymentAction(vendor: string, amount: string, date: string) {
  await auth.requireAdmin();
  await store.addPayment(vendor, amount, date);
  revalidatePath("/admin");
}

export async function togglePaymentAction(id: string) {
  await auth.requireAdmin();
  await store.togglePayment(id);
  revalidatePath("/admin");
}

export async function removePaymentAction(id: string) {
  await auth.requireAdmin();
  await store.removePayment(id);
  revalidatePath("/admin");
}

// ---------- Admin: seating floor plan ----------

export async function getSeatingLayoutAction(): Promise<SeatingLayout> {
  await auth.requireAdmin();
  return store.getSeatingLayout();
}

export async function saveSeatingLayoutAction(layout: SeatingLayout) {
  await auth.requireAdmin();
  await store.saveSeatingLayout(layout);
  revalidatePath("/admin");
}

// ---------- Admin: BrooksWay management ----------

export async function getBwSlipsAdminAction() {
  await auth.requireAdmin();
  return store.getBwSlips();
}

export async function markSlipPaidAction(id: string, paid: boolean) {
  await auth.requireAdmin();
  await store.markSlipPaid(id, paid);
  revalidatePath("/admin");
}

export async function setBwResultAction(game: BwGame, questionIndex: number, answer: number) {
  await auth.requireAdmin();
  await store.setBwResult(game, questionIndex, answer);
  revalidatePath("/admin");
  revalidatePath("/games");
}

export async function setBwRevealedAction(game: BwGame, revealed: boolean) {
  await auth.requireAdmin();
  await store.setBwRevealed(game, revealed);
  revalidatePath("/admin");
  revalidatePath("/games");
}

export async function setBwLaunchedAction(game: BwGame, launched: boolean) {
  await auth.requireAdmin();
  await store.setBwLaunched(game, launched);
  revalidatePath("/admin");
  revalidatePath("/games");
}

export async function setBwPrizeAction(game: BwGame, prize: number) {
  await auth.requireAdmin();
  await store.setBwPrize(game, prize);
  revalidatePath("/admin");
  revalidatePath("/games");
}

// ---------- Admin: BrooksWay question bank ----------

export async function addBwQuestionAction(game: BwGame) {
  await auth.requireAdmin();
  await store.addBwQuestion(game);
  revalidatePath("/admin");
  revalidatePath("/games");
}

export async function updateBwQuestionAction(game: BwGame, index: number, item: BwQuestion) {
  await auth.requireAdmin();
  await store.updateBwQuestion(game, index, item);
  revalidatePath("/admin");
  revalidatePath("/games");
}

export async function removeBwQuestionAction(game: BwGame, index: number) {
  await auth.requireAdmin();
  await store.removeBwQuestion(game, index);
  revalidatePath("/admin");
  revalidatePath("/games");
}

export async function moveBwQuestionAction(game: BwGame, index: number, direction: "up" | "down") {
  await auth.requireAdmin();
  await store.moveBwQuestion(game, index, direction);
  revalidatePath("/admin");
  revalidatePath("/games");
}

// ---------- Admin: guest notifications ----------

export async function notifyGuestsBwLaunchedAction(): Promise<{ sent: number; skipped: number; error?: string }> {
  await auth.requireAdmin();
  const emails = await store.getUnnotifiedRsvpEmails();
  if (emails.length === 0) return { sent: 0, skipped: 0 };
  const result = await sendBrooksWayLaunchEmail(emails, await siteBaseUrl());
  if (result.sent.length > 0) await store.markEmailsNotified(result.sent);
  return { sent: result.sent.length, skipped: result.failed.length, error: result.error };
}

export async function getUnnotifiedCountAction(): Promise<number> {
  await auth.requireAdmin();
  const emails = await store.getUnnotifiedRsvpEmails();
  return emails.length;
}

// ---------- Admin: Story timeline ----------

export async function updateStoryItemAction(index: number, item: StoryItem) {
  await auth.requireAdmin();
  await store.updateStoryItem(index, item);
  revalidatePath("/admin");
  revalidatePath("/story");
}

export async function addStoryItemAction() {
  await auth.requireAdmin();
  await store.addStoryItem();
  revalidatePath("/admin");
  revalidatePath("/story");
}

export async function removeStoryItemAction(index: number) {
  await auth.requireAdmin();
  await store.removeStoryItem(index);
  revalidatePath("/admin");
  revalidatePath("/story");
}

export async function moveStoryItemAction(index: number, direction: "up" | "down") {
  await auth.requireAdmin();
  await store.moveStoryItem(index, direction);
  revalidatePath("/admin");
  revalidatePath("/story");
}

// ---------- Admin: site photos ----------

export async function setPhotoAction(slot: string, url: string) {
  await auth.requireAdmin();
  await store.setPhoto(slot, url);
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/wedding-party");
  revalidatePath("/dress-code");
  revalidatePath("/story");
  revalidatePath("/wedding-day");
  revalidatePath("/travel");
  revalidatePath("/registry");
  revalidatePath("/faq");
  revalidatePath("/contact");
}

export async function setPhotoPositionAction(slot: string, position: { x: number; y: number }) {
  await auth.requireAdmin();
  await store.setPhotoPosition(slot, position);
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/wedding-party");
  revalidatePath("/dress-code");
  revalidatePath("/story");
  revalidatePath("/wedding-day");
  revalidatePath("/travel");
  revalidatePath("/registry");
  revalidatePath("/faq");
  revalidatePath("/contact");
}

export async function uploadPhotoAction(slot: string, file: File): Promise<{ url?: string; error?: string }> {
  await auth.requireAdmin();
  try {
    const url = await uploadPhoto(file, slot);
    await store.setPhoto(slot, url);
    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/wedding-party");
    revalidatePath("/dress-code");
    revalidatePath("/story");
    revalidatePath("/wedding-day");
    revalidatePath("/travel");
    revalidatePath("/registry");
    revalidatePath("/faq");
    revalidatePath("/contact");
    return { url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
}

export async function uploadStoryPhotoAction(index: number, file: File): Promise<{ url?: string; error?: string }> {
  await auth.requireAdmin();
  try {
    const url = await uploadPhoto(file, `story-${index}-${Date.now()}`);
    await store.setStoryItemImage(index, url);
    revalidatePath("/admin");
    revalidatePath("/story");
    return { url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
}

export async function setStoryItemPositionAction(index: number, position: { x: number; y: number }) {
  await auth.requireAdmin();
  await store.setStoryItemPosition(index, position);
  revalidatePath("/admin");
  revalidatePath("/story");
}

// ---------- Admin: site copy (English / Afrikaans text) ----------

export async function updateCopyEntryAction(key: string, en: string, af: string) {
  await auth.requireAdmin();
  await store.setCopyEntry(key, en, af);
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/wedding-party");
  revalidatePath("/dress-code");
  revalidatePath("/story");
  revalidatePath("/wedding-day");
  revalidatePath("/travel");
  revalidatePath("/registry");
  revalidatePath("/faq");
  revalidatePath("/contact");
  revalidatePath("/rsvp");
  revalidatePath("/games");
}
