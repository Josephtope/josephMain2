## Summary

<!-- What does this change do, and why is it needed? -->

## Validation

- [ ] `git diff --check`
- [ ] CI checks pass
- [ ] No secrets, tokens, `.env` files, or production credentials are included
- [ ] Tests added or updated where behavior changed

## Risk and rollback

<!-- Describe operational risk and how to revert or disable this change. -->

## Protected areas

Check any that apply:

- [ ] Authentication or sessions
- [ ] OAuth redirect/state/deep-link handling
- [ ] Google scopes or provider tokens
- [ ] Database schema or migrations
- [ ] Worker, queue, retry, or idempotency behavior
- [ ] Gmail sending or live-send controls
- [ ] Railway deployment configuration
- [ ] Mobile navigation or UI state

## Deployment notes

<!-- Include required environment variables, migrations, release order, or manual checks. -->
