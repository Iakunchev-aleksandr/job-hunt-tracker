import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as db from "./db.js";

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").nullable().optional();

export function createMcpServer() {
  const s = new McpServer({ name: "shukatsu-tracker", version: "1.0.0" });

  // ---- fairs ----
  s.registerTool("list_fairs", {
    title: "Список ярмарок",
    description: "Ярмарки/события. filter: all | registered | unregistered",
    inputSchema: { filter: z.enum(["all", "registered", "unregistered"]).optional() },
  }, async ({ filter }) => text(await db.listFairs(filter ?? "all")));

  s.registerTool("upsert_fair", {
    title: "Добавить/обновить ярмарку",
    description: "Создаёт или обновляет ярмарку по name. Пустые поля не затирают существующие.",
    inputSchema: {
      name: z.string(),
      date: dateStr,
      format: z.enum(["online", "offline"]).nullable().optional(),
      place: z.string().nullable().optional(),
      reg_url: z.string().nullable().optional(),
      reg_deadline: dateStr,
      conditions: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      registered: z.boolean().nullable().optional(),
    },
  }, async (f) => text(await db.upsertFair(f)));

  s.registerTool("set_registered", {
    title: "Отметить регистрацию на ярмарку",
    description: "registered=true, когда пользователь зарегистрировался (например, пришло письмо-подтверждение).",
    inputSchema: { name: z.string(), registered: z.boolean() },
  }, async ({ name, registered }) => text((await db.setRegistered(name, registered)) ?? { error: "fair not found" }));

  // ---- companies ----
  s.registerTool("list_companies", {
    title: "Список компаний",
    description: "Компании с последними событиями. status: todo | waiting | interview | offer | rejected",
    inputSchema: { status: z.enum(["todo", "waiting", "interview", "offer", "rejected"]).optional() },
  }, async ({ status }) => text(await db.listCompanies(status)));

  s.registerTool("upsert_company", {
    title: "Добавить/обновить компанию",
    description: "aliases — другие написания (キューズフィックス, Q'sfix). domains — почтовые домены компании И агентств/площадок, пишущих от её имени (для агрегации писем).",
    inputSchema: {
      name: z.string(),
      aliases: z.array(z.string()).optional(),
      domains: z.array(z.string()).optional(),
      status: z.enum(["todo", "waiting", "interview", "offer", "rejected"]).nullable().optional(),
      stage: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    },
  }, async (c) => text(await db.upsertCompany(c)));

  s.registerTool("find_company", {
    title: "Найти компанию по имени/алиасу/домену",
    description: "Используй, чтобы понять, к какой компании относится письмо (по домену отправителя или названию).",
    inputSchema: { query: z.string() },
  }, async ({ query }) => text((await db.findCompany(query)) ?? { found: false }));

  // ---- events (письма / выжимки) ----
  s.registerTool("add_event", {
    title: "Добавить событие/выжимку письма",
    description: "Краткая выжимка письма или события по компании. Если компании нет — создаётся. source: direct | mynavi | rikunabi | jetro | other. action_required=true, если от пользователя требуется действие; due — срок.",
    inputSchema: {
      company: z.string(),
      source: z.string().nullable().optional(),
      date: dateStr,
      summary: z.string(),
      action_required: z.boolean().optional(),
      due: dateStr,
    },
  }, async (e) => text(await db.addEvent(e)));

  // ---- tasks ----
  s.registerTool("list_tasks", {
    title: "Список задач", description: "done: true/false (по умолчанию все)",
    inputSchema: { done: z.boolean().optional() },
  }, async ({ done }) => text(await db.listTasks(done)));

  s.registerTool("upsert_task", {
    title: "Добавить/обновить задачу", description: "По совпадению текста обновляет срок, иначе создаёт.",
    inputSchema: { text: z.string(), due: dateStr },
  }, async ({ text: t, due }) => text(await db.upsertTask(t, due)));

  s.registerTool("set_task_done", {
    title: "Отметить задачу", description: "",
    inputSchema: { id: z.number().int(), done: z.boolean() },
  }, async ({ id, done }) => text((await db.setTaskDone(id, done)) ?? { error: "task not found" }));

  // ---- notes ----
  s.registerTool("get_notes", { title: "Заметки (виза и т.п.)", description: "", inputSchema: {} },
    async () => text(await db.getNotes()));

  s.registerTool("upsert_note", {
    title: "Записать заметку", description: "key например: visa, jlpt, strategy",
    inputSchema: { key: z.string(), text: z.string() },
  }, async ({ key, text: t }) => text(await db.upsertNote(key, t)));

  // ---- summary ----
  s.registerTool("get_summary", {
    title: "Полная сводка", description: "Всё сразу: напоминания, ярмарки, компании, задачи, заметки.",
    inputSchema: {},
  }, async () => text(await db.summary()));

  return s;
}
