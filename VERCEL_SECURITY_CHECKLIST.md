# Vercel Security Checklist

Reviewed against Vercel documentation current on 22 July 2026. No dashboard, DNS or Production setting was changed during this work.

## Completed in code

- Vite build and `dist` output are explicit in `vercel.json`.
- Enforced compatible CSP, HSTS, MIME sniffing protection, referrer policy, permissions policy, anti-framing, COOP/CORP and cross-domain policy headers.
- CSP blocks objects, framing and form submissions; restricts resources; and upgrades insecure requests.
- Hashed static assets receive immutable caching. Vite production source maps remain disabled.
- No environment variables or Vercel credentials are required by the site.

## Required dashboard actions

- Confirm the Git repository is `DevNs01/ns-smart-fix-website` and Production Branch is `main`.
- Require reviewed merges and successful CI before changes reach `main`; do not manually deploy this security branch to Production.
- Enable Standard Deployment Protection with Vercel Authentication for Preview/deployment URLs. Keep the intended public Production domain accessible.
- Review project/team members; remove unused access; require MFA for all owners and administrators.
- Review Domains and remove only confirmed unused entries through a separate approved change. Do not alter DNS during this review.
- Review Activity/Firewall views after deploy and configure alerts available to the plan.
- Confirm no obsolete environment variables exist. If future secrets are added, scope distinct values to Development, Preview and Production and mark them sensitive.
- Review Git integration deployment permissions and ensure Production originates only from approved `main` commits.

## Firewall recommendations

The site has no API or server-side form endpoint, so application endpoint rate limits are currently not applicable. Use Vercel's platform DDoS protection and monitor static-request anomalies. Consider log/challenge rules for clearly abusive automated traffic only after observing normal traffic; avoid blocking search-engine crawlers needed for SEO.

If `/api`, login, reset, upload, search or submission endpoints are added, set endpoint-specific burst and sustained rate limits and application-level per-account limits. Test in Preview before enforcement.

## Plan-dependent features

- Vercel WAF custom controls are available subject to the current plan and product terms.
- Advanced Deployment Protection, password protection, trusted IPs, managed rulesets, advanced audit logs and log-drain capabilities vary by plan.
- Do not purchase or enable a paid control automatically. The owner should assess cost, user access and operational recovery first.

## Optional advanced controls

- Export restricted logs to an approved SIEM with minimised fields and retention controls.
- Use Vercel Authentication for non-public deployments and a header-based automation bypass only for authorised CI; never put a bypass secret in a URL.
- Establish an emergency rollback runbook and quarterly access review.

References: [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection), [Vercel Firewall](https://vercel.com/docs/vercel-firewall), and [Vercel response headers](https://vercel.com/docs/headers/response-headers).
