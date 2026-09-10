const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const money = value => `RM ${Number(value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iso = date => date.toISOString().slice(0, 10);

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return iso(date);
}

function itemRow(position = 1) {
  return `<tr class="invoice-item"><td class="item-position">${position}</td><td><input name="description" maxlength="500" placeholder="Service or product description" required></td><td><input name="quantity" type="number" min="0.001" step="0.001" value="1" required></td><td><input name="unitPrice" type="number" min="0" step="0.01" value="0" required></td><td class="line-total">RM 0.00</td><td><button class="icon-button remove-item" type="button" aria-label="Remove invoice item">×</button></td></tr>`;
}

function invoiceForm(settings = {}) {
  return `<section class="invoice-workspace">
    <div class="module-toolbar"><div><span class="eyebrow">INVOICE MANAGEMENT</span><h1>Create invoice</h1><p>Create secure cloud invoices based on the supplied NS Smart Fix layout.</p></div><button class="secondary-button" id="show-invoice-list" type="button">Saved invoices</button></div>
    <form id="invoice-form" class="invoice-document" novalidate>
      <div class="invoice-accent"></div><div class="invoice-inner">
        <header class="invoice-heading"><div><img src="/assets/ns-smart-fix-logo-transparent.png" alt="NS Smart Fix Solution"><p>${esc(settings.business_address || '')}</p><p>${esc(settings.phone || '016-211 9969')} · ${esc(settings.email || '')} · nssmartfixsolution.com</p></div><div><h2>INVOICE</h2><span class="status draft">Draft</span></div></header>
        <div class="invoice-grid two"><fieldset><legend>Bill To</legend>
          <label>Customer or company name *<input name="customerName" maxlength="160" required></label>
          <div class="invoice-grid two"><label>Contact person<input name="contactPerson" maxlength="120"></label><label>Phone *<input name="customerPhone" maxlength="30" required></label></div>
          <label>Email address<input name="customerEmail" type="email" maxlength="254"></label><label>Billing / service address<textarea name="customerAddress" maxlength="1000"></textarea></label>
        </fieldset><fieldset><legend>Invoice Details</legend>
          <div class="invoice-grid two"><label>Invoice date *<input name="invoiceDate" type="date" value="${iso(new Date())}" required></label><label>Due date *<input name="dueDate" type="date" value="${addDays(settings.default_invoice_payment_days || 30)}" required></label></div>
          <label>Project / service *<input name="projectTitle" maxlength="200" required></label><label>PO / reference<input name="poReference" maxlength="120"></label><label>Job description<textarea name="description" maxlength="2000"></textarea></label>
        </fieldset></div>
        <fieldset><legend>Invoice Items</legend><div class="invoice-table-wrap"><table class="invoice-table"><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price (RM)</th><th>Amount</th><th></th></tr></thead><tbody id="invoice-items">${itemRow()}</tbody></table></div><button class="secondary-button" id="add-invoice-item" type="button">+ Add item</button></fieldset>
        <div class="invoice-grid totals-layout"><fieldset><legend>Notes / Terms</legend><label>Notes<textarea name="notes" maxlength="2000">Thank you for your business.</textarea></label><label>Payment terms<textarea name="paymentTerms" maxlength="2000">Payment is due according to the terms stated above.</textarea></label></fieldset>
          <aside class="invoice-totals"><label>Discount amount (RM)<input name="discountAmount" type="number" min="0" step="0.01" value="0"></label><label>SST / Tax (%)<input name="taxPercent" type="number" min="0" max="100" step="0.01" value="${Number(settings.default_tax_percent || 0)}"></label><label>Other charges (RM)<input name="otherCharges" type="number" min="0" step="0.01" value="0"></label><div><span>Subtotal</span><strong id="invoice-subtotal">RM 0.00</strong></div><div class="grand"><span>Total</span><strong id="invoice-total">RM 0.00</strong></div></aside>
        </div><div id="invoice-message" class="form-error" role="alert" hidden></div><div class="invoice-actions"><button class="secondary-button" id="print-invoice" type="button">Print preview</button><button class="primary-button" type="submit">Save invoice</button></div>
      </div></form></section>`;
}

function invoiceList(invoices) {
  return `<section class="invoice-workspace"><div class="module-toolbar"><div><span class="eyebrow">INVOICE MANAGEMENT</span><h1>Saved invoices</h1><p>${invoices.length} invoice${invoices.length === 1 ? '' : 's'} stored securely.</p></div><button class="primary-button compact" id="new-invoice" type="button">+ New invoice</button></div>
    <div class="content-card invoice-list">${invoices.length ? `<div class="invoice-table-wrap"><table class="invoice-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Status</th><th>Total</th><th>Balance</th><th>Actions</th></tr></thead><tbody>${invoices.map(invoice => {
      const pdfUrl = `/api/admin-auth?action=invoice-pdf&id=${encodeURIComponent(invoice.id)}`;
      return `<tr><td><strong>${esc(invoice.invoice_number)}</strong></td><td>${esc(invoice.customer_snapshot?.name || '—')}</td><td>${esc(invoice.invoice_date)}</td><td><select class="document-status status-select" data-kind="invoice" data-id="${esc(invoice.id)}" aria-label="Status for ${esc(invoice.invoice_number)}">${['draft','unpaid','partially_paid','paid','overdue','cancelled'].map(state => `<option value="${state}"${invoice.status === state ? ' selected' : ''}>${state.replaceAll('_',' ')}</option>`).join('')}</select></td><td>${money(invoice.grand_total)}</td><td>${money(invoice.balance)}</td><td><div class="table-actions"><a class="action-link" href="${pdfUrl}" target="_blank" rel="noopener" aria-label="View invoice ${esc(invoice.invoice_number)} as PDF">View PDF</a><a class="action-link" href="${pdfUrl}&amp;download=1" aria-label="Download invoice ${esc(invoice.invoice_number)} as PDF">Download PDF</a></div></td></tr>`;
    }).join('')}</tbody></table></div><p id="document-message" class="inline-message" role="status"></p>` : '<div class="empty-module"><h2>No invoices yet</h2><p>Create the first invoice to begin your cloud invoice history.</p></div>'}</div></section>`;
}

function calculate(form) {
  let subtotal = 0;
  form.querySelectorAll('.invoice-item').forEach((row, index) => {
    row.querySelector('.item-position').textContent = index + 1;
    const amount = Number(row.querySelector('[name=quantity]').value || 0) * Number(row.querySelector('[name=unitPrice]').value || 0);
    subtotal += amount;
    row.querySelector('.line-total').textContent = money(amount);
  });
  const discount = Math.min(subtotal, Number(form.elements.discountAmount.value || 0));
  const tax = Number(form.elements.taxPercent.value || 0);
  const other = Number(form.elements.otherCharges.value || 0);
  const total = (subtotal - discount) * (1 + tax / 100) + other;
  document.getElementById('invoice-subtotal').textContent = money(subtotal);
  document.getElementById('invoice-total').textContent = money(total);
}

export async function renderInvoices(api) {
  const content = document.getElementById('portal-content');
  content.innerHTML = '<section class="empty-state"><p>Loading invoices…</p></section>';
  try {
    const data = await api('invoices');
    const showList = () => {
      content.innerHTML = invoiceList(data.invoices || []);
      document.getElementById('new-invoice').addEventListener('click', showForm);
      wireDocumentStatuses(api);
    };
    const showForm = () => {
      content.innerHTML = invoiceForm(data.settings || {});
      const form = document.getElementById('invoice-form');
      document.getElementById('show-invoice-list').addEventListener('click', showList);
      document.getElementById('add-invoice-item').addEventListener('click', () => {
        document.getElementById('invoice-items').insertAdjacentHTML('beforeend', itemRow(document.querySelectorAll('.invoice-item').length + 1));
        calculate(form);
      });
      form.addEventListener('input', () => calculate(form));
      form.addEventListener('click', event => {
        if (!event.target.classList.contains('remove-item')) return;
        if (document.querySelectorAll('.invoice-item').length === 1) return;
        event.target.closest('tr').remove(); calculate(form);
      });
      document.getElementById('print-invoice').addEventListener('click', () => window.print());
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const submit = form.querySelector('[type=submit]');
        const message = document.getElementById('invoice-message');
        submit.disabled = true; submit.textContent = 'Saving…'; message.hidden = true;
        const fields = new FormData(form);
        const payload = Object.fromEntries(fields.entries());
        payload.items = [...form.querySelectorAll('.invoice-item')].map(row => ({ description: row.querySelector('[name=description]').value, quantity: row.querySelector('[name=quantity]').value, unitPrice: row.querySelector('[name=unitPrice]').value }));
        try {
          const result = await api('invoice-create', { method: 'POST', body: JSON.stringify(payload) });
          message.classList.add('success-message'); message.textContent = `Invoice ${result.invoice.invoice_number} saved successfully.`; message.hidden = false;
          data.invoices.unshift(result.invoice); submit.textContent = 'Saved';
        } catch (error) {
          message.classList.remove('success-message'); message.textContent = error.message; message.hidden = false; submit.disabled = false; submit.textContent = 'Save invoice';
        }
      });
      calculate(form);
    };
    showList();
  } catch (error) {
    content.innerHTML = `<section class="empty-state"><h1>Invoices unavailable</h1><p>${esc(error.message)}</p></section>`;
  }
}
import { wireDocumentStatuses } from './admin-modules.js';
