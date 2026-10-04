import type { Family } from "./roster";

export type RsvpMember = { id: string; name: string; diet: string };

export type Rsvp = {
  id: string;
  familyId: string;
  family: string;
  side: "Bride" | "Groom";
  members: RsvpMember[];
  notAttending: RsvpMember[];
  accommodation: string;
  transport: string;
  song: string;
  allergies: string;
  message: string;
  email: string;
  phone: string;
  createdAt: number;
};

export type Task = { id: string; title: string; date: string; done: boolean };
export type Payment = { id: string; vendor: string; amount: string; date: string; paid: boolean };

export type SeatingTable = {
  id: string;
  name: string;
  cap: number;
  shape: "round" | "long" | "square";
  head: boolean;
  seats: string[]; // guest keys "familyId:memberId"
};

// ---------- Seating floor plan ----------

export type FloorItemType =
  | "table"
  | "headTable"
  | "danceFloor"
  | "djBooth"
  | "stage"
  | "bar"
  | "cakeTable"
  | "giftTable"
  | "photoBooth"
  | "entrance"
  | "exit"
  | "buffet"
  | "dessertTable"
  | "custom";

export type TableShape = "round" | "rect" | "square";

export type FloorItem = {
  id: string;
  type: FloorItemType;
  name: string;
  x: number; // center, world px
  y: number; // center, world px
  w: number;
  h: number;
  rotation: number; // degrees
  color: string;
  shape?: TableShape; // meaningful for table / headTable
  cap?: number; // seat capacity — table / headTable only
  seats?: string[]; // guest keys "familyId:memberId" — table / headTable only
  locked?: boolean;
};

export type SeatingLayout = {
  items: FloorItem[];
  zoom: number;
  panX: number;
  panY: number;
  gridSize: number;
  snap: boolean;
};

export const emptySeatingLayout = (): SeatingLayout => ({
  items: [],
  zoom: 1,
  panX: 0,
  panY: 0,
  gridSize: 20,
  snap: true,
});

export type BwSlip = {
  id: string;
  ticket: string;
  game: "ceremony" | "reception";
  name: string;
  answers: Record<number, number>; // question index -> chosen option index
  paid: boolean;
  createdAt: number;
};

export type BwGameState = {
  revealed: boolean;
  launched: boolean;
  prize: number;
  results: Record<number, number>; // question index -> actual option index
};

export type Bilingual = { en: string; af: string };
export type BwQuestion = { q: Bilingual; options: Bilingual[] };
export type BwGame = "ceremony" | "reception";

export type PhotoPosition = { x: number; y: number }; // percentages, 0-100

export type StoryItem = { year: string; title: Bilingual; text?: string; image: string; position?: PhotoPosition };

export type PayfastSettings = { merchantId: string; merchantKey: string; passphrase: string; live: boolean };

export type Store = {
  families: Family[];
  rsvps: Rsvp[];
  tasks: Task[];
  payments: Payment[];
  tables: SeatingTable[];
  seatingLayout: SeatingLayout;
  bwSlips: BwSlip[];
  bwState: { ceremony: BwGameState; reception: BwGameState };
  bwQuestions: { ceremony: BwQuestion[]; reception: BwQuestion[] };
  story: StoryItem[];
  photos: Record<string, string>; // named slot -> override image URL
  photoPositions: Record<string, PhotoPosition>; // named slot -> crop focal point
  notifiedEmails: string[]; // guests already sent the "BrooksWay is open" email
  copy: Record<string, { en: string; af: string }>; // dict key -> override text, sparse
  payfast: PayfastSettings;
};

export const emptyStore = (
  families: Family[],
  story: StoryItem[],
  bwQuestions: { ceremony: BwQuestion[]; reception: BwQuestion[] }
): Store => ({
  families,
  rsvps: [],
  tasks: [],
  payments: [],
  tables: [],
  seatingLayout: emptySeatingLayout(),
  bwSlips: [],
  bwState: {
    ceremony: { revealed: false, launched: false, prize: 1000, results: {} },
    reception: { revealed: false, launched: false, prize: 1000, results: {} },
  },
  bwQuestions,
  story,
  photos: {},
  photoPositions: {},
  notifiedEmails: [],
  copy: {},
  payfast: { merchantId: "", merchantKey: "", passphrase: "", live: false },
});
