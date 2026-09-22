import { describe, expect, it } from "vitest";
import { loadConfig } from "../server/config/env.js";
import { checkDatabase } from "../server/db/client.js";
import {
  createAuthContext,
  requireAuthenticated,
} from "../server/security/auth-context.js";

describe("server configuration", () => {
  it("accepts a safe test configuration and exposes no secret values", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      PORT: "3000",
      PUBLIC_API_ORIGINS: "http://localhost:8081",
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
    });
    expect(config.allowedOrigins).toEqual(["http://localhost:8081"]);
    expect(config).not.toHaveProperty("GOOGLE_CLIENT_SECRET");
  });

  it("rejects short production signing keys", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        PORT: "3000",
        SESSION_SIGNING_KEY: "short",
        TOKEN_ENCRYPTION_KEY: "short",
      }),
    ).toThrow(/SESSION_SIGNING_KEY/);
  });
});

describe("authentication boundary", () => {
  it("extracts bearer credentials without trusting or decoding them", () => {
    const request = {
      requestId: "test-request",
      header: (name: string) =>
        ({
          authorization: "Bearer opaque-session-value",
          cookie: "sms_session=web-session",
        })[name],
    } as never;
    const context = createAuthContext(request);
    expect(context.bearerToken).toBe("opaque-session-value");
    expect(requireAuthenticated(context)).toBe("opaque-session-value");
  });

  it("rejects requests without credentials", () => {
    expect(() => requireAuthenticated({})).toThrow(/authentication/);
  });
});

describe("database readiness", () => {
  it("distinguishes an unconfigured database from a reachable one", async () => {
    await expect(checkDatabase(undefined)).resolves.toEqual({
      configured: false,
      reachable: false,
    });
  });
});
