# Phase 10 — Gmail Provider Worker

Phase 10 adds the provider-execution boundary as a separate worker process. The worker has no HTTP listener and does not use `tsx` in its production entry point; it compiles to `dist/server/worker.js` and runs with Node.

## Safety flow

The worker claims only queued jobs through the Phase 9 lease primitive. Before an external request it re-reads owner workspace controls, verifies the campaign is running, confirms the sender connection is active and owner-scoped, validates the imported recipient, and renders a safe MIME message. Dry-run campaigns complete as explicit simulations without calling Gmail. Live campaigns decrypt provider tokens only in memory, refresh access when needed, and call `gmail.users.messages.send` only after those checks pass.

Successful provider IDs, job state, and an outreach/audit event are written in one transaction. A provider authorization failure marks the sender connection as requiring reauthorization. Transient provider, network, and quota classes use the bounded Phase 9 retry policy; permanent validation and provider rejection errors do not retry. Plaintext token variables are cleared in the worker scope after processing.

Jobs enter `sending` before the external call. Expired `leased` jobs can be reclaimed, but an in-flight `sending` job is not automatically re-sent after a process restart. This avoids duplicate provider delivery when a worker stops after Gmail accepts a message but before durable success is recorded; the job remains visible for operational reconciliation.

## Lifecycle

`startWorker` validates the database and schema version, logs only redacted configuration, polls with a stable worker ID, applies shared per-sender and per-campaign pacing through `WORKER_MIN_INTERVAL_MS`, handles `SIGTERM` and `SIGINT`, stops accepting work, closes the MySQL pool, and exits without exposing a public port. `WORKER_ID` and `WORKER_POLL_INTERVAL_MS` may be supplied by the runtime; secrets remain in the existing environment configuration. Production starts the compiled entry point with `npm run start:worker` (`node dist/server/worker.js`).

## Validation boundary

The worker code and safety primitives are validated in Phase 10. A real Railway deployment, dedicated Google test account, physical-device flow, and explicit test-recipient send remain Phase 11–12 acceptance work. No live recipient send is claimed by this repository phase.
