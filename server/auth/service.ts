import { google } from "googleapis";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { AppConfig } from "../config/env.js";
import type { Database } from "../db/client.js";
import {
  loginExchangeCodes,
  oauthLoginStates,
  sessions,
  users,
} from "../db/schema.js";
import { log } from "../http/logger.js";
import {
  createSessionCredential,
  constantTimeEqual,
  hashBearerValue,
  isAllowedNativeReturnUri,
  randomOpaqueValue,
  sha256,
  signLoginState,
  verifyLoginState,
  verifySessionCredential,
} from "./crypto.js";

export class AuthFlowError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.name = "AuthFlowError";
    this.code = code;
    this.status = status;
  }
}

function requireDatabase(database: Database | undefined): Database {
  if (!database) throw new AuthFlowError("service_unavailable", 503);
  return database;
}

function requireGoogleConfig(config: AppConfig): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  if (
    !config.GOOGLE_OAUTH_CLIENT_ID ||
    !config.GOOGLE_OAUTH_CLIENT_SECRET ||
    !config.GOOGLE_OAUTH_REDIRECT_URI
  ) {
    throw new AuthFlowError("oauth_unavailable", 503);
  }
  return {
    clientId: config.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: config.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: config.GOOGLE_OAUTH_REDIRECT_URI,
  };
}

function oauthClient(config: AppConfig) {
  const googleConfig = requireGoogleConfig(config);
  return {
    config: googleConfig,
    client: new google.auth.OAuth2(
      googleConfig.clientId,
      googleConfig.clientSecret,
      googleConfig.redirectUri,
    ),
  };
}

function assertNativeReturnUri(
  config: AppConfig,
  nativeReturnUri: string,
): void {
  if (
    !isAllowedNativeReturnUri(
      nativeReturnUri,
      config.NATIVE_RETURN_URI_ALLOWLIST,
    )
  ) {
    throw new AuthFlowError("invalid_native_return_uri");
  }
}

export async function beginApplicationLogin(
  config: AppConfig,
  database: Database | undefined,
  nativeReturnUri: string,
): Promise<string> {
  assertNativeReturnUri(config, nativeReturnUri);
  const db = requireDatabase(database);
  const { client } = oauthClient(config);
  const nonce = randomOpaqueValue(24);
  const signedState = await signLoginState(config, {
    nativeReturnUri,
    nonce,
  });
  await db.insert(oauthLoginStates).values({
    stateHash: sha256(signedState),
    nativeReturnUri,
    nonceHash: sha256(nonce),
    expiresAt: new Date(
      Date.now() + config.OAUTH_STATE_LIFETIME_SECONDS * 1000,
    ),
  });
  return client.generateAuthUrl({
    access_type: "online",
    include_granted_scopes: false,
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state: signedState,
  });
}

async function consumeLoginState(
  config: AppConfig,
  database: Database | undefined,
  state: string,
): Promise<{ nativeReturnUri: string; nonce: string }> {
  const db = requireDatabase(database);
  const claims = await verifyLoginState(config, state).catch(() => {
    throw new AuthFlowError("invalid_login_state");
  });
  const [record] = await db
    .select()
    .from(oauthLoginStates)
    .where(
      and(
        eq(oauthLoginStates.stateHash, sha256(state)),
        eq(oauthLoginStates.nativeReturnUri, claims.nativeReturnUri),
        eq(oauthLoginStates.nonceHash, sha256(claims.nonce)),
        isNull(oauthLoginStates.consumedAt),
        gt(oauthLoginStates.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!record) throw new AuthFlowError("invalid_login_state");
  const result = await db
    .update(oauthLoginStates)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(oauthLoginStates.id, record.id),
        isNull(oauthLoginStates.consumedAt),
      ),
    );
  if (result[0].affectedRows !== 1) {
    throw new AuthFlowError("invalid_login_state");
  }
  return claims;
}

async function exchangeGoogleIdentity(config: AppConfig, code: string) {
  const { client } = oauthClient(config);
  const { tokens } = await client.getToken({
    code,
    redirect_uri: requireGoogleConfig(config).redirectUri,
  });
  if (!tokens.id_token) throw new AuthFlowError("identity_exchange_failed");
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: requireGoogleConfig(config).clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new AuthFlowError("identity_exchange_failed");
  }
  return {
    providerSubject: payload.sub,
    email: payload.email,
    displayName: payload.name ?? null,
    avatarUrl: payload.picture ?? null,
  };
}

function nativeLoginRedirect(nativeReturnUri: string, code: string): string {
  const redirect = new URL(nativeReturnUri);
  redirect.search = "";
  redirect.hash = "";
  redirect.searchParams.set("flow", "login");
  redirect.searchParams.set("code", code);
  return redirect.toString();
}

export async function completeApplicationLogin(
  config: AppConfig,
  database: Database | undefined,
  input: { code: string; state: string },
  requestId?: string,
): Promise<string> {
  const claims = await consumeLoginState(config, database, input.state);
  let identity;
  try {
    identity = await exchangeGoogleIdentity(config, input.code);
  } catch (error) {
    log("warn", "auth.google_identity_failed", {
      requestId,
      stage: "identity_exchange",
    });
    if (error instanceof AuthFlowError) throw error;
    throw new AuthFlowError("identity_exchange_failed");
  }
  const db = requireDatabase(database);
  const now = new Date();
  const existing = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.provider, "google"),
        eq(users.providerSubject, identity.providerSubject),
      ),
    )
    .limit(1);
  let userId: number;
  if (existing[0]) {
    if (existing[0].status !== "active")
      throw new AuthFlowError("account_unavailable", 403);
    userId = existing[0].id;
    await db
      .update(users)
      .set({
        email: identity.email,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        lastLoginAt: now,
      })
      .where(eq(users.id, userId));
  } else {
    const inserted = await db.insert(users).values({
      provider: "google",
      providerSubject: identity.providerSubject,
      email: identity.email,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      lastLoginAt: now,
    });
    userId = Number(inserted[0].insertId);
  }
  const sessionIdentifier = randomOpaqueValue(18);
  const session = await createSessionCredential(
    config,
    userId,
    sessionIdentifier,
    now,
  );
  const insertedSession = await db.insert(sessions).values({
    userId,
    sessionIdentifier,
    tokenHash: hashBearerValue(session.credential),
    createdAt: now,
    expiresAt: session.expiresAt,
  });
  const exchangeCode = randomOpaqueValue(32);
  await db.insert(loginExchangeCodes).values({
    codeHash: sha256(exchangeCode),
    userId,
    sessionId: Number(insertedSession[0].insertId),
    nativeReturnUri: claims.nativeReturnUri,
    expiresAt: new Date(
      now.getTime() + config.LOGIN_EXCHANGE_CODE_LIFETIME_SECONDS * 1000,
    ),
  });
  return nativeLoginRedirect(claims.nativeReturnUri, exchangeCode);
}

export async function exchangeLoginCode(
  config: AppConfig,
  database: Database | undefined,
  input: { code: string; nativeReturnUri: string },
): Promise<{ credential: string; expiresAt: Date }> {
  assertNativeReturnUri(config, input.nativeReturnUri);
  const db = requireDatabase(database);
  const [record] = await db
    .select()
    .from(loginExchangeCodes)
    .where(
      and(
        eq(loginExchangeCodes.codeHash, sha256(input.code)),
        eq(loginExchangeCodes.nativeReturnUri, input.nativeReturnUri),
        isNull(loginExchangeCodes.consumedAt),
        gt(loginExchangeCodes.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!record) throw new AuthFlowError("invalid_exchange_code");
  const consumed = await db
    .update(loginExchangeCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(loginExchangeCodes.id, record.id),
        isNull(loginExchangeCodes.consumedAt),
      ),
    );
  if (consumed[0].affectedRows !== 1) {
    throw new AuthFlowError("invalid_exchange_code");
  }
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, record.sessionId),
        eq(sessions.userId, record.userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!session) throw new AuthFlowError("invalid_exchange_code");
  const signed = await createSessionCredential(
    config,
    session.userId,
    session.sessionIdentifier,
    session.createdAt,
    session.expiresAt,
  );
  if (!constantTimeSessionHash(signed.credential, session.tokenHash)) {
    throw new AuthFlowError("invalid_exchange_code");
  }
  return signed;
}

function constantTimeSessionHash(
  credential: string,
  expectedHash: string,
): boolean {
  return constantTimeEqual(sha256(credential), expectedHash);
}

export async function authenticateSession(
  config: AppConfig,
  database: Database | undefined,
  credential: string,
) {
  const claims = await verifySessionCredential(config, credential).catch(() => {
    throw new AuthFlowError("invalid_session", 401);
  });
  const db = requireDatabase(database);
  const [session] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.sessionIdentifier, claims.sessionIdentifier),
        eq(sessions.userId, claims.userId),
        eq(sessions.tokenHash, hashBearerValue(credential)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        eq(users.status, "active"),
      ),
    )
    .limit(1);
  if (!session) throw new AuthFlowError("invalid_session", 401);
  return {
    userId: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    avatarUrl: session.user.avatarUrl,
  };
}

export async function revokeSession(
  config: AppConfig,
  database: Database | undefined,
  credential: string | undefined,
): Promise<void> {
  if (!credential) return;
  const claims = await verifySessionCredential(config, credential).catch(
    () => undefined,
  );
  if (!claims || !database) return;
  await database
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.sessionIdentifier, claims.sessionIdentifier),
        eq(sessions.userId, claims.userId),
        eq(sessions.tokenHash, hashBearerValue(credential)),
        isNull(sessions.revokedAt),
      ),
    );
}
