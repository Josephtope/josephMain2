import { loadConfig } from "../config/env.js";
import { checkDatabase, createDatabase } from "../db/client.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const { pool } = createDatabase(config);
  const result = await checkDatabase(pool);
  if (!result.configured) {
    console.error("DATABASE_URL is not configured");
    process.exitCode = 1;
  } else if (!result.reachable) {
    console.error("Database is configured but unreachable");
    process.exitCode = 1;
  } else {
    console.log("Database is reachable");
  }
  await pool?.end();
}

void main();
