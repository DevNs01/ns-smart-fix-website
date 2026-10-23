# Security Implementation Summary

## Architecture reviewed

- **Framework:** React 19.3.1 with Vite 8.3.5 and a generated Design Canvas runtime
- **Node.js:** 24.x (`v24.16.0` used locally)
- **Package manager:** npm with `package-lock.json`
- **Hosting:** static `dist` output and serverless API functions on Vercel
- **Backend:** Supabase Auth, PostgreSQL/RLS and private storage; Resend transactional email
- **Forms:** server-validated email submission with an optional reference-only WhatsApp follow-up
- **Routes:** public in-page views plus an authenticated staff portal and protected API functions
- **Environment variables:** server-only Supabase and email credentials are required in Vercel

## Controls implemented

- Compatible CSP and comprehensive Vercel browser security headers.
- Field types, length limits, name/phone/email/date checks and fixed allowlists.
- Public file selection is limited to five JPG/PNG/WebP/PDF filenames of 5 MB each; public file bytes are not uploaded. Authenticated payment evidence uses private signed Supabase uploads with the same type/size limits.
- Safe fixed WhatsApp destinations whose messages contain only fixed text and an opaque request reference.
- Read-only authenticated table grants, scoped security-definer RPCs, transaction-coupled audit triggers and server-side role enforcement.
- Database-authoritative payment-proof checks, immutable invoice evidence, single-use proof-path constraints, atomic draft-quotation replacement and snapshot-bound quotation delivery.
- Shared database-backed authentication, monitoring, quotation and duplicate-submission limits suitable for multiple serverless instances.
- No Production source maps; immutable hashed-asset cache policy.
- Expanded `.gitignore`, safe `.env.example`, configuration/rotation guidance and common secret-pattern tests.
- Clean-install CI, lint, syntax check, unit tests, build, npm audit and security verification.
- CodeQL, dependency review, Dependabot and CODEOWNERS; workflows use minimum permissions and immutable Action SHAs.
- Threat model, audit, monitoring, test and Vercel/GitHub owner documentation.

## Findings

- **Critical:** 0
- **High:** 0
- **Medium:** 9 total; 9 fixed in the repository (the 5 latest fixes require migration/application deployment)
- **Low:** 4 total; 3 fixed, 1 open
- **Informational:** 1 open/documented

Open risks are external Google Fonts and hosting/provider dependencies. WhatsApp follow-up URLs no longer include personal or project details. The Design Canvas logic is precompiled and the CSP does not permit `unsafe-eval`.

## Manual owner actions

- Review and accept or remediate every open finding in `SECURITY_AUDIT.md`.
- Have privacy/terms wording reviewed by a qualified Malaysian legal/privacy professional.
- Review role changes, new RPCs, storage paths and business-state transitions against the release gates in the threat model and test plan.

## Vercel actions

- Verify GitHub project mapping and `main` Production Branch.
- Protect Preview/deployment URLs, require MFA/minimal team access, review activity/firewall alerts and confirm no obsolete variables/domains.
- Test this branch only as a protected Preview. Do not promote it without explicit approval.

## GitHub actions

- Protect `main`; require pull request approval, CODEOWNERS where supported, successful CI/CodeQL/dependency review, conversation resolution and restricted force-push/deletion.
- Dependency vulnerability alerts and Dependabot security updates were enabled during this review. Secret scanning and push protection were already enabled. Confirm Dependency Graph/dependency review succeeds on the fresh PR run, and enable private vulnerability reporting where available.
- Require MFA, review collaborators/deploy keys/apps and configure a Production environment approval gate.

## Secrets and dependencies

No high-confidence secret signature was found in reachable Git history. Server-side environment variables listed in `.env.example` are required; no live values belong in source. No secret is known to require rotation. Vite was updated from 8.1.5 to 8.3.5 to clear the current audit advisories.

## Tests and build

Baseline build passed after isolating npm from a mis-owned user cache. The final local suite passed lint, syntax checking, 3/3 unit tests, Production build, 20 asset/navigation/contact checks and security checks. Browser verification found no console error/warning, broken inspected image, horizontal overflow or DOM injection from malicious-looking input. Production output is `dist` from `npm run build`.

## Release position and next review

This work aligns applicable controls with recognised secure-development practices; it is not a certification or penetration test. Production merge should remain blocked until CI succeeds, a protected Preview passes visual/CSP/header checks, owners accept documented residual risks, and branch/Vercel settings are confirmed. Recommended next review: 22 October 2026, or sooner after any material architecture/dependency/hosting change.
