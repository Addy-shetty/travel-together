// Run with: npm test  (Node's built-in test runner; no extra dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeIncomingPath } from '../deepLinks.ts';
import { normalizeIndianMobile, formatIndianMobile, isValidUpiId, isValidOtp, cleanName, normalizeUpiRef } from '../validation.ts';

test('deep links: valid invite links are rebuilt to a clean path', () => {
  assert.equal(sanitizeIncomingPath('traveltogether://join/MAN-HHNK'), '/join/MAN-HHNK');
  assert.equal(sanitizeIncomingPath('traveltogether://join/man-hhnk'), '/join/MAN-HHNK');
  assert.equal(sanitizeIncomingPath('https://traveltogether.app/join/MNG-4K2Q?utm=x'), '/join/MNG-4K2Q');
  assert.equal(sanitizeIncomingPath('/join/MNG-4K2Q'), '/join/MNG-4K2Q');
});

test('deep links: percent-encoding (the decode-uri-component DoS vector) is rejected', () => {
  const attack = 'traveltogether://join/' + '%'.repeat(5) + '%C0%80'.repeat(30);
  assert.equal(sanitizeIncomingPath(attack), '/');
  assert.equal(sanitizeIncomingPath('/join/%4D%41%4E-HHNK'), '/');
});

test('deep links: other hosts, schemes, paths and junk go home', () => {
  assert.equal(sanitizeIncomingPath('https://evil.example/join/MAN-HHNK'), '/');
  assert.equal(sanitizeIncomingPath('javascript://join/MAN-HHNK'), '/');
  assert.equal(sanitizeIncomingPath('traveltogether://settle/123'), '/');
  assert.equal(sanitizeIncomingPath('/join/MAN-HHNK/../../admin'), '/');
  assert.equal(sanitizeIncomingPath('/join/DROP TABLE'), '/');
  assert.equal(sanitizeIncomingPath('/join/MAN-HH01'), '/'); // 0/1 are not in the code alphabet
  assert.equal(sanitizeIncomingPath('a'.repeat(300)), '/');
  assert.equal(sanitizeIncomingPath('\\\\server\\share'), '/');
  assert.equal(sanitizeIncomingPath(undefined), '/');
  assert.equal(sanitizeIncomingPath(''), '/');
});

test('phone: only Indian mobiles are accepted (limits SMS pumping)', () => {
  assert.equal(normalizeIndianMobile('98765 43210'), '+919876543210');
  assert.equal(normalizeIndianMobile('+91 98765-43210'), '+919876543210');
  assert.equal(normalizeIndianMobile('09876543210'), '+919876543210');
  assert.equal(normalizeIndianMobile('5876543210'), null); // not a mobile prefix
  assert.equal(normalizeIndianMobile('+1 415 555 0100'), null);
  assert.equal(normalizeIndianMobile('+44 7700 900123'), null);
  assert.equal(normalizeIndianMobile('987654321'), null);
  assert.equal(formatIndianMobile('+919876543210'), '+91 98765 43210');
});

test('UPI IDs, OTPs and names', () => {
  assert.ok(isValidUpiId('harshith@okaxis'));
  assert.ok(isValidUpiId('anika.s-1@ybl'));
  assert.ok(!isValidUpiId('harshith'));
  assert.ok(!isValidUpiId('a@b'));
  assert.ok(!isValidUpiId('bad id@okaxis'));
  assert.ok(isValidOtp('482701'));
  assert.ok(!isValidOtp('48270'));
  assert.ok(!isValidOtp('48270a'));
  assert.equal(cleanName('  Harshith   M  S '), 'Harshith M S');
  assert.equal(cleanName('x'.repeat(200)).length, 80);
});

test('UPI reference numbers', () => {
  assert.equal(normalizeUpiRef('6281 4410 3392'), '628144103392');
  assert.equal(normalizeUpiRef(''), '');
  assert.equal(normalizeUpiRef('T2510141225'), 'T2510141225');
  assert.equal(normalizeUpiRef('12345'), null);
  assert.equal(normalizeUpiRef('<script>'), null);
  assert.equal(normalizeUpiRef('a'.repeat(40)), null);
});
