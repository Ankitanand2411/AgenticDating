import { json } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** ?status=running|done|pending|error  ?personId=  ?limit=  */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const personId = url.searchParams.get("personId");
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 60)));
  const store = getStore();
  const [dates, people] = await Promise.all([store.getDates(), store.getPeople()]);
  const names = Object.fromEntries(people.map((p) => [p.id, { name: p.analysis?.name ?? p.displayName, headline: p.analysis?.headline ?? "" }]));
  const list = dates
    .filter((d) => (status ? d.status === status : true))
    .filter((d) => (personId ? d.personAId === personId || d.personBId === personId : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map((d) => ({
      ...d,
      a: names[d.personAId] ?? { name: "?", headline: "" },
      b: names[d.personBId] ?? { name: "?", headline: "" },
      // Keep list payloads light: only the last two messages unless the date is running.
      messages: d.status === "running" ? d.messages : d.messages.slice(-2),
      messageCount: d.messages.length,
    }));
  return json({ dates: list, total: dates.length });
}
