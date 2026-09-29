import { chatJson, readerModel } from "../llm";
import type { Person, PersonAnalysis, SourceCapture } from "../types";

const READER_SYSTEM = `You are a perceptive, kind matchmaker's analyst. You are given exactly two sources about one real person: their public LinkedIn profile and their public Instagram profile. Nothing else exists.

Your job: read both sources closely and produce a grounded, specific analysis that a dating agent will use to represent this person on dates. Every claim must be traceable to something in the sources. Where you infer, say what you inferred from. When a source is thin, lower your confidence rather than inventing detail.

Hard rules:
- Never guess sexual orientation, religion, ethnicity, health, politics, relationship status, or age. Do not comment on appearance or bodies.
- Be respectful and warm — this is about who they are and what would make them happy with a partner, not a judgement of them.
- Do not use anything except the two sources given.
- Output ONLY a single JSON object matching the schema. No prose before or after, no code fences.

Schema:
{
  "name": string,                       // real name as it appears in the sources
  "headline": string,                   // 6-12 words: who they are (work + one human detail)
  "location": string,                   // city/country if present, else ""
  "summary": string,                    // 2-3 sentences, specific and human
  "reading": string,                    // 3-6 sentences narrating HOW you read them: what LinkedIn says, what Instagram adds, where they agree or contrast
  "needs": [{"label": string, "evidence": string}],       // 3-5 relationship needs, each with the source evidence
  "hobbies": [{"label": string, "evidence": string}],     // 3-6
  "interests": [{"label": string, "evidence": string}],   // 3-6 intellectual/professional/cultural interests
  "values": [string],                   // 3-5 single words or short phrases
  "personality": {"traits": [string], "communicationStyle": string, "energy": string, "humor": string},
  "lifestyle": {"workLife": string, "social": string, "travel": string, "fitness": string},
  "lookingFor": string,                 // the kind of partner that would actually fit them, 1-2 sentences
  "dealbreakers": [string],             // 2-4, grounded
  "greenFlags": [string],               // 3-5 things that would make their agent excited about someone
  "conversationHooks": [string],        // 4-6 concrete topics their agent should bring up on a date
  "agentPersona": string,               // 5-8 sentences, FIRST PERSON ("I ..."): voice, tone, sense of humour, what I care about, how I talk on a date, what I'm hoping to find. The dating agent will speak exactly like this.
  "confidence": {"linkedin": number, "instagram": number}, // 0-1 how much each source actually told you
  "sourceHighlights": {"linkedin": [string], "instagram": [string]} // 3-6 crisp facts pulled from each
}`;

export async function readPerson(person: Person, linkedin: SourceCapture, instagram: SourceCapture): Promise<PersonAnalysis> {
  const li = linkedin.digest || `(LinkedIn could not be read: ${linkedin.error ?? "unknown"})`;
  const ig = instagram.digest || `(Instagram could not be read: ${instagram.error ?? "unknown"})`;
  const user = `Display name hint: ${person.displayName}
LinkedIn URL: ${person.linkedinUrl}
Instagram URL: ${person.instagramUrl}

===== SOURCE 1 · LINKEDIN (read via ${linkedin.method}) =====
${li.slice(0, 14000)}

===== SOURCE 2 · INSTAGRAM (read via ${instagram.method}) =====
${ig.slice(0, 14000)}

Analyse this person and return the JSON.`;

  const raw = await chatJson<Partial<PersonAnalysis>>({
    purpose: "reader",
    system: READER_SYSTEM,
    messages: [{ role: "user", content: user }],
    maxTokens: 3500,
    temperature: 0.5,
    model: readerModel(),
  });
  return normalise(raw, person);
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v.trim() : fallback);
const strs = (v: unknown, max = 8): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : typeof x === "object" && x ? str((x as { label?: string }).label) : "")).filter(Boolean).slice(0, max) : [];
const evid = (v: unknown, max = 6) =>
  Array.isArray(v)
    ? v
        .map((x) =>
          typeof x === "string"
            ? { label: x, evidence: "" }
            : x && typeof x === "object"
              ? { label: str((x as { label?: string }).label), evidence: str((x as { evidence?: string }).evidence) }
              : null,
        )
        .filter((x): x is { label: string; evidence: string } => Boolean(x && x.label))
        .slice(0, max)
    : [];
const num01 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5);

function normalise(a: Partial<PersonAnalysis>, person: Person): PersonAnalysis {
  const pers = (a.personality ?? {}) as Partial<PersonAnalysis["personality"]>;
  const life = (a.lifestyle ?? {}) as Partial<PersonAnalysis["lifestyle"]>;
  const conf = (a.confidence ?? {}) as Partial<PersonAnalysis["confidence"]>;
  const hl = (a.sourceHighlights ?? {}) as Partial<PersonAnalysis["sourceHighlights"]>;
  const name = str(a.name) || person.displayName;
  return {
    name,
    headline: str(a.headline),
    location: str(a.location),
    summary: str(a.summary),
    reading: str(a.reading),
    needs: evid(a.needs),
    hobbies: evid(a.hobbies),
    interests: evid(a.interests),
    values: strs(a.values),
    personality: {
      traits: strs(pers.traits),
      communicationStyle: str(pers.communicationStyle),
      energy: str(pers.energy),
      humor: str(pers.humor),
    },
    lifestyle: {
      workLife: str(life.workLife),
      social: str(life.social),
      travel: str(life.travel),
      fitness: str(life.fitness),
    },
    lookingFor: str(a.lookingFor),
    dealbreakers: strs(a.dealbreakers),
    greenFlags: strs(a.greenFlags),
    conversationHooks: strs(a.conversationHooks),
    agentPersona: str(a.agentPersona) || `I am ${name}. I'm warm, curious and direct on a date.`,
    confidence: { linkedin: num01(conf.linkedin), instagram: num01(conf.instagram) },
    sourceHighlights: { linkedin: strs(hl.linkedin), instagram: strs(hl.instagram) },
  };
}
