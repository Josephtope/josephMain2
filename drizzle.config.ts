import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dialect: "mysql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "mysql://root:root@127.0.0.1:3306/stealth_mail_studio",
  },
  strict: true,
  verbose: true,
});
