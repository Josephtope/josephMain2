# Phase 8 — Sheets Binding and Controlled Import

Phase 8 binds an authenticated user's owned Google Sheet through an already-authorized sender connection and imports validated rows into the user-owned lead queue. It does not grant Google access, expose provider tokens, or enable sending.

## Flow

1. The signed-in mobile client lists existing owned bindings.
2. The client submits a spreadsheet ID and tab name with a selected active sender connection.
3. The server verifies ownership of the sender connection, validates spreadsheet and tab access through Google Sheets, requires an `email` header, and stores only the binding metadata and canonical header mapping.
4. Import reads the bound tab through the encrypted sender connection, validates each row's email, stores normalized lead fields and source row metadata, updates existing leads by owner and email, and skips invalid rows without creating them.
5. The mobile queue loads only leads owned by the authenticated user.

## Routes

| Route                      | Purpose                                                  |
| -------------------------- | -------------------------------------------------------- |
| `GET /api/sheets/bindings` | List safe binding metadata owned by the session user     |
| `POST /api/sheets/bind`    | Validate access and create or reactivate a binding       |
| `POST /api/sheets/import`  | Import validated rows from an owned binding              |
| `GET /api/leads`           | List owned imported leads, optionally filtered by status |

The backend never returns access tokens, refresh tokens, ciphertext, or arbitrary spreadsheet contents beyond normalized lead fields. Spreadsheet IDs are restricted to the expected Google identifier character set. All database reads and writes are owner-scoped.

## Validation evidence

- `pnpm run format:check`
- `pnpm test`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm exec drizzle-kit check`

Physical Google integration remains deferred until Phase 11 creates the new Railway environment and Phase 12 provides a dedicated test account and device acceptance. Local tests must use mocked Sheets responses and disposable database resources.
