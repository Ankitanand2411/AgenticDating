"use client";

import Link from "next/link";
import { useState } from "react";
import { api, timeAgo, usePoll } from "@/lib/client";
import type { EvidenceItem, Person, PersonRanking, SourceCapture } from "@/lib/types";
import { Button, Card, Chips, Empty, ErrorNote, H2, H3, Score, Spinner, Status } from "./ui";

export default function PersonView({ id }: { id: string }) {
  const p = usePoll<{ person: Person }>(`/api/people/${id}`, 2500);
  const person = p.data?.person;
  const working = !person || person.status === "pending" || person.status === "scraping" || person.status === "analyzing";
  const r = usePoll<{ ranking: PersonRanking }>(person?.status === "ready" ? `/api/people/${id}/ranking` : null, 4000);
  const ranking = r.data?.ranking;

  if (p.error) return <ErrorNote message={p.error} />;
  if (!person) return <p className="text-muted"><Spinner className="mr-2" />Loading…</p>;

  const a = person.analysis;

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            <Link href="/" className="text-muted hover:text-paper">People</Link> / profile
          </p>
          <h1 className="mt-1 font-display text-4xl tracking-tight text-paper">{a?.name ?? person.displayName}</h1>
          {a?.headline && <p className="mt-1 text-lg text-paper/80">{a.headline}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {a?.location && <span>{a.location}</span>}
            <a href={person.linkedinUrl} target="_blank" rel="noreferrer" className="hover:text-paper">LinkedIn ↗</a>
            <a href={person.instagramUrl} target="_blank" rel="noreferrer" className="hover:text-paper">Instagram @{person.instagramHandle} ↗</a>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Status status={person.status} />
          {person.analyzedAt && <span className="text-xs text-muted">read {timeAgo(person.analyzedAt)}</span>}
          <Actions person={person} onChange={() => { p.refresh(); r.refresh(); }} />
        </div>
      </section>

      {person.status === "error" && (
        <Card className="p-5">
          <H3>The agent could not read this person</H3>
          <p className="mt-2 text-sm text-red-200">{person.error}</p>
          <p className="mt-2 text-sm text-muted">Check that both links are public profiles, then try again with the button above.</p>
        </Card>
      )}

      {working && person.status !== "error" && (
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <Spinner className="text-rose" />
            <div>
              <p className="font-display text-lg">
                {person.status === "scraping" ? "Reading LinkedIn and Instagram…" : person.status === "analyzing" ? "The agent is thinking about who this person is…" : "Waiting to start…"}
              </p>
              <p className="text-sm text-muted">This page updates by itself. Usually 20–90 seconds.</p>
            </div>
          </div>
        </Card>
      )}

      {a && (
        <>
          <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <Card className="p-6">
              <H2>How the agent read {firstName(a.name)}</H2>
              <p className="mt-3 text-base leading-relaxed text-paper/90">{a.summary}</p>
              <p className="mt-4 border-l-2 border-rose/50 pl-4 text-[15px] leading-relaxed text-paper/80">{a.reading}</p>
            </Card>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <SourceCard title="From LinkedIn" capture={person.sources?.linkedin} highlights={a.sourceHighlights.linkedin} confidence={a.confidence.linkedin} />
              <SourceCard title="From Instagram" capture={person.sources?.instagram} highlights={a.sourceHighlights.instagram} confidence={a.confidence.instagram} />
            </div>
          </section>

          <section>
            <H2 className="mb-4">What the agent found</H2>
            <div className="grid gap-4 md:grid-cols-3">
              <EvidenceList title="Needs" subtitle="what a relationship has to give them" items={a.needs} tone="rose" />
              <EvidenceList title="Hobbies" subtitle="how they actually spend time" items={a.hobbies} tone="gold" />
              <EvidenceList title="Interests" subtitle="what they think and talk about" items={a.interests} tone="mint" />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Card className="p-5">
                <H3>Personality</H3>
                <div className="mt-3"><Chips items={a.personality.traits} /></div>
                <dl className="mt-4 space-y-2 text-sm">
                  <Row k="Talks like" v={a.personality.communicationStyle} />
                  <Row k="Energy" v={a.personality.energy} />
                  <Row k="Humour" v={a.personality.humor} />
                </dl>
                <H3 className="mt-5">Values</H3>
                <div className="mt-2"><Chips items={a.values} tone="gold" /></div>
              </Card>
              <Card className="p-5">
                <H3>Lifestyle</H3>
                <dl className="mt-3 space-y-2 text-sm">
                  <Row k="Work" v={a.lifestyle.workLife} />
                  <Row k="Social" v={a.lifestyle.social} />
                  <Row k="Travel" v={a.lifestyle.travel} />
                  <Row k="Fitness" v={a.lifestyle.fitness} />
                </dl>
                <H3 className="mt-5">Looking for</H3>
                <p className="mt-2 text-sm leading-relaxed text-paper/90">{a.lookingFor}</p>
              </Card>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Card className="p-5">
                <H3>Green flags</H3>
                <ul className="mt-3 space-y-1.5 text-sm text-paper/90">{a.greenFlags.map((g, i) => <li key={i}>{g}</li>)}</ul>
              </Card>
              <Card className="p-5">
                <H3>Dealbreakers</H3>
                <ul className="mt-3 space-y-1.5 text-sm text-paper/90">{a.dealbreakers.map((g, i) => <li key={i}>{g}</li>)}</ul>
              </Card>
              <Card className="p-5">
                <H3>What their agent brings up on a date</H3>
                <ul className="mt-3 space-y-1.5 text-sm text-paper/90">{a.conversationHooks.map((g, i) => <li key={i}>{g}</li>)}</ul>
              </Card>
            </div>
          </section>

          <section>
            <details className="group rounded-xl border border-line/80 bg-plum/70">
              <summary className="cursor-pointer list-none px-5 py-4 font-display text-lg text-paper">
                The agent’s persona brief <span className="ml-2 text-sm text-muted">(how it speaks as {firstName(a.name)} on dates)</span>
              </summary>
              <p className="prose-quiet whitespace-pre-line border-t border-line/60 px-5 py-4 text-[15px] leading-relaxed text-paper/85">{a.agentPersona}</p>
            </details>
          </section>

          <RankingSection person={person} ranking={ranking} />
        </>
      )}
    </div>
  );
}

function firstName(n: string) {
  return n.split(/\s+/)[0] || n;
}

function Row({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
      <dt className="text-muted">{k}</dt>
      <dd className="text-paper/90">{v}</dd>
    </div>
  );
}

function EvidenceList({ title, subtitle, items, tone }: { title: string; subtitle: string; items: EvidenceItem[]; tone: "rose" | "gold" | "mint" }) {
  const bar = { rose: "bg-rose", gold: "bg-gold", mint: "bg-mint" }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-baseline gap-2">
        <span className={`h-2 w-2 rounded-full ${bar}`} />
        <H3>{title}</H3>
      </div>
      <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
      <ul className="mt-3 space-y-3">
        {items.length === 0 && <li className="text-sm text-muted">Nothing confident enough to say.</li>}
        {items.map((it, i) => (
          <li key={i}>
            <p className="text-sm font-medium text-paper">{it.label}</p>
            {it.evidence && <p className="mt-0.5 text-xs leading-relaxed text-muted">{it.evidence}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

const methodLabel: Record<string, string> = {
  instagram_web_api: "Instagram public API",
  instagram_og_tags: "public page metadata",
  linkedin_jsonld: "public page data",
  apify: "Apify scraper",
  web_research: "web research on the profile",
  mock: "mock data",
  failed: "could not be read",
};

function SourceCard({ title, capture, highlights, confidence }: { title: string; capture?: SourceCapture; highlights: string[]; confidence: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-2">
        <H3>{title}</H3>
        <span className="text-xs text-muted">{capture ? methodLabel[capture.method] ?? capture.method : "—"}</span>
      </div>
      <div className="mt-2"><Score value={Math.round(confidence * 10)} label="how much it told the agent" tone="mint" /></div>
      <ul className="mt-3 space-y-1 text-sm text-paper/90">
        {highlights.map((h, i) => <li key={i}>{h}</li>)}
        {highlights.length === 0 && <li className="text-muted">No highlights.</li>}
      </ul>
      {capture?.error && <p className="mt-2 text-xs text-red-200">{capture.error}</p>}
      {capture?.digest && (
        <>
          <button onClick={() => setOpen((o) => !o)} className="mt-3 text-xs text-muted hover:text-paper">
            {open ? "Hide" : "Show"} exactly what the agent read
          </button>
          {open && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-ink p-3 text-[11px] leading-relaxed text-paper/70">{capture.digest}</pre>}
        </>
      )}
    </Card>
  );
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function Actions({ person, onChange }: { person: Person; onChange: () => void }) {
  const [busy, setBusy] = useState<null | "analyze" | "date">(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const analyze = async () => {
    setBusy("analyze");
    setErr(null);
    try {
      await api(`/api/people/${person.id}/analyze`, { method: "POST" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      onChange();
    }
  };

  const dateEveryone = async () => {
    setBusy("date");
    setErr(null);
    setNote(null);
    try {
      let guard = 0;
      while (guard++ < 200) {
        const r = await api<{ processed: number; remaining: number }>(`/api/people/${person.id}/date`, { json: { limit: 6 } });
        setNote(r.remaining > 0 ? `${r.remaining} dates still to go` : "All dates finished");
        onChange();
        if (r.remaining === 0 || r.processed === 0) break;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      onChange();
    }
  };

  const working = person.status === "scraping" || person.status === "analyzing";
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button variant="secondary" onClick={analyze} disabled={busy !== null || working}>
          {busy === "analyze" ? <Spinner /> : null}
          {person.status === "ready" ? "Read again" : "Read this person"}
        </Button>
        {person.status === "ready" && (
          <Button onClick={dateEveryone} disabled={busy !== null}>
            {busy === "date" ? <Spinner /> : null}
            Date everyone
          </Button>
        )}
      </div>
      {note && <span className="text-xs text-muted">{note}</span>}
      <ErrorNote message={err} />
    </div>
  );
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

function RankingSection({ person, ranking }: { person: Person; ranking?: PersonRanking }) {
  const name = person.analysis?.name ?? person.displayName;
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <H2>Who fits {firstName(name)} best</H2>
        {ranking && <span className="text-sm text-muted">{ranking.datesCompleted} of {ranking.datesTotal} dates debriefed</span>}
      </div>
      {!ranking || ranking.matches.length === 0 ? (
        <Empty title="No dates yet">
          Use “Date everyone” above, or run all the dates from the People page. Ranking appears here as dates finish.
        </Empty>
      ) : (
        <ol className="space-y-2">
          {ranking.matches.map((m) => (
            <li key={m.personId}>
              <Card className={`p-4 ${m.rank === 1 ? "border-gold/60" : ""}`}>
                <div className="flex flex-wrap items-start gap-4">
                  <span className={`w-10 shrink-0 font-display text-3xl leading-none ${m.rank <= 3 ? "text-gold" : "text-muted"}`}>{m.rank}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <Link href={`/people/${m.personId}`} className="font-display text-lg text-paper">{m.name}</Link>
                      <span className="text-sm text-muted">{m.headline}</span>
                      {m.mutualTop3 && <span className="rounded-full bg-rose/15 px-2 py-0.5 text-xs text-rose">mutual top 3</span>}
                    </div>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-paper/90">“{m.verdict}”</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      {m.liked.slice(0, 2).map((l, i) => <span key={i} className="text-mint/90">+ {l}</span>)}
                      {m.concerns.slice(0, 1).map((l, i) => <span key={i} className="text-gold/90">− {l}</span>)}
                    </div>
                  </div>
                  <div className="flex w-full flex-wrap items-end gap-4 sm:w-auto sm:flex-col sm:items-stretch">
                    <Score value={m.score} label={`${firstName(name)}’s agent`} />
                    <Score value={m.theirScore} label={`${firstName(m.name)}’s agent`} tone="rose" />
                    <Link href={`/dates/${m.dateId}`} className="text-xs text-muted hover:text-paper">Read the date · {m.seeAgain === "yes" ? "would see again" : m.seeAgain === "maybe" ? "maybe again" : "one and done"}</Link>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
