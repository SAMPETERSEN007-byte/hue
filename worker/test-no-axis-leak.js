/* test-no-axis-leak.js — the analyzing narration must never print a measurement.
 *
 * WHY THIS EXISTS. The season is the $29.99 product, and faba55a moved the
 * classifier into the worker so the browser could not compute it. That protects
 * the VERDICT. It does nothing about the INPUTS: undertone + depth pin exactly one
 * season for 60 of the 101 depth indices, and index.html ships SEASONS with the
 * decode table sitting in its own desc strings ("Warm and deep" is Deep Autumn).
 *
 * The analyzing screen used to push
 *     ["Reading undertone — "+lean, 1050]
 *     ["Depth index "+Math.round((1-photo.l)*100)+" · contrast "+..., 1050]
 * full-screen to every unpaid visitor. render() has stated the rule for months
 * ("REVEAL ZERO AXES, NOT FEWER"), but nothing enforced it, and this path was
 * never held to it. That is what this file is for: the rule now fails loudly.
 *
 * Lives under worker/ because _config.yml excludes that directory from the
 * GitHub Pages build — a test that names the leak must not itself be published.
 *
 * Run: node worker/test-no-axis-leak.js     (exit 0 = clean)
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* Isolate run()'s narration array — from `let seq;` to the playSteps() call. The
 * markers are asserted so a refactor that renames them fails here rather than
 * silently testing an empty string. */
const start = html.indexOf('let seq;');
const end = html.indexOf('playSteps(', start);
if (start === -1 || end === -1 || end <= start) {
  console.error('FAIL: could not locate the narration block (markers "let seq;" .. "playSteps(").');
  console.error('      If run() was refactored, re-point this test — do not delete it.');
  process.exit(1);
}
const blockRaw = html.slice(start, end);

/* Check the CODE, not the prose. The comment above this narration necessarily
 * quotes the old leaking strings to explain why they went — matching those would
 * make the fix and its own explanation mutually exclusive. */
const block = blockRaw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

/* Every measured quantity that is an axis, or a direct term of one.
 * photo.l IS depthAxis (index.html returns `l:depthAxis`); photo.s IS chromaAxis;
 * contrast is a term of depthAxis (-.15*contrast); warmSig/relWarm/hue are the
 * undertone evidence. hairL and lSkin are depth terms. */
const FORBIDDEN = [
  'photo.l', 'photo.s', 'photo.contrast', 'photo.warmSig', 'photo.hue',
  'relWarm', 'skinVote', 'depthAxis', 'chromaAxis', 'hairL', 'lSkin',
];

/* Words that name an axis position in the user's language. The narration may say
 * what is being DONE ("Weighing your undertone evidence") but never the RESULT
 * ("leaning warm", "Depth index 78"). */
const FORBIDDEN_WORDS = [
  'leaning warm', 'leaning cool', 'near neutral', 'Depth index',
];

const hits = [];
/* Whole-identifier match. A plain substring test flags `photo.lipHex` for
 * containing `photo.l` — which is a legitimate, leak-free step, and a gate that
 * cries wolf on it gets deleted by the next person in a hurry. */
for (const t of FORBIDDEN) {
  const re = new RegExp(t.replace(/[.]/g, '\\.') + '(?![A-Za-z0-9_$])');
  if (re.test(block)) hits.push(`interpolates ${t}`);
}
for (const w of FORBIDDEN_WORDS) if (block.includes(w)) hits.push(`prints the phrase "${w}"`);

if (hits.length) {
  console.error('FAIL: the analyzing narration discloses a measurement.\n');
  for (const h of hits) console.error('  - ' + h);
  console.error('\n  Two axes name the season outright. Narrate the work, not the reading.');
  process.exit(1);
}

/* Guard the guard: the block must actually contain the narration, or the checks
 * above pass vacuously. mutation-tested by temporarily restoring the old string. */
if (!block.includes('Cross-checking your five answers')) {
  console.error('FAIL: narration block found but does not contain a known step —');
  console.error('      the slice is wrong and every check above passed vacuously.');
  process.exit(1);
}

console.log(`no-axis-leak OK — narration block ${block.length} bytes, ` +
            `${FORBIDDEN.length} identifiers + ${FORBIDDEN_WORDS.length} phrases checked, none present`);
