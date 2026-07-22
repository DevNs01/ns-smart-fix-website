# Security Test Plan

## Scope and safety

Tests apply only to source, generated local output and localhost. No destructive or active scan is authorised against Production. A protected project-owned Preview may be tested later with owner approval. The baseline is OWASP ASVS 5.0 Level 2 concepts applicable to a static public site.

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
| ST-13 | Method/CORS/CSRF/SSRF/SQL/path tests | Confirm not applicable: no server endpoint, database, server fetch, redirect or cookie session |
| ST-14 | Auth/session/IDOR/cross-account/reset | Confirm not applicable: no accounts, protected records or sessions |
| ST-15 | Production build | Vite build succeeds and asset/navigation/contact handoff checks pass |

## Future portal gate

Before any portal release, add integration tests for unauthenticated access, role escalation, cross-account object access, every CRUD/export/download permission, CSRF, session rotation/revocation/expiry, reset-token reuse, enumeration, API methods/content types/body limits, CORS, SSRF, parameterised queries, upload signature spoofing, malware scanning, authorised signed downloads, rate limits, errors/caches and security-event logs.

An OWASP ZAP baseline scan may be run against localhost after starting `npm run preview -- --host 127.0.0.1`; active scanning remains prohibited against Production.
