import type { SourceCapture } from "../types";
import { isMock, researchProfile } from "../llm";
import { apifyConfigured, runApifyActor, toDigest } from "./apify";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

// ── 1. Instagram's own web-profile JSON (works for public profiles, no login) ─

interface IgUser {
  username?: string;
  full_name?: string;
  biography?: string;
  is_private?: boolean;
  is_verified?: boolean;
  external_url?: string;
  category_name?: string;
  edge_followed_by?: { count?: number };
  edge_follow?: { count?: number };
  edge_owner_to_timeline_media?: {
    count?: number;
    edges?: { node?: { edge_media_to_caption?: { edges?: { node?: { text?: string } }[] }; edge_liked_by?: { count?: number }; taken_at_timestamp?: number; accessibility_caption?: string } }[];
  };
}

async function viaWebApi(handle: string): Promise<SourceCapture> {
  const res = await fetchWithTimeout(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`, {
    headers: {
      "user-agent": UA,
      "x-ig-app-id": "936619743392459",
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`instagram web api HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { user?: IgUser | null } };
  const u = json?.data?.user;
  if (!u || !u.username) throw new Error("instagram web api: no user in response");
  if (u.is_private) throw new Error("This Instagram profile is private. Only public profiles can be read.");
  const posts = (u.edge_owner_to_timeline_media?.edges ?? [])
    .map((e) => e.node)
    .filter(Boolean)
    .map((n) => ({
      caption: n?.edge_media_to_caption?.edges?.[0]?.node?.text ?? "",
      likes: n?.edge_liked_by?.count ?? null,
      alt: n?.accessibility_caption ?? "",
      when: n?.taken_at_timestamp ? new Date(n.taken_at_timestamp * 1000).toISOString().slice(0, 10) : null,
    }));
  const fields = {
    username: u.username,
    fullName: u.full_name ?? "",
    bio: u.biography ?? "",
    followers: u.edge_followed_by?.count ?? null,
    following: u.edge_follow?.count ?? null,
    posts: u.edge_owner_to_timeline_media?.count ?? null,
    externalUrl: u.external_url ?? "",
    category: u.category_name ?? "",
    verified: Boolean(u.is_verified),
  };
  const digest = [
    `Instagram @${u.username}`,
    `Name: ${fields.fullName}`,
    `Bio: ${fields.bio}`,
    `Category: ${fields.category}`,
    `Followers: ${fields.followers} · Following: ${fields.following} · Posts: ${fields.posts}`,
    fields.externalUrl ? `Link in bio: ${fields.externalUrl}` : "",
    "",
    "Recent posts:",
    ...posts.map((p, i) => `${i + 1}. [${p.when ?? "?"}] ${p.caption.replace(/\s+/g, " ").slice(0, 500)}${p.alt ? ` (image: ${p.alt.slice(0, 160)})` : ""}${p.likes != null ? ` — ${p.likes} likes` : ""}`),
  ]
    .filter((l) => l !== "")
    .join("\n");
  return { method: "instagram_web_api", fetchedAt: new Date().toISOString(), digest, fields };
}

// ── 2. Apify instagram-profile-scraper ───────────────────────────────────────

async function viaApify(handle: string): Promise<SourceCapture> {
  const actor = process.env.APIFY_INSTAGRAM_ACTOR || "apify~instagram-profile-scraper";
  const items = await runApifyActor<Record<string, unknown>>(actor, { usernames: [handle] });
  const item = items[0];
  if (!item) throw new Error("Apify returned no Instagram profile");
  if (item.error) throw new Error(`Apify Instagram: ${String(item.error)}`);
  if (item.private === true || item.isPrivate === true) throw new Error("This Instagram profile is private. Only public profiles can be read.");
  const fields = {
    username: String(item.username ?? handle),
    fullName: String(item.fullName ?? ""),
    bio: String(item.biography ?? ""),
    followers: (item.followersCount as number) ?? null,
    following: (item.followsCount as number) ?? null,
    posts: (item.postsCount as number) ?? null,
    externalUrl: String(item.externalUrl ?? ""),
    category: String(item.businessCategoryName ?? ""),
    verified: Boolean(item.verified),
  };
  return { method: "apify", fetchedAt: new Date().toISOString(), digest: `Instagram @${handle}\n` + toDigest(item), fields };
}

// ── 3. OG meta tags from the public HTML (bio + counts only) ─────────────────

async function viaOgTags(handle: string): Promise<SourceCapture> {
  const res = await fetchWithTimeout(`https://www.instagram.com/${handle}/`, {
    headers: { "user-agent": UA, accept: "text/html", "accept-language": "en-US,en;q=0.9" },
  });
  const html = await res.text();
  const meta = (prop: string) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, "i")) ?? html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${prop}"`, "i"));
    return m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'") : "";
  };
  const desc = meta("og:description") || meta("description");
  const title = meta("og:title");
  if (!desc && !title) throw new Error("instagram html: no og tags (login wall)");
  if (/login|log in/i.test(title) && !desc) throw new Error("instagram html: login wall");
  const counts = desc.match(/([\d,.KM]+)\s+Followers,\s+([\d,.KM]+)\s+Following,\s+([\d,.KM]+)\s+Posts/i);
  const fields = {
    username: handle,
    fullName: title.replace(/\s*\(@[^)]+\).*$/, "").replace(/•.*$/, "").trim(),
    bio: desc.replace(/^.*?Posts\s*-\s*/i, "").replace(/See Instagram photos and videos from.*$/i, "").trim(),
    followers: counts?.[1] ?? null,
    following: counts?.[2] ?? null,
    posts: counts?.[3] ?? null,
  };
  return {
    method: "instagram_og_tags",
    fetchedAt: new Date().toISOString(),
    digest: `Instagram @${handle}\nTitle: ${title}\nDescription: ${desc}`,
    fields,
  };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export async function scrapeInstagram(handle: string, url: string): Promise<SourceCapture> {
  if (isMock()) {
    return {
      method: "mock",
      fetchedAt: new Date().toISOString(),
      digest: `Instagram @${handle}\nBio: runner · filter coffee · reads too much\nRecent posts: sunrise run at the lake; street food crawl; long caption about a novel; trail weekend`,
      fields: { username: handle, fullName: "", bio: "runner · filter coffee · reads too much", followers: 1200, following: 400, posts: 87 },
    };
  }
  const attempts: (() => Promise<SourceCapture>)[] = [() => viaWebApi(handle)];
  if (apifyConfigured()) attempts.push(() => viaApify(handle));
  attempts.push(() => viaOgTags(handle));
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const cap = await attempt();
      if (cap.digest.length > 40) return cap;
      errors.push(`${cap.method}: empty`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      if (/private/i.test(msg)) throw e; // don't keep trying: the rule is public profiles only
    }
  }
  if (process.env.ENABLE_WEB_RESEARCH_FALLBACK !== "0") {
    try {
      const digest = await researchProfile(url, "instagram.com");
      return { method: "web_research", fetchedAt: new Date().toISOString(), digest, fields: { username: handle } };
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return {
    method: "failed",
    fetchedAt: new Date().toISOString(),
    digest: "",
    fields: { username: handle },
    error: errors.join(" | "),
  };
}
