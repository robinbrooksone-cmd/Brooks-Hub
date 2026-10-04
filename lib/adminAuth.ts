import { cookies } from "next/headers";

const COOKIE = "ra_admin";

function pin() {
  return process.env.ADMIN_PIN || "260526";
}

export async function checkPin(candidate: string): Promise<boolean> {
  return candidate.trim() === pin();
}

export async function setAdminCookie() {
  const store = await cookies();
  // No maxAge — a session cookie, cleared when the browser fully closes, so
  // the PIN is required again next time rather than staying logged in for
  // weeks on a device someone else might pick up.
  store.set(COOKIE, pin(), { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function clearAdminCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE)?.value === pin();
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Not authorized");
}
