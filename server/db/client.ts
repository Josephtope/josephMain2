import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import type { AppConfig } from "../config/env.js";

export type Database = ReturnType<typeof drizzle>;

export function createDatabase(config: AppConfig): {
  db?: Database;
  pool?: mysql.Pool;
} {
  if (!config.DATABASE_URL) return {};
  const pool = mysql.createPool({
    uri: config.DATABASE_URL,
    connectionLimit: 5,
    enableKeepAlive: true,
  });
  return { db: drizzle(pool), pool };
}

export async function checkDatabase(
  pool: mysql.Pool | undefined,
): Promise<{ configured: boolean; reachable: boolean }> {
  if (!pool) return { configured: false, reachable: false };
  try {
    await pool.query("SELECT 1");
    return { configured: true, reachable: true };
  } catch {
    return { configured: true, reachable: false };
  }
}
