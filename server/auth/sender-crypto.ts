import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { AppConfig } from "../config/env.js";

const VERSION = "v1";

function encryptionKey(config: AppConfig): Buffer {
  const source = config.TOKEN_ENCRYPTION_KEY;
  if (!source) throw new Error("TOKEN_ENCRYPTION_KEY is required");
  return createHash("sha256").update(source, "utf8").digest();
}

function stateKey(config: AppConfig): Uint8Array {
  if (!config.OAUTH_STATE_SIGNING_KEY) {
    throw new Error("OAUTH_STATE_SIGNING_KEY is required");
  }
  return new TextEncoder().encode(config.OAUTH_STATE_SIGNING_KEY);
}

export function encryptToken(config: AppConfig, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(config), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptToken(config: AppConfig, payload: string): string {
  const [version, ivText, tagText, ciphertextText] = payload.split(".");
  if (version !== VERSION || !ivText || !tagText || !ciphertextText) {
    throw new Error("Invalid encrypted token");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(config),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export type SenderStateClaims = {
  userId: number;
  sessionIdentifier: string;
  nativeReturnUri: string;
  nonce: string;
};

export async function signSenderState(
  config: AppConfig,
  claims: SenderStateClaims,
  now = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({
    purpose: "sender-authorization",
    user_id: claims.userId,
    session_identifier: claims.sessionIdentifier,
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
    .setSubject(String(claims.userId))
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + config.OAUTH_STATE_LIFETIME_SECONDS)
    .setJti(claims.nonce)
    .sign(stateKey(config));
}

export async function verifySenderState(
  config: AppConfig,
  token: string,
  now = new Date(),
): Promise<SenderStateClaims> {
  const { payload } = await jwtVerify(token, stateKey(config), {
    issuer: config.AUTH_ISSUER,
    audience: config.AUTH_AUDIENCE,
    algorithms: ["HS256"],
    currentDate: now,
  });
  const userId = Number(payload.user_id);
  if (
    payload.purpose !== "sender-authorization" ||
    !Number.isSafeInteger(userId) ||
    userId <= 0 ||
    payload.sub !== String(userId) ||
    typeof payload.session_identifier !== "string" ||
    typeof payload.native_return_uri !== "string" ||
    typeof payload.nonce !== "string" ||
    payload.jti !== payload.nonce
  )
    throw new Error("Invalid sender authorization state");
  return {
    userId,
    sessionIdentifier: payload.session_identifier,
    nativeReturnUri: payload.native_return_uri,
    nonce: payload.nonce,
  };
}

export function hashSenderValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
