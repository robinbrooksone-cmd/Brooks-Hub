"use client";

import { useEffect, useMemo, useState } from "react";
import { getCopyAction, updateCopyEntryAction } from "@/app/actions";
import { DICT, type DictKey } from "@/lib/dict";
import { buildContentCopyEntries } from "@/lib/contentCopy";
import { btnGold, inputStyle, panelStyle } from "./AdminDashboard";

function labelFor(key: string) {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const ENTRIES: { key: string; label: string; en: string; af: string }[] = [
  ...(Object.keys(DICT) as DictKey[]).map((k) => ({ key: k, label: labelFor(k), en: DICT[k].en, af: DICT[k].af })),
  ...buildContentCopyEntries(),
];

function Row({
  keyName,
  label,
  defaultEn,
  defaultAf,
  overrideEn,
  overrideAf,
  onSaved,
}: {
  keyName: string;
  label: string;
  defaultEn: string;
  defaultAf: string;
  overrideEn?: string;
  overrideAf?: string;
  onSaved: (en: string, af: string) => void;
}) {
  const [en, setEn] = useState(overrideEn ?? defaultEn);
  const [af, setAf] = useState(overrideAf ?? defaultAf);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const long = defaultEn.length > 60 || defaultAf.length > 60;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await updateCopyEntryAction(keyName, en, af);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
      onSaved(en, af);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid var(--c-line)" }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: "var(--c-gold)", letterSpacing: "0.06em" }}>{label}</span>
        <span style={{ fontSize: 10, color: "var(--c-muted)", fontFamily: "monospace" }}>{keyName}</span>
      </div>
      <div className={`grid gap-2 ${long ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
        {long ? (
          <textarea value={af} onChange={(e) => setAf(e.target.value)} rows={2} placeholder="Afrikaans (shown by default)" style={{ ...inputStyle, resize: "vertical" }} />
        ) : (
          <input value={af} onChange={(e) => setAf(e.target.value)} placeholder="Afrikaans (shown by default)" style={inputStyle} />
        )}
        {long ? (
          <textarea value={en} onChange={(e) => setEn(e.target.value)} rows={2} placeholder="English" style={{ ...inputStyle, resize: "vertical" }} />
        ) : (
          <input value={en} onChange={(e) => setEn(e.target.value)} placeholder="English" style={inputStyle} />
        )}
      </div>
      <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
        <button
          style={{ ...btnGold, opacity: saving ? 0.6 : 1, cursor: saving ? "default" : "pointer" }}
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span style={{ color: "#8fe3ad", fontSize: 12 }}>Saved ✓</span>}
        {error && <span style={{ color: "#e0907a", fontSize: 12 }}>{error}</span>}
      </div>
    </div>
  );
}

export function TextTab() {
  const [overrides, setOverrides] = useState<Record<string, { en: string; af: string }>>({});
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");

  const refresh = () => getCopyAction().then((c) => (setOverrides(c), setLoaded(true)));

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ENTRIES;
    return ENTRIES.filter(
      (e) => e.key.toLowerCase().includes(q) || e.label.toLowerCase().includes(q) || e.en.toLowerCase().includes(q) || e.af.toLowerCase().includes(q)
    );
  }, [search]);

  if (!loaded) return <div style={{ color: "var(--c-muted)" }}>Loading…</div>;

  return (
    <div className="flex flex-col gap-5">
      <p style={{ color: "var(--c-muted)", fontSize: 13 }}>
        Every piece of English/Afrikaans copy on the site, in one place — nav labels, headings, FAQ, travel info,
        the day-of timeline, all of it. Fix a typo, tighten a phrase, whatever — edit either language and hit
        Save. Changes show up on the live site immediately.
      </p>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search text or a section name (e.g. rsvp, dress, faq)…"
        style={inputStyle}
      />
      <div style={panelStyle}>
        <div className="flex flex-col">
          {filtered.map((e) => (
            <Row
              key={e.key}
              keyName={e.key}
              label={e.label}
              defaultEn={e.en}
              defaultAf={e.af}
              overrideEn={overrides[e.key]?.en}
              overrideAf={overrides[e.key]?.af}
              onSaved={(en, af) => setOverrides((prev) => ({ ...prev, [e.key]: { en, af } }))}
            />
          ))}
          {filtered.length === 0 && <div style={{ color: "var(--c-muted)", fontSize: 13, padding: "12px 0" }}>No matches.</div>}
        </div>
      </div>
    </div>
  );
}
