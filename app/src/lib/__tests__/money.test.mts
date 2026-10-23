import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatINR, parseRupees, paiseToInput } from '../money.ts';
import { buildUpiPayUrl } from '../upi.ts';
import { dateRange, parseDisplayDate } from '../dates.ts';

test('parseRupees: integer paise, strict format', () => {
  assert.equal(parseRupees('1200'), 120000);
  assert.equal(parseRupees('₹ 1,200.5'), 120050);
  assert.equal(parseRupees('0.01'), 1);
  assert.equal(parseRupees('2150.75'), 215075);
  assert.equal(parseRupees('0'), null);
  assert.equal(parseRupees('-50'), null);
  assert.equal(parseRupees('1e5'), null);
  assert.equal(parseRupees('12.345'), null);
  assert.equal(parseRupees('abc'), null);
  assert.equal(parseRupees('10000001'), null); // over ₹10 lakh
  assert.equal(parseRupees('1000000'), 100000000);
});

test('formatINR: Indian grouping, no float drift', () => {
  assert.equal(formatINR(2350000), '₹23,500');
  assert.equal(formatINR(12345650), '₹1,23,456.50');
  assert.equal(formatINR(-130000), '−₹1,300');
  assert.equal(formatINR(90000, { signed: true }), '+₹900');
  assert.equal(formatINR(0), '₹0');
  assert.equal(paiseToInput(120050), '1200.50');
  assert.equal(paiseToInput(120000), '1200');
});

test('UPI links: encoded, validated, fixed currency', () => {
  const url = buildUpiPayUrl({ payeeUpi: 'rohan@okhdfc', payeeName: 'Rohan', amountPaise: 110000, note: 'Mangalore settle-up' });
  assert.equal(url, 'upi://pay?pa=rohan%40okhdfc&pn=Rohan&am=1100.00&cu=INR&tn=Mangalore%20settle-up');
  // Injection attempts through name/note are neutralised
  const evil = buildUpiPayUrl({ payeeUpi: 'a.b@ybl', payeeName: 'X&pa=thief@ybl&am=99999', amountPaise: 1, note: 'hi&cu=USD' });
  assert.ok(!evil.includes('thief@ybl'));
  assert.ok(!/[?&]cu=USD/.test(evil));
  assert.equal((evil.match(/&am=/g) ?? []).length, 1);
  assert.ok(evil.includes('am=0.01'));
  assert.throws(() => buildUpiPayUrl({ payeeUpi: 'not-a-upi', payeeName: 'x', amountPaise: 100, note: '' }), /INVALID_UPI_ID/);
  assert.throws(() => buildUpiPayUrl({ payeeUpi: 'a.b@ybl', payeeName: 'x', amountPaise: 1.5, note: '' }), /INVALID_AMOUNT/);
  assert.throws(() => buildUpiPayUrl({ payeeUpi: 'a.b@ybl', payeeName: 'x', amountPaise: -100, note: '' }), /INVALID_AMOUNT/);
});

test('dates', () => {
  assert.equal(parseDisplayDate('14/11/2026'), '2026-11-14');
  assert.equal(parseDisplayDate('1-2-2027'), '2027-02-01');
  assert.equal(parseDisplayDate('29/02/2027'), null);
  assert.equal(parseDisplayDate('31/04/2026'), null);
  assert.equal(parseDisplayDate('2026-11-14'), null);
  assert.equal(dateRange('2026-11-14', '2026-11-17'), '14–17 Nov');
  assert.equal(dateRange('2026-12-29', '2027-01-02'), '29 Dec – 2 Jan');
  assert.equal(dateRange(null, null), 'Dates not set');
});
