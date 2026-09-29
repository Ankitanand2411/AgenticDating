import { bad, json, newId, slimPerson } from "@/lib/api";
import { getStore } from "@/lib/store";
import type { Person } from "@/lib/types";
import { parseBulk, parsePair, type ParsedLinks } from "@/lib/urls";

export const dynamic = "force-dynamic";

const MAX_PEOPLE = Number(process.env.MAX_PEOPLE || 60);

export async function GET() {
  const people = await getStore().getPeople();
  people.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return json({ people: people.map(slimPerson) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { linkedinUrl?: string; instagramUrl?: string; bulk?: string };
  const store = getStore();
  const existing = await store.getPeople();

  let pairs: ParsedLinks[] = [];
  const errors: string[] = [];
  if (body.bulk) {
    const r = parseBulk(body.bulk);
    pairs = r.pairs;
    errors.push(...r.errors);
  } else {
    const r = parsePair(body.linkedinUrl ?? "", body.instagramUrl ?? "");
    if ("error" in r) return bad(r.error);
    pairs = [r];
  }
  if (pairs.length === 0) return bad(errors[0] ?? "Nothing to add");

  const created: Person[] = [];
  const skipped: string[] = [];
  const now = new Date().toISOString();
  for (const p of pairs) {
    if (existing.length + created.length >= MAX_PEOPLE) {
      skipped.push(`${p.displayName}: the site is capped at ${MAX_PEOPLE} people`);
      continue;
    }
    const dupe = [...existing, ...created].find(
      (e) => e.linkedinSlug.toLowerCase() === p.linkedinSlug.toLowerCase() || e.instagramHandle.toLowerCase() === p.instagramHandle.toLowerCase(),
    );
    if (dupe) {
      skipped.push(`${p.displayName}: already added (${dupe.displayName})`);
      continue;
    }
    const person: Person = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      linkedinUrl: p.linkedinUrl,
      linkedinSlug: p.linkedinSlug,
      instagramUrl: p.instagramUrl,
      instagramHandle: p.instagramHandle,
      displayName: p.displayName,
      status: "pending",
    };
    await store.putPerson(person);
    created.push(person);
  }
  return json({ created: created.map(slimPerson), skipped, errors }, created.length ? 201 : 200);
}
