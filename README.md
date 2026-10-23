# Travel-Together backend (Supabase)

Group-trip money tracking: a shared pool collected by the trip Head, expenses paid from
the pool or by anyone, fair splits, and a fewest-payments settle-up at the end.

```
supabase/
  migrations/
    20261013100000_core_schema.sql   tables, enums, profile auto-creation
    20261013100100_functions.sql     all business logic (RPC functions)
    20261013100200_security.sql      row level security, grants, storage buckets, realtime
    20261013100300_indexes.sql       foreign-key indexes (performance advisor)
  seed.sql                           local demo: the Mangalore trip from the wireframes
  tests/database/                    pgTAP tests (34), replay Mangalore end to end
```

## Key rules

- **Money is in paise** (`bigint`): ₹4,000 is `400000`. Format on the client.
- **Read tables directly, write through functions.** Clients `select` from tables (row level security
  limits rows to trips you belong to) and call `supabase.rpc(...)` for every change. Direct
  inserts and updates on money tables are rejected.
- **The wallet is a ledger, not a stored balance.** Money moves person to person over UPI;
  the app records each payment. Holding users' money would need an RBI PPI licence or a licensed partner.
- **Balances:** `net = pool contributed + paid directly − fair share − pool cash still held (Head only)`.
  Positive means the person gets money back; negative means they owe. Nets always sum to zero, so
  leftover pool money returns to people through the settlement and needs no separate refunds.
- **Only `confirmed` expenses count.** An expense paid through the UPI app starts as `pending` and becomes
  `confirmed` (or `rejected`) when the user confirms the payment.
- **The Head** creates the trip, confirms pool contributions and ends the trip. A settlement payment counts
  once the **receiver** confirms it, and the trip becomes `settled` when every payment is confirmed.

## Screen → backend

| Screen | Read | Call |
|---|---|---|
| 1.2–1.3 Login / OTP | | `supabase.auth.signInWithOtp({ phone })`, `verifyOtp` (profile row is created automatically) |
| 1.4 Profile setup, 1.8 Profile | `profiles` (own row) | `update profiles set full_name, upi_id, … where id = me`; avatar upload to `avatars/<user_id>/…` |
| 1.5–1.6 Home, 2.1 Trips | | `my_overview()` → wallet balance, owe / get back, trips, stats, unread count |
| 1.7 Wallet | `wallet_transactions` | `record_wallet_topup(amount, upi_ref, upi_app)`, then `confirm_wallet_transaction(id, success)` |
| 2.2 Create trip | | `create_trip(name, start, end, money_mode, pool_amount_per_person, default_split)` (needs a UPI ID unless `each_pays`) |
| 2.3 Invite & pool | `trip_members`, `pool_contributions` | share `invite_code`; `confirm_pool_contribution(id, received)`; `send_reminder(trip, user, 'pool')` |
| 2.4 Join trip | | `get_trip_invite(code)` to preview, `join_trip(code)` to join |
| 2.5 Pay my share | | after the UPI app returns: `record_pool_contribution(trip, amount, upi_ref, upi_app)` |
| 2.6 Dashboard | `expenses`, `expense_payers` | `trip_summary(trip)` |
| 3.1–3.2 Add expense, split options | | `create_expense(...)` (payers and splits as JSON; see below) |
| 3.3 Pay via UPI | | `create_expense(..., p_status => 'pending')`, open UPI app, then `confirm_expense_payment(id, success, upi_ref)` |
| 3.4 Expense detail | `expenses`, `expense_splits`, `expense_events`, `expense_comments` | `update_expense(...)`, `delete_expense(id)`; insert into `expense_comments(expense_id, body)` |
| 3.5 Balances | | `trip_balances(trip)` |
| 3.6 Notifications | `notifications` | `mark_notifications_read(ids or null)`; "Needs action" = `action_required` |
| 4.1 End trip | | `end_trip_checklist(trip)`, then `end_trip(trip)` (Head; `reopen_trip` before any payment) |
| 4.2 Summary | | `trip_summary(trip)` → totals, categories, by day, members, pool |
| 4.3 Settle up | `settlements` | payer: `mark_settlement_paid(id, upi_ref)`; receiver: `confirm_settlement(id, received)`; `send_reminder(trip, user, 'settlement')` |
| 4.4 Trip settled | | `trip_summary(trip)` |

`create_expense` payers and splits (amounts in paise):

```js
await supabase.rpc('create_expense', {
  p_trip_id: tripId,
  p_description: 'Dinner',
  p_amount: 250000,
  p_category: 'food',
  p_payers: [{ user_id: rohanId, amount: 250000 }],      // user_id null = paid from the pool; omit = I paid
  p_split_method: 'shares',                               // 'equal' | 'exact' | 'shares'; omit = trip default
  p_splits: [                                             // omit = everyone, equally
    { user_id: harshithId, shares: 1 }, { user_id: rohanId, shares: 2 },
    { user_id: kiranId, shares: 0 },                      // 0 shares = left out
  ],
  p_place_name: 'Panambur Beach', p_latitude: 12.93, p_longitude: 74.80,
})
```

Equal splits give leftover paise to the first people in the list; share splits give them to the largest
fractional parts. Splits always add up exactly to the amount.

**Errors:** functions raise a code as the error message, e.g. `NOT_TRIP_MEMBER`, `HEAD_ONLY`, `TRIP_NOT_ACTIVE`,
`UPI_ID_REQUIRED`, `PAYERS_TOTAL_MISMATCH`, `SPLITS_TOTAL_MISMATCH`, `UNRESOLVED_ITEMS`, `REMINDER_RATE_LIMITED`,
`INVITE_NOT_FOUND`, `MEMBER_HAS_ACTIVITY`. Map them to friendly text in the app.

**Realtime:** subscribe to `expenses`, `pool_contributions`, `settlements`, `trips`, `trip_members`,
`expense_comments` (filter `trip_id=eq.<id>`) and `notifications` (filter `user_id=eq.<me>`).

**Storage:** `avatars` (public, `<user_id>/<file>`), `receipts` (private, `<trip_id>/<file>`, trip members only;
save the path in `p_receipt_path`).

## Run locally

Needs Docker and the Supabase CLI.

```bash
supabase start          # API http://127.0.0.1:54321, Studio http://127.0.0.1:54323
supabase db reset       # re-apply migrations and the demo seed
supabase test db        # run the 34 tests
```

The seed creates the Mangalore demo (Harshith is Head; phones `+91 98765 4321x`). Local phone login also needs an
SMS provider configured in `config.toml`, so for local app testing sign up with email and password instead.

## Deploy to your Supabase project

```bash
supabase login                              # opens the browser; the token stays on this machine
supabase link --project-ref <project-ref>   # asks for the database password
supabase db push                            # applies the migrations (not the demo seed)
```

Then in the Supabase dashboard:
1. **Auth → Providers → Phone:** turn on, and connect an SMS provider (Twilio, Twilio Verify, MessageBird, Textlocal or Vonage).
2. **Auth → Providers → Google:** optional, for "Continue with Google".
3. **Auth → URL configuration:** add the app's deep-link scheme for redirects.

## Mobile app (`app/`)

Expo SDK 57 + Expo Router, TypeScript. Security process: [docs/security/SSDLC.md](docs/security/SSDLC.md),
threat model: [docs/security/threat-model.md](docs/security/threat-model.md).

```bash
cd app
cp .env.example .env.local   # project URL + PUBLISHABLE key only
npx expo start               # scan the QR code with Expo Go
npm run check                # typecheck + lint + unit tests + dependency audit + secret scan
```

To log in without spending SMS credits, add test numbers in Supabase → Authentication → Sign In / Providers →
Phone → "Test phone numbers and OTPs".

## Not built yet

- Push notifications: rows land in `notifications` and device tokens in `push_tokens`; an edge function that sends them through Expo or FCM is the next step.
- UPI ID name check (`profiles.upi_name`): needs a payments provider's VPA-validation API.
- Trip summary PDF export.
- Receipt OCR.
