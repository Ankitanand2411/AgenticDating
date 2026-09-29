import { json } from "@/lib/api";
import { rankAll } from "@/lib/rankings";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  const [people, dates] = await Promise.all([store.getPeople(), store.getDates()]);
  return json(rankAll(people, dates));
}
