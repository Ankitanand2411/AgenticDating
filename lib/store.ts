import fs from "node:fs";
import path from "node:path";
import type { DateRecord, DbShape, Person } from "./types";

/**
 * Two interchangeable stores behind one tiny interface:
 *  - FileStore: a single JSON document at data/db.json (zero config; ideal for a VPS or local dev)
 *  - PgStore:   a single `kv` table in Postgres (for serverless hosts like Vercel). Enabled by DATABASE_URL.
 *
 * Both serialise writes through a mutex so concurrent date runners don't clobber each other.
 */
export interface Store {
  getPeople(): Promise<Person[]>;
  getPerson(id: string): Promise<Person | undefined>;
  putPerson(p: Person): Promise<void>;
  deletePerson(id: string): Promise<void>;
  getDates(): Promise<DateRecord[]>;
  getDate(id: string): Promise<DateRecord | undefined>;
  putDate(d: DateRecord): Promise<void>;
  deleteDate(id: string): Promise<void>;
  getMeta(): Promise<DbShape["meta"]>;
  putMeta(meta: DbShape["meta"]): Promise<void>;
  exportAll(): Promise<DbShape>;
  importAll(db: DbShape): Promise<void>;
  reset(): Promise<void>;
}

class Mutex {
  private tail: Promise<void> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

function emptyDb(): DbShape {
  return { people: {}, dates: {}, meta: { version: 1, createdAt: new Date().toISOString() } };
}

// ─── File store ──────────────────────────────────────────────────────────────

class FileStore implements Store {
  private file: string;
  private mutex = new Mutex();
  private cache: DbShape | null = null;

  constructor(file: string) {
    this.file = file;
  }

  private load(): DbShape {
    if (this.cache) return this.cache;
    try {
      if (fs.existsSync(this.file)) {
        this.cache = JSON.parse(fs.readFileSync(this.file, "utf8")) as DbShape;
      } else {
        // First boot: seed from a committed snapshot if one exists (the "demo already run").
        const snapshot = path.join(path.dirname(this.file), "snapshot.json");
        if (fs.existsSync(snapshot)) {
          this.cache = JSON.parse(fs.readFileSync(snapshot, "utf8")) as DbShape;
        } else {
          this.cache = emptyDb();
        }
        this.persist();
      }
    } catch (e) {
      console.error("[store] failed to load db, starting empty:", e);
      this.cache = emptyDb();
    }
    this.cache.people ||= {};
    this.cache.dates ||= {};
    this.cache.meta ||= emptyDb().meta;
    return this.cache;
  }

  private persist() {
    const db = this.cache ?? emptyDb();
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, this.file);
  }

  private write<T>(fn: (db: DbShape) => T): Promise<T> {
    return this.mutex.run(async () => {
      const db = this.load();
      const out = fn(db);
      this.persist();
      return out;
    });
  }

  async getPeople() {
    return Object.values(this.load().people);
  }
  async getPerson(id: string) {
    return this.load().people[id];
  }
  async putPerson(p: Person) {
    await this.write((db) => {
      db.people[p.id] = p;
    });
  }
  async deletePerson(id: string) {
    await this.write((db) => {
      delete db.people[id];
      for (const d of Object.values(db.dates)) {
        if (d.personAId === id || d.personBId === id) delete db.dates[d.id];
      }
    });
  }
  async getDates() {
    return Object.values(this.load().dates);
  }
  async getDate(id: string) {
    return this.load().dates[id];
  }
  async putDate(d: DateRecord) {
    await this.write((db) => {
      db.dates[d.id] = d;
    });
  }
  async deleteDate(id: string) {
    await this.write((db) => {
      delete db.dates[id];
    });
  }
  async getMeta() {
    return this.load().meta;
  }
  async putMeta(meta: DbShape["meta"]) {
    await this.write((db) => {
      db.meta = meta;
    });
  }
  async exportAll() {
    return JSON.parse(JSON.stringify(this.load())) as DbShape;
  }
  async importAll(incoming: DbShape) {
    await this.write((db) => {
      db.people = incoming.people ?? {};
      db.dates = incoming.dates ?? {};
      db.meta = { ...emptyDb().meta, ...(incoming.meta ?? {}) };
    });
  }
  async reset() {
    await this.write((db) => {
      db.people = {};
      db.dates = {};
      db.meta = emptyDb().meta;
    });
  }
}

// ─── Postgres store ──────────────────────────────────────────────────────────

class PgStore implements Store {
  private pool: import("pg").Pool | null = null;
  private ready: Promise<void> | null = null;
  private mutex = new Mutex();

  constructor(private url: string) {}

  private async init() {
    if (!this.ready) {
      this.ready = (async () => {
        const { Pool } = await import("pg");
        const needsSsl = !/localhost|127\.0\.0\.1/.test(this.url);
        this.pool = new Pool({
          connectionString: this.url,
          max: 5,
          ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
        });
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS kv (
            kind TEXT NOT NULL,
            id TEXT NOT NULL,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (kind, id)
          )`);
      })();
    }
    await this.ready;
    return this.pool!;
  }

  private async list<T>(kind: string): Promise<T[]> {
    const pool = await this.init();
    const r = await pool.query("SELECT data FROM kv WHERE kind = $1", [kind]);
    return r.rows.map((row) => row.data as T);
  }
  private async get<T>(kind: string, id: string): Promise<T | undefined> {
    const pool = await this.init();
    const r = await pool.query("SELECT data FROM kv WHERE kind = $1 AND id = $2", [kind, id]);
    return r.rows[0]?.data as T | undefined;
  }
  private async put(kind: string, id: string, data: unknown) {
    const pool = await this.init();
    await this.mutex.run(() =>
      pool.query(
        `INSERT INTO kv (kind, id, data, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [kind, id, JSON.stringify(data)],
      ),
    );
  }
  private async del(kind: string, id: string) {
    const pool = await this.init();
    await pool.query("DELETE FROM kv WHERE kind = $1 AND id = $2", [kind, id]);
  }

  getPeople() {
    return this.list<Person>("person");
  }
  getPerson(id: string) {
    return this.get<Person>("person", id);
  }
  putPerson(p: Person) {
    return this.put("person", p.id, p);
  }
  async deletePerson(id: string) {
    await this.del("person", id);
    const dates = await this.getDates();
    for (const d of dates) if (d.personAId === id || d.personBId === id) await this.del("date", d.id);
  }
  getDates() {
    return this.list<DateRecord>("date");
  }
  getDate(id: string) {
    return this.get<DateRecord>("date", id);
  }
  putDate(d: DateRecord) {
    return this.put("date", d.id, d);
  }
  deleteDate(id: string) {
    return this.del("date", id);
  }
  async getMeta() {
    return (await this.get<DbShape["meta"]>("meta", "meta")) ?? emptyDb().meta;
  }
  putMeta(meta: DbShape["meta"]) {
    return this.put("meta", "meta", meta);
  }
  async exportAll(): Promise<DbShape> {
    const [people, dates, meta] = await Promise.all([this.getPeople(), this.getDates(), this.getMeta()]);
    return {
      people: Object.fromEntries(people.map((p) => [p.id, p])),
      dates: Object.fromEntries(dates.map((d) => [d.id, d])),
      meta,
    };
  }
  async importAll(db: DbShape) {
    await this.reset();
    for (const p of Object.values(db.people ?? {})) await this.putPerson(p);
    for (const d of Object.values(db.dates ?? {})) await this.putDate(d);
    await this.putMeta({ ...emptyDb().meta, ...(db.meta ?? {}) });
  }
  async reset() {
    const pool = await this.init();
    await pool.query("DELETE FROM kv");
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __agenticDatingStore: Store | undefined;
}

export function getStore(): Store {
  if (!globalThis.__agenticDatingStore) {
    const url = process.env.DATABASE_URL?.trim();
    globalThis.__agenticDatingStore = url
      ? new PgStore(url)
      : new FileStore(path.join(process.cwd(), "data", "db.json"));
    console.log(`[store] using ${url ? "postgres" : "file"} store`);
  }
  return globalThis.__agenticDatingStore;
}

export function pairKey(a: string, b: string) {
  return [a, b].sort().join("__");
}
