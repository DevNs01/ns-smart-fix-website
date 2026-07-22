# Security Configuration

## Environment variables

The current static application requires **no environment variables** in Development, Preview or Production. `.env.example` intentionally contains comments only.

| Name | Purpose | Exposure | Environments |
|---|---|---|---|
| None | No runtime service is configured | N/A | All |

Vite replaces `VITE_*` values into the client bundle. Never use `VITE_*`, `NEXT_PUBLIC_*` or `REACT_APP_*` for passwords, tokens, private API keys, database credentials or signing secrets.

## Rules for future configuration

- Keep secrets server-only and configure distinct Development, Preview and Production values in Vercel.
- Give service identities only the operations and data scope they require.
- Validate mandatory variables at server startup and fail closed with a generic error.
- Never log configuration values. Documentation and `.env.example` may contain names and descriptions only.
- Rotate a credential immediately if exposed in source, Git history, build output, logs, a screenshot or a client bundle. Revoke first, replace it at the provider, update each intended Vercel environment, redeploy safely, and verify the old value fails.
- Do not use Production customer data or credentials in Preview.

## Repository controls verified

- `.env`, `.env.*`, `.vercel`, build output, dependencies, logs and security-tool reports are ignored; `.env.example` is allowed.
- Common high-confidence secret signatures were checked in the reachable Git history without printing values; none matched during this review.
- The production bundle check rejects common private-key/token patterns and source maps.
- No credentials, database URLs or private API keys were found in the current source.

Repository secret scanning and push protection still require GitHub owner configuration. If GitHub reports a secret, treat it as exposed even when the commit is later deleted.
