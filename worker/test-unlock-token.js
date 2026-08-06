#!/usr/bin/env node
/* Guards the unlock entitlement.

   Before tokens existed, https://huebloom.app/?unlocked=1 granted the full
   $29.99 report to anyone who typed it, permanently, and that bare URL was the
   "Open my report" button in every buyer email. These checks prove the
   replacement actually gates: a token must be unforgeable without the key, and
   nothing else may unlock. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'report-mailer.js'), 'utf8');

/* Pull the whole entitlement block into a sandbox by its markers. The rest of
   the worker references Cloudflare globals that do not exist under node.

   Marker-delimited on purpose: an earlier version of this file extracted each
   helper with its own non-greedy regex, and one of them silently truncated
   b64url mid-expression -- the test then measured a function the worker does not
   have. A test that quietly stops testing the real thing is worse than none, so
   a missing marker is a hard failure here. */
const block = src.match(/\/\* --entitlement-start--[\s\S]*?\n\/\* --entitlement-end-- \*\//);
if (!block) {
  console.error('EXTRACT FAIL — entitlement markers missing from report-mailer.js');
  process.exit(1);
}
const code = block[0];
for (const fn of ['b64url', 'b64urlDecode', 'unlockKey', 'signPayload', 'mintUnlockToken', 'readUnlockToken']) {
  if (!code.includes(fn)) { console.error('EXTRACT FAIL — block is missing ' + fn); process.exit(1); }
}
/* The truncation that fooled the earlier harness: b64url must carry its full
   replace chain, or every token comes out non-url-safe. */
if (!/b64url[\s\S]{0,200}replace\(\/=\+\$\/, ''\)/.test(code)) {
  console.error('EXTRACT FAIL — b64url did not come through with its replace chain');
  process.exit(1);
}

const ctx = { crypto: require('crypto').webcrypto, TextEncoder, btoa, atob, console };
vm.createContext(ctx);
vm.runInContext(code + '\nglobalThis.__api = { mintUnlockToken, readUnlockToken };', ctx);
const { mintUnlockToken, readUnlockToken } = ctx.__api;

const ENV = { STRIPE_WEBHOOK_SECRET: 'whsec_test_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
const OTHER = { STRIPE_WEBHOOK_SECRET: 'whsec_test_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' };

let fail = 0;
const check = (name, cond) => { if (!cond) { console.error('FAIL ' + name); fail++; } };

(async () => {
  const token = await mintUnlockToken(ENV, 'cs_test_a1b2c3', 'Deep Autumn');

  /* --- happy path --- */
  const claims = await readUnlockToken(ENV, token);
  check('a minted token verifies', claims !== null);
  check('season survives the round-trip', claims && claims.season === 'Deep Autumn');
  check('token is bound to the Stripe session', claims && claims.sid === 'cs_test_a1b2c3');
  check('token is url-safe', !/[+/=]/.test(token));

  /* --- forgery --- */
  check('rejects a token signed with a different key', await readUnlockToken(OTHER, token) === null);

  const [payload, sig] = token.split('.');
  const flip = s => s.slice(0, -1) + (s.slice(-1) === 'A' ? 'B' : 'A');
  check('rejects a tampered signature', await readUnlockToken(ENV, payload + '.' + flip(sig)) === null);
  check('rejects a tampered payload', await readUnlockToken(ENV, flip(payload) + '.' + sig) === null);
  check('rejects a stripped signature', await readUnlockToken(ENV, payload) === null);
  check('rejects an empty signature', await readUnlockToken(ENV, payload + '.') === null);

  /* Upgrading yourself to another season must not be possible without the key. */
  const upgraded = Buffer.from(JSON.stringify({ v: 1, sid: 'x', season: 'Bright Winter' }))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  check('rejects a self-authored payload', await readUnlockToken(ENV, upgraded + '.' + sig) === null);

  /* --- junk --- */
  for (const bad of ['', '.', 'x', 'unlocked=1', '1', 'null', 'a.b', 'A'.repeat(4000)]) {
    check(`rejects junk ${JSON.stringify(bad.slice(0, 12))}`, await readUnlockToken(ENV, bad) === null);
  }
  check('rejects a non-string', await readUnlockToken(ENV, { sid: 'x' }) === null);

  /* --- the exact old exploit --- */
  check('the old bare unlock string grants nothing', await readUnlockToken(ENV, 'unlocked=1') === null);

  /* --- key derivation is domain-separated --- */
  check('unlock key is not the raw webhook secret',
    await readUnlockToken({ STRIPE_WEBHOOK_SECRET: 'hue-unlock-v1' }, token) === null);

  /* --- two purchases get different tokens --- */
  const t2 = await mintUnlockToken(ENV, 'cs_test_zzz', 'Deep Autumn');
  check('distinct sessions mint distinct tokens', t2 !== token);
  check('each token still verifies', await readUnlockToken(ENV, t2) !== null);

  if (fail) { console.error(`\n${fail} UNLOCK CHECK(S) FAILED`); process.exit(1); }
  console.log('unlock entitlement OK — token unforgeable without the derived key; bare ?unlocked=1 grants nothing');
})();
