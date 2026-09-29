"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, timeAgo, usePoll } from "@/lib/client";
import type { DateMessage, DateRecord, Debrief, PipelineStatus } from "@/lib/types";
import { Button, Card, Empty, ErrorNote, H2, H3, Score, Spinner, Status } from "./ui";

type Named = { name: string; headline: string };
type DateRow = DateRecord & { a: Named; b: Named; messageCount: number };

function firstName(n: string) {
  return n.split(/\s+/)[0] || n;
}

export default function DatesView() {
  const running = usePoll<{ dates: DateRow[] }>("/api/dates?status=running&limit=12", 1500);
  const done = usePoll<{ dates: DateRow[]; total: number }>("/api/dates?status=done&limit=40", 4000);
  const status = usePoll<PipelineStatus>("/api/run", 4000);
  const live = running.data?.dates ?? [];
  const finished = done.data?.dates ?? [];
  const s = status.data;

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-paper">The dates</h1>
          <p className="mt-2 max-w-xl text-muted">
            Each date is two agents, each speaking as their person, in a setting picked from what the two have in common. Afterwards each agent
            debriefs on its own — so the two sides can disagree.
          </p>
        </div>
        {s && (
          <p className="text-sm text-muted">
            {s.dates.done} done · <span className={s.dates.running ? "text-rose" : ""}>{s.dates.running} happening now</span> · {s.dates.pending} waiting
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full bg-rose ${live.length ? "live-dot" : "opacity-40"}`} />
          <H2>Happening now</H2>
        </div>
        {running.error && <ErrorNote message={running.error} />}
        {live.length === 0 ? (
          <Empty title="No dates in progress">
            Start them from the <Link href="/" className="text-rose">People page</Link> (“Run all the dates”) or from any profile (“Date everyone”).
          </Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {live.map((d) => (
              <LiveDate key={d.id} d={d} />
            ))}
          </div>
        )}
      </section>

      <section>
        <H2 className="mb-3">Finished</H2>
        {finished.length === 0 ? (
          <Empty title="Nothing finished yet" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {finished.map((d) => (
              <FinishedDate key={d.id} d={d} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function LiveDate({ d }: { d: DateRow }) {
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-lg text-paper">
          {d.a.name} <span className="text-muted">&</span> {d.b.name}
        </p>
        <Status status="running" />
      </div>
      {d.scene && <p className="mt-1 font-display text-sm italic text-paper/70">{d.scene}</p>}
      <Transcript messages={d.messages} aId={d.personAId} compact />
      <Link href={`/dates/${d.id}`} className="mt-3 self-end text-xs text-muted hover:text-paper">
        Open this date
      </Link>
    </Card>
  );
}

function FinishedDate({ d }: { d: DateRow }) {
  const da = d.debriefs?.[d.personAId];
  const db = d.debriefs?.[d.personBId];
  return (
    <Link href={`/dates/${d.id}`} className="block no-underline">
      <Card className="h-full p-4 transition hover:border-rose/50">
        <p className="font-display text-base text-paper">
          {d.a.name} <span className="text-muted">&</span> {d.b.name}
        </p>
        {d.scene && <p className="mt-1 line-clamp-2 text-xs italic text-muted">{d.scene}</p>}
        {da && db && (
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className="text-gold">{da.compatibility}</span>
            <span className="text-muted">↔</span>
            <span className="text-rose">{db.compatibility}</span>
            <span className="ml-auto text-xs text-muted">{timeAgo(d.finishedAt)}</span>
          </div>
        )}
      </Card>
    </Link>
  );
}

export function Transcript({ messages, aId, compact }: { messages: DateMessage[]; aId: string; compact?: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  const count = messages.length;
  useEffect(() => {
    if (compact) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [count, compact]);
  return (
    <div className={`mt-3 space-y-2.5 ${compact ? "max-h-72 overflow-y-auto pr-1" : ""}`}>
      {messages.length === 0 && (
        <p className="text-sm text-muted"><Spinner className="mr-2" />Setting the scene…</p>
      )}
      {messages.map((m, i) => {
        const left = m.speakerId === aId;
        return (
          <div key={i} className={`flex ${left ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[88%] rounded-2xl px-3.5 py-2 ${left ? "rounded-bl-sm bg-surface" : "rounded-br-sm bg-rose/15"}`}>
              <p className={`mb-0.5 text-[11px] ${left ? "text-gold" : "text-rose"}`}>{firstName(m.speakerName)}</p>
              <p className={`leading-relaxed text-paper/95 ${compact ? "text-[13px]" : "text-[15px]"}`}>{m.text}</p>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

// ─── Single date ─────────────────────────────────────────────────────────────

type Slim = { id: string; name: string; headline: string; location: string } | null;

export function DateView({ id }: { id: string }) {
  const q = usePoll<{ date: DateRecord; a: Slim; b: Slim }>(`/api/dates/${id}`, 1500);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const d = q.data?.date;
  const a = q.data?.a;
  const b = q.data?.b;
  if (q.error) return <ErrorNote message={q.error} />;
  if (!d || !a || !b) return <p className="text-muted"><Spinner className="mr-2" />Loading…</p>;

  const rerun = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/dates/${id}`, { method: "POST" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      q.refresh();
    }
  };

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted"><Link href="/dates" className="text-muted hover:text-paper">Dates</Link> / transcript</p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-paper sm:text-4xl">
            <Link href={`/people/${a.id}`}>{a.name}</Link> <span className="text-muted">&</span> <Link href={`/people/${b.id}`}>{b.name}</Link>
          </h1>
          <p className="mt-1 text-sm text-muted">{a.headline} · {b.headline}</p>
        </div>
        <div className="flex items-center gap-3">
          <Status status={d.status} />
          <Button variant="secondary" onClick={rerun} disabled={busy || d.status === "running"}>
            {busy ? <Spinner /> : null}
            Run this date again
          </Button>
        </div>
      </section>
      <ErrorNote message={err ?? d.error} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          {d.scene && <p className="font-display text-base italic leading-relaxed text-paper/75">{d.scene}</p>}
          <Transcript messages={d.messages} aId={d.personAId} />
          {d.status === "running" && (
            <p className="mt-3 text-sm text-muted"><Spinner className="mr-2" />{d.messages.length % 2 === 0 ? firstName(a.name) : firstName(b.name)} is thinking…</p>
          )}
        </Card>
        <div className="space-y-4">
          <H3>After the date</H3>
          {d.debriefs ? (
            <>
              <DebriefCard who={a.name} about={b.name} debrief={d.debriefs[a.id]} tone="gold" />
              <DebriefCard who={b.name} about={a.name} debrief={d.debriefs[b.id]} tone="rose" />
            </>
          ) : (
            <p className="text-sm text-muted">Each agent debriefs separately once the conversation ends.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DebriefCard({ who, about, debrief, tone }: { who: string; about: string; debrief?: Debrief; tone: "gold" | "rose" }) {
  if (!debrief) return null;
  const again = { yes: "Would see them again", maybe: "Maybe again", no: "One and done" }[debrief.seeAgain];
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">
        <span className={tone === "gold" ? "text-gold" : "text-rose"}>{firstName(who)}’s agent</span> on {firstName(about)}
      </p>
      <p className="mt-2 font-display text-[17px] leading-snug text-paper">“{debrief.verdict}”</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Score value={debrief.compatibility} label="fit" tone={tone} />
        <Score value={debrief.chemistry} label="chemistry" tone="mint" />
      </div>
      <p className="mt-3 text-xs text-muted">{again}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {debrief.liked.map((l, i) => <li key={"l" + i} className="text-mint/90">+ {l}</li>)}
        {debrief.concerns.map((l, i) => <li key={"c" + i} className="text-gold/90">− {l}</li>)}
      </ul>
    </Card>
  );
}
