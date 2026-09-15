# NS Smart Fix Accounting Workflow

## Objective

Create a traceable quote-to-cash workflow in which a customer-approved quotation is the commercial source for an invoice, payments reduce the invoice balance, and receipts are generated only from recorded payments.

## Controlled lifecycle

1. **Website request** — New → Reviewing → Converted or Closed/Spam.
2. **Quotation** — Draft → Sent → Accepted or Rejected/Expired/Cancelled.
3. **Invoice conversion** — Only an Accepted quotation may be converted. One active invoice is allowed per quotation.
4. **Invoice** — Draft → Approved & Sent (Unpaid) → Partially Paid → Paid, with Overdue calculated from the due date. A Draft may be Cancelled; an issued invoice must be voided/cancelled with an audit reason rather than deleted.
5. **Payment** — A payment may be recorded only against an issued Unpaid, Partially Paid, or Overdue invoice. The database recalculates amount paid and balance.
6. **Receipt** — Created automatically from a successful payment and linked to the customer, invoice, and payment.

## Status transition controls

| Record | Current status | Permitted next status | Control |
|---|---|---|---|
| Quotation | Draft | Sent, Cancelled | Sent only by the approved email-delivery action |
| Quotation | Sent | Accepted, Rejected, Expired, Cancelled | Admin records the customer's decision |
| Quotation | Accepted | Converted to Invoice | Conversion action only |
| Quotation | Converted to Invoice | None | Locked commercial source |
| Invoice | Draft | Unpaid, Cancelled | Unpaid only after approval and successful delivery |
| Invoice | Unpaid | Partially Paid, Paid, Overdue, Cancelled | Payment statuses calculated by the database |
| Invoice | Partially Paid | Paid, Overdue, Cancelled | Payment statuses calculated by the database |
| Invoice | Paid | None | Locked financial record |

Rejected, expired, cancelled, converted, and paid records must remain available for audit and must not be physically deleted.

## Quotation-to-invoice conversion

The **Create Invoice** action appears only on an Accepted quotation. The server must:

1. Authenticate an active staff member.
2. Lock and re-read the quotation.
3. Reject any quotation that is not Accepted.
4. Reject conversion if an active invoice already exists.
5. Allocate the next invoice number atomically.
6. Copy the quotation's customer ID, customer snapshot, project, line items, discount, tax, other charges, total, and commercial terms.
7. Set the invoice date and due date from company settings.
8. Create the invoice as Draft.
9. Mark the quotation Converted to Invoice.
10. Record both changes in the audit log.

These database changes should run in one PostgreSQL transaction so a partial conversion cannot occur.

## Invoice review and delivery

Draft invoices may be edited before approval. The approval screen must show:

- Source quotation number
- Customer and confirmed recipient email
- Invoice date and due date
- Line items, discounts, tax, other charges, total, and balance
- Payment terms and company payment details

The admin must confirm the recipient and financial total before sending. After successful email delivery, the invoice becomes Unpaid and the approved customer/company snapshots are locked. A failed email leaves it as Draft.

## Synchronisation rules

- Customer profile changes update Draft quotations and Draft invoices only.
- Sent quotations and issued invoices keep historical snapshots.
- Conversion copies the Accepted quotation snapshot, not mutable browser fields.
- Invoice items and totals initially match the Accepted quotation exactly.
- Any pre-issue invoice adjustment is audited and does not rewrite the accepted quotation.
- Payments and receipts always use the invoice customer ID and current invoice balance.

## Interface changes

- Replace **New Invoice** with **Create Invoice from Accepted Quotation** as the primary workflow.
- Keep standalone invoices behind an explicit Admin-only exception with a required reason, or disable them entirely.
- Replace unrestricted status dropdowns with action buttons that enforce permitted transitions.
- Add source quotation and delivery status columns to the invoice list.
- Add Draft editing, Approve & Send PDF, payment history, and audit history actions.
- Display overdue status automatically; staff should not manually mark invoices Paid or Partially Paid.

## Recommended implementation order

1. Transactional quotation-to-invoice database function and transition constraints.
2. Accepted/Rejected customer-decision action and conversion UI.
3. Draft invoice editor with server-side total validation.
4. Invoice approval, PDF email delivery, and delivery metadata.
5. Payment/receipt linkage and automatic status verification.
6. Reporting: sales, receivables ageing, collections, cancelled documents, and audit export.

## Accounting safeguards

- No deletion of issued financial documents.
- No direct manual Paid or Partially Paid status.
- No duplicate active invoice from one quotation.
- No payment exceeding the invoice balance.
- Every approval, conversion, cancellation, and payment is attributable to a staff account and timestamp.
- Document numbering remains atomic and gaps are retained rather than reusing cancelled numbers.
- Monetary calculations are repeated server-side and enforced by database constraints.
