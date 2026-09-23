# Phase 7 — Expo Mobile Client

Phase 7 adds the first functional Expo Router client for Stealth Mail Studio using Expo SDK 54, TypeScript, and the approved five-tab operations-console structure.

## Implemented

The mobile client includes Home, Senders, Queue, Compose, and Settings tabs. The UI uses explicit loading, authentication-required, empty, retry, success, and failure states. Queue and Compose are deliberately provider-safe: they do not invent leads, claim synchronization, or send messages before the later Sheets, campaign, and worker phases. Native session credentials are persisted with Expo SecureStore; they are never stored in AsyncStorage or returned as provider tokens.

The root layout owns deep-link processing so callbacks are handled regardless of the currently visible tab. It processes both the initial cold-start URL and warm-start URL events, deduplicates repeated operating-system deliveries, and distinguishes `flow=login` from `flow=sender`. Login callbacks exchange the short-lived server code for the application session. Sender success triggers a fresh authenticated sender-metadata request. The callback screen displays status only and never stores or displays provider tokens.

## Native configuration

The app scheme is `manusstudio`. Android includes a `VIEW` intent filter with `DEFAULT` and `BROWSABLE` categories for `manusstudio://oauth/callback`. iOS uses the same configured URL scheme. The backend base URL is supplied through `EXPO_PUBLIC_API_BASE_URL`; no backend secret is bundled in the app.

## Validation evidence

- `npm run typecheck` passes.
- `npx expo config --json` resolves the `manusstudio` scheme and one Android callback intent filter.
- `npm run export:web` passes and emits all five tab routes plus `/oauth/callback`.
- Expo SecureStore is used for native session persistence via `getItemAsync`, `setItemAsync`, and `deleteItemAsync`.

The physical-device exit gate remains pending until a real development build or Expo device session is configured, the new HTTPS backend callback is deployed, a disposable database is migrated, and a dedicated Google test account is used. The final gate must verify both cold-start and warm-start callbacks, duplicate delivery behavior, sender metadata refresh, and visible retry messaging.
