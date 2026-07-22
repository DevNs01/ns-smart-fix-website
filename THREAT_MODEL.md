# Threat Model

## Scope and system overview

This model covers the repository state reviewed on 22 July 2026. The application is a static bilingual marketing website built with React 18, Vite 8 and a generated Design Canvas browser runtime. Vercel serves static HTML, JavaScript, fonts and images. There is no application backend, API, database, authentication, session, payment processing, email service, analytics SDK, file-storage service, administrator portal or customer portal in this repository.

The quick-enquiry and quotation interfaces keep data in browser memory and construct an encoded `https://wa.me/` URL. The visitor must explicitly click the WhatsApp link to transfer data to WhatsApp. The file chooser stores sanitized filenames in memory only; file bytes are not uploaded or included in the WhatsApp URL.

## Assets and personal data

- Brand, website content, business contact numbers and domain reputation.
- Availability and integrity of the public website.
- Visitor names, telephone numbers, optional email, company, project location, requested visit date and enquiry description while present in browser memory or sent to WhatsApp.
- Selected file names; file contents remain local unless the visitor separately attaches them in WhatsApp.
- GitHub repository integrity, Vercel project configuration and deployment authority.

No passwords, account records, quotations, customer documents, payment data, API keys or database records are processed by this codebase today.

## Roles and trust boundaries

- Public visitor: untrusted input at all website controls.
- Business recipient: receives visitor-initiated WhatsApp messages outside this application.
- Repository maintainer: can change source and workflows.
- Vercel project member: can configure and deploy the site.
- Google Fonts and WhatsApp: third parties reached from the visitor's browser.

Trust boundaries are browser-to-Vercel, browser-to-Google Fonts, browser-to-WhatsApp, GitHub-to-Vercel deployment, and maintainer-to-GitHub/Vercel administrative access.

## Entry points and data flows

1. A visitor requests static content from Vercel.
2. The browser requests font CSS/font files from Google.
3. A visitor enters enquiry data. Client-side allowlists and length checks run; no network request occurs.
4. The application encodes approved fields into a fixed-domain WhatsApp URL.
5. The visitor clicks the link and leaves the site. WhatsApp becomes the data processor for that message.
6. GitHub changes may trigger CI and a Vercel deployment through the repository integration.

Public routes are implemented as in-page client state: Home, About, Services, Products, Quotation, Contact, FAQ and Legal. There are no protected, administrator, customer, API, Server Action, middleware or download routes.

## Threat actors and abuse cases

- Opportunistic attacker attempting DOM XSS, URL manipulation, framing, malicious browser input or denial of service.
- Supply-chain attacker compromising an npm package, GitHub Action, maintainer account or external font service.
- Spam/scraping bot harvesting public business details or repeatedly requesting static assets.
- Malicious contributor attempting to commit a secret or weaken deployment configuration.
- Social engineer impersonating the business through a lookalike domain or altered WhatsApp number.
- Future attacker targeting portal capabilities if accounts, APIs, uploads or documents are added without a new design review.

## Threat analysis

- **Injection/XSS:** Content is fixed in source and rendered as text through the runtime. Dynamic code compilation in the generated runtime requires CSP `unsafe-eval`, weakening defense in depth.
- **URL/open redirect:** WhatsApp hostname and business numbers are fixed; user content is passed only through `encodeURIComponent`. There is no redirect parameter.
- **Framing:** Clickjacking is blocked by CSP `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- **Uploads:** No upload endpoint exists. Browser selection is restricted to five JPG/PNG/WebP/PDF files of 5 MB each, but file signature scanning is impossible and unnecessary until bytes are transmitted.
- **Authentication/authorisation:** Not applicable to the current static site. Any account or portal feature must deny by default and perform server-side authentication, object ownership and RBAC checks.
- **Privacy:** Enquiry fields become part of a WhatsApp URL after explicit user action. Browser history, device sharing, WhatsApp and endpoint-device access are residual risks.
- **Supply chain:** npm lockfile, immutable Action SHAs, Dependabot, dependency review, CodeQL and least-privilege workflow permissions reduce risk.
- **Deployment:** An unprotected branch, excessive Vercel/GitHub access or automatic Production deploy from an unreviewed branch could change public content.
- **Monitoring:** Static hosting provides platform traffic/deployment logs but no application security events.

## Required controls before a portal is added

Use a maintained identity provider; server-only validated configuration; secure HttpOnly sessions; MFA for administrators; central RBAC; object-ownership checks; CSRF protection; schema validation; per-IP/account rate limits; private object storage; magic-byte checks and malware scanning; authorised short-lived downloads; structured audit logs; retention/deletion controls; non-Production test data; and dedicated negative tests for IDOR, cross-account access and session lifecycle.

## Assumptions and review triggers

This model assumes Vercel serves only the built static output and that no untracked backend exists. Repeat threat modelling before adding any API, database, authentication, upload, analytics, email, payment, admin or customer feature, and after a material hosting or runtime change.
