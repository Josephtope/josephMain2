import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import type { AppConfig } from "../config/env.js";
import * as schema from "./schema.js";

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
  return { db: drizzle(pool, { mode: "default", schema }), pool };
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

export async function checkSchemaVersion(
  pool: mysql.Pool | undefined,
  expectedVersion: string,
): Promise<{ configured: boolean; verified: boolean }> {
  if (!pool) return { configured: false, verified: false };
  try {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT version FROM schema_metadata WHERE version = ? LIMIT 1",
      [expectedVersion],
    );
    return { configured: true, verified: rows.length === 1 };
  } catch {
    return { configured: true, verified: false };
  }
}
