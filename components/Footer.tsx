"use client";

import Link from "next/link";
import { useLang } from "./LangProvider";

export function Footer() {
  const { t } = useLang();
  const links: { href: string; key: Parameters<ReturnType<typeof useLang>["t"]>[0] }[] = [
    { href: "/", key: "nav_home" },
    { href: "/story", key: "nav_story" },
    { href: "/wedding-day", key: "nav_day" },
    { href: "/rsvp", key: "nav_rsvp" },
    { href: "/contact", key: "nav_contact" },
  ];

  return (
    <footer className="text-center" style={{ background: "var(--c-choc)", color: "var(--c-ivory)", padding: "60px 22px 40px" }}>
      <div className="font-display italic text-[42px]">Robin &amp; Annami</div>
      <div className="text-xs tracking-[0.3em] uppercase mt-2.5" style={{ color: "var(--c-champ)" }}>
        {t("wedding_date_venue")}
      </div>
      <div className="flex gap-2.5 justify-center flex-wrap mt-6">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-xs tracking-wider px-2 py-1" style={{ color: "rgba(248,243,236,0.65)" }}>
            {t(l.key)}
          </Link>
        ))}
      </div>
      <Link
        href="/admin"
        className="inline-block mt-7 text-[10px] tracking-[0.25em] uppercase px-5 py-2.5 rounded-full"
        style={{ border: "1px solid rgba(203,177,144,0.3)", color: "var(--c-champ)" }}
      >
        ♢ {t("bride_dashboard")}
      </Link>
      <div className="mt-5 text-[11px]" style={{ color: "rgba(248,243,236,0.35)" }}>
        {t("footer_made")}
      </div>
    </footer>
  );
}
