# Security Audit

Audit date: 22 July 2026. Scope: repository, reachable Git history signature scan, dependencies, local build and Vercel/GitHub configuration files. Standard: OWASP ASVS 5.0 Level 2 requirements applicable to this static architecture. This is a secure-development review, not a penetration test or certification.

## Remediation addendum — 9 October 2026

The repository now also contains a Supabase-backed staff portal and Vercel API functions. The October remediation removes the legacy standalone-invoice route and authenticated direct invoice inserts, adds transaction-coupled database audit triggers, replaces process-local login throttling with an atomic shared database limiter, and precompiles the public-site logic so the global CSP no longer needs `unsafe-eval`. The complete local suite and a production-build browser render passed. Production is not remediated until the new Supabase migration and matching application deployment are promoted together.

## Remediation addendum — 18 October 2026

The public WhatsApp follow-up URLs now contain only a generated request reference and fixed explanatory text; names, contact details, locations, descriptions, budgets and filenames are not placed in the URL. The staff portal remediation also removes authenticated table-level writes, introduces narrowly scoped transactional RPCs for draft-quotation replacement and payment recording, verifies payment-proof objects at the database boundary, moves monitoring throttling to the shared database limiter, and binds quotation delivery to the exact reserved snapshot. Deployment still requires the two accompanying Supabase migrations and matching application release.

## Remediation addendum — 23 October 2026

The repository security-health scan found five medium-severity issues: mutable invoice proof objects, reusable invoice and finance proof paths, process-local quotation abuse controls, and Vite 8.1.5 advisories. The matching patch removes staff Storage UPDATE authority, adds database uniqueness for proof bindings, moves quotation rate and duplicate budgets to the shared Supabase limiter, prefers the Vercel-managed client IP header, and updates Vite to 8.3.5. Production remains unremediated until duplicate-path preflight is clean, `202610230001_lock_financial_payment_proofs.sql` is applied, and the matching application is deployed.

## Summary

| Severity | Open | Fixed | Not applicable |
|---|---:|---:|---:|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 9 | 0 |
| Low | 1 | 3 | 0 |
| Informational | 1 | 1 | 4 |

## Findings

### NSF-SEC-001 — Missing browser security headers

- **Severity:** Medium
- **References:** OWASP ASVS 5.0 V3 Web Frontend Security; CWE-693
- **Affected:** `vercel.json` (previous complete file)
- **Evidence:** Baseline configured only framework, build command and output directory.
- **Scenario:** A page could be framed, MIME-sniffed or granted a broader resource-loading policy than necessary.
- **Impact:** Reduced browser defense in depth and higher impact from a future injection flaw.
- **Remediation:** Add and verify CSP, HSTS, nosniff, referrer, permissions and isolation/anti-framing headers.
- **Status:** Fixed in code.
- **Verification:** Automated header/CSP parser added; final Vercel Preview header/console check remains required.
- **Residual risk:** Hosting configuration can override behavior; deployed headers still require verification after promotion.

### NSF-SEC-002 — Generated runtime requires dynamic code compilation

- **Severity:** Medium
- **References:** OWASP ASVS 5.0 V3 Web Frontend Security; CWE-95
- **Affected:** `support.js` around `evalDcLogic` and external-module runtime
- **Evidence:** Checked-in trusted template logic is compiled with `new Function`; the compatible CSP therefore contains `script-src 'unsafe-eval'`.
- **Scenario:** If an attacker later gains control of template/script source or a vulnerable injection path, dynamic compilation can increase execution impact and limits CSP protection.
- **Impact:** Weaker XSS defense in depth.
- **Remediation:** Replace/export the Design Canvas runtime with precompiled React components, then remove `unsafe-eval`; do not feed remote or user-controlled templates into this runtime.
- **Status:** Fixed in code on 9 October 2026.
- **Verification:** The runtime contains no `eval`/`new Function`, the CSP rejects `unsafe-eval`, the complete local suite passes, and browser verification of the production build found a complete render with no console warnings or unresolved bindings.
- **Residual risk:** The deployed Vercel response header must be checked after promotion.

### NSF-SEC-003 — No automated repository security gates

- **Severity:** Medium
- **References:** OWASP ASVS 5.0 V15 Secure Coding and Architecture; CWE-1104
- **Affected:** Baseline had no `.github` workflows or Dependabot configuration.
- **Evidence:** No PR build, audit, dependency review or CodeQL configuration existed.
- **Scenario:** A vulnerable dependency or unsafe code/configuration change could be merged without an automated signal.
- **Impact:** Supply-chain and regression risk.
- **Remediation:** Add least-privilege, immutable-SHA CI, CodeQL, dependency review and Dependabot; protect `main` with required reviews/checks.
- **Status:** Fixed in code; repository settings remain a manual owner action.
- **Verification:** Workflow syntax and pinned SHAs inspected; GitHub execution is pending the draft PR.
- **Residual risk:** Feature availability depends on repository visibility/plan and required-check configuration.

### NSF-SEC-004 — Public form boundary and file-selection controls were minimal

- **Severity:** Low
- **References:** OWASP ASVS 5.0 V2 Validation and Business Logic; CWE-20
- **Affected:** `index.html` quick enquiry, quotation controls and handlers
- **Evidence:** Baseline checked only required name/phone and email shape; fields lacked practical maximums; file selection accepted arbitrary types/counts/sizes.
- **Scenario:** Very large or malformed text could create unusable WhatsApp URLs, and misleading file selections could imply unsupported uploads.
- **Impact:** Availability/UX issues and unsafe assumptions if an upload backend is later connected.
- **Remediation:** Add allowlists, length/type/date checks and file count/type/extension/size limits. Add full server validation before any server endpoint exists.
- **Status:** Fixed for current client-only architecture.
- **Verification:** Unit/static security tests cover constraints and invalid metadata branches; final local test rerun required.
- **Residual risk:** Client validation is bypassable and must never be reused as server trust. Magic-byte/malware validation is impossible because no file bytes are transmitted.

### NSF-SEC-005 — Enquiry personal data is transferred through a WhatsApp URL

- **Severity:** Medium
- **References:** OWASP ASVS 5.0 V14 Data Protection; CWE-359
- **Affected:** `index.html` WhatsApp message construction
- **Evidence:** The earlier implementation encoded name, phone, project location and description into the query of a fixed `wa.me` link after submission.
- **Scenario:** On a shared device, browser history, clipboard/screenshots or WhatsApp account access may reveal enquiry details.
- **Impact:** Disclosure of customer/contact/site information.
- **Remediation:** Keep collection minimal; clearly tell users that clicking transfers details to WhatsApp; discourage secrets or sensitive site/security information; consider a properly secured server form with defined retention if business needs expand.
- **Status:** Fixed in code on 18 October 2026.
- **Verification:** Static and unit tests require a reference-only WhatsApp message and reject form-field interpolation into the URL.
- **Residual risk:** The generated request reference and fixed business message are still disclosed to WhatsApp and may remain in browser or device history; endpoint handling is outside this repository.

### NSF-SEC-006 — External Google Fonts dependency

- **Severity:** Low
- **References:** OWASP ASVS 5.0 V3/V15; CWE-829
- **Affected:** `index.html` helmet links and CSP
- **Evidence:** Browser loads CSS from `fonts.googleapis.com` and font files from `fonts.gstatic.com`.
- **Scenario:** Third-party availability/privacy/supply-chain issues affect visitors and require broader CSP.
- **Impact:** Minor privacy metadata exposure and availability dependency.
- **Remediation:** Self-host licensed font files and restrict CSP to self in a reviewed future change.
- **Status:** Open; changing font delivery could alter design and was not necessary for a confirmed defect.
- **Verification:** Source/CSP inspection.
- **Residual risk:** Browser connects directly to Google for fonts.

### NSF-SEC-007 — Environment/secrets guidance absent

- **Severity:** Low
- **References:** OWASP ASVS 5.0 V13 Configuration; CWE-798
- **Affected:** `.gitignore`, repository documentation
- **Evidence:** Environment files were ignored, but there was no safe `.env.example`, rotation procedure or automated client-bundle pattern check.
- **Scenario:** A future developer could put a secret in `VITE_*` or commit a local credential.
- **Impact:** Credential disclosure.
- **Remediation:** Add safe template/guidance, history and bundle checks, GitHub secret scanning and push protection.
- **Status:** Fixed in code; GitHub settings pending.
- **Verification:** No high-confidence secret signature matched reachable history; no required variables exist; automated patterns added.
- **Residual risk:** Pattern scans have false negatives; provider-side scanning and review remain necessary.

### NSF-SEC-008 — Security monitoring was platform-only

- **Severity:** Informational
- **References:** OWASP ASVS 5.0 V16 Security Logging and Error Handling; CWE-778
- **Affected:** Earlier static-site architecture/repository
- **Evidence:** The earlier site had no application security event stream.
- **Scenario:** Abuse or deployment/account compromise could be noticed only in GitHub/Vercel/provider evidence.
- **Impact:** Slower detection/response.
- **Remediation:** Configure provider alerts/access review now; implement privacy-preserving structured audit events before any portal/backend launch.
- **Status:** Fixed in code. The current APIs emit privacy-minimised operational events, use shared alert deduplication, expose database audit records to administrators, and run an authenticated scheduled health check.
- **Verification:** Monitoring, health, shared-budget and audit-trigger tests plus repository inspection.
- **Residual risk:** Alert delivery, provider audit logs and retention still depend on external plan/settings.

## Current control boundaries

Authentication, sessions, password recovery, RBAC, same-origin mutation checks, database RLS/RPCs, private proof uploads/downloads, financial workflows and administrator audit trails are in scope and implemented. Provider-managed MFA, backups, infrastructure encryption, firewall settings, account membership and deployed migration state require owner verification outside the repository. Reassess cross-origin API policy, SSRF and any tenant/record-ownership boundary if new integrations or multi-organisation access are introduced.

Reference: [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS/releases/tag/v5.0.0_release).
