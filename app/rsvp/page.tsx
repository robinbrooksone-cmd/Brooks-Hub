"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/components/LangProvider";
import { searchFamiliesAction, submitRsvpAction } from "@/app/actions";
import { SitePhoto } from "@/components/PhotoProvider";
import type { Family } from "@/lib/roster";

type Step = "search" | "family" | "form" | "done";

const DIET_OPTS_EN = ["No restrictions", "Vegetarian", "Vegan", "Halaal", "Gluten-free"];
const DIET_OPTS_AF = ["Geen beperkings", "Vegetaries", "Vegan", "Halaal", "Glutenvry"];

export default function RsvpPage() {
  const { t, lang } = useLang();
  const af = lang === "af";
  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Family[]>([]);
  const [searched, setSearched] = useState(false);
  const [family, setFamily] = useState<Family | null>(null);
  const [status, setStatus] = useState<Record<string, "yes" | "no">>({});
  const [diet, setDiet] = useState<Record<string, string>>({});
  const [allergies, setAllergies] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [songName, setSongName] = useState("");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const id = setTimeout(async () => {
      const r = await searchFamiliesAction(q);
      setResults(r);
      setSearched(true);
    }, 220);
    return () => clearTimeout(id);
  }, [query]);

  const attendingMembers = useMemo(() => (family ? family.members.filter((m) => status[m.id] === "yes") : []), [family, status]);
  const decliningMembers = useMemo(() => (family ? family.members.filter((m) => status[m.id] === "no") : []), [family, status]);
  const allAnswered = family ? family.members.every((m) => !!status[m.id]) : false;
  const declining = family ? family.members.length > 0 && decliningMembers.length === family.members.length : false;

  const dietOpts = af ? DIET_OPTS_AF : DIET_OPTS_EN;
  const dietOptsEn = DIET_OPTS_EN;

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "9px 16px",
    borderRadius: 30,
    fontSize: 12,
    cursor: "pointer",
    background: active ? "var(--c-gold)" : "rgba(0,0,0,0.2)",
    color: active ? "#fff" : "rgba(248,243,236,0.75)",
    border: `1px solid ${active ? "var(--c-gold)" : "rgba(203,177,144,0.22)"}`,
  });

  const inputStyle: React.CSSProperties = {
    width: "100%",
    marginTop: 7,
    padding: "13px 15px",
    background: "rgba(0,0,0,0.22)",
    border: "1px solid rgba(203,177,144,0.25)",
    borderRadius: 8,
    color: "var(--c-ivory)",
    fontFamily: "var(--font-jost)",
    fontSize: 15,
    outline: "none",
  };

  async function submit() {
    if (!family) return;
    setSubmitting(true);
    const members = attendingMembers.map((m) => ({ id: m.id, name: m.name, diet: diet[m.id] || dietOptsEn[0] }));
    const notAttending = decliningMembers.map((m) => ({ id: m.id, name: m.name, diet: "—" }));
    const song = !declining && (songArtist || songName) ? `${songArtist}${songName ? " — " + songName : ""}` : "—";
    await submitRsvpAction({
      familyId: family.id,
      members,
      notAttending,
      accommodation: "—",
      transport: "—",
      song,
      allergies,
      message,
      email,
      phone,
    });
    setSubmitting(false);
    setStep("done");
  }

  return (
    <section
      className="relative fade-up overflow-hidden"
      style={{ minHeight: "100vh", padding: "clamp(96px,11vw,140px) clamp(18px,5vw,40px) 90px", background: "#2a1d15" }}
    >
      <SitePhoto slot="/images/rsvp-bg.webp" priority className="object-cover" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(26,16,10,0.72), rgba(26,16,10,0.82))" }} />

      <div className="relative z-[2] mx-auto" style={{ maxWidth: 620 }}>
        <div className="text-center" style={{ marginBottom: 36 }}>
          <div className="text-[11px] uppercase" style={{ letterSpacing: "0.4em", color: "var(--c-champ)" }}>
            {t("rsvp_by")}
          </div>
          <h2 className="font-display" style={{ fontSize: "clamp(46px,9vw,80px)", color: "var(--c-ivory)", margin: "14px 0 0", fontWeight: 500 }}>
            RSVP
          </h2>
          <div className="mx-auto" style={{ width: 54, height: 1, background: "rgba(203,177,144,0.6)", marginTop: 22 }} />
        </div>

        {step === "search" && (
          <div style={{ background: "rgba(248,243,236,0.05)", border: "1px solid rgba(203,177,144,0.25)", borderRadius: 14, padding: "34px 28px" }}>
            <p className="text-center" style={{ color: "rgba(248,243,236,0.85)", fontSize: 15, lineHeight: 1.7, margin: "0 0 22px" }}>
              {t("rsvp_find_intro")}
            </p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("rsvp_search_ph")}
              style={{
                width: "100%",
                padding: "16px 18px",
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(203,177,144,0.3)",
                borderRadius: 8,
                color: "var(--c-ivory)",
                fontFamily: "var(--font-jost)",
                fontSize: 16,
                outline: "none",
              }}
            />
            <div style={{ marginTop: 14 }}>
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setFamily(r);
                    setStatus({});
                    setStep("family");
                  }}
                  className="w-full flex justify-between items-center text-left cursor-pointer"
                  style={{ padding: "15px 18px", marginBottom: 8, background: "rgba(248,243,236,0.06)", border: "1px solid rgba(203,177,144,0.2)", borderRadius: 8 }}
                >
                  <div>
                    <div style={{ color: "var(--c-ivory)", fontSize: 16 }}>{r.name}</div>
                    <div style={{ color: "rgba(248,243,236,0.55)", fontSize: 12, marginTop: 2 }}>
                      {r.members.map((m) => m.name.split(" ")[0]).join(", ")}
                    </div>
                  </div>
                  <span style={{ color: "var(--c-gold)", fontSize: 18 }}>→</span>
                </button>
              ))}
              {searched && results.length === 0 && (
                <div className="text-center" style={{ color: "rgba(248,243,236,0.5)", fontSize: 14, padding: 16 }}>
                  {t("rsvp_nomatch")}
                </div>
              )}
            </div>
          </div>
        )}

        {step === "family" && family && (
          <div style={{ background: "rgba(248,243,236,0.05)", border: "1px solid rgba(203,177,144,0.25)", borderRadius: 14, padding: "34px 28px" }}>
            <div className="text-center" style={{ marginBottom: 8 }}>
              <div className="text-[11px] uppercase" style={{ letterSpacing: "0.25em", color: "var(--c-champ)" }}>
                {t("rsvp_your_party")}
              </div>
              <h3 className="font-display" style={{ fontSize: 32, color: "var(--c-ivory)", margin: "6px 0 0", fontWeight: 500 }}>
                {family.name}
              </h3>
            </div>
            <p className="text-center" style={{ color: "rgba(248,243,236,0.7)", fontSize: 14, margin: "8px 0 22px" }}>
              {t("rsvp_tap_attend")}
            </p>
            {family.members.map((m) => {
              const s = status[m.id];
              return (
                <div
                  key={m.id}
                  className="flex justify-between items-center flex-wrap gap-2"
                  style={{
                    padding: "14px 16px",
                    marginBottom: 8,
                    background: s === "yes" ? "rgba(179,136,78,0.12)" : s === "no" ? "rgba(224,144,122,0.08)" : "rgba(0,0,0,0.18)",
                    border: `1px solid ${s === "yes" ? "var(--c-gold)" : s === "no" ? "rgba(224,144,122,0.45)" : "rgba(203,177,144,0.18)"}`,
                    borderRadius: 8,
                  }}
                >
                  <span style={{ color: "var(--c-ivory)", fontSize: 16 }}>{m.name}</span>
                  <span className="flex gap-2">
                    <button
                      onClick={() => setStatus((prev) => ({ ...prev, [m.id]: "yes" }))}
                      className="cursor-pointer uppercase"
                      style={{
                        padding: "8px 14px",
                        borderRadius: 6,
                        fontSize: 11,
                        letterSpacing: "0.08em",
                        background: s === "yes" ? "var(--c-gold)" : "transparent",
                        color: s === "yes" ? "#fff" : "rgba(248,243,236,0.6)",
                        border: `1px solid ${s === "yes" ? "var(--c-gold)" : "rgba(203,177,144,0.35)"}`,
                      }}
                    >
                      {t("rsvp_attending")}
                    </button>
                    <button
                      onClick={() => setStatus((prev) => ({ ...prev, [m.id]: "no" }))}
                      className="cursor-pointer uppercase"
                      style={{
                        padding: "8px 14px",
                        borderRadius: 6,
                        fontSize: 11,
                        letterSpacing: "0.08em",
                        background: s === "no" ? "rgba(224,144,122,0.85)" : "transparent",
                        color: s === "no" ? "#fff" : "rgba(248,243,236,0.6)",
                        border: `1px solid ${s === "no" ? "rgba(224,144,122,0.85)" : "rgba(203,177,144,0.35)"}`,
                      }}
                    >
                      {t("rsvp_not_attending")}
                    </button>
                  </span>
                </div>
              );
            })}
            <div className="flex gap-2.5" style={{ marginTop: 18 }}>
              <button
                onClick={() => {
                  const a: Record<string, "yes" | "no"> = {};
                  family.members.forEach((m) => (a[m.id] = "yes"));
                  setStatus(a);
                }}
                className="flex-1 cursor-pointer uppercase"
                style={{ padding: 13, background: "transparent", border: "1px solid rgba(203,177,144,0.4)", borderRadius: 8, color: "var(--c-champ)", fontSize: 11, letterSpacing: "0.18em" }}
              >
                {t("rsvp_check_all")}
              </button>
              <button
                onClick={() => {
                  const a: Record<string, "yes" | "no"> = {};
                  family.members.forEach((m) => (a[m.id] = "no"));
                  setStatus(a);
                }}
                className="flex-1 cursor-pointer uppercase"
                style={{ padding: 13, background: "transparent", border: "1px solid rgba(224,144,122,0.4)", borderRadius: 8, color: "rgba(224,144,122,0.9)", fontSize: 11, letterSpacing: "0.18em" }}
              >
                {t("rsvp_mark_all_no")}
              </button>
            </div>
            {!allAnswered && (
              <p className="text-center" style={{ color: "rgba(224,144,122,0.85)", fontSize: 12, marginTop: 14 }}>
                {t("rsvp_answer_all")}
              </p>
            )}
            <button
              onClick={() => setStep("form")}
              disabled={!allAnswered}
              className="w-full cursor-pointer uppercase text-white"
              style={{ marginTop: 14, padding: 14, background: "var(--c-gold)", border: "none", borderRadius: 8, fontSize: 11, letterSpacing: "0.18em", opacity: allAnswered ? 1 : 0.5 }}
            >
              {t("rsvp_continue")}
            </button>
            <button
              onClick={() => {
                setStep("search");
                setFamily(null);
              }}
              className="w-full cursor-pointer"
              style={{ marginTop: 4, padding: 10, background: "transparent", border: "none", color: "rgba(248,243,236,0.5)", fontSize: 12 }}
            >
              {t("rsvp_search_other")}
            </button>
          </div>
        )}

        {step === "form" && family && (
          <div style={{ background: "rgba(248,243,236,0.05)", border: "1px solid rgba(203,177,144,0.25)", borderRadius: 14, padding: "34px 28px" }}>
            <h3 className="font-display text-center" style={{ fontSize: 26, color: "var(--c-ivory)", margin: "0 0 4px", fontWeight: 500 }}>
              {declining ? t("rsvp_decline_heading") : t("rsvp_details")}
            </h3>
            <p className="text-center" style={{ color: "rgba(248,243,236,0.6)", fontSize: 13, margin: "0 0 24px" }}>
              {declining
                ? t("rsvp_decline_sub")
                : attendingMembers.length
                ? af
                  ? `Antwoord vir ${attendingMembers.length} gas${attendingMembers.length > 1 ? "te" : ""}`
                  : `Responding for ${attendingMembers.length} guest${attendingMembers.length > 1 ? "s" : ""}`
                : ""}
            </p>

            {!declining && (
              <div style={{ marginBottom: 20 }}>
                <div className="text-[11px] uppercase" style={{ letterSpacing: "0.2em", color: "var(--c-champ)", marginBottom: 12 }}>
                  {t("rsvp_menu")}
                </div>
                {attendingMembers.map((m) => (
                  <div key={m.id} style={{ marginBottom: 14 }}>
                    <div style={{ color: "var(--c-ivory)", fontSize: 14, marginBottom: 8 }}>{m.name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {dietOpts.map((label, i) => {
                        const value = dietOptsEn[i];
                        const active = (diet[m.id] || dietOptsEn[0]) === value;
                        return (
                          <button key={value} onClick={() => setDiet((s) => ({ ...s, [m.id]: value }))} style={chip(active)}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-4">
              {!declining && (
                <div>
                  <label className="text-[11px] uppercase" style={{ letterSpacing: "0.18em", color: "var(--c-champ)" }}>
                    {t("rsvp_allergies")}
                  </label>
                  <input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. nut allergy, lactose intolerant…" style={inputStyle} />
                </div>
              )}
              {!declining && (
                <div>
                  <label className="text-[11px] uppercase" style={{ letterSpacing: "0.18em", color: "var(--c-champ)" }}>
                    {t("rsvp_song")}
                  </label>
                  <div className="flex gap-2.5 flex-wrap">
                    <input value={songArtist} onChange={(e) => setSongArtist(e.target.value)} placeholder={t("rsvp_artist")} style={{ ...inputStyle, flex: 1, minWidth: 150 }} />
                    <input value={songName} onChange={(e) => setSongName(e.target.value)} placeholder={t("rsvp_songname")} style={{ ...inputStyle, flex: 1, minWidth: 150 }} />
                  </div>
                </div>
              )}
              <div>
                <label className="text-[11px] uppercase" style={{ letterSpacing: "0.18em", color: "var(--c-champ)" }}>
                  {t("rsvp_message")}
                </label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional note…" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
              <div className="flex gap-3 flex-wrap">
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label className="text-[11px] uppercase" style={{ letterSpacing: "0.18em", color: "var(--c-champ)" }}>
                    {t("rsvp_mobile")}
                  </label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 …" style={inputStyle} />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label className="text-[11px] uppercase" style={{ letterSpacing: "0.18em", color: "var(--c-champ)" }}>
                    {t("rsvp_email")}
                  </label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" style={inputStyle} />
                </div>
              </div>
            </div>

            <button
              onClick={submit}
              disabled={submitting}
              className="w-full cursor-pointer uppercase text-white"
              style={{ marginTop: 24, padding: 16, background: "var(--c-gold)", border: "none", borderRadius: 8, fontSize: 13, letterSpacing: "0.2em", fontWeight: 500, opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? "…" : declining ? t("rsvp_send_decline") : t("rsvp_send")}
            </button>
            <button
              onClick={() => setStep("family")}
              className="w-full cursor-pointer"
              style={{ marginTop: 10, padding: 10, background: "transparent", border: "none", color: "rgba(248,243,236,0.5)", fontSize: 12 }}
            >
              {t("rsvp_back")}
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="text-center" style={{ background: "rgba(248,243,236,0.05)", border: "1px solid rgba(203,177,144,0.25)", borderRadius: 14, padding: "48px 28px" }}>
            <div
              className="mx-auto flex items-center justify-center"
              style={{ width: 70, height: 70, marginBottom: 22, borderRadius: "50%", border: "2px solid var(--c-gold)", fontSize: 34, color: "var(--c-gold)" }}
            >
              ✓
            </div>
            <h3 className="font-display" style={{ fontSize: "clamp(34px,6vw,48px)", color: "var(--c-ivory)", margin: "0 0 14px", fontWeight: 500 }}>
              {declining ? t("rsvp_declined_thanks") : t("rsvp_thanks")}
            </h3>
            {email && (
              <p style={{ color: "rgba(248,243,236,0.55)", fontSize: 13 }}>
                {t("rsvp_confirm_to")} {email}.
              </p>
            )}
            <button
              onClick={() => {
                setStep("search");
                setFamily(null);
                setQuery("");
                setStatus({});
                setDiet({});
                setAllergies("");
                setSongArtist("");
                setSongName("");
                setMessage("");
                setPhone("");
                setEmail("");
              }}
              className="cursor-pointer uppercase"
              style={{ marginTop: 26, padding: "13px 30px", background: "transparent", border: "1px solid var(--c-gold)", borderRadius: 8, color: "var(--c-gold)", fontSize: 12, letterSpacing: "0.18em" }}
            >
              {t("rsvp_respond_another")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
