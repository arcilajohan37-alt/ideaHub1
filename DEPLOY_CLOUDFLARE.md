# Despliegue en Cloudflare Workers + D1 nativo

Esta app es **Next.js 16** adaptada con **@opennextjs/cloudflare** y base de datos
**Cloudflare D1** (SQLite) vía binding `DB` + `drizzle-orm/d1`.
No hay Postgres, ni connection strings, ni secretos de base de datos.

## Cómo está cableada la DB

- `src/db/schema.ts`: esquema Drizzle en `sqlite-core`
  (IDs `TEXT` con UUID v4 generado en la app, JSON en `TEXT` modo json,
  fechas en `INTEGER` modo `timestamp_ms`, dinero en `TEXT`, booleanos en
  `INTEGER` modo boolean).
- `src/db/index.ts`: `getDb()` resuelve el binding con
  `getCloudflareContext({ async: true })` y devuelve `drizzle(env.DB)`.
  Se llama **por request** (Server Components, Server Actions, Routes);
  nunca a nivel de módulo (en build no hay contexto).
- `src/db/seed.ts`: `seedDatabase(db)` reutilizable (auto-seed opt-in).
- `scripts/seed.sql`: mismo seed en SQL plano para `wrangler d1 execute`.
- `drizzle/0000_*.sql`: migración inicial SQLite (generada con drizzle-kit).
- `wrangler.jsonc`: `d1_databases: [{ binding: "DB", ... }]`.
  `cloudflare-env.d.ts` está generado con `npm run cf-typegen`.
- Búsqueda: SQLite no tiene `ilike`; se usa `like`
  (case-insensitive para ASCII, suficiente para este MVP).

## 1. Crear la base de datos D1 (una vez)

```bash
npx wrangler login
npm run d1:create   # = npx wrangler d1 create ideahub-mvp
```

Copia el `database_id` que imprime y pégalo en `wrangler.jsonc`
(reemplaza los ceros), luego regenera tipos:

```bash
npm run cf-typegen
```

## 2. Crear tablas y seed

Local (persistido en `.wrangler/state`, no necesita login):

```bash
npm run db:migrate:local
npm run db:seed:local
```

Remoto (requiere login + `database_id` real):

```bash
npm run db:migrate:remote
npm run db:seed:remote
```

Verificación rápida:

```bash
npx wrangler d1 execute DB --local --command="SELECT COUNT(*) AS projects FROM projects;"
```

Usuarios del seed (contraseña de los 3: `password123`):
`elena@ideahub.dev`, `carlos@ideahub.dev`, `sofia@ideahub.dev`.

## 3. Probar en runtime Workers (local)

```bash
npm run preview
# abre http://localhost:8787
# /api/health debe dar {"ok":true}
```

## 4. Desplegar

### Opción A — CLI

```bash
npx wrangler login
npm run deploy
```

Asegúrate de haber corrido `db:migrate:remote` + `db:seed:remote` una vez
antes del primer deploy. Los deploys siguientes solo necesitan migraciones
nuevas (`npm run db:generate` + `db:migrate:remote`).

### Opción B — Workers Builds (GitHub/GitLab)

- Build command: `npx @opennextjs/cloudflare build`
- Deploy command: `npx @opennextjs/cloudflare deploy`
- No hay secretos de DB que configurar. El binding D1 lo define
  `wrangler.jsonc` (la base remota debe existir y estar migrada).

## 5. Variables de entorno

| Variable | Dónde | Uso |
|---|---|---|
| `ALLOW_AUTO_SEED` | solo dev local (`.dev.vars`/shell) | `true` = seed en home; en producción **no** definir |
| — | — | D1 no usa connection strings ni secretos |

## 6. Comandos de DB disponibles

| Comando | Qué hace |
|---|---|
| `npm run db:generate` | genera SQL en `drizzle/` desde el schema |
| `npm run db:migrate:local` / `:remote` | `wrangler d1 migrations apply DB` |
| `npm run db:seed:local` / `:remote` | `wrangler d1 execute --file=./scripts/seed.sql` |
| `npm run db:studio` | Drizzle Studio |
| `npm run d1:create` | crea la base `ideahub-mvp` |

## 7. Verificación hecha

- `npm run typecheck` ✅
- `npm run build` ✅
- `npx @opennextjs/cloudflare build` ✅
- `wrangler d1 migrations apply DB --local` ✅ (13 comandos)
- `wrangler d1 execute --local --file=./scripts/seed.sql` ✅ (3 usuarios / 4 proyectos / 5 apoyos / 3 updates)
- `npm run preview` + `/api/health` ✅ (ver abajo)

## 8. Notas de la migración desde Postgres (Neon)

- Eliminado `@neondatabase/serverless` y todo rastro de Supabase
  (`src/lib/supabase/*`, auth secundario): el auth es propio
  (`bcryptjs` + cookie `ideahub_session`), funciona igual en D1.
- `numeric` → `TEXT` (montos como `"25000.00"`; la app ya hace `Number()`).
  Sin cambios en componentes ni validaciones zod.
- `uuid DEFAULT gen_random_uuid()` → `TEXT` + `crypto.randomUUID()` en app.
- `jsonb DEFAULT '[]'` → `TEXT` json + `$defaultFn(() => [])`.
- `timestamptz DEFAULT now()` → `INTEGER timestamp_ms` + `$defaultFn`.
- `.returning()` sigue funcionando (SQLite ≥ 3.35 lo soporta en D1).
