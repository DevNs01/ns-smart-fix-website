# NS Smart Fix Solution Website

Bilingual English/Bahasa Malaysia website for NS Smart Fix Solution. The original Design Canvas export is packaged as a React 18 + Vite application for local development and Vercel deployment.

## Requirements

- Node.js 24.x
- npm 10 or newer

## Local installation

```bash
git clone https://github.com/DevNs01/ns-smart-fix-website.git
cd ns-smart-fix-website
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Production build

```bash
npm run check
```

The command creates the production website in `dist/` and verifies referenced images, navigation handlers, phone links, WhatsApp links, and the client-side form handoffs. To preview the production output:

```bash
npm run preview
```

## Forms

The quick enquiry and quotation forms securely post their details to `/api/quotation`, where a Vercel Function validates the submission and sends formatted HTML and plain-text emails. Both forms are protected by Cloudflare Turnstile, per-IP request throttling and duplicate-submission detection. Email and Turnstile credentials remain server-side.

Selected attachment names are included in the email, but the files themselves are not uploaded or attached. Customers should send supporting files directly through WhatsApp.

## Environment variables

Configure these server-only variables in Vercel:

- `RESEND_API_KEY` — API key created in Resend
- `QUOTATION_FROM_EMAIL` — verified sender, for example `NS Smart Fix Website <website@nssmartfixsolution.com>`
- `QUOTATION_TO_EMAIL` — recipient; defaults to `admin@nssmartfixsolution.com`
- `TURNSTILE_SITE_KEY` — public site key from the Cloudflare Turnstile widget
- `TURNSTILE_SECRET_KEY` — secret used only by `/api/quotation` for server-side verification
- `MONITORING_ALERT_EMAIL` — operational alert recipient; defaults to `admin@nssmartfixsolution.com`
- `CRON_SECRET` — long random secret used by Vercel Cron to authorize uptime checks
- `MONITORING_SLOW_API_MS` — optional slow-response threshold in milliseconds; defaults to `3000`
- `MONITORING_ALERT_COOLDOWN_MS` — optional duplicate alert cooldown; defaults to 15 minutes

Verify `nssmartfixsolution.com` in Resend before using the production sender. Store local values in `.env.local`; environment files are excluded by `.gitignore`. Never prefix secrets with `VITE_`.

## Deploy to Vercel

1. Import `DevNs01/ns-smart-fix-website` into Vercel.
2. Select the Vite framework preset if it is not detected automatically.
3. Use `npm run build` as the build command.
4. Use `dist` as the output directory.
5. Add the email and Turnstile variables described above.
6. Verify the sending domain in Resend.
7. In Cloudflare Turnstile, allow `nssmartfixsolution.com` for the widget.
8. Deploy.

The checked-in `vercel.json` contains the same build and output settings.

## Admin portal foundation

The repository includes the Phase 1 Supabase database foundation for the internal business portal. It adds normalized customer, quotation, invoice, payment and receipt records; protected audit logs; atomic monthly document numbering; server-validated invoice balances; Row Level Security; and a private payment-proof bucket.

See [Admin Portal Architecture](docs/ADMIN_PORTAL_ARCHITECTURE.md) for the phased implementation plan and security boundary.

To prepare a Supabase project locally:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

`supabase/seed.sql` contains non-sensitive defaults for local development and `supabase db reset`. Do not use `--include-seed` against production. The migration itself safely creates the production default settings row with tax disabled at 0%.

Add these variables to `.env.local` for local work and to the appropriate Vercel environments for deployment:

- `VITE_SUPABASE_URL` — public Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — public anonymous/publishable key protected by RLS
- `SUPABASE_SERVICE_ROLE_KEY` — server-only key for trusted Vercel Functions

The service-role key must never use the `VITE_` prefix. Phase 1 does not change the public form or expose an `/admin` UI; authentication and the protected portal shell are delivered in Phase 2 after the Supabase project is configured.

## Production monitoring and recovery

The production deployment exposes `/api/health` and runs an authenticated Vercel Cron check every 10 minutes. Monitoring covers website availability, unexpected quotation failures, Resend delivery failures, slow API responses, browser JavaScript errors, unhandled promise rejections and application boot timeouts.

Operational alerts are sent to `MONITORING_ALERT_EMAIL` and also recorded as structured Vercel Function logs. Alerts deliberately contain only the event category, route, status, timing, stage and deployment identifier. Customer names, email addresses, phone numbers, IP addresses, quotation descriptions and uploaded file names are never included.

If Resend itself is unavailable, the email alert cannot use that same provider; the redacted structured event remains available in Vercel logs for recovery investigation. The health endpoint reports only service readiness and never returns environment-variable values.

## Security

Run the complete local security and build verification with:

```bash
npm run check
```

See [SECURITY.md](SECURITY.md) to report a vulnerability privately. The repository also contains the threat model, security audit, configuration guidance, test evidence and Vercel owner checklist. Do not put secrets in `VITE_*` variables because Vite exposes them in the browser bundle.

## Project structure

```text
index.html        Design Canvas page template and bilingual content
src/main.js       React/Vite runtime entry point
support.js        Exported Design Canvas renderer
public/assets/    Images copied unchanged into the production build
scripts/verify.mjs Static production verification
vercel.json       Vercel build configuration
```
