import { bad, isAdmin, json } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Danger: wipes everything. Requires ADMIN_TOKEN if one is configured. */
export async function POST(req: Request) {
  if (!isAdmin(req)) return bad("Admin token required", 401);
  await getStore().reset();
  return json({ ok: true });
}
