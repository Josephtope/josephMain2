import { google } from "googleapis";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppConfig } from "./config/env.js";
import type { Database } from "./db/client.js";
import { googleConnections, leads, sheetBindings } from "./db/schema.js";
import { decryptToken } from "./auth/sender-crypto.js";

const bindingInputSchema = z.object({
  googleConnectionId: z.coerce.number().int().positive(),
  spreadsheetId: z
    .string()
    .trim()
    .min(1)
    .max(191)
    .regex(/^[A-Za-z0-9_-]+$/),
  tabName: z.string().trim().min(1).max(191),
});
const importInputSchema = z.object({
  bindingId: z.coerce.number().int().positive(),
});
const headerNames = {
  email: ["email", "email address", "e-mail"],
  firstName: ["first name", "firstname", "first_name", "given name"],
  lastName: ["last name", "lastname", "last_name", "family name"],
} as const;
type HeaderMapping = { email: number; firstName?: number; lastName?: number };

export class SheetsError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "invalid_session"
      | "connection_not_found"
      | "connection_invalid"
      | "spreadsheet_not_found"
      | "tab_not_found"
      | "headers_invalid"
      | "binding_not_found"
      | "provider_failed"
      | "import_failed",
  ) {
    super(code);
  }
}

function dbOrThrow(database: Database | undefined): Database {
  if (!database) throw new SheetsError("provider_failed");
  return database;
}
function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ");
}
function indexOfHeader(headers: string[], names: readonly string[]) {
  return headers.findIndex((header) => names.includes(header));
}
function mappingForHeaderRow(row: unknown[]): HeaderMapping {
  const headers = row.map(normalizeHeader);
  const email = indexOfHeader(headers, headerNames.email);
  if (email < 0) throw new SheetsError("headers_invalid");
  const firstName = indexOfHeader(headers, headerNames.firstName);
  const lastName = indexOfHeader(headers, headerNames.lastName);
  return {
    email,
    ...(firstName >= 0 ? { firstName } : {}),
    ...(lastName >= 0 ? { lastName } : {}),
  };
}
function cell(row: unknown[], index: number | undefined): string | null {
  if (index === undefined) return null;
  const value = String(row[index] ?? "").trim();
  return value ? value.slice(0, 320) : null;
}
function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function clientFor(
  config: AppConfig,
  connection: typeof googleConnections.$inferSelect,
) {
  try {
    const auth = new google.auth.OAuth2(
      config.GOOGLE_OAUTH_CLIENT_ID,
      config.GOOGLE_OAUTH_CLIENT_SECRET,
      config.GOOGLE_CONNECTION_REDIRECT_URI,
    );
    auth.setCredentials({
      access_token: decryptToken(config, connection.accessTokenCiphertext),
      refresh_token: decryptToken(config, connection.refreshTokenCiphertext),
    });
    return google.sheets({ version: "v4", auth });
  } catch {
    throw new SheetsError("connection_invalid");
  }
}
async function ownedConnection(
  db: Database,
  userId: number,
  connectionId: number,
) {
  const [connection] = await db
    .select()
    .from(googleConnections)
    .where(
      and(
        eq(googleConnections.id, connectionId),
        eq(googleConnections.userId, userId),
        eq(googleConnections.status, "active"),
      ),
    )
    .limit(1);
  if (!connection) throw new SheetsError("connection_not_found");
  return connection;
}
async function sheetAccess(
  config: AppConfig,
  connection: typeof googleConnections.$inferSelect,
  spreadsheetId: string,
  tabName: string,
) {
  const client = clientFor(config, connection);
  let metadata;
  try {
    metadata = await client.spreadsheets.get({
      spreadsheetId,
      fields: "properties(title),sheets.properties(title)",
    });
  } catch {
    throw new SheetsError("spreadsheet_not_found");
  }
  const tab = metadata.data.sheets?.find(
    (item) => item.properties?.title === tabName,
  );
  if (!tab) throw new SheetsError("tab_not_found");
  return { client, title: metadata.data.properties?.title ?? spreadsheetId };
}
export function parseBindingInput(input: unknown) {
  return bindingInputSchema.parse(input);
}
export function parseImportInput(input: unknown) {
  return importInputSchema.parse(input);
}

export async function listSheetBindings(
  database: Database | undefined,
  userId: number,
) {
  const db = dbOrThrow(database);
  return db
    .select({
      id: sheetBindings.id,
      googleConnectionId: sheetBindings.googleConnectionId,
      spreadsheetId: sheetBindings.spreadsheetId,
      tabName: sheetBindings.tabName,
      status: sheetBindings.status,
      createdAt: sheetBindings.createdAt,
      updatedAt: sheetBindings.updatedAt,
    })
    .from(sheetBindings)
    .where(eq(sheetBindings.userId, userId));
}
export async function bindSheet(
  config: AppConfig,
  database: Database | undefined,
  userId: number,
  input: unknown,
) {
  const db = dbOrThrow(database);
  const parsed = parseBindingInput(input);
  const connection = await ownedConnection(
    db,
    userId,
    parsed.googleConnectionId,
  );
  const { client, title } = await sheetAccess(
    config,
    connection,
    parsed.spreadsheetId,
    parsed.tabName,
  );
  let values;
  try {
    values = await client.spreadsheets.values.get({
      spreadsheetId: parsed.spreadsheetId,
      range: `${parsed.tabName}!1:1`,
    });
  } catch {
    throw new SheetsError("provider_failed");
  }
  const mapping = mappingForHeaderRow(values.data.values?.[0] ?? []);
  await db
    .insert(sheetBindings)
    .values({
      userId,
      googleConnectionId: parsed.googleConnectionId,
      spreadsheetId: parsed.spreadsheetId,
      tabName: parsed.tabName,
      headerMappingJson: JSON.stringify(mapping),
      status: "active",
    })
    .onDuplicateKeyUpdate({
      set: {
        googleConnectionId: parsed.googleConnectionId,
        headerMappingJson: JSON.stringify(mapping),
        status: "active",
      },
    });
  const [binding] = await db
    .select({ id: sheetBindings.id })
    .from(sheetBindings)
    .where(
      and(
        eq(sheetBindings.userId, userId),
        eq(sheetBindings.spreadsheetId, parsed.spreadsheetId),
        eq(sheetBindings.tabName, parsed.tabName),
      ),
    )
    .limit(1);
  return {
    id: binding?.id ?? 0,
    spreadsheetId: parsed.spreadsheetId,
    spreadsheetTitle: title,
    tabName: parsed.tabName,
    mapping,
  };
}
export async function importSheetLeads(
  config: AppConfig,
  database: Database | undefined,
  userId: number,
  input: unknown,
) {
  const db = dbOrThrow(database);
  const parsed = parseImportInput(input);
  const [binding] = await db
    .select()
    .from(sheetBindings)
    .where(
      and(
        eq(sheetBindings.id, parsed.bindingId),
        eq(sheetBindings.userId, userId),
        eq(sheetBindings.status, "active"),
      ),
    )
    .limit(1);
  if (!binding) throw new SheetsError("binding_not_found");
  const connection = await ownedConnection(
    db,
    userId,
    binding.googleConnectionId,
  );
  const { client } = await sheetAccess(
    config,
    connection,
    binding.spreadsheetId,
    binding.tabName,
  );
  let values;
  try {
    values = await client.spreadsheets.values.get({
      spreadsheetId: binding.spreadsheetId,
      range: `${binding.tabName}!A:ZZ`,
      majorDimension: "ROWS",
    });
  } catch {
    throw new SheetsError("provider_failed");
  }
  const rows = values.data.values ?? [];
  const mapping = JSON.parse(binding.headerMappingJson) as HeaderMapping;
  const leadIds: number[] = [];
  let skippedCount = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const email = cell(row, mapping.email)?.toLowerCase();
    if (!email || !validEmail(email)) {
      skippedCount += 1;
      continue;
    }
    const firstName = cell(row, mapping.firstName);
    const lastName = cell(row, mapping.lastName);
    const sourceRowKey = String(index + 1);
    const fieldsJson = JSON.stringify({
      source: "google_sheets",
      spreadsheetId: binding.spreadsheetId,
      tabName: binding.tabName,
      row: index + 1,
    });
    const [existing] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.userId, userId), eq(leads.email, email)))
      .limit(1);
    if (existing) {
      await db
        .update(leads)
        .set({
          sheetBindingId: binding.id,
          sourceRowKey,
          firstName,
          lastName,
          fieldsJson,
          updatedAt: new Date(),
        })
        .where(and(eq(leads.id, existing.id), eq(leads.userId, userId)));
      leadIds.push(existing.id);
    } else {
      const result = await db.insert(leads).values({
        userId,
        sheetBindingId: binding.id,
        sourceRowKey,
        email,
        firstName,
        lastName,
        fieldsJson,
        status: "imported",
      });
      leadIds.push(Number(result[0]?.insertId ?? 0));
    }
  }
  return {
    bindingId: binding.id,
    importedCount: leadIds.length,
    skippedCount,
    leadIds,
  };
}
export async function listLeads(
  database: Database | undefined,
  userId: number,
  status?: string,
) {
  const db = dbOrThrow(database);
  const conditions = [eq(leads.userId, userId)];
  if (
    status &&
    ["imported", "suppressed", "invalid", "archived"].includes(status)
  )
    conditions.push(
      eq(
        leads.status,
        status as "imported" | "suppressed" | "invalid" | "archived",
      ),
    );
  return db
    .select({
      id: leads.id,
      email: leads.email,
      firstName: leads.firstName,
      lastName: leads.lastName,
      sourceRowKey: leads.sourceRowKey,
      status: leads.status,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .where(and(...conditions));
}
