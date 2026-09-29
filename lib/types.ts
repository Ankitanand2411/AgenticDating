// ─── People ──────────────────────────────────────────────────────────────────

export type PersonStatus = "pending" | "scraping" | "analyzing" | "ready" | "error";

export type ScrapeMethod =
  | "instagram_web_api"
  | "instagram_og_tags"
  | "linkedin_jsonld"
  | "apify"
  | "web_research"
  | "mock"
  | "failed";

export interface SourceCapture {
  method: ScrapeMethod;
  fetchedAt: string;
  /** Normalised plain-text digest of what was read (what the reader agent sees). */
  digest: string;
  /** Best-effort structured fields for the profile header. */
  fields: Record<string, string | number | boolean | null>;
  error?: string;
}

export interface EvidenceItem {
  label: string;
  evidence: string;
}

export interface PersonAnalysis {
  name: string;
  headline: string;
  location: string;
  summary: string;
  reading: string; // narrative: how the agent read the two sources
  needs: EvidenceItem[];
  hobbies: EvidenceItem[];
  interests: EvidenceItem[];
  values: string[];
  personality: {
    traits: string[];
    communicationStyle: string;
    energy: string;
    humor: string;
  };
  lifestyle: {
    workLife: string;
    social: string;
    travel: string;
    fitness: string;
  };
  lookingFor: string;
  dealbreakers: string[];
  greenFlags: string[];
  conversationHooks: string[];
  agentPersona: string; // first-person brief the dating agent embodies
  confidence: { linkedin: number; instagram: number };
  sourceHighlights: { linkedin: string[]; instagram: string[] };
}

export interface Person {
  id: string;
  createdAt: string;
  updatedAt: string;
  linkedinUrl: string;
  instagramUrl: string;
  instagramHandle: string;
  linkedinSlug: string;
  /** Placeholder name derived from the URL until the reader fills it in. */
  displayName: string;
  status: PersonStatus;
  error?: string;
  sources?: {
    linkedin?: SourceCapture;
    instagram?: SourceCapture;
  };
  analysis?: PersonAnalysis;
  analyzedAt?: string;
  models?: { reader?: string };
}

// ─── Dates ───────────────────────────────────────────────────────────────────

export type DateStatus = "pending" | "running" | "done" | "error";

export interface DateMessage {
  speakerId: string;
  speakerName: string;
  text: string;
  at: string;
}

export interface Debrief {
  compatibility: number; // 1-10
  chemistry: number; // 1-10
  liked: string[];
  concerns: string[];
  seeAgain: "yes" | "maybe" | "no";
  verdict: string;
}

export interface DateRecord {
  id: string; // pair key a__b (sorted ids)
  personAId: string;
  personBId: string;
  status: DateStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  scene?: string;
  messages: DateMessage[];
  debriefs?: Record<string, Debrief>; // keyed by personId
  error?: string;
  model?: string;
}

// ─── Rankings ────────────────────────────────────────────────────────────────

export interface RankedMatch {
  rank: number;
  personId: string;
  name: string;
  headline: string;
  dateId: string;
  score: number; // this person's agent score for the other (compatibility)
  theirScore: number; // the other's agent score for this person
  mutual: number; // average
  chemistry: number;
  seeAgain: Debrief["seeAgain"];
  verdict: string;
  liked: string[];
  concerns: string[];
  mutualTop3?: boolean;
}

export interface PersonRanking {
  personId: string;
  name: string;
  headline: string;
  datesCompleted: number;
  datesTotal: number;
  matches: RankedMatch[];
}

export interface MutualMatch {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  dateId: string;
  aScore: number;
  bScore: number;
  mutual: number;
  aRank: number;
  bRank: number;
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

export interface PipelineStatus {
  people: { total: number; ready: number; pending: number; working: number; error: number };
  dates: { total: number; done: number; pending: number; running: number; error: number };
  background: { running: boolean; step?: string; startedAt?: string; note?: string };
}

export interface DbShape {
  people: Record<string, Person>;
  dates: Record<string, DateRecord>;
  meta: { version: number; createdAt: string; background?: PipelineStatus["background"] };
}
