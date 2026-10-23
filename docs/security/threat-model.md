# Threat model

STRIDE per feature. Status: ✅ mitigated and verified · 🟡 mitigated, needs action outside the code · ⚠️ accepted risk.

## System overview

```
 Phone (Expo app, untrusted) ──HTTPS──▶ Supabase (Auth · PostgREST · Storage · Realtime) ──▶ Postgres (RLS + RPCs)
        │                                     │
        └── UPI app (GPay/PhonePe) ◀── intent  └── Twilio (OTP SMS)
```

**Trust boundaries:** (1) device ↔ Supabase API, (2) app ↔ UPI apps (payment results come back from another app and
can't be trusted on their own), (3) deep links from the outside world into the app, (4) Supabase ↔ SMS provider.

**Assets:** session tokens; phone numbers; UPI IDs; trip money records (contributions, expenses, settlements);
receipts and locations; SMS credit.

**Actors:** anonymous internet user; signed-in user who is not in the trip; trip member; trip Head; malicious app
or link on the same phone.

---

## F0 · Backend data and money logic (reviewed after build)

| STRIDE | Threat | Mitigation | Status |
|---|---|---|---|
| S | Calling the API as someone else | Supabase JWT; every RPC uses `auth.uid()`, never a user id from the client | ✅ tests |
| T | Editing expenses/settlements/trip status directly via REST | No INSERT/UPDATE grants on money tables; writes only through RPCs | ✅ test "members cannot write expenses directly", API smoke test |
| T | Splits that don't add up, payer not in trip | `write_expense_lines` checks totals, membership, duplicates | ✅ tests |
| T | Member confirms their own pool payment | `confirm_pool_contribution` is Head-only; settlements confirmed only by receiver | ✅ tests |
| R | "I never changed that expense" | `expense_events` history with actor and diff | ✅ test |
| I | Reading other trips' data | RLS: members only; profiles visible only to trip mates | ✅ tests |
| I | SECURITY DEFINER search-path hijack | Every function `set search_path = ''`, fully qualified names | ✅ db lint clean |
| D | Reminder spam | `send_reminder` limited to one per person, kind and trip every 6 h | ✅ |
| E | Member ends trip / changes pool | `require_head`; column grants limit profile updates (phone not updatable) | ✅ tests + smoke |
| E | Ledger forgery by "confirming" a fake UPI payment | Contributions and settlements count only after the **receiver** confirms | ✅ design |

---

## F1 · Sign-in and onboarding (screens 1.1–1.5)

**Flow:** Splash → enter +91 phone → Supabase sends OTP via Twilio → verify OTP → session saved → profile setup
(name, UPI ID) → Home. Next launch: session restored from SecureStore → Home.

| STRIDE | Threat | Mitigation | Status |
|---|---|---|---|
| S | OTP brute force | Supabase limits verify attempts and OTP expiry; app disables "Verify" during a request | ✅ built-in · configure limits 🟡 |
| S | Session theft from a lost/rooted phone or backup | Session in SecureStore (Keychain `WHEN_UNLOCKED_THIS_DEVICE_ONLY` / Android Keystore); Android `allowBackup: false` | ✅ code |
| T | Changing someone else's profile or own phone number | RLS `id = auth.uid()` + column grants (no `phone`) | ✅ smoke test |
| T | Invalid UPI ID stored | Regex check in app and DB `CHECK` constraint | ✅ |
| R | Disputed sign-in | Supabase auth audit log | ✅ built-in |
| I | Tokens or phone numbers in logs | No logging of auth data; phone masked in UI | ✅ code review |
| I | Account enumeration via "user not found" | OTP sign-in creates or signs in the same way, so responses don't reveal accounts | ✅ by design |
| D | **SMS pumping / toll fraud** (bots requesting OTPs to burn the ~100 Twilio credits or premium numbers) | App accepts only Indian mobiles (`+91[6-9]xxxxxxxxx`) and has a 60 s resend cooldown. **Server side:** Twilio Geo Permissions = India only; Supabase auth rate limit for SMS; enable CAPTCHA (Turnstile/hCaptcha) on sign-in before public launch | 🟡 Twilio + Supabase settings |
| D | Malicious deep link freezes the app (`decode-uri-component` GHSA-vcc3-ghjq-m6fr in expo-router's URL parser) | `+native-intent` guard rejects links that are too long, malformed or not our scheme/paths before the router parses them | ✅ code · ⚠️ upgrade to SDK 58 when stable |
| E | Skipping onboarding to act without a UPI ID | Server: `create_trip` requires UPI ID (`UPI_ID_REQUIRED`); app routes by `profiles.onboarded` | ✅ |

**Settings to do in dashboards (owner: project admin):**
1. Twilio → Messaging → Geo permissions: allow **India only**.
2. Supabase → Authentication → Rate limits: SMS sent per hour as low as works for you (e.g. 30).
3. Supabase → Authentication → Bot and abuse protection: enable CAPTCHA before inviting people outside your friends.
4. Supabase → Authentication → Phone: OTP expiry 300 s, length 6.

---

## F2–F5 · Trips, expenses, settle-up, wallet, profile, notifications (screens 1.6–4.4)

**Flows:** create trip → share invite code/link → friend previews and joins → pays pool share through a UPI app →
Head confirms. Members add expenses (pool / me / someone; equal, exact or shares), optionally paying through a UPI
app. The Head ends the trip; payers pay through UPI and receivers confirm. Notifications drive the confirmations.

**New trust boundary:** the app hands a payment to a UPI app (GPay/PhonePe/…) and gets *nothing trustworthy back*:
the UPI app's result can be faked or misreported, and the app cannot see the bank.

| STRIDE | Threat | Mitigation | Status |
|---|---|---|---|
| S | Paying the wrong person: a member puts someone else's UPI ID in their profile, or a payee is mistyped | Pay sheet always shows the receiver's **name and UPI ID** before opening the UPI app; payee UPI IDs must pass the same regex as the DB; settlement and pool payees come from the server, not from user input | ✅ code |
| T | Tampered UPI link (amount, payee or note injected through names) | `buildUpiPayUrl` validates the payee, encodes every parameter, fixes the currency to INR, formats amounts from integer paise, strips the payee name and note to a safe character set | ✅ unit tests |
| T | "I paid" claimed after a failed or fake UPI result | A payment never counts on the payer's word: pool contributions need the Head to confirm, settlements need the receiver to confirm, and pending expenses block ending the trip | ✅ server (F0) |
| T | Wrong amounts from parsing (floats, commas, "1e5") | `parseRupees` turns text into integer paise with a strict pattern; maximum ₹10 lakh per entry; the server re-checks totals | ✅ unit tests |
| R | "I never added/edited that" | Expense history (`expense_events`) shown on the detail screen; comments are attributed | ✅ |
| I | Invite-code guessing to see a trip's members and the Head's UPI ID | Codes are 3 letters + 4 of 32 characters (~1M per prefix); preview requires sign-in; **server-side rate limiting of `get_trip_invite`** and the Head regenerating a leaked code are not built yet | 🟡 backlog |
| I | Realtime updates leaking other trips' rows | Supabase Realtime applies RLS to `postgres_changes`; subscriptions are filtered by `trip_id` | ✅ |
| I | Sensitive screens visible in the app switcher or screenshots | Not blocked yet (would need `expo-screen-capture`) | ⚠️ accepted for now |
| D | Realtime event storms causing endless refetches | Refetches are debounced (400 ms) per screen | ✅ code |
| D | Reminder spam from the "Remind" buttons | Server limit: one per person, kind and trip every 6 h | ✅ server |
| E | Member using Head-only actions (confirm pool money, end/reopen trip, edit trip) | Buttons hidden for non-Heads, and the server rejects them anyway (`HEAD_ONLY`) | ✅ server tests |
| E | Editing or deleting someone else's expense | Only the creator or Head may; the server enforces it (`NOT_ALLOWED`) | ✅ server |
| E | Deep link into a trip you are not in | Only `/join/<code>` is accepted from outside (sanitizer); every trip screen's data is RLS-filtered | ✅ unit tests |

**Deliberately not built in this round (each will get its own review):** receipt photos (camera + storage upload),
GPS place tagging, QR codes, wallet top-ups (need a licensed payment partner), push notifications.

---

## F6 · Scan & Pay (any UPI QR → pay via UPI app → saved as a trip expense)

**Flow:** camera scans a QR → `parseUpiQr` validates it → confirm sheet (payee name, UPI ID, merchant or person,
amount, trip, split) → expense saved as *pending* with payee details → UPI app opens → payer confirms the result
(or pays manually and confirms) → expense becomes confirmed and visible to the trip.

**New trust boundary:** the QR content. Anyone can print one (fake stickers over a shop's real QR).

| STRIDE | Threat | Mitigation | Status |
|---|---|---|---|
| S | Fake QR sticker sends money to a fraudster | The confirm sheet shows the payee **name and full UPI ID** (and whether it's a registered merchant) before any payment; nothing pays automatically on scan; the UPI app shows its own verified payee name too | ✅ code (user must check) |
| T | QR that isn't a UPI payment: `http(s)://` phishing links, `intent://`, `javascript:`, app deep links | Only `upi://pay?…` is accepted; everything else is rejected with a message and **never opened** | ✅ unit tests |
| T | Parameter smuggling: duplicate `pa`/`am`, `cu` other than INR, huge or negative amounts, a `url=` parameter pointing to a phishing site | Strict parser: allow-listed parameters only, duplicates rejected, INR only, amount through the paise parser and the ₹10 lakh cap; `url` and unknown parameters dropped | ✅ unit tests |
| T | Signed merchant QRs (`sign=`) broken or altered | Signed QRs are passed to the UPI app exactly as scanned, after validation, with the amount locked | ✅ code |
| R | "I paid that shop ₹2,000" without proof | Expense stores payee UPI ID, name and the UPI reference if entered; history and comments visible to the trip; it stays *pending* until the payer confirms | 🟡 a confirmed bank reference needs a payment partner |
| I | Camera images leaving the phone | Frames are decoded on the device and never stored or uploaded; only the parsed text is used | ✅ design |
| I | Camera used without consent | Camera permission is requested only when the scanner opens, with a clear reason; denial shows how to enable it | ✅ code |
| D | Oversized or malformed QR freezes the parser | 1 KB input cap; no decoding of percent-escapes beyond `decodeURIComponent` inside a try/catch | ✅ unit tests |
| E | Paying from the pool without being the Head | Only the Head can choose "Trip pool" as payer here; the server re-checks every payer anyway | ✅ code + server |

**UPI app limits (confirmed in testing):** GPay refuses payments to *personal* UPI IDs that are started from
another app, at any amount (₹5 failed). So every payment to a person (person QRs, pool shares, settle-up) defaults to
**"Pay in your UPI app"**: copy the UPI ID, pay inside GPay/PhonePe, return and confirm with an optional UPI
reference (validated: 6–35 letters/digits). Merchant QRs still open the UPI app directly, with the manual route as a
fallback. The clipboard only ever receives the payee's UPI ID or the amount, never tokens or personal data.

| STRIDE | Threat | Mitigation | Status |
|---|---|---|---|
| R | "I've paid" without paying (manual route) | Pool shares and settlements still need the receiver/Head to confirm; Scan & Pay expenses carry the payee and optional UPI reference, visible to the whole trip | ✅ server + 🟡 self-attested for shop payments |
| T | Junk or script in the UPI reference field | `normalizeUpiRef` allows only 6–35 letters/digits | ✅ unit tests |

---

## Accepted risks

Tracked in `app/security/accepted-advisories.json` with review dates; the security check fails once a date passes.

| Advisory | Package (path) | Why accepted | Review by |
|---|---|---|---|
| GHSA-vcc3-ghjq-m6fr | decode-uri-component 0.2.2 (expo-router → query-string) | Fix needs expo-router 58 (SDK 58 is pre-release). Compensated by the `+native-intent` deep-link guard | 2026-12-31 |
| GHSA-vfj7-8cjw-p6xm | braces 3.0.3 (Metro bundler) | Build-time only, not shipped in the app; glob patterns are ours | 2026-12-31 |
| GHSA-86w9-cpqp-85rv | node-forge 1.4.0 (Expo CLI code signing) | Build-time CLI only; we don't verify third-party signatures with it | 2026-12-31 |
| GHSA-w5hq-g745-h8pq | uuid 7.0.3 (xcode, iOS prebuild) | Build-time only; vulnerable `buf` argument path not used | 2026-12-31 |
