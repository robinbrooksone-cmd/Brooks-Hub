"use client";

import { useEffect, useState } from "react";
import {
  addBwQuestionAction,
  getBwQuestionsAction,
  getBwSlipsAdminAction,
  getBwStateAction,
  getPayfastSettingsAction,
  getUnnotifiedCountAction,
  markSlipPaidAction,
  moveBwQuestionAction,
  notifyGuestsBwLaunchedAction,
  removeBwQuestionAction,
  setBwLaunchedAction,
  setBwPrizeAction,
  setBwResultAction,
  setBwRevealedAction,
  setPayfastSettingsAction,
  updateBwQuestionAction,
} from "@/app/actions";
import type { BwGame, BwGameState, BwQuestion, BwSlip, PayfastSettings } from "@/lib/types";
import { btnGhost, btnGold, inputStyle, panelStyle } from "./AdminDashboard";

type BwState = { ceremony: BwGameState; reception: BwGameState };
type BwQuestions = { ceremony: BwQuestion[]; reception: BwQuestion[] };

export function BrookswayTab() {
  const [game, setGame] = useState<BwGame>("ceremony");
  const [state, setState] = useState<BwState | null>(null);
  const [questions, setQuestions] = useState<BwQuestions | null>(null);
  const [slips, setSlips] = useState<BwSlip[]>([]);
  const [unnotified, setUnnotified] = useState(0);
  const [notifying, setNotifying] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

  const refresh = () => {
    getBwStateAction().then(setState);
    getBwQuestionsAction().then(setQuestions);
    getBwSlipsAdminAction().then(setSlips);
    getUnnotifiedCountAction().then(setUnnotified);
  };

  useEffect(() => {
    refresh();
  }, []);

  const gameSlips = slips.filter((s) => s.game === game);
  const gState = state?.[game];
  const gQuestions = questions?.[game] || [];

  const sendNotify = async () => {
    setNotifying(true);
    const res = await notifyGuestsBwLaunchedAction();
    if (res.error && res.sent === 0) {
      setNotifyMsg(res.error);
    } else {
      setNotifyMsg(`Sent to ${res.sent} guest${res.sent === 1 ? "" : "s"}${res.skipped ? `, ${res.skipped} failed` : ""}.`);
    }
    setNotifying(false);
    refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2.5">
        {(["ceremony", "reception"] as BwGame[]).map((g) => (
          <button
            key={g}
            onClick={() => setGame(g)}
            className="cursor-pointer capitalize"
            style={{ padding: "9px 18px", borderRadius: 30, fontSize: 12, border: `1px solid ${game === g ? "var(--c-gold)" : "var(--c-line)"}`, background: game === g ? "var(--c-gold)" : "transparent", color: game === g ? "#fff" : "var(--c-champ)" }}
          >
            {g}
          </button>
        ))}
      </div>

      <PayfastSettingsPanel />

      <div style={panelStyle}>
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <div className="font-display" style={{ fontSize: 20, color: "var(--c-ivory)" }}>
              {gState?.launched ? "Live for guests" : "Not launched yet"}
            </div>
            <div style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 4 }}>
              {gState?.launched ? "Guests can build slips for this game right now." : "Guests see “Coming soon” until you launch it."}
            </div>
          </div>
          <button
            style={gState?.launched ? btnGhost : btnGold}
            onClick={async () => {
              await setBwLaunchedAction(game, !gState?.launched);
              refresh();
            }}
          >
            {gState?.launched ? "Un-launch" : "Launch this game"}
          </button>
        </div>
      </div>

      <div style={panelStyle}>
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div className="font-display" style={{ fontSize: 20, color: "var(--c-ivory)" }}>
            Bar tab prize
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--c-muted)" }}>R</span>
            <input
              type="number"
              defaultValue={gState?.prize ?? 1000}
              key={game + (gState?.prize ?? 0)}
              onBlur={async (e) => {
                await setBwPrizeAction(game, Number(e.target.value));
                refresh();
              }}
              style={{ ...inputStyle, width: 90 }}
            />
            <button
              style={gState?.revealed ? btnGhost : btnGold}
              onClick={async () => {
                await setBwRevealedAction(game, !gState?.revealed);
                refresh();
              }}
            >
              {gState?.revealed ? "Hide winners" : "Reveal winners"}
            </button>
          </div>
        </div>
      </div>

      <div style={panelStyle}>
        <div className="flex justify-between items-center flex-wrap gap-2" style={{ marginBottom: 6 }}>
          <div className="font-display" style={{ fontSize: 20, color: "var(--c-ivory)" }}>
            Notify RSVP&apos;d guests
          </div>
          <button style={btnGold} disabled={notifying || unnotified === 0} onClick={sendNotify}>
            {notifying ? "Sending…" : `Notify ${unnotified} guest${unnotified === 1 ? "" : "s"}`}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--c-muted)", margin: 0 }}>
          Sends a &ldquo;BrooksWay is open&rdquo; email to every RSVP&apos;d guest who hasn&apos;t already been
          notified. Launch the game(s) you want live first, then notify.
        </p>
        {notifyMsg && <p style={{ fontSize: 12, color: "#8fe3ad", marginTop: 8 }}>{notifyMsg}</p>}
      </div>

      <QuestionBank game={game} questions={gQuestions} onChange={refresh} />

      <div style={panelStyle}>
        <h3 className="font-display" style={{ fontSize: 20, color: "var(--c-ivory)", margin: "0 0 14px" }}>
          Set actual answers
        </h3>
        <div className="flex flex-col gap-3">
          {gQuestions.map((q, i) => (
            <div key={i} className="flex justify-between items-center flex-wrap gap-2" style={{ padding: "10px 0", borderBottom: "1px solid var(--c-line)" }}>
              <div style={{ fontSize: 13, color: "var(--c-ivory)", flex: 1, minWidth: 200 }}>{q.q.en}</div>
              <select
                value={gState?.results[i] ?? ""}
                onChange={async (e) => {
                  await setBwResultAction(game, i, Number(e.target.value));
                  refresh();
                }}
                style={{ ...inputStyle, fontSize: 12 }}
              >
                <option value="">Not decided yet</option>
                {q.options.map((o, oi) => (
                  <option key={oi} value={oi}>
                    {o.en}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {gQuestions.length === 0 && <div style={{ color: "var(--c-muted)", fontSize: 13 }}>No questions yet — add some above.</div>}
        </div>
      </div>

      <div style={panelStyle}>
        <h3 className="font-display" style={{ fontSize: 20, color: "var(--c-ivory)", margin: "0 0 14px" }}>
          Slips ({gameSlips.length})
        </h3>
        <div className="flex flex-col gap-2">
          {gameSlips.map((s) => {
            let correct = 0;
            Object.keys(s.answers).forEach((k) => {
              if (gState?.results[Number(k)] === s.answers[Number(k)]) correct++;
            });
            return (
              <div key={s.id} className="flex justify-between items-center flex-wrap gap-2" style={{ padding: "10px 0", borderBottom: "1px solid var(--c-line)" }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--c-ivory)" }}>
                    {s.name} · <span style={{ color: "var(--c-gold)" }}>#{s.ticket}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--c-muted)" }}>
                    {correct} correct · {new Date(s.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await markSlipPaidAction(s.id, !s.paid);
                    refresh();
                  }}
                  className="cursor-pointer"
                  style={{
                    padding: "6px 14px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    border: "none",
                    background: s.paid ? "#0a2a14" : "#2a1e0a",
                    color: s.paid ? "#00E04A" : "#e0c07a",
                  }}
                >
                  {s.paid ? "Paid ✓" : "Mark paid"}
                </button>
              </div>
            );
          })}
          {gameSlips.length === 0 && <div style={{ color: "var(--c-muted)", fontSize: 13 }}>No slips yet for this game.</div>}
        </div>
      </div>
    </div>
  );
}

function PayfastSettingsPanel() {
  const [settings, setSettings] = useState<PayfastSettings | null>(null);
  const [merchantId, setMerchantId] = useState("");
  const [merchantKey, setMerchantKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [live, setLive] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const refresh = () =>
    getPayfastSettingsAction().then((s) => {
      setSettings(s);
      setMerchantId(s.merchantId);
      setMerchantKey(s.merchantKey);
      setPassphrase(s.passphrase);
      setLive(s.live);
    });

  useEffect(() => {
    refresh();
  }, []);

  if (!settings) return null;

  const hasRealCreds = !!(merchantId && merchantKey);
  const isReallyLive = hasRealCreds && live;

  return (
    <div style={panelStyle}>
      <div className="flex justify-between items-center flex-wrap gap-2" style={{ marginBottom: 6 }}>
        <div className="font-display" style={{ fontSize: 20, color: "var(--c-ivory)" }}>
          PayFast Settings
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "5px 12px",
            borderRadius: 20,
            background: isReallyLive ? "#2a0a0a" : "#0a2a14",
            color: isReallyLive ? "#ff8a80" : "#8fe3ad",
          }}
        >
          {isReallyLive ? "● LIVE — real payments" : "● Sandbox — safe testing"}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--c-muted)", margin: "0 0 16px" }}>
        Once your PayFast Individual account is verified, paste your Merchant ID and Merchant Key here and save —
        BrooksWay checkout switches to real payments immediately, no redeploy needed. Leave blank to keep using
        PayFast&apos;s safe sandbox (fake payments, fully testable, never real money).
      </p>
      <div className="flex flex-col gap-2.5">
        <input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="Merchant ID" style={inputStyle} />
        <div className="flex gap-2">
          <input
            value={merchantKey}
            onChange={(e) => setMerchantKey(e.target.value)}
            placeholder="Merchant Key"
            type={showKey ? "text" : "password"}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button style={{ ...btnGhost, padding: "8px 14px" }} onClick={() => setShowKey((v) => !v)}>
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
        <input
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="Passphrase (optional, must match your PayFast integration settings)"
          type={showKey ? "text" : "password"}
          style={inputStyle}
        />
        <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 13, color: "var(--c-ivory)" }}>
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} disabled={!hasRealCreds} />
          Use live payments {!hasRealCreds && <span style={{ color: "var(--c-muted)" }}>(needs Merchant ID + Key first)</span>}
        </label>
        <div className="flex items-center gap-2">
          <button
            style={btnGold}
            onClick={async () => {
              await setPayfastSettingsAction({ merchantId, merchantKey, passphrase, live });
              setSaved(true);
              setTimeout(() => setSaved(false), 1800);
              refresh();
            }}
          >
            Save
          </button>
          {saved && <span style={{ color: "#8fe3ad", fontSize: 12 }}>Saved ✓</span>}
        </div>
      </div>
    </div>
  );
}

function optionsToText(options: BwQuestion["options"], lang: "en" | "af") {
  return options.map((o) => o[lang]).join(", ");
}

function QuestionBank({ game, questions, onChange }: { game: BwGame; questions: BwQuestion[]; onChange: () => void }) {
  const [drafts, setDrafts] = useState<BwQuestion[]>(questions);
  const [optTextEn, setOptTextEn] = useState<string[]>(questions.map((q) => optionsToText(q.options, "en")));
  const [optTextAf, setOptTextAf] = useState<string[]>(questions.map((q) => optionsToText(q.options, "af")));

  useEffect(() => {
    setDrafts(questions);
    setOptTextEn(questions.map((q) => optionsToText(q.options, "en")));
    setOptTextAf(questions.map((q) => optionsToText(q.options, "af")));
  }, [questions]);

  const save = async (i: number) => {
    const en = optTextEn[i].split(",").map((o) => o.trim()).filter(Boolean);
    const af = optTextAf[i].split(",").map((o) => o.trim()).filter(Boolean);
    const count = Math.max(en.length, af.length);
    const options = Array.from({ length: count }, (_, oi) => ({ en: en[oi] || af[oi] || "", af: af[oi] || en[oi] || "" }));
    await updateBwQuestionAction(game, i, { q: drafts[i].q, options });
    onChange();
  };

  return (
    <div style={panelStyle}>
      <h3 className="font-display" style={{ fontSize: 20, color: "var(--c-ivory)", margin: "0 0 6px" }}>
        {game === "ceremony" ? "Ceremony" : "Reception"} questions
      </h3>
      <p style={{ fontSize: 12, color: "var(--c-muted)", margin: "0 0 16px" }}>
        Edit the question and its options in both languages (comma-separated, same order and count on each side),
        then Save. Adding or removing questions after slips have been sold will shift which question guests&apos;
        picks line up with — best done before launch.
      </p>
      <div className="flex flex-col gap-4">
        {drafts.map((q, i) => (
          <div key={i} className="flex flex-col gap-2" style={{ padding: "12px 0", borderBottom: "1px solid var(--c-line)" }}>
            <input
              value={q.q.en}
              onChange={(e) => setDrafts((d) => d.map((x, idx) => (idx === i ? { ...x, q: { ...x.q, en: e.target.value } } : x)))}
              placeholder="Question (English)"
              style={inputStyle}
            />
            <input
              value={q.q.af}
              onChange={(e) => setDrafts((d) => d.map((x, idx) => (idx === i ? { ...x, q: { ...x.q, af: e.target.value } } : x)))}
              placeholder="Question (Afrikaans)"
              style={inputStyle}
            />
            <input
              value={optTextEn[i] ?? ""}
              onChange={(e) => setOptTextEn((t) => t.map((x, idx) => (idx === i ? e.target.value : x)))}
              placeholder="Options in English: Option A, Option B, Option C"
              style={inputStyle}
            />
            <input
              value={optTextAf[i] ?? ""}
              onChange={(e) => setOptTextAf((t) => t.map((x, idx) => (idx === i ? e.target.value : x)))}
              placeholder="Options in Afrikaans: Opsie A, Opsie B, Opsie C"
              style={inputStyle}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button style={btnGold} onClick={() => save(i)}>
                Save
              </button>
              <span style={{ flex: 1 }} />
              <button
                style={{ ...btnGhost, padding: "8px 12px" }}
                disabled={i === 0}
                onClick={async () => {
                  await moveBwQuestionAction(game, i, "up");
                  onChange();
                }}
              >
                ↑
              </button>
              <button
                style={{ ...btnGhost, padding: "8px 12px" }}
                disabled={i === drafts.length - 1}
                onClick={async () => {
                  await moveBwQuestionAction(game, i, "down");
                  onChange();
                }}
              >
                ↓
              </button>
              <button
                style={{ ...btnGhost, padding: "8px 12px", color: "rgba(224,144,122,0.9)" }}
                onClick={async () => {
                  await removeBwQuestionAction(game, i);
                  onChange();
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        style={{ ...btnGold, marginTop: 14 }}
        onClick={async () => {
          await addBwQuestionAction(game);
          onChange();
        }}
      >
        + Add a Question
      </button>
    </div>
  );
}
