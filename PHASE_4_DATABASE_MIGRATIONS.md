# Phase 4: Database and migration baseline

## Scope

Phase 4 establishes the first clean MySQL schema for the rebuilt Stealth Mail Studio backend. The Drizzle schema in `server/db/schema.ts` is the source model, while `server/db/migrations/0000_phase4_baseline.sql` is the reviewed release artifact. The migration creates identity and session records, short-lived OAuth state and exchange-code records, encrypted Google connection metadata, Sheets bindings, imported leads, templates, campaigns, workspace controls, durable jobs, outreach logs, audit events, and the `schema_metadata` release marker.

The migration intentionally contains no production-boot schema mutation. Neither the web process nor the worker runs `drizzle-kit generate`, `drizzle-kit push`, or any migration command during startup.

## Development workflow

Run `pnpm install --frozen-lockfile --ignore-scripts`, then use `pnpm db:generate` only when the schema changes. Review the generated SQL in the pull request and keep the migration file immutable after review. Run `pnpm exec drizzle-kit check` to validate migration history consistency. Apply the exact migration files to a disposable MySQL database with `pnpm db:migrate`, then run `pnpm db:verify` with `DATABASE_URL` and, when needed, `EXPECTED_SCHEMA_VERSION` set explicitly.

A clean database must report the `phase4-baseline` marker and all fifteen application tables. The sixteen total tables shown by MySQL include Drizzle's migration bookkeeping table, which is not application data.

## Release order

For staging, create a new Railway MySQL database, set backend-only variables, and apply the checked-in migration release from a controlled release step. Run `pnpm db:verify` against that staging database before deploying the web or worker service. The web readiness endpoint returns `503` when a configured database is unreachable or when the expected schema marker is missing. The web and worker startup paths also terminate before serving or processing when the expected marker is absent.

For production, apply the exact reviewed migration files through the release step, verify `EXPECTED_SCHEMA_VERSION`, and only then deploy the web and worker services. A rollback is a controlled forward-fix or a tested restore procedure; it is not an ad hoc `drizzle-kit push` operation and it does not depend on replaying an old migration history against an existing database.

## Safety properties

The durable job table includes status, attempt count, next-attempt time, lease owner, lease expiration, idempotency key, provider message ID, safe error code and detail, created and updated timestamps, and completion time. Provider access tokens are represented only by ciphertext columns in the schema. OAuth state and login exchange records store hashes, not reusable raw values. User ownership columns are present on user-facing records so later procedures can enforce ownership at the query boundary.
