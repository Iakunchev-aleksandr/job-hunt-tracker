import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp.js";
import * as db from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const SECRET = process.env.MCP_SECRET;
if (!SECRET || SECRET.length < 16) throw new Error("MCP_SECRET must be set (>=16 chars)");

const app = express();
app.use(express.json({ limit: "1mb" }));

// ---------- MCP endpoint (stateless Streamable HTTP) ----------
// Claude.ai подключается к https://<host>/mcp/<MCP_SECRET>
const mcpPath = `/mcp/${SECRET}`;

app.post(mcpPath, async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP error", err);
    if (!res.headersSent) res.status(500).json({ error: "internal error" });
  }
});
// stateless: GET/DELETE не поддерживаем
app.get(mcpPath, (_req, res) => { res.status(405).end(); });
app.delete(mcpPath, (_req, res) => { res.status(405).end(); });

// любые другие /mcp/* — 404 без подсказок
app.all(/^\/mcp(\/.*)?$/, (_req, res) => { res.status(404).end(); });

// ---------- read-only API for the web UI ----------
app.get("/api/summary", async (_req, res) => {
  try { res.json(await db.summary()); }
  catch (e) { console.error(e); res.status(500).json({ error: "db error" }); }
});

app.get("/healthz", (_req, res) => { res.send("ok"); });

// ---------- static UI ----------
app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`listening on :${PORT}`);
  console.log(`MCP endpoint: POST /mcp/<secret>`);
});
