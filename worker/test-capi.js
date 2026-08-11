#!/usr/bin/env node
/* test-capi — proves the Conversions API sender builds a correct, deduping
 * Purchase payload before it is ever pointed at a real pixel.
 *
 * The thing that actually costs money here is DEDUPLICATION. index.html fires
 * the browser Purchase with {eventID: sid}; if the server sends a different
 * event_id, Meta counts every sale twice, the ad set optimises on inflated
 * conversions, and the reported cost per purchase halves. So the id is
 * asserted, not eyeballed.
 *
 * The email hash is cross-checked against node:crypto, which is a genuinely
 * different implementation from the worker's WebCrypto path, so a broken
 * normalisation cannot pass by agreeing with itself.
 *
 * Usage: node worker/test-capi.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeCrypto = require('crypto');

const src = fs.readFileSync(path.join(__dirname, 'report-mailer.js'), 'utf8');

/* pull the sender and its helpers out of the built worker */
const pick = re => { const m = src.match(re); if (!m) throw new Error('not found: ' + re); return m[0]; };
const code = [
  pick(/const CAPI_VERSION = '[^']+';/),
  pick(/async function sha256Hex\([\s\S]*?\n\}/),
  pick(/async function hashEmail\([\s\S]*?\n\}/),
  pick(/async function sendCAPI\([\s\S]*?\n\}/),
  pick(/const SITE_ORIGIN = '[^']+';/),
].join('\n');

let captured = null;
const ctx = {
  crypto: nodeCrypto.webcrypto,
  TextEncoder,
  console,
  Date,
  Math,
  fetch: async (url, opts) => {
    captured = { url, body: JSON.parse(opts.body) };
    return { ok: true, status: 200, text: async () => '{"events_received":1}' };
  },
};
vm.createContext(ctx);
vm.runInContext(code, ctx);

const ENV = {
  META_PIXEL_ID: '928398310306386',
  META_CAPI_TOKEN: 'TEST_TOKEN_NOT_REAL',
};

const fails = [];
const check = (name, cond, detail) => {
  if (cond) console.log('  ok   ' + name);
  else { console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); fails.push(name); }
};

(async () => {
  const SID = 'cs_live_a1b2c3d4e5';
  const EMAIL = '  SamPetersen007@Gmail.com  ';   // deliberately messy

  console.log('sendCAPI, configured:');
  const res = await vm.runInContext('sendCAPI', ctx)(ENV, {
    name: 'Purchase', id: SID, email: EMAIL, value: 29.99, currency: 'USD',
    time: 1786400000,
  });

  check('returns ok', res.ok === true, JSON.stringify(res));
  check('posts to the pixel events edge',
    /graph\.facebook\.com\/v\d+\.\d+\/928398310306386\/events\?access_token=/.test(captured.url),
    captured.url.split('?')[0]);
  check('token is sent in the query, not the body',
    captured.url.includes('access_token=TEST_TOKEN_NOT_REAL') &&
    !JSON.stringify(captured.body).includes('TEST_TOKEN_NOT_REAL'));

  const d = captured.body.data[0];
  check('event_name is Purchase', d.event_name === 'Purchase', d.event_name);
  check('event_id is the Stripe session id (dedup key)', d.event_id === SID, d.event_id);
  check('action_source is website', d.action_source === 'website', d.action_source);
  check('event_time passed through', d.event_time === 1786400000, String(d.event_time));
  check('value and currency present', d.custom_data.value === 29.99 && d.custom_data.currency === 'USD',
    JSON.stringify(d.custom_data));

  /* independent hash: normalise then SHA-256 with node:crypto */
  const want = nodeCrypto.createHash('sha256').update('sampetersen007@gmail.com').digest('hex');
  check('email is trimmed, lowercased and SHA-256 hashed',
    Array.isArray(d.user_data.em) && d.user_data.em[0] === want,
    d.user_data.em && d.user_data.em[0]);
  check('raw email never leaves the worker',
    !JSON.stringify(captured.body).toLowerCase().includes('sampetersen007@gmail.com'));
  check('no test_event_code when unset', d.test_event_code === undefined && captured.body.test_event_code === undefined);

  console.log('\nsendCAPI, test_event_code set:');
  await vm.runInContext('sendCAPI', ctx)({ ...ENV, META_TEST_EVENT_CODE: 'TEST12345' },
    { name: 'Purchase', id: SID, email: EMAIL, value: 1 });
  check('test_event_code forwarded', captured.body.test_event_code === 'TEST12345');

  console.log('\nrefuses to send without configuration or identity:');
  const noCfg = await vm.runInContext('sendCAPI', ctx)({}, { name: 'Purchase', id: SID, email: EMAIL });
  check('no pixel/token -> capi-not-configured', noCfg.reason === 'capi-not-configured', JSON.stringify(noCfg));
  const noId = await vm.runInContext('sendCAPI', ctx)(ENV, { name: 'Purchase', id: SID });
  check('no identifier -> no-identifier', noId.reason === 'no-identifier', JSON.stringify(noId));

  console.log();
  if (fails.length) { console.log(`${fails.length} FAILED: ` + fails.join(', ')); process.exit(1); }
  console.log('CAPI payload OK — dedups on the Stripe session id, email hashed, token not in body');
})();
