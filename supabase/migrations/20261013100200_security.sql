-- Travel-Together: row level security, grants, storage and realtime
--
-- Model: clients READ tables directly (filtered by RLS) and WRITE through the
-- functions in 20261013100100_functions.sql. The only direct writes allowed are
-- your own profile, push tokens, expense comments and marking notifications read.

-- ───────────────────────────── Grants ─────────────────────────────

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- RLS policies below call these helpers, so signed-in users need to execute them.
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid, uuid), private.is_head(uuid, uuid),
                          private.shares_trip_with(uuid) to authenticated;

grant select on public.profiles, public.trips, public.trip_members, public.pool_contributions,
                public.expenses, public.expense_payers, public.expense_splits, public.expense_events,
                public.expense_comments, public.settlements, public.notifications,
                public.wallet_transactions, public.push_tokens
  to authenticated;

grant update (full_name, email, avatar_url, upi_id, upi_name, preferred_upi_app, default_split,
              notifications_enabled, location_enabled, language)
  on public.profiles to authenticated;
grant insert (expense_id, body), delete on public.expense_comments to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
grant insert, delete on public.push_tokens to authenticated;

grant execute on function
  public.create_trip(text, date, date, public.money_mode, bigint, public.split_method),
  public.update_trip(uuid, text, date, date, public.money_mode, bigint, public.split_method),
  public.get_trip_invite(text),
  public.join_trip(text),
  public.leave_trip(uuid),
  public.record_pool_contribution(uuid, bigint, text, text),
  public.confirm_pool_contribution(uuid, boolean),
  public.create_expense(uuid, text, bigint, public.expense_category, jsonb, public.split_method, jsonb,
                        public.payment_status, text, double precision, double precision, timestamptz,
                        text, text, text, text),
  public.update_expense(uuid, text, bigint, public.expense_category, jsonb, public.split_method, jsonb,
                        text, timestamptz, text),
  public.delete_expense(uuid),
  public.confirm_expense_payment(uuid, boolean, text),
  public.trip_balances(uuid),
  public.trip_summary(uuid),
  public.end_trip_checklist(uuid),
  public.my_overview(),
  public.end_trip(uuid),
  public.reopen_trip(uuid),
  public.mark_settlement_paid(uuid, text),
  public.confirm_settlement(uuid, boolean),
  public.send_reminder(uuid, uuid, text),
  public.record_wallet_topup(bigint, text, text),
  public.confirm_wallet_transaction(uuid, boolean, text),
  public.mark_notifications_read(uuid[])
to authenticated;

-- ───────────────────────────── Row level security ─────────────────────────────

alter table public.profiles            enable row level security;
alter table public.push_tokens         enable row level security;
alter table public.trips               enable row level security;
alter table public.trip_members        enable row level security;
alter table public.pool_contributions  enable row level security;
alter table public.expenses            enable row level security;
alter table public.expense_payers      enable row level security;
alter table public.expense_splits      enable row level security;
alter table public.expense_events      enable row level security;
alter table public.expense_comments    enable row level security;
alter table public.settlements         enable row level security;
alter table public.notifications       enable row level security;
alter table public.wallet_transactions enable row level security;

-- Profiles: yourself, plus anyone you share a trip with.
create policy "profiles: read self and trip mates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_trip_with(id));
create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "push_tokens: own" on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Trip data: members only.
create policy "trips: members read" on public.trips
  for select to authenticated using (private.is_member(id));
create policy "trip_members: members read" on public.trip_members
  for select to authenticated using (private.is_member(trip_id));
create policy "pool_contributions: members read" on public.pool_contributions
  for select to authenticated using (private.is_member(trip_id));
create policy "expenses: members read" on public.expenses
  for select to authenticated using (private.is_member(trip_id));
create policy "expense_payers: members read" on public.expense_payers
  for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and private.is_member(e.trip_id)));
create policy "expense_splits: members read" on public.expense_splits
  for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and private.is_member(e.trip_id)));
create policy "expense_events: members read" on public.expense_events
  for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and private.is_member(e.trip_id)));
create policy "settlements: members read" on public.settlements
  for select to authenticated using (private.is_member(trip_id));

-- Comments: members read; members add their own on live expenses; delete your own.
create policy "expense_comments: members read" on public.expense_comments
  for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and private.is_member(e.trip_id)));
create policy "expense_comments: members add own" on public.expense_comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.expenses e
                where e.id = expense_id and e.deleted_at is null and private.is_member(e.trip_id))
  );
create policy "expense_comments: delete own" on public.expense_comments
  for delete to authenticated using (user_id = (select auth.uid()));

-- Notifications and wallet: your own only.
create policy "notifications: own read" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: own update" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications: own delete" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "wallet_transactions: own read" on public.wallet_transactions
  for select to authenticated using (user_id = (select auth.uid()));

-- ───────────────────────────── Storage ─────────────────────────────
-- avatars:  public bucket, path "<user_id>/<file>"
-- receipts: private bucket, path "<trip_id>/<file>", readable by trip members

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',  'avatars',  true,  2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "avatars: public read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars: owner write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "receipts: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts'
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and private.is_member(((storage.foldername(name))[1])::uuid));
create policy "receipts: members upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts'
              and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
              and private.is_member(((storage.foldername(name))[1])::uuid));
create policy "receipts: uploader delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and owner_id = (select auth.uid())::text);

-- ───────────────────────────── Realtime ─────────────────────────────
-- Live updates for the dashboard, balances, settle-up and notifications (RLS still applies).

alter publication supabase_realtime add table
  public.trips, public.trip_members, public.pool_contributions, public.expenses,
  public.settlements, public.notifications, public.expense_comments;
