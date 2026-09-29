import { chat, chatJson, dateModel } from "../llm";
import type { DateMessage, DateRecord, Debrief, Person, PersonAnalysis } from "../types";

export const dateRounds = () => Math.max(1, Math.min(6, Number(process.env.DATE_ROUNDS || 3)));

function firstName(name: string) {
  return name.split(/\s+/)[0] || name;
}

function personaBrief(p: Person): string {
  const a = p.analysis as PersonAnalysis;
  return [
    a.agentPersona,
    "",
    `What I care about: ${a.values.join(", ") || "—"}.`,
    `What I need from a partner: ${a.needs.map((n) => n.label).join("; ") || "—"}.`,
    `Things I love: ${[...a.hobbies, ...a.interests].map((h) => h.label).slice(0, 8).join(", ") || "—"}.`,
    `My life right now: ${[a.lifestyle.workLife, a.lifestyle.social, a.lifestyle.travel, a.lifestyle.fitness].filter(Boolean).join(" ")}`,
    `I'm looking for: ${a.lookingFor}`,
    `Dealbreakers: ${a.dealbreakers.join("; ") || "—"}.`,
    `Green flags: ${a.greenFlags.join("; ") || "—"}.`,
    `Good things to bring up: ${a.conversationHooks.join("; ") || "—"}.`,
  ].join("\n");
}

function turnSystem(me: Person, them: Person, scene: string, roundsLeft: number, isLast: boolean): string {
  const meA = me.analysis!;
  const themA = them.analysis!;
  return `You are the dating agent for ${meA.name}. You are on a first date, speaking AS ${firstName(meA.name)}, in the first person, exactly in their voice.

=== WHO YOU ARE ===
${personaBrief(me)}

=== THE SETTING ===
${scene}

=== WHO YOU ARE MEETING ===
${themA.name} — ${themA.headline}${themA.location ? ` (${themA.location})` : ""}. You know nothing else about them yet except what they say on the date. Discover them through conversation.

=== HOW TO BEHAVE ===
- Talk like a real person on a real date: 2-5 sentences, natural, specific, no lists, no emojis, no stage directions in brackets.
- React to what they actually said. Ask one real question when it feels natural. Share something true about yourself from your brief.
- Be honest to your persona: if something they say clashes with a need or dealbreaker, let that show gently. If something delights you, show it.
- Stay respectful and non-sexual. No compliments about looks.
- Never mention being an AI or an agent. Never break character.
${isLast ? "- This is your final line of the date: wrap up warmly and honestly, in character (suggest a next step only if you actually want one)." : `- The date has about ${roundsLeft} more exchanges left.`}`;
}

function transcriptAsMessages(messages: DateMessage[], meId: string): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    const role = m.speakerId === meId ? "assistant" : "user";
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += "\n" + m.text;
    else out.push({ role, content: m.text });
  }
  if (out.length === 0 || out[out.length - 1].role === "assistant") {
    out.push({ role: "user", content: out.length === 0 ? "[The date begins. You arrive first and speak first.]" : "[Your turn.]" });
  }
  return out;
}

export async function setScene(a: Person, b: Person): Promise<string> {
  const aa = a.analysis!;
  const ba = b.analysis!;
  const text = await chat({
    purpose: "scene",
    system:
      "You are a thoughtful matchmaker planning a first date for two specific people. Reply with ONE vivid sentence (max 40 words) describing where and how they meet, chosen from real overlaps in their lives (a shared hobby, city, taste, or pace). No names, no quotes, no emojis.",
    messages: [
      {
        role: "user",
        content: `Person 1: ${aa.headline}. Location: ${aa.location || "unknown"}. Hobbies: ${aa.hobbies.map((h) => h.label).join(", ")}. Interests: ${aa.interests.map((h) => h.label).join(", ")}. Lifestyle: ${aa.lifestyle.social} ${aa.lifestyle.travel}
Person 2: ${ba.headline}. Location: ${ba.location || "unknown"}. Hobbies: ${ba.hobbies.map((h) => h.label).join(", ")}. Interests: ${ba.interests.map((h) => h.label).join(", ")}. Lifestyle: ${ba.lifestyle.social} ${ba.lifestyle.travel}
Plan the date.`,
      },
    ],
    maxTokens: 120,
    temperature: 0.9,
  });
  return text.replace(/^["'“]+|["'”]+$/g, "").trim();
}

const DEBRIEF_SYSTEM = `You are a dating agent debriefing after a first date, speaking for the person you represent. Be honest, specific and fair — you are protecting your person's happiness, not being polite. Judge fit against THEIR needs, values, lifestyle and dealbreakers, using only what actually happened on the date.

Output ONLY JSON:
{
  "compatibility": number 1-10,   // long-term fit for your person (needs, values, lifestyle)
  "chemistry": number 1-10,       // how the conversation actually felt
  "liked": [string],              // 2-4 specific things, grounded in the transcript
  "concerns": [string],           // 0-3 specific concerns (empty if none)
  "seeAgain": "yes" | "maybe" | "no",
  "verdict": string               // one honest sentence in your person's voice
}`;

export async function debrief(me: Person, them: Person, date: DateRecord): Promise<Debrief> {
  const transcript = date.messages.map((m) => `${firstName(m.speakerName)}: ${m.text}`).join("\n\n");
  const raw = await chatJson<Partial<Debrief>>({
    purpose: "debrief",
    system: DEBRIEF_SYSTEM,
    messages: [
      {
        role: "user",
        content: `You represent ${me.analysis!.name}.

=== YOUR PERSON ===
${personaBrief(me)}

=== THE DATE with ${them.analysis!.name} ===
Setting: ${date.scene}

${transcript}

Debrief now.`,
      },
    ],
    maxTokens: 600,
    temperature: 0.3,
  });
  const clamp = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : 5);
  const see = raw.seeAgain === "yes" || raw.seeAgain === "no" ? raw.seeAgain : "maybe";
  return {
    compatibility: clamp(raw.compatibility),
    chemistry: clamp(raw.chemistry),
    liked: Array.isArray(raw.liked) ? raw.liked.filter((x): x is string => typeof x === "string").slice(0, 4) : [],
    concerns: Array.isArray(raw.concerns) ? raw.concerns.filter((x): x is string => typeof x === "string").slice(0, 3) : [],
    seeAgain: see,
    verdict: typeof raw.verdict === "string" ? raw.verdict.trim() : "",
  };
}

/**
 * Run one full date. `save` is called after every message so a live UI can watch the date unfold.
 */
export async function runDate(date: DateRecord, a: Person, b: Person, save: (d: DateRecord) => Promise<void>): Promise<DateRecord> {
  if (!a.analysis || !b.analysis) throw new Error("Both people must be analysed before they can date");
  const now = () => new Date().toISOString();
  date.status = "running";
  date.startedAt = date.startedAt ?? now();
  date.model = dateModel();
  date.messages = [];
  date.debriefs = undefined;
  date.error = undefined;
  date.scene = await setScene(a, b);
  date.updatedAt = now();
  await save(date);

  const totalTurns = dateRounds() * 2;
  for (let t = 0; t < totalTurns; t++) {
    const me = t % 2 === 0 ? a : b;
    const them = t % 2 === 0 ? b : a;
    const roundsLeft = Math.ceil((totalTurns - t - 1) / 2);
    const isLast = t === totalTurns - 1;
    const text = await chat({
      purpose: "turn",
      system: turnSystem(me, them, date.scene!, roundsLeft, isLast),
      messages: transcriptAsMessages(date.messages, me.id),
      maxTokens: 260,
      temperature: 0.9,
    });
    date.messages.push({ speakerId: me.id, speakerName: me.analysis!.name, text: text.trim(), at: now() });
    date.updatedAt = now();
    await save(date);
  }

  const [da, db] = await Promise.all([debrief(a, b, date), debrief(b, a, date)]);
  date.debriefs = { [a.id]: da, [b.id]: db };
  date.status = "done";
  date.finishedAt = now();
  date.updatedAt = now();
  await save(date);
  return date;
}
