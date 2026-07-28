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
