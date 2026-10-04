"use client";

import { SitePhoto } from "./PhotoProvider";

export function CoverSection({ image, slot, eyebrow, title }: { image: string; slot?: string; eyebrow: string; title: string }) {
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden min-h-[62vh] md:min-h-[104vh]"
      style={{
        margin: "calc(-1 * clamp(96px,11vw,150px)) calc(-1 * clamp(20px,5vw,64px)) clamp(40px,6vw,64px)",
        background: "var(--c-bg-2)",
      }}
    >
      <SitePhoto
        slot={slot || image}
        priority
        className="object-cover"
        style={{ maskImage: "linear-gradient(to bottom, transparent 0%, #000 15%, #000 85%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 15%, #000 85%, transparent 100%)" }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 90% 52% at 50% 50%, rgba(20,14,9,0.58) 0%, rgba(20,14,9,0.15) 55%, transparent 72%)" }}
      />
      <div className="relative z-[2] text-center pointer-events-none" style={{ padding: "90px 22px" }}>
        <div
          className="text-xs uppercase mb-5"
          style={{ letterSpacing: "0.5em", color: "var(--c-champ)", paddingLeft: "0.5em" }}
        >
          {eyebrow}
        </div>
        <h2
          className="font-display m-0"
          style={{
            fontSize: "clamp(48px,9vw,104px)",
            color: "var(--c-ivory)",
            fontWeight: 500,
            lineHeight: 0.96,
            textShadow: "0 2px 40px rgba(0,0,0,0.4)",
          }}
        >
          {title}
        </h2>
        <div className="mx-auto mt-6" style={{ width: 60, height: 1, background: "rgba(203,177,144,0.7)" }} />
      </div>
    </div>
  );
}

export function SectionShell({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <section
      className="fade-up"
      style={{ padding: "clamp(96px,11vw,150px) clamp(20px,5vw,64px) 90px", background: bg }}
    >
      {children}
    </section>
  );
}
