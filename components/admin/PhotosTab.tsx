"use client";

import { useEffect, useState } from "react";
import { getPhotoPositionsAction, getPhotosAction, setPhotoAction, setPhotoPositionAction, uploadPhotoAction } from "@/app/actions";
import { BRIDESMAIDS, GROOMSMEN } from "@/lib/content";
import type { PhotoPosition } from "@/lib/types";
import { btnGold, inputStyle, panelStyle } from "./AdminDashboard";
import { Dropzone } from "./Dropzone";

const SITE_SLOTS: { slot: string; label: string }[] = [
  { slot: "/images/hero.webp", label: "Home — hero photo" },
  { slot: "/images/home-band.jpg", label: "Home — engagement photo band" },
  { slot: "/images/home-closing.jpg", label: "Home — closing photo" },
  { slot: "/images/cover-story.jpg", label: "Us Through the Years — cover photo" },
  { slot: "/images/cover-day.jpg", label: "Wedding Day — cover photo" },
  { slot: "/images/cover-travel.jpg", label: "Travel & Stay — cover photo" },
  { slot: "/images/cover-party.jpg", label: "Wedding Party — cover photo" },
  { slot: "/images/cover-dress.jpg", label: "Dress Code — cover photo" },
  { slot: "/images/dress-cover.webp", label: "Dress Code — attire reference board" },
  { slot: "/images/cover-registry.jpg", label: "Registry — cover photo" },
  { slot: "/images/cover-faq.jpg", label: "FAQ — cover photo" },
  { slot: "/images/cover-contact.jpg", label: "Contact — cover photo" },
  { slot: "/images/rsvp-bg.webp", label: "RSVP page — background photo" },
  { slot: "/images/admin-login-bg.jpg", label: "Bride Dashboard — login background photo" },
];

const PARTY_SLOTS: { slot: string; label: string }[] = [
  ...GROOMSMEN.map((m) => ({ slot: `party:${m.name}`, label: `${m.name} (Groomsman)` })),
  ...BRIDESMAIDS.map((m) => ({ slot: `party:${m.name}`, label: `${m.name} (Bridesmaid)` })),
  { slot: "party:Togo", label: "Togo (guest of honour)" },
];

function Row({
  slot,
  label,
  url,
  position,
  onSaved,
}: {
  slot: string;
  label: string;
  url: string;
  position: PhotoPosition;
  onSaved: () => void;
}) {
  const [current, setCurrent] = useState(url);
  const [urlDraft, setUrlDraft] = useState(url);
  const [saved, setSaved] = useState(false);

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-[140px_1fr_auto] items-center" style={{ padding: "12px 0", borderBottom: "1px solid var(--c-line)" }}>
      <Dropzone
        imageUrl={current}
        height={90}
        position={position}
        onPositionChange={(pos) => setPhotoPositionAction(slot, pos)}
        onFile={async (file) => {
          const res = await uploadPhotoAction(slot, file);
          if (res.error) throw new Error(res.error);
          setCurrent(res.url!);
          setUrlDraft(res.url!);
          onSaved();
        }}
      />
      <div>
        <div style={{ fontSize: 13, color: "var(--c-ivory)", marginBottom: 6 }}>{label}</div>
        <input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="…or paste a photo URL instead" style={inputStyle} />
      </div>
      <div className="flex items-center gap-2">
        <button
          style={btnGold}
          onClick={async () => {
            await setPhotoAction(slot, urlDraft);
            setCurrent(urlDraft);
            setSaved(true);
            setTimeout(() => setSaved(false), 1800);
            onSaved();
          }}
        >
          Save
        </button>
        {saved && <span style={{ color: "#8fe3ad", fontSize: 12 }}>✓</span>}
      </div>
    </div>
  );
}

export function PhotosTab() {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [positions, setPositions] = useState<Record<string, PhotoPosition>>({});
  const [loaded, setLoaded] = useState(false);

  const refresh = () =>
    Promise.all([getPhotosAction(), getPhotoPositionsAction()]).then(([p, pos]) => {
      setPhotos(p);
      setPositions(pos);
      setLoaded(true);
    });

  useEffect(() => {
    refresh();
  }, []);

  if (!loaded) return <div style={{ color: "var(--c-muted)" }}>Loading…</div>;

  return (
    <div className="flex flex-col gap-6">
      <p style={{ color: "var(--c-muted)", fontSize: 13 }}>
        Drag a photo straight onto any slot below (or click one to browse your files) to upload it for real — no
        need to host it anywhere else. Once a photo's set, drag directly on it to reposition which part shows.
        You can also paste a link instead if you'd rather. Leave a slot empty and that spot shows a placeholder
        until you add one.
      </p>
      <div style={panelStyle}>
        <h3 className="font-display" style={{ fontSize: 20, color: "var(--c-ivory)", margin: "0 0 8px" }}>
          Site photos
        </h3>
        <div className="flex flex-col">
          {SITE_SLOTS.map((s) => (
            <Row key={s.slot} slot={s.slot} label={s.label} url={photos[s.slot] || ""} position={positions[s.slot] || { x: 50, y: 50 }} onSaved={refresh} />
          ))}
        </div>
      </div>
      <div style={panelStyle}>
        <h3 className="font-display" style={{ fontSize: 20, color: "var(--c-ivory)", margin: "0 0 8px" }}>
          Wedding party photos
        </h3>
        <div className="flex flex-col">
          {PARTY_SLOTS.map((s) => (
            <Row key={s.slot} slot={s.slot} label={s.label} url={photos[s.slot] || ""} position={positions[s.slot] || { x: 50, y: 50 }} onSaved={refresh} />
          ))}
        </div>
      </div>
    </div>
  );
}
