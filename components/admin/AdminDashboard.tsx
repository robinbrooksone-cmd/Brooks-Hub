"use client";

import { useState } from "react";
import { adminLogoutAction } from "@/app/actions";
import { OverviewTab } from "./OverviewTab";
import { RsvpsTab } from "./RsvpsTab";
import { PlannerTab } from "./PlannerTab";
import { SeatingTab } from "./SeatingTab";
import { GuestsTab } from "./GuestsTab";
import { BrookswayTab } from "./BrookswayTab";
import { StoryTab } from "./StoryTab";
import { PhotosTab } from "./PhotosTab";
import { TextTab } from "./TextTab";
import { SongsMessagesTab } from "./SongsMessagesTab";
import { BabiesTab } from "./BabiesTab";

const TABS = [
  ["overview", "Overview"],
  ["rsvps", "RSVP's"],
  ["songs", "Songs & Messages"],
  ["planner", "To-Do & Payments"],
  ["seating", "Seating Tool"],
  ["guests", "Guest List"],
  ["babies", "Babies"],
  ["story", "Story"],
  ["photos", "Photos"],
  ["text", "Text"],
  ["brookway", "BrooksWay"],
] as const;

type Tab = (typeof TABS)[number][0];

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="mx-auto" style={{ maxWidth: 1100 }}>
      <div className="flex justify-between items-center flex-wrap gap-4" style={{ marginBottom: 30 }}>
        <div>
          <div className="text-[11px] uppercase" style={{ letterSpacing: "0.3em", color: "var(--c-gold)" }}>
            Robin &amp; Annami
          </div>
          <h1 className="font-display" style={{ fontSize: 34, color: "var(--c-ivory)", margin: "4px 0 0", fontWeight: 500 }}>
            Bride Dashboard
          </h1>
        </div>
        <button
          onClick={async () => {
            await adminLogoutAction();
            onLogout();
          }}
          className="cursor-pointer"
          style={{ padding: "10px 20px", background: "transparent", border: "1px solid var(--c-line)", borderRadius: 30, color: "var(--c-champ)", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase" }}
        >
          Log out
        </button>
      </div>

      <div className="flex gap-2.5 flex-wrap" style={{ marginBottom: 30 }}>
        {TABS.map(([k, label]) => {
          const on = tab === k;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="cursor-pointer whitespace-nowrap"
              style={{
                padding: "10px 18px",
                borderRadius: 30,
                fontSize: 12,
                letterSpacing: "0.06em",
                border: `1px solid ${on ? "var(--c-gold)" : "var(--c-line)"}`,
                background: on ? "var(--c-gold)" : "transparent",
                color: on ? "#fff" : "var(--c-champ)",
                fontWeight: on ? 600 : 400,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <OverviewTab onJump={(t) => setTab(t as Tab)} />}
      {tab === "rsvps" && <RsvpsTab />}
      {tab === "songs" && <SongsMessagesTab />}
      {tab === "planner" && <PlannerTab />}
      {tab === "seating" && <SeatingTab />}
      {tab === "guests" && <GuestsTab />}
      {tab === "babies" && <BabiesTab />}
      {tab === "story" && <StoryTab />}
      {tab === "photos" && <PhotosTab />}
      {tab === "text" && <TextTab />}
      {tab === "brookway" && <BrookswayTab />}
    </div>
  );
}

export const panelStyle: React.CSSProperties = {
  background: "var(--c-panel)",
  border: "1px solid var(--c-line)",
  borderRadius: 10,
  padding: 24,
};

export const inputStyle: React.CSSProperties = {
  padding: "11px 14px",
  background: "rgba(0,0,0,0.22)",
  border: "1px solid rgba(203,177,144,0.25)",
  borderRadius: 7,
  color: "var(--c-ivory)",
  fontSize: 14,
  outline: "none",
};

export const btnGold: React.CSSProperties = {
  padding: "11px 18px",
  background: "var(--c-gold)",
  border: "none",
  borderRadius: 7,
  color: "#fff",
  fontSize: 12,
  letterSpacing: "0.08em",
  cursor: "pointer",
};

export const btnGhost: React.CSSProperties = {
  padding: "11px 18px",
  background: "transparent",
  border: "1px solid var(--c-line)",
  borderRadius: 7,
  color: "var(--c-champ)",
  fontSize: 12,
  letterSpacing: "0.08em",
  cursor: "pointer",
};
