import { bad, json } from "@/lib/api";
import { analyzePerson } from "@/lib/pipeline";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Scrape both sources and run the reader agent for one person (awaits; ~20-90s). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const existing = await getStore().getPerson(params.id);
  if (!existing) return bad("Person not found", 404);
  if (existing.status === "scraping" || existing.status === "analyzing") return json({ person: existing, note: "already in progress" });
  const person = await analyzePerson(params.id);
  return json({ person }, person.status === "error" ? 502 : 200);
}
