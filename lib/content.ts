export const NAMES = "Robin & Annami";
export const WEDDING_DATE_LABEL = "5 December 2026";
export const VENUE = "Bona Bona Game Reserve";
// UTC ms for the ceremony start, used by the countdown.
export const TARGET_MS = Date.UTC(2026, 11, 5, 14, 0, 0);
export const MAP_QUERY = "Bona Bona Game Reserve";

export const STORY = [
  {
    year: "2019",
    title: { en: "How We Met", af: "Hoe Ons Ontmoet Het" },
    text: "A mutual friend's braai, a borrowed jersey when the evening turned cold, and a conversation that ran until 2am. Neither of us went home thinking about anyone else.",
    image: "",
  },
  {
    year: "2020",
    title: { en: "Our First Date", af: "Ons Eerste Afspraak" },
    text: "Coffee that turned into lunch that turned into a sunset walk along the promenade. Robin still says he knew right then.",
    image: "/images/story-1.jpg",
  },
  {
    year: "2023",
    title: { en: "The Adventures", af: "Die Avonture" },
    text: "Two passports, far too many road trips, and a shared spreadsheet of every restaurant we want to try. Life simply got better together.",
    image: "",
  },
  {
    year: "2025",
    title: { en: "The Proposal", af: "Die Aansoek" },
    text: "On a quiet stretch of coastline at golden hour, with both our families hiding behind the dunes. She said yes before he finished the sentence.",
    image: "",
  },
];

export const BANKING = [
  { k: "Account Name", af: "Rekeningnaam", v: "A Marx" },
  { k: "Bank", af: "Bank", v: "Discovery Bank" },
  { k: "Account Number", af: "Rekeningnommer", v: "16223059273" },
  { k: "Branch Code", af: "Takkode", v: "679000" },
  { k: "Reference", af: "Verwysing", v: "Your Name & Surname" },
];

export const DAY_TIMELINE = [
  { time: "15:30", title: { en: "Guests arrive", af: "Gaste arriveer" }, note: { en: "Welcome to Bona Bona", af: "Welkom by Bona Bona" }, icon: "arrive" },
  { time: "16:00", title: { en: "Ceremony begins", af: "Seremonie begin" }, note: { en: "Please be seated by 15:45", af: "Neem asb. plaas teen 15:45" }, icon: "rings" },
  { time: "16:45", title: { en: "Family & group photos", af: "Familie- & groepfoto's" }, note: { en: "Photos with the couple", af: "Foto's met die paartjie" }, icon: "camera" },
  { time: "17:00", title: { en: "Canapés & welcome drinks", af: "Kanapees & welkomsdrankies" }, note: { en: "Relax and enjoy", af: "Ontspan en geniet" }, icon: "drinks" },
  { time: "19:00", title: { en: "Reception & dinner", af: "Onthaal" }, note: { en: "Dinner & speeches", af: "Ete & toesprake" }, icon: "dinner" },
  { time: "21:00", title: { en: "Dance floor opens", af: "Dansvloer open" }, note: { en: "Come dance with us", af: "Kom dans saam" }, icon: "dance" },
  { time: "02:00", title: { en: "Venue closes", af: "Venue sluit" }, note: { en: "Travel safely", af: "Ry veilig" }, icon: "moon" },
  { time: { en: "Sun 09:00", af: "So 09:00" }, title: { en: "Sunday breakfast", af: "Sondag-ontbyt" }, note: { en: "Jakkals Restaurant at Bona Bona", af: "Jakkals Restaurant by Bona Bona" }, icon: "sun" },
];

export const ACCOMMODATION = [
  {
    tier: { en: "At the venue", af: "By die venue" },
    note: { en: "Reserved for wedding guests", af: "Vir trougaste gereserveer" },
    items: [
      {
        name: "Bona Bona Game Lodge ⭐",
        desc: {
          en: "All lodging at Bona Bona is reserved exclusively for our wedding guests. If the lodge shows as fully booked online, don't worry — please phone reception directly to make your booking.",
          af: "Alle verblyf by Bona Bona is uitsluitlik vir ons trougaste gereserveer. As die lodge aanlyn as vol wys, moenie bekommerd wees nie — skakel asseblief die ontvangs direk om te bespreek.",
        },
        dist: { en: "The wedding venue", af: "Die trouvenue" },
        price: "bonabona.co.za",
        url: "https://bonabona.co.za",
      },
    ],
  },
  {
    tier: { en: "Nearby", af: "Naby" },
    note: { en: "Book early to avoid disappointment", af: "Bespreek vroeg om teleurstelling te voorkom" },
    items: [
      {
        name: "Motswedi Gasteplaas",
        desc: { en: "Comfortable guest farm a short drive from the reserve.", af: "Gemaklike gasteplaas 'n kort ent van die reservaat." },
        dist: { en: "± 5 km from Bona Bona", af: "± 5 km van Bona Bona" },
        price: "LekkeSlaap ↗",
        url: "https://www.lekkeslaap.co.za/accommodation/motswedi-gaste-plaas",
      },
      {
        name: "Grootbosch Lodge",
        desc: { en: "Relaxed lodge with easy access to the venue.", af: "Ontspanne lodge met maklike toegang tot die venue." },
        dist: { en: "± 10 km from Bona Bona", af: "± 10 km van Bona Bona" },
        price: "grootbosch.co.za",
        url: "https://www.grootbosch.co.za/",
      },
    ],
  },
];

export const TRAVEL_EXTRAS = [
  {
    k: { en: "Getting there", af: "Hoe om daar te kom" },
    lines: {
      en: ["Bona Bona Game Reserve, North West", "± 2 hrs from Johannesburg", "Ample parking at the venue"],
      af: ["Bona Bona Game Reserve, Noordwes", "± 2 uur vanaf Johannesburg", "Volop parkering by die venue"],
    },
  },
  {
    k: { en: "Good to know", af: "Goed om te weet" },
    lines: {
      en: ["Book accommodation as early as possible", "Phone reception if the lodge shows full", "Bring layers — bushveld evenings cool down"],
      af: ["Bespreek verblyf so vroeg moontlik", "Skakel ontvangs as die lodge vol wys", "Bring lae aan — bosveldaande koel af"],
    },
  },
  {
    k: { en: "Sunday send-off", af: "Sondag-afskeid" },
    lines: {
      en: ["Breakfast at Jakkals Restaurant", "On the reserve · from 09:00", "A relaxed farewell before you travel"],
      af: ["Ontbyt by Jakkals Restaurant", "Op die reservaat · vanaf 09:00", "Ontspanne afskeid voor jy ry"],
    },
  },
];

export const GROOMSMEN = [
  { name: "Matt Brooks", role: "role_bestman" as const },
  { name: "PJ Marx", role: "role_groomsman" as const },
  { name: "Duan Steenkamp", role: "role_groomsman" as const },
  { name: "Stefan Pretorius", role: "role_groomsman" as const },
  { name: "MD Laubscher", role: "role_groomsman" as const },
  { name: "Evan Roos", role: "role_groomsman" as const },
  { name: "Marnus Aucamp", role: "role_groomsman" as const },
];

export const BRIDESMAIDS = [
  { name: "Marica Marx", role: "role_moh" as const },
  { name: "Mila Brooks", role: "role_bridesmaid" as const },
  { name: "Jessi Brooks", role: "role_bridesmaid" as const },
  { name: "Nicole Steenkamp", role: "role_bridesmaid" as const },
  { name: "Kara Pretorius", role: "role_bridesmaid" as const },
  { name: "Nicola Gouws", role: "role_bridesmaid" as const },
  { name: "Danielle Brink", role: "role_bridesmaid" as const },
];

export const FAQ = [
  {
    en: ["What time should I arrive?", "Please arrive by 15:30 so we can begin the ceremony promptly at 16:00."],
    af: ["Hoe laat moet ek daar wees?", "Kom gerus teen 15:30 aan, sodat ons stiptelik om 16:00 kan begin."],
  },
  {
    en: ["Is parking available?", "Yes — free, secure parking is available on-site with attendants to guide you."],
    af: ["Is daar parkering?", "Ja — gratis, veilige parkering is by die venue beskikbaar met helpers om jou te lei."],
  },
  {
    en: ["Is the ceremony indoors or outdoors?", "The ceremony is outdoors in the bushveld, with a covered area on standby should the weather turn."],
    af: ["Is die seremonie binne of buite?", "Die seremonie is buite in die bosveld, met 'n oordekte area gereed indien die weer draai."],
  },
  {
    en: ["Can children attend?", "We love your little ones. Children are welcome at the celebration."],
    af: ["Mag kinders bywoon?", "Absoluut — ons is mal oor jul kleintjies. Kinders is baie welkom."],
  },
  {
    en: ["What is the dress code?", "Formal, in earthy chocolate tones. Think elegant — and bring something warm for the evening, it cools down."],
    af: ["Wat is die kleredrag?", "Formeel in aardse sjokoladebruin. Dink elegant — en bring iets warms vir die aand, dit koel af."],
  },
  {
    en: ["What happens if it rains?", "We have a beautiful covered area, so the celebration continues rain or shine."],
    af: ["Wat gebeur as dit reën?", "Ons het 'n pragtige oordekte area, so die fees gaan voort reën of skyn."],
  },
  {
    en: ["Can I take photos?", "During the ceremony we ask for an unplugged moment — after that, snap away and tag us so we can relive every moment!"],
    af: ["Mag ek foto's neem?", "Tydens die seremonie vra ons 'n \"unplugged\" oomblik — daarna, neem gerus foto's en merk ons!"],
  },
  {
    en: ["Who do I contact with questions?", "See the Contact page — our coordinators are happy to help with anything."],
    af: ["Wie kontak ek met vrae?", "Kyk op die Kontak-bladsy — ons help jou graag met enigiets."],
  },
];

export const CONTACTS = [
  { role: { en: "The Bride", af: "Die Bruid" }, name: "Annami", phone: "071 895 5303", email: "annamimarx@gmail.com" },
  { role: { en: "The Groom", af: "Die Bruidegom" }, name: "Robin", phone: "079 483 1902", email: "robinbrooksone@gmail.com" },
  { role: { en: "Maid of Honour", af: "Strooimeisie" }, name: "Marica Marx", phone: "076 990 8732", email: "maricamarx@gmail.com" },
  { role: { en: "Accommodation & Transport", af: "Verblyf & Vervoer" }, name: "Bona Bona", phone: "071 674 9969", email: "info@bonabona.co.za" },
];

function bl(en: string, af: string) {
  return { en, af };
}

export const BW_QUESTIONS = {
  ceremony: [
    {
      q: bl("Who sheds the first tear during the ceremony?", "Wie is die eerste een wat 'n traan laat tydens die seremonie?"),
      options: [bl("Robin", "Robin"), bl("Annami", "Annami"), bl("Mother of the bride", "Moeder van die bruid"), bl("Matt (Best Man)", "Matt (Beste Man)")],
    },
    {
      q: bl("Who carries the rings down the aisle?", "Wie dra die ringe met die gangpad af?"),
      options: [bl("Togo 🐾", "Togo 🐾"), bl("Matt Brooks", "Matt Brooks"), bl("A groomsman", "'n Strooijonker"), bl("A little one", "'n Kleintjie")],
    },
    {
      q: bl("Will Robin cry at the first look?", "Sal Robin huil by die eerste 'first look'?"),
      options: [bl("Yes, full tears", "Ja, volop trane"), bl("Tries to hide it", "Probeer dit wegsteek"), bl("Stays composed", "Bly kalm")],
    },
    {
      q: bl("What time does the ceremony actually start?", "Hoe laat begin die seremonie werklik?"),
      options: [bl("On time (16:00)", "Betyds (16:00)"), bl("5–15 min late", "5–15 min laat"), bl("15+ min late", "15+ min laat")],
    },
    {
      q: bl("Weather at 16:00?", "Weer om 16:00?"),
      options: [bl("Sunny", "Sonnig"), bl("Cloudy", "Bewolk"), bl("A spot of rain", "'n Bietjie reën")],
    },
    {
      q: bl("Who walks in first?", "Wie loop eerste in?"),
      options: [bl("The bridesmaids", "Die brugsmeisies"), bl("Marica (MoH)", "Marica (Strooimeisie)"), bl("Togo", "Togo")],
    },
    {
      q: bl("How long is the ceremony?", "Hoe lank duur die seremonie?"),
      options: [bl("Under 20 min", "Onder 20 min"), bl("20–35 min", "20–35 min"), bl("35+ min", "35+ min")],
    },
    {
      q: bl("Who looks the most nervous?", "Wie lyk die senuweeagtigste?"),
      options: [bl("Robin", "Robin"), bl("Matt Brooks", "Matt Brooks"), bl("Annami's dad", "Annami se pa")],
    },
    {
      q: bl("How does Togo behave?", "Hoe gedra Togo hom?"),
      options: [bl("Perfect gentleman", "Perfekte heer"), bl("A little chaos", "'n Bietjie chaos"), bl("Steals the show", "Steel die show")],
    },
    {
      q: bl('Whose voice cracks on "I do"?', 'Wie se stem breek by "ek wil"?'),
      options: [bl("Robin", "Robin"), bl("Annami", "Annami"), bl("Both of them", "Altwee")],
    },
  ],
  reception: [
    {
      q: bl("Who gives the funniest speech?", "Wie gee die snaaksste toespraak?"),
      options: [bl("Matt Brooks", "Matt Brooks"), bl("PJ Marx", "PJ Marx"), bl("Marica Marx", "Marica Marx"), bl("Father of the bride", "Vader van die bruid")],
    },
    {
      q: bl("Longest speech of the night?", "Langste toespraak van die aand?"),
      options: [bl("Best Man", "Beste Man"), bl("Maid of Honour", "Strooimeisie"), bl("Father of the bride", "Vader van die bruid")],
    },
    {
      q: bl("First onto the dance floor?", "Eerste op die dansvloer?"),
      options: [bl("Robin & Annami", "Robin & Annami"), bl("The bridesmaids", "Die brugsmeisies"), bl("The groomsmen", "Die strooijonkers"), bl("Togo", "Togo")],
    },
    {
      q: bl("Who catches the bouquet?", "Wie vang die ruiker?"),
      options: [bl("Mila Brooks", "Mila Brooks"), bl("Jessi Brooks", "Jessi Brooks"), bl("Nicole Steenkamp", "Nicole Steenkamp"), bl("A surprise", "'n Verrassing")],
    },
    {
      q: bl("First dance song style?", "Eerste dans-liedjiestyl?"),
      options: [bl("Ballad", "Ballade"), bl("Afrikaans", "Afrikaans"), bl("Pop", "Pop")],
    },
    {
      q: bl("Will there be a conga line?", "Sal daar 'n conga-lyn wees?"),
      options: [bl("Yes", "Ja"), bl("No", "Nee")],
    },
    {
      q: bl("Last one standing on the dance floor?", "Laaste een oor op die dansvloer?"),
      options: [bl("PJ Marx", "PJ Marx"), bl("Evan Roos", "Evan Roos"), bl("A bridesmaid", "'n Brugsmeisie")],
    },
    {
      q: bl("How many speeches in total?", "Hoeveel toesprake in totaal?"),
      options: [bl("3 or fewer", "3 of minder"), bl("4–5", "4–5"), bl("6+", "6+")],
    },
    {
      q: bl("First to kick off their shoes dancing?", "Eerste om skoene uit te skop en te dans?"),
      options: [bl("Annami", "Annami"), bl("A bridesmaid", "'n Brugsmeisie"), bl("Marnus Aucamp", "Marnus Aucamp")],
    },
    {
      q: bl("When does the bar tab run dry?", "Wanneer raak die kroeg-rekening op?"),
      options: [bl("Before 23:00", "Voor 23:00"), bl("23:00–00:30", "23:00–00:30"), bl("It survives the night", "Dit oorleef die nag")],
    },
  ],
};

export type BwGame = keyof typeof BW_QUESTIONS;
