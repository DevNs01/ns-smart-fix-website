# Security Configuration

## Environment variables

The Vercel API functions require server-side environment variables. Use `.env.example` as the authoritative name/purpose template; it contains placeholders only and must never contain live credentials.

| Name | Purpose | Exposure | Environments |
|---|---|---|---|
| `RESEND_API_KEY` | Transactional and monitoring email | Secret | Preview/Production |
| `TURNSTILE_SECRET_KEY` | Server-side quotation challenge verification | Secret | Preview/Production |
| `TURNSTILE_SITE_KEY` | Browser challenge widget | Public | Preview/Production |
| `SUPABASE_URL` | Supabase project endpoint | Server configuration | Preview/Production |
| `SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase API key used with authenticated/signed operations | Public | Preview/Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server-only database, Storage and shared-limiter access | Secret | Preview/Production |
| `WORKER_BANK_ENCRYPTION_KEY` | AES-GCM key material for worker payment identifiers | Secret | Preview/Production |
| `CRON_SECRET` | Authenticates scheduled monitoring checks | Secret | Production |

Vite replaces `VITE_*` values into the client bundle. Never use `VITE_*`, `NEXT_PUBLIC_*` or `REACT_APP_*` for passwords, tokens, private API keys, database credentials or signing secrets.

## Rules for future configuration

- Keep secrets server-only and configure distinct Development, Preview and Production values in Vercel.
- Give service identities only the operations and data scope they require.
- Validate mandatory variables before privileged work and fail closed with a generic error.
- Never log configuration values. Documentation and `.env.example` may contain names and descriptions only.
- Rotate a credential immediately if exposed in source, Git history, build output, logs, a screenshot or a client bundle. Revoke first, replace it at the provider, update each intended Vercel environment, redeploy safely, and verify the old value fails.
- Do not use Production customer data or credentials in Preview.

## Repository controls verified

- `.env`, `.env.*`, `.vercel`, build output, dependencies, logs and security-tool reports are ignored; `.env.example` is allowed.
- Common high-confidence secret signatures were checked in the reachable Git history without printing values; none matched during this review.
- The production bundle check rejects common private-key/token patterns and source maps.
- No private credentials were found in the current source. The public Supabase project URL and publishable key may be returned only where the signed Storage workflow requires them.

Repository secret scanning and push protection still require GitHub owner configuration. If GitHub reports a secret, treat it as exposed even when the commit is later deleted.
