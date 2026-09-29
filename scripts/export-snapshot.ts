/** Write the current database to data/snapshot.json so a fresh deploy boots with the finished demo. */
import fs from "node:fs";
import { loadEnv } from "../lib/env";

async function main() {
  loadEnv();
  const { getStore } = await import("../lib/store");
  const db = await getStore().exportAll();
  fs.writeFileSync("data/snapshot.json", JSON.stringify(db, null, 2));
  console.log(`Wrote data/snapshot.json (${Object.keys(db.people).length} people, ${Object.keys(db.dates).length} dates)`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
