import cors from "cors";
import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import helmet from "helmet";
import type { AppConfig } from "../config/env.js";
import { errorCategory, log } from "./logger.js";
import { randomUUID } from "node:crypto";

export function installMiddleware(app: Express, config: AppConfig): void {
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "64kb" }));
  app.use(express.urlencoded({ extended: false, limit: "16kb" }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.allowedOrigins.includes(origin))
          return callback(null, true);
        return callback(new Error("Request origin is not allowed"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  app.use((req, res, next) => {
    const requestId = req.header("x-request-id")?.slice(0, 100) || randomUUID();
    res.setHeader("x-request-id", requestId);
    (req as Request & { requestId: string }).requestId = requestId;
    log("info", "request.started", {
      requestId,
      method: req.method,
      path: req.path,
    });
    res.on("finish", () =>
      log("info", "request.finished", {
        requestId,
        statusCode: res.statusCode,
      }),
    );
    next();
  });
}

export function installErrorHandler(app: Express): void {
  app.use(
    (
      error: unknown,
      req: Request & { requestId?: string },
      res: Response,
      _next: NextFunction,
    ) => {
      const category = errorCategory(error);
      log("error", "request.failed", { requestId: req.requestId, category });
      const status =
        category === "request" ? 400 : category === "database" ? 503 : 500;
      res.status(status).json({
        error: {
          code: category === "request" ? "BAD_REQUEST" : "INTERNAL_ERROR",
          message:
            status === 500
              ? "An internal error occurred"
              : category === "database"
                ? "Database unavailable"
                : "Invalid request",
          requestId: req.requestId,
        },
      });
    },
  );
}
