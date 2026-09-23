# Phase 6 — Secure Gmail Sender Authorization

Phase 6 connects an authenticated application user to a Gmail sender account. It remains separate from Phase 5 application login and from Phase 8 Sheets binding.

## Flow

1. An authenticated client requests `GET /api/auth/google/connection/start?nativeReturnUri=manusstudio://oauth/callback`.
2. The backend validates the exact native URI and the current server session.
3. The backend signs a short-lived sender state containing the user, session identifier, purpose, nonce, expiry, issuer, audience, and native URI. Only its hash is persisted in `google_connection_states`.
4. Google redirects to the exact backend-only `GOOGLE_CONNECTION_REDIRECT_URI`.
5. The callback verifies and atomically consumes the state before exchanging the authorization code.
6. The backend exchanges the code using the same exact redirect URI, reads the Google profile, requires the `gmail.send` scope and a refresh token, and upserts the user-owned connection.
7. Access and refresh tokens are encrypted with AES-256-GCM. The database stores only versioned ciphertext, metadata, scopes, expiry, and connection status.
8. The callback returns only `manusstudio://oauth/callback?flow=sender&status=success`, or a generic sender error result. It never places provider tokens or session credentials in the native URL.
9. The authenticated connections endpoint returns safe metadata only; it never returns token ciphertext or plaintext.

## Routes

| Route                                      | Purpose                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `GET /api/auth/google/connection/start`    | Start authenticated Gmail sender authorization                          |
| `GET /api/auth/google/connection/callback` | Verify state, exchange code, encrypt tokens, and persist the connection |
| `GET /api/auth/google/connections`         | Return safe metadata for connections owned by the current user          |

## Safe failure stages

Callback failures are represented internally as `state_invalid`, `token_exchange_failed`, `profile_lookup_failed`, `scope_insufficient`, or `storage_failed`. Logs contain only the stage and request correlation ID. Client redirects receive only the generic `authorization_failed` result.

## Validation evidence

The branch includes focused tests for AES-GCM round trips and tamper rejection, sender-state user/session/nonce/native-URI binding, expiry, and signing-key separation. The repository gates remain required before review:

- `pnpm run format:check`
- `pnpm test`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm exec drizzle-kit check`

The physical-device exit gate is not claimed until a new HTTPS callback, a disposable database, a dedicated Gmail test account, and the Phase 7 native callback client are available. No old OAuth client, old database, old Railway project, or production sender credentials may be used.
