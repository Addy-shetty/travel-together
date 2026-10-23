-- Travel-Together: core schema
-- All money is stored as integer paise (₹1 = 100) in bigint columns, so splits never
-- lose fractions of a rupee to floating point.

create schema if not exists private;

-- ───────────────────────────── Enums ─────────────────────────────

create type public.money_mode        as enum ('pool', 'each_pays', 'both');
create type public.trip_status       as enum ('active', 'ended', 'settled');
create type public.member_role       as enum ('head', 'member');
create type public.expense_category  as enum ('food', 'travel', 'stay', 'activities', 'shopping', 'other');
create type public.split_method      as enum ('equal', 'exact', 'shares');
create type public.payment_status    as enum ('pending', 'confirmed', 'rejected');
create type public.settlement_status as enum ('pending', 'paid', 'confirmed');
create type public.wallet_tx_type    as enum ('topup', 'withdrawal', 'pool_contribution', 'settlement_paid', 'settlement_received', 'adjustment');

-- ───────────────────────────── Helpers ─────────────────────────────

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ───────────────────────────── Profiles ─────────────────────────────
-- One row per auth user (screens 1.4 Profile setup, 1.8 Profile & settings).

create table public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  full_name              text not null default '' check (char_length(full_name) <= 80),
  phone                  text unique,
  email                  text,
  avatar_url             text,
  upi_id                 text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9]{1,63}$'),
  upi_name               text,
  preferred_upi_app      text check (preferred_upi_app is null or preferred_upi_app in ('gpay', 'phonepe', 'paytm', 'bhim', 'other')),
  default_split          public.split_method not null default 'equal',
  notifications_enabled  boolean not null default true,
  location_enabled       boolean not null default true,
  language               text not null default 'en',
  onboarded              boolean generated always as (full_name <> '' and upi_id is not null) stored,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Create a profile automatically when someone signs up (phone OTP, Google or email).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone, email, full_name, avatar_url)
  values (
    new.id,
    nullif(new.phone, ''),
    nullif(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Device tokens for push notifications (Expo / FCM), used by a later edge function.
create table public.push_tokens (
  token       text primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- ───────────────────────────── Trips ─────────────────────────────
-- Screens 2.1–2.6. The creator is the Head; the pool is collected to the Head's UPI ID.

create table public.trips (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null check (char_length(btrim(name)) between 1 and 60),
  start_date              date,
  end_date                date,
  head_id                 uuid not null references public.profiles (id),
  money_mode              public.money_mode not null default 'both',
  pool_amount_per_person  bigint not null default 0 check (pool_amount_per_person >= 0),
  pool_upi_id             text,
  default_split           public.split_method not null default 'equal',
  invite_code             text not null unique,
  status                  public.trip_status not null default 'active',
  ended_at                timestamptz,
  settled_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create trigger trips_updated_at before update on public.trips
  for each row execute function private.set_updated_at();

create table public.trip_members (
  trip_id    uuid not null references public.trips (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null default 'member',
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (trip_id, user_id)
);
create unique index trip_members_one_head on public.trip_members (trip_id) where role = 'head';
create index trip_members_user_idx on public.trip_members (user_id);

-- ───────────────────────────── Pool contributions ─────────────────────────────
-- A member says "I paid my share via UPI" (pending); the Head confirms receipt.

create table public.pool_contributions (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null,
  user_id       uuid not null,
  amount        bigint not null check (amount > 0),
  status        public.payment_status not null default 'pending',
  upi_ref       text,
  upi_app       text,
  note          text,
  confirmed_by  uuid references public.profiles (id),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  foreign key (trip_id, user_id) references public.trip_members (trip_id, user_id) on delete cascade
);
create index pool_contributions_trip_idx on public.pool_contributions (trip_id);

-- ───────────────────────────── Expenses ─────────────────────────────
-- Screens 3.1–3.4. Status 'pending' = UPI payment not confirmed yet; only
-- 'confirmed' expenses count towards balances.

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  description   text not null check (char_length(btrim(description)) between 1 and 100),
  category      public.expense_category not null default 'other',
  amount        bigint not null check (amount > 0),
  split_method  public.split_method not null default 'equal',
  status        public.payment_status not null default 'confirmed',
  place_name    text,
  latitude      double precision check (latitude between -90 and 90),
  longitude     double precision check (longitude between -180 and 180),
  receipt_path  text,
  upi_ref       text,
  payee_name    text,
  payee_upi     text,
  spent_at      timestamptz not null default now(),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index expenses_trip_idx on public.expenses (trip_id, spent_at desc) where deleted_at is null;

create trigger expenses_updated_at before update on public.expenses
  for each row execute function private.set_updated_at();

-- Who paid. user_id NULL means "paid from the trip pool" (physically by the Head).
create table public.expense_payers (
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  user_id     uuid references public.profiles (id),
  amount      bigint not null check (amount > 0),
  unique nulls not distinct (expense_id, user_id)
);
create index expense_payers_user_idx on public.expense_payers (user_id);

-- Who it is split among, and each person's share in paise.
create table public.expense_splits (
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  user_id     uuid not null references public.profiles (id),
  shares      numeric(10, 2),
  amount      bigint not null check (amount >= 0),
  primary key (expense_id, user_id)
);
create index expense_splits_user_idx on public.expense_splits (user_id);

-- Edit history shown on 3.4 Expense detail.
create table public.expense_events (
  id          bigint generated always as identity primary key,
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  actor_id    uuid references public.profiles (id),
  action      text not null check (action in ('created', 'updated', 'deleted', 'confirmed', 'rejected')),
  changes     jsonb,
  created_at  timestamptz not null default now()
);
create index expense_events_expense_idx on public.expense_events (expense_id, created_at);

create table public.expense_comments (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index expense_comments_expense_idx on public.expense_comments (expense_id, created_at);

-- ───────────────────────────── Settlements ─────────────────────────────
-- Screens 4.3–4.4. Generated when the Head ends the trip.

create table public.settlements (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  from_user     uuid not null references public.profiles (id),
  to_user       uuid not null references public.profiles (id),
  amount        bigint not null check (amount > 0),
  status        public.settlement_status not null default 'pending',
  upi_ref       text,
  paid_at       timestamptz,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  check (from_user <> to_user)
);
create index settlements_trip_idx on public.settlements (trip_id);

-- ───────────────────────────── Notifications ─────────────────────────────
-- Screen 3.6. action_required items show under "Needs action".

create table public.notifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  trip_id          uuid references public.trips (id) on delete cascade,
  type             text not null,
  title            text not null,
  body             text,
  data             jsonb not null default '{}'::jsonb,
  action_required  boolean not null default false,
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ───────────────────────────── Wallet ledger ─────────────────────────────
-- Screen 1.7. A ledger of the user's own money movements; it does not hold funds.
-- amount is signed: money in is positive, money out is negative.

create table public.wallet_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  type          public.wallet_tx_type not null,
  amount        bigint not null check (amount <> 0),
  status        public.payment_status not null default 'pending',
  upi_ref       text,
  upi_app       text,
  trip_id       uuid references public.trips (id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz,
  check (
    (type in ('topup', 'settlement_received') and amount > 0)
    or (type in ('withdrawal', 'pool_contribution', 'settlement_paid') and amount < 0)
    or type = 'adjustment'
  )
);
create index wallet_transactions_user_idx on public.wallet_transactions (user_id, created_at desc);
