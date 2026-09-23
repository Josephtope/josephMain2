import { google } from "googleapis";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { AppConfig } from "../config/env.js";
import type { Database } from "../db/client.js";
import {
  googleConnectionStates,
  googleConnections,
  users,
} from "../db/schema.js";
import { authenticateSession } from "./service.js";
import {
  encryptToken,
  hashSenderValue,
  signSenderState,
  verifySenderState,
} from "./sender-crypto.js";
import {
  isAllowedNativeReturnUri,
  randomOpaqueValue,
  verifySessionCredential,
} from "./crypto.js";

const SENDER_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
];

export class SenderAuthError extends Error {
  constructor(
    public readonly code:
      | "invalid_session"
      | "invalid_return_uri"
      | "state_invalid"
      | "token_exchange_failed"
      | "profile_lookup_failed"
      | "scope_insufficient"
      | "storage_failed",
  ) {
    super(code);
  }
}

function oauthClient(
  config: AppConfig,
): InstanceType<typeof google.auth.OAuth2> {
  if (
    !config.GOOGLE_OAUTH_CLIENT_ID ||
    !config.GOOGLE_OAUTH_CLIENT_SECRET ||
    !config.GOOGLE_CONNECTION_REDIRECT_URI
  ) {
    throw new SenderAuthError("storage_failed");
  }
  return new google.auth.OAuth2(
    config.GOOGLE_OAUTH_CLIENT_ID,
    config.GOOGLE_OAUTH_CLIENT_SECRET,
    config.GOOGLE_CONNECTION_REDIRECT_URI,
  );
}

function requireDatabase(database: Database | undefined): Database {
  if (!database) throw new SenderAuthError("storage_failed");
  return database;
}

export async function beginSenderAuthorization(
  config: AppConfig,
  database: Database | undefined,
  credential: string | undefined,
  nativeReturnUri: string,
): Promise<string> {
  if (!credential) throw new SenderAuthError("invalid_session");
  if (
    !isAllowedNativeReturnUri(
      nativeReturnUri,
      config.NATIVE_RETURN_URI_ALLOWLIST,
    )
  ) {
    throw new SenderAuthError("invalid_return_uri");
  }
  const db = requireDatabase(database);
  const session = await authenticateSession(config, db, credential).catch(
    () => {
      throw new SenderAuthError("invalid_session");
    },
  );
  const claims = await verifySessionCredential(config, credential).catch(() => {
    throw new SenderAuthError("invalid_session");
  });
  const nonce = randomOpaqueValue(24);
  const state = await signSenderState(config, {
    userId: session.userId,
    sessionIdentifier: claims.sessionIdentifier,
    nativeReturnUri,
    nonce,
  });
  const expiresAt = new Date(
    Date.now() + config.OAUTH_STATE_LIFETIME_SECONDS * 1000,
  );
  await db.insert(googleConnectionStates).values({
    stateHash: hashSenderValue(state),
    userId: session.userId,
    sessionIdentifier: claims.sessionIdentifier,
    nativeReturnUri,
    nonceHash: hashSenderValue(nonce),
    expiresAt,
  });
  return oauthClient(config).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: SENDER_SCOPES,
    state,
  });
}

export async function completeSenderAuthorization(
  config: AppConfig,
  database: Database | undefined,
  input: { code: string; state: string },
): Promise<string> {
  const db = requireDatabase(database);
  let state;
  try {
    state = await verifySenderState(config, input.state);
  } catch {
    throw new SenderAuthError("state_invalid");
  }
  if (
    !isAllowedNativeReturnUri(
      state.nativeReturnUri,
      config.NATIVE_RETURN_URI_ALLOWLIST,
    )
  ) {
    throw new SenderAuthError("state_invalid");
  }
  const [record] = await db
    .select()
    .from(googleConnectionStates)
    .where(
      and(
        eq(googleConnectionStates.stateHash, hashSenderValue(input.state)),
        eq(googleConnectionStates.userId, state.userId),
        eq(googleConnectionStates.sessionIdentifier, state.sessionIdentifier),
        isNull(googleConnectionStates.consumedAt),
        gt(googleConnectionStates.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (
    !record ||
    record.nativeReturnUri !== state.nativeReturnUri ||
    record.nonceHash !== hashSenderValue(state.nonce)
  ) {
    throw new SenderAuthError("state_invalid");
  }
  const consumed = await db
    .update(googleConnectionStates)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(googleConnectionStates.id, record.id),
        isNull(googleConnectionStates.consumedAt),
      ),
    );
  if (consumed[0].affectedRows !== 1)
    throw new SenderAuthError("state_invalid");

  const client = oauthClient(config);
  let tokens;
  try {
    const result = await client.getToken(input.code);
    tokens = result.tokens;
  } catch {
    throw new SenderAuthError("token_exchange_failed");
  }
  if (!tokens.access_token || !tokens.refresh_token)
    throw new SenderAuthError("token_exchange_failed");

  client.setCredentials(tokens);
  let profile;
  try {
    profile = await google
      .oauth2({ version: "v2", auth: client })
      .userinfo.get();
  } catch {
    throw new SenderAuthError("profile_lookup_failed");
  }
  const email = profile.data.email?.trim().toLowerCase();
  const providerSubject = profile.data.id?.trim();
  if (!email || !providerSubject)
    throw new SenderAuthError("profile_lookup_failed");
  const grantedScopes = String(tokens.scope ?? "")
    .split(" ")
    .filter(Boolean);
  if (!grantedScopes.includes("https://www.googleapis.com/auth/gmail.send")) {
    throw new SenderAuthError("scope_insufficient");
  }
  try {
    await db
      .insert(googleConnections)
      .values({
        userId: state.userId,
        providerSubject,
        email,
        scopes: JSON.stringify(grantedScopes),
        accessTokenCiphertext: encryptToken(config, tokens.access_token),
        refreshTokenCiphertext: encryptToken(config, tokens.refresh_token),
        tokenExpiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        status: "active",
        lastValidatedAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          email,
          scopes: JSON.stringify(grantedScopes),
          accessTokenCiphertext: encryptToken(config, tokens.access_token),
          refreshTokenCiphertext: encryptToken(config, tokens.refresh_token),
          tokenExpiresAt: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : null,
          status: "active",
          lastValidatedAt: new Date(),
        },
      });
  } catch {
    throw new SenderAuthError("storage_failed");
  }
  const redirect = new URL(state.nativeReturnUri);
  redirect.searchParams.set("flow", "sender");
  redirect.searchParams.set("status", "success");
  return redirect.toString();
}

export async function listSenderConnections(
  database: Database | undefined,
  userId: number,
) {
  const db = requireDatabase(database);
  return db
    .select({
      id: googleConnections.id,
      email: googleConnections.email,
      scopes: googleConnections.scopes,
      status: googleConnections.status,
      tokenExpiresAt: googleConnections.tokenExpiresAt,
      lastValidatedAt: googleConnections.lastValidatedAt,
    })
    .from(googleConnections)
    .innerJoin(users, eq(users.id, googleConnections.userId))
    .where(
      and(eq(googleConnections.userId, userId), eq(users.status, "active")),
    );
}
