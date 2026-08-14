#!/usr/bin/env node
/* Guards mapSeason — the function that turns three measured numbers into the
   $29.99 answer.

   WHY THIS FILE EXISTS. mapSeason used to live in index.html, where the dev
   tree's engine gates (tools/engine-test.js, season-audit.js, stress/run.js)
   reached it by regex. Moving it into the worker closed the paywall — the
   browser no longer ships the function that names the season — but it also
   moved the engine out of range of every gate that tested it. Without this
   file the classifier that decides what every buyer pays for would be tested
   by nothing at all.

   WHAT THIS CANNOT DO. It cannot tell you the engine is ACCURATE. There are
   only three labelled people in existence and a draped 12-season ground truth
   cannot be bought (see memory: project_hue_ground_truth_impossible). So this
   tests STRUCTURE and STABILITY: that every season is reachable, that the map
   is self-consistent, and that nobody changes the verdict by accident. A green
   run means "the map still says what it said", never "the map is right". */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const src = fs.readFileSync(path.join(__dirname, 'report-mailer.js'), 'utf8');

/* Marker-delimited on purpose: extracting `function mapSeason` by regex would
   silently pass if the block were emptied or the function renamed. */
const block = src.match(/\/\* --classifier-start--[\s\S]*?\n\/\* --classifier-end-- \*\//);
if (!block) {
  console.error('EXTRACT FAIL — the --classifier-- markers are gone from report-mailer.js.');
  console.error('The engine is now tested by NOTHING. Restore the markers.');
  process.exit(1);
}
const seasons = src.match(/const SEASONS = \{[\s\S]*?\n\};/);
const slugs = src.match(/const SLUGS = \{\};\n[\s\S]*?\n/);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(seasons[0].replace('const ', 'var ') + '\n'
  + slugs[0].replace('const ', 'var ') + '\n' + block[0], ctx);
const { mapSeason, axesFromRef } = ctx;

const WARM = ['Deep Autumn', 'Light Spring', 'Bright Spring', 'Soft Autumn', 'True Spring', 'True Autumn'];
const COOL = ['Deep Winter', 'Light Summer', 'Bright Winter', 'Soft Summer', 'True Winter', 'True Summer'];
const ALL = WARM.concat(COOL);

let fail = 0;
const check = (name, ok, detail) => {
  if (!ok) { console.error('FAIL ' + name + (detail ? ' — ' + detail : '')); fail++; }
};

/* A dense sweep of the whole measurable space. depth and chroma are both 0..1
   by construction (they are normalised luminance and saturation). */
const grid = [];
for (let d = 0; d <= 1.0001; d += 0.02)
  for (let c = 0; c <= 1.0001; c += 0.02)
    for (const w of [true, false])
      grid.push([w, +d.toFixed(2), +c.toFixed(2)]);

/* 1. Never returns anything that is not one of the twelve. A typo in a branch
      ships a season name that has no palette, no email template and no data —
      the buyer pays and gets a broken report. */
const produced = new Set();
for (const [w, d, c] of grid) {
  const s = mapSeason(w, d, c);
  produced.add(s);
  if (!ALL.includes(s)) { check('valid-name', false, `mapSeason(${w},${d},${c}) = ${s}`); break; }
}

/* 2. Every one of the twelve is reachable. A season that no input can produce
      is a season nobody can ever buy — and it would be invisible to any test
      that only checks the outputs it happens to hit. */
for (const s of ALL) check('reachable: ' + s, produced.has(s));

/* 3. Warm and cool are strict mirrors. The temperature flip is what the
      "sister season" honesty gate relies on: same depth, same chroma, flipped
      undertone must give the paired season at the SAME index, never a season
      from a different depth/chroma cell. */
for (const [, d, c] of grid.filter(g => g[0])) {
  const wi = WARM.indexOf(mapSeason(true, d, c));
  const ci = COOL.indexOf(mapSeason(false, d, c));
  if (wi !== ci) {
    check('sister-symmetry', false, `depth=${d} chroma=${c}: ${WARM[wi]} vs ${COOL[ci]}`);
    break;
  }
}

/* 4. The measured tie-break still defers to VALUE. When value and chroma are
      both extreme and within DOM_MARGIN (3 sigma of the measured noise floor),
      the answer must come from the depth axis, which is measured 1.9x more
      precisely. This is the rule that stopped one woman under two drapes from
      coming out Light Spring in one frame and Soft Autumn in the other. */
check('tie-break defers to value (deep)', /Deep/.test(mapSeason(true, 0.42, 0.36)),
  'got ' + mapSeason(true, 0.42, 0.36));
check('tie-break defers to value (light)', /Light/.test(mapSeason(true, 0.66, 0.36)),
  'got ' + mapSeason(true, 0.66, 0.36));

/* 5. A hue-dominant read is a True season, split by chroma sign, never by depth. */
check('hue-dominant is True (bright side)', mapSeason(true, 0.54, 0.26) === 'True Spring');
check('hue-dominant is True (soft side)', mapSeason(true, 0.54, 0.24) === 'True Autumn');

/* 6. GOLDEN VECTOR. Any change to a centre, a half-width or DOM_MARGIN changes
      the verdict for real people, so it must be a deliberate act with a new
      hash — never a silent side effect of an unrelated edit. If this is the
      only failure and the change was intended, re-run with UPDATE_GOLDEN=1 and
      commit the new hash WITH the measurement that justifies it. */
const GOLDEN = 'fc622e453be87b78';
const digest = crypto.createHash('sha256')
  .update(grid.map(([w, d, c]) => mapSeason(w, d, c)).join('|')).digest('hex').slice(0, 16);
if (process.env.UPDATE_GOLDEN === '1') {
  console.log('golden digest for this map: ' + digest);
} else {
  check('golden map digest', digest === GOLDEN,
    `map changed: ${digest} != ${GOLDEN}. If deliberate, justify it and update GOLDEN.`);
}

/* 7. axesFromRef is the wire format the browser now speaks. It must reject
      anything malformed rather than guess — a wrong parse sells the wrong
      report. */
check('axes round-trip', JSON.stringify(axesFromRef('direct_a1300000340000_px2999'))
  === JSON.stringify({ warm: true, depth: 0.3, chroma: 0.34 }));
check('axes rejects short', axesFromRef('direct_a130003400_px2999') === null);
check('axes rejects bad warm digit', axesFromRef('direct_a2300000340000_px2999') === null);
check('axes survives the consent marker', axesFromRef('direct_a1300000340000_px2999_noads') !== null);
check('axes absent in a legacy slug ref', axesFromRef('direct_deep-autumn_px2999') === null);

if (fail) { console.error(`\n${fail} classifier check(s) FAILED`); process.exit(1); }
console.log(`classifier OK — ${grid.length} grid points, all 12 seasons reachable, map digest ${digest}`);
