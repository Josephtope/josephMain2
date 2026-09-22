# Phase 0 Baseline Decision Record

**Project:** Stealth Mail Studio  
**Repository:** Josephtope/josephMain2  
**Status:** Approved baseline for the new system

## Scope

The new system will be built from scratch. It will include an Expo mobile app, a Railway-hosted Express and tRPC API, a new Railway MySQL database, Google application authentication, Gmail and Google Sheets sender connections, a durable background worker, and an operations-console interface with Command, Queue, Compose, Outreach, and Senders areas.

## Resource boundaries

This project uses new GitHub, Railway, MySQL, and Google Cloud resources. The previous app, its repository, its Railway service, its database, its Google OAuth credentials, and its deployment configuration are reference-only and must not be used as runtime dependencies.

## First-release capabilities

The first release must prove secure application login, sender OAuth, encrypted Google token storage, Sheets binding and controlled import, lead review, approved job creation, Gmail test sending, audit logging, pause, dry-run, manual approval, kill switch, retry handling, and reauthorization status. Live sending is disabled until physical-device acceptance tests pass.

## Architecture decisions

- One repository with shared mobile, server, and validation code.
- Separate Railway web and worker services.
- A controlled migration release runs before application services.
- Application login and Gmail sender authorization use separate OAuth flows and callback contracts.
- Native callbacks use the `manusstudio://` scheme and return only minimal status or one-time login exchange codes.
- No JWT, Google token, email address, database ID, or user profile is placed in a deep-link query.
- OAuth state is short-lived, purpose-bound, session-bound, server-recorded, and consumed once.
- Google access and refresh tokens are encrypted with AES-256-GCM before database persistence.
- Worker execution uses leases, idempotency, retries, rate limits, ownership checks, and server-enforced safety controls.

## Phase 0 exit criteria

This document is the baseline for implementation. No old project code or infrastructure is modified. The next phase may begin only after the new repository, new Railway project, new MySQL service, and new Google Cloud project are kept separate from the old system.
