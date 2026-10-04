"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLang } from "./LangProvider";

const LINKS: { href: string; key: Parameters<ReturnType<typeof useLang>["t"]>[0] }[] = [
  { href: "/story", key: "nav_story" },
  { href: "/wedding-day", key: "nav_day" },
  { href: "/travel", key: "nav_travel" },
  { href: "/wedding-party", key: "nav_party" },
  { href: "/dress-code", key: "nav_dress" },
  { href: "/registry", key: "nav_registry" },
  { href: "/faq", key: "nav_faq" },
  { href: "/contact", key: "nav_contact" },
];

function BrooksWayBadge({ size = "sm" }: { size?: "sm" | "lg" }) {
  const big = size === "lg";
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontWeight: 800,
        letterSpacing: "-0.02em",
        color: "#fff",
        fontSize: big ? undefined : 13,
        lineHeight: 1,
      }}
    >
      brooks<span style={{ color: "#00B83F" }}>way</span>
    </span>
  );
}

export function Nav() {
  const { t, lang, toggle } = useLang();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  const navText = scrolled || pathname !== "/" ? "var(--c-ivory)" : "var(--c-ivory)";
  const navBg = scrolled || pathname !== "/" ? "rgba(46,32,25,0.82)" : "transparent";
  const navBorder = scrolled ? "rgba(203,177,144,0.16)" : "transparent";

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-[90] flex items-center justify-between backdrop-blur-md transition-colors duration-300"
        style={{
          padding: "16px clamp(18px,4vw,52px)",
          background: navBg,
          borderBottom: `1px solid ${navBorder}`,
        }}
      >
        <Link
          href="/"
          className="font-display text-[21px] tracking-[0.12em] whitespace-nowrap"
          style={{ color: navText }}
        >
          R <span style={{ color: "var(--c-gold)" }} className="italic">&amp;</span> A
        </Link>
        <div className="flex items-center gap-1">
          <div className="hidden lg:flex gap-0.5">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="font-body text-[11px] tracking-[0.12em] uppercase px-3 py-2 rounded-sm transition-opacity hover:opacity-70"
                style={{ color: navText, opacity: pathname === l.href ? 1 : 0.75 }}
              >
                {t(l.key)}
              </Link>
            ))}
            <Link href="/games" className="flex items-center px-2 transition-opacity hover:opacity-80" style={{ opacity: pathname === "/games" ? 1 : 0.85 }}>
              <BrooksWayBadge />
            </Link>
          </div>
          <button
            onClick={toggle}
            title="Afrikaans / English"
            className="font-body ml-2 px-3 py-2 rounded-sm border text-[11px] tracking-[0.14em] whitespace-nowrap cursor-pointer bg-transparent"
            style={{ borderColor: navBorder === "transparent" ? "rgba(203,177,144,0.3)" : navBorder, color: navText }}
          >
            ⌥ {lang.toUpperCase()}
          </button>
          <Link
            href="/rsvp"
            className="font-body ml-2 px-5 py-[9px] rounded-sm text-[11px] tracking-[0.2em] uppercase whitespace-nowrap text-white"
            style={{ background: "var(--c-gold)" }}
          >
            {t("nav_rsvp")}
          </Link>
          <button
            onClick={() => setMenuOpen(true)}
            className="ml-1.5 w-[42px] h-[42px] flex flex-col items-center justify-center gap-[5px] border rounded-sm cursor-pointer bg-transparent"
            style={{ borderColor: navBorder === "transparent" ? "rgba(203,177,144,0.3)" : navBorder }}
            aria-label="Menu"
          >
            <span className="block w-[18px] h-[1.5px]" style={{ background: navText }} />
            <span className="block w-[18px] h-[1.5px]" style={{ background: navText }} />
            <span className="block w-[18px] h-[1.5px]" style={{ background: navText }} />
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div
          className="fixed inset-0 z-[100] flex flex-col overflow-auto fade-in"
          style={{ background: "var(--c-choc)", padding: "24px clamp(22px,6vw,64px)" }}
        >
          <div className="flex justify-between items-center">
            <div className="font-display text-[22px]" style={{ color: "var(--c-ivory)" }}>
              R <span style={{ color: "var(--c-gold)" }}>&amp;</span> A
            </div>
            <button
              onClick={() => setMenuOpen(false)}
              className="w-11 h-11 rounded-full text-xl cursor-pointer bg-transparent"
              style={{ border: "1px solid rgba(203,177,144,0.4)", color: "var(--c-champ)" }}
            >
              ×
            </button>
          </div>
          <div className="flex-1 flex flex-col justify-center gap-1 py-8">
            <Link
              href="/"
              className="font-display text-[15vw] sm:text-5xl py-3"
              style={{ color: "var(--c-ivory)" }}
            >
              {t("nav_home")}
            </Link>
            {LINKS.slice(0, 5).map((l) => (
              <Link key={l.href} href={l.href} className="font-display text-[10vw] sm:text-5xl py-3" style={{ color: "var(--c-ivory)" }}>
                {t(l.key)}
              </Link>
            ))}
            <Link href="/games" className="text-[10vw] sm:text-5xl py-3">
              <BrooksWayBadge size="lg" />
            </Link>
            {LINKS.slice(5).map((l) => (
              <Link key={l.href} href={l.href} className="font-display text-[10vw] sm:text-5xl py-3" style={{ color: "var(--c-ivory)" }}>
                {t(l.key)}
              </Link>
            ))}
          </div>
          <div
            className="flex justify-between items-center pt-4 text-xs tracking-wider"
            style={{ borderTop: "1px solid rgba(203,177,144,0.2)", color: "rgba(248,243,236,0.5)" }}
          >
            <span>{t("wedding_date")}</span>
            <Link href="/admin" className="uppercase tracking-[0.2em]" style={{ color: "var(--c-gold)" }}>
              ♢ {t("bride_dashboard")}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
