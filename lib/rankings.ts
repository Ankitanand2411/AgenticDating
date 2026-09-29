import type { DateRecord, MutualMatch, Person, PersonRanking, RankedMatch } from "./types";

export function rankFor(person: Person, people: Person[], dates: DateRecord[]): PersonRanking {
  const byId = new Map(people.map((p) => [p.id, p]));
  const mine = dates.filter((d) => d.personAId === person.id || d.personBId === person.id);
  const matches: RankedMatch[] = [];
  for (const d of mine) {
    if (d.status !== "done" || !d.debriefs) continue;
    const otherId = d.personAId === person.id ? d.personBId : d.personAId;
    const other = byId.get(otherId);
    const myView = d.debriefs[person.id];
    const theirView = d.debriefs[otherId];
    if (!other || !myView || !theirView) continue;
    matches.push({
      rank: 0,
      personId: otherId,
      name: other.analysis?.name ?? other.displayName,
      headline: other.analysis?.headline ?? "",
      dateId: d.id,
      score: myView.compatibility,
      theirScore: theirView.compatibility,
      mutual: Math.round(((myView.compatibility + theirView.compatibility) / 2) * 10) / 10,
      chemistry: myView.chemistry,
      seeAgain: myView.seeAgain,
      verdict: myView.verdict,
      liked: myView.liked,
      concerns: myView.concerns,
    });
  }
  // Primary: how well the other fits THIS person (their own agent's verdict).
  // Tie-breakers: mutual score, then chemistry, then whether they'd see them again.
  const seeRank = { yes: 2, maybe: 1, no: 0 } as const;
  matches.sort(
    (x, y) =>
      y.score - x.score || y.mutual - x.mutual || y.chemistry - x.chemistry || seeRank[y.seeAgain] - seeRank[x.seeAgain] || x.name.localeCompare(y.name),
  );
  matches.forEach((m, i) => (m.rank = i + 1));
  return {
    personId: person.id,
    name: person.analysis?.name ?? person.displayName,
    headline: person.analysis?.headline ?? "",
    datesCompleted: matches.length,
    datesTotal: mine.length,
    matches,
  };
}

export function rankAll(people: Person[], dates: DateRecord[]): { rankings: PersonRanking[]; mutual: MutualMatch[] } {
  const ready = people.filter((p) => p.status === "ready" && p.analysis);
  const rankings = ready.map((p) => rankFor(p, ready, dates));
  const rankIndex = new Map<string, Map<string, RankedMatch>>();
  for (const r of rankings) rankIndex.set(r.personId, new Map(r.matches.map((m) => [m.personId, m])));

  // Mark mutual-top-3 on each match and collect mutual pairs.
  const mutual: MutualMatch[] = [];
  const seen = new Set<string>();
  for (const r of rankings) {
    for (const m of r.matches) {
      const back = rankIndex.get(m.personId)?.get(r.personId);
      if (!back) continue;
      m.mutualTop3 = m.rank <= 3 && back.rank <= 3;
      const key = [r.personId, m.personId].sort().join("__");
      if (m.mutualTop3 && !seen.has(key)) {
        seen.add(key);
        mutual.push({
          aId: r.personId,
          aName: r.name,
          bId: m.personId,
          bName: m.name,
          dateId: m.dateId,
          aScore: m.score,
          bScore: back.score,
          mutual: m.mutual,
          aRank: m.rank,
          bRank: back.rank,
        });
      }
    }
  }
  mutual.sort((x, y) => y.mutual - x.mutual || x.aRank + x.bRank - (y.aRank + y.bRank));
  rankings.sort((x, y) => x.name.localeCompare(y.name));
  return { rankings, mutual };
}
