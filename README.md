# Agentic Dating

Every person gets an agent. The agent reads exactly two public sources — the person's **LinkedIn** and their **Instagram** — writes up who they are and what they need, then goes on a first date with every other agent on that person's behalf. After each date both agents debrief independently, and every person gets a ranking of who fits them best.

```
LinkedIn + Instagram ──► reader agent ──► profile page (needs · hobbies · interests · persona)
                                              │
                                              ▼
                              every pair of agents goes on a date
                              (scene → conversation → two debriefs)
                                              │
                                              ▼
                                per-person ranking + mutual matches
```

## How it works

### 1. Two sources, nothing else
A person is added as a LinkedIn profile URL and a public Instagram URL (or `@handle`). Both links are normalised and de-duplicated. Private Instagram accounts are rejected with a clear message — the rule is public profiles only.

### 2. The reader agent
`lib/agents/reader.ts`. Both sources are captured into a plain-text digest (see *Scraping* below) and handed to a single Claude call with a strict schema. The agent returns:

- **name, headline, location, summary**
- **the reading** — a short narrative of *how* it read the person: what LinkedIn says, what Instagram adds, where they agree or contrast
- **needs / hobbies / interests**, each with the **evidence** it came from
- values, personality (traits, how they talk, energy, humour), lifestyle (work, social, travel, fitness)
- what they're looking for, dealbreakers, green flags, conversation hooks
- an **agent persona**: a first-person brief that the dating agent speaks from
- a confidence score per source and the source highlights it pulled from each

Guardrails in the prompt: no guessing orientation, religion, ethnicity, health, politics, relationship status or age; nothing about appearance; every claim traceable to the two sources; thin sources lower confidence instead of inventing detail.

All of this is shown on the profile page (`/people/[id]`), including a "show exactly what the agent read" toggle for each source.

### 3. The dating harness
`lib/agents/dating.ts`. For every pair of analysed people:

1. **Scene** — a matchmaker call picks *where* they meet from real overlaps (shared hobby, city, pace).
2. **Conversation** — the two agents alternate. Each turn is a separate model call made *from that agent's point of view*: its own person's persona brief as the system prompt, the transcript so far as the chat history, and only the other person's name and headline as prior knowledge — it has to discover the other person through conversation. Turns are short and in character; agents are told to let clashes with their needs or dealbreakers show, and to show delight when something lands. `DATE_ROUNDS` controls the length (3 rounds = 6 messages).
3. **Two independent debriefs** — each agent scores the date for *its* person: compatibility 1–10 (long-term fit against needs, values, lifestyle, dealbreakers), chemistry 1–10, what it liked, concerns, would-see-again, and a one-line verdict in the person's voice. Because the debriefs are independent, the two sides can disagree — which makes the rankings honest.

Every message is saved as it's generated, so `/dates` shows the dates happening live and `/dates/[id]` shows a full transcript with both debriefs.

### 4. Rankings
`lib/rankings.ts`. For each person, everyone they dated is sorted by *their own agent's* compatibility score, with mutual score, chemistry and would-see-again as tie-breakers. The other agent's score is shown alongside. Pairs where each is in the other's top three are surfaced as **mutual matches**. Rankings are computed from the stored dates on every request, so they update as dates finish.

## Scraping stack

Each source has a chain of readers; the first one that returns real content wins and the method used is shown on the profile page.

| Source | Order | What it is |
|---|---|---|
| Instagram | 1. `i.instagram.com/api/v1/users/web_profile_info` | Instagram's own public web JSON (bio, counts, link in bio, category, last 12 captions + alt text). No login. Rejects private accounts. |
| | 2. Apify `apify/instagram-profile-scraper` | Managed scraper, used when `APIFY_TOKEN` is set. |
| | 3. Public page `og:` meta tags | Bio + counts only. |
| LinkedIn | 1. Apify `dev_fusion/linkedin-profile-scraper` | Managed scraper (headline, about, experience, education, skills). Actor and input key are configurable. |
| | 2. Public page JSON-LD | LinkedIn renders `Person` JSON-LD for logged-out crawlers some of the time. |
| Both | last resort: web research | Claude with Anthropic's server-side `web_search` tool, `allowed_domains` locked to `linkedin.com` / `instagram.com` so the two-sources rule holds. |

Whatever comes back is flattened into a text digest (`toDigest`) rather than mapped field-by-field, so the reader agent copes with any actor's schema.

## Running it

```bash
cp .env.example .env     # add ANTHROPIC_API_KEY (and APIFY_TOKEN for reliable LinkedIn)
npm install
npm run dev              # http://localhost:3000
```

Try it without any keys: `MOCK_MODE=1 npm run dev` runs the whole pipeline with canned scraper and model output.

Storage is a single JSON file at `data/db.json` by default (perfect for a VPS or local). Set `DATABASE_URL` to any Postgres (Supabase, Neon, Railway) to run on serverless hosts — the table is created automatically. If `data/snapshot.json` exists and there is no database yet, the app boots with it, which is how the finished demo ships.

### Running the whole example
1. Paste your list of people (one per line: LinkedIn link, Instagram link) into **Paste a list** on the home page.
2. Click **Read everyone**, then **Run all the dates** — or **Do both on the server** on a long-lived host, or from a terminal:
   ```bash
   npm run pipeline          # reads everyone, pairs them, runs all dates
   npm run export            # writes data/snapshot.json for the demo deploy
   ```
   25 people = 300 dates. With `DATE_ROUNDS=3` and `MAX_CONCURRENCY=6` that's roughly 15–25 minutes on Haiku.
3. `/dates` to watch live, `/rankings` for the result, `/people/[id]` for any profile.

The API is chunked so it works on serverless too: `POST /api/run {step:"dates", limit:6}` does a bounded batch and returns `remaining`; the UI loops until it's zero.

### API
| Method | Path | What |
|---|---|---|
| `GET/POST` | `/api/people` | list · add one `{linkedinUrl, instagramUrl}` or many `{bulk}` |
| `GET/DELETE` | `/api/people/:id` | one person (DELETE needs `ADMIN_TOKEN` if set) |
| `POST` | `/api/people/:id/analyze` | scrape both sources + run the reader |
| `POST` | `/api/people/:id/date` | date everyone `{limit}` (chunked) or `{background:true}` |
| `GET` | `/api/people/:id/ranking` | this person's ranking |
| `GET` | `/api/dates?status=&personId=` | list dates; `/api/dates/:id` for one (POST re-runs it) |
| `GET` | `/api/rankings` | everyone's ranking + mutual matches |
| `GET/POST` | `/api/run` | pipeline status · run a step `{step, limit}` or `{background:true}` |
| `GET` | `/api/export` | the whole database as JSON |

## Deploying

**VPS / Docker (recommended — long runs, live dates, no timeouts):**
```bash
docker build -t agentic-dating . && docker run -d -p 3000:3000 --env-file .env -v $PWD/data:/app/data agentic-dating
```
or `npm run build && pm2 start "npm start" --name dating`.

**Vercel / serverless:** set `DATABASE_URL` (Supabase works) plus the other env vars. Use the chunked buttons rather than "Do both on the server". If your plan rejects `maxDuration = 300`, lower it in the API routes.

## Project layout
```
app/            Next.js 14 App Router pages + API routes
components/     UI (home, profile dossier, live dates, transcript, rankings)
lib/agents/     reader.ts (analysis) · dating.ts (harness)
lib/scrape/     instagram.ts · linkedin.ts · apify.ts
lib/            store.ts (file/Postgres) · pipeline.ts · rankings.ts · llm.ts · urls.ts
scripts/        run-pipeline.ts · export-snapshot.ts
```

Stack: Next.js 14, TypeScript, Tailwind, Anthropic SDK (Claude Sonnet for reading, Claude Haiku for date turns and debriefs), Apify REST, optional Postgres.
