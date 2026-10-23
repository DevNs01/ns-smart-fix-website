# Security Monitoring

## Current capability

The application emits privacy-minimised structured events for quotation delivery, browser errors, scheduled uptime checks, slow API responses, and monitoring failures. Public monitoring intake, alert deduplication, quotation submissions and admin login attempts use Supabase-backed shared budgets suitable for multiple serverless instances. Database triggers record authenticated business mutations, and administrator-only views expose the audit log.

These application records complement—not replace—Vercel request/firewall/deployment events, Supabase Auth/database/Storage evidence, Resend delivery status, and GitHub audit/workflow/security alerts. Provider-side retention and alert configuration must be verified separately.

## Recommended alerts

- Application: repeated shared-limit rejection/failure, login abuse, quotation email/storage failure, browser-error spike, audit-log anomaly, proof-access anomaly and scheduled health-check failure.
- Vercel: material traffic anomaly, DDoS/WAF action, repeated 4xx/5xx spike, bandwidth/cost anomaly, deployment failure, domain/configuration change and new project member.
- Supabase/Resend: authentication anomaly, migration or policy change, unusual service-role activity, Storage access anomaly and sustained email rejection/bounce.
- GitHub: secret-scanning alert, push-protection bypass, CodeQL high/critical alert, Dependabot high/critical alert, failed required check, branch-protection change, workflow-file change and unexpected repository member/deploy key.
- Identity: owner/admin MFA disabled, new recovery method, suspicious login or new personal access token.

Suggested starting thresholds require tuning: alert on any Critical/High security finding; any Production configuration/member change; three consecutive Production build failures; 5xx above 2% for five minutes; or traffic/cost exceeding three times the normal hourly baseline.

## Incident review

1. Preserve timestamps, deployment IDs, commit SHAs, request IDs and provider audit records; do not copy full customer messages or credentials into tickets.
2. Establish scope and severity. Revoke exposed credentials and restrict affected access first.
3. Roll back only to a known-good deployment and preserve evidence.
4. Review GitHub commits/workflows, Vercel activity/firewall events and identity-provider events.
5. Notify authorised business owners and legal/privacy advisers when personal data may be involved.
6. Correct the root cause, verify the fix in a protected Preview deployment, document residual risk and obtain approval before Production.
7. Conduct a blameless post-incident review and track control improvements.

## Log handling

Keep access restricted by role. Do not log passwords, tokens, cookies, full WhatsApp message URLs, full phone/email/address values, uploaded content or environment values. Prefer event type, result, timestamp, actor/service identifier, masked subject identifier, deployment/commit ID and correlation ID. Define retention from operational and legal needs; as a starting point, consider 90 days searchable and up to 12 months restricted archive, subject to professional privacy/legal review and provider-plan capability.

Extend the existing event model when adding authentication factors, exports, new upload/download types, permissions, integrations, or configuration mutations. Keep full customer messages, proof bytes, credentials, tokens, cookies, and raw payment identifiers out of monitoring payloads.
