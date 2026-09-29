/**
 * Minimal Apify client: run an actor synchronously and get its dataset items.
 * https://docs.apify.com/api/v2#/reference/actors/run-actor-synchronously-and-get-dataset-items
 */
export async function runApifyActor<T = unknown>(actorId: string, input: unknown, timeoutSec = 150): Promise<T[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) throw new Error("APIFY_TOKEN not set");
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutSec}&clean=true`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), (timeoutSec + 20) * 1000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Apify ${actorId} → HTTP ${res.status}: ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error(`Apify ${actorId} returned non-array`);
    return data as T[];
  } finally {
    clearTimeout(timer);
  }
}

export function apifyConfigured() {
  return Boolean(process.env.APIFY_TOKEN?.trim());
}

/** Compact any object into a readable text digest for the reader agent (caps size). */
export function toDigest(obj: unknown, maxChars = 12000): string {
  const seen = new WeakSet();
  const lines: string[] = [];
  const walk = (v: unknown, keyPath: string, depth: number) => {
    if (lines.join("\n").length > maxChars) return;
    if (v === null || v === undefined || v === "" || depth > 5) return;
    if (typeof v === "object") {
      if (seen.has(v as object)) return;
      seen.add(v as object);
      if (Array.isArray(v)) {
        v.slice(0, 25).forEach((item, i) => walk(item, `${keyPath}[${i}]`, depth + 1));
      } else {
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          if (/url$|^id$|Id$|thumbnail|image|profilePic|displayUrl|shortcode|timestamp$|Src$/i.test(k) && k !== "externalUrl") continue;
          walk(val, keyPath ? `${keyPath}.${k}` : k, depth + 1);
        }
      }
      return;
    }
    const s = String(v).replace(/\s+/g, " ").trim();
    if (!s) return;
    lines.push(`${keyPath}: ${s.slice(0, 600)}`);
  };
  walk(obj, "", 0);
  return lines.join("\n").slice(0, maxChars);
}
