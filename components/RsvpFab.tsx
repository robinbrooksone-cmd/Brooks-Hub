"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLang } from "./LangProvider";

export function RsvpFab() {
  const { t } = useLang();
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (pathname === "/rsvp" || pathname.startsWith("/admin") || !show) return null;

  return (
    <Link
      href="/rsvp"
      className="fixed z-[80] fade-up text-white"
      style={{
        bottom: 22,
        right: 22,
        padding: "15px 26px",
        background: "var(--c-gold)",
        borderRadius: 40,
        fontSize: 11,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        boxShadow: "0 10px 30px rgba(58,42,33,0.35)",
      }}
    >
      ✦ {t("nav_rsvp")} Now
    </Link>
  );
}
