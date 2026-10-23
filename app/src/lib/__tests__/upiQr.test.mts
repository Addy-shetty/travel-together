import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUpiQr } from '../upiQr.ts';
import { buildUpiPayUrl } from '../upi.ts';

const ok = (s: string) => {
  const r = parseUpiQr(s);
  assert.ok(r.ok, `expected ${s} to parse`);
  return r.value;
};
const bad = (s: unknown, reason: 'NOT_UPI' | 'INVALID') => assert.deepEqual(parseUpiQr(s), { ok: false, reason });

test('shop QR: merchant fields kept, amount open', () => {
  const q = ok('upi://pay?pa=boatclub@ybl&pn=Panambur%20Boat%20Club&mc=7999&tr=TXN123&cu=INR');
  assert.equal(q.payeeUpi, 'boatclub@ybl');
  assert.equal(q.payeeName, 'Panambur Boat Club');
  assert.equal(q.amountPaise, null);
  assert.equal(q.isMerchant, true);
  assert.deepEqual(q.passthrough, [['mc', '7999'], ['tr', 'TXN123']]);
  const url = buildUpiPayUrl({ payeeUpi: q.payeeUpi, payeeName: q.payeeName, amountPaise: 120000, note: 'Boat ride', extra: q.passthrough });
  assert.equal(url, 'upi://pay?pa=boatclub%40ybl&pn=Panambur%20Boat%20Club&am=1200.00&cu=INR&tn=Boat%20ride&mc=7999&tr=TXN123');
});

test('personal QR with fixed amount; plus-encoded spaces', () => {
  const q = ok('UPI://PAY?pa=rohan@okhdfc&pn=Rohan+K&am=450.50');
  assert.equal(q.amountPaise, 45050);
  assert.equal(q.payeeName, 'Rohan K');
  assert.equal(q.isMerchant, false);
  assert.equal(q.signed, false);
});

test('signed QR is flagged so it is passed on unchanged', () => {
  const q = ok('upi://pay?pa=shop@icici&pn=Shop&am=100&mc=5411&sign=MEUCIQDabc123');
  assert.equal(q.signed, true);
  assert.equal(q.amountPaise, 10000);
});

test('not a UPI payment: never opened', () => {
  bad('https://evil.example/pay?pa=a@ybl', 'NOT_UPI');
  bad('intent://pay#Intent;scheme=upi;end', 'NOT_UPI');
  bad('javascript:alert(1)', 'NOT_UPI');
  bad('traveltogether://join/MAN-HHNK', 'NOT_UPI');
  bad('upi://mandate?pa=a@ybl', 'NOT_UPI'); // autopay mandates are not payments
  bad('Hello world', 'NOT_UPI');
});

test('smuggling and junk are rejected', () => {
  bad('upi://pay?pa=shop@ybl&pa=thief@ybl', 'INVALID');
  bad('upi://pay?pa=shop@ybl&am=100&am=1', 'INVALID');
  bad('upi://pay?pa=shop@ybl&cu=USD', 'INVALID');
  bad('upi://pay?pa=shop@ybl&am=-50', 'INVALID');
  bad('upi://pay?pa=shop@ybl&am=1e9', 'INVALID');
  bad('upi://pay?pa=shop@ybl&am=99999999', 'INVALID'); // over ₹10 lakh
  bad('upi://pay?pa=not-a-vpa', 'INVALID');
  bad('upi://pay?pn=NoPayee', 'INVALID');
  bad('upi://pay?pa=shop@ybl&mc=ABCD', 'INVALID');
  bad('upi://pay?pa=shop%E0%A4@ybl', 'INVALID'); // broken percent-encoding
  bad('upi://pay?pa=' + 'a'.repeat(1100) + '@ybl', 'INVALID');
  bad(undefined, 'INVALID');
  bad(42, 'INVALID');
});

test('phishing url parameter and unknown fields are dropped; names cleaned', () => {
  const q = ok('upi://pay?pa=shop@ybl&pn=%3Cb%3EShop%0A%3C/b%3E&url=https://evil.example&foo=bar&tid=T1');
  assert.equal(q.payeeName, 'bShop/b');
  assert.deepEqual(q.passthrough, [['tid', 'T1']]);
  const url = buildUpiPayUrl({ payeeUpi: q.payeeUpi, payeeName: q.payeeName, amountPaise: 100, note: '', extra: [...q.passthrough, ['url', 'https://evil.example']] });
  assert.ok(!url.includes('evil'));
});
