import { google } from "googleapis";
import { and, eq, or, isNull, lte, sql } from "drizzle-orm";
import type { AppConfig } from "./config/env.js";
import type { Database } from "./db/client.js";
import {
  auditEvents,
  campaigns,
  googleConnections,
  jobs,
  leads,
  outreachLogs,
  templates,
  workspaceControls,
} from "./db/schema.js";
import { decryptToken } from "./auth/sender-crypto.js";
import {
  CampaignError,
  failJob,
  leaseNextJob,
  retryDecision,
} from "./campaign-service.js";

export type WorkerMetrics = {
  processed: number;
  sent: number;
  retried: number;
  skipped: number;
  failed: number;
};

export type ProviderErrorClass =
  "reauthorization_required" | "retryable" | "permanent";

export class WorkerRateLimiter {
  private readonly lastByKey = new Map<string, number>();

  constructor(private readonly minimumIntervalMs = 1000) {}

  allow(keys: string[], now = Date.now()): boolean {
    if (
      keys.some(
        (key) => now - (this.lastByKey.get(key) ?? 0) < this.minimumIntervalMs,
      )
    )
      return false;
    for (const key of keys) this.lastByKey.set(key, now);
    return true;
  }
}

export class GmailWorkerError extends Error {
  constructor(
    public readonly code:
      | "configuration_invalid"
      | "job_not_found"
      | "safety_blocked"
      | "sender_inactive"
      | "recipient_invalid"
      | "template_invalid"
      | "rate_limited"
      | "provider_failed",
  ) {
    super(code);
  }
}

export function encodeMimeHeader(value: string): string {
  const clean = value
    .replace(/[\r\n\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

export function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function buildMimeMessage(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to)) {
    throw new GmailWorkerError("recipient_invalid");
  }
  const safeBody = input.body.replace(/[\r\u0000]/g, "").replace(/\n/g, "\r\n");
  return [
    `From: ${encodeMimeHeader(input.from)}`,
    `To: ${encodeMimeHeader(input.to)}`,
    `Subject: ${encodeMimeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    safeBody,
    "",
  ].join("\r\n");
}

export function classifyProviderError(error: unknown): {
  category: ProviderErrorClass;
  code: string;
  detail: string;
} {
  const candidate = error as {
    code?: number | string;
    response?: { data?: { error?: string; error_description?: string } };
  };
  const code = String(candidate?.code ?? "provider_error");
  const providerError = candidate?.response?.data?.error;
  const detail =
    providerError === "invalid_grant"
      ? "Google authorization requires reauthorization"
      : "Gmail provider request failed";
  if (providerError === "invalid_grant" || code === "400") {
    return {
      category: "reauthorization_required",
      code: "reauthorization_required",
      detail,
    };
  }
  if (
    [
      "429",
      "500",
      "502",
      "503",
      "504",
      "ETIMEDOUT",
      "ECONNRESET",
      "ENOTFOUND",
    ].includes(code)
  ) {
    return {
      category: "retryable",
      code: "provider_transient",
      detail: "Temporary Gmail provider failure",
    };
  }
  return {
    category: "permanent",
    code: "provider_rejected",
    detail: "Gmail provider rejected the request",
  };
}

function requireDatabase(database: Database | undefined): Database {
  if (!database) throw new GmailWorkerError("configuration_invalid");
  return database;
}

function interpolate(value: string, lead: typeof leads.$inferSelect): string {
  return value
    .replaceAll("{first_name}", lead.firstName ?? "")
    .replaceAll("{last_name}", lead.lastName ?? "")
    .replaceAll("{email}", lead.email);
}

async function loadJob(
  db: Database,
  userId: number,
  jobId: number,
  workerId: string,
) {
  const [record] = await db
    .select({
      job: jobs,
      campaign: campaigns,
      lead: leads,
      template: templates,
      connection: googleConnections,
    })
    .from(jobs)
    .innerJoin(campaigns, eq(campaigns.id, jobs.campaignId))
    .innerJoin(leads, eq(leads.id, jobs.leadId))
    .innerJoin(templates, eq(templates.id, campaigns.templateId))
    .innerJoin(
      googleConnections,
      eq(googleConnections.id, campaigns.senderConnectionId),
    )
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.userId, userId),
        eq(jobs.leaseOwner, workerId),
      ),
    )
    .limit(1);
  if (!record) throw new GmailWorkerError("job_not_found");
  return record;
}

async function safetyCheck(
  db: Database,
  userId: number,
  campaignId: number,
  connectionId: number,
) {
  const [control] = await db
    .select()
    .from(workspaceControls)
    .where(eq(workspaceControls.userId, userId))
    .limit(1);
  if (control?.paused || control?.killSwitch)
    throw new GmailWorkerError("safety_blocked");
  const [campaign] = await db
    .select({ status: campaigns.status, mode: campaigns.mode })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)))
    .limit(1);
  if (!campaign || campaign.status !== "running")
    throw new GmailWorkerError("safety_blocked");
  const [connection] = await db
    .select({ status: googleConnections.status })
    .from(googleConnections)
    .where(
      and(
        eq(googleConnections.id, connectionId),
        eq(googleConnections.userId, userId),
      ),
    )
    .limit(1);
  if (!connection || connection.status !== "active")
    throw new GmailWorkerError("sender_inactive");
}

async function markSending(db: Database, jobId: number, workerId: string) {
  const result = await db
    .update(jobs)
    .set({ status: "sending", updatedAt: new Date() })
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.status, "leased"),
        eq(jobs.leaseOwner, workerId),
      ),
    );
  if (Number(result[0]?.affectedRows ?? 0) !== 1)
    throw new GmailWorkerError("job_not_found");
}

async function markReauthorization(db: Database, connectionId: number) {
  await db
    .update(googleConnections)
    .set({ status: "reauthorization_required", updatedAt: new Date() })
    .where(eq(googleConnections.id, connectionId));
}

async function recordSuccess(
  db: Database,
  input: {
    userId: number;
    jobId: number;
    campaignId: number;
    leadId: number;
    providerMessageId: string;
    simulation: boolean;
  },
) {
  return db.transaction(async (tx) => {
    const result = await tx
      .update(jobs)
      .set({
        status: "sent",
        providerMessageId: input.providerMessageId,
        completedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobs.id, input.jobId),
          eq(jobs.userId, input.userId),
          eq(jobs.status, "sending"),
        ),
      );
    if (Number(result[0]?.affectedRows ?? 0) !== 1)
      throw new GmailWorkerError("job_not_found");
    await tx.insert(outreachLogs).values({
      userId: input.userId,
      campaignId: input.campaignId,
      leadId: input.leadId,
      jobId: input.jobId,
      eventType: input.simulation ? "simulated" : "sent",
      providerMessageId: input.providerMessageId,
      detailJson: JSON.stringify({ simulation: input.simulation }),
    });
    await tx.insert(auditEvents).values({
      userId: input.userId,
      eventType: input.simulation ? "job.simulated" : "job.sent",
      entityType: "job",
      entityId: String(input.jobId),
      safeDetailJson: JSON.stringify({
        campaignId: input.campaignId,
        providerMessageId: input.providerMessageId,
        simulation: input.simulation,
      }),
    });
    return {
      status: "sent" as const,
      providerMessageId: input.providerMessageId,
    };
  });
}

export async function processLeasedJob(
  config: AppConfig,
  database: Database | undefined,
  jobId: number,
  userId: number,
  workerId: string,
  options: {
    gmailSend?: (
      auth: InstanceType<typeof google.auth.OAuth2>,
      raw: string,
    ) => Promise<string>;
    rateLimiter?: WorkerRateLimiter;
  } = {},
) {
  const db = requireDatabase(database);
  const record = await loadJob(db, userId, jobId, workerId);
  await safetyCheck(db, userId, record.job.campaignId, record.connection.id);
  if (record.lead.status !== "imported")
    throw new GmailWorkerError("safety_blocked");
  const subject = interpolate(record.template.subject, record.lead);
  const body = interpolate(record.template.body, record.lead);
  if (!subject.trim() || !body.trim())
    throw new GmailWorkerError("template_invalid");
  const raw = encodeBase64Url(
    buildMimeMessage({
      from: record.connection.email,
      to: record.lead.email,
      subject,
      body,
    }),
  );
  await markSending(db, jobId, workerId);
  if (record.campaign.mode === "dry_run")
    return recordSuccess(db, {
      userId,
      jobId,
      campaignId: record.job.campaignId,
      leadId: record.job.leadId,
      providerMessageId: `simulation:${record.job.idempotencyKey}`,
      simulation: true,
    });
  let refreshToken: string | undefined;
  let accessToken: string | undefined;
  try {
    refreshToken = decryptToken(
      config,
      record.connection.refreshTokenCiphertext,
    );
    accessToken = decryptToken(config, record.connection.accessTokenCiphertext);
    const auth = new google.auth.OAuth2(
      config.GOOGLE_OAUTH_CLIENT_ID,
      config.GOOGLE_OAUTH_CLIENT_SECRET,
      config.GOOGLE_CONNECTION_REDIRECT_URI,
    );
    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      ...(record.connection.tokenExpiresAt
        ? { expiry_date: record.connection.tokenExpiresAt.getTime() }
        : {}),
    });
    if (
      !accessToken ||
      !record.connection.tokenExpiresAt ||
      record.connection.tokenExpiresAt.getTime() <= Date.now() + 60_000
    )
      await auth.getAccessToken();
    const send =
      options.gmailSend ??
      (async (client, encoded) => {
        const result = await google
          .gmail({ version: "v1", auth: client })
          .users.messages.send({ userId: "me", requestBody: { raw: encoded } });
        return result.data.id ?? "";
      });
    const rateLimiter = options.rateLimiter ?? new WorkerRateLimiter();
    if (
      !rateLimiter.allow([
        `sender:${record.connection.id}`,
        `campaign:${record.job.campaignId}`,
      ])
    )
      throw new GmailWorkerError("rate_limited");
    await safetyCheck(db, userId, record.job.campaignId, record.connection.id);
    const providerMessageId = await send(auth, raw);
    if (!providerMessageId) throw new GmailWorkerError("provider_failed");
    return recordSuccess(db, {
      userId,
      jobId,
      campaignId: record.job.campaignId,
      leadId: record.job.leadId,
      providerMessageId,
      simulation: false,
    });
  } catch (error) {
    const classification =
      error instanceof GmailWorkerError
        ? {
            category:
              error.code === "rate_limited"
                ? ("retryable" as const)
                : ("permanent" as const),
            code: error.code,
            detail: error.code,
          }
        : classifyProviderError(error);
    if (classification.category === "reauthorization_required")
      await markReauthorization(db, record.connection.id);
    const decision = retryDecision(
      record.job.attemptCount,
      classification.category === "retryable",
    );
    await db
      .update(jobs)
      .set({
        status: decision.status,
        nextAttemptAt: decision.nextAttemptAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        safeErrorCode: classification.code,
        safeErrorDetail: classification.detail,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.userId, userId),
          eq(jobs.leaseOwner, workerId),
          or(eq(jobs.status, "sending"), eq(jobs.status, "leased")),
        ),
      );
    throw error;
  } finally {
    refreshToken = undefined;
    accessToken = undefined;
  }
}

export async function runWorkerOnce(
  config: AppConfig,
  database: Database | undefined,
  workerId: string,
  options: {
    gmailSend?: (
      auth: InstanceType<typeof google.auth.OAuth2>,
      raw: string,
    ) => Promise<string>;
    rateLimiter?: WorkerRateLimiter;
  } = {},
) {
  const db = requireDatabase(database);
  const leased = await leaseNextJob(db, workerId, 60);
  if (!leased)
    return {
      processed: 0,
      sent: 0,
      retried: 0,
      skipped: 0,
      failed: 0,
    } satisfies WorkerMetrics;
  try {
    await processLeasedJob(
      config,
      db,
      leased.id,
      leased.userId,
      workerId,
      options,
    );
    return {
      processed: 1,
      sent: 1,
      retried: 0,
      skipped: 0,
      failed: 0,
    } satisfies WorkerMetrics;
  } catch {
    return {
      processed: 1,
      sent: 0,
      retried: 0,
      skipped: 0,
      failed: 1,
    } satisfies WorkerMetrics;
  }
}
