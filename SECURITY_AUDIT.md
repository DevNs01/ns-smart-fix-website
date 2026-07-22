# Security Audit

Audit date: 22 July 2026. Scope: repository, reachable Git history signature scan, dependencies, local build and Vercel/GitHub configuration files. Standard: OWASP ASVS 5.0 Level 2 requirements applicable to this static architecture. This is a secure-development review, not a penetration test or certification.

## Summary

| Severity | Open | Fixed | Not applicable |
|---|---:|---:|---:|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 2 | 2 | 0 |
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
- **Residual risk:** Hosting configuration can override behavior; CSP requires `unsafe-eval` as described in NSF-SEC-002.

### NSF-SEC-002 — Generated runtime requires dynamic code compilation

- **Severity:** Medium
- **References:** OWASP ASVS 5.0 V3 Web Frontend Security; CWE-95
- **Affected:** `support.js` around `evalDcLogic` and external-module runtime
- **Evidence:** Checked-in trusted template logic is compiled with `new Function`; the compatible CSP therefore contains `script-src 'unsafe-eval'`.
- **Scenario:** If an attacker later gains control of template/script source or a vulnerable injection path, dynamic compilation can increase execution impact and limits CSP protection.
- **Impact:** Weaker XSS defense in depth.
- **Remediation:** Replace/export the Design Canvas runtime with precompiled React components, then remove `unsafe-eval`; do not feed remote or user-controlled templates into this runtime.
- **Status:** Open; requires architectural migration and design regression testing.
- **Verification:** Source inspection and CSP test confirm the dependency.
- **Residual risk:** Current templates are static and checked into Git; `frame-ancestors 'none'` blocks editor embedding in Production, but CSP cannot be considered strict until migration.

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
- **Evidence:** Name, phone, project location and description are encoded into the query of a fixed `wa.me` link after submission.
- **Scenario:** On a shared device, browser history, clipboard/screenshots or WhatsApp account access may reveal enquiry details.
- **Impact:** Disclosure of customer/contact/site information.
- **Remediation:** Keep collection minimal; clearly tell users that clicking transfers details to WhatsApp; discourage secrets or sensitive site/security information; consider a properly secured server form with defined retention if business needs expand.
- **Status:** Open / product-owner acceptance required. Preserved because WhatsApp handoff is existing core functionality.
- **Verification:** Data-flow/source review; fixed destination and encoding verified.
- **Residual risk:** WhatsApp and endpoint-device handling are outside this repository.

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

### NSF-SEC-008 — Security monitoring is platform-only

- **Severity:** Informational
- **References:** OWASP ASVS 5.0 V16 Security Logging and Error Handling; CWE-778
- **Affected:** Architecture/repository
- **Evidence:** Static site has no application backend or security event stream.
- **Scenario:** Abuse or deployment/account compromise may be noticed only in GitHub/Vercel/provider evidence.
- **Impact:** Slower detection/response.
- **Remediation:** Configure provider alerts/access review now; implement privacy-preserving structured audit events before any portal/backend launch.
- **Status:** Documented; no application logging is justified for a static marketing site.
- **Verification:** Repository architecture inspection.
- **Residual risk:** Alert/log availability and retention depend on provider plan/settings.

## Not-applicable control families

Authentication, sessions, password reset, MFA implementation, RBAC/IDOR, CSRF, CORS API policy, SSRF, SQL/ORM, database encryption/backups, server-side uploads/download authorisation, payment security and administrator audit trails are not implemented because the corresponding systems do not exist. They are release-blocking requirements if those features are added later.

Reference: [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS/releases/tag/v5.0.0_release).
