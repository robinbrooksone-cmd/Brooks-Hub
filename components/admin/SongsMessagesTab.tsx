"use client";

import { useEffect, useState } from "react";
import { getRsvpsAction } from "@/app/actions";
import type { Rsvp } from "@/lib/types";
import { btnGhost, btnGold, panelStyle } from "./AdminDashboard";

function csvEscape(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SongsMessagesTab() {
  const [rsvps, setRsvps] = useState<Rsvp[] | null>(null);

  useEffect(() => {
    getRsvpsAction().then(setRsvps);
  }, []);

  if (!rsvps) return <div style={{ color: "var(--c-muted)" }}>Loading…</div>;

  const songs = rsvps.filter((r) => r.song && r.song !== "—");
  const messages = rsvps.filter((r) => r.message?.trim());

  const downloadMessagesCsv = () => {
    const header = ["Family", "Message", "Email", "Phone", "Submitted"].map(csvEscape).join(",");
    const rows = messages.map((r) =>
      [r.family, r.message, r.email, r.phone, new Date(r.createdAt).toLocaleString()].map((v) => csvEscape(v || "")).join(",")
    );
    downloadFile("messages-for-the-couple.csv", [header, ...rows].join("\n"), "text/csv");
  };

  const downloadMessagesTxt = () => {
    const text = messages
      .map((r) => `${r.family}${r.email && r.email !== "—" ? ` (${r.email})` : ""}\n${r.message}\n`)
      .join("\n---\n\n");
    downloadFile("messages-for-the-couple.txt", text, "text/plain");
  };

  const downloadSongsCsv = () => {
    const header = ["Family", "Song"].map(csvEscape).join(",");
    const rows = songs.map((r) => [r.family, r.song].map((v) => csvEscape(v || "")).join(","));
    downloadFile("song-requests.csv", [header, ...rows].join("\n"), "text/csv");
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex justify-between items-center flex-wrap gap-3" style={{ marginBottom: 14 }}>
          <h3 className="font-display" style={{ fontSize: 22, color: "var(--c-ivory)", margin: 0 }}>
            Song Requests <span style={{ color: "var(--c-muted)", fontSize: 14, fontWeight: 400 }}>({songs.length})</span>
          </h3>
          {songs.length > 0 && (
            <button style={btnGhost} onClick={downloadSongsCsv}>
              Download CSV
            </button>
          )}
        </div>
        {songs.length === 0 && <div style={{ color: "var(--c-muted)", fontSize: 13 }}>No song requests yet.</div>}
        <div className="flex flex-col gap-2">
          {songs.map((r) => (
            <div key={r.id} style={panelStyle} className="flex justify-between items-center flex-wrap gap-2">
              <span style={{ color: "var(--c-ivory)", fontSize: 15 }}>{r.song}</span>
              <span style={{ color: "var(--c-muted)", fontSize: 12 }}>{r.family}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center flex-wrap gap-3" style={{ marginBottom: 14 }}>
          <h3 className="font-display" style={{ fontSize: 22, color: "var(--c-ivory)", margin: 0 }}>
            Messages for the Couple <span style={{ color: "var(--c-muted)", fontSize: 14, fontWeight: 400 }}>({messages.length})</span>
          </h3>
          {messages.length > 0 && (
            <div className="flex gap-2">
              <button style={btnGhost} onClick={downloadMessagesTxt}>
                Download .txt
              </button>
              <button style={btnGold} onClick={downloadMessagesCsv}>
                Download CSV
              </button>
            </div>
          )}
        </div>
        {messages.length === 0 && <div style={{ color: "var(--c-muted)", fontSize: 13 }}>No messages yet.</div>}
        <div className="flex flex-col gap-3">
          {messages.map((r) => (
            <div key={r.id} style={panelStyle}>
              <div className="flex justify-between items-start flex-wrap gap-2" style={{ marginBottom: 10 }}>
                <div className="font-display" style={{ fontSize: 18, color: "var(--c-ivory)" }}>
                  {r.family}
                </div>
                <div style={{ fontSize: 12, color: "var(--c-muted)" }}>{new Date(r.createdAt).toLocaleString()}</div>
              </div>
              <div style={{ fontSize: 14, color: "var(--c-ivory)", fontStyle: "italic" }}>&ldquo;{r.message}&rdquo;</div>
              {(r.email !== "—" || r.phone !== "—") && (
                <div style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 8 }}>
                  {r.email !== "—" && <span>{r.email}</span>}
                  {r.email !== "—" && r.phone !== "—" && <span> · </span>}
                  {r.phone !== "—" && <span>{r.phone}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
