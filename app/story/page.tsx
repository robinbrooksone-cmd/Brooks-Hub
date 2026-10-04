"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useLang } from "@/components/LangProvider";
import { CoverSection, SectionShell } from "@/components/CoverSection";
import { getStoryAction } from "@/app/actions";
import { STORY } from "@/lib/content";
import type { Lang } from "@/lib/dict";
import type { StoryItem } from "@/lib/types";

function Photo({ item, lang }: { item: StoryItem; lang: Lang }) {
  const pos = item.position || { x: 50, y: 50 };
  const objectPosition = `${pos.x}% ${pos.y}%`;
  const title = item.title[lang];
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 340, aspectRatio: "4/5", border: "1px solid var(--c-line)", background: "var(--c-panel)" }}>
      {item.image ? (
        item.image.startsWith("/") ? (
          <Image src={item.image} alt={title} fill sizes="340px" className="object-cover" style={{ objectPosition }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt={title} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition }} />
        )
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-center" style={{ padding: 20 }}>
          <div style={{ fontSize: 30, color: "var(--c-gold)" }}>♡</div>
          <div className="font-display italic" style={{ fontSize: 16, color: "var(--c-muted)", marginTop: 8 }}>
            Photo coming soon
          </div>
        </div>
      )}
    </div>
  );
}

export default function StoryPage() {
  const { t, lang } = useLang();
  const [story, setStory] = useState<StoryItem[]>(STORY);

  useEffect(() => {
    getStoryAction().then(setStory);
  }, []);

  return (
    <SectionShell bg="#2e2019">
      <CoverSection image="/images/cover-story.jpg" eyebrow={t("story_eyebrow")} title={t("story_title")} />

      <div className="text-center mx-auto" style={{ maxWidth: 700, marginBottom: "clamp(44px,6vw,60px)" }}>
        <p style={{ color: "var(--c-muted)", fontSize: 16, lineHeight: 1.7, margin: 0 }}>{t("story_sub")}</p>
      </div>

      {/* mobile: single connected line down the left */}
      <div className="relative mx-auto md:hidden" style={{ maxWidth: 640 }}>
        <div className="absolute top-2 bottom-2" style={{ left: 7, width: 1, background: "var(--c-line)" }} />
        <div className="flex flex-col gap-14">
          {story.map((ev, i) => (
            <div key={ev.year + i} className="relative" style={{ paddingLeft: 34 }}>
              <div className="absolute rounded-full" style={{ left: 0, top: 6, width: 15, height: 15, background: "var(--c-gold)", boxShadow: "0 0 0 5px #2e2019" }} />
              <div className="font-display italic" style={{ fontSize: 30, color: "var(--c-gold)", lineHeight: 1 }}>
                {ev.year}
              </div>
              <h3 className="font-display" style={{ fontSize: 27, color: "var(--c-ivory)", margin: "8px 0 0", fontWeight: 500 }}>
                {ev.title[lang]}
              </h3>
              <div style={{ marginTop: 18 }}>
                <Photo item={ev} lang={lang} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* desktop: alternating zigzag around a center spine */}
      <div className="relative mx-auto hidden md:block" style={{ maxWidth: 1000 }}>
        <div className="absolute left-1/2 top-0 bottom-0" style={{ width: 1, background: "var(--c-line)", transform: "translateX(-50%)" }} />
        <div className="flex flex-col">
          {story.map((ev, i) => {
            const reverse = i % 2 === 1;
            const text = (
              <div className={reverse ? "text-left" : "text-right"}>
                <div className="font-display italic" style={{ fontSize: 34, color: "var(--c-gold)", lineHeight: 1 }}>
                  {ev.year}
                </div>
                <h3 className="font-display" style={{ fontSize: 32, color: "var(--c-ivory)", margin: "10px 0 0", fontWeight: 500 }}>
                  {ev.title[lang]}
                </h3>
              </div>
            );
            const photo = (
              <div style={{ width: "100%", maxWidth: 440 }}>
                <Photo item={ev} lang={lang} />
              </div>
            );
            return (
              <div key={ev.year + i} className="flex items-center" style={{ marginBottom: "clamp(64px,9vw,110px)" }}>
                <div className="flex-1 flex justify-end" style={{ paddingInline: 44 }}>
                  {reverse ? photo : text}
                </div>
                <div className="rounded-full flex-shrink-0" style={{ width: 15, height: 15, background: "var(--c-gold)", boxShadow: "0 0 0 6px #2e2019, 0 0 0 7px var(--c-line)" }} />
                <div className="flex-1 flex justify-start" style={{ paddingInline: 44 }}>
                  {reverse ? text : photo}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SectionShell>
  );
}
