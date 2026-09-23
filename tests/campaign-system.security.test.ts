import { describe, expect, it } from "vitest";
import {
  idempotencyKey,
  parseCampaignInput,
  retryDecision,
} from "../server/campaign-service.js";

describe("Phase 9 durable campaign and job safety", () => {
  it("builds stable message-version idempotency keys", () => {
    expect(idempotencyKey(4, 9, 2, 3)).toBe("campaign:4:lead:9:template:2:v3");
    expect(idempotencyKey(4, 9, 2, 3)).toBe(idempotencyKey(4, 9, 2, 3));
    expect(idempotencyKey(4, 9, 2, 3)).not.toBe(idempotencyKey(4, 9, 2, 4));
  });

  it("requires explicit campaign resources and keeps live mode manual", () => {
    expect(
      parseCampaignInput({
        name: "April outreach",
        senderConnectionId: "1",
        sheetBindingId: "2",
        templateId: "3",
        mode: "dry_run",
        approvalPolicy: "automatic",
      }),
    ).toMatchObject({
      senderConnectionId: 1,
      sheetBindingId: 2,
      templateId: 3,
    });
    expect(() =>
      parseCampaignInput({
        name: "Live outreach",
        senderConnectionId: 1,
        sheetBindingId: 2,
        templateId: 3,
        mode: "unknown",
        approvalPolicy: "automatic",
      }),
    ).toThrow();
  });

  it("uses bounded exponential retry and stops permanent failures", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(retryDecision(1, true, now).status).toBe("queued");
    expect(retryDecision(1, true, now).nextAttemptAt?.toISOString()).toBe(
      "2026-01-01T00:01:00.000Z",
    );
    expect(retryDecision(3, true, now)).toEqual({
      status: "failed",
      nextAttemptAt: null,
    });
    expect(retryDecision(0, false, now)).toEqual({
      status: "failed",
      nextAttemptAt: null,
    });
  });
});
