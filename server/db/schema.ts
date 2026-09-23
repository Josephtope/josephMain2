import {
  bigint,
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const id = () => bigint({ mode: "number", unsigned: true });
const createdAt = () => timestamp("created_at").notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at").notNull().defaultNow().onUpdateNow();

export const schemaMetadata = mysqlTable("schema_metadata", {
  version: varchar("version", { length: 32 }).primaryKey(),
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
});

export const users = mysqlTable(
  "users",
  {
    id: id().autoincrement().primaryKey(),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerSubject: varchar("provider_subject", { length: 191 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 191 }),
    avatarUrl: varchar("avatar_url", { length: 512 }),
    status: mysqlEnum("status", ["active", "disabled"])
      .notNull()
      .default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastLoginAt: timestamp("last_login_at"),
  },
  (table) => ({
    users_provider_subject_uq: uniqueIndex("users_provider_subject_uq").on(
      table.provider,
      table.providerSubject,
    ),
    users_email_uq: uniqueIndex("users_email_uq").on(table.email),
  }),
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: id().autoincrement().primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    sessionIdentifier: varchar("session_identifier", { length: 64 }).notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at"),
  },
  (table) => ({
    sessions_identifier_uq: uniqueIndex("sessions_identifier_uq").on(
      table.sessionIdentifier,
    ),
    sessions_token_hash_uq: uniqueIndex("sessions_token_hash_uq").on(
      table.tokenHash,
    ),
    sessions_user_idx: index("sessions_user_idx").on(table.userId),
    sessions_expiry_idx: index("sessions_expiry_idx").on(table.expiresAt),
  }),
);

export const oauthLoginStates = mysqlTable(
  "oauth_login_states",
  {
    id: id().autoincrement().primaryKey(),
    stateHash: varchar("state_hash", { length: 128 }).notNull(),
    nativeReturnUri: varchar("native_return_uri", { length: 512 }).notNull(),
    nonceHash: varchar("nonce_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    oauth_login_states_hash_uq: uniqueIndex("oauth_login_states_hash_uq").on(
      table.stateHash,
    ),
    oauth_login_states_expiry_idx: index("oauth_login_states_expiry_idx").on(
      table.expiresAt,
    ),
  }),
);

export const loginExchangeCodes = mysqlTable(
  "login_exchange_codes",
  {
    id: id().autoincrement().primaryKey(),
    codeHash: varchar("code_hash", { length: 128 }).notNull(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    sessionId: bigint("session_id", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    nativeReturnUri: varchar("native_return_uri", { length: 512 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    login_exchange_codes_hash_uq: uniqueIndex(
      "login_exchange_codes_hash_uq",
    ).on(table.codeHash),
    login_exchange_codes_expiry_idx: index(
      "login_exchange_codes_expiry_idx",
    ).on(table.expiresAt),
  }),
);

export const googleConnectionStates = mysqlTable(
  "google_connection_states",
  {
    id: id().autoincrement().primaryKey(),
    stateHash: varchar("state_hash", { length: 128 }).notNull(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    sessionIdentifier: varchar("session_identifier", { length: 64 }).notNull(),
    nativeReturnUri: varchar("native_return_uri", { length: 512 }).notNull(),
    nonceHash: varchar("nonce_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    google_connection_states_hash_uq: uniqueIndex(
      "google_connection_states_hash_uq",
    ).on(table.stateHash),
    google_connection_states_expiry_idx: index(
      "google_connection_states_expiry_idx",
    ).on(table.expiresAt),
    google_connection_states_user_idx: index(
      "google_connection_states_user_idx",
    ).on(table.userId),
  }),
);

export const googleConnections = mysqlTable(
  "google_connections",
  {
    id: id().autoincrement().primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    providerSubject: varchar("provider_subject", { length: 191 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    scopes: text("scopes").notNull(),
    accessTokenCiphertext: text("access_token_ciphertext").notNull(),
    refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
    tokenExpiresAt: timestamp("token_expires_at"),
    status: mysqlEnum("status", [
      "active",
      "reauthorization_required",
      "revoked",
    ])
      .notNull()
      .default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastValidatedAt: timestamp("last_validated_at"),
  },
  (table) => ({
    google_connections_user_subject_uq: uniqueIndex(
      "google_connections_user_subject_uq",
    ).on(table.userId, table.providerSubject),
    google_connections_user_idx: index("google_connections_user_idx").on(
      table.userId,
    ),
  }),
);

export const sheetBindings = mysqlTable(
  "sheet_bindings",
  {
    id: id().autoincrement().primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    googleConnectionId: bigint("google_connection_id", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    spreadsheetId: varchar("spreadsheet_id", { length: 191 }).notNull(),
    tabName: varchar("tab_name", { length: 191 }).notNull(),
    headerMappingJson: text("header_mapping_json").notNull(),
    status: mysqlEnum("status", ["active", "invalid", "revoked"])
      .notNull()
      .default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    sheet_bindings_owner_sheet_uq: uniqueIndex(
      "sheet_bindings_owner_sheet_uq",
    ).on(table.userId, table.spreadsheetId, table.tabName),
    sheet_bindings_user_idx: index("sheet_bindings_user_idx").on(table.userId),
  }),
);

export const leads = mysqlTable(
  "leads",
  {
    id: id().autoincrement().primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    sheetBindingId: bigint("sheet_binding_id", {
      mode: "number",
      unsigned: true,
    }),
    sourceRowKey: varchar("source_row_key", { length: 191 }),
    email: varchar("email", { length: 320 }).notNull(),
    firstName: varchar("first_name", { length: 191 }),
    lastName: varchar("last_name", { length: 191 }),
    fieldsJson: text("fields_json").notNull(),
    status: mysqlEnum("status", [
      "imported",
      "suppressed",
      "invalid",
      "archived",
    ])
      .notNull()
      .default("imported"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    leads_owner_email_uq: uniqueIndex("leads_owner_email_uq").on(
      table.userId,
      table.email,
    ),
    leads_user_status_idx: index("leads_user_status_idx").on(
      table.userId,
      table.status,
    ),
    leads_sheet_row_idx: index("leads_sheet_row_idx").on(
      table.sheetBindingId,
      table.sourceRowKey,
    ),
  }),
);

export const templates = mysqlTable(
  "templates",
  {
    id: id().autoincrement().primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    subject: varchar("subject", { length: 998 }).notNull(),
    body: text("body").notNull(),
    version: int("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    templatesUserIdx: index("templates_user_idx").on(table.userId),
  }),
);

export const campaigns = mysqlTable(
  "campaigns",
  {
    id: id().autoincrement().primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    senderConnectionId: bigint("sender_connection_id", {
      mode: "number",
      unsigned: true,
    }),
    sheetBindingId: bigint("sheet_binding_id", {
      mode: "number",
      unsigned: true,
    }),
    templateId: bigint("template_id", { mode: "number", unsigned: true }),
    name: varchar("name", { length: 191 }).notNull(),
    mode: mysqlEnum("mode", ["dry_run", "live"]).notNull().default("dry_run"),
    approvalPolicy: mysqlEnum("approval_policy", ["manual", "automatic"])
      .notNull()
      .default("manual"),
    status: mysqlEnum("status", [
      "draft",
      "ready",
      "paused",
      "running",
      "completed",
      "archived",
    ])
      .notNull()
      .default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    campaigns_user_status_idx: index("campaigns_user_status_idx").on(
      table.userId,
      table.status,
    ),
    campaigns_sender_idx: index("campaigns_sender_idx").on(
      table.senderConnectionId,
    ),
  }),
);

export const campaignLeads = mysqlTable(
  "campaign_leads",
  {
    campaignId: bigint("campaign_id", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    leadId: bigint("lead_id", { mode: "number", unsigned: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => ({
    campaign_leads_pk: uniqueIndex("campaign_leads_pk").on(
      table.campaignId,
      table.leadId,
    ),
  }),
);

export const workspaceControls = mysqlTable("workspace_controls", {
  userId: bigint("user_id", { mode: "number", unsigned: true }).primaryKey(),
  paused: boolean("paused").notNull().default(false),
  killSwitch: boolean("kill_switch").notNull().default(false),
  maxConcurrentJobs: int("max_concurrent_jobs").notNull().default(1),
  updatedAt: updatedAt(),
});

export const jobs = mysqlTable(
  "jobs",
  {
    id: id().autoincrement().primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    campaignId: bigint("campaign_id", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    leadId: bigint("lead_id", { mode: "number", unsigned: true }).notNull(),
    status: mysqlEnum("status", [
      "queued",
      "leased",
      "sending",
      "sent",
      "failed",
      "cancelled",
      "blocked",
    ])
      .notNull()
      .default("queued"),
    attemptCount: int("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at"),
    leaseOwner: varchar("lease_owner", { length: 191 }),
    leaseExpiresAt: timestamp("lease_expires_at"),
    idempotencyKey: varchar("idempotency_key", { length: 191 }).notNull(),
    providerMessageId: varchar("provider_message_id", { length: 512 }),
    safeErrorCode: varchar("safe_error_code", { length: 64 }),
    safeErrorDetail: text("safe_error_detail"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    jobs_idempotency_uq: uniqueIndex("jobs_idempotency_uq").on(
      table.idempotencyKey,
    ),
    jobs_claim_idx: index("jobs_claim_idx").on(
      table.status,
      table.nextAttemptAt,
      table.leaseExpiresAt,
    ),
    jobs_campaign_idx: index("jobs_campaign_idx").on(
      table.campaignId,
      table.status,
    ),
    jobs_user_idx: index("jobs_user_idx").on(table.userId),
  }),
);

export const outreachLogs = mysqlTable(
  "outreach_logs",
  {
    id: id().autoincrement().primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    campaignId: bigint("campaign_id", { mode: "number", unsigned: true }),
    leadId: bigint("lead_id", { mode: "number", unsigned: true }),
    jobId: bigint("job_id", { mode: "number", unsigned: true }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    providerMessageId: varchar("provider_message_id", { length: 512 }),
    detailJson: text("detail_json"),
    createdAt: createdAt(),
  },
  (table) => ({
    outreach_logs_user_created_idx: index("outreach_logs_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    outreach_logs_lead_idx: index("outreach_logs_lead_idx").on(
      table.leadId,
      table.createdAt,
    ),
  }),
);

export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: id().autoincrement().primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }),
    requestId: varchar("request_id", { length: 64 }),
    eventType: varchar("event_type", { length: 96 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }),
    entityId: varchar("entity_id", { length: 191 }),
    safeDetailJson: text("safe_detail_json"),
    createdAt: createdAt(),
  },
  (table) => ({
    audit_events_user_created_idx: index("audit_events_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    audit_events_request_idx: index("audit_events_request_idx").on(
      table.requestId,
    ),
  }),
);

export const schema = {
  schemaMetadata,
  users,
  sessions,
  oauthLoginStates,
  loginExchangeCodes,
  googleConnectionStates,
  googleConnections,
  sheetBindings,
  leads,
  templates,
  campaigns,
  campaignLeads,
  workspaceControls,
  jobs,
  outreachLogs,
  auditEvents,
};
