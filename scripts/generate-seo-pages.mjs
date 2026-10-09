import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();
const dist = join(root,'dist');
const baseHtml = readFileSync(join(dist,'index.html'),'utf8');
const origin = 'https://nssmartfixsolution.com';
const socialImage = `${origin}/assets/social-preview.jpg`;

const pages = [
  {path:'/',title:'NS Smart Fix Solution | Electrical, Networking & IT Services',h1:'Electrical, Networking & IT Services in Kuala Lumpur',description:'Electrical wiring, networking, server infrastructure, IT product supply and installation services in Kuala Lumpur and across Peninsular Malaysia.'},
  {path:'/about',title:'About Us | NS Smart Fix Solution',h1:'About NS Smart Fix Solution',description:'Meet NS Smart Fix Solution, an electrical, networking and IT infrastructure service provider based in Bangsar, Kuala Lumpur.'},
  {path:'/services',title:'Services | NS Smart Fix Solution',h1:'Electrical, Networking & IT Services',description:'Electrical, network cabling, server, IT supply, TV mounting and troubleshooting services across Peninsular Malaysia.'},
  {path:'/products',title:'IT & Security Products | NS Smart Fix Solution',h1:'IT, Networking & Security Products',description:'IT, networking, security and infrastructure products from trusted brands for homes and businesses in Malaysia.'},
  {path:'/quotation',title:'Request a Quotation | NS Smart Fix Solution',h1:'Request a Service Quotation',description:'Request a quotation for electrical, networking, server or installation services from NS Smart Fix Solution.'},
  {path:'/contact',title:'Contact Us | NS Smart Fix Solution',h1:'Contact NS Smart Fix Solution',description:'Contact NS Smart Fix Solution in Bangsar, Kuala Lumpur by phone or WhatsApp for enquiries and quotations.'},
  {path:'/faq',title:'Frequently Asked Questions | NS Smart Fix Solution',h1:'Frequently Asked Questions',description:'Answers about coverage, quotations, installation, delivery and NS Smart Fix Solution services.'},
  {path:'/privacy',title:'Privacy Notice | NS Smart Fix Solution',h1:'Privacy Notice',description:'NS Smart Fix Solution privacy notice and how customer information is handled.'},
  {path:'/terms',title:'Terms and Conditions | NS Smart Fix Solution',h1:'Terms and Conditions',description:'Terms and conditions for NS Smart Fix Solution products and services.'},
  {path:'/warranty',title:'Warranty and Service Policy | NS Smart Fix Solution',h1:'Warranty and Service Policy',description:'Product warranty, workmanship and after-service support information from NS Smart Fix Solution.'}
];

const servicePages = [
  {path:'/electrical-wiring-kuala-lumpur',title:'Electrical Wiring Kuala Lumpur | NS Smart Fix Solution',h1:'Electrical Wiring Services in Kuala Lumpur',description:'Professional electrical wiring, sockets, lighting, distribution boards and fault diagnosis for homes and businesses in Kuala Lumpur.',bullets:['New wiring and rewiring','Sockets, switches, lighting and fans','Distribution boards and MCB upgrades','Electrical troubleshooting and repairs']},
  {path:'/network-cabling-kuala-lumpur',title:'Network Cabling Kuala Lumpur | NS Smart Fix Solution',h1:'Network Cabling Services in Kuala Lumpur',description:'Structured network cabling, CAT6 installation, rack organisation and Wi-Fi access point setup for offices and homes in Kuala Lumpur.',bullets:['CAT6 and structured cabling','Network racks and patch panels','Cable testing and labelling','Wi-Fi access point installation']},
  {path:'/server-installation-malaysia',title:'Server Installation Malaysia | NS Smart Fix Solution',h1:'Server & IT Infrastructure Installation in Malaysia',description:'Server, rack, UPS, firewall and network infrastructure installation for Malaysian businesses, with planning and professional configuration.',bullets:['Server and rack installation','UPS and backup power setup','Firewall and switch configuration','Documentation and handover']},
  {path:'/it-infrastructure-design-malaysia',title:'IT Infrastructure Design Malaysia | NS Smart Fix Solution',h1:'IT Infrastructure Design in Malaysia',description:'Practical IT infrastructure planning for offices and businesses, covering networks, racks, power, security and future expansion.',bullets:['Network and rack planning','Power and UPS requirements','Secure access and network separation','Scalable infrastructure design']},
  {path:'/it-product-supply-malaysia',title:'IT Product Supply Malaysia | NS Smart Fix Solution',h1:'Business IT Product Supply in Malaysia',description:'Supply of laptops, desktops, monitors, networking equipment, servers, UPS systems and accessories from trusted technology brands.',bullets:['Business laptops and desktops','Networking and server equipment','CCTV and access control products','Delivery and installation options']},
  {path:'/web-design-kuala-lumpur',title:'Web Design Kuala Lumpur | NS Smart Fix Solution',h1:'Web Design & Development in Kuala Lumpur',description:'Responsive business websites designed and developed in Kuala Lumpur with clear content, enquiry journeys and ongoing support options.',bullets:['Responsive website design','Business landing pages','Forms and integrations','Hosting and maintenance options']},
  {path:'/tv-bracket-installation-kuala-lumpur',title:'TV Bracket Installation Kuala Lumpur | NS Smart Fix Solution',h1:'TV Bracket Installation in Kuala Lumpur',description:'Safe fixed, tilting and movable TV bracket installation for homes, offices and commercial spaces in Kuala Lumpur.',bullets:['Wall suitability checks','Fixed and tilting brackets','Cable routing options','Removal and relocation']},
  {path:'/minor-renovation-kuala-lumpur',title:'Minor Renovation Kuala Lumpur | NS Smart Fix Solution',h1:'Minor Renovation Services in Kuala Lumpur',description:'Minor renovation and installation work coordinated with electrical, cabling and technology requirements for Kuala Lumpur properties.',bullets:['Site inspection and planning','Minor repair and fitting work','Electrical and cabling coordination','Clear quotation before work']},
  {path:'/delivery-installation-malaysia',title:'IT Delivery & Installation Malaysia | NS Smart Fix Solution',h1:'Technology Delivery & Installation in Malaysia',description:'Coordinated delivery, installation and setup of IT, networking and electrical equipment for homes and businesses in Malaysia.',bullets:['Scheduled equipment delivery','On-site installation','Configuration and testing','Handover and basic guidance']},
  {path:'/it-troubleshooting-kuala-lumpur',title:'IT Troubleshooting Kuala Lumpur | NS Smart Fix Solution',h1:'IT Troubleshooting & Maintenance in Kuala Lumpur',description:'Troubleshooting and maintenance for network, server, electrical and office technology issues in Kuala Lumpur.',bullets:['Fault diagnosis','Network and connectivity checks','Equipment configuration support','Preventive maintenance options']}
];

const serviceMalay = new Map([
  ['/electrical-wiring-kuala-lumpur',['Pendawaian Elektrik Kuala Lumpur | NS Smart Fix Solution','Perkhidmatan Pendawaian Elektrik di Kuala Lumpur','Pendawaian elektrik profesional, soket, lampu, papan agihan dan diagnosis kerosakan untuk kediaman dan perniagaan di Kuala Lumpur.',['Pendawaian baharu dan pendawaian semula','Soket, suis, lampu dan kipas','Papan agihan dan naik taraf MCB','Penyelesaian masalah dan pembaikan elektrik']]],
  ['/network-cabling-kuala-lumpur',['Kabel Rangkaian Kuala Lumpur | NS Smart Fix Solution','Pemasangan Kabel Rangkaian di Kuala Lumpur','Pemasangan kabel rangkaian berstruktur, CAT6, rak rangkaian dan titik capaian Wi-Fi untuk pejabat dan kediaman di Kuala Lumpur.',['Kabel CAT6 dan rangkaian berstruktur','Rak rangkaian dan panel tampalan','Pengujian dan pelabelan kabel','Pemasangan titik capaian Wi-Fi']]],
  ['/server-installation-malaysia',['Pemasangan Server Malaysia | NS Smart Fix Solution','Pemasangan Server & Infrastruktur IT di Malaysia','Pemasangan server, rak, UPS, firewall dan infrastruktur rangkaian untuk perniagaan di Malaysia dengan perancangan dan konfigurasi profesional.',['Pemasangan server dan rak','Konfigurasi UPS dan kuasa sandaran','Konfigurasi firewall dan suis','Dokumentasi dan serahan']]],
  ['/it-infrastructure-design-malaysia',['Reka Bentuk Infrastruktur IT Malaysia | NS Smart Fix Solution','Reka Bentuk Infrastruktur IT di Malaysia','Perancangan infrastruktur IT praktikal untuk pejabat dan perniagaan, meliputi rangkaian, rak, kuasa, keselamatan dan pengembangan masa hadapan.',['Perancangan rangkaian dan rak','Keperluan kuasa dan UPS','Akses selamat dan pengasingan rangkaian','Reka bentuk infrastruktur boleh skala']]],
  ['/it-product-supply-malaysia',['Pembekalan Produk IT Malaysia | NS Smart Fix Solution','Pembekalan Produk IT Perniagaan di Malaysia','Pembekalan komputer riba, desktop, monitor, peralatan rangkaian, server, sistem UPS dan aksesori daripada jenama teknologi dipercayai.',['Komputer riba dan desktop perniagaan','Peralatan rangkaian dan server','Produk CCTV dan kawalan akses','Pilihan penghantaran dan pemasangan']]],
  ['/web-design-kuala-lumpur',['Reka Bentuk Laman Web Kuala Lumpur | NS Smart Fix Solution','Reka Bentuk & Pembangunan Laman Web di Kuala Lumpur','Laman web perniagaan responsif yang direka dan dibangunkan di Kuala Lumpur dengan kandungan jelas, aliran pertanyaan dan pilihan sokongan berterusan.',['Reka bentuk laman web responsif','Halaman pendaratan perniagaan','Borang dan integrasi','Pilihan pengehosan dan penyelenggaraan']]],
  ['/tv-bracket-installation-kuala-lumpur',['Pemasangan Pendakap TV Kuala Lumpur | NS Smart Fix Solution','Pemasangan Pendakap TV di Kuala Lumpur','Pemasangan pendakap TV tetap, boleh condong dan boleh gerak yang selamat untuk kediaman, pejabat dan ruang komersial di Kuala Lumpur.',['Pemeriksaan kesesuaian dinding','Pendakap tetap dan boleh condong','Pilihan laluan kabel','Penanggalan dan pemindahan']]],
  ['/minor-renovation-kuala-lumpur',['Pengubahsuaian Kecil Kuala Lumpur | NS Smart Fix Solution','Perkhidmatan Pengubahsuaian Kecil di Kuala Lumpur','Kerja pengubahsuaian dan pemasangan kecil yang diselaraskan dengan keperluan elektrik, kabel dan teknologi untuk hartanah di Kuala Lumpur.',['Pemeriksaan dan perancangan tapak','Kerja pembaikan dan pemasangan kecil','Penyelarasan elektrik dan kabel','Sebut harga jelas sebelum kerja']]],
  ['/delivery-installation-malaysia',['Penghantaran & Pemasangan IT Malaysia | NS Smart Fix Solution','Penghantaran & Pemasangan Teknologi di Malaysia','Penghantaran, pemasangan dan persediaan peralatan IT, rangkaian dan elektrik untuk kediaman serta perniagaan di Malaysia.',['Penghantaran peralatan berjadual','Pemasangan di tapak','Konfigurasi dan pengujian','Serahan dan panduan asas']]],
  ['/it-troubleshooting-kuala-lumpur',['Penyelesaian Masalah IT Kuala Lumpur | NS Smart Fix Solution','Penyelesaian Masalah & Penyelenggaraan IT di Kuala Lumpur','Penyelesaian masalah dan penyelenggaraan untuk rangkaian, server, elektrik dan teknologi pejabat di Kuala Lumpur.',['Diagnosis kerosakan','Pemeriksaan rangkaian dan sambungan','Sokongan konfigurasi peralatan','Pilihan penyelenggaraan pencegahan']]]
]);

const malay = new Map([
  ['/',['NS Smart Fix Solution | Perkhidmatan Elektrik, Rangkaian & IT','Perkhidmatan Elektrik, Rangkaian & IT di Kuala Lumpur','Perkhidmatan pendawaian elektrik, rangkaian, server, bekalan produk IT dan pemasangan di Kuala Lumpur serta seluruh Semenanjung Malaysia.']],
  ['/about',['Tentang Kami | NS Smart Fix Solution','Tentang NS Smart Fix Solution','Kenali NS Smart Fix Solution, penyedia perkhidmatan elektrik, rangkaian dan infrastruktur IT yang berpangkalan di Bangsar, Kuala Lumpur.']],
  ['/services',['Perkhidmatan | NS Smart Fix Solution','Perkhidmatan Elektrik, Rangkaian & IT','Perkhidmatan elektrik, kabel rangkaian, server, pembekalan IT, pemasangan pendakap TV dan penyelesaian masalah di Semenanjung Malaysia.']],
  ['/products',['Produk IT & Keselamatan | NS Smart Fix Solution','Produk IT, Rangkaian & Keselamatan','Bekalan produk IT, rangkaian, keselamatan dan infrastruktur daripada jenama dipercayai untuk kediaman dan perniagaan di Malaysia.']],
  ['/quotation',['Permohonan Sebut Harga | NS Smart Fix Solution','Mohon Sebut Harga Perkhidmatan','Mohon sebut harga untuk perkhidmatan elektrik, rangkaian, server atau pemasangan daripada NS Smart Fix Solution.']],
  ['/contact',['Hubungi Kami | NS Smart Fix Solution','Hubungi NS Smart Fix Solution','Hubungi NS Smart Fix Solution di Bangsar, Kuala Lumpur melalui telefon atau WhatsApp untuk pertanyaan dan sebut harga.']],
  ['/faq',['Soalan Lazim | NS Smart Fix Solution','Soalan Lazim','Jawapan kepada soalan lazim mengenai liputan, sebut harga, pemasangan, penghantaran dan perkhidmatan NS Smart Fix Solution.']],
  ['/privacy',['Notis Privasi | NS Smart Fix Solution','Notis Privasi','Notis privasi NS Smart Fix Solution dan cara kami mengurus maklumat pelanggan.']],
  ['/terms',['Terma dan Syarat | NS Smart Fix Solution','Terma dan Syarat','Terma dan syarat produk serta perkhidmatan NS Smart Fix Solution.']],
  ['/warranty',['Polisi Waranti dan Perkhidmatan | NS Smart Fix Solution','Polisi Waranti dan Perkhidmatan','Maklumat waranti produk, mutu kerja dan sokongan selepas perkhidmatan.']]
]);

const allEnglishPages = [...pages,...servicePages];

function escapeHtml(value){
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

function pageUrl(path,lang){
  if (lang === 'ms') return `${origin}${path === '/' ? '/ms' : `/ms${path}`}`;
  return `${origin}${path}`;
}

function replaceTag(html,pattern,replacement){
  if (!pattern.test(html)) throw new Error(`SEO template tag not found: ${pattern}`);
  return html.replace(pattern,replacement);
}

function renderFallback(page,lang){
  const isMs = lang === 'ms';
  const bullets = page.bullets?.length
    ? `<ul>${page.bullets.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '';
  const quotationPath = isMs ? '/ms/quotation' : '/quotation';
  const contactText = isMs
    ? 'Berpangkalan di Bangsar, Kuala Lumpur. Hubungi 016-211 9969 atau admin@nssmartfixsolution.com untuk membincangkan keperluan anda.'
    : 'Based in Bangsar, Kuala Lumpur. Call 016-211 9969 or email admin@nssmartfixsolution.com to discuss your requirements.';
  return `<!-- SEO_FALLBACK_START -->\n<section id="seo-fallback">\n  <h1>${escapeHtml(page.h1)}</h1>\n  <p>${escapeHtml(page.description)}</p>\n  ${bullets}\n  <p>${escapeHtml(contactText)}</p>\n  <a href="${quotationPath}">${isMs ? 'Mohon sebut harga' : 'Request a quotation'}</a>\n</section>\n<!-- SEO_FALLBACK_END -->`;
}

function renderPage(page,lang){
  const isMs = lang === 'ms';
  const url = pageUrl(page.path,lang);
  const englishUrl = pageUrl(page.path,'en');
  const malayUrl = pageUrl(page.path,'ms');
  let html = baseHtml;
  html = replaceTag(html,/<html\b[^>]*>/i,`<html lang="${isMs ? 'ms' : 'en'}">`);
  html = replaceTag(html,/<title>[\s\S]*?<\/title>/i,`<title>${escapeHtml(page.title)}</title>`);
  html = replaceTag(html,/<meta name="description"[^>]*>/i,`<meta name="description" content="${escapeHtml(page.description)}">`);
  html = replaceTag(html,/<meta property="og:title"[^>]*>/i,`<meta property="og:title" content="${escapeHtml(page.title)}">`);
  html = replaceTag(html,/<meta property="og:description"[^>]*>/i,`<meta property="og:description" content="${escapeHtml(page.description)}">`);
  html = replaceTag(html,/<meta property="og:url"[^>]*>/i,`<meta property="og:url" content="${url}">`);
  html = replaceTag(html,/<meta property="og:locale"[^>]*>/i,`<meta property="og:locale" content="${isMs ? 'ms_MY' : 'en_MY'}">`);
  html = replaceTag(html,/<meta property="og:image"[^>]*>/i,`<meta property="og:image" content="${socialImage}">`);
  html = replaceTag(html,/<meta name="twitter:title"[^>]*>/i,`<meta name="twitter:title" content="${escapeHtml(page.title)}">`);
  html = replaceTag(html,/<meta name="twitter:description"[^>]*>/i,`<meta name="twitter:description" content="${escapeHtml(page.description)}">`);
  html = replaceTag(html,/<link rel="canonical"[^>]*>/i,`<link rel="canonical" href="${url}">`);
  html = replaceTag(html,/<link rel="alternate" hreflang="en-MY"[^>]*>/i,`<link rel="alternate" hreflang="en-MY" href="${englishUrl}">`);
  html = replaceTag(html,/<link rel="alternate" hreflang="ms-MY"[^>]*>/i,`<link rel="alternate" hreflang="ms-MY" href="${malayUrl}">`);
  html = replaceTag(html,/<link rel="alternate" hreflang="x-default"[^>]*>/i,`<link rel="alternate" hreflang="x-default" href="${englishUrl}">`);
  html = replaceTag(html,/<!-- SEO_FALLBACK_START -->[\s\S]*?<!-- SEO_FALLBACK_END -->/,renderFallback(page,lang));
  return html;
}

function outputPath(path,lang){
  const prefix = lang === 'ms' ? 'ms/' : '';
  if (path === '/') return join(dist,prefix,'index.html');
  return join(dist,prefix,`${path.slice(1)}.html`);
}

function localizeService(page){
  const translation = serviceMalay.get(page.path);
  if (!translation) return page;
  return {...page,title:translation[0],h1:translation[1],description:translation[2],bullets:translation[3]};
}

for (const page of allEnglishPages) {
  for (const lang of ['en','ms']) {
    const localized = lang === 'en' ? page : (() => {
      const translation = malay.get(page.path);
      return translation ? {...page,title:translation[0],h1:translation[1],description:translation[2]} : localizeService(page);
    })();
    const file = outputPath(page.path,lang);
    mkdirSync(dirname(file),{recursive:true});
    writeFileSync(file,renderPage(localized,lang));
  }
}

const sitemapUrls = allEnglishPages.flatMap(page => ['en','ms'].map(lang => {
  const url = pageUrl(page.path,lang);
  return `  <url>\n    <loc>${url}</loc>\n    <xhtml:link rel="alternate" hreflang="en-MY" href="${pageUrl(page.path,'en')}"/>\n    <xhtml:link rel="alternate" hreflang="ms-MY" href="${pageUrl(page.path,'ms')}"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(page.path,'en')}"/>\n    <lastmod>2026-10-09</lastmod>\n  </url>`;
}));
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapUrls.join('\n')}\n</urlset>\n`;
writeFileSync(join(dist,'sitemap.xml'),sitemap);

console.log(`Generated ${allEnglishPages.length * 2} localized SEO pages and sitemap.xml.`);
