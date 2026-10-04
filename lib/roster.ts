/**
 * `isBaby` marks an infant who attends but isn't a guest in the counting
 * sense — no seat, no place setting, excluded from headcounts and the
 * seating planner. They can still RSVP with their household.
 */
export type Guest = { id: string; name: string; isBaby?: boolean };
export type Family = { id: string; name: string; side: "Bride" | "Groom"; members: Guest[] };

// The full guest roster, grouped into households by surname (matching the
// original design's grouping logic) so RSVP search can find a whole family
// by typing any member's first or last name.
export const ROSTER: string[] = [
  "Andre Botma", "Anisca Nel", "WG Nel", "Baba Nel", "Annatjie Janse van Rensburg",
  "Annelie Louwrens", "Chris Louwrens", "Annika Williams", "Dillon Williams", "Marinus Williams",
  "Marisia Williams", "Ansie Marx", "Attie Joubert", "Carol Joubert", "Beth Roberts", "Greg Roberts",
  "Boeta Theron", "Botha Smit", "Carla du Toit", "Burgert Kloppers", "Callista Louwrens",
  "Carina Keyser", "Gideon Keyser", "Renske Keyser", "Carla Laufs", "Dirk Laufs", "Chris van Gass",
  "Lumé Crous", "Christa van Rensburg", "Christo van Rensburg", "Christian Wilkens", "Coetzer Laufs",
  "Corné Kruger", "Cornel Smit", "Kristen Campher", "CP Kasselman", "Danie Doubell",
  "Mieke Labuschagne", "Danielle Brink", "Kolbe Kolver", "Dantes Viljoen", "Mirna de Wet",
  "Dewald Donald", "Olivia Stilnovich", "Dewald Pienaar", "Dinamari van Rensburg", "Duane Kohl",
  "Carryn Kohl", "Eben Odendaal", "Bianca Odendaal", "Emma Theron", "Jan-Hendrik Theron",
  "Mila Theron", "Emmere Steenkamp", "Eric Sherman", "Maddy Sherman", "Evan du Plessis",
  "Chanel du Plessis", "Armani du Plessis", "Evan Roos", "Gerda Laufs", "Gerhard Laufs",
  "Helene Laufs", "Gert Venter", "Odette Venter", "Hanco Coetzee", "Hannes Brink", "Monique Brink",
  "Heinrich Bisschoff", "Helene van Rensburg", "Henriette Bosch", "Werner Bosch", "Stian Bosch",
  "Alri Bosch", "Herman Koegelenberg", "Jane Koegelenberg", "Hesmari Bosch", "Urich Bosch",
  "Jaco Brits", "Jaco Keyser", "Jan Jonck", "Nicole Jonck", "Janco Jonck", "Janco Uys",
  "Savannah Klee", "Jani Heslinga", "Jannie Brooks", "Adri Brooks", "Jenna Gunning", "Nic Swanepoel",
  "Jessi Brooks", "JF van Heerden", "Johan Barnard", "Elita Barnard", "Zani Barnard", "Lee Barnard",
  "Johann Kotzé", "Hanli Kotzé", "Jusha Dann", "Kade Wolhuter", "Dane du Plessis", "Kara Pretorius",
  "Stefan Pretorius", "Karmen Maritz", "Keegan Fourie", "Paul van Rensburg", "KleinJan Tromp",
  "Rosemarie Tromp", "Kumon du Preez", "Lara Irons", "Leasha Grobler", "Ighnus Grobler",
  "Lombard Joubert", "Marica Marx", "Marisa Joubert", "Fanie Joubert", "Marnus Aucamp", "Mart Kotzé",
  "Matt Brooks", "Joane Fondse", "MD Laubscher", "Marieke Le Roux", "Michael Nieuwoudt",
  "Mieke Haasbroek", "Johan Haasbroek", "Van Wyk Haasbroek", "Mila Brooks", "Monica Maritz",
  "Thys Maritz", "Neeltje Wilkens", "Carin Wilkens", "Nellie Kruger", "Ryno Kruger", "Ronel Kruger",
  "Werner Kruger", "Nicola Gouws", "Louis Gouws", "Nicole Steenkamp", "Duan Steenkamp", "Nina Steyn",
  "Nick Steyn", "Paul de Wet", "Pieter Marx", "Paula Marx", "PJ Marx", "Reileen Badenhorst",
  "Riaan Badenhorst", "Ria du Buisson", "Duncan du Buisson", "Rina Oosthuizen", "Rudolph Oosthuizen",
  "Ruach Oosthuizen", "Robbie Kruse", "Lynn Kruse", "Roelf Lindeque", "Rome Joubert", "Chris Joubert",
  "Milae Joubert", "Ryan Rossouw", "Karla de Wet", "SD Meyer", "Sergio Fernandes", "Ohmar Fernandes",
  "Gaby Fernandes", "Claudia Fernandes", "Stephen Kitshoff", "Steyn van der Spuy",
  "Michelle van der Spuy", "Tehillah Kasselman", "Theuns Wilkens", "Jan Willem Scholtz",
  "Tiaan de Jager", "Marilet de Jager", "Tobias de Flamingh", "Trudi Kasselman", "Danie Kasselman",
  "Wihann Engelbrecht", "Nechelle Jacobs", "Roelf Lindeque +1", "Ronel Kruger +1", "Werner Kruger +1",
];

const PARTICLES = ["van", "der", "de", "du", "le", "janse", "von"];

function surnameOf(name: string): string {
  const parts = name.replace(/\s*\+1$/, "").trim().split(/\s+/);
  let i = parts.length - 1;
  const sur = [parts[i]];
  while (i - 1 >= 1 && PARTICLES.includes(parts[i - 1].toLowerCase())) {
    i--;
    sur.unshift(parts[i]);
  }
  if (i - 1 >= 1 && PARTICLES.includes(parts[i - 1].toLowerCase())) {
    i--;
    sur.unshift(parts[i]);
  }
  return sur.join(" ").toLowerCase();
}

export function buildFamiliesFromRoster(): Family[] {
  const groups: { sur: string; members: Guest[] }[] = [];
  let cur: { sur: string; members: Guest[] } | null = null;
  ROSTER.forEach((name, idx) => {
    const sur = surnameOf(name);
    if (cur && cur.sur === sur) {
      cur.members.push({ id: "g" + idx, name });
    } else {
      cur = { sur, members: [{ id: "g" + idx, name }] };
      groups.push(cur);
    }
  });
  return groups.map((g, gi) => {
    const firsts = g.members.map((m) => m.name.replace(/\s*\+1$/, "").split(/\s+/)[0]);
    const sur = g.members[0].name.replace(/\s*\+1$/, "").split(/\s+/).slice(-1)[0];
    const display =
      g.members.length === 1
        ? g.members[0].name
        : g.members.length === 2
          ? firsts.join(" & ") + " " + sur
          : "The " + sur + " Family";
    return { id: "fam" + gi, name: display, side: "Bride" as const, members: g.members };
  });
}
