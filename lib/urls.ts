export interface ParsedLinks {
  linkedinUrl: string;
  linkedinSlug: string;
  instagramUrl: string;
  instagramHandle: string;
  displayName: string;
}

const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%.]+)\/?/i;
const INSTAGRAM_RE = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)\/?/i;
const IG_RESERVED = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "tv", "direct"]);

export function parseLinkedin(input: string): { url: string; slug: string } | null {
  const m = input.trim().match(LINKEDIN_RE);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).replace(/\/+$/, "");
  if (!slug) return null;
  return { url: `https://www.linkedin.com/in/${slug}/`, slug };
}

export function parseInstagram(input: string): { url: string; handle: string } | null {
  const raw = input.trim();
  // Accept a bare @handle too.
  const bare = raw.match(/^@?([A-Za-z0-9_.]{1,30})$/);
  let handle: string | null = null;
  if (bare && !raw.includes(".com")) handle = bare[1];
  else {
    const m = raw.match(INSTAGRAM_RE);
    if (m) handle = m[1];
  }
  if (!handle || IG_RESERVED.has(handle.toLowerCase())) return null;
  handle = handle.replace(/\.+$/, "");
  return { url: `https://www.instagram.com/${handle}/`, handle };
}

export function nameFromSlug(slug: string) {
  const cleaned = slug
    .replace(/-[0-9a-f]{6,}$/i, "") // trailing hash linkedin appends
    .replace(/-\d+$/, "")
    .replace(/[-_.]+/g, " ")
    .trim();
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function parsePair(linkedinInput: string, instagramInput: string): ParsedLinks | { error: string } {
  const li = parseLinkedin(linkedinInput);
  if (!li) return { error: "That LinkedIn link doesn't look like a profile (expected linkedin.com/in/…)" };
  const ig = parseInstagram(instagramInput);
  if (!ig) return { error: "That Instagram link doesn't look like a profile (expected instagram.com/username)" };
  return {
    linkedinUrl: li.url,
    linkedinSlug: li.slug,
    instagramUrl: ig.url,
    instagramHandle: ig.handle,
    displayName: nameFromSlug(li.slug) || ig.handle,
  };
}

/**
 * Bulk paste: one person per line, any separator. Each line must contain a linkedin.com/in/ URL and
 * an instagram.com/ URL (or @handle). Lines starting with # are ignored.
 */
export function parseBulk(text: string): { pairs: ParsedLinks[]; errors: string[] } {
  const pairs: ParsedLinks[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  for (const line of lines) {
    if (/^linkedin\s*[,;\t]/i.test(line)) continue; // csv header
    const tokens = line.split(/[\s,;\t]+/).filter(Boolean);
    const liTok = tokens.find((t) => /linkedin\.com\/in\//i.test(t));
    const igTok = tokens.find((t) => /instagram\.com\//i.test(t)) ?? tokens.find((t) => /^@[A-Za-z0-9_.]+$/.test(t));
    if (!liTok || !igTok) {
      errors.push(`Skipped "${line.slice(0, 80)}": need both a LinkedIn /in/ link and an Instagram link.`);
      continue;
    }
    const parsed = parsePair(liTok, igTok);
    if ("error" in parsed) errors.push(`Skipped "${line.slice(0, 80)}": ${parsed.error}`);
    else pairs.push(parsed);
  }
  return { pairs, errors };
}
