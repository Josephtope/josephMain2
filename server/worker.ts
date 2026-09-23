import { randomUUID } from "node:crypto";
import { loadConfig, redactedConfig } from "./config/env.js";
import { checkSchemaVersion, createDatabase } from "./db/client.js";
import { runWorkerOnce, WorkerRateLimiter } from "./gmail-worker.js";
import { log } from "./http/logger.js";

export function createWorkerRuntime() {
  const config = loadConfig();
  const database = createDatabase(config);
  return { config, ...database };
}

export async function startWorker(
  options: {
    config?: ReturnType<typeof loadConfig>;
    database?: ReturnType<typeof createDatabase>;
    workerId?: string;
    pollIntervalMs?: number;
    maxIterations?: number;
  } = {},
): Promise<void> {
  const config = options.config ?? loadConfig();
  const database = options.database ?? createDatabase(config);
  const workerId =
    options.workerId ?? process.env.WORKER_ID ?? `worker-${randomUUID()}`;
  const pollIntervalMs =
    options.pollIntervalMs ??
    Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1000);
  const maxIterations = options.maxIterations ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 50)
    throw new Error("Invalid WORKER_POLL_INTERVAL_MS");
  if (!database.db || !database.pool)
    throw new Error("DATABASE_URL is required for the worker");
  const schemaStatus = await checkSchemaVersion(
    database.pool,
    config.EXPECTED_SCHEMA_VERSION,
  );
  if (!schemaStatus.verified)
    throw new Error(
      `Required database schema version is not applied: ${config.EXPECTED_SCHEMA_VERSION}`,
    );
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  log("info", "worker.initialized", {
    ...redactedConfig(config),
    httpListener: false,
    workerId,
  });
  const rateLimiter = new WorkerRateLimiter(
    Number(process.env.WORKER_MIN_INTERVAL_MS ?? 1000),
  );
  let iteration = 0;
  try {
    while (!stopping && iteration < maxIterations) {
      const metrics = await runWorkerOnce(config, database.db, workerId, {
        rateLimiter,
      });
      log("info", "worker.tick", { workerId, ...metrics });
      iteration += 1;
      if (!stopping && iteration < maxIterations)
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    await database.pool.end();
    log("info", "worker.stopped", { workerId });
  }
}

if (process.env.NODE_ENV !== "test")
  void startWorker().catch((error: unknown) => {
    log("error", "worker.failed", {
      error: error instanceof Error ? error.message : "worker_failed",
    });
    process.exitCode = 1;
  });
