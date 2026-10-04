import { createClient } from "@supabase/supabase-js";

// Real file uploads (drag-and-drop) into Supabase Storage, so admin photo
// editors don't require guests — or the couple — to host images elsewhere
// and paste a link. Uses the same Supabase project as the rest of the site.

const BUCKET = "photos";

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing — image upload needs Supabase configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function uploadPhoto(file: File, slot: string): Promise<string> {
  const sb = client();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const safeSlot = slot.replace(/[^a-zA-Z0-9_-]/g, "_");
  const path = `${safeSlot}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await sb.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw error;

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
