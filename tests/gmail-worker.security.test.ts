import { describe, expect, it } from "vitest";
import {
  buildMimeMessage,
  classifyProviderError,
  encodeBase64Url,
  encodeMimeHeader,
  WorkerRateLimiter,
} from "../server/gmail-worker.js";

describe("Phase 10 Gmail provider worker safety", () => {
  it("sanitizes MIME headers and encodes non-ASCII headers safely", () => {
    expect(encodeMimeHeader("Hello\r\nBcc: attacker@example.com")).toBe(
      "Hello Bcc: attacker@example.com",
    );
    expect(encodeMimeHeader("Olá from Studio")).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    const mime = buildMimeMessage({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Olá",
      body: "Hello\nWorld",
    });
    expect(mime).toContain("To: recipient@example.com");
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).toContain("Hello\r\nWorld");
  });

  it("uses Gmail-safe base64url encoding without padding", () => {
    expect(encodeBase64Url("hello? world")).toBe("aGVsbG8_IHdvcmxk");
  });

  it("classifies invalid_grant and transient provider failures safely", () => {
    expect(
      classifyProviderError({
        code: 400,
        response: { data: { error: "invalid_grant" } },
      }),
    ).toMatchObject({
      category: "reauthorization_required",
      code: "reauthorization_required",
    });
    expect(classifyProviderError({ code: 503 })).toMatchObject({
      category: "retryable",
      code: "provider_transient",
    });
    expect(classifyProviderError({ code: 403 })).toMatchObject({
      category: "permanent",
      code: "provider_rejected",
    });
  });

  it("paces repeated sender and campaign work", () => {
    const limiter = new WorkerRateLimiter(1000);
    expect(limiter.allow(["sender:1", "campaign:2"], 10_000)).toBe(true);
    expect(limiter.allow(["sender:1", "campaign:2"], 10_500)).toBe(false);
    expect(limiter.allow(["sender:1", "campaign:2"], 11_000)).toBe(true);
  });
});
