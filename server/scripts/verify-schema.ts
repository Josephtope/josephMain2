import mysql from "mysql2/promise";

const expectedTables = [
  "audit_events",
  "campaign_leads",
  "campaigns",
  "google_connections",
  "jobs",
  "leads",
  "login_exchange_codes",
  "oauth_login_states",
  "outreach_logs",
  "schema_metadata",
  "sessions",
  "sheet_bindings",
  "templates",
  "users",
  "workspace_controls",
] as const;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const expectedVersion =
    process.env.EXPECTED_SCHEMA_VERSION ?? "phase4-baseline";
  if (!url) throw new Error("DATABASE_URL is required for schema verification");

  const pool = mysql.createPool({ uri: url, connectionLimit: 2 });
  try {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE()",
    );
    const actualTables = new Set(rows.map((row) => String(row.tableName)));
    const missingTables = expectedTables.filter(
      (table) => !actualTables.has(table),
    );
    if (missingTables.length > 0) {
      throw new Error(
        `Schema verification failed: missing tables ${missingTables.join(", ")}`,
      );
    }

    const [versionRows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT version FROM schema_metadata WHERE version = ? LIMIT 1",
      [expectedVersion],
    );
    if (versionRows.length !== 1) {
      throw new Error(
        `Schema verification failed: expected version ${expectedVersion} is not applied`,
      );
    }

    console.log(
      JSON.stringify({
        ok: true,
        expectedVersion,
        tableCount: actualTables.size,
        requiredTableCount: expectedTables.length,
      }),
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Schema verification failed",
  );
  process.exitCode = 1;
});
