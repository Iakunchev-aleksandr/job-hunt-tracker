import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as db from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(path.join(__dirname, "..", "seed.json"), "utf8"));

for (const f of seed.fairs) await db.upsertFair(f);
for (const c of seed.companies) await db.upsertCompany(c);
for (const e of seed.events) await db.addEvent(e);
for (const t of seed.tasks) await db.upsertTask(t.text, t.due ?? null);
for (const n of seed.notes) await db.upsertNote(n.key, n.text);

console.log(`seeded: ${seed.fairs.length} fairs, ${seed.companies.length} companies, ${seed.events.length} events, ${seed.tasks.length} tasks, ${seed.notes.length} notes`);
await db.pool.end();
