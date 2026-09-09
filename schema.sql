-- 就活 tracker schema (Postgres / Neon)

create table if not exists fairs (
  id           serial primary key,
  name         text not null unique,
  date         date,
  format       text,                  -- 'online' | 'offline'
  place        text,
  reg_url      text,
  reg_deadline date,
  conditions   text,
  registered   boolean not null default false,
  notes        text,
  updated_at   timestamptz not null default now()
);

create table if not exists companies (
  id            serial primary key,
  name          text not null unique,
  aliases       text[] not null default '{}',   -- другие написания: キューズフィックス, Q'sfix ...
  domains       text[] not null default '{}',   -- почтовые домены компании / агентства
  status        text not null default 'todo',   -- todo | waiting | interview | offer | rejected
  stage         text,                           -- 書類選考 / 一次面接 / ...
  notes         text,
  last_event_at timestamptz,
  updated_at    timestamptz not null default now()
);

create table if not exists events (
  id              serial primary key,
  company_id      int references companies(id) on delete cascade,
  source          text,                         -- direct | mynavi | rikunabi | jetro | other
  date            date not null default current_date,
  summary         text not null,                -- краткая выжимка письма/события
  action_required boolean not null default false,
  due             date,
  created_at      timestamptz not null default now()
);

create table if not exists tasks (
  id         serial primary key,
  text       text not null,
  due        date,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists notes (
  key        text primary key,                  -- 'visa', 'jlpt', ...
  text       text not null,
  updated_at timestamptz not null default now()
);

create index if not exists events_company_idx on events(company_id, date desc);
