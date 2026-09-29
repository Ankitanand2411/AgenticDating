"use client";

import Link from "next/link";
import { usePoll } from "@/lib/client";
import type { MutualMatch, PersonRanking } from "@/lib/types";
import { Card, Empty, ErrorNote, H2, Spinner } from "./ui";

function firstName(n: string) {
  return n.split(/\s+/)[0] || n;
}

export default function RankingsView() {
  const q = usePoll<{ rankings: PersonRanking[]; mutual: MutualMatch[] }>("/api/rankings", 5000);
  if (q.error) return <ErrorNote message={q.error} />;
  if (!q.data) return <p className="text-muted"><Spinner className="mr-2" />Loading…</p>;
  const { rankings, mutual } = q.data;
  const withDates = rankings.filter((r) => r.matches.length > 0);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-4xl tracking-tight text-paper">Rankings</h1>
        <p className="mt-2 max-w-xl text-muted">
          For every person: who fits them best, in their own agent’s judgement after the dates. The other agent’s score is shown alongside, so you
          can see when the feeling is mutual.
        </p>
      </section>

      {mutual.length > 0 && (
        <section>
          <H2 className="mb-3">Mutual matches</H2>
          <p className="mb-4 text-sm text-muted">Pairs where each person is in the other’s top three.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mutual.map((m) => (
              <Link key={m.dateId} href={`/dates/${m.dateId}`} className="block no-underline">
                <Card className="p-4 transition hover:border-rose/50">
                  <p className="font-display text-lg text-paper">
                    {m.aName} <span className="text-rose">&</span> {m.bName}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    #{m.aRank} for {firstName(m.aName)} · #{m.bRank} for {firstName(m.bName)}
                  </p>
                  <p className="mt-2 text-sm">
                    <span className="text-gold">{m.aScore}</span> <span className="text-muted">↔</span> <span className="text-rose">{m.bScore}</span>
                    <span className="ml-2 text-muted">mutual {m.mutual}</span>
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <H2 className="mb-3">Everyone’s ranking</H2>
        {withDates.length === 0 ? (
          <Empty title="No rankings yet">Rankings appear as soon as dates finish. Start them from the People page.</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {withDates.map((r) => (
              <Card key={r.personId} className="p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={`/people/${r.personId}`} className="font-display text-xl text-paper">{r.name}</Link>
                  <span className="text-xs text-muted">{r.datesCompleted} dates</span>
                </div>
                <p className="text-sm text-muted">{r.headline}</p>
                <ol className="mt-4 space-y-2">
                  {r.matches.slice(0, 3).map((m) => (
                    <li key={m.personId} className="flex items-start gap-3">
                      <span className="w-6 shrink-0 font-display text-2xl leading-none text-gold">{m.rank}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <Link href={`/people/${m.personId}`} className="text-paper">{m.name}</Link>
                          <span className="text-xs text-muted">{m.score}/10 · they say {m.theirScore}/10</span>
                          {m.mutualTop3 && <span className="rounded-full bg-rose/15 px-1.5 text-[11px] text-rose">mutual</span>}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-sm text-paper/75">“{m.verdict}”</p>
                      </div>
                    </li>
                  ))}
                </ol>
                {r.matches.length > 3 && (
                  <Link href={`/people/${r.personId}`} className="mt-3 inline-block text-sm text-muted hover:text-paper">
                    Full ranking ({r.matches.length})
                  </Link>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
