import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { loadConfig, redactedConfig } from "./config/env.js";
import { createDatabase, checkDatabase } from "./db/client.js";
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
    const ready = !database.pool || databaseStatus.reachable;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      database: databaseStatus,
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

if (process.env.NODE_ENV !== "test") {
  const { app, config } = createApp();
  app.listen(config.PORT, "0.0.0.0", () =>
    log("info", "server.started", { ...redactedConfig(config) }),
  );
}
