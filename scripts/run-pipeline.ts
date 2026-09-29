/**
 * Run the whole pipeline from a terminal (reads everyone, pairs, runs all dates).
 *   npx tsx scripts/run-pipeline.ts            # everything
 *   npx tsx scripts/run-pipeline.ts --retry    # also retry errored people/dates
 * Uses the same store as the web app (data/db.json or DATABASE_URL), so the site shows progress live.
 */
import { loadEnv } from "../lib/env";

async function main() {
  loadEnv();
  // Import after env is loaded so model / mock / concurrency settings are picked up.
  const { analyzePending, ensurePairs, maxConcurrency, pipelineStatus, runPendingDates } = await import("../lib/pipeline");
  const retry = process.argv.includes("--retry");
  console.log("Reading people…");
  const a = await analyzePending(500);
  const s0 = await pipelineStatus();
  console.log(`  read ${a.processed}, remaining ${a.remaining}, ready ${s0.people.ready}, errors ${s0.people.error}`);
  const created = await ensurePairs();
  console.log(`Paired: ${created} new dates`);
  let guard = 0;
  while (guard++ < 1000) {
    const r = await runPendingDates(maxConcurrency() * 2, undefined, retry && guard === 1);
    const s = await pipelineStatus();
    console.log(`  dates ${s.dates.done}/${s.dates.total} done, ${s.dates.error} errors`);
    if (r.processed === 0) break;
  }
  console.log("Done.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
