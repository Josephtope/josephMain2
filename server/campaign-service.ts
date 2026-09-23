import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db/client.js";
import {
  campaignLeads,
  campaigns,
  googleConnections,
  jobs,
  leads,
  sheetBindings,
  templates,
  workspaceControls,
} from "./db/schema.js";

const campaignInputSchema = z.object({
  name: z.string().trim().min(1).max(191),
  senderConnectionId: z.coerce.number().int().positive(),
  sheetBindingId: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive(),
  mode: z.enum(["dry_run", "live"]),
  approvalPolicy: z.enum(["manual", "automatic"]),
});
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const controlSchema = z.object({
  paused: z.boolean().optional(),
  killSwitch: z.boolean().optional(),
  maxConcurrentJobs: z.coerce.number().int().min(1).max(100),
});

export class CampaignError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "campaign_not_found"
      | "sender_not_found"
      | "binding_not_found"
      | "template_not_found"
      | "campaign_not_approved"
      | "live_approval_required"
      | "workspace_paused"
      | "kill_switch_active"
      | "no_eligible_leads"
      | "job_not_found"
      | "lease_conflict"
      | "invalid_transition"
      | "storage_failed",
  ) {
    super(code);
  }
}

export type JobRetryDecision = {
  status: "queued" | "failed";
  nextAttemptAt: Date | null;
};

export function idempotencyKey(
  campaignId: number,
  leadId: number,
  templateId: number,
  templateVersion: number,
): string {
  return `campaign:${campaignId}:lead:${leadId}:template:${templateId}:v${templateVersion}`;
}

export function retryDecision(
  attemptCount: number,
  retryable: boolean,
  now = new Date(),
  maxAttempts = 3,
): JobRetryDecision {
  if (!retryable || attemptCount >= maxAttempts) {
    return { status: "failed", nextAttemptAt: null };
  }
  const backoffSeconds = Math.min(3600, 2 ** Math.max(0, attemptCount) * 30);
  return {
    status: "queued",
    nextAttemptAt: new Date(now.getTime() + backoffSeconds * 1000),
  };
}

function databaseOrThrow(database: Database | undefined): Database {
  if (!database) throw new CampaignError("storage_failed");
  return database;
}

export function parseCampaignInput(input: unknown) {
  return campaignInputSchema.parse(input);
}
export function parseIdInput(input: unknown) {
  return idSchema.parse(input);
}
export function parseControlInput(input: unknown) {
  return controlSchema.parse(input);
}

async function ownedCampaign(db: Database, userId: number, campaignId: number) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)))
    .limit(1);
  if (!campaign) throw new CampaignError("campaign_not_found");
  return campaign;
}

export async function createCampaign(
  database: Database | undefined,
  userId: number,
  input: unknown,
) {
  const db = databaseOrThrow(database);
  const parsed = parseCampaignInput(input);
  const [sender] = await db
    .select({ id: googleConnections.id })
    .from(googleConnections)
    .where(
      and(
        eq(googleConnections.id, parsed.senderConnectionId),
        eq(googleConnections.userId, userId),
        eq(googleConnections.status, "active"),
      ),
    )
    .limit(1);
  if (!sender) throw new CampaignError("sender_not_found");
  const [binding] = await db
    .select({ id: sheetBindings.id })
    .from(sheetBindings)
    .where(
      and(
        eq(sheetBindings.id, parsed.sheetBindingId),
        eq(sheetBindings.userId, userId),
        eq(sheetBindings.status, "active"),
      ),
    )
    .limit(1);
  if (!binding) throw new CampaignError("binding_not_found");
  const [template] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(
      and(eq(templates.id, parsed.templateId), eq(templates.userId, userId)),
    )
    .limit(1);
  if (!template) throw new CampaignError("template_not_found");
  if (parsed.mode === "live" && parsed.approvalPolicy !== "manual") {
    throw new CampaignError("live_approval_required");
  }
  const result = await db.insert(campaigns).values({
    userId,
    senderConnectionId: parsed.senderConnectionId,
    sheetBindingId: parsed.sheetBindingId,
    templateId: parsed.templateId,
    name: parsed.name,
    mode: parsed.mode,
    approvalPolicy: parsed.approvalPolicy,
    status: "draft",
  });
  const id = Number(result[0]?.insertId ?? 0);
  return { id, ...parsed, status: "draft" as const };
}

export async function listCampaigns(
  database: Database | undefined,
  userId: number,
) {
  const db = databaseOrThrow(database);
  return db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      senderConnectionId: campaigns.senderConnectionId,
      sheetBindingId: campaigns.sheetBindingId,
      templateId: campaigns.templateId,
      mode: campaigns.mode,
      approvalPolicy: campaigns.approvalPolicy,
      status: campaigns.status,
      createdAt: campaigns.createdAt,
      updatedAt: campaigns.updatedAt,
    })
    .from(campaigns)
    .where(eq(campaigns.userId, userId))
    .orderBy(asc(campaigns.createdAt));
}

export async function approveCampaign(
  database: Database | undefined,
  userId: number,
  campaignId: number,
) {
  const db = databaseOrThrow(database);
  const campaign = await ownedCampaign(db, userId, campaignId);
  if (campaign.mode === "live" && campaign.approvalPolicy !== "manual") {
    throw new CampaignError("live_approval_required");
  }
  await db
    .update(campaigns)
    .set({ status: "ready", updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)));
  return { campaignId, status: "ready" as const };
}

async function workspaceControl(db: Database, userId: number) {
  const [control] = await db
    .select()
    .from(workspaceControls)
    .where(eq(workspaceControls.userId, userId))
    .limit(1);
  return (
    control ?? {
      userId,
      paused: false,
      killSwitch: false,
      maxConcurrentJobs: 1,
    }
  );
}

export async function getWorkspaceControl(
  database: Database | undefined,
  userId: number,
) {
  const db = databaseOrThrow(database);
  return workspaceControl(db, userId);
}

export async function setWorkspaceControl(
  database: Database | undefined,
  userId: number,
  input: unknown,
) {
  const db = databaseOrThrow(database);
  const parsed = parseControlInput(input);
  const current = await workspaceControl(db, userId);
  const next = {
    paused: parsed.paused ?? current.paused,
    killSwitch: parsed.killSwitch ?? current.killSwitch,
    maxConcurrentJobs: parsed.maxConcurrentJobs,
  };
  await db
    .insert(workspaceControls)
    .values({ userId, ...next })
    .onDuplicateKeyUpdate({ set: { ...next, updatedAt: new Date() } });
  return { userId, ...next };
}

export async function createCampaignJobs(
  database: Database | undefined,
  userId: number,
  campaignId: number,
) {
  const db = databaseOrThrow(database);
  return db.transaction(async (tx) => {
    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)))
      .limit(1)
      .for("update");
    if (!campaign) throw new CampaignError("campaign_not_found");
    if (campaign.status !== "ready" && campaign.status !== "running") {
      throw new CampaignError("campaign_not_approved");
    }
    const control = await workspaceControl(tx as unknown as Database, userId);
    if (control.killSwitch) throw new CampaignError("kill_switch_active");
    if (control.paused) throw new CampaignError("workspace_paused");
    const [template] = await tx
      .select({ id: templates.id, version: templates.version })
      .from(templates)
      .where(
        and(
          eq(templates.id, campaign.templateId!),
          eq(templates.userId, userId),
        ),
      )
      .limit(1);
    if (!template) throw new CampaignError("template_not_found");
    const eligible = await tx
      .select({ leadId: leads.id })
      .from(leads)
      .where(
        and(
          eq(leads.userId, userId),
          eq(leads.sheetBindingId, campaign.sheetBindingId!),
          eq(leads.status, "imported"),
        ),
      );
    if (eligible.length === 0) throw new CampaignError("no_eligible_leads");
    let created = 0;
    let existing = 0;
    for (const row of eligible) {
      await tx
        .insert(campaignLeads)
        .values({ campaignId, leadId: row.leadId })
        .onDuplicateKeyUpdate({ set: { campaignId } });
      const key = idempotencyKey(
        campaignId,
        row.leadId,
        template.id,
        template.version,
      );
      const [job] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.userId, userId), eq(jobs.idempotencyKey, key)))
        .limit(1);
      if (job) {
        existing += 1;
        continue;
      }
      await tx.insert(jobs).values({
        userId,
        campaignId,
        leadId: row.leadId,
        status: "queued",
        attemptCount: 0,
        idempotencyKey: key,
      });
      created += 1;
    }
    if (campaign.status === "ready") {
      await tx
        .update(campaigns)
        .set({ status: "running", updatedAt: new Date() })
        .where(eq(campaigns.id, campaignId));
    }
    return { campaignId, created, existing, totalEligible: eligible.length };
  });
}

export async function reclaimExpiredLeases(
  database: Database | undefined,
  now = new Date(),
) {
  const db = databaseOrThrow(database);
  const result = await db
    .update(jobs)
    .set({
      status: "queued",
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(and(eq(jobs.status, "leased"), lte(jobs.leaseExpiresAt, now)));
  return Number(result[0]?.affectedRows ?? 0);
}

export async function leaseNextJob(
  database: Database | undefined,
  workerId: string,
  leaseSeconds = 60,
  now = new Date(),
) {
  const db = databaseOrThrow(database);
  return db.transaction(async (tx) => {
    await reclaimExpiredLeases(tx as unknown as Database, now);
    const [job] = await tx
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.status, "queued"),
          or(isNull(jobs.nextAttemptAt), lte(jobs.nextAttemptAt, now)),
        ),
      )
      .orderBy(asc(jobs.createdAt))
      .limit(1)
      .for("update");
    if (!job) return null;
    const [campaign] = await tx
      .select({
        senderConnectionId: campaigns.senderConnectionId,
        userId: campaigns.userId,
      })
      .from(campaigns)
      .where(eq(campaigns.id, job.campaignId))
      .limit(1);
    if (!campaign) return null;
    const [jobOwnerControl] = await tx
      .select()
      .from(workspaceControls)
      .where(eq(workspaceControls.userId, job.userId))
      .limit(1);
    const limits = jobOwnerControl ?? {
      maxConcurrentJobs: 1,
      paused: false,
      killSwitch: false,
    };
    if (limits.paused || limits.killSwitch) return null;
    const [campaignActive] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(
        and(
          eq(jobs.campaignId, job.campaignId),
          or(eq(jobs.status, "leased"), eq(jobs.status, "sending")),
        ),
      );
    if (Number(campaignActive?.count ?? 0) >= limits.maxConcurrentJobs)
      return null;
    const [senderActive] = campaign.senderConnectionId
      ? await tx
          .select({ count: sql<number>`count(*)` })
          .from(jobs)
          .innerJoin(campaigns, eq(campaigns.id, jobs.campaignId))
          .where(
            and(
              eq(campaigns.senderConnectionId, campaign.senderConnectionId),
              or(eq(jobs.status, "leased"), eq(jobs.status, "sending")),
            ),
          )
      : [{ count: 0 }];
    if (Number(senderActive?.count ?? 0) >= limits.maxConcurrentJobs)
      return null;
    const expires = new Date(now.getTime() + leaseSeconds * 1000);
    const updated = await tx
      .update(jobs)
      .set({
        status: "leased",
        leaseOwner: workerId,
        leaseExpiresAt: expires,
        attemptCount: sql`${jobs.attemptCount} + 1`,
        updatedAt: now,
      })
      .where(and(eq(jobs.id, job.id), eq(jobs.status, "queued")));
    if (Number(updated[0]?.affectedRows ?? 0) !== 1) {
      throw new CampaignError("lease_conflict");
    }
    return {
      ...job,
      status: "leased" as const,
      leaseOwner: workerId,
      leaseExpiresAt: expires,
      attemptCount: job.attemptCount + 1,
    };
  });
}

export async function completeJob(
  database: Database | undefined,
  userId: number,
  jobId: number,
  workerId: string,
  providerMessageId: string | null,
) {
  const db = databaseOrThrow(database);
  return db.transaction(async (tx) => {
    const result = await tx
      .update(jobs)
      .set({
        status: "sent",
        providerMessageId,
        completedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.userId, userId),
          eq(jobs.status, "leased"),
          eq(jobs.leaseOwner, workerId),
        ),
      );
    if (Number(result[0]?.affectedRows ?? 0) !== 1)
      throw new CampaignError("invalid_transition");
    return { jobId, status: "sent" as const };
  });
}

export async function failJob(
  database: Database | undefined,
  userId: number,
  jobId: number,
  workerId: string,
  safeErrorCode: string,
  safeErrorDetail: string,
  retryable: boolean,
) {
  const db = databaseOrThrow(database);
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.userId, userId),
          eq(jobs.status, "leased"),
          eq(jobs.leaseOwner, workerId),
        ),
      )
      .limit(1)
      .for("update");
    if (!job) throw new CampaignError("invalid_transition");
    const decision = retryDecision(job.attemptCount, retryable);
    await tx
      .update(jobs)
      .set({
        status: decision.status,
        nextAttemptAt: decision.nextAttemptAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        safeErrorCode: safeErrorCode.slice(0, 64),
        safeErrorDetail: safeErrorDetail.slice(0, 2000),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    return {
      jobId,
      status: decision.status,
      nextAttemptAt: decision.nextAttemptAt,
    };
  });
}

export async function listJobs(
  database: Database | undefined,
  userId: number,
  campaignId?: number,
) {
  const db = databaseOrThrow(database);
  const conditions = [eq(jobs.userId, userId)];
  if (campaignId) conditions.push(eq(jobs.campaignId, campaignId));
  return db
    .select({
      id: jobs.id,
      campaignId: jobs.campaignId,
      leadId: jobs.leadId,
      status: jobs.status,
      attemptCount: jobs.attemptCount,
      nextAttemptAt: jobs.nextAttemptAt,
      safeErrorCode: jobs.safeErrorCode,
      providerMessageId: jobs.providerMessageId,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
      completedAt: jobs.completedAt,
    })
    .from(jobs)
    .where(and(...conditions))
    .orderBy(asc(jobs.createdAt));
}
