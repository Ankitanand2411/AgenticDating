import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Download the whole database (people, sources, dates). Commit it as data/snapshot.json to ship the demo. */
export async function GET() {
  const db = await getStore().exportAll();
  return new Response(JSON.stringify(db, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": "attachment; filename=snapshot.json", "cache-control": "no-store" },
  });
}
