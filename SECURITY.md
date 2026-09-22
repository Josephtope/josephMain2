# Security Policy

## Scope

This policy applies to the new Stealth Mail Studio system in `Josephtope/josephMain2`. The old project and its infrastructure are not part of this repository’s runtime or security boundary.

## Reporting

Do not publish sensitive vulnerabilities, credentials, OAuth tokens, personal data, or provider account details in public issues. Report security concerns privately to the repository owner through GitHub’s private vulnerability reporting mechanism when enabled, or through the project owner’s private contact channel.

## Secret handling

Never commit `.env` files, Google client secrets, session keys, encryption keys, access tokens, refresh tokens, cookies, or database credentials. If a secret is exposed, stop using it, rotate it, and record the incident without copying the secret into tickets or logs.

## Security requirements

Changes affecting authentication, OAuth state, token encryption, ownership checks, migrations, worker execution, Gmail sending, or kill-switch behavior require explicit security notes and tests before release.
