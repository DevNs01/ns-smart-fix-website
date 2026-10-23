# Security Policy

## Supported version

Security fixes are applied to the current `main` branch. Older commits and preview deployments are not supported releases.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability-reporting feature for this repository when available. If it is not enabled, contact an authorised NS Smart Fix Solution representative through the business contact details already published on the website and ask for a private security-reporting channel. Do not send exploit details, credentials, tokens, customer data, or sensitive attachments through WhatsApp.

Include a clear description, affected URL or file, safe reproduction steps, impact, and any suggested remediation. Avoid destructive testing, service disruption, accessing other people's data, social engineering, persistence, or data exfiltration.

The maintainers will acknowledge reports when operationally possible, validate the issue, establish a remediation plan, and coordinate disclosure. No bounty or response-time commitment is offered unless confirmed separately in writing.

## Scope notes

The application includes a public website, Vercel API functions, an authenticated staff portal, Supabase Auth/PostgreSQL/private Storage, and Resend transactional email. Public quotation forms send validated text and filenames only; authenticated staff upload payment evidence directly to private Supabase buckets through signed URLs.

Security-sensitive changes include authentication/session handling, staff roles, service-role routes, database grants/RLS/RPCs, financial state transitions, private Storage policies, uploads, monitoring, provider credentials, and deployment configuration. Review the application and matching Supabase migrations together before every Production release.
