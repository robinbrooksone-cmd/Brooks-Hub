import { ACCOMMODATION, DAY_TIMELINE, FAQ, TRAVEL_EXTRAS } from "./content";

// Bilingual content that lives in content.ts (FAQ, travel info, accommodation,
// the day-of timeline) but wasn't reachable from the admin Text tab. Each
// entry gets a stable synthetic key so it can flow through the exact same
// `copy` override system as the DICT-based text — same Row UI, same Save
// button, same instant-live-update behavior.
export type ContentCopyEntry = { key: string; label: string; en: string; af: string };

export function buildContentCopyEntries(): ContentCopyEntry[] {
  const entries: ContentCopyEntry[] = [];

  FAQ.forEach((item, i) => {
    entries.push({ key: `faq_${i}_q`, label: `FAQ ${i + 1} — Question`, en: item.en[0], af: item.af[0] });
    entries.push({ key: `faq_${i}_a`, label: `FAQ ${i + 1} — Answer`, en: item.en[1], af: item.af[1] });
  });

  ACCOMMODATION.forEach((tier, ti) => {
    entries.push({ key: `accommodation_tier_${ti}_label`, label: `Travel — ${tier.tier.en} (tier name)`, en: tier.tier.en, af: tier.tier.af });
    entries.push({ key: `accommodation_tier_${ti}_note`, label: `Travel — ${tier.tier.en} (tier note)`, en: tier.note.en, af: tier.note.af });
    tier.items.forEach((item, ii) => {
      entries.push({ key: `accommodation_item_${ti}_${ii}_desc`, label: `Travel — ${item.name} (description)`, en: item.desc.en, af: item.desc.af });
      entries.push({ key: `accommodation_item_${ti}_${ii}_dist`, label: `Travel — ${item.name} (distance)`, en: item.dist.en, af: item.dist.af });
    });
  });

  TRAVEL_EXTRAS.forEach((x, i) => {
    entries.push({ key: `travel_extra_${i}_k`, label: `Travel — ${x.k.en} (heading)`, en: x.k.en, af: x.k.af });
    entries.push({ key: `travel_extra_${i}_lines`, label: `Travel — ${x.k.en} (lines, one per row)`, en: x.lines.en.join("\n"), af: x.lines.af.join("\n") });
  });

  DAY_TIMELINE.forEach((item, i) => {
    entries.push({ key: `daytimeline_${i}_title`, label: `Wedding Day — ${item.title.en} (title)`, en: item.title.en, af: item.title.af });
    entries.push({ key: `daytimeline_${i}_note`, label: `Wedding Day — ${item.title.en} (note)`, en: item.note.en, af: item.note.af });
    if (typeof item.time !== "string") {
      entries.push({ key: `daytimeline_${i}_time`, label: `Wedding Day — ${item.title.en} (time label)`, en: item.time.en, af: item.time.af });
    }
  });

  return entries;
}
