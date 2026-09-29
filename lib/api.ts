import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function bad(message: string, status = 400) {
  return json({ error: message }, status);
}

export function isAdmin(req: Request) {
  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) return true; // no token configured → open (fine for a demo)
  const url = new URL(req.url);
  const given = url.searchParams.get("token") || req.headers.get("x-admin-token") || "";
  return given === token;
}

export function newId() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/** Strip raw source digests from a person for list endpoints (keeps payloads small). */
export function slimPerson<T extends { sources?: unknown }>(p: T): Omit<T, "sources"> {
  const { sources: _s, ...rest } = p;
  return rest;
}
