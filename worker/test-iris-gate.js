/* test-iris-gate.js — the iris read must refuse rather than guess "deep brown".
 *
 * WHY THIS EXISTS. The eye box is a fixed geometric guess off the face box
 * (fx ± .175·fs), not an eye landmark, and eyeKeep() only rejects skin, black and
 * blown-out pixels. Eyelashes, liner, mascara and the lid crease all survive that
 * filter, and in that box they outnumber iris pixels on most faces. The classifier
 * then answered `eyeC<9 && eL<38 -> "deep brown"`, so a clump of lashes was
 * reported as an eye colour with full confidence. That is the "eye colour keeps
 * coming up wrong" Sam saw: not a threshold slightly off, a wrong answer asserted.
 *
 * This checks the gate on both sides — it must reject lash contamination AND still
 * accept genuinely dark brown eyes, which is the hard half. Rejecting everything
 * would "fix" the complaint and destroy the feature.
 *
 * Run: node worker/test-iris-gate.js     (exit 0 = clean)
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const S = '/* --iris-gate-start--', E = '/* --iris-gate-end-- */';
const a = html.indexOf(S), b = html.indexOf(E);
if (a === -1 || b === -1 || b <= a) {
  console.error('FAIL: could not extract the iris gate block. If it was refactored,');
  console.error('      re-point this test — do not delete it.');
  process.exit(1);
}
const block = html.slice(a, b + E.length);
if (!/function irisTrust/.test(block)) {
  console.error('FAIL: block found but contains no irisTrust — slice is wrong.');
  process.exit(1);
}
const irisTrust = new Function(block + '; return irisTrust;')();

/* Luminance is 0..1 as lumOf() produces it; eL is CIE L*, 0..100.
 * `spread` is mid[last].lum - mid[0].lum over the 25th-85th percentile slice. */
const cases = [
  // --- must be ACCEPTED: real irises, including the difficult dark ones ---
  { name: 'deep brown iris, even light',      spread: 0.05, eL: 24, want: true },
  { name: 'dark brown iris, dim room',        spread: 0.08, eL: 21, want: true },
  { name: 'mid brown iris',                   spread: 0.07, eL: 34, want: true },
  { name: 'hazel iris',                       spread: 0.11, eL: 42, want: true },
  { name: 'blue iris',                        spread: 0.13, eL: 47, want: true },
  { name: 'green iris, textured',             spread: 0.18, eL: 40, want: true },
  // --- must be REJECTED: the failure modes ---
  { name: 'lashes + iris mixed (bimodal)',    spread: 0.29, eL: 19, want: false },
  { name: 'heavy mascara over iris',          spread: 0.34, eL: 16, want: false },
  { name: 'box slid onto lash line only',     spread: 0.04, eL: 11, want: false },
  { name: 'eyeliner clump, uniform + black',  spread: 0.03, eL: 7,  want: false },
  { name: 'too few pixels to slice',          spread: null, eL: 30, want: false },
];

let bad = 0;
for (const c of cases) {
  const got = irisTrust(c.spread, c.eL).ok;
  const why = irisTrust(c.spread, c.eL).why || '';
  if (got !== c.want) {
    console.error(`  MISMATCH  ${c.name}: wanted ${c.want ? 'accept' : 'reject'}, got ${got ? 'accept' : 'reject'} ${why}`);
    bad++;
  }
}
if (bad) { console.error(`\nFAIL: ${bad}/${cases.length} iris-gate cases wrong.`); process.exit(1); }

/* Guard the guard. If the thresholds were ever widened to the point of accepting
 * everything, every case above still "passes" the accept half while the reject
 * half silently dies — so assert both halves are non-empty and discriminating. */
const accepted = cases.filter(c => irisTrust(c.spread, c.eL).ok).length;
if (accepted === 0 || accepted === cases.length) {
  console.error('FAIL: the gate is not discriminating — it accepted ' + accepted + '/' + cases.length + '.');
  process.exit(1);
}

console.log(`iris-gate OK — ${cases.length} cases, ${accepted} accepted / ${cases.length - accepted} rejected; ` +
            `dark-brown irises (L* 21-24) still read, lash contamination refused`);
