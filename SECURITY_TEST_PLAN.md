# Security Test Plan

## Scope and safety

Tests apply only to source, generated local output, disposable test data and localhost. No destructive or active scan is authorised against Production. A protected project-owned Preview may be tested later with owner approval. The baseline is OWASP ASVS 5.0 Level 2 concepts applicable to the public site, Vercel APIs, staff portal and Supabase backend.

## Planned cases

| ID | Test | Expected result |
|---|---|---|
| ST-01 | Clean locked installation | `npm ci` installs the lockfile without lifecycle scripts in CI |
| ST-02 | Dependency audit | No known Moderate-or-higher finding; CI blocks High/Critical |
| ST-03 | Lint/type syntax/unit/build | All commands pass; `dist` is created |
| ST-04 | Secret/config scan | No real environment file, common credential signature or client-side secret |
| ST-05 | Security headers | CSP, HSTS, nosniff, referrer, permissions and anti-framing controls present |
| ST-06 | CSP compatibility | Local page, images and fonts render; no unexpected blocked first-party script |
| ST-07 | DOM XSS review | User fields render as text and are encoded in fixed WhatsApp links; no untrusted HTML sink |
| ST-08 | Open redirect/URL injection | No user-controlled destination; `javascript:`, `data:` and protocol-relative destinations cannot be selected |
| ST-09 | Form boundary validation | Invalid names/phones/email/past date/oversized fields are rejected |
| ST-10 | File selection | More than five, over 5 MB, empty, wrong MIME or disallowed extensions are rejected |
| ST-11 | Reverse tabnabbing | Every `_blank` link has `noopener noreferrer` |
| ST-12 | Source-map/cache review | No `.map` output; assets use intended cache policy |
| ST-13 | API boundary and injection tests | Reject unsupported methods/content types/body sizes and unsafe identifiers; keep outbound destinations and table/operation selection allowlisted |
| ST-14 | Auth/session/role/RLS/RPC tests | Reject inactive/unauthenticated sessions, role escalation, direct table writes and unauthorised proof access; verify cookie/origin/session lifecycle controls |
| ST-15 | Production build | Vite build succeeds and asset/navigation/contact handoff checks pass |
| ST-16 | Shared abuse budgets | Quotation, duplicate, monitoring and login limits remain atomic across independent serverless invocations and fail closed where required |
| ST-17 | Financial proof integrity | Staff cannot overwrite recorded invoice proof objects, and a proof path cannot bind to more than one payment/outgoing-payment row |
| ST-18 | Hosted security gates | GitHub dependency review/CodeQL/CI and protected Vercel Preview checks complete successfully |

## Portal expansion gate

Before adding new portal capabilities, extend integration tests for unauthenticated access, role escalation, every CRUD/export/download permission, same-origin enforcement, session rotation/revocation/expiry, reset-token reuse, enumeration, API methods/content types/body limits, CORS, SSRF, query construction, upload signature spoofing, malware scanning, authorised signed downloads, shared rate limits, errors/caches and security-event logs. Add cross-tenant tests if the application introduces more than one organisation.

An OWASP ZAP baseline scan may be run against localhost after starting `npm run preview -- --host 127.0.0.1`; active scanning remains prohibited against Production.
