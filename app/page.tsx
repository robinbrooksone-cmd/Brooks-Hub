"use client";

import Link from "next/link";
import { useLang } from "@/components/LangProvider";
import { Countdown } from "@/components/Countdown";
import { SitePhoto } from "@/components/PhotoProvider";
import { VENUE } from "@/lib/content";

export default function HomePage() {
  const { t } = useLang();

  const homeFacts = [
    { k: t("fact_when"), v: t("fact_when_v"), sub: t("fact_when_sub") },
    { k: t("fact_where"), v: VENUE, sub: t("fact_where_sub") },
    { k: t("fact_dress"), v: t("fact_dress_v"), sub: t("fact_dress_sub") },
  ];

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden flex items-center justify-center min-h-[88vh] md:min-h-screen">
        <SitePhoto
          slot="/images/hero.webp"
          alt="Robin and Annami"
          priority
          className="object-cover"
          style={{ animation: "kb 18s ease-in-out infinite alternate" }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(180deg, rgba(30,21,16,0.55) 0%, rgba(30,21,16,0.5) 55%, rgba(30,21,16,0.78) 100%)" }}
        />
        <div className="relative z-[2] text-center flex flex-col items-center w-full" style={{ padding: "90px 22px", maxWidth: 900, margin: "0 auto" }}>
          <div className="text-xs uppercase mb-6" style={{ letterSpacing: "0.55em", color: "var(--c-champ)", paddingLeft: "0.55em" }}>
            {t("hero_eyebrow")}
          </div>
          <h1
            className="font-display m-0 text-center"
            style={{ fontWeight: 500, fontSize: "clamp(58px,13vw,150px)", lineHeight: 0.92, color: "var(--c-ivory)", letterSpacing: "0.01em" }}
          >
            Robin
            <span className="block italic" style={{ fontSize: "0.62em", color: "var(--c-gold)", margin: "0.06em 0" }}>
              &amp;
            </span>
            Annami
          </h1>
          <div className="flex items-center justify-center gap-4 mt-7 uppercase" style={{ color: "var(--c-ivory)", fontSize: 13, letterSpacing: "0.32em" }}>
            <span style={{ width: 34, height: 1, background: "rgba(203,177,144,0.6)" }} />
            {t("wedding_date")}
            <span style={{ width: 34, height: 1, background: "rgba(203,177,144,0.6)" }} />
          </div>
          <Countdown />
          <Link
            href="/rsvp"
            className="block mt-12 text-white"
            style={{ padding: "15px 46px", background: "var(--c-gold)", fontFamily: "var(--font-jost)", fontSize: 12, letterSpacing: "0.28em", textTransform: "uppercase", borderRadius: 2 }}
          >
            {t("nav_rsvp")}
          </Link>
        </div>
        <div className="absolute left-0 right-0 mx-auto flex flex-col items-center gap-2.5" style={{ bottom: 30, width: 120, color: "rgba(248,243,236,0.6)", animation: "floaty 2.4s ease-in-out infinite" }}>
          <span className="text-[9px] uppercase" style={{ letterSpacing: "0.3em", paddingLeft: "0.3em" }}>
            {t("scroll")}
          </span>
          <span style={{ width: 2, height: 40, background: "linear-gradient(var(--c-champ), transparent)", borderRadius: 1 }} />
        </div>
      </section>

      {/* NOTE + BANDS */}
      <section style={{ padding: "clamp(70px,12vw,140px) 22px", background: "#3a2a21", textAlign: "center" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <p className="font-display" style={{ fontSize: "clamp(26px,4vw,40px)", lineHeight: 1.4, color: "var(--c-ivory)", margin: 0, fontWeight: 400 }}>
            {t("welcome_default")}
          </p>
          <div className="font-display italic" style={{ marginTop: 36, fontSize: 30, color: "var(--c-gold)" }}>
            Robin &amp; Annami
          </div>
        </div>

        <div className="relative h-[52vh] md:h-[clamp(640px,104vh,1300px)]" style={{ margin: "clamp(54px,8vw,96px) -22px 0", background: "#3a2a21" }}>
          <SitePhoto
            slot="/images/home-band.jpg"
            className="object-cover"
            style={{ maskImage: "linear-gradient(to bottom, transparent 0%, #000 15%, #000 85%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 15%, #000 85%, transparent 100%)" }}
          />
          <div className="absolute left-0 right-0 text-center z-[2] pointer-events-none" style={{ bottom: "clamp(30px,5vw,58px)" }}>
            <div className="font-display italic" style={{ fontSize: "clamp(28px,4vw,46px)", color: "var(--c-ivory)" }}>
              {t("home_countdown_caption")}
            </div>
          </div>
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 1, maxWidth: 1100, margin: "clamp(54px,8vw,90px) auto 0", background: "var(--c-line)", border: "1px solid var(--c-line)" }}
        >
          {homeFacts.map((f) => (
            <div key={f.k} style={{ background: "var(--c-panel)", padding: "40px 26px" }}>
              <div className="text-[11px] uppercase" style={{ letterSpacing: "0.3em", color: "var(--c-gold)" }}>
                {f.k}
              </div>
              <div className="font-display" style={{ fontSize: 27, color: "var(--c-ivory)", marginTop: 12 }}>
                {f.v}
              </div>
              <div style={{ fontSize: 13, color: "var(--c-muted)", marginTop: 6 }}>{f.sub}</div>
            </div>
          ))}
        </div>

        <div className="relative h-[52vh] md:h-[clamp(640px,104vh,1300px)]" style={{ margin: "clamp(54px,8vw,96px) -22px calc(-1 * clamp(70px,12vw,140px))", background: "#3a2a21" }}>
          <SitePhoto
            slot="/images/home-closing.jpg"
            className="object-cover"
            style={{ maskImage: "linear-gradient(to bottom, transparent 0%, #000 15%, #000 85%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 15%, #000 85%, transparent 100%)" }}
          />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(20,14,9,0.6) 0%, rgba(20,14,9,0) 45%)" }} />
          <div className="absolute left-0 right-0 text-center z-[2] pointer-events-none" style={{ bottom: "clamp(40px,6vw,70px)" }}>
            <div className="text-xs uppercase mb-3.5" style={{ letterSpacing: "0.5em", color: "var(--c-champ)", textShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>
              {t("home_cant_wait")}
            </div>
            <div className="font-display" style={{ fontSize: "clamp(32px,5vw,60px)", color: "var(--c-ivory)", textShadow: "0 2px 24px rgba(0,0,0,0.6)" }}>
              {t("home_see_you_there")}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
