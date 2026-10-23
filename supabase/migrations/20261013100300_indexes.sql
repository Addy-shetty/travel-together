-- Indexes for foreign keys flagged by the Supabase performance advisor, and a primary
-- key for expense_payers (its natural key has a nullable user_id, meaning "the pool").

alter table public.expense_payers add column id bigint generated always as identity primary key;

create index expense_comments_user_idx       on public.expense_comments (user_id);
create index expense_events_actor_idx        on public.expense_events (actor_id);
create index expenses_created_by_idx         on public.expenses (created_by);
create index notifications_trip_idx          on public.notifications (trip_id);
create index pool_contributions_confirmed_by_idx on public.pool_contributions (confirmed_by);
create index pool_contributions_member_idx   on public.pool_contributions (trip_id, user_id);
create index settlements_from_user_idx       on public.settlements (from_user);
create index settlements_to_user_idx         on public.settlements (to_user);
create index trips_head_idx                  on public.trips (head_id);
create index wallet_transactions_trip_idx    on public.wallet_transactions (trip_id);
