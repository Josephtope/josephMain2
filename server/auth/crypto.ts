import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { AppConfig } from "../config/env.js";

export type LoginStateClaims = {
  nativeReturnUri: string;
  nonce: string;
};

export type SessionClaims = {
  sessionIdentifier: string;
};

function keyFor(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function randomOpaqueValue(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function isAllowedNativeReturnUri(
  uri: string,
  allowedUris: readonly string[],
): boolean {
  return allowedUris.includes(uri);
}

function requireSigningKey(config: AppConfig): string {
  const key = config.SESSION_SIGNING_KEY ?? config.SESSION_SECRET;
  if (!key)
    throw new Error("Invalid server configuration: SESSION_SIGNING_KEY");
  return key;
}

function requireStateSigningKey(config: AppConfig): string {
  if (!config.OAUTH_STATE_SIGNING_KEY) {
    throw new Error("Invalid server configuration: OAUTH_STATE_SIGNING_KEY");
  }
  return config.OAUTH_STATE_SIGNING_KEY;
}

export async function signLoginState(
  config: AppConfig,
  claims: LoginStateClaims,
  now = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({
    purpose: "application-login",
    native_return_uri: claims.nativeReturnUri,
    nonce: claims.nonce,
  })
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
      kid: config.OAUTH_STATE_KEY_VERSION,
    })
    .setIssuer(config.AUTH_ISSUER)
    .setAudience(config.AUTH_AUDIENCE)
    .setSubject(claims.nonce)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + config.OAUTH_STATE_LIFETIME_SECONDS)
    .setJti(claims.nonce)
    .sign(keyFor(requireStateSigningKey(config)));
}

export async function verifyLoginState(
  config: AppConfig,
  token: string,
  now = new Date(),
): Promise<LoginStateClaims> {
  const { payload } = await jwtVerify(
    token,
    keyFor(requireStateSigningKey(config)),
    {
      issuer: config.AUTH_ISSUER,
      audience: config.AUTH_AUDIENCE,
      algorithms: ["HS256"],
      currentDate: now,
    },
  );
  if (
    payload.purpose !== "application-login" ||
    typeof payload.nonce !== "string" ||
    typeof payload.native_return_uri !== "string" ||
    payload.sub !== payload.nonce ||
    payload.jti !== payload.nonce
  ) {
    throw new Error("Invalid application login state");
  }
  return {
    nonce: payload.nonce,
    nativeReturnUri: payload.native_return_uri,
  };
}

export async function createSessionCredential(
  config: AppConfig,
  userId: number,
  sessionIdentifier: string,
  now = new Date(),
  persistedExpiresAt?: Date,
): Promise<{ credential: string; expiresAt: Date }> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt =
    persistedExpiresAt ??
    new Date(now.getTime() + config.SESSION_LIFETIME_SECONDS * 1000);
  const credential = await new SignJWT({
    purpose: "application-session",
    session_identifier: sessionIdentifier,
  })
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
      kid: config.SESSION_KEY_VERSION,
    })
    .setIssuer(config.AUTH_ISSUER)
    .setAudience(config.AUTH_AUDIENCE)
    .setSubject(String(userId))
    .setIssuedAt(issuedAt)
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setJti(sessionIdentifier)
    .sign(keyFor(requireSigningKey(config)));
  return { credential, expiresAt };
}

export async function verifySessionCredential(
  config: AppConfig,
  credential: string,
  now = new Date(),
): Promise<{ userId: number; sessionIdentifier: string; payload: JWTPayload }> {
  const { payload } = await jwtVerify(
    credential,
    keyFor(requireSigningKey(config)),
    {
      issuer: config.AUTH_ISSUER,
      audience: config.AUTH_AUDIENCE,
      algorithms: ["HS256"],
      currentDate: now,
    },
  );
  if (
    payload.purpose !== "application-session" ||
    typeof payload.sub !== "string" ||
    typeof payload.session_identifier !== "string" ||
    payload.jti !== payload.session_identifier
  ) {
    throw new Error("Invalid application session");
  }
  const userId = Number(payload.sub);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("Invalid application session");
  }
  return {
    userId,
    sessionIdentifier: payload.session_identifier,
    payload,
  };
}

export function hashBearerValue(value: string): string {
  return sha256(value);
}

export function redactSensitiveValue(value: unknown): string {
  return typeof value === "string" && value.length > 0
    ? "[redacted]"
    : "[absent]";
}

export function hasRequiredClaims(payload: JWTPayload): boolean {
  return Boolean(
    payload.iss && payload.aud && payload.sub && payload.iat && payload.exp,
  );
}
