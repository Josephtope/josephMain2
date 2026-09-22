# Stealth Mail Studio

This repository contains the clean rebuild of Stealth Mail Studio. The old application and its infrastructure are reference material only and are not runtime dependencies.

## Phase 3 backend foundation

The TypeScript backend is intentionally established before OAuth credentials or Railway deployment. It provides an Express web service, a separate worker entry point, tRPC 11, Zod configuration validation, Drizzle/MySQL access, safe structured logging, strict CORS, request limits, security headers, request IDs, and separate process/database readiness checks.

### Local setup

1. Install Node.js 22 and pnpm.
2. Copy `.env.example` to `.env`.
3. Generate local-only values for `SESSION_SIGNING_KEY` and `TOKEN_ENCRYPTION_KEY`.
4. Set `DATABASE_URL` only to a disposable local or test MySQL database.
5. Run `pnpm install`.
6. Run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
7. Start the web service with `pnpm dev`.

The process health endpoint is `GET /api/health`. Database readiness is reported separately by `GET /api/ready`; it returns `503` when a configured database cannot be reached. OAuth credentials and callback URLs are deliberately empty until a real new Railway HTTPS domain exists.

## Security rules

The mobile app must never contain server secrets or provider tokens. Application login and sender authorization remain separate. Bearer values and cookies are treated as opaque session credentials at this boundary; validation and persistence are introduced only with the reviewed authentication and database phases. Logs redact secret-like fields and errors return correlation IDs rather than internal details.
