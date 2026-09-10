# NS Smart Fix Admin Portal Architecture

## Existing application

The public website remains a React 19 application built with Vite. `index.html` contains the existing bilingual Design Canvas templates and styling, `support.js` renders them, `src/main.js` boots React, and Vercel rewrites friendly URLs to the single-page application. Server-side quotation email delivery is handled by `api/quotation.js`.

The portal will extend this application instead of migrating or redesigning the public site.

## Security boundary

- The browser may receive only the Supabase project URL and publishable/anonymous key.
- The Supabase service-role key is server-only and may be used only by trusted Vercel Functions.
- `/admin` will require Supabase Authentication and an active `profiles` row.
- Database authorization is enforced by Row Level Security, not only by hidden UI controls.
- Public quotation requests will enter through the existing validated, Turnstile-protected Vercel Function. The function will store a lead using the server-only key; anonymous browsers receive no direct write policy.
- Financial totals and document numbering are revalidated transactionally in PostgreSQL.

## Data model

The Phase 1 migration creates `profiles`, `customers`, `quotation_requests`, `quotations`, `quotation_items`, `invoices`, `invoice_items`, `payments`, `receipts`, `company_settings`, `document_sequences`, and protected `audit_logs`.

Customer details are also stored as JSON snapshots on quotations and invoices. This preserves the historical recipient and pricing context when a customer record changes later.

Document numbers are allocated by the `next_document_number` database function with an atomic upsert, producing monthly sequences such as `NSS-QT-202609-001`. Unique constraints remain the final duplicate safeguard.

Payment triggers lock the invoice row, reject overpayments, recalculate the balance, and update payment status. A partial unique index prevents accidental duplicate invoices from one quotation unless an authorized workflow explicitly marks the duplicate as intentional.

Payment proofs use a private Supabase Storage bucket limited to JPEG, PNG, WebP, and PDF files up to 5 MB.

## Incremental delivery

1. Database schema, RLS, storage policy, secure numbering and documentation.
2. Supabase Authentication, active Admin/Staff profiles, and protected `/admin` shell.
3. Customer and public quotation-request management.
4. Quotation editor, calculations, lifecycle and PDF generation.
5. Invoice conversion, invoice editor and lifecycle.
6. Partial payments, private proof uploads and receipts.
7. Professional server-generated A4 PDFs and email delivery.
8. Dashboard metrics, search, filters and reporting.
9. Immutable audit events, authorization tests and final security review.

Each phase must pass the existing `npm run check` suite and add focused tests before deployment.

## Phase 2 prerequisites

1. Create a Supabase project in the same business-controlled account used for production services.
2. Apply migrations and seed data with the Supabase CLI.
3. Create the first user in Supabase Authentication.
4. Insert a matching active `profiles` row with the `admin` role using the SQL editor.
5. Add the documented Supabase variables to Vercel Production and Preview environments.
6. Configure the production and local redirect URLs in Supabase Authentication.

Never paste credentials into source files, GitHub issues, pull requests, screenshots, or support messages.

