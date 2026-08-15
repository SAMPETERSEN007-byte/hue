/* test-iris-mode.js — the iris colour must come from the iris, not from an
 * average of iris and eyelashes.
 *
 * WHY THIS EXISTS. eyeKeep() cannot exclude lashes, liner or the lid crease: they
 * are not skin, not black, not blown out. So the eye box holds TWO pixel
 * populations. The old read sorted by luminance and took a fixed 25th-85th
 * percentile band, which assumes one population — with lashes present that band
 * straddles both and the median lands between them, dark and desaturated. That is
 * why a blue or green iris could read "deep brown".
 *
 * irisTrust() only declines the worst samples. It does NOT clean the surviving
 * ones. irisMode() is the actual fix: take the dominant luminance mode.
 *
 * This test builds synthetic bimodal populations with a KNOWN iris colour and
 * asserts the recovered colour lands on the iris — and that it beats the old
 * percentile method it replaced.
 *
 * Run: node worker/test-iris-mode.js     (exit 0 = clean)
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const S = '/* --iris-mode-start--', E = '/* --iris-mode-end-- */';
const a = html.indexOf(S), b = html.indexOf(E);
if (a === -1 || b === -1 || b <= a) {
  console.error('FAIL: could not extract the iris-mode block. If it was refactored,');
  console.error('      re-point this test — do not delete it.');
  process.exit(1);
}
const block = html.slice(a, b + E.length);
if (!/function irisMode/.test(block)) {
  console.error('FAIL: block found but contains no irisMode — the slice is wrong.');
  process.exit(1);
}
const irisMode = new Function(block + '; return irisMode;')();

const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const med = xs => { const s = [...xs].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const medOf = set => [med(set.map(p => p[0])), med(set.map(p => p[1])), med(set.map(p => p[2]))];
const dist = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);

/* deterministic jitter — no Math.random, so a failure is always reproducible */
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const blob = (rgb, n, spread) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = () => (rnd() - 0.5) * 2 * spread;
    const r = Math.max(0, Math.min(255, rgb[0] + j()));
    const g = Math.max(0, Math.min(255, rgb[1] + j()));
    const b2 = Math.max(0, Math.min(255, rgb[2] + j()));
    out.push([r, g, b2, lum(r, g, b2)]);
  }
  return out;
};

/* the old method this replaced: sort by luminance, median the 25th-85th band */
const oldPercentile = set => {
  const s = [...set].sort((p, q) => p[3] - q[3]);
  const mid = s.slice(Math.round(s.length * 0.25), Math.round(s.length * 0.85));
  return medOf(mid.length >= 20 ? mid : s);
};

const LASH = [20, 18, 17];   // lash / liner / mascara: very dark, near-neutral
const cases = [
  { name: 'blue iris, 35% lashes',       iris: [72, 112, 156], nI: 260, nL: 140 },
  { name: 'green iris, 45% lashes',      iris: [86, 124, 84],  nI: 220, nL: 180 },
  { name: 'hazel iris, 30% lashes',      iris: [138, 112, 66], nI: 280, nL: 120 },
  { name: 'light brown iris, 40% lashes',iris: [124, 92, 58],  nI: 240, nL: 160 },
  { name: 'blue iris, clean (no lashes)',iris: [72, 112, 156], nI: 340, nL: 0   },
];

let bad = 0, wins = 0;
console.log('  recovered colour vs the true iris (lower distance = better)\n');
for (const c of cases) {
  const set = blob(c.iris, c.nI, 14).concat(blob(LASH, c.nL, 6));
  const m = irisMode(set);
  const gotNew = medOf(m.pixels);
  const gotOld = oldPercentile(set);
  const dNew = dist(gotNew, c.iris), dOld = dist(gotOld, c.iris);
  const ok = dNew <= 26;                 // within a perceptually close margin
  const better = c.nL === 0 ? dNew <= dOld + 3 : dNew < dOld;
  if (!ok || !better) bad++; else if (c.nL) wins++;
  console.log(`  ${ok && better ? 'ok  ' : 'FAIL'} ${c.name.padEnd(30)} mode Δ${dNew.toFixed(1).padStart(5)}   percentile Δ${dOld.toFixed(1).padStart(6)}`);
}

if (bad) { console.error(`\nFAIL: ${bad}/${cases.length} cases — the mode did not isolate the iris.`); process.exit(1); }
if (wins < 4) { console.error(`\nFAIL: mode only beat the percentile band on ${wins} contaminated cases; expected 4.`); process.exit(1); }

console.log(`\niris-mode OK — ${cases.length} cases, mode beat the old percentile band on all ` +
            `${wins} lash-contaminated ones and held on the clean one`);
