# Phase 9 — Durable Campaign and Job System

Phase 9 creates the durable bridge between reviewed, user-owned records and later provider execution. It does not send Gmail messages; provider execution remains the Phase 10 boundary.

## Campaign requirements

A campaign requires an owner-scoped active sender connection, active Sheet binding, template, name, mode, and approval policy. Live campaigns are required to use manual approval. A campaign remains `draft` until explicitly approved, then becomes `ready`.

Job creation is transactional. It selects only imported leads owned by the campaign user and attached to the campaign's Sheet binding, materializes the campaign-lead relationship, and creates one queued job per deterministic message-version key:

`campaign:{campaignId}:lead:{leadId}:template:{templateId}:v{templateVersion}`

The unique database index makes job creation idempotent across retries and worker restarts.

## Durable worker primitives

The service includes transactional primitives for reclaiming expired leases, claiming the next eligible job with a worker owner and expiration, completing only a matching lease, and failing a matching lease with bounded exponential retry. Safe error codes, retry timestamps, attempt counts, provider message IDs, and completion timestamps are stored on the job record.

Workspace pause and kill-switch controls are read before job creation. Pause blocks new job creation while kill switch blocks it immediately. Workspace concurrency limits are persisted for the worker boundary and remain owner-scoped.

## Routes

| Route                             | Purpose                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `GET /api/campaigns`              | List campaigns owned by the session user                           |
| `POST /api/campaigns`             | Validate explicit campaign configuration and create a draft        |
| `POST /api/campaigns/:id/approve` | Explicitly approve a campaign                                      |
| `POST /api/campaigns/:id/jobs`    | Transactionally create idempotent jobs for eligible imported leads |
| `GET /api/jobs`                   | List safe job metadata owned by the session user                   |
| `GET /api/workspace/control`      | Read pause, kill switch, and concurrency controls                  |
| `PATCH /api/workspace/control`    | Update owner-scoped workspace controls                             |

The Phase 9 worker does not call Gmail. Dry-run simulation and the separate Gmail provider worker are intentionally deferred to Phase 10, where provider calls will be surrounded by a final control re-read and provider-specific safety rules.

## Validation evidence

- deterministic idempotency-key tests
- explicit campaign configuration validation tests
- bounded retry and permanent-failure tests
- backend typecheck and build
- mobile typecheck and Expo export
- migration consistency and formatting checks

Physical-device, Railway, and live-provider acceptance remain deferred to Phases 11 and 12.
