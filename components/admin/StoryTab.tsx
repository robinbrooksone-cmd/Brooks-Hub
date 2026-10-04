"use client";

import { useEffect, useState } from "react";
import {
  addStoryItemAction,
  getStoryAction,
  moveStoryItemAction,
  removeStoryItemAction,
  setStoryItemPositionAction,
  updateStoryItemAction,
  uploadStoryPhotoAction,
} from "@/app/actions";
import type { StoryItem } from "@/lib/types";
import { btnGhost, btnGold, inputStyle, panelStyle } from "./AdminDashboard";
import { Dropzone } from "./Dropzone";

export function StoryTab() {
  const [story, setStory] = useState<StoryItem[]>([]);
  const [drafts, setDrafts] = useState<StoryItem[]>([]);
  const [savedIndex, setSavedIndex] = useState<number | null>(null);

  const refresh = () => getStoryAction().then((s) => (setStory(s), setDrafts(s)));

  useEffect(() => {
    refresh();
  }, []);

  const setField = (i: number, field: "year" | "image", value: string) => {
    setDrafts((d) => d.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  };

  const setTitle = (i: number, lang: "en" | "af", value: string) => {
    setDrafts((d) => d.map((item, idx) => (idx === i ? { ...item, title: { ...item.title, [lang]: value } } : item)));
  };

  const save = async (i: number) => {
    await updateStoryItemAction(i, drafts[i]);
    setSavedIndex(i);
    setTimeout(() => setSavedIndex(null), 1800);
    refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      <p style={{ color: "var(--c-muted)", fontSize: 13 }}>
        Add as many moments as you like for &ldquo;Us Through the Years.&rdquo; Each one just needs a year, a
        title, and a photo — drag one straight onto the box below (or click it to browse your files), or paste a
        link instead. Once a photo's set, drag directly on it to reposition which part shows. Leave the photo
        blank to show a placeholder until you have one.
      </p>
      {drafts.map((item, i) => (
        <div key={i} className="grid gap-4 grid-cols-1 sm:grid-cols-[160px_1fr]" style={panelStyle}>
          <Dropzone
            imageUrl={item.image}
            height={200}
            position={item.position}
            onPositionChange={(pos) => {
              setDrafts((d) => d.map((it, idx) => (idx === i ? { ...it, position: pos } : it)));
              setStoryItemPositionAction(i, pos);
            }}
            onFile={async (file) => {
              const res = await uploadStoryPhotoAction(i, file);
              if (res.error) throw new Error(res.error);
              setField(i, "image", res.url!);
              refresh();
            }}
          />
          <div className="flex flex-col gap-2.5 min-w-0">
            <div className="flex gap-2.5">
              <input value={item.year} onChange={(e) => setField(i, "year", e.target.value)} placeholder="Year" style={{ ...inputStyle, width: 90, minWidth: 0 }} />
              <input value={item.title.af} onChange={(e) => setTitle(i, "af", e.target.value)} placeholder="Titel (Afrikaans) — this is what shows by default" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
            </div>
            <input value={item.title.en} onChange={(e) => setTitle(i, "en", e.target.value)} placeholder="Title (English) — only shown when a guest switches to English" style={inputStyle} />
            <input value={item.image} onChange={(e) => setField(i, "image", e.target.value)} placeholder="…or paste a photo URL instead" style={inputStyle} />
            <div className="flex items-center gap-2 flex-wrap">
              <button style={btnGold} onClick={() => save(i)}>
                Save
              </button>
              {savedIndex === i && <span style={{ color: "#8fe3ad", fontSize: 12 }}>Saved ✓</span>}
              <span style={{ flex: 1 }} />
              <button
                style={{ ...btnGhost, padding: "8px 12px" }}
                disabled={i === 0}
                onClick={async () => {
                  await moveStoryItemAction(i, "up");
                  refresh();
                }}
              >
                ↑
              </button>
              <button
                style={{ ...btnGhost, padding: "8px 12px" }}
                disabled={i === drafts.length - 1}
                onClick={async () => {
                  await moveStoryItemAction(i, "down");
                  refresh();
                }}
              >
                ↓
              </button>
              <button
                style={{ ...btnGhost, padding: "8px 12px", color: "rgba(224,144,122,0.9)" }}
                onClick={async () => {
                  await removeStoryItemAction(i);
                  refresh();
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
      {story.length === 0 && drafts.length === 0 && <div style={{ color: "var(--c-muted)" }}>Loading…</div>}
      <button
        style={btnGold}
        onClick={async () => {
          await addStoryItemAction();
          refresh();
        }}
      >
        + Add a Moment
      </button>
    </div>
  );
}
