import { icon } from './admin-icons.js';

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const money = value => `RM ${Number(value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amount = value => Number(value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iso = date => date.toISOString().slice(0, 10);
const displayDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-MY', { day:'2-digit', month:'short', year:'numeric' }) : '—';
function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return iso(date);
}

function itemRow(position = 1) {
  return `<tr class="invoice-item"><td class="item-position">${position}</td><td><input name="description" maxlength="500" placeholder="Service or product description" required></td><td><input name="quantity" type="number" min="0.001" step="0.001" value="1" required></td><td><input name="unitPrice" type="number" min="0" step="0.01" value="0" required></td><td class="line-total">RM 0.00</td><td><button class="icon-button remove-item" type="button" aria-label="Remove invoice item">×</button></td></tr>`;
}

function invoiceForm(settings = {}, customers = []) {
  return `<section class="invoice-workspace">
    <div class="module-toolbar"><div><span class="eyebrow">INVOICE MANAGEMENT</span><h1>Create invoice</h1><p>Create secure cloud invoices based on the supplied NS Smart Fix layout.</p></div><button class="secondary-button" id="show-invoice-list" type="button">Saved invoices</button></div>
    <form id="invoice-form" class="invoice-document" novalidate>
      <div class="invoice-accent"></div><div class="invoice-inner">
        <header class="invoice-heading"><div><img src="/assets/ns-smart-fix-logo-transparent.png" alt="NS Smart Fix Solution"><p>${esc(settings.business_address || '')}</p><p>${esc(settings.phone || '016-211 9969')} · ${esc(settings.email || '')} · nssmartfixsolution.com</p></div><div><h2>INVOICE</h2><span class="status draft">Draft</span></div></header>
        <div class="invoice-grid two"><fieldset><legend>Bill To</legend>
          <label>Customer *<select name="customerId" required><option value="">Select an existing customer</option>${customers.map(customer => `<option value="${esc(customer.id)}">${esc(customer.name)} · ${esc(customer.phone)}</option>`).join('')}</select></label>
          <div id="invoice-customer-summary" class="customer-summary" aria-live="polite"><p>Select a customer to use the verified details from the customer profile.</p></div>
          <p class="field-help">To change these details, update the customer profile first. Draft and unpaid invoices will be synchronized automatically.</p>
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

function invoiceList(invoices, acceptedQuotations = [], sentQuotations = []) {
  const months = [...new Set(invoices.map(invoice => String(invoice.invoice_date || '').slice(0, 7)).filter(value => /^\d{4}-\d{2}$/.test(value)))].sort().reverse();
  const monthLabel = value => new Date(`${value}-01T00:00:00`).toLocaleDateString('en-MY', { month:'long', year:'numeric' });
  const initialMonth = months[0] || 'all';
  const filterTools = `<div class="invoice-list-tools"><label class="invoice-list-search">${icon('search')}<span class="visually-hidden">Search invoices or customers</span><input id="invoice-search" type="search" placeholder="Search invoices or customers" autocomplete="off"></label><label><span class="visually-hidden">Filter invoices by status</span><select id="invoice-status-filter"><option value="all">All statuses</option><option value="draft">Draft</option><option value="unpaid">Unpaid</option><option value="partially_paid">Partially paid</option><option value="overdue">Overdue</option><option value="paid">Paid</option></select></label><label><span class="visually-hidden">Filter invoices by month</span><select id="invoice-month-filter"><option value="all">All months</option>${months.map(value => `<option value="${value}"${value === initialMonth ? ' selected' : ''}>${esc(monthLabel(value))}</option>`).join('')}</select></label><span id="invoice-result-count" class="invoice-result-count" aria-live="polite">${invoices.length} invoice${invoices.length === 1 ? '' : 's'}</span></div>`;
  return `<section class="invoice-workspace"><nav class="page-breadcrumb" aria-label="Breadcrumb"><span>Finance</span><b aria-hidden="true">/</b><span aria-current="page">Invoices</span></nav><div class="module-toolbar invoice-page-heading"><div><h1>Invoices</h1><p>Manage invoices and track payments.</p></div><button class="invoice-new-button" id="new-invoice" type="button">${icon('plus')}<span>New invoice</span></button></div>
    <div class="invoice-workflow-grid">${sentQuotations.length ? `<section class="content-card ready-to-invoice awaiting-decision"><div class="workflow-heading"><span class="workflow-icon">◷</span><div><h2>Awaiting Customer Decision</h2><p>Sent quotations waiting for customer confirmation.</p></div><b>${sentQuotations.length}</b></div>${sentQuotations.map(quotation => `<div class="conversion-row"><div><strong>${esc(quotation.quotation_number)}</strong><span>${esc(quotation.customer_snapshot?.name || '—')} · ${esc(quotation.project_title)}</span></div><strong>${money(quotation.grand_total)}</strong><div class="decision-actions"><button class="primary-button compact quotation-decision" type="button" data-id="${esc(quotation.id)}" data-status="accepted">Mark Accepted</button><button class="secondary-button compact quotation-decision" type="button" data-id="${esc(quotation.id)}" data-status="rejected">Mark Rejected</button></div></div>`).join('')}</section>` : ''}
    ${acceptedQuotations.length ? `<section class="content-card ready-to-invoice accepted-ready"><span class="visually-hidden">READY TO INVOICE</span><div class="workflow-heading"><span class="workflow-icon">▤</span><div><h2>Ready to Invoice</h2><p>Accepted quotations ready to be converted.</p></div><b>${acceptedQuotations.length}</b></div>${acceptedQuotations.map(quotation => `<div class="conversion-row"><div><strong>${esc(quotation.quotation_number)}</strong><span>${esc(quotation.customer_snapshot?.name || '—')} · ${esc(quotation.project_title)}</span></div><strong>${money(quotation.grand_total)}</strong><button class="primary-button compact convert-accepted" type="button" data-id="${esc(quotation.id)}">Create Invoice</button></div>`).join('')}</section>` : ''}</div>
    <div class="content-card invoice-list">${invoices.length ? `${filterTools}<div class="invoice-table-wrap"><table class="invoice-table"><thead><tr><th>Invoice no.</th><th>Customer</th><th>Date</th><th>Status</th><th class="numeric-heading">Amount (RM)</th><th class="numeric-heading">Paid (RM)</th><th class="numeric-heading balance-heading">Balance (RM)</th><th>Actions</th></tr></thead><tbody>${invoices.map(invoice => {
      const pdfUrl = `/api/admin-auth?action=invoice-pdf&id=${encodeURIComponent(invoice.id)}`;
      const canPay = ['unpaid','partially_paid','overdue'].includes(invoice.status) && Number(invoice.balance) > 0;
      const invoiceMonth = String(invoice.invoice_date || '').slice(0, 7);
      return `<tr data-invoice-row data-status="${esc(invoice.status)}" data-month="${esc(invoiceMonth)}" data-outstanding="${Number(invoice.balance)>0&&invoice.status!=='draft'}" data-search="${esc(`${invoice.invoice_number} ${invoice.customer_snapshot?.name||''}`.toLowerCase())}"><td><button class="record-link invoice-detail" type="button" data-id="${esc(invoice.id)}"><strong>${esc(invoice.invoice_number)}</strong></button></td><td>${esc(invoice.customer_snapshot?.name || '—')}</td><td>${displayDate(invoice.invoice_date)}</td><td><span class="status ${esc(invoice.status)}">${invoice.status==='paid'?icon('check'):''}${esc(invoice.status.replaceAll('_', ' '))}</span></td><td class="invoice-money">${amount(invoice.grand_total)}</td><td class="invoice-money invoice-paid">${amount(invoice.amount_paid)}</td><td class="invoice-money invoice-balance-cell"><strong>${amount(invoice.balance)}</strong></td><td><div class="table-actions"><button class="secondary-button compact invoice-detail preview-action" type="button" data-id="${esc(invoice.id)}" title="Preview invoice details">${icon('eye')}<span>Preview</span></button>${invoice.status==='draft'?`<button class="primary-button compact issue-invoice" type="button" data-id="${esc(invoice.id)}">Issue Invoice</button>`:''}${canPay?`<button class="primary-button compact record-payment" type="button" data-id="${esc(invoice.id)}">Record Payment</button>`:''}<details class="row-menu"><summary aria-label="More actions for ${esc(invoice.invoice_number)}" title="More invoice actions">${icon('more')}</summary><div class="row-menu-popover" role="group" aria-label="Actions for ${esc(invoice.invoice_number)}"><button class="manage-serials" type="button" data-id="${esc(invoice.id)}">${icon('serial')}<span>View Serial Numbers</span></button><a href="${pdfUrl}" target="_blank" rel="noopener">${icon('pdf')}<span>View PDF</span></a><a href="${pdfUrl}&amp;download=1">${icon('download')}<span>Download PDF</span></a></div></details></div></td></tr>`;
    }).join('')}</tbody></table></div><footer class="invoice-list-footer"><div><strong id="invoice-range">Showing 1–${Math.min(10, invoices.length)} of ${invoices.length} invoices</strong><span>All amounts in MYR</span></div><nav class="invoice-pagination" aria-label="Invoice pagination"><button id="invoice-previous" type="button" disabled>${icon('chevronLeft')}<span>Previous</span></button><span id="invoice-current-page" aria-current="page">1</span><button id="invoice-next" type="button"${invoices.length <= 10 ? ' disabled' : ''}><span>Next</span>${icon('chevronRight')}</button></nav></footer><p id="document-message" class="inline-message" role="status"></p>` : '<div class="empty-module"><h2>No invoices yet</h2><p>Create an invoice from an accepted quotation to begin your invoice history.</p></div>'}</div></section>`;
}

function paymentDialog(invoice, cashAccounts = []) {
  return `<dialog id="payment-dialog" class="admin-dialog"><form method="dialog"><button class="dialog-close" aria-label="Close">×</button></form><span class="eyebrow">CONTROLLED PAYMENT ENTRY</span><h2>Record payment</h2><p class="muted">${esc(invoice.invoice_number)} · Outstanding ${money(invoice.balance)}</p><form id="invoice-payment-form" class="admin-form"><input name="invoiceId" type="hidden" value="${esc(invoice.id)}"><div class="form-grid"><label>Received into *<select name="cashAccountId" required><option value="">Select bank or cash account</option>${cashAccounts.map(account=>`<option value="${esc(account.id)}">${esc(account.name)}${account.account_last_four?` · •••• ${esc(account.account_last_four)}`:''}</option>`).join('')}</select></label><label>Payment date *<input name="paymentDate" type="date" value="${iso(new Date())}" required></label><label>Amount received (RM) *<input name="amount" type="number" min="0.01" max="${esc(invoice.balance)}" step="0.01" value="${esc(invoice.balance)}" required></label><label>Payment method *<select name="paymentMethod" required><option value="bank_transfer">Bank transfer</option><option value="duitnow">DuitNow</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label><label>Transaction reference<input name="reference" maxlength="120"></label></div><label>Payment proof *<input name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required><span class="field-help">JPG, PNG, WebP or PDF. Maximum 5 MB. Stored privately for authorized staff.</span></label><label>Notes<textarea name="notes" maxlength="1000"></textarea></label><div id="payment-message" class="form-error" role="alert" hidden></div><button class="primary-button" type="submit"${cashAccounts.length?'':' disabled'}>Verify proof &amp; record payment</button>${cashAccounts.length?'':'<p class="form-error">Create an active cash account in Business Finance before recording a payment.</p>'}</form></dialog>`;
}

function serialDialog(detail) {
  const editable = ['draft','unpaid','partially_paid','overdue'].includes(detail.invoice.status);
  return `<dialog id="serial-dialog" class="admin-dialog wide"><form method="dialog"><button class="dialog-close" aria-label="Close">×</button></form><span class="eyebrow">ASSET IDENTIFICATION</span><h2>Manage serial numbers</h2><p class="muted">${esc(detail.invoice.invoice_number)} · Add one serial number per line beneath its invoice item.</p><form id="serial-form" class="admin-form">${detail.items.map(item=>`<fieldset class="serial-item"><legend>${esc(item.description)}</legend><p class="field-help">Quantity: ${esc(item.quantity)} · Maximum ${Math.floor(Number(item.quantity))} serial number(s)</p><textarea data-item-id="${esc(item.id)}" data-maximum="${Math.floor(Number(item.quantity))}" rows="${Math.min(8,Math.max(3,Math.floor(Number(item.quantity))))}" placeholder="One serial number per line"${editable?'':' disabled'}>${esc((item.serial_numbers||[]).join('\n'))}</textarea></fieldset>`).join('')}<div id="serial-message" class="form-error" role="alert" hidden></div>${editable?'<button class="primary-button" type="submit">Save serial numbers</button>':'<p class="inline-message">Serial numbers are locked because this invoice is final.</p>'}</form></dialog>`;
}

function invoiceDetail(detail) {
  const { invoice, items, payments } = detail; const c=invoice.customer_snapshot||{};
  const statusLabel=invoice.status.replaceAll('_',' ');
  const balanceTone=Number(invoice.balance)>0?'balance-due':'balance-settled';
  return `<header class="invoice-detail-heading"><div><span class="eyebrow">INVOICE RECORD</span><h2 id="invoice-detail-title">${esc(invoice.invoice_number)}</h2><p>${esc(invoice.project_title||invoice.description||'Invoice details')}</p></div><span class="status ${esc(invoice.status)}">${invoice.status==='paid'?icon('check'):''}${esc(statusLabel)}</span></header><div class="invoice-detail-grid"><section class="invoice-detail-card"><h3><span class="section-icon">${icon('customer')}</span>Customer Details</h3><dl><dt>Name</dt><dd>${esc(c.name||'—')}</dd><dt>Contact person</dt><dd>${esc(c.contact_person||'—')}</dd><dt>Email address</dt><dd class="breakable">${esc(c.email||'—')}</dd><dt>Phone number</dt><dd>${esc(c.phone||'—')}</dd><dt>Full address</dt><dd class="breakable">${esc(c.billing_address||c.service_address||'—')}</dd></dl></section><section class="invoice-detail-card invoice-summary-card"><h3><span class="section-icon">${icon('invoice')}</span>Invoice Summary</h3><dl><dt>Invoice date</dt><dd>${displayDate(invoice.invoice_date)}</dd><dt>Due date</dt><dd>${displayDate(invoice.due_date)}</dd><dt>Total amount</dt><dd>${money(invoice.grand_total)}</dd><dt>Paid amount</dt><dd>${money(invoice.amount_paid)}</dd><dt class="balance-label">Balance due</dt><dd class="invoice-balance ${balanceTone}"><strong>${money(invoice.balance)}</strong><span>${Number(invoice.balance)>0?'Payment remaining':'Fully settled'}</span></dd></dl></section></div><section class="invoice-detail-section"><h3>Items</h3><div class="table-wrap"><table class="data-table detail-table"><thead><tr><th>Description</th><th>Serial numbers</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${items.map(i=>`<tr><td class="item-description">${esc(i.description)}</td><td>${(i.serial_numbers||[]).length?`<ul class="serial-list">${i.serial_numbers.map(serial=>`<li>${esc(serial)}</li>`).join('')}</ul>`:'—'}</td><td class="numeric-cell">${esc(i.quantity)}</td><td class="numeric-cell">${money(i.unit_price)}</td><td class="numeric-cell">${money(i.line_total)}</td></tr>`).join('')}</tbody></table></div></section><section class="invoice-detail-section"><h3>Payment History</h3>${payments.length?`<div class="payment-history">${payments.map(p=>{const paymentStatus=p.status||'completed';return `<article><span class="payment-success">${icon('check')}<span class="visually-hidden">Payment ${esc(paymentStatus)}</span></span><div><strong>${money(p.amount)}</strong><span>Paid on ${displayDate(p.payment_date)} · ${esc(p.payment_method.replaceAll('_',' '))}</span><small class="payment-state">${esc(paymentStatus)}</small></div><a class="secondary-button compact proof-action" href="/api/admin-auth?action=payment-proof&amp;id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener" title="View payment proof">${icon('eye')}<span>View Proof</span></a></article>`;}).join('')}</div>`:'<p class="muted empty-payment">No payment has been recorded for this invoice.</p>'}</section>`;
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
  content.setAttribute('aria-busy','true');
  content.innerHTML = `<section class="empty-state module-loading" role="status"><span class="empty-icon spinning">${icon('loader')}</span><h1>Loading invoices</h1><p>Retrieving the latest secure invoice records.</p></section>`;
  try {
    const data = await api('invoices');
    const showList = () => {
      content.innerHTML = invoiceList(data.invoices || [], data.acceptedQuotations || [], data.sentQuotations || []);
      let invoicePage = 1;
      const invoicePageSize = 10;
      const invoiceRows = [...document.querySelectorAll('[data-invoice-row]')];
      const applyInvoiceFilters = () => {
        const query = (document.getElementById('invoice-search')?.value || '').trim().toLowerCase();
        const status = document.getElementById('invoice-status-filter')?.value || 'all';
        const month = document.getElementById('invoice-month-filter')?.value || 'all';
        const matches = invoiceRows.filter(row => (status === 'all' || row.dataset.status === status) && (month === 'all' || row.dataset.month === month) && row.dataset.search.includes(query));
        const pages = Math.max(1, Math.ceil(matches.length / invoicePageSize));
        invoicePage = Math.min(invoicePage, pages);
        const start = (invoicePage - 1) * invoicePageSize;
        const visible = new Set(matches.slice(start, start + invoicePageSize));
        invoiceRows.forEach(row => { row.hidden = !visible.has(row); });
        const count = document.getElementById('invoice-result-count');
        const range = document.getElementById('invoice-range');
        const current = document.getElementById('invoice-current-page');
        const previous = document.getElementById('invoice-previous');
        const next = document.getElementById('invoice-next');
        if (count) count.textContent = `${matches.length} invoice${matches.length === 1 ? '' : 's'}`;
        if (range) range.textContent = matches.length ? `Showing ${start + 1}–${Math.min(start + invoicePageSize, matches.length)} of ${matches.length} invoices` : 'Showing 0 invoices';
        if (current) current.textContent = String(invoicePage);
        if (previous) previous.disabled = invoicePage <= 1;
        if (next) next.disabled = invoicePage >= pages;
      };
      document.getElementById('invoice-search')?.addEventListener('input', () => { invoicePage = 1; applyInvoiceFilters(); });
      document.getElementById('invoice-status-filter')?.addEventListener('change', () => { invoicePage = 1; applyInvoiceFilters(); });
      document.getElementById('invoice-month-filter')?.addEventListener('change', () => { invoicePage = 1; applyInvoiceFilters(); });
      document.getElementById('invoice-previous')?.addEventListener('click', () => { invoicePage = Math.max(1, invoicePage - 1); applyInvoiceFilters(); });
      document.getElementById('invoice-next')?.addEventListener('click', () => { invoicePage += 1; applyInvoiceFilters(); });
      document.getElementById('new-invoice')?.addEventListener('click', () => {
        const nextStep = document.querySelector('.accepted-ready, .awaiting-decision');
        if (nextStep) {
          nextStep.scrollIntoView({ behavior:'smooth', block:'center' });
          nextStep.querySelector('button')?.focus({ preventScroll:true });
          return;
        }
        document.querySelector('[data-module="quotations"]')?.click();
      });
      applyInvoiceFilters();
      const closeMenus = except => document.querySelectorAll('.row-menu[open]').forEach(menu=>{if(menu!==except)menu.removeAttribute('open');});
      document.querySelectorAll('.row-menu').forEach(menu=>menu.addEventListener('toggle',()=>{if(menu.open)closeMenus(menu);}));
      content.onclick=event=>{if(!event.target.closest('.row-menu'))closeMenus();};
      content.onkeydown=event=>{if(event.key==='Escape'){const open=document.querySelector('.row-menu[open]');if(open){event.preventDefault();open.removeAttribute('open');open.querySelector('summary')?.focus();}}};
      const showMessage = message => { const out=document.getElementById('document-message'); if(out) out.textContent=message; };
      document.querySelectorAll('.issue-invoice').forEach(button=>button.addEventListener('click',async()=>{if(!window.confirm('Issue this invoice and make it available for payment?'))return;button.disabled=true;try{await api('document-status',{method:'POST',body:JSON.stringify({id:button.dataset.id,kind:'invoice',status:'unpaid'})});await renderInvoices(api);}catch(error){button.disabled=false;showMessage(error.message);}}));
      document.querySelectorAll('.invoice-detail').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{const detail=await api(`invoice-detail&id=${encodeURIComponent(button.dataset.id)}`);document.body.insertAdjacentHTML('beforeend',`<dialog id="invoice-detail-dialog" class="admin-dialog wide invoice-detail-dialog" aria-labelledby="invoice-detail-title"><form method="dialog"><button class="dialog-close" aria-label="Close invoice preview" title="Close">${icon('close')}</button></form>${invoiceDetail(detail)}</dialog>`);const dialog=document.getElementById('invoice-detail-dialog');dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();}catch(error){showMessage(error.message);}finally{button.disabled=false;}}));
      document.querySelectorAll('.manage-serials').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{const detail=await api(`invoice-detail&id=${encodeURIComponent(button.dataset.id)}`);document.body.insertAdjacentHTML('beforeend',serialDialog(detail));const dialog=document.getElementById('serial-dialog');dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();const form=document.getElementById('serial-form');form.addEventListener('submit',async event=>{event.preventDefault();const message=document.getElementById('serial-message');const items=[...form.querySelectorAll('[data-item-id]')].map(field=>({id:field.dataset.itemId,serialNumbers:field.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean),maximum:Number(field.dataset.maximum)}));const allSerials=items.flatMap(item=>item.serialNumbers);const duplicate=allSerials.find((serial,index)=>allSerials.findIndex(value=>value.toLowerCase()===serial.toLowerCase())!==index);const excessive=items.find(item=>item.serialNumbers.length>item.maximum);if(duplicate||excessive){message.textContent=duplicate?`Serial number ${duplicate} is entered more than once.`:`An item has more serial numbers than its quantity (${excessive.maximum}).`;message.hidden=false;return;}const submit=form.querySelector('[type=submit]');submit.disabled=true;try{await api('invoice-serials-update',{method:'POST',body:JSON.stringify({invoiceId:detail.invoice.id,items:items.map(({id,serialNumbers})=>({id,serialNumbers}))})});dialog.close();showMessage('Serial numbers saved and added to the invoice PDF.');}catch(error){message.textContent=error.message;message.hidden=false;submit.disabled=false;}});}catch(error){showMessage(error.message);}finally{button.disabled=false;}}));
      document.querySelectorAll('.record-payment').forEach(button=>button.addEventListener('click',()=>{const invoice=(data.invoices||[]).find(i=>i.id===button.dataset.id);document.body.insertAdjacentHTML('beforeend',paymentDialog(invoice,data.cashAccounts||[]));const dialog=document.getElementById('payment-dialog');dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();const form=document.getElementById('invoice-payment-form');form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;const submit=form.querySelector('[type=submit]');const message=document.getElementById('payment-message');const fields=new FormData(form);const proof=fields.get('proof');submit.disabled=true;submit.textContent='Uploading proof…';message.hidden=true;try{if(!(proof instanceof File)||!proof.size)throw new Error('Payment proof is required.');const signed=await api('payment-proof-upload-url',{method:'POST',body:JSON.stringify({invoiceId:invoice.id,fileName:proof.name,mimeType:proof.type,size:proof.size})});const upload=await fetch(signed.uploadUrl,{method:'PUT',headers:{'Content-Type':proof.type,apikey:signed.uploadKey},body:proof});if(!upload.ok){const problem=await upload.json().catch(()=>null);throw new Error(problem?.message||problem?.error||'Payment proof upload failed. Please try again.');}submit.textContent='Recording payment…';await api('payment-create',{method:'POST',body:JSON.stringify({invoiceId:invoice.id,cashAccountId:fields.get('cashAccountId'),paymentDate:fields.get('paymentDate'),amount:fields.get('amount'),paymentMethod:fields.get('paymentMethod'),reference:fields.get('reference'),notes:fields.get('notes'),proofPath:signed.path})});dialog.close();await renderInvoices(api);}catch(error){message.textContent=error.message;message.hidden=false;submit.disabled=false;submit.textContent='Verify proof & record payment';}});}));
      document.querySelectorAll('.quotation-decision').forEach(button => button.addEventListener('click', async () => {
        const accepted = button.dataset.status === 'accepted';
        if (!window.confirm(`Confirm that the customer ${accepted ? 'accepted' : 'rejected'} this quotation?`)) return;
        button.disabled = true;
        try { await api('document-status', { method:'POST', body:JSON.stringify({ id:button.dataset.id, kind:'quotation', status:button.dataset.status }) }); await renderInvoices(api); }
        catch (error) { button.disabled = false; const out=document.getElementById('document-message'); if(out)out.textContent=error.message; }
      }));
      document.querySelectorAll('.convert-accepted').forEach(button => button.addEventListener('click', async () => {
        if (!window.confirm('Create one draft invoice from this accepted quotation? Customer, items and agreed totals will be copied.')) return;
        button.disabled = true; button.textContent = 'Creating…';
        try { await api('quotation-convert', { method:'POST', body:JSON.stringify({ id:button.dataset.id, confirmed:true }) }); await renderInvoices(api); }
        catch (error) { button.disabled = false; button.textContent = 'Create Invoice'; const out=document.getElementById('document-message'); if(out)out.textContent=error.message; }
      }));
    };
    const showForm = () => {
      content.innerHTML = invoiceForm(data.settings || {}, data.customers || []);
      const form = document.getElementById('invoice-form');
      const customerSummary = document.getElementById('invoice-customer-summary');
      const showCustomer = () => {
        const customer = (data.customers || []).find(item => item.id === form.elements.customerId.value);
        customerSummary.innerHTML = customer ? `<strong>${esc(customer.name)}</strong><span>${esc(customer.contact_person || 'No contact person')}</span><span>${esc(customer.phone)}</span><span>${esc(customer.email || 'No email address')}</span><span>${esc(customer.billing_address || customer.service_address || 'No address provided')}</span>` : '<p>Select a customer to use the verified details from the customer profile.</p>';
      };
      form.elements.customerId.addEventListener('change', showCustomer);
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
    content.setAttribute('aria-busy','false');
    content.innerHTML = `<section class="empty-state module-error" role="alert"><span class="empty-icon">${icon('warning')}</span><h1>Invoices unavailable</h1><p>${esc(error.message)}</p><button class="secondary-button" type="button" onclick="window.location.reload()">Try again</button></section>`;
  }
}
