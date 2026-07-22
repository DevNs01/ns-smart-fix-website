# Security Implementation Summary

## Architecture reviewed

- **Framework:** React 18.3.1 with Vite 8.1.5 and a generated Design Canvas runtime
- **Node.js:** 24.x (`v24.16.0` used locally)
- **Package manager:** npm with `package-lock.json`
- **Hosting:** static `dist` output on Vercel
- **Backend/API/database/ORM/auth/session/storage/email/analytics/payment:** none detected
- **Forms:** browser-only state and explicit WhatsApp handoff; no upload or submission endpoint
- **Routes:** public in-page views only; no protected, customer, administrator, API or middleware routes
- **Environment variables:** none required

## Controls implemented

- Compatible CSP and comprehensive Vercel browser security headers.
- Field types, length limits, name/phone/email/date checks and fixed allowlists.
- File-selection limit of five; JPG/PNG/WebP/PDF only; 5 MB each; extension plus MIME validation. No files are uploaded.
- Safe fixed WhatsApp destinations with URL encoding and protected external links.
- No Production source maps; immutable hashed-asset cache policy.
- Expanded `.gitignore`, safe `.env.example`, configuration/rotation guidance and common secret-pattern tests.
- Clean-install CI, lint, syntax check, unit tests, build, npm audit and security verification.
- CodeQL, dependency review, Dependabot and CODEOWNERS; workflows use minimum permissions and immutable Action SHAs.
- Threat model, audit, monitoring, test and Vercel/GitHub owner documentation.

## Findings

- **Critical:** 0
- **High:** 0
- **Medium:** 4 total; 2 fixed, 2 open/owner acceptance
- **Low:** 4 total; 3 fixed, 1 open
- **Informational:** 1 open/documented

Open risks are the Design Canvas runtime's `unsafe-eval` requirement, personal data in visitor-initiated WhatsApp URLs, external Google Fonts and platform-only monitoring. No item was falsely marked fixed without a technical check.

## Manual owner actions

- Review and accept or remediate every open finding in `SECURITY_AUDIT.md`.
- Have privacy/terms wording reviewed by a qualified Malaysian legal/privacy professional.
- Do not add accounts, APIs, uploads, payments, databases or admin/customer functions without implementing the release gates in the threat model and test plan.

## Vercel actions

- Verify GitHub project mapping and `main` Production Branch.
- Protect Preview/deployment URLs, require MFA/minimal team access, review activity/firewall alerts and confirm no obsolete variables/domains.
- Test this branch only as a protected Preview. Do not promote it without explicit approval.

## GitHub actions

- Protect `main`; require pull request approval, CODEOWNERS where supported, successful CI/CodeQL/dependency review, conversation resolution and restricted force-push/deletion.
- Enable dependency graph, Dependabot alerts/security updates, private vulnerability reporting, secret scanning and push protection where available.
- Require MFA, review collaborators/deploy keys/apps and configure a Production environment approval gate.

## Secrets and dependencies

No high-confidence secret signature was found in reachable Git history and no environment variable is required. This is not a guarantee; enable provider scanning. No secret is known to require rotation. No runtime dependency was added or removed. Development scripts use Node built-ins.

## Tests and build

Baseline build passed after isolating npm from a mis-owned user cache. The final local suite passed lint, syntax checking, 3/3 unit tests, Production build, 20 asset/navigation/contact checks and security checks. Browser verification found no console error/warning, broken inspected image, horizontal overflow or DOM injection from malicious-looking input. Production output is `dist` from `npm run build`.

## Release position and next review

This work aligns applicable controls with recognised secure-development practices; it is not a certification or penetration test. Production merge should remain blocked until CI succeeds, a protected Preview passes visual/CSP/header checks, owners accept documented residual risks, and branch/Vercel settings are confirmed. Recommended next review: 22 October 2026, or sooner after any material architecture/dependency/hosting change.
