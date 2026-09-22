# Contributing to Stealth Mail Studio

## Branch policy

The `main` branch is protected. Work must be made on a short-lived branch and submitted through a pull request. Do not force-push, delete, or commit secrets to `main`.

## Before opening a pull request

Run the checks available for the current phase. At minimum, review the diff, run `git diff --check`, confirm no `.env` or credential files are tracked, and document any migration, OAuth, security, or deployment impact.

## Required review notes

Every pull request must explain its purpose, affected areas, validation performed, rollback considerations, and whether it changes authentication, provider scopes, database schema, worker behavior, or live-send safety controls.

## Security boundary

Mobile code must not contain backend secrets. Provider tokens must never be logged or placed in deep links. Application login and Gmail sender authorization remain separate flows.

## Commit guidance

Use concise imperative commit messages. Keep unrelated changes separate. Do not copy runtime dependencies or environment files from the old project.
