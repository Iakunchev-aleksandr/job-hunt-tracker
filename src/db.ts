import pg from "pg";

const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

export const q = (text: string, params: any[] = []): Promise<any[]> =>
  pool.query(text, params).then((r) => r.rows);

// ---------- fairs ----------
export async function listFairs(filter: "all" | "registered" | "unregistered" = "all") {
  const where = filter === "registered" ? "where registered" : filter === "unregistered" ? "where not registered" : "";
  return q(`select * from fairs ${where} order by date nulls last, name`);
}

export async function upsertFair(f: {
  name: string; date?: string | null; format?: string | null; place?: string | null;
  reg_url?: string | null; reg_deadline?: string | null; conditions?: string | null;
  notes?: string | null; registered?: boolean | null;
}) {
  const rows = await q(
    `insert into fairs (name, date, format, place, reg_url, reg_deadline, conditions, notes, registered)
     values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9,false))
     on conflict (name) do update set
       date         = coalesce(excluded.date, fairs.date),
       format       = coalesce(excluded.format, fairs.format),
       place        = coalesce(excluded.place, fairs.place),
       reg_url      = coalesce(excluded.reg_url, fairs.reg_url),
       reg_deadline = coalesce(excluded.reg_deadline, fairs.reg_deadline),
       conditions   = coalesce(excluded.conditions, fairs.conditions),
       notes        = coalesce(excluded.notes, fairs.notes),
       registered   = coalesce($9, fairs.registered),
       updated_at   = now()
     returning *`,
    [f.name, f.date ?? null, f.format ?? null, f.place ?? null, f.reg_url ?? null,
     f.reg_deadline ?? null, f.conditions ?? null, f.notes ?? null, f.registered ?? null],
  );
  return rows[0];
}

export async function setRegistered(name: string, registered: boolean) {
  const rows = await q(
    `update fairs set registered=$2, updated_at=now() where lower(name)=lower($1) returning *`,
    [name, registered],
  );
  return rows[0] ?? null;
}

// ---------- companies ----------
export async function findCompany(nameOrAliasOrEmail: string) {
  const raw = nameOrAliasOrEmail.trim().toLowerCase();
  // если пришёл email — берём домен после @
  const dom = raw.includes("@") ? raw.split("@").pop()! : raw;
  const rows = await q(`select * from companies`);
  return rows.find((c) => {
    const names = [c.name, ...(c.aliases ?? [])].map((x: string) => x.toLowerCase());
    if (names.includes(raw)) return true;
    const domains = (c.domains ?? []).map((x: string) => x.toLowerCase());
    return domains.some((d: string) => dom === d || dom.endsWith("." + d));
  }) ?? null;
}

export async function listCompanies(status?: string) {
  const companies = await q(
    `select * from companies ${status ? "where status=$1" : ""} order by name`,
    status ? [status] : [],
  );
  const events = await q(`select * from events order by date desc, id desc`);
  const byCompany = new Map<number, any[]>();
  for (const e of events) {
    const arr = byCompany.get(e.company_id) ?? [];
    if (arr.length < 5) arr.push(e);
    byCompany.set(e.company_id, arr);
  }
  const rank: Record<string, number> = { interview: 0, offer: 0, waiting: 1, todo: 2, rejected: 3 };
  return companies
    .map((c) => ({ ...c, events: byCompany.get(c.id) ?? [] }))
    .sort((a, b) =>
      (rank[a.status] ?? 2) - (rank[b.status] ?? 2) ||
      (new Date(b.last_event_at ?? 0).getTime() - new Date(a.last_event_at ?? 0).getTime()) ||
      a.name.localeCompare(b.name));
}

export async function upsertCompany(c: {
  name: string; aliases?: string[]; domains?: string[]; status?: string | null;
  stage?: string | null; notes?: string | null;
}) {
  const uniq = (a: string[]) => [...new Set(a.map((x) => x.trim()).filter(Boolean))];
  const existing = (await q(`select * from companies where lower(name)=lower($1)`, [c.name]))[0];
  if (existing) {
    const rows = await q(
      `update companies set aliases=$2, domains=$3, status=$4, stage=$5, notes=$6, updated_at=now()
       where id=$1 returning *`,
      [existing.id,
       uniq([...(existing.aliases ?? []), ...(c.aliases ?? [])]),
       uniq([...(existing.domains ?? []), ...(c.domains ?? [])]),
       c.status ?? existing.status,
       c.stage ?? existing.stage,
       c.notes ?? existing.notes],
    );
    return rows[0];
  }
  const rows = await q(
    `insert into companies (name, aliases, domains, status, stage, notes)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [c.name, uniq(c.aliases ?? []), uniq(c.domains ?? []), c.status ?? "todo", c.stage ?? null, c.notes ?? null],
  );
  return rows[0];
}

// ---------- events ----------
export async function addEvent(e: {
  company: string; source?: string | null; date?: string | null; summary: string;
  action_required?: boolean; due?: string | null;
}) {
  let company = await findCompany(e.company);
  if (!company) company = await upsertCompany({ name: e.company, status: "waiting" });
  const rows = await q(
    `insert into events (company_id, source, date, summary, action_required, due)
     values ($1,$2,coalesce($3::date,current_date),$4,coalesce($5,false),$6) returning *`,
    [company.id, e.source ?? null, e.date ?? null, e.summary, e.action_required ?? false, e.due ?? null],
  );
  await q(`update companies set last_event_at=now(), updated_at=now() where id=$1`, [company.id]);
  return { company: company.name, event: rows[0] };
}

// ---------- tasks ----------
export const listTasks = (done?: boolean) =>
  q(`select * from tasks ${done === undefined ? "" : "where done=$1"} order by done, due nulls last, id`,
    done === undefined ? [] : [done]);

export async function upsertTask(text: string, due?: string | null) {
  const existing = await q(`select * from tasks where lower(text)=lower($1) limit 1`, [text]);
  if (existing[0]) {
    const rows = await q(`update tasks set due=coalesce($2,due) where id=$1 returning *`, [existing[0].id, due ?? null]);
    return rows[0];
  }
  const rows = await q(`insert into tasks (text, due) values ($1,$2) returning *`, [text, due ?? null]);
  return rows[0];
}

export const setTaskDone = (id: number, done: boolean) =>
  q(`update tasks set done=$2 where id=$1 returning *`, [id, done]).then((r) => r[0] ?? null);

// ---------- notes ----------
export const getNotes = () => q(`select * from notes order by key`);
export const upsertNote = (key: string, text: string) =>
  q(`insert into notes (key,text) values ($1,$2)
     on conflict (key) do update set text=excluded.text, updated_at=now() returning *`, [key, text])
    .then((r) => r[0]);

// ---------- summary (for the web UI) ----------
export async function summary() {
  const [fairs, companies, tasks, notes] = await Promise.all([
    listFairs("all"), listCompanies(), listTasks(), getNotes(),
  ]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = (d: string | Date | null) =>
    d ? Math.round((new Date(d).getTime() - today.getTime()) / 86400000) : null;
  const iso = (d: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

  const reminders: { level: "urgent" | "soon"; text: string }[] = [];
  for (const f of fairs) {
    const rd = days(f.reg_deadline), fd = days(f.date);
    if (!f.registered && rd !== null && rd >= 0 && rd <= 10)
      reminders.push({ level: rd <= 3 ? "urgent" : "soon", text: `Регистрация «${f.name}» закрывается через ${rd} дн.` });
    if (fd !== null && fd >= 0 && fd <= 3)
      reminders.push({ level: "urgent", text: `«${f.name}» — через ${fd} дн.${f.registered ? "" : " (НЕ зарегистрирован)"}` });
  }
  for (const t of tasks) {
    const d = days(t.due);
    if (!t.done && d !== null && d <= 7)
      reminders.push({ level: d <= 2 ? "urgent" : "soon", text: `Задача: ${t.text}${d < 0 ? " (просрочено)" : ` — через ${d} дн.`}` });
  }
for (const c of companies) {
  if (c.status === "rejected") continue;   // ← добавить эту строку
  for (const e of c.events ?? []) {    const d = days(e.due);
    if (e.action_required && (d === null || d <= 7))
      reminders.push({ level: d !== null && d <= 2 ? "urgent" : "soon", text: `${c.name}: ${e.summary}${d !== null ? ` (до ${iso(e.due)})` : ""}` });
  }
  reminders.sort((a, b) => (a.level === b.level ? 0 : a.level === "urgent" ? -1 : 1));
const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
return { today: localToday, reminders, fairs, companies, tasks, notes };}
                      }
