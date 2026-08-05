#!/usr/bin/env node
/* Guards the LIVE report-mailer against the seasonFromRef regression.
   checkout() in index.html mints client_reference_id as
     <channel>_<season-slug>_px<cents>          e.g. direct_deep-autumn_px2999
   A matcher that only accepts `ref === slug` or `ref.endsWith('_'+slug)` returns
   null for every real sale, so the buyer gets the generic fallback email instead
   of their season report. This test fails loudly if that ever comes back. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'report-mailer.js'), 'utf8');

/* Evaluate only what the matcher needs: the SEASONS table, the SLUGS map it is
   built from, and seasonFromRef itself. The rest of the worker references
   Cloudflare globals that do not exist under plain node. */
const seasons = src.match(/const SEASONS = \{[\s\S]*?\n\};/);
const slugs = src.match(/const SLUGS = \{\};\n[\s\S]*?\n/);
const fn = src.match(/function seasonFromRef\(ref\) \{[\s\S]*?\n\}/);
if (!seasons || !slugs || !fn) {
  console.error('EXTRACT FAIL — report-mailer.js no longer has the expected shape');
  process.exit(1);
}

const ctx = {};
vm.createContext(ctx);
vm.runInContext(seasons[0].replace('const ', 'var ') + '\n'
  + slugs[0].replace('const ', 'var ') + '\n'
  + fn[0], ctx);

const cases = [
  /* the format every real sale actually produces */
  ['direct_deep-autumn_px2999', 'Deep Autumn'],
  ['direct_true-winter_px2999', 'True Winter'],
  ['fbg-stcharles_light-spring_px2999', 'Light Spring'],
  ['ttbrand_soft-summer_px2999', 'Soft Summer'],
  /* Every channel slug the marketing assets actually mint. fbg-<group> can run
     long and contains dashes, which is exactly the shape most likely to confuse
     a segment scan. */
  ['fbg-genevacapsulemoms_deep-autumn_px2999', 'Deep Autumn'],
  ['fbpage_bright-winter_px2999', 'Bright Winter'],
  ['email_true-autumn_px2999', 'True Autumn'],
  ['fbg-local_soft-autumn_px2999', 'Soft Autumn'],
  /* legacy refs minted before the _px suffix landed */
  ['tiktok_true-winter', 'True Winter'],
  ['bright-spring', 'Bright Spring'],
  /* a channel name containing a season string must not shadow the real season */
  ['deep-autumn_bright-spring_px2999', 'Bright Spring'],
  /* genuinely unresolvable refs still fall back */
  ['direct_px2999', null],
  ['nonsense', null],
];

let fail = 0;
for (const [ref, want] of cases) {
  const got = ctx.seasonFromRef(ref);
  if (got !== want) {
    console.error(`FAIL seasonFromRef(${ref}) = ${got} — want ${want}`);
    fail++;
  }
}

/* Every one of the 12 seasons must round-trip through a live-format ref. */
for (const name of Object.keys(ctx.SEASONS)) {
  const ref = 'direct_' + name.toLowerCase().replace(/ /g, '-') + '_px2999';
  const got = ctx.seasonFromRef(ref);
  if (got !== name) {
    console.error(`FAIL round-trip ${ref} = ${got} — want ${name}`);
    fail++;
  }
}

if (fail) {
  console.error(`\n${fail} SEASON-REF CHECK(S) FAILED — real buyers would get the fallback email`);
  process.exit(1);
}
console.log(`seasonFromRef OK — ${cases.length} cases + all ${Object.keys(ctx.SEASONS).length} seasons round-trip in live ref format`);
