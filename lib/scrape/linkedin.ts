import type { SourceCapture } from "../types";
import { isMock, researchProfile } from "../llm";
import { apifyConfigured, runApifyActor, toDigest } from "./apify";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

// ── 1. Public HTML JSON-LD (LinkedIn renders it for logged-out crawlers some of the time) ─

async function viaJsonLd(url: string): Promise<SourceCapture> {
  const res = await fetchWithTimeout(url, {
    headers: { "user-agent": UA, accept: "text/html", "accept-language": "en-US,en;q=0.9" },
  });
  if (!res.ok) throw new Error(`linkedin html HTTP ${res.status}`);
  const html = await res.text();
  if (/authwall|sign in to view|join linkedin/i.test(html) && !/application\/ld\+json/.test(html)) {
    throw new Error("linkedin html: auth wall");
  }
  const blocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  let person: Record<string, unknown> | null = null;
  for (const b of blocks) {
    try {
      const j = JSON.parse(b);
      const graph: unknown[] = Array.isArray(j?.["@graph"]) ? j["@graph"] : [j];
      const p = graph.find((g) => (g as { "@type"?: string })?.["@type"] === "Person") as Record<string, unknown> | undefined;
      if (p) {
        person = p;
        break;
      }
    } catch {
      /* ignore */
    }
  }
  if (!person) throw new Error("linkedin html: no Person JSON-LD");
  const fields = {
    name: String(person.name ?? ""),
    headline: String(person.jobTitle ?? (Array.isArray(person.jobTitle) ? (person.jobTitle as string[]).join(", ") : "")),
    location: String((person.address as { addressLocality?: string })?.addressLocality ?? ""),
    about: String(person.description ?? "").slice(0, 2000),
  };
  return { method: "linkedin_jsonld", fetchedAt: new Date().toISOString(), digest: `LinkedIn ${url}\n` + toDigest(person), fields };
}

// ── 2. Apify LinkedIn profile scraper ────────────────────────────────────────

async function viaApify(url: string): Promise<SourceCapture> {
  const actor = process.env.APIFY_LINKEDIN_ACTOR || "dev_fusion~linkedin-profile-scraper";
  const key = process.env.APIFY_LINKEDIN_INPUT_KEY || "profileUrls";
  const items = await runApifyActor<Record<string, unknown>>(actor, { [key]: [url] });
  const item = items[0];
  if (!item) throw new Error("Apify returned no LinkedIn profile");
  if (item.error) throw new Error(`Apify LinkedIn: ${String(item.error)}`);
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = item[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const fields = {
    name: pick("fullName", "name") || [pick("firstName"), pick("lastName")].filter(Boolean).join(" "),
    headline: pick("headline", "title", "occupation"),
    location: pick("addressWithCountry", "location", "geoLocationName", "addressWithoutCountry"),
    about: pick("about", "summary", "description").slice(0, 2000),
  };
  return { method: "apify", fetchedAt: new Date().toISOString(), digest: `LinkedIn ${url}\n` + toDigest(item), fields };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export async function scrapeLinkedin(url: string, slug: string): Promise<SourceCapture> {
  if (isMock()) {
    return {
      method: "mock",
      fetchedAt: new Date().toISOString(),
      digest: `LinkedIn ${url}\nHeadline: Product Designer at a seed-stage startup · ex-software engineer\nAbout: I like building small, careful things with small, careful teams. Previously shipped payments at a fintech.\nExperience: Product Designer (2023–now); Software Engineer (2019–2023)\nEducation: B.Tech Computer Science\nSkills: Design systems, Figma, React, User research`,
      fields: { name: "", headline: "Product Designer · ex-engineer", location: "Bengaluru, India", about: "I like building small, careful things with small, careful teams." },
    };
  }
  const attempts: (() => Promise<SourceCapture>)[] = [];
  if (apifyConfigured()) attempts.push(() => viaApify(url));
  attempts.push(() => viaJsonLd(url));
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const cap = await attempt();
      if (cap.digest.length > 60) return cap;
      errors.push(`${cap.method}: empty`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (process.env.ENABLE_WEB_RESEARCH_FALLBACK !== "0") {
    try {
      const digest = await researchProfile(url, "linkedin.com");
      return { method: "web_research", fetchedAt: new Date().toISOString(), digest, fields: { slug } };
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { method: "failed", fetchedAt: new Date().toISOString(), digest: "", fields: { slug }, error: errors.join(" | ") };
}
