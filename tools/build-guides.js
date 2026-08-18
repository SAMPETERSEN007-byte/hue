#!/usr/bin/env node
/* Build guide pages from researched content.
     node tools/build-guides.js pages.json

   The page chrome (fonts, palette, header, footer) is LIFTED FROM refunds.html
   at build time rather than copied into this file, so the guides cannot drift
   away from the rest of the site's design when refunds.html changes. Only the
   <main> is generated.

   Every guide carries a canonical, a description, and one honest CTA. No
   generated page may claim a customer, a review or a statistic — HUE has never
   had a paying customer, so any social proof would be a lie. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'refunds.html'), 'utf8');
const pages = JSON.parse(fs.readFileSync(process.argv[2] || path.join(__dirname, 'pages.json'), 'utf8'));
const list = Array.isArray(pages) ? pages : (pages.pages || []);
if (!list.length) { console.error('no pages in input'); process.exit(1); }

/* pull the shared chrome out of refunds.html */
const headStart = SRC.indexOf('<style>');
const headEnd = SRC.indexOf('</style>') + '</style>'.length;
const STYLE = SRC.slice(headStart, headEnd);
const topStart = SRC.indexOf('<div class="wrap top">');
const topEnd = SRC.indexOf('</div>', SRC.indexOf('<span class="who">')) + '</div>'.length;
const TOP = SRC.slice(topStart, topEnd);
const FOOT = SRC.slice(SRC.indexOf('<footer class="wrap foot">'), SRC.indexOf('</footer>') + '</footer>'.length);
if (!STYLE || !TOP || !FOOT) { console.error('could not lift chrome from refunds.html'); process.exit(1); }

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ALLOWED = /<(?!\/?(h2|h3|p|ul|ol|li|strong|em|table|thead|tbody|tr|th|td|a)\b)[^>]*>/gi;

const OUT = path.join(ROOT, 'guides');
fs.mkdirSync(OUT, { recursive: true });

const EXTRA = `
  main{padding:30px 0 8px}
  main h2{font-family:"Bodoni Moda",Georgia,serif;font-size:25px;font-weight:600;letter-spacing:-.01em;margin:32px 0 10px;line-height:1.25}
  main h3{font-size:15px;font-weight:600;margin:22px 0 6px}
  main p{margin:0 0 14px;color:#4a3f46}
  main ul,main ol{margin:0 0 16px 20px}main li{margin:0 0 7px;color:#4a3f46}
  main table{width:100%;border-collapse:collapse;margin:0 0 18px;font-size:14.5px}
  main th,main td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line)}
  main th{font-weight:600;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--soft)}
  .try{margin:30px 0 6px;padding:22px;background:var(--card);border:1px solid var(--line);border-radius:2px}
  .try b{font-family:"Bodoni Moda",Georgia,serif;font-size:19px;font-weight:600;display:block;margin-bottom:6px}
  .try p{font-size:14.5px;margin:0 0 14px}
  .try a{display:inline-block;background:var(--ink);color:#fff;text-decoration:none;padding:13px 22px;border-radius:2px;
    font-weight:600;font-size:12px;letter-spacing:.14em;text-transform:uppercase}
  .crumb{font-size:12px;color:var(--soft);margin-bottom:10px}.crumb a{color:var(--soft)}
`;

const built = [];
for (const p of list) {
  if (!p.slug || !p.title || !p.bodyHtml) { console.warn('skipped (incomplete):', p.slug || '?'); continue; }
  const body = p.bodyHtml.replace(ALLOWED, '');            /* drop anything outside the allowed tag set */
  const url = `https://huebloom.app/guides/${p.slug}.html`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description || '')}" />
<meta name="theme-color" content="#f7f2ef" />
<link rel="canonical" href="${url}" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
${STYLE.replace('</style>', EXTRA + '</style>')}
</head>
<body>
${TOP.replace('href="./"', 'href="../"')}

<main class="wrap">
  <p class="crumb"><a href="../">HUE</a> · Guides</p>
  <h1 class="serif">${esc(p.title)}</h1>
${body}
  <div class="try">
    <b>See it on your own face</b>
    <p>HUE reads your skin, hair and eyes from one selfie and shows you a colour that lifts you
       beside one that drains you. It runs on your device — your photo is never uploaded.</p>
    <a href="../">Find my season — free</a>
  </div>
</main>

${FOOT.replace(/href="(?!http)/g, 'href="../')}
</body>
</html>`;
  fs.writeFileSync(path.join(OUT, p.slug + '.html'), html);
  built.push(p.slug);
}

/* sitemap: the four originals plus every guide */
const base = ['', 'privacy.html', 'terms.html', 'refunds.html'];
const urls = base.map(u => `https://huebloom.app/${u}`)
  .concat(built.map(s => `https://huebloom.app/guides/${s}.html`));
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') + `\n</urlset>\n`);

console.log(`built ${built.length} guides -> guides/`);
console.log(`sitemap.xml now lists ${urls.length} urls`);
