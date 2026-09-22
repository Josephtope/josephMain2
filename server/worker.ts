import { loadConfig, redactedConfig } from "./config/env.js";
import { checkSchemaVersion, createDatabase } from "./db/client.js";
import { log } from "./http/logger.js";

export function createWorkerRuntime() {
  const config = loadConfig();
  const database = createDatabase(config);
  return { config, database };
}

async function start(): Promise<void> {
  const runtime = createWorkerRuntime();
  if (runtime.database.pool) {
    const schemaStatus = await checkSchemaVersion(
      runtime.database.pool,
      runtime.config.EXPECTED_SCHEMA_VERSION,
    );
    if (!schemaStatus.verified) {
      await runtime.database.pool.end();
      throw new Error(
        `Required database schema version is not applied: ${runtime.config.EXPECTED_SCHEMA_VERSION}`,
      );
    }
  }
  log("info", "worker.initialized", {
    ...redactedConfig(runtime.config),
    httpListener: false,
  });
  // Job leasing/execution begins in a later phase after the schema and migrations exist.
}

if (process.env.NODE_ENV !== "test") void start();
