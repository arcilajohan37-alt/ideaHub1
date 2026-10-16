import { defineConfig } from "drizzle-kit";

// D1 nativo (SQLite). Las migraciones se generan aquí y se aplican con:
//   npm run db:migrate:local   (wrangler d1 migrations apply --local)
//   npm run db:migrate:remote  (wrangler d1 migrations apply --remote)
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
