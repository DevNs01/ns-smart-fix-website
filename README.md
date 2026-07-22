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

The quick enquiry and quotation forms run entirely in the browser. They validate required fields, create a reference number, and prepare an encoded WhatsApp message for the customer to send. No form data or selected files are uploaded to a server. Customers should attach any supporting files directly in WhatsApp.

## Environment variables

None are required. The project contains no API keys or server-side credentials. If environment variables are added later, store them in Vercel project settings or a local `.env` file; `.env` files are excluded by `.gitignore`.

## Deploy to Vercel

1. Import `DevNs01/ns-smart-fix-website` into Vercel.
2. Select the Vite framework preset if it is not detected automatically.
3. Use `npm run build` as the build command.
4. Use `dist` as the output directory.
5. No environment variables are required.
6. Deploy.

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
