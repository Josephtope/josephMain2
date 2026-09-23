# Phase 11 — Railway deployment configuration

Phase 11 prepares a reproducible deployment of the new Stealth Mail Studio system. It deliberately targets a **new Railway project** and a **new managed MySQL service**. The old Railway project, old database, old OAuth client, and old runtime endpoints are not deployment dependencies.

## Repository and commit

Deploy the merged `main` branch of `Josephtope/josephMain2`. The repository contains separate compiled web and worker entry points. The production worker must run `node dist/server/worker.js`; it must not run TypeScript through `tsx`.

## Required Railway resources

| Resource          | Source/configuration                                                                        | Command or role                                                          |
| ----------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| MySQL             | New managed MySQL service in the new project                                                | Provides `DATABASE_URL` to migration, web, and worker                    |
| Web service       | `Josephtope/josephMain2`, config file `railway/web.railway.toml`                            | `pnpm install --frozen-lockfile && pnpm build`, then `pnpm start`        |
| Worker service    | Same repository and commit stream, config file `railway/worker.railway.toml`                | `pnpm install --frozen-lockfile && pnpm build`, then `pnpm start:worker` |
| Migration release | Same repository, config file `railway/migration.railway.toml` or a one-time release command | `pnpm db:migrate` once against the new database                          |

The web and worker services must be configured explicitly. Do not rely on a Procfile or on a single service definition to infer both processes.

## Variables

Set the following backend variables on the migration, web, and worker services. Railway's MySQL reference variable should provide `DATABASE_URL`.

```text
DATABASE_URL
EXPECTED_SCHEMA_VERSION=phase6-sender-authorization
SESSION_SIGNING_KEY
OAUTH_STATE_SIGNING_KEY
TOKEN_ENCRYPTION_KEY
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI
GOOGLE_CONNECTION_REDIRECT_URI
PUBLIC_WEB_ORIGIN_ALLOWLIST
NODE_ENV=production
PORT
```

`PUBLIC_WEB_ORIGIN_ALLOWLIST` is the authoritative Railway name. The application also accepts the older `PUBLIC_API_ORIGINS` name for local compatibility, but it should not be used for the production deployment.

Worker-only optional controls are safe to add to the worker service:

```text
WORKER_ID
WORKER_POLL_INTERVAL_MS=1000
WORKER_MIN_INTERVAL_MS=1000
```

Only the Expo build receives the public mobile variable:

```text
EXPO_PUBLIC_API_BASE_URL=https://<new-web-service-domain>
```

Never place OAuth client secrets, signing keys, token-encryption keys, or `DATABASE_URL` in the mobile build or repository.

## Deployment order

1. Create a new Railway project; do not select or modify an old Stealth Mail Studio project.
2. Provision a new managed MySQL service.
3. Attach the new MySQL reference to the migration, web, and worker services.
4. Set variables on all three backend services. Keep `NODE_ENV=production` and use newly generated signing/encryption secrets.
5. Deploy the migration release against the empty database. It must apply the committed migrations, including the `phase6-sender-authorization` schema marker used by the application.
6. Verify the schema marker through the migration logs or `pnpm db:verify` using the same `DATABASE_URL`.
7. Deploy the web service and verify both `GET /api/health` and `GET /api/ready`.
8. Deploy the worker. It has no HTTP listener and should remain idle when no approved jobs exist; inspect its logs for redacted initialization and tick metrics only.
9. Configure the exact new web domain in Google Cloud OAuth settings. Use the application-login callback for `GOOGLE_OAUTH_REDIRECT_URI` and the sender callback for `GOOGLE_CONNECTION_REDIRECT_URI`; do not reuse an obsolete host.
10. Re-run OAuth and readiness checks in Phase 12 before enabling live execution.

## Verification checklist

The Phase 11 exit gate requires observable evidence for the new MySQL, migration, web, and worker resources. Record timestamps, environment, commit SHA, service names, and safe result summaries without recording tokens, cookies, authorization codes, full email addresses, or message bodies.

- New Railway project ID and service IDs are recorded.
- MySQL is a new resource and its connection is not copied from the old project.
- Migration completes once and schema verification reports `phase6-sender-authorization`.
- Web `/api/health` returns HTTP 200 with `service: web`.
- Web `/api/ready` returns HTTP 200 with reachable database and verified schema.
- Worker starts from compiled output, reports `httpListener: false`, and does not expose a public port.
- Worker remains idle with no approved jobs.
- Mobile `EXPO_PUBLIC_API_BASE_URL` points only to the new web service domain.
- Google Cloud callback configuration names the new web domain.

Phase 11 deployment readiness is not the same as Phase 12 acceptance. No live recipient send, physical-device test, dedicated Google test-account test, or full end-to-end acceptance is claimed by this runbook.
