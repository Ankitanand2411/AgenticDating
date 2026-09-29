import { bad, json } from "@/lib/api";
import { analyzePending, ensurePairs, pipelineStatus, runPendingDates, startBackgroundRun } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return json(await pipelineStatus());
}

/**
 * Body: { step: "analyze" | "pair" | "dates" | "all", limit?: number, background?: boolean, retryErrors?: boolean }
 * - background=true → one fire-and-forget full run (long-lived servers). Poll GET for progress.
 * - otherwise       → does a bounded chunk of work and returns; the UI loops until nothing remains.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { step?: string; limit?: number; background?: boolean; retryErrors?: boolean };
  const step = body.step ?? "all";
  if (body.background) {
    const started = startBackgroundRun({ retryErrors: body.retryErrors });
    return json({ background: started ? "started" : "already running", status: await pipelineStatus() });
  }
  const limit = Math.max(1, Math.min(30, body.limit ?? 6));
  if (step === "analyze") {
    const r = await analyzePending(limit);
    return json({ step, ...r, status: await pipelineStatus() });
  }
  if (step === "pair") {
    const created = await ensurePairs();
    return json({ step, created, status: await pipelineStatus() });
  }
  if (step === "dates") {
    await ensurePairs();
    const r = await runPendingDates(limit, undefined, body.retryErrors);
    return json({ step, ...r, status: await pipelineStatus() });
  }
  if (step === "all") {
    const a = await analyzePending(limit);
    if (a.remaining > 0) return json({ step: "analyze", ...a, status: await pipelineStatus() });
    await ensurePairs();
    const d = await runPendingDates(limit, undefined, body.retryErrors);
    return json({ step: "dates", ...d, status: await pipelineStatus() });
  }
  return bad("Unknown step");
}
