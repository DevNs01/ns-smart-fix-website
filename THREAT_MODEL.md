# Threat Model

## Scope and system overview

This model was updated on 18 October 2026. The application is a bilingual public marketing site plus an authenticated staff portal. Vercel serves the site and server-side API functions; Supabase provides authentication, PostgreSQL, row-level security and private payment-proof storage; Resend delivers transactional email.

The quick-enquiry and quotation interfaces submit validated details to the server for email processing. Their optional WhatsApp follow-up links contain only fixed text and an opaque request reference. The visitor must explicitly click the link to transfer that reference to WhatsApp. Selected public-form file names are sent with the email but file bytes are not uploaded.

## Assets and personal data

- Brand, website content, business contact numbers and domain reputation.
- Availability and integrity of the public website.
- Visitor names, telephone numbers, optional email, company, project location, requested visit date and enquiry description while present in browser memory or processed by the server/email provider.
- Selected file names; file contents remain local unless the visitor separately attaches them in WhatsApp.
- Staff identities and sessions; customers, requests, quotations, invoices, payments, receipts, finance records, worker records and audit logs.
- Private payment-proof objects, encrypted worker payment identifiers and server-side credentials.
- GitHub repository integrity, Supabase/Vercel project configuration and deployment authority.

Application secrets remain server-side. Staff authentication is handled by Supabase Auth and business mutations are performed by trusted server APIs or narrowly scoped database RPCs.

## Roles and trust boundaries

- Public visitor: untrusted input at all website controls.
- Authenticated staff and administrators: use the portal according to role.
- Business recipient: receives server-delivered email and visitor-initiated WhatsApp references.
- Repository maintainer: can change source and workflows.
- Supabase/Vercel project member: can configure and deploy the application and database.
- Google Fonts and WhatsApp: third parties reached from the visitor's browser.

Trust boundaries are browser-to-Vercel, Vercel-to-Supabase/Resend, browser-to-Supabase Auth and signed storage access, browser-to-Google Fonts/WhatsApp, GitHub-to-Vercel deployment, and maintainer-to-GitHub/Supabase/Vercel administrative access.

## Entry points and data flows

1. A visitor requests static content from Vercel.
2. The browser requests font CSS/font files from Google.
3. A visitor enters enquiry data; client and server validation run before a transactional email is accepted.
4. The optional fixed-domain WhatsApp link contains only an opaque request reference and fixed text.
5. Staff authenticate through Supabase and call Vercel APIs; server functions enforce role and use service credentials for audited business mutations.
6. Scoped database RPCs atomically replace draft quotations and record invoice payments; the payment RPC verifies the referenced private storage object.
7. GitHub changes may trigger CI and a Vercel deployment through the repository integration; reviewed SQL migrations change Supabase controls.

Public routes are implemented as in-page client state. The repository also contains protected staff views and `/api` functions for authentication, business operations, email and monitoring.

## Threat actors and abuse cases

- Opportunistic attacker attempting DOM XSS, URL manipulation, framing, malicious browser input or denial of service.
- Supply-chain attacker compromising an npm package, GitHub Action, maintainer account or external font service.
- Spam/scraping bot harvesting public business details or repeatedly requesting static assets.
- Malicious contributor attempting to commit a secret or weaken deployment configuration.
- Social engineer impersonating the business through a lookalike domain or altered WhatsApp number.
- Malicious or compromised staff account attempting to exceed its role, alter financial evidence, reuse proof objects, or misuse broad organisation-wide read access.

## Threat analysis

- **Injection/XSS:** Content is fixed in source and rendered as text through the runtime. Dynamic code compilation in the generated runtime requires CSP `unsafe-eval`, weakening defense in depth.
- **URL/open redirect:** WhatsApp hostname and business numbers are fixed; only fixed text plus an opaque request reference is encoded. There is no redirect parameter.
- **Framing:** Clickjacking is blocked by CSP `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- **Uploads:** Public quotation forms transmit filenames only. Authenticated staff can upload JPG/PNG/WebP/PDF payment evidence up to 5 MB through signed URLs into private `payment-proofs` and `finance-proofs` buckets. Proof objects are append-only, and database uniqueness binds each path to one financial transaction. Magic-byte and malware scanning remain recommended hardening for higher-risk deployments.
- **Authentication/authorisation:** Server APIs validate active staff sessions and roles. Authenticated database table access is read-only; scoped RPCs and trusted server mutations enforce business-state transitions.
- **Privacy:** WhatsApp follow-up URLs contain only a request reference. Personal enquiry details remain subject to server, email-provider and endpoint retention controls.
- **Supply chain:** npm lockfile, immutable Action SHAs, Dependabot, dependency review, CodeQL and least-privilege workflow permissions reduce risk.
- **Deployment:** An unprotected branch, excessive Vercel/GitHub access or automatic Production deploy from an unreviewed branch could change public content.
- **Monitoring and abuse controls:** Application alerts, client error intake, public quotation submissions and login attempts use shared database-backed limits so enforcement remains consistent across serverless instances.

## Required controls for portal expansion

Preserve the maintained identity provider, server-only validated configuration, secure HttpOnly sessions, central RBAC, same-origin mutation checks, schema validation, shared per-IP/account limits, private append-only object storage, authorised short-lived downloads, structured audit logs, retention/deletion controls, non-Production test data, and dedicated negative tests. Add administrator MFA, magic-byte validation and malware scanning before the risk or compliance profile requires them.

## Assumptions and review triggers

This model assumes the Vercel application and ordered Supabase migrations are deployed together, server secrets remain confined to API functions, and no untracked backend or policy override exists. Repeat threat modelling before adding a new identity, role, integration, data class, upload type, payment flow, provider, or material hosting/runtime change.
