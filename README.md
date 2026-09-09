# 就活 tracker

Личный трекер поиска работы. Claude (в чате, на подписке — без API-токенов) пишет в базу через MCP-коннектор; ты читаешь всё в веб-приложении с телефона.

- **Сервер:** Node.js / TypeScript, Express 5
- **MCP:** Streamable HTTP (stateless), authless + секретный сегмент в URL
- **БД:** Postgres (Neon, free)
- **Хостинг:** Render (free)
- **Фронт:** один `public/index.html`, без зависимостей

---

## Что умеет

| Раздел | Что показывает |
|---|---|
| Напоминания | регистрация на ярмарку закрывается, ярмарка через N дней, задачи с дедлайном, письма с `action_required` |
| Ярмарки | список с фильтром **зареган / не зареган**, условия, дедлайн, ссылка |
| Компании | статус, этап, последние выжимки писем; отказы свёрнуты |
| Задачи | с дедлайнами |
| Заметки | виза, стратегия, профиль |

MCP-инструменты (их вызывает Claude): `list_fairs` `upsert_fair` `set_registered` `list_companies` `upsert_company` `find_company` `add_event` `list_tasks` `upsert_task` `set_task_done` `get_notes` `upsert_note` `get_summary`

`find_company` умеет искать по **email-адресу отправителя** (`hr@tamats.co.jp` → タマテクノシステム) через поле `domains` — так письма от разных людей/агентств одной компании собираются в одну карточку.

---

## Деплой — 10 минут

### 1. Neon (база) — 2 мин
1. https://neon.tech → New project (регион Asia/Singapore или Tokyo).
2. Скопируй **Connection string** (`postgresql://...?sslmode=require`).
3. В Neon → **SQL Editor** → вставь содержимое `schema.sql` → Run.

### 2. GitHub — 1 мин
```bash
git init && git add . && git commit -m "init"
# создай пустой репозиторий на GitHub, затем:
git remote add origin https://github.com/<you>/shukatsu-tracker.git
git push -u origin main
```
`.env` в `.gitignore` — секреты в репозиторий не попадут.

### 3. Render (сервер) — 5 мин
1. https://render.com → **New → Web Service** → подключи репозиторий.
2. Настройки:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Instance: **Free**
3. **Environment** → добавь:
   - `DATABASE_URL` = строка из Neon
   - `MCP_SECRET` = длинная случайная строка (≥32 символов). Сгенерировать: `openssl rand -hex 24`
4. Deploy. Адрес будет вида `https://shukatsu-tracker.onrender.com`.

Проверка: открой `https://<app>.onrender.com/healthz` → `ok`, потом `https://<app>.onrender.com/` → приложение (пока пустое).

> ⚠️ Free-инстанс Render «засыпает» без трафика. Первый запрос после паузы отвечает ~30–50 сек — это нормально. Приложение само предупредит.

### 4. Залить стартовые данные — 1 мин
Локально, один раз:
```bash
cp .env.example .env      # впиши DATABASE_URL и MCP_SECRET
npm install
npm run seed
```
Появятся ярмарки, компании, задачи и заметки из `seed.json`.

### 5. Подключить коннектор в claude.ai — 1 мин
**С компьютера** (с телефона добавить нельзя, только пользоваться):
1. claude.ai → Settings → **Connectors** → **Add custom connector**.
2. Name: `就活 tracker`
3. URL: `https://<app>.onrender.com/mcp/<MCP_SECRET>`
4. OAuth-поля оставь пустыми → Connect.

Если увидишь ошибку про OAuth/registration — это известная нестабильность authless-серверов в claude.ai; напиши мне, добавлю минимальный OAuth.

---

## Как пользоваться

В чате с Claude (коннектор включён):
- «получил отказ от マルチプル» → `upsert_company(status=rejected)`
- «пришло письмо от 山田様, начинают 書類選考, ответ через неделю» → `add_event(action_required, due)`
- «зарегистрировался на JETRO» → `set_registered`
- «что нового по ярмаркам?» → Claude ищет в вебе → `upsert_fair`
- «обнови» → Claude разбирает (при подключённом Gmail) почту, фильтрует по `domains`/`aliases`, делает выжимки → `add_event`

Ты просто открываешь `https://<app>.onrender.com/` на телефоне.

---

## Локальная разработка
```bash
cp .env.example .env
npm install
npm run db:init   # применить schema.sql
npm run seed
npm run dev       # http://localhost:3000
```

## Структура
```
src/server.ts    Express: /mcp/<secret>, /api/summary, статика
src/mcp.ts       MCP-сервер и инструменты
src/db.ts        запросы к Postgres, расчёт напоминаний
src/db-init.ts   применить schema.sql
src/seed.ts      залить seed.json
schema.sql       схема БД
seed.json        стартовые данные
public/index.html фронт
```

## Безопасность
- Секрет в URL — никому не показывай ссылку коннектора.
- `/api/summary` публичный (только чтение). Если нужно закрыть — скажи, добавлю пароль/basic-auth.
- Личные данные (виза, контакты) лежат в БД Neon под твоим аккаунтом.
