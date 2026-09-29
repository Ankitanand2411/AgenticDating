import { runDate } from "./agents/dating";
import { readPerson } from "./agents/reader";
import { readerModel } from "./llm";
import { scrapeInstagram } from "./scrape/instagram";
import { scrapeLinkedin } from "./scrape/linkedin";
import { getStore, pairKey } from "./store";
import type { DateRecord, Person, PipelineStatus } from "./types";

export const maxConcurrency = () => Math.max(1, Math.min(16, Number(process.env.MAX_CONCURRENCY || 6)));

export async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ─── People ──────────────────────────────────────────────────────────────────

/** Scrape both sources and run the reader agent. Safe to re-run (retries an errored person). */
export async function analyzePerson(id: string): Promise<Person> {
  const store = getStore();
  const person = await store.getPerson(id);
  if (!person) throw new Error("Person not found");
  const now = () => new Date().toISOString();
  try {
    person.status = "scraping";
    person.error = undefined;
    person.updatedAt = now();
    await store.putPerson(person);

    const [linkedin, instagram] = await Promise.all([
      scrapeLinkedin(person.linkedinUrl, person.linkedinSlug),
      scrapeInstagram(person.instagramHandle, person.instagramUrl),
    ]);
    person.sources = { linkedin, instagram };
    if (linkedin.method === "failed" && instagram.method === "failed") {
      throw new Error(`Could not read either source. LinkedIn: ${linkedin.error}. Instagram: ${instagram.error}`);
    }
    if (instagram.error && /private/i.test(instagram.error)) throw new Error(instagram.error);

    person.status = "analyzing";
    person.updatedAt = now();
    await store.putPerson(person);

    const analysis = await readPerson(person, linkedin, instagram);
    person.analysis = analysis;
    person.displayName = analysis.name || person.displayName;
    person.models = { reader: readerModel() };
    person.analyzedAt = now();
    person.status = "ready";
    person.updatedAt = now();
    await store.putPerson(person);
    return person;
  } catch (e) {
    const fresh = (await store.getPerson(id)) ?? person;
    fresh.status = "error";
    fresh.error = e instanceof Error ? e.message : String(e);
    fresh.updatedAt = now();
    await store.putPerson(fresh);
    return fresh;
  }
}

export async function analyzePending(limit = 50): Promise<{ processed: number; remaining: number }> {
  const store = getStore();
  const people = await store.getPeople();
  const todo = people.filter((p) => p.status === "pending" || p.status === "error").slice(0, limit);
  await pMap(todo, (p) => analyzePerson(p.id), Math.min(maxConcurrency(), 4));
  const after = await store.getPeople();
  return { processed: todo.length, remaining: after.filter((p) => p.status === "pending").length };
}

// ─── Dates ───────────────────────────────────────────────────────────────────

/** Create a pending date record for every pair of ready people that doesn't have one yet. */
export async function ensurePairs(onlyForPersonId?: string): Promise<number> {
  const store = getStore();
  const people = (await store.getPeople()).filter((p) => p.status === "ready" && p.analysis);
  const existing = new Set((await store.getDates()).map((d) => d.id));
  let created = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i];
      const b = people[j];
      if (onlyForPersonId && a.id !== onlyForPersonId && b.id !== onlyForPersonId) continue;
      const id = pairKey(a.id, b.id);
      if (existing.has(id)) continue;
      const rec: DateRecord = {
        id,
        personAId: [a.id, b.id].sort()[0],
        personBId: [a.id, b.id].sort()[1],
        status: "pending",
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      await store.putDate(rec);
      existing.add(id);
      created++;
    }
  }
  return created;
}

export async function runOneDate(dateId: string): Promise<DateRecord> {
  const store = getStore();
  const date = await store.getDate(dateId);
  if (!date) throw new Error("Date not found");
  const [a, b] = await Promise.all([store.getPerson(date.personAId), store.getPerson(date.personBId)]);
  if (!a || !b) throw new Error("A person in this date no longer exists");
  try {
    return await runDate(date, a, b, (d) => store.putDate(d));
  } catch (e) {
    date.status = "error";
    date.error = e instanceof Error ? e.message : String(e);
    date.updatedAt = new Date().toISOString();
    await store.putDate(date);
    return date;
  }
}

/** Run up to `limit` pending dates (optionally only those involving one person). Chunk-friendly for serverless. */
export async function runPendingDates(limit: number, onlyForPersonId?: string, retryErrors = false): Promise<{ processed: number; remaining: number }> {
  const store = getStore();
  const dates = await store.getDates();
  // Dates stuck in "running" for >10 minutes are treated as dead (e.g. a killed serverless function).
  const stale = Date.now() - 10 * 60 * 1000;
  const todo = dates
    .filter((d) => (onlyForPersonId ? d.personAId === onlyForPersonId || d.personBId === onlyForPersonId : true))
    .filter((d) => d.status === "pending" || (retryErrors && d.status === "error") || (d.status === "running" && Date.parse(d.updatedAt) < stale))
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
    .slice(0, limit);
  await pMap(todo, (d) => runOneDate(d.id), maxConcurrency());
  const after = await store.getDates();
  const remaining = after.filter(
    (d) => (onlyForPersonId ? d.personAId === onlyForPersonId || d.personBId === onlyForPersonId : true) && d.status === "pending",
  ).length;
  return { processed: todo.length, remaining };
}

// ─── Status & background runner ──────────────────────────────────────────────

export async function pipelineStatus(): Promise<PipelineStatus> {
  const store = getStore();
  const [people, dates, meta] = await Promise.all([store.getPeople(), store.getDates(), store.getMeta()]);
  const count = <T extends { status: string }>(xs: T[], s: string) => xs.filter((x) => x.status === s).length;
  return {
    people: {
      total: people.length,
      ready: count(people, "ready"),
      pending: count(people, "pending"),
      working: count(people, "scraping") + count(people, "analyzing"),
      error: count(people, "error"),
    },
    dates: {
      total: dates.length,
      done: count(dates, "done"),
      pending: count(dates, "pending"),
      running: count(dates, "running"),
      error: count(dates, "error"),
    },
    background: meta.background ?? { running: false },
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __agenticDatingBackground: { running: boolean } | undefined;
}

async function setBackground(b: PipelineStatus["background"]) {
  const store = getStore();
  const meta = await store.getMeta();
  await store.putMeta({ ...meta, background: b });
}

/**
 * Fire-and-forget full run (analyse everyone, create pairs, run all dates). Ideal on a long-lived Node
 * server (VPS / Docker). On serverless hosts use chunked calls to POST /api/run instead.
 */
export function startBackgroundRun(opts: { onlyForPersonId?: string; retryErrors?: boolean } = {}): boolean {
  const g = (globalThis.__agenticDatingBackground ||= { running: false });
  if (g.running) return false;
  g.running = true;
  (async () => {
    try {
      await setBackground({ running: true, step: "analyzing people", startedAt: new Date().toISOString() });
      await analyzePending(200);
      await setBackground({ running: true, step: "pairing", startedAt: new Date().toISOString() });
      await ensurePairs(opts.onlyForPersonId);
      await setBackground({ running: true, step: "dating", startedAt: new Date().toISOString() });
      let guard = 0;
      while (guard++ < 500) {
        const r = await runPendingDates(maxConcurrency() * 2, opts.onlyForPersonId, opts.retryErrors && guard === 1);
        if (r.processed === 0) break;
      }
      await setBackground({ running: false, note: "finished " + new Date().toISOString() });
    } catch (e) {
      await setBackground({ running: false, note: "failed: " + (e instanceof Error ? e.message : String(e)) });
    } finally {
      g.running = false;
    }
  })();
  return true;
}

export function backgroundRunning() {
  return Boolean(globalThis.__agenticDatingBackground?.running);
}
