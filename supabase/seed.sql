insert into public.company_settings (
  id, company_name, email, website, default_quotation_validity_days,
  default_invoice_payment_days, quotation_prefix, invoice_prefix, receipt_prefix,
  tax_enabled, default_tax_percent
) values (
  true, 'NS Smart Fix Solution', 'admin@nssmartfixsolution.com',
  'https://nssmartfixsolution.com', 14, 30, 'NSS-QT', 'NSS-INV', 'NSS-RCP', false, 0
) on conflict (id) do nothing;

