import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { loadConfig, redactedConfig } from "./config/env.js";
import {
  checkDatabase,
  checkSchemaVersion,
  createDatabase,
} from "./db/client.js";
import { installErrorHandler, installMiddleware } from "./http/middleware.js";
import { log } from "./http/logger.js";
import { createAuthContext } from "./security/auth-context.js";
import { appRouter } from "./routers.js";

export function createApp() {
  const config = loadConfig();
  const app = express();
  const database = createDatabase(config);
  installMiddleware(app, config);

  app.get("/api/health", (_req, res) =>
    res.status(200).json({
      status: "ok",
      service: "web",
      uptimeSeconds: Math.floor(process.uptime()),
    }),
  );
  app.get("/api/ready", async (_req, res) => {
    const databaseStatus = await checkDatabase(database.pool);
    const schemaStatus = database.pool
      ? await checkSchemaVersion(database.pool, config.EXPECTED_SCHEMA_VERSION)
      : { configured: false, verified: false };
    const ready =
      !database.pool || (databaseStatus.reachable && schemaStatus.verified);
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      database: databaseStatus,
      schema: schemaStatus,
    });
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: ({ req }) => createAuthContext(req),
    }),
  );
  installErrorHandler(app);
  return { app, config, database };
}

async function start(): Promise<void> {
  const { app, config, database } = createApp();
  if (database.pool) {
    const schemaStatus = await checkSchemaVersion(
      database.pool,
      config.EXPECTED_SCHEMA_VERSION,
    );
    if (!schemaStatus.verified) {
      await database.pool.end();
      throw new Error(
        `Required database schema version is not applied: ${config.EXPECTED_SCHEMA_VERSION}`,
      );
    }
  }
  app.listen(config.PORT, "0.0.0.0", () =>
    log("info", "server.started", { ...redactedConfig(config) }),
  );
}

if (process.env.NODE_ENV !== "test") void start();
