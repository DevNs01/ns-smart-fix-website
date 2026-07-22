# Security Test Results

Execution date: 22 July 2026. Target: local repository and local build only.

| ID | Actual result / evidence | Result |
|---|---|---|
| ST-01 | Initial `npm ci` failed because the user npm cache had root-owned entries. Re-run with isolated `/private/tmp/ns-smart-fix-npm-cache` installed 22 packages successfully. CI uses a clean runner. | Pass with environment note |
| ST-02 | `npm audit` reported 0 vulnerabilities after clean install. | Pass |
| ST-03 | `npm run check` passed lint, syntax checking, 3/3 Node tests, Vite build, functional verifier and security verifier. | Pass |
| ST-04 | Reachable-history high-confidence signature scan found no matches; `.env` files are untracked/ignored; bundle patterns checked. This is not proof that no secret exists. | Pass |
| ST-05 | `scripts/security-test.mjs` parsed `vercel.json` and verified required headers/CSP directives. | Pass |
| ST-06 | CSP is designed for the current runtime. Dynamic Design Canvas compilation requires `script-src 'unsafe-eval'`; browser verification on a Preview is still required before merge. | Partial / manual Preview check |
| ST-07 | No `dangerouslySetInnerHTML` in application code; fixed WhatsApp origin and `encodeURIComponent` verified. Generated runtime parses trusted checked-in templates. | Pass with runtime residual risk |
| ST-08 | No redirect parameter or arbitrary URL input exists. Destinations are fixed in source. | Pass |
| ST-09 | Field `maxlength`/types and name, phone, email, date and aggregate-length checks added. These are client controls because no server exists. | Pass for current architecture |
| ST-10 | File selection allowlist, count and size checks added. No bytes are uploaded; signature/malware checks are not applicable until an upload service exists. | Pass for current architecture |
| ST-11 | Existing static verifier checked every `_blank` anchor for `noopener`; security test required both `noopener noreferrer`. | Pass |
| ST-12 | No `.map` appeared in Production output; verifier rejects future source maps. Hashed assets receive immutable caching. | Pass |
| ST-13 | Repository inspection confirms no backend routes/API/database/server URL fetch/cookie session/state-changing GET. | Not applicable |
| ST-14 | Repository inspection confirms no login implementation, accounts, protected documents or roles despite unused translation labels. | Not applicable |
| ST-15 | Final Vite Production build passed; 20 referenced assets plus navigation, contact links and form handoffs were verified. Browser testing found loaded images, no console error/warning, no horizontal overflow and no injected element after malicious-looking input. | Pass |
| ST-16 | The first GitHub dependency-review run correctly failed because Dependency Graph was disabled. Dependency vulnerability alerts and Dependabot security updates were then enabled through GitHub; a fresh PR run is required to verify the correction. | Pending fresh GitHub run |

No scan was run against the public Production domain. A CSP/header check on a protected Vercel Preview remains required before merge because Vite's local preview server does not apply `vercel.json` response headers.
