# Security Test Results

Initial execution date: 22 July 2026. Latest security patch verification: 23 October 2026. Target: local repository and local build only.

| ID | Actual result / evidence | Result |
|---|---|---|
| ST-01 | Initial `npm ci` failed because the user npm cache had root-owned entries. Re-run with isolated `/private/tmp/ns-smart-fix-npm-cache` installed 22 packages successfully. CI uses a clean runner. | Pass with environment note |
| ST-02 | Vite was updated to 8.3.5; the latest `npm audit` reported 0 vulnerabilities. | Pass |
| ST-03 | `npm run check` covers lint, syntax checking, the complete Node test suite, Vite build, functional verifier and security verifier. See the current change verification output for the latest counts. | Pass |
| ST-04 | Reachable-history high-confidence signature scan found no matches; `.env` files are untracked/ignored; bundle patterns checked. This is not proof that no secret exists. | Pass |
| ST-05 | `scripts/security-test.mjs` parsed `vercel.json` and verified required headers/CSP directives. | Pass |
| ST-06 | The public-site logic is precompiled; source and built runtime contain no dynamic code evaluation, and the CSP does not permit `unsafe-eval`. Local production-build browser verification completed with a full render and clean console. | Pass locally; deployed header check pending |
| ST-07 | No `dangerouslySetInnerHTML` in application code; fixed WhatsApp origin and `encodeURIComponent` verified. Generated runtime parses trusted checked-in templates. | Pass with runtime residual risk |
| ST-08 | No redirect parameter or arbitrary URL input exists. Destinations are fixed in source. | Pass |
| ST-09 | Field `maxlength`/types plus client and server name, phone, email, date, allowlist and aggregate-length checks are covered. | Pass |
| ST-10 | Public forms transmit filenames only. Authenticated proof uploads use private signed URLs with bucket MIME/size restrictions; magic-byte/malware scanning remains documented hardening. | Pass with hardening note |
| ST-11 | Existing static verifier checked every `_blank` anchor for `noopener`; security test required both `noopener noreferrer`. | Pass |
| ST-12 | No `.map` appeared in Production output; verifier rejects future source maps. Hashed assets receive immutable caching. | Pass |
| ST-13 | API tests and source checks cover method/content-type/body limits, allowlisted routes and outbound destinations, output escaping, fixed Storage buckets and server-side validation. | Pass |
| ST-14 | Tests and migration inspection cover active-session/role checks, HttpOnly same-origin cookies, read-only authenticated table grants, scoped RPC authority and private signed proof access. Live provider configuration remains an owner check. | Pass in source; provider verification pending |
| ST-15 | Final Vite Production build passed; 20 referenced assets plus navigation, contact links and form handoffs were verified. Browser testing found loaded images, no console error/warning, no horizontal overflow and no injected element after malicious-looking input. | Pass |
| ST-16 | Quotation budgets use the shared service-role RPC, prefer `x-vercel-forwarded-for`, fail closed on limiter errors, and retain short duplicate reservations after failed or ambiguous admin-email delivery. Independent fake-store tests pass. | Pass |
| ST-17 | The new migration drops invoice-proof UPDATE authority and creates unique proof-path indexes for invoice and outgoing payments, with duplicate-data preflight. A live disposable Supabase migration run remains pending. | Pass in source; live migration pending |
| ST-18 | The first GitHub dependency-review run correctly failed because Dependency Graph was disabled. Dependency vulnerability alerts and Dependabot security updates were then enabled through GitHub; a fresh PR run is required to verify the correction. | Pending fresh GitHub run |

No scan was run against the public Production domain. A CSP/header check on a protected Vercel Preview remains required before merge because Vite's local preview server does not apply `vercel.json` response headers.
