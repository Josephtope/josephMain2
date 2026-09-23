import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import type { Database } from "../db/client.js";
import { log } from "../http/logger.js";
import {
  AuthFlowError,
  authenticateSession,
  beginApplicationLogin,
  completeApplicationLogin,
  exchangeLoginCode,
  revokeSession,
} from "./service.js";
import {
  beginSenderAuthorization,
  completeSenderAuthorization,
  listSenderConnections,
  SenderAuthError,
} from "./sender-service.js";
import { verifySenderState } from "./sender-crypto.js";
import {
  SheetsError,
  bindSheet,
  importSheetLeads,
  listLeads,
  listSheetBindings,
} from "../sheets-service.js";
import {
  CampaignError,
  approveCampaign,
  createCampaign,
  createCampaignJobs,
  getWorkspaceControl,
  listCampaigns,
  listJobs,
  parseIdInput,
  setWorkspaceControl,
} from "../campaign-service.js";

const startSchema = z.object({ nativeReturnUri: z.string().min(1).max(512) });
const callbackSchema = z.object({
  code: z.string().min(1).max(4096),
  state: z.string().min(1).max(8192),
});
const senderCallbackSchema = z.object({
  code: z.string().min(1).max(4096).optional(),
  error: z.string().min(1).max(128).optional(),
  state: z.string().min(1).max(8192),
});
const exchangeSchema = z.object({
  code: z.string().min(1).max(4096),
  nativeReturnUri: z.string().min(1).max(512),
});

function credentialFromRequest(req: Request): string | undefined {
  const authorization = req.header("authorization");
  const bearer = authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (bearer) return bearer;
  return req
    .header("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("sms_session="))
    ?.slice("sms_session=".length);
}

function sendAuthError(res: Response, error: unknown, requestId?: string) {
  const authError = error instanceof AuthFlowError ? error : undefined;
  const senderError = error instanceof SenderAuthError ? error : undefined;
  const sheetsError = error instanceof SheetsError ? error : undefined;
  const campaignError = error instanceof CampaignError ? error : undefined;
  const status =
    authError?.status ??
    (senderError || sheetsError || campaignError ? 400 : 500);
  return res.status(status).json({
    error: {
      code:
        authError?.code ??
        senderError?.code ??
        sheetsError?.code ??
        campaignError?.code ??
        "internal_error",
      message:
        status >= 500
          ? "Authentication service unavailable"
          : "Authentication request could not be completed",
      requestId,
    },
  });
}

function requestId(req: Request & { requestId?: string }): string | undefined {
  return req.requestId;
}

export function installAuthRoutes(
  app: Express,
  config: AppConfig,
  database: Database | undefined,
): void {
  app.get("/api/auth/google/start", async (req, res) => {
    try {
      const input = startSchema.parse(req.query);
      const url = await beginApplicationLogin(
        config,
        database,
        input.nativeReturnUri,
      );
      res.redirect(302, url);
    } catch (error) {
      log("warn", "auth.login_start_failed", {
        requestId: requestId(req),
        stage: "start",
      });
      sendAuthError(res, error, requestId(req));
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const input = callbackSchema.parse(req.query);
      const nativeRedirect = await completeApplicationLogin(
        config,
        database,
        input,
        requestId(req),
      );
      res.redirect(302, nativeRedirect);
    } catch (error) {
      log("warn", "auth.login_callback_failed", {
        requestId: requestId(req),
        stage: "callback",
      });
      sendAuthError(res, error, requestId(req));
    }
  });

  app.post("/api/auth/login/exchange", async (req, res) => {
    try {
      const input = exchangeSchema.parse(req.body);
      const session = await exchangeLoginCode(config, database, input);
      const secure = config.NODE_ENV === "production" ? "; Secure" : "";
      res.setHeader(
        "Set-Cookie",
        `sms_session=${session.credential}; HttpOnly; SameSite=Lax; Max-Age=${config.SESSION_LIFETIME_SECONDS}; Path=/${secure}`,
      );
      res.status(200).json({
        session: {
          credential: session.credential,
          expiresAt: session.expiresAt.toISOString(),
        },
      });
    } catch (error) {
      log("warn", "auth.login_exchange_failed", {
        requestId: requestId(req),
        stage: "exchange",
      });
      sendAuthError(res, error, requestId(req));
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const credential = credentialFromRequest(req);
      if (!credential) throw new AuthFlowError("invalid_session", 401);
      const user = await authenticateSession(config, database, credential);
      res.status(200).json({ user });
    } catch (error) {
      sendAuthError(res, error, requestId(req));
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      await revokeSession(config, database, credentialFromRequest(req));
    } catch (error) {
      log("warn", "auth.logout_failed", {
        requestId: requestId(req),
        stage: "logout",
      });
    }
    res
      .setHeader(
        "Set-Cookie",
        "sms_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/",
      )
      .status(204)
      .send();
  });

  app.get("/api/auth/google/connection/start", async (req, res) => {
    try {
      const input = startSchema.parse(req.query);
      const url = await beginSenderAuthorization(
        config,
        database,
        credentialFromRequest(req),
        input.nativeReturnUri,
      );
      res.redirect(302, url);
    } catch (error) {
      log("warn", "auth.sender_start_failed", {
        requestId: requestId(req),
        stage: "start",
      });
      sendAuthError(res, error, requestId(req));
    }
  });

  app.get("/api/auth/google/connection/callback", async (req, res) => {
    let nativeReturnUri: string | undefined;
    try {
      const input = senderCallbackSchema.parse(req.query);
      const state = await verifySenderState(config, input.state);
      nativeReturnUri = state.nativeReturnUri;
      if (input.error || !input.code) {
        const redirect = new URL(nativeReturnUri);
        redirect.searchParams.set("flow", "sender");
        redirect.searchParams.set("status", "error");
        redirect.searchParams.set("code", "authorization_failed");
        res.redirect(302, redirect.toString());
        return;
      }
      const nativeRedirect = await completeSenderAuthorization(
        config,
        database,
        { code: input.code, state: input.state },
      );
      res.redirect(302, nativeRedirect);
    } catch (error) {
      log("warn", "auth.sender_callback_failed", {
        requestId: requestId(req),
        stage: error instanceof SenderAuthError ? error.code : "callback",
      });
      if (nativeReturnUri) {
        const redirect = new URL(nativeReturnUri);
        redirect.searchParams.set("flow", "sender");
        redirect.searchParams.set("status", "error");
        redirect.searchParams.set("code", "authorization_failed");
        res.redirect(302, redirect.toString());
        return;
      }
      sendAuthError(res, error, requestId(req));
    }
  });

  app.get("/api/auth/google/connections", async (req, res) => {
    try {
      const credential = credentialFromRequest(req);
      if (!credential) throw new SenderAuthError("invalid_session");
      const user = await authenticateSession(
        config,
        database,
        credential,
      ).catch(() => {
        throw new SenderAuthError("invalid_session");
      });
      res.status(200).json({
        connections: await listSenderConnections(database, user.userId),
      });
    } catch (error) {
      sendAuthError(res, error, requestId(req));
    }
  });

  async function authenticatedUser(req: Request) {
    const credential = credentialFromRequest(req);
    if (!credential) throw new SheetsError("invalid_session");
    return authenticateSession(config, database, credential).catch(() => {
      throw new SheetsError("invalid_session");
    });
  }

  app.get("/api/sheets/bindings", async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      res
        .status(200)
        .json({ bindings: await listSheetBindings(database, user.userId) });
    } catch (error) {
      sendAuthError(res, error, requestId(req));
    }
  });

  app.post("/api/sheets/bind", async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      res.status(201).json({
        binding: await bindSheet(config, database, user.userId, req.body),
      });
    } catch (error) {
      sendAuthError(res, error, requestId(req));
    }
  });

  app.post("/api/sheets/import", async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      res.status(200).json({
        result: await importSheetLeads(config, database, user.userId, req.body),
      });
    } catch (error) {
      sendAuthError(res, error, requestId(req));
    }
  });

  app.get("/api/leads", async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      const status =
        typeof req.query.status === "string" ? req.query.status : undefined;
      res
        .status(200)
        .json({ leads: await listLeads(database, user.userId, status) });
    } catch (error) {
      sendAuthError(res, error, requestId(req));
    }
  });

  app.get("/api/campaigns", async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      res
        .status(200)
        .json({ campaigns: await listCampaigns(database, user.userId) });
    } catch (error) {
      sendAuthError(res, error, requestId(req));
    }
  });

  app.post("/api/campaigns", async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      res.status(201).json({
        campaign: await createCampaign(database, user.userId, req.body),
      });
    } catch (error) {
      sendAuthError(res, error, requestId(req));
    }
  });

  app.post("/api/campaigns/:id/approve", async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      const { id } = parseIdInput({ id: req.params.id });
      res.status(200).json({
        campaign: await approveCampaign(database, user.userId, id),
      });
    } catch (error) {
      sendAuthError(res, error, requestId(req));
    }
  });

  app.post("/api/campaigns/:id/jobs", async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      const { id } = parseIdInput({ id: req.params.id });
      res.status(201).json({
        jobs: await createCampaignJobs(database, user.userId, id),
      });
    } catch (error) {
      sendAuthError(res, error, requestId(req));
    }
  });

  app.get("/api/jobs", async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      const campaignId =
        typeof req.query.campaignId === "string"
          ? parseIdInput({ id: req.query.campaignId }).id
          : undefined;
      res.status(200).json({
        jobs: await listJobs(database, user.userId, campaignId),
      });
    } catch (error) {
      sendAuthError(res, error, requestId(req));
    }
  });

  app.get("/api/workspace/control", async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      res.status(200).json({
        control: await getWorkspaceControl(database, user.userId),
      });
    } catch (error) {
      sendAuthError(res, error, requestId(req));
    }
  });

  app.patch("/api/workspace/control", async (req, res) => {
    try {
      const user = await authenticatedUser(req);
      res.status(200).json({
        control: await setWorkspaceControl(database, user.userId, req.body),
      });
    } catch (error) {
      sendAuthError(res, error, requestId(req));
    }
  });
}
