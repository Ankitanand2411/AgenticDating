import Anthropic from "@anthropic-ai/sdk";

export type Purpose = "reader" | "scene" | "turn" | "debrief" | "research";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  purpose: Purpose;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

// Read lazily so scripts that load .env after import still pick the values up.
export const isMock = () => process.env.MOCK_MODE === "1";
export const readerModel = () => process.env.READER_MODEL || "claude-sonnet-5-5";
export const dateModel = () => process.env.DATE_MODEL || "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;
function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env (or set MOCK_MODE=1 to try the app without keys).");
    client = new Anthropic({ apiKey, maxRetries: 3 });
  }
  return client;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Plain chat completion → text. Retries on transient failures. */
export async function chat(opts: ChatOptions): Promise<string> {
  if (isMock()) return mockChat(opts);
  const model = opts.model ?? (opts.purpose === "reader" ? readerModel() : dateModel());
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await getClient().messages.create({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.8,
        system: opts.system,
        messages: opts.messages,
      });
      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    } catch (e) {
      lastErr = e;
      const status = (e as { status?: number })?.status;
      if (status && status < 500 && status !== 429 && status !== 408) throw e;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastErr;
}

/** Chat and parse the first JSON object out of the reply. */
export async function chatJson<T>(opts: ChatOptions): Promise<T> {
  const text = await chat({ ...opts, temperature: opts.temperature ?? 0.4 });
  const parsed = extractJson<T>(text);
  if (parsed) return parsed;
  // One repair attempt: ask the model to fix its own output into strict JSON.
  const repaired = await chat({
    ...opts,
    purpose: opts.purpose,
    temperature: 0,
    messages: [
      ...opts.messages,
      { role: "assistant", content: text },
      { role: "user", content: "That was not valid JSON. Reply with ONLY the corrected JSON object, no prose, no code fences." },
    ],
  });
  const again = extractJson<T>(repaired);
  if (!again) throw new Error("Model did not return valid JSON");
  return again;
}

export function extractJson<T>(text: string): T | null {
  if (!text) return null;
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = stripped.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Try trimming trailing commas, a common failure.
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1")) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Last-resort "scraper": the model uses Anthropic's server-side web search restricted to one domain
 * and reports only what is on the given profile page. Keeps the two-sources rule intact.
 */
export async function researchProfile(url: string, domain: "linkedin.com" | "instagram.com"): Promise<string> {
  if (isMock()) return `Mock research of ${url}: a public ${domain} profile.`;
  const res = await getClient().messages.create({
    model: readerModel(),
    max_tokens: 1500,
    temperature: 0.2,
    // Server tool; typed loosely so SDK minor versions don't break the build.
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 4,
        allowed_domains: [domain],
      } as unknown as Anthropic.Tool,
    ],
    messages: [
      {
        role: "user",
        content: `Read the public profile at ${url} using web search (results are restricted to ${domain}).
Report ONLY facts visible on that exact profile: name, bio/headline, about/summary, location, work and education (LinkedIn) or bio, follower/post counts, link in bio, and what their recent posts are about (Instagram).
Write it as a plain factual digest in bullet points. If you cannot find the profile, say exactly: PROFILE_NOT_FOUND. Do not speculate and do not include information from other sites or people.`,
      },
    ],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text || /PROFILE_NOT_FOUND/.test(text)) throw new Error("Web research could not find the profile");
  return text;
}

// ─── Mock mode (lets the whole pipeline run without any API keys) ────────────

function mockChat(opts: ChatOptions): string {
  const seed = opts.messages.map((m) => m.content).join("").length;
  switch (opts.purpose) {
    case "reader": {
      const nameMatch = opts.messages[0]?.content.match(/Display name hint:\s*(.+)/);
      const name = nameMatch?.[1]?.trim() || "Sample Person";
      return JSON.stringify({
        name,
        headline: "Product designer who runs before sunrise",
        location: "Bengaluru, India",
        summary: `${name} builds thoughtful software by day and photographs street food by night. Warm, curious, and allergic to small talk.`,
        reading:
          "LinkedIn shows a steady arc from engineering into product design with a bias for early-stage teams. Instagram is mostly morning runs, filter coffee, and long captions about books — a reflective person who still likes being outside.",
        needs: [
          { label: "A partner who is curious about ideas", evidence: "Long-form captions about books and design essays" },
          { label: "Time outdoors together", evidence: "Weekly run photos and trail posts" },
          { label: "Emotional steadiness", evidence: "Several posts about slow mornings and routine" },
        ],
        hobbies: [
          { label: "Running", evidence: "Posts tagged #sunriserun" },
          { label: "Street food photography", evidence: "Recurring food photos with location tags" },
        ],
        interests: [
          { label: "Design systems", evidence: "LinkedIn headline and talks" },
          { label: "Indian literature", evidence: "Book posts on Instagram" },
        ],
        values: ["Craft", "Honesty", "Curiosity"],
        personality: { traits: ["warm", "reflective", "driven"], communicationStyle: "thoughtful, asks follow-ups", energy: "ambivert", humor: "dry and observational" },
        lifestyle: { workLife: "startup hours but protective of mornings", social: "small circles over big parties", travel: "slow travel, one city at a time", fitness: "runs 4x a week" },
        lookingFor: "Someone grounded and curious who enjoys quiet mornings and ambitious conversations.",
        dealbreakers: ["Cynicism about work", "Flakiness"],
        greenFlags: ["Reads", "Has a routine they love", "Is kind to waiters"],
        conversationHooks: ["Best street food in the city", "The last book that changed their mind", "Morning routines"],
        agentPersona: `I am ${name}. I speak warmly and directly, ask real questions, and get excited about ideas and food. I'm not into small talk; I'd rather hear what someone actually cares about.`,
        confidence: { linkedin: 0.8, instagram: 0.7 },
        sourceHighlights: { linkedin: ["Product designer, 6 yrs", "Ex-engineer"], instagram: ["Runner", "Food photos", "Book captions"] },
      });
    }
    case "scene":
      return "A Sunday morning: a 5k loop around the lake, then filter coffee at a tiny stand where the owner knows everyone by name.";
    case "turn": {
      const lines = [
        "Okay, I have to ask: what's the last thing you read that actually changed your mind about something?",
        "Ha, that's exactly the kind of answer I was hoping for. I run most mornings mostly so I can think — do you have a version of that?",
        "I love that. Honestly the thing I care most about is whether someone is curious. You seem curious.",
        "Fair warning: I will drag you to at least one street food stall you've never heard of. Is that a dealbreaker?",
        "I think we'd get along. Also I'm slightly competitive about coffee, so consider yourself warned.",
        "This was nicer than I expected. Same time next week, minus the 5k?",
      ];
      return lines[seed % lines.length];
    }
    case "debrief": {
      const score = 5 + (seed % 5);
      return JSON.stringify({
        compatibility: score,
        chemistry: Math.max(3, Math.min(10, score + ((seed >> 3) % 3) - 1)),
        liked: ["Asked real questions", "Shared love of mornings outdoors"],
        concerns: score < 7 ? ["Different pace of life"] : [],
        seeAgain: score >= 8 ? "yes" : score >= 6 ? "maybe" : "no",
        verdict: score >= 8 ? "Easy, warm, and we didn't run out of things to say." : score >= 6 ? "Pleasant, some spark, worth one more coffee." : "Kind person, but we want different things.",
      });
    }
    default:
      return "";
  }
}
