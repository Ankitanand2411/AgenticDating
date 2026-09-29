"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, timeAgo, usePoll } from "@/lib/client";
import type { Person, PipelineStatus } from "@/lib/types";
import { Button, Card, Empty, ErrorNote, H2, Spinner, Status } from "./ui";

type SlimPerson = Omit<Person, "sources">;

export default function Home() {
  const [tab, setTab] = useState<"one" | "many">("one");
  const people = usePoll<{ people: SlimPerson[] }>("/api/people", 3000);
  const status = usePoll<PipelineStatus>("/api/run", 3000);
  const list = people.data?.people ?? [];

  return (
    <div className="space-y-12">
      <section className="grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-end">
        <div>
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-paper sm:text-5xl">
            Every person gets an agent.
            <br />
            The agents go on the dates.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">
            Paste a public LinkedIn and a public Instagram. An agent reads both, writes up who that person is and what they need, then
            dates every other agent here on their behalf. Afterwards each person gets a ranking of who fits them best.
          </p>
        </div>
        <Card className="p-5">
          <div className="mb-4 flex gap-1 text-sm">
            <TabButton active={tab === "one"} onClick={() => setTab("one")}>
              Add one person
            </TabButton>
            <TabButton active={tab === "many"} onClick={() => setTab("many")}>
              Paste a list
            </TabButton>
          </div>
          {tab === "one" ? <AddOne onAdded={people.refresh} /> : <AddMany onAdded={people.refresh} />}
        </Card>
      </section>

      <PipelinePanel status={status.data} refresh={() => { status.refresh(); people.refresh(); }} peopleCount={list.length} />

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <H2>People</H2>
          <span className="text-sm text-muted">{list.length} added</span>
        </div>
        {people.error && <ErrorNote message={people.error} />}
        {list.length === 0 ? (
          <Empty title="Nobody here yet">Add a person above. Each one needs a LinkedIn profile link and a public Instagram.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-md px-3 py-1.5 transition ${active ? "bg-surface text-paper" : "text-muted hover:text-paper"}`}>
      {children}
    </button>
  );
}

function AddOne({ onAdded }: { onAdded: () => void }) {
  const router = useRouter();
  const [linkedin, setLinkedin] = useState("");
  const [instagram, setInstagram] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await api<{ created: SlimPerson[]; skipped: string[] }>("/api/people", { json: { linkedinUrl: linkedin, instagramUrl: instagram } });
      const created = r.created[0];
      if (!created) throw new Error(r.skipped[0] ?? "Nothing was added");
      onAdded();
      // Kick off the reading without waiting for it, then go watch it on the profile page.
      fetch(`/api/people/${created.id}/analyze`, { method: "POST" }).catch(() => {});
      router.push(`/people/${created.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="LinkedIn profile" value={linkedin} onChange={setLinkedin} placeholder="https://www.linkedin.com/in/…" />
      <Field label="Instagram (public)" value={instagram} onChange={setInstagram} placeholder="https://www.instagram.com/… or @handle" />
      <ErrorNote message={err} />
      <Button onClick={submit} disabled={busy || !linkedin || !instagram} className="w-full">
        {busy ? <Spinner /> : null}
        {busy ? "Adding…" : "Read this person"}
      </Button>
      <p className="text-xs text-muted">The agent reads both profiles (usually 20–90 seconds) and opens their profile page.</p>
    </div>
  );
}

function AddMany({ onAdded }: { onAdded: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: string[]; errors: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await api<{ created: SlimPerson[]; skipped: string[]; errors: string[] }>("/api/people", { json: { bulk: text } });
      setResult({ created: r.created.length, skipped: r.skipped, errors: r.errors });
      if (r.created.length) setText("");
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm text-muted">
        One person per line: LinkedIn link, then Instagram link
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={"https://www.linkedin.com/in/someone, https://www.instagram.com/someone\nhttps://www.linkedin.com/in/another, @another"}
          className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 font-mono text-xs text-paper placeholder:text-muted/60 focus:border-rose/60 focus:outline-none"
        />
      </label>
      <ErrorNote message={err} />
      {result && (
        <div className="rounded-lg bg-surface px-3 py-2 text-sm">
          <p>Added {result.created}. {result.skipped.length ? `Skipped ${result.skipped.length}.` : ""}</p>
          {[...result.skipped, ...result.errors].slice(0, 6).map((s, i) => (
            <p key={i} className="mt-1 text-xs text-muted">{s}</p>
          ))}
        </div>
      )}
      <Button onClick={submit} disabled={busy || !text.trim()} className="w-full">
        {busy ? <Spinner /> : null}
        Add everyone on the list
      </Button>
      <p className="text-xs text-muted">Then use “Read everyone” below to let the agents read them all.</p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="block text-sm text-muted">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:border-rose/60 focus:outline-none"
      />
    </label>
  );
}

// ─── Pipeline panel ──────────────────────────────────────────────────────────

function PipelinePanel({ status, refresh, peopleCount }: { status: PipelineStatus | null; refresh: () => void; peopleCount: number }) {
  const [running, setRunning] = useState<null | "analyze" | "dates">(null);
  const [log, setLog] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const stop = useRef(false);

  useEffect(() => () => { stop.current = true; }, []);

  const loop = async (step: "analyze" | "dates") => {
    setErr(null);
    setRunning(step);
    stop.current = false;
    try {
      let guard = 0;
      while (!stop.current && guard++ < 400) {
        const r = await api<{ processed: number; remaining: number; status: PipelineStatus }>("/api/run", { json: { step, limit: 6 } });
        setLog(step === "analyze" ? `${r.status.people.ready}/${r.status.people.total} people read` : `${r.status.dates.done}/${r.status.dates.total} dates done`);
        refresh();
        if (r.remaining === 0 || r.processed === 0) break;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
      refresh();
    }
  };

  const background = async () => {
    setErr(null);
    try {
      const r = await api<{ background: string }>("/api/run", { json: { background: true } });
      setLog(r.background === "started" ? "Running on the server. This page updates as it goes." : "A run is already in progress.");
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const s = status;
  const bg = s?.background;
  const anyWorking = Boolean(running) || Boolean(bg?.running) || (s?.people.working ?? 0) > 0 || (s?.dates.running ?? 0) > 0;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <H2>Run the agents</H2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            First the agents read everyone. Then every agent dates every other agent: a setting chosen from their overlaps, a real back-and-forth
            conversation, and two independent debriefs per pair. Rankings update as dates finish.
          </p>
        </div>
        {s && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <Stat label="people read" value={`${s.people.ready}/${s.people.total}`} />
            <Stat label="dates done" value={`${s.dates.done}/${s.dates.total}`} />
            <Stat label="on a date now" value={String(s.dates.running)} tone={s.dates.running ? "rose" : undefined} />
            <Stat label="errors" value={String(s.people.error + s.dates.error)} tone={s.people.error + s.dates.error ? "warn" : undefined} />
          </dl>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => loop("analyze")} disabled={anyWorking || peopleCount === 0}>
          {running === "analyze" ? <Spinner /> : null}
          Read everyone
        </Button>
        <Button onClick={() => loop("dates")} disabled={anyWorking || (s?.people.ready ?? 0) < 2}>
          {running === "dates" ? <Spinner /> : null}
          Run all the dates
        </Button>
        <Button variant="ghost" onClick={background} disabled={anyWorking || peopleCount === 0}>
          Do both on the server
        </Button>
        {running && (
          <Button variant="ghost" onClick={() => { stop.current = true; }}>
            Stop after this batch
          </Button>
        )}
        <Link href="/dates" className="ml-auto text-sm text-rose">
          Watch the dates live
        </Link>
      </div>
      {(log || bg?.running || bg?.note) && (
        <p className="mt-3 text-sm text-muted">
          {bg?.running ? <><Spinner className="mr-2 align-middle" />Server run: {bg.step} (started {timeAgo(bg.startedAt)}). </> : null}
          {log}
          {!bg?.running && bg?.note ? ` Last server run: ${bg.note}` : ""}
        </p>
      )}
      <ErrorNote message={err} />
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "rose" | "warn" }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`font-display text-xl ${tone === "rose" ? "text-rose" : tone === "warn" ? "text-gold" : "text-paper"}`}>{value}</dd>
    </div>
  );
}

// ─── People grid ─────────────────────────────────────────────────────────────

function PersonCard({ person }: { person: SlimPerson }) {
  const a = person.analysis;
  return (
    <Link href={`/people/${person.id}`} className="group block no-underline">
      <Card className="h-full p-4 transition group-hover:border-rose/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg text-paper">{a?.name ?? person.displayName}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-muted">{a?.headline ?? `@${person.instagramHandle} · ${person.linkedinSlug}`}</p>
          </div>
          <Status status={person.status} />
        </div>
        {a ? (
          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-paper/80">{a.summary}</p>
        ) : person.error ? (
          <p className="mt-3 line-clamp-3 text-sm text-red-200">{person.error}</p>
        ) : (
          <p className="mt-3 text-sm text-muted">Waiting for the agent to read both profiles.</p>
        )}
        {a && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...a.hobbies.slice(0, 2), ...a.interests.slice(0, 2)].map((h, i) => (
              <span key={i} className="rounded-md bg-surface px-2 py-0.5 text-xs text-paper/80">
                {h.label}
              </span>
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}
