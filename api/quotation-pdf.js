import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NAVY = '0.063 0.141 0.231';
const BLUE = '0.082 0.357 0.843';
const PALE = '0.933 0.957 0.984';
const GREY = '0.376 0.439 0.537';

function value(input, fallback = 'Not provided') {
  const result = String(input ?? '').trim();
  return result || fallback;
}

function ascii(input) {
  return value(input, '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '-');
}

function pdfText(input) {
  return ascii(input).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function htmlText(input) {
  return value(input, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function money(input) {
  return `RM ${Number(input || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDate(input) {
  const date = new Date(`${input}T00:00:00+08:00`);
  return Number.isNaN(date.valueOf()) ? value(input) : new Intl.DateTimeFormat('en-MY', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }).format(date);
}

function wrap(text, maximum = 74) {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (`${current} ${word}`.trim().length > maximum && current) { lines.push(current); current = word; }
    else current = `${current} ${word}`.trim();
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function commandText(text, x, y, size = 9, bold = false, color = NAVY) {
  return `${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfText(text)}) Tj ET`;
}

function logoImage(pathValue) {
  const relative = String(pathValue || '/assets/ns-smart-fix-logo.png').replace(/^\//, '');
  if (!/^assets\/[a-z0-9._-]+\.png$/i.test(relative)) return null;
  try {
    const png = readFileSync(join(process.cwd(), 'public', relative));
    if (png.readUInt32BE(0) !== 0x89504e47) return null;
    const width = png.readUInt32BE(16); const height = png.readUInt32BE(20);
    const bitDepth = png[24]; const colorType = png[25];
    if (bitDepth !== 8 || colorType !== 2) return null;
    const parts = []; let offset = 8;
    while (offset < png.length) {
      const length = png.readUInt32BE(offset); const type = png.toString('ascii', offset + 4, offset + 8);
      if (type === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    return { width, height, data: Buffer.concat(parts) };
  } catch { return null; }
}

function buildPdfDocument(streams, image) {
  const objects = [null];
  const add = content => { objects.push(content); return objects.length - 1; };
  const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const imageId = image ? add(Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${image.width} >> /Length ${image.data.length} >>\nstream\n`, 'latin1'),
    image.data, Buffer.from('\nendstream', 'latin1')
  ])) : null;
  const pageIds = [];
  const pagesId = add('');
  for (const stream of streams) {
    const compressed = deflateSync(Buffer.from(stream, 'latin1'));
    const streamId = add(Buffer.concat([Buffer.from(`<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'), compressed, Buffer.from('\nendstream', 'latin1')]));
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >>${imageId ? ` /XObject << /Im1 ${imageId} 0 R >>` : ''} >> /Contents ${streamId} 0 R >>`));
  }
  objects[pagesId] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`;
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const buffers = [Buffer.from('%PDF-1.4\n%PDFJS\n', 'latin1')];
  const offsets = [0];
  let offset = buffers[0].length;
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = offset;
    const body = Buffer.isBuffer(objects[id]) ? objects[id] : Buffer.from(objects[id], 'latin1');
    const object = Buffer.concat([Buffer.from(`${id} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
    buffers.push(object); offset += object.length;
  }
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer << /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  buffers.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(buffers);
}

export function buildQuotationPdf({ quotation, items, settings }) {
  const customer = quotation.customer_snapshot || {};
  const streams = [];
  let commands = [];
  let y = 790;
  const addPage = () => { if (commands.length) streams.push(commands.join('\n')); commands = []; y = 790; };
  const text = (content, x, size = 9, bold = false, color = NAVY) => { commands.push(commandText(content, x, y, size, bold, color)); };
  const line = (x1, y1, x2, y2, width = 0.6) => commands.push(`${GREY} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const box = (x, boxY, width, height, color = PALE) => commands.push(`${color} rg ${x} ${boxY} ${width} ${height} re f`);
  const lines = (content, x, widthChars = 74, size = 9, leading = 13, bold = false) => {
    for (const entry of wrap(content, widthChars)) { text(entry, x, size, bold); y -= leading; }
  };

  const logo = logoImage(settings.logo_path);
  if (logo) commands.push('q 82 0 0 62 44 742 cm /Im1 Do Q');
  text(value(settings.company_name, 'NS Smart Fix Solution'), logo ? 138 : 44, 19, true); y -= 21;
  text(value(settings.registration_number, ''), logo ? 138 : 44, 8, false, GREY); y -= 13;
  lines(value(settings.business_address, ''), logo ? 138 : 44, 38, 8, 11); y -= 2;
  text(`${value(settings.phone, '')} | ${value(settings.email, '')}`, logo ? 138 : 44, 8, false, GREY);
  commands.push(commandText('QUOTATION', 400, 790, 23, true, BLUE));
  commands.push(commandText(`No. ${quotation.quotation_number}`, 380, 758, 9, false));
  commands.push(commandText(`Date ${shortDate(quotation.quotation_date)}`, 380, 742, 9, false));
  commands.push(commandText(`Valid ${shortDate(quotation.expiry_date)}`, 380, 726, 9, false));
  const displayStatus = quotation.status === 'sent' || quotation.sent_at ? 'APPROVED' : String(quotation.status || 'draft').replaceAll('_', ' ').toUpperCase();
  commands.push(commandText(`Status ${displayStatus}`, 380, 710, 9, true));
  y = 684; box(44, y, 507, 7, BLUE); y -= 25;
  text('QUOTATION TO', 54, 8, true, GREY); commands.push(commandText('PROJECT / SERVICE', 315, y, 8, true, GREY)); y -= 18;
  text(value(customer.name), 54, 11, true); commands.push(commandText(value(quotation.project_title), 315, y, 11, true)); y -= 17;
  text(value(customer.contact_person || customer.contactPerson, ''), 54); commands.push(commandText(value(quotation.project_location, ''), 315, y)); y -= 15;
  text(value(customer.phone, ''), 54); y -= 15; text(value(customer.email, ''), 54); y -= 28;
  line(44, y + 13, 551, y + 13);
  text('QUOTATION ITEMS', 44, 8, true, GREY); y -= 19;
  box(44, y - 8, 507, 24); text('#', 50, 8, true); commands.push(commandText('DESCRIPTION', 75, y, 8, true)); commands.push(commandText('QTY', 372, y, 8, true)); commands.push(commandText('UNIT PRICE', 415, y, 8, true)); commands.push(commandText('AMOUNT', 500, y, 8, true)); y -= 24;
  for (const [index, item] of items.entries()) {
    if (y < 150) { addPage(); text(`${quotation.quotation_number} - continued`, 44, 10, true); y -= 28; }
    const itemLines = wrap(item.description, 48);
    text(String(index + 1), 50); commands.push(commandText(itemLines[0], 75, y)); commands.push(commandText(String(Number(item.quantity)), 380, y)); commands.push(commandText(money(item.unit_price), 414, y)); commands.push(commandText(money(item.line_total ?? Number(item.quantity) * Number(item.unit_price)), 494, y));
    for (const extra of itemLines.slice(1)) { y -= 12; text(extra, 75); }
    y -= 17; line(44, y + 9, 551, y + 9, 0.3);
  }
  y -= 10;
  const taxAmount = Math.max(0, (Number(quotation.subtotal) - Number(quotation.discount_amount || 0)) * Number(quotation.tax_percent || 0) / 100);
  for (const [label, amount, isTotal] of [['Subtotal',quotation.subtotal,false],['Discount',-Number(quotation.discount_amount||0),false],[`Tax (${Number(quotation.tax_percent||0)}%)`,taxAmount,false],['Other charges',quotation.other_charges,false],['TOTAL QUOTATION',quotation.grand_total,true]]) {
    if (isTotal) box(330, y - 7, 221, 24);
    text(label, 340, isTotal ? 10 : 8.5, isTotal); commands.push(commandText(money(amount), 470, y, isTotal ? 10 : 8.5, isTotal)); y -= isTotal ? 32 : 21;
  }
  if (y < 150) addPage();
  text('TERMS & NOTES', 44, 8, true, GREY); y -= 17;
  lines(quotation.terms_and_conditions || settings.default_terms || 'This quotation is valid until the date stated above.', 44, 88, 8.5, 12);
  if (settings.bank_name || settings.bank_account_number) { y -= 8; text('PAYMENT DETAILS', 44, 8, true, GREY); y -= 16; lines(`${value(settings.bank_name, '')} | ${value(settings.bank_account_name, '')} | ${value(settings.bank_account_number, '')}`, 44, 88, 8.5, 12); }
  commands.push(commandText(`Generated securely by ${value(settings.company_name, 'NS Smart Fix Solution')}.`, 175, 35, 7.5, false, GREY));
  addPage();
  return buildPdfDocument(streams, logo);
}

export function quotationEmail({ quotation, settings }) {
  const company = value(settings.company_name, 'NS Smart Fix Solution');
  const customerName = value(quotation.customer_snapshot?.contact_person || quotation.customer_snapshot?.name, 'Customer');
  const subject = `${quotation.quotation_number} - Quotation from ${company}`;
  const text = `Dear ${customerName},\n\nPlease find attached quotation ${quotation.quotation_number} for ${quotation.project_title}.\n\nTotal: ${money(quotation.grand_total)}\nValid until: ${shortDate(quotation.expiry_date)}\n\nQuestions? Contact ${value(settings.phone, '')} or ${value(settings.email, '')}.\n\nRegards,\n${company}\n${value(settings.website, 'https://nssmartfixsolution.com')}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#10243b;line-height:1.6;max-width:640px"><div style="background:#10243b;padding:24px;color:white"><strong style="color:#f59e0b">${htmlText(company)}</strong><h1 style="margin:8px 0 0">Your quotation is ready</h1></div><div style="padding:24px;border:1px solid #d7e1ed"><p>Dear ${htmlText(customerName)},</p><p>Please find your approved quotation attached.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:10px;background:#eef4fb"><strong>Quotation</strong></td><td style="padding:10px">${htmlText(quotation.quotation_number)}</td></tr><tr><td style="padding:10px;background:#eef4fb"><strong>Project</strong></td><td style="padding:10px">${htmlText(quotation.project_title)}</td></tr><tr><td style="padding:10px;background:#eef4fb"><strong>Total</strong></td><td style="padding:10px">${htmlText(money(quotation.grand_total))}</td></tr><tr><td style="padding:10px;background:#eef4fb"><strong>Valid until</strong></td><td style="padding:10px">${htmlText(shortDate(quotation.expiry_date))}</td></tr></table><p>Questions? Contact us at ${htmlText(value(settings.phone, ''))} or ${htmlText(value(settings.email, ''))}.</p><p>Regards,<br><strong>${htmlText(company)}</strong></p></div></div>`;
  return { subject, text, html };
}
