# Mobile QA Report

Date: 22 July 2026  
Branch: `fix/mobile-cta-layout`

## Scope

Responsive QA of the local Production build, focused on the Products call-to-action reported by the owner and related mobile risks in navigation, forms, fixed actions, legal controls, footer layout, images and overflow.

## Defects fixed

| ID | Finding | Cause | Resolution | Result |
|---|---|---|---|---|
| MQA-001 | WhatsApp and Request Quotation buttons overlapped on Products | Inline elements depended on margin and text wrapping without a layout container | Added a responsive flex container; CTAs stack full-width with a 12px gap on mobile | Pass |
| MQA-002 | iOS could zoom into quotation fields | Some form controls rendered at 14px | All mobile inputs, selects and textareas render at 16px | Pass |
| MQA-003 | Bottom fixed actions could be cramped by long BM text and iPhone safe area | No safe-area padding or consistent action height/wrapping | Added safe-area inset, 52px minimum actions, centred multiline labels and constrained widths | Pass |
| MQA-004 | Long legal tab labels could become cramped | Three tabs remained on one row | Legal tabs stack vertically on mobile | Pass |
| MQA-005 | Footer columns were narrow on small phones | Two columns remained below 480px | Footer changes to one column at 480px and below | Pass |
| MQA-006 | Mobile menu tap target was 40px | Toggle dimensions were below the preferred 44px target | Increased mobile toggle to 44 × 44px | Pass |

## Test evidence

| Test | Result |
|---|---|
| 375 × 812 Products, English CTA geometry | Both buttons 256 × 48px; vertical gap 12px; no overlap |
| 375 × 812 Products, BM CTA geometry | Both buttons 256 × 48px; no overlap |
| 375 × 812 sticky bar, EN/BM | Three equal-width actions; each 52px high; long quotation label wraps safely |
| 320 × 568 home edge case | `scrollWidth` equals viewport width; no horizontal overflow |
| Mobile form controls | Computed font size 16px |
| Images | No broken inspected image |
| Browser console | No errors or warnings |
| Automated suite | Lint, syntax, 3 unit tests, Vite Production build, 20 asset/navigation/contact checks and security checks passed |

## Regression notes

- Desktop CTAs remain inline and centred.
- WhatsApp destinations, phone numbers, form behavior, content, SEO and navigation logic were not changed.
- External WhatsApp navigation was not triggered during QA.
