"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getCopyAction } from "@/app/actions";
import { DICT, type DictKey, type Lang } from "@/lib/dict";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: DictKey) => string;
  /** Same override mechanism as t(), but for content.ts text (FAQ, travel, timeline) keyed by a synthetic string. */
  tc: (key: string, fallback: { en: string; af: string }) => string;
  /** Always English, ignoring the site-wide toggle — for BrooksWay, which stays English-only by design. */
  tEn: (key: DictKey) => string;
};

const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("af");
  const [overrides, setOverrides] = useState<Record<string, { en: string; af: string }>>({});

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("ra-lang") : null;
    if (saved === "en" || saved === "af") setLangState(saved);
    getCopyAction().then(setOverrides);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem("ra-lang", l);
  };

  const value: Ctx = {
    lang,
    setLang,
    toggle: () => setLang(lang === "en" ? "af" : "en"),
    t: (key) => overrides[key]?.[lang] || DICT[key][lang],
    tc: (key, fallback) => overrides[key]?.[lang] || fallback[lang],
    tEn: (key) => overrides[key]?.en || DICT[key].en,
  };

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
