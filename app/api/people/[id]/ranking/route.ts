import { bad, json } from "@/lib/api";
import { rankFor } from "@/lib/rankings";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const store = getStore();
  const person = await store.getPerson(params.id);
  if (!person) return bad("Person not found", 404);
  const [people, dates] = await Promise.all([store.getPeople(), store.getDates()]);
  return json({ ranking: rankFor(person, people, dates) });
}
