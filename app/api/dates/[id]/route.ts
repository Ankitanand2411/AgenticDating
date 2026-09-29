import { bad, json } from "@/lib/api";
import { runOneDate } from "@/lib/pipeline";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const store = getStore();
  const date = await store.getDate(params.id);
  if (!date) return bad("Date not found", 404);
  const [a, b] = await Promise.all([store.getPerson(date.personAId), store.getPerson(date.personBId)]);
  const slim = (p: typeof a) => (p ? { id: p.id, name: p.analysis?.name ?? p.displayName, headline: p.analysis?.headline ?? "", location: p.analysis?.location ?? "" } : null);
  return json({ date, a: slim(a), b: slim(b) });
}

/** Re-run this one date from scratch. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const date = await getStore().getDate(params.id);
  if (!date) return bad("Date not found", 404);
  if (date.status === "running") return bad("This date is already running", 409);
  const out = await runOneDate(params.id);
  return json({ date: out });
}
