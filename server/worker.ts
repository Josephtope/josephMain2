import { loadConfig, redactedConfig } from "./config/env.js";
import { createDatabase } from "./db/client.js";
import { log } from "./http/logger.js";

export function createWorkerRuntime() {
  const config = loadConfig();
  const database = createDatabase(config);
  return { config, database };
}

if (process.env.NODE_ENV !== "test") {
  const runtime = createWorkerRuntime();
  log("info", "worker.initialized", {
    ...redactedConfig(runtime.config),
    httpListener: false,
  });
  // Job leasing/execution begins in a later phase after the schema and migrations exist.
}
