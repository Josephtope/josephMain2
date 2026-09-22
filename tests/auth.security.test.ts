import { describe, expect, it } from "vitest";
import { loadConfig } from "../server/config/env.js";
import {
  constantTimeEqual,
  createSessionCredential,
  hashBearerValue,
  isAllowedNativeReturnUri,
  randomOpaqueValue,
  sha256,
  signLoginState,
  verifyLoginState,
  verifySessionCredential,
} from "../server/auth/crypto.js";

const config = loadConfig({
  NODE_ENV: "test",
  PORT: "3000",
  PUBLIC_API_ORIGINS: "http://localhost:8081",
  OAUTH_STATE_SIGNING_KEY: "state-signing-key-that-is-at-least-32-characters",
  SESSION_SIGNING_KEY: "session-signing-key-that-is-at-least-32-characters",
  TOKEN_ENCRYPTION_KEY: "token-encryption-key",
  NATIVE_RETURN_URI_ALLOWLIST: "manusstudio://oauth/callback",
});

describe("application login security primitives", () => {
  it("accepts only explicitly allowed native return URIs", () => {
    expect(
      isAllowedNativeReturnUri(
        "manusstudio://oauth/callback",
        config.NATIVE_RETURN_URI_ALLOWLIST,
      ),
    ).toBe(true);
    expect(
      isAllowedNativeReturnUri(
        "https://attacker.example/callback",
        config.NATIVE_RETURN_URI_ALLOWLIST,
      ),
    ).toBe(false);
  });

  it("hashes opaque bearer values and compares hashes in constant time", () => {
    const value = randomOpaqueValue();
    const hash = hashBearerValue(value);
    expect(hash).toBe(sha256(value));
    expect(constantTimeEqual(hash, sha256(value))).toBe(true);
    expect(constantTimeEqual(hash, sha256(`${value}-tampered`))).toBe(false);
  });

  it("rejects tampered, wrong-purpose, wrong-audience, and expired login state", async () => {
    const issuedAt = new Date("2026-09-23T00:00:00.000Z");
    const state = await signLoginState(
      config,
      { nativeReturnUri: "manusstudio://oauth/callback", nonce: "nonce-1" },
      issuedAt,
    );
    await expect(
      verifyLoginState(config, `${state}tampered`, issuedAt),
    ).rejects.toThrow();
    await expect(
      verifyLoginState(config, state, new Date("2026-09-23T00:11:00.000Z")),
    ).rejects.toThrow();
    const wrongAudience = await signLoginState(
      { ...config, AUTH_AUDIENCE: "other-api" },
      { nativeReturnUri: "manusstudio://oauth/callback", nonce: "nonce-2" },
      issuedAt,
    );
    await expect(
      verifyLoginState(config, wrongAudience, issuedAt),
    ).rejects.toThrow();
  });

  it("requires the signed session to contain the expected identity and purpose claims", async () => {
    const now = new Date("2026-09-23T00:00:00.000Z");
    const { credential, expiresAt } = await createSessionCredential(
      config,
      42,
      "session-42",
      now,
    );
    expect(expiresAt.getTime()).toBe(
      now.getTime() + config.SESSION_LIFETIME_SECONDS * 1000,
    );
    await expect(
      verifySessionCredential(config, credential, now),
    ).resolves.toMatchObject({
      userId: 42,
      sessionIdentifier: "session-42",
    });
    await expect(
      verifySessionCredential(
        config,
        credential,
        new Date(expiresAt.getTime() + 1000),
      ),
    ).rejects.toThrow();
  });
});
