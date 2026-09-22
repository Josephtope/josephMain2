# Phase 5 — Secure Sessions and Application Login

Phase 5 implements **application identity authentication** for the clean rebuild. It is intentionally separate from Phase 6 Gmail and Google Sheets sender authorization.

## Flow

1. The mobile client requests `GET /api/auth/google/start?nativeReturnUri=...`.
2. The backend accepts only an exact URI in `NATIVE_RETURN_URI_ALLOWLIST`.
3. The backend signs a short-lived state containing issuer, audience, purpose, expiry, issued-at, nonce, and the native return URI. Only the SHA-256 state hash is stored in `oauth_login_states`.
4. Google returns to the exact `GOOGLE_OAUTH_REDIRECT_URI`.
5. The callback verifies the signed state, its database hash, nonce binding, expiry, and one-time consumption. It exchanges the code for verified Google OpenID identity data and upserts a durable `users` record. No Gmail sender tokens are requested or stored.
6. The backend creates a signed session credential with a dedicated session key. The database stores only its hash in `sessions`, together with the user, session identifier, expiry, and revocation fields.
7. The callback redirects only to `manusstudio://oauth/callback?flow=login&code=<short-lived-code>`. It never places a session credential, provider token, email address, or profile object in the deep link.
8. The mobile client exchanges the one-time code over HTTPS at `POST /api/auth/login/exchange`, bound to the exact native return URI. The code is hash-backed, short-lived, session-bound, and consumed once.
9. The mobile client stores the returned credential in platform SecureStore and calls `GET /api/auth/me`. Logout is idempotent at `POST /api/auth/logout` and revokes a valid server session.

## Routes

| Route | Purpose |
|---|---|
| `GET /api/auth/google/start` | Validate native return URI and begin application login |
| `GET /api/auth/google/callback` | Consume state, verify Google identity, create session and exchange code |
| `POST /api/auth/login/exchange` | Consume one-time code and return the HTTPS session credential |
| `GET /api/auth/me` | Validate signature, expiry, revocation, ownership, and durable user |
| `POST /api/auth/logout` | Revoke the session when valid; always returns idempotently |

All client-facing failures use generic messages and include the request correlation ID. Logs contain stage metadata only; bearer values, state values, exchange codes, provider codes, secrets, and authorization headers are excluded.

## Validation evidence

The branch passes the repository gates locally:

- `pnpm install --frozen-lockfile --ignore-scripts`
- `pnpm run format:check`
- `pnpm run typecheck`
- `pnpm test` — 9 tests passing
- `pnpm run build`
- `pnpm exec drizzle-kit check`

The physical-device exit gate is intentionally **not claimed** yet. It requires a new HTTPS backend domain, a newly registered Google callback, a dedicated Google test account, the Phase 7 native callback client, and a live disposable database configuration. No old Railway resource, old database, old OAuth client, or production callback URL was used.
