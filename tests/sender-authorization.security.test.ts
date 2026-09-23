import { describe, expect, it } from "vitest";
import { loadConfig } from "../server/config/env.js";
import {
  decryptToken,
  encryptToken,
  signSenderState,
  verifySenderState,
} from "../server/auth/sender-crypto.js";

function config() {
  return loadConfig({
    NODE_ENV: "test",
    TOKEN_ENCRYPTION_KEY: "phase6-test-encryption-key-123456",
    OAUTH_STATE_SIGNING_KEY: "phase6-test-state-signing-key-123456",
    AUTH_ISSUER: "issuer",
    AUTH_AUDIENCE: "audience",
    NATIVE_RETURN_URI_ALLOWLIST: "manusstudio://oauth/callback",
  });
}

describe("Phase 6 sender authorization security", () => {
  it("encrypts and decrypts token material without storing plaintext", () => {
    const encrypted = encryptToken(config(), "refresh-token-secret");
    expect(encrypted).not.toContain("refresh-token-secret");
    expect(decryptToken(config(), encrypted)).toBe("refresh-token-secret");
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;
    expect(() => decryptToken(config(), tampered)).toThrow();
  });

  it("binds signed sender state to user, session, nonce, and native URI", async () => {
    const issuedAt = new Date("2026-01-01T00:00:00.000Z");
    const token = await signSenderState(
      config(),
      {
        userId: 42,
        sessionIdentifier: "session-42",
        nativeReturnUri: "manusstudio://oauth/callback",
        nonce: "nonce-42",
      },
      issuedAt,
    );
    await expect(
      verifySenderState(config(), token, new Date("2026-01-01T00:05:00.000Z")),
    ).resolves.toMatchObject({
      userId: 42,
      sessionIdentifier: "session-42",
      nativeReturnUri: "manusstudio://oauth/callback",
      nonce: "nonce-42",
    });
    await expect(
      verifySenderState(config(), token, new Date("2026-01-01T00:11:00.000Z")),
    ).rejects.toThrow();
  });

  it("rejects a state signed with a different key", async () => {
    const token = await signSenderState(config(), {
      userId: 1,
      sessionIdentifier: "s",
      nativeReturnUri: "manusstudio://oauth/callback",
      nonce: "n",
    });
    const other = loadConfig({
      NODE_ENV: "test",
      TOKEN_ENCRYPTION_KEY: "phase6-test-encryption-key-123456",
      OAUTH_STATE_SIGNING_KEY: "different-phase6-state-signing-key-123456",
    });
    await expect(verifySenderState(other, token)).rejects.toThrow();
  });
});
