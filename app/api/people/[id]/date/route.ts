import { bad, json } from "@/lib/api";
import { ensurePairs, runPendingDates, startBackgroundRun } from "@/lib/pipeline";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Make this person date everyone. Body: { limit?: number, background?: boolean, retryErrors?: boolean }
 * - background: true  → fire-and-forget on a long-lived server; poll GET /api/run for progress.
 * - otherwise        → runs up to `limit` dates now and returns { remaining }; call again until 0.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const person = await getStore().getPerson(params.id);
  if (!person) return bad("Person not found", 404);
  if (person.status !== "ready") return bad("Analyse this person first", 409);
  const body = (await req.json().catch(() => ({}))) as { limit?: number; background?: boolean; retryErrors?: boolean };
  const created = await ensurePairs(person.id);
  if (body.background) {
    const started = startBackgroundRun({ onlyForPersonId: person.id, retryErrors: body.retryErrors });
    return json({ created, background: started ? "started" : "already running" });
  }
  const r = await runPendingDates(Math.max(1, Math.min(20, body.limit ?? 6)), person.id, body.retryErrors);
  return json({ created, ...r });
}
