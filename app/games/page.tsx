"use client";

import { useEffect, useState } from "react";
import { getBwQuestionsAction, getBwStateAction, getMySlipsAction, getPayfastStatusAction, startPayfastCheckoutAction, submitBwSlipAction } from "@/app/actions";
import { useLang } from "@/components/LangProvider";
import type { BwGame, BwGameState, BwQuestion, BwSlip } from "@/lib/types";

type View = "home" | "play" | "confirm" | "myslips" | "slipdetail" | "winners";
type BwState = { ceremony: BwGameState; reception: BwGameState };
type BwQuestions = { ceremony: BwQuestion[]; reception: BwQuestion[] };

const MY_SLIPS_KEY = "ra-bw-slips";

function readMySlipIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(MY_SLIPS_KEY) || "[]");
  } catch {
    return [];
  }
}
function addMySlipId(id: string) {
  const ids = readMySlipIds();
  window.localStorage.setItem(MY_SLIPS_KEY, JSON.stringify([...ids, id]));
}

/** Builds a real HTML form and submits it — the standard way to redirect a browser to PayFast's hosted checkout. */
function redirectToPayfast(processUrl: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = processUrl;
  for (const [k, v] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = k;
    input.value = v;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export default function GamesPage() {
  const { tEn } = useLang();
  const [view, setView] = useState<View>("home");
  const [game, setGame] = useState<BwGame>("ceremony");
  const [bwState, setBwState] = useState<BwState | null>(null);
  const [bwQuestions, setBwQuestions] = useState<BwQuestions | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [name, setName] = useState("");
  const [returnSlip, setReturnSlip] = useState<BwSlip | null>(null);
  const [returnStatus, setReturnStatus] = useState<"cancelled" | "pending" | "paid" | null>(null);
  const [paying, setPaying] = useState(false);
  const [mySlips, setMySlips] = useState<BwSlip[]>([]);
  const [detailSlip, setDetailSlip] = useState<BwSlip | null>(null);
  const [payfastLive, setPayfastLive] = useState(false);

  useEffect(() => {
    getBwStateAction().then(setBwState);
    getBwQuestionsAction().then(setBwQuestions);
    getPayfastStatusAction().then((s) => setPayfastLive(s.isLive));

    // Handle the redirect back from PayFast (return_url / cancel_url).
    const params = new URLSearchParams(window.location.search);
    const paidId = params.get("paid");
    const cancelledId = params.get("cancelled");
    if (paidId) {
      addMySlipId(paidId);
      setReturnStatus("pending");
      setView("confirm");
      let attempts = 0;
      const poll = async () => {
        const [slip] = await getMySlipsAction([paidId]);
        if (slip) {
          setReturnSlip(slip);
          if (slip.paid) {
            setReturnStatus("paid");
            return;
          }
        }
        attempts++;
        if (attempts < 6) setTimeout(poll, 2000);
      };
      poll();
    } else if (cancelledId) {
      setReturnStatus("cancelled");
      setView("confirm");
    }
  }, []);

  const questions = bwQuestions?.[game] || [];
  const answered = Object.keys(answers).length;

  const refreshMySlips = async () => {
    const ids = readMySlipIds();
    const slips = await getMySlipsAction(ids);
    setMySlips(slips.sort((a, b) => b.createdAt - a.createdAt));
  };

  async function startPay() {
    setPaying(true);
    const slip = await submitBwSlipAction({ game, name: name || "Guest", answers });
    addMySlipId(slip.id);
    const checkout = await startPayfastCheckoutAction(slip.id);
    redirectToPayfast(checkout.processUrl, checkout.fields);
    // Browser navigates away here; paying stays true until the page unloads.
  }

  function openMySlips() {
    refreshMySlips();
    setView("myslips");
  }

  function openWinners(g: BwGame) {
    setGame(g);
    setView("winners");
  }

  const gameMeta: Record<BwGame, { title: string; kicker: string }> = {
    ceremony: { title: tEn("bw_ceremony_title"), kicker: tEn("bw_ceremony_kicker") },
    reception: { title: tEn("bw_reception_title"), kicker: tEn("bw_reception_kicker") },
  };

  return (
    <section style={{ minHeight: "100vh", padding: "clamp(80px,10vw,120px) clamp(14px,4vw,30px) 80px", background: "#000", fontFamily: "Arial,Helvetica,sans-serif" }} className="fade-up">
      <div className="mx-auto" style={{ maxWidth: 620 }}>
        <div className="flex items-center justify-between" style={{ background: "#000", padding: "6px 4px 18px", marginBottom: 10, borderBottom: "1px solid #1f1f1f" }}>
          <div style={{ fontSize: "clamp(28px,7vw,40px)", fontWeight: 800, letterSpacing: "-0.02em", color: "#fff" }}>
            brooks<span style={{ color: "#00B83F" }}>way</span>
          </div>
          {(() => {
            const anyLaunched = !!(bwState?.ceremony?.launched || bwState?.reception?.launched);
            return (
              <div
                className="inline-flex items-center gap-1.5"
                style={{ padding: "7px 14px", background: "#111", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: anyLaunched ? "#00E04A" : "#e0c07a",
                    boxShadow: anyLaunched ? "0 0 8px #00E04A" : "0 0 8px #e0c07a",
                  }}
                />
                {anyLaunched ? tEn("bw_live") : tEn("bw_coming_soon")}
              </div>
            );
          })()}
        </div>
        <div className="text-center" style={{ marginBottom: 22 }}>
          <div style={{ color: "#9a9a9a", fontSize: 13, fontWeight: 600, letterSpacing: "0.04em" }}>{tEn("bw_tagline")}</div>
        </div>

        {view === "home" && (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "#bdbdbd", margin: "0 0 18px", textAlign: "center" }}>{tEn("bw_intro")}</p>
            {(["ceremony", "reception"] as BwGame[]).map((g) => {
              const s = bwState?.[g];
              return (
                <div key={g} style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 20, marginBottom: 12, color: "#fff" }}>
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#00E04A", textTransform: "uppercase" }}>{gameMeta[g].kicker}</div>
                      <h3 style={{ fontSize: 22, margin: "6px 0 0", fontWeight: 800, color: "#fff" }}>{gameMeta[g].title}</h3>
                    </div>
                    {s?.revealed && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 20, background: "#00B83F", color: "#000" }}>{tEn("bw_revealed")}</span>
                    )}
                    {!s?.revealed && !s?.launched && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 20, background: "#2a1e0a", color: "#e0c07a" }}>{tEn("bw_coming_soon_badge")}</span>
                    )}
                  </div>
                  <div className="flex gap-2" style={{ margin: "16px 0 18px" }}>
                    <div style={{ flex: 1, background: "#0a0a0a", borderRadius: 6, padding: "11px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{bwQuestions?.[g]?.length ?? 0}</div>
                      <div style={{ fontSize: 10, color: "#8a8a8a", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>{tEn("bw_predictions_stat")}</div>
                    </div>
                    <div style={{ flex: 1, background: "#0a0a0a", borderRadius: 6, padding: "11px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: "#00E04A" }}>R{s?.prize ?? 1000}</div>
                      <div style={{ fontSize: 10, color: "#8a8a8a", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>{tEn("bw_bartab_stat")}</div>
                    </div>
                  </div>
                  {s?.launched ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setGame(g);
                          setAnswers({});
                          setView("play");
                        }}
                        className="cursor-pointer"
                        style={{ flex: 2, padding: 13, background: "#00B83F", border: "none", borderRadius: 6, color: "#000", fontSize: 13, fontWeight: 800 }}
                      >
                        {tEn("bw_build_slip")}
                      </button>
                      <button onClick={openMySlips} className="cursor-pointer" style={{ flex: 1, padding: 13, background: "#1e1e1e", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 700 }}>
                        {tEn("bw_my_slips")}
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: "#6a6a6a", margin: 0, textAlign: "center" }}>{tEn("bw_not_open_yet")}</p>
                  )}
                  {s?.revealed && (
                    <button onClick={() => openWinners(g)} className="w-full cursor-pointer" style={{ marginTop: 8, padding: 12, background: "#00B83F", border: "none", borderRadius: 6, color: "#000", fontSize: 13, fontWeight: 800 }}>
                      {tEn("bw_winners_view")}
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}

        {view === "play" && (
          <div style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "16px 18px", background: "#0a0a0a", borderBottom: "1px solid #1f1f1f" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#00E04A", textTransform: "uppercase" }}>{gameMeta[game].kicker}</div>
              <div className="flex justify-between items-center" style={{ marginTop: 4 }}>
                <h3 style={{ fontSize: 20, margin: 0, fontWeight: 800, color: "#fff" }}>{gameMeta[game].title}</h3>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#00E04A" }}>
                  {answered} / {questions.length}
                </span>
              </div>
              <div style={{ height: 5, background: "#222", borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(answered / questions.length) * 100}%`, background: "#00B83F", transition: "width .3s" }} />
              </div>
            </div>
            <div style={{ padding: "14px 16px 6px" }}>
              {questions.map((q, i) => (
                <div key={i} style={{ marginBottom: 16, background: "#0c0c0c", border: "1px solid #1f1f1f", borderRadius: 6, padding: 14 }}>
                  <div style={{ fontSize: 14, color: "#fff", fontWeight: 600, marginBottom: 11, lineHeight: 1.45 }}>
                    <span style={{ display: "inline-block", minWidth: 22, height: 22, lineHeight: "22px", textAlign: "center", background: "#1e1e1e", borderRadius: 4, color: "#9a9a9a", fontSize: 12, fontWeight: 700, marginRight: 9 }}>
                      {i + 1}
                    </span>
                    {q.q.en}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map((opt, oi) => {
                      const active = answers[i] === oi;
                      return (
                        <button
                          key={oi}
                          onClick={() => setAnswers((s) => ({ ...s, [i]: oi }))}
                          className="cursor-pointer"
                          style={{ padding: "10px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700, background: active ? "#00B83F" : "#1a1a1a", color: active ? "#000" : "#fff", border: `1px solid ${active ? "#00B83F" : "#2a2a2a"}` }}
                        >
                          {opt.en}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "16px 18px", background: "#0a0a0a", borderTop: "1px solid #1f1f1f" }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tEn("bw_name_placeholder")}
                style={{ width: "100%", padding: "13px 15px", marginBottom: 14, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, color: "#fff", fontSize: 15, outline: "none" }}
              />
              <div className="flex justify-between items-center" style={{ marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#8a8a8a", fontWeight: 600, textTransform: "uppercase" }}>{tEn("bw_slip_stake")}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#fff" }}>R50.00</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#8a8a8a", fontWeight: 600, textTransform: "uppercase" }}>{tEn("bw_winner_takes")}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#00E04A" }}>R{bwState?.[game]?.prize ?? 1000}</div>
                </div>
              </div>
              <button
                onClick={startPay}
                disabled={answered < questions.length || paying}
                className="w-full cursor-pointer"
                style={{ padding: 16, background: "#00B83F", border: "none", borderRadius: 6, color: "#000", fontSize: 15, fontWeight: 800, opacity: answered < questions.length || paying ? 0.5 : 1 }}
              >
                {paying ? tEn("bw_redirecting") : tEn("bw_pay_btn")}
              </button>
              <button onClick={() => setView("home")} className="w-full cursor-pointer" style={{ marginTop: 10, padding: 11, background: "transparent", border: "none", color: "#8a8a8a", fontSize: 12, fontWeight: 600 }}>
                {tEn("bw_back_to_games")}
              </button>
              {!payfastLive && <div className="text-center" style={{ marginTop: 10, fontSize: 11, color: "#c99b3f" }}>{tEn("bw_test_mode")}</div>}
            </div>
          </div>
        )}

        {view === "confirm" && (
          <div style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: "30px 26px", color: "#fff", textAlign: "center" }}>
            {returnStatus === "cancelled" && (
              <>
                <div style={{ fontSize: 40 }}>✕</div>
                <h3 style={{ fontSize: 22, margin: "8px 0 4px", fontWeight: 800 }}>{tEn("bw_cancelled_title")}</h3>
                <p style={{ color: "#8a8a8a", fontSize: 13, margin: "0 0 24px" }}>{tEn("bw_cancelled_sub")}</p>
              </>
            )}
            {returnStatus === "pending" && (
              <>
                <div style={{ width: 40, height: 40, margin: "0 auto 16px", border: "3px solid #262626", borderTopColor: "#00E04A", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                <h3 style={{ fontSize: 22, margin: "0 0 4px", fontWeight: 800 }}>{tEn("bw_confirming_title")}</h3>
                <p style={{ color: "#8a8a8a", fontSize: 13, margin: "0 0 24px" }}>{tEn("bw_confirming_sub")}</p>
              </>
            )}
            {returnStatus === "paid" && returnSlip && (
              <>
                <div style={{ width: 66, height: 66, margin: "0 auto 18px", borderRadius: "50%", background: "#00B83F", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, color: "#000", fontWeight: 800 }}>✓</div>
                <h3 style={{ fontSize: 26, margin: "0 0 8px", fontWeight: 800 }}>{tEn("bw_confirmed_title")}</h3>
                <p style={{ color: "#bdbdbd", fontSize: 15, lineHeight: 1.7, margin: "0 0 8px" }}>{tEn("bw_confirmed_sub")}</p>
                <div style={{ display: "inline-block", fontFamily: "Arial,Helvetica,sans-serif", fontSize: 13, fontWeight: 700, color: "#00E04A", letterSpacing: "0.1em", background: "#0a0a0a", padding: "6px 14px", borderRadius: 5, marginBottom: 24 }}>
                  SLIP #{returnSlip.ticket}
                </div>
              </>
            )}
            <div className="flex gap-2">
              <button onClick={openMySlips} className="flex-1 cursor-pointer" style={{ padding: 14, background: "#1e1e1e", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 700 }}>
                {tEn("bw_view_my_slips")}
              </button>
              <button
                onClick={() => {
                  setAnswers({});
                  setView("home");
                }}
                className="flex-1 cursor-pointer"
                style={{ padding: 14, background: "#00B83F", border: "none", borderRadius: 6, color: "#000", fontSize: 13, fontWeight: 800 }}
              >
                {tEn("bw_back_to_games_btn")}
              </button>
            </div>
          </div>
        )}

        {view === "myslips" && (
          <div style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 22, color: "#fff" }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
              <h3 style={{ fontSize: 22, margin: 0, fontWeight: 800 }}>{tEn("bw_my_slips")}</h3>
              <span style={{ fontSize: 12, color: "#8a8a8a" }}>{mySlips.length}</span>
            </div>
            <p style={{ fontSize: 12, color: "#8a8a8a", margin: "0 0 18px" }}>{tEn("bw_myslips_intro")}</p>
            {mySlips.map((s) => {
              const results = bwState?.[s.game]?.results || {};
              let correct = 0,
                wrong = 0,
                pending = 0;
              Object.keys(s.answers).forEach((k) => {
                const idx = Number(k);
                if (results[idx] === undefined) pending++;
                else if (results[idx] === s.answers[idx]) correct++;
                else wrong++;
              });
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    setDetailSlip(s);
                    setView("slipdetail");
                  }}
                  className="cursor-pointer"
                  style={{ background: "#0a0a0a", border: "1px solid #222", borderRadius: 6, padding: "15px 16px", marginBottom: 10 }}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#00E04A" }}>SLIP #{s.ticket}</div>
                      <div style={{ fontSize: 12, color: "#8a8a8a", marginTop: 3 }}>
                        {gameMeta[s.game].title} · {new Date(s.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 20, background: s.paid ? "#0a2a14" : "#2a1e0a", color: s.paid ? "#00E04A" : "#e0c07a" }}>
                      {s.paid ? tEn("bw_paid") : tEn("bw_awaiting_payment")}
                    </span>
                  </div>
                  <div className="flex gap-3.5" style={{ marginTop: 12, fontSize: 13, fontWeight: 600 }}>
                    <span style={{ color: "#00E04A" }}>✔ {correct}</span>
                    <span style={{ color: "#ff5b5b" }}>✖ {wrong}</span>
                    <span style={{ color: "#8a8a8a" }}>⏳ {pending}</span>
                    <span style={{ marginLeft: "auto", color: "#fff" }}>{tEn("bw_view_arrow")}</span>
                  </div>
                </div>
              );
            })}
            {mySlips.length === 0 && <div className="text-center" style={{ padding: "30px 10px", color: "#8a8a8a", fontSize: 14 }}>{tEn("bw_no_slips")}</div>}
            <button onClick={() => setView("home")} className="w-full cursor-pointer" style={{ marginTop: 8, padding: 13, background: "#1e1e1e", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 700 }}>
              {tEn("bw_back_to_games")}
            </button>
          </div>
        )}

        {view === "slipdetail" && detailSlip && (
          <div style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 22, color: "#fff" }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#00E04A" }}>SLIP #{detailSlip.ticket}</div>
                <div style={{ fontSize: 13, color: "#8a8a8a", marginTop: 3 }}>
                  {gameMeta[detailSlip.game].title} · {detailSlip.name}
                </div>
              </div>
            </div>
            {(bwQuestions?.[detailSlip.game] || []).map((q, i) => {
              const results = bwState?.[detailSlip.game]?.results || {};
              const actual = results[i];
              const pick = detailSlip.answers[i];
              const mark = actual === undefined ? "⏳" : actual === pick ? "✔" : "✖";
              return (
                <div key={i} className="flex justify-between items-center gap-3" style={{ padding: "12px 0", borderBottom: "1px solid #1f1f1f" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "#9a9a9a", lineHeight: 1.4 }}>{q.q.en}</div>
                    <div style={{ fontSize: 14, color: "#fff", marginTop: 4 }}>
                      {tEn("bw_your_call")} <strong>{q.options[pick]?.en}</strong>
                    </div>
                    {actual !== undefined && (
                      <div style={{ fontSize: 12, color: "#00E04A", marginTop: 2 }}>
                        {tEn("bw_actual")} {q.options[actual]?.en}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 22 }}>{mark}</span>
                </div>
              );
            })}
            <button onClick={() => setView("myslips")} className="w-full cursor-pointer" style={{ marginTop: 16, padding: 13, background: "#1e1e1e", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 700 }}>
              {tEn("bw_all_my_slips")}
            </button>
          </div>
        )}

        {view === "winners" && (
          <div style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: "30px 26px", color: "#fff", textAlign: "center" }}>
            <div style={{ fontSize: 40 }}>🎉</div>
            <h3 style={{ fontSize: 24, margin: "8px 0 2px", fontWeight: 800 }}>
              {gameMeta[game].title} — {tEn("bw_winners_suffix")}
            </h3>
            <p style={{ fontSize: 13, color: "#8a8a8a", margin: "0 0 22px" }}>{tEn("bw_winners_sub")}</p>
            <button onClick={() => setView("home")} className="w-full cursor-pointer" style={{ marginTop: 10, padding: 13, background: "#1e1e1e", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 700 }}>
              {tEn("bw_back_to_games")}
            </button>
          </div>
        )}

        <div className="text-center" style={{ marginTop: 20, fontSize: 11, color: "#6a6a6a", letterSpacing: "0.06em" }}>{tEn("bw_footer")}</div>
      </div>
    </section>
  );
}
