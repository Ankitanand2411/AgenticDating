import { bad, isAdmin, json } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const person = await getStore().getPerson(params.id);
  if (!person) return bad("Person not found", 404);
  return json({ person });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) return bad("Admin token required", 401);
  await getStore().deletePerson(params.id);
  return json({ ok: true });
}
