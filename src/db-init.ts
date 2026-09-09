import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
await pool.query(sql);
console.log("schema applied");
await pool.end();
