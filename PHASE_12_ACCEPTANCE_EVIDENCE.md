# Stealth Mail Studio — Phase 12 Acceptance Evidence

**Repository:** `Josephtope/josephMain2`  
**Commit under test:** `47ec15b`  
**Phase:** 12 — full-system validation, not controlled launch  
**Evidence status:** In progress; no production-readiness or live-sending claim is made.

## Boundaries

The replacement system uses only the new GitHub repository, the new Railway deployment, the new MySQL service, and the new Google Cloud project. The old system and its infrastructure remain reference-only. No live recipient send was performed during these checks.

## Evidence matrix

| Test ID | Date and time | Environment | Action | Expected result | Actual result | Safe evidence | Follow-up |
|---|---|---|---|---|---|---|---|
| P12-INFRA-01 | 2026-09-24 03:51 UTC | New Railway production web service | Request `/api/health` | Web process responds with the web service health marker | **Pass** | HTTP 200; JSON reported `status: ok`, `service: web` | None |
| P12-INFRA-02 | 2026-09-24 03:51 UTC | New Railway production web service and MySQL | Request `/api/ready` | Database is reachable and expected schema is verified | **Pass** | HTTP 200; JSON reported database configured/reachable and schema configured/verified | None |
| P12-OAUTH-01 | 2026-09-24 03:52 UTC | New Railway production web service | Start application login with `nativeReturnUri=manusstudio://oauth/callback` | Backend creates the login state and redirects to Google using the new OAuth configuration | **Pass** | HTTP 302; redacted location host was Google authorization endpoint; no state or credential recorded | Complete the physical-device callback matrix |
| P12-OAUTH-02 | 2026-09-24 03:51 UTC | New Railway production web service | Probe OAuth start without the required native return URI | Request must be treated as invalid input rather than used as an OAuth flow | **Fail / defect noted** | HTTP 500 with generic `internal_error` and request ID | Improve invalid-input handling to return a client error; do not use this malformed probe as an acceptance flow |
| P12-CODE-01 | 2026-09-24 02:50 UTC | Local repository at `47ec15b` | Run `pnpm typecheck` | TypeScript compilation succeeds | **Pass** | Command exit code 0 | None |
| P12-CODE-02 | 2026-09-24 02:50 UTC | Local repository at `47ec15b` | Run `pnpm test` | Security and domain tests pass | **Pass** | 6 test files, 22 tests passed | Expand with any missing Phase 12 integration cases |
| P12-CODE-03 | 2026-09-24 02:50 UTC | Local repository at `47ec15b` | Run production build | Compiled server and worker artifacts are produced | **Pass** | `pnpm build` exit code 0 | None |
| P12-CODE-04 | 2026-09-24 02:50 UTC | Local repository at `47ec15b` | Run formatting check | Repository formatting check passes | **Pass** | Prettier reported all files matched | None |
| P12-MOBILE-01 | 2026-09-24 04:22 UTC | Expo mobile project | Resolve Expo configuration and run mobile TypeScript check | Expo configuration is valid and mobile code typechecks | **Pass** | Expo config resolved to `Stealth Mail Studio`, slug `stealth-mail-studio`, scheme `manusstudio`; `npx tsc --noEmit` exit code 0 | None |
| P12-MOBILE-02 | 2026-09-24 04:32 UTC | Expo mobile project | Run Expo Doctor | Expo project dependencies and configuration pass health checks | **Pass** | 18/18 checks passed; no issues detected | None |
| P12-MOBILE-03 | 2026-09-24 04:33 UTC | Expo mobile project with `EXPO_PUBLIC_API_BASE_URL` set to the approved Railway origin | Export the web bundle as a build smoke test | Production client configuration bundles successfully | **Pass** | Expo export completed; 13 static routes generated | This is not a native-device acceptance result |
| P12-MOBILE-04 | 2026-09-24 | Expo native build configuration | Inspect native build prerequisites | A physical Android/iOS build can be produced from a defined native identity and build profile | **Pass (configuration)** | Android package and iOS bundle identifier set to `com.josephmain.stealthmailstudio`; EAS development/preview/production profiles added; Expo config and mobile TypeScript checks pass | Produce the native build and record its profile |
| P12-SEC-01 | 2026-09-24 | Expo mobile source | Search mobile source for backend secrets and provider tokens | Mobile bundle contains only the public API base URL and no backend/provider secrets | **Pass (source audit)** | Only `EXPO_PUBLIC_API_BASE_URL` was found in mobile source; no tracked mobile `.env` file found | Re-run against the final native artifact |
| P12-GOOGLE-01 | 2026-09-24 | Google Cloud project `stealth-mail-studio-new-system` | Verify OAuth client callbacks and consent configuration | New Railway login and sender callbacks are registered exactly and required test-user/scopes configuration is present | **User-confirmed; independent browser verification pending** | User reported that the requested Google Cloud checks are complete; this session could not view the authenticated console because it remained at Google sign-in | Reconfirm from the authenticated console or retain a redacted screenshot/evidence reference |
| P12-DEVICE-01 | Not run | Tecno KE5, Android 10 | Run cold-start and warm-start login matrix | Login completes through HTTPS callback, one-time exchange code, and native return without sensitive deep-link data | **Blocked** | Native build and device evidence are not available in this session | Produce native build and run the full matrix |
| P12-SENDER-01 | Not run | Physical Expo device plus dedicated Google test account/spreadsheet | Test sender authorization and Sheets binding/import | Sender callback remains separate, tokens persist encrypted, ownership/import rules hold, and UI refreshes safely | **Blocked** | No physical-device acceptance evidence available | Run after login acceptance passes |
| P12-WORKER-01 | Not run end-to-end | New Railway worker and safe internal test data | Validate worker idle, leases, restart, retry, pause, kill switch, and provider failure controls | Server and worker enforce all job-safety controls | **Blocked** | Automated security tests pass, but no deployed operational evidence for the full matrix is recorded | Inspect Railway worker logs and execute safe internal test cases |
| P12-SEND-01 | Not run | Dedicated test account and internal test addresses only | Controlled test send | Provider result, durable audit record, worker result, and mobile UI agree | **Not permitted yet** | Prior gates and physical-device acceptance are incomplete | Do not enable live sending in Phase 12 until all required gates pass |

## Current conclusion

The repository and new Railway infrastructure have a passing automated baseline. Expo configuration and a production-configured web bundle also pass. **Phase 12 is not complete** because native build identity/profile, physical-device OAuth acceptance, sender/Sheets acceptance, and deployed worker-safety evidence are still outstanding. The malformed OAuth-start probe also exposed an error-handling defect: missing required query input currently produces a generic HTTP 500 instead of a client-input error. This should be fixed and covered by a test before the final Phase 12 gate.

## Next safe actions

1. Confirm the Google Cloud callback configuration from an authenticated console view and retain only redacted evidence.
2. Build the app for the Tecno KE5 running Android 10 and record the commit, profile, device model, OS version, and timestamp.
3. Run the login, sender authorization, Sheets binding, worker safety, and controlled test-send gates in order.
4. Do not proceed to Phase 13 or Phase 14 until all applicable rows are `Pass` with safe evidence.
