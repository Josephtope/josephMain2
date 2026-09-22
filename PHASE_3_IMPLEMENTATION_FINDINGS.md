# Phase 3 implementation findings

Date: 2026-09-22

## Scope

The new repository now contains a TypeScript Node.js backend foundation. The old application and its infrastructure were not opened, modified, or used as runtime dependencies.

## Implemented

- Express web service with `GET /api/health` and separate `GET /api/ready` database readiness.
- tRPC 11 router and Express adapter.
- Zod configuration validation with fail-fast secret requirements outside tests.
- Strict CORS allowlist, JSON and URL-encoded request limits, Helmet security headers, and request IDs.
- Structured JSON logging with secret-like field redaction and safe error categories.
- Opaque bearer/cookie authentication boundary; credentials are not decoded or trusted at this phase.
- Drizzle/MySQL pool creation and a separate `SELECT 1` connectivity check.
- Independent worker entry point with no Express listener or request context.
- Safe `.env.example`; Google OAuth variables remain empty until a real new Railway HTTPS domain exists.

## Validation evidence

- `pnpm run typecheck` passed.
- `pnpm test` passed: 5 tests.
- `pnpm run build` passed.
- `pnpm run format:check` passed.
- Built service responded successfully to `GET /api/health` with status 200.
- Built service responded successfully to `GET /api/ready` with status 200 when no database URL was configured; a configured but unreachable database returns 503.
- No real credentials, OAuth client secrets, tokens, or old-project variables were added.

## Deferred by design

Database schema and production migrations belong to Phase 4. OAuth client creation and callback registration remain deferred until the new Railway web service has a real HTTPS domain. Worker leasing and provider execution belong to later phases.
