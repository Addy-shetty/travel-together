-- End-to-end tests for the Travel-Together backend. Run with: supabase test db
-- Replays the Mangalore trip from the wireframes and checks the exact balances and
-- settlements shown on screens 4.2–4.4, plus rounding, permissions and edge cases.
begin;
-- On a hosted project the CLI logs in with a temporary role; run as postgres like the local stack does.
set local role postgres;
create extension if not exists pgtap with schema extensions;
-- pgTAP may live in a different schema on a hosted project; make sure it is on the path.
select set_config('search_path', current_setting('search_path') || ', ' || quote_ident(n.nspname), true)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
select plan(34);

-- ───────── Fixtures ─────────
create schema tests;
create table tests.ctx (key text primary key, id uuid);

create function tests.add_user(p_id uuid, p_phone text, p_name text, p_upi text) returns void
language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, phone, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_phone,
          jsonb_build_object('full_name', p_name), now(), now());
  update public.profiles set upi_id = p_upi where id = p_id;
end $$;

create function tests.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function tests.id(p_key text) returns uuid language sql security definer as $$
  select id from tests.ctx where key = p_key;
$$;
grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

-- H = Harshith (Head), A = Anika, R = Rohan, D = Divya, K = Kiran, O = outsider
select tests.add_user('a0000000-0000-4000-8000-000000000001', '919990000001', 'Harshith', 'harshith.t@okaxis');
select tests.add_user('a0000000-0000-4000-8000-000000000002', '919990000002', 'Anika',    'anika.t@ybl');
select tests.add_user('a0000000-0000-4000-8000-000000000003', '919990000003', 'Rohan',    'rohan.t@okhdfc');
select tests.add_user('a0000000-0000-4000-8000-000000000004', '919990000004', 'Divya',    'divya.t@oksbi');
select tests.add_user('a0000000-0000-4000-8000-000000000005', '919990000005', 'Kiran',    'kiran.t@paytm');
select tests.add_user('a0000000-0000-4000-8000-000000000006', '919990000006', 'Outsider', 'out.t@ybl');

-- ───────── Trip setup ─────────
select tests.act_as('a0000000-0000-4000-8000-000000000001');
insert into tests.ctx
select 'trip', (public.create_trip('Mangalore', '2026-11-14', '2026-11-17', 'both', 400000, 'equal')).id;

select tests.act_as('a0000000-0000-4000-8000-000000000002');
select public.join_trip((select invite_code from public.trips where id = tests.id('trip')));
select tests.act_as('a0000000-0000-4000-8000-000000000003');
select public.join_trip((select lower(invite_code) from public.trips where id = tests.id('trip')));
select tests.act_as('a0000000-0000-4000-8000-000000000004');
select public.join_trip((select invite_code from public.trips where id = tests.id('trip')));
select tests.act_as('a0000000-0000-4000-8000-000000000005');
select public.join_trip((select invite_code from public.trips where id = tests.id('trip')));

select is((select count(*)::int from public.trip_members where trip_id = tests.id('trip')), 5,
          'five members after joining (invite code is case-insensitive)');

-- ───────── Pool contributions ─────────
select tests.act_as('a0000000-0000-4000-8000-000000000001');
select public.record_pool_contribution(tests.id('trip'), 400000, 'REF-H', 'gpay');
select is((select status::text from public.pool_contributions
            where user_id = 'a0000000-0000-4000-8000-000000000001'), 'confirmed',
          'the Head''s own contribution is confirmed immediately');

select tests.act_as('a0000000-0000-4000-8000-000000000002');
select public.record_pool_contribution(tests.id('trip'), 400000);
select tests.act_as('a0000000-0000-4000-8000-000000000003');
select public.record_pool_contribution(tests.id('trip'), 400000);
select tests.act_as('a0000000-0000-4000-8000-000000000004');
select public.record_pool_contribution(tests.id('trip'), 400000);

select ok(exists (select 1 from public.notifications
                  where user_id = 'a0000000-0000-4000-8000-000000000001'
                    and type = 'confirm_contribution' and action_required),
          'the Head is asked to confirm member contributions');

select tests.act_as('a0000000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.confirm_pool_contribution((select id from public.pool_contributions where trip_id = tests.id('trip') and status = 'pending' limit 1), true)$$,
  '42501', 'HEAD_ONLY', 'only the Head can confirm contributions');

select tests.act_as('a0000000-0000-4000-8000-000000000001');
select public.confirm_pool_contribution(c.id, true)
  from public.pool_contributions c where c.trip_id = tests.id('trip') and c.status = 'pending';

-- ───────── Split maths ─────────
select tests.act_as('a0000000-0000-4000-8000-000000000001');
insert into tests.ctx
select 'e_equal', public.create_expense(tests.id('trip'), 'Rounding test', 10000, 'other', null, 'equal',
  '[{"user_id":"a0000000-0000-4000-8000-000000000001"},
    {"user_id":"a0000000-0000-4000-8000-000000000002"},
    {"user_id":"a0000000-0000-4000-8000-000000000003"}]');
select results_eq(
  $$select amount from public.expense_splits where expense_id = tests.id('e_equal') order by amount desc$$,
  $$values (3334::bigint), (3333::bigint), (3333::bigint)$$,
  '₹100 split 3 ways gives 33.34 + 33.33 + 33.33 (no paise lost)');

select public.update_expense(tests.id('e_equal'), p_amount => 12000);
select is((select sum(amount)::bigint from public.expense_splits where expense_id = tests.id('e_equal')), 12000::bigint,
          'changing the amount recalculates the splits');
select ok(exists (select 1 from public.expense_events where expense_id = tests.id('e_equal')
                   and action = 'updated' and changes ? 'amount'),
          'the edit is recorded in the expense history');

insert into tests.ctx
select 'e_shares', public.create_expense(tests.id('trip'), 'Dinner', 250000, 'food',
  '[{"user_id":"a0000000-0000-4000-8000-000000000003","amount":250000}]', 'shares',
  '[{"user_id":"a0000000-0000-4000-8000-000000000001","shares":1},
    {"user_id":"a0000000-0000-4000-8000-000000000002","shares":1},
    {"user_id":"a0000000-0000-4000-8000-000000000003","shares":2},
    {"user_id":"a0000000-0000-4000-8000-000000000004","shares":1},
    {"user_id":"a0000000-0000-4000-8000-000000000005","shares":0}]');
select results_eq(
  $$select user_id, amount from public.expense_splits where expense_id = tests.id('e_shares') order by user_id$$,
  $$values ('a0000000-0000-4000-8000-000000000001'::uuid, 50000::bigint),
           ('a0000000-0000-4000-8000-000000000002'::uuid, 50000::bigint),
           ('a0000000-0000-4000-8000-000000000003'::uuid, 100000::bigint),
           ('a0000000-0000-4000-8000-000000000004'::uuid, 50000::bigint)$$,
  'shares 1:1:2:1 on ₹2,500 (screen 3.2); 0 shares leaves Kiran out');

select throws_ok(
  $$select public.create_expense(tests.id('trip'), 'Bad exact', 10000, 'other', null, 'exact',
      '[{"user_id":"a0000000-0000-4000-8000-000000000001","amount":4000},
        {"user_id":"a0000000-0000-4000-8000-000000000002","amount":4000}]')$$,
  'P0001', 'SPLITS_TOTAL_MISMATCH', 'exact splits must add up to the amount');
select throws_ok(
  $$select public.create_expense(tests.id('trip'), 'Bad payers', 10000, 'other',
      '[{"user_id":"a0000000-0000-4000-8000-000000000001","amount":9000}]')$$,
  'P0001', 'PAYERS_TOTAL_MISMATCH', 'payers must add up to the amount');
select throws_ok(
  $$select public.create_expense(tests.id('trip'), 'Outsider paid', 10000, 'other',
      '[{"user_id":"a0000000-0000-4000-8000-000000000006","amount":10000}]')$$,
  'P0001', 'PAYER_NOT_MEMBER', 'a non-member cannot be a payer');

select public.delete_expense(tests.id('e_equal'));
select public.delete_expense(tests.id('e_shares'));

-- ───────── The Mangalore expenses (₹23,500, everyone split equally) ─────────
select tests.act_as('a0000000-0000-4000-8000-000000000001');
select public.create_expense(tests.id('trip'), 'Stay (pool)',      300000, 'stay',       '[{"user_id":null,"amount":300000}]');
select public.create_expense(tests.id('trip'), 'Food (pool)',      570000, 'food',       '[{"user_id":null,"amount":570000}]');
select public.create_expense(tests.id('trip'), 'Travel (pool)',    400000, 'travel',     '[{"user_id":null,"amount":400000}]');
select public.create_expense(tests.id('trip'), 'Activities (pool)',210000, 'activities', '[{"user_id":null,"amount":210000}]');
select public.create_expense(tests.id('trip'), 'Other (pool)',      60000, 'other',      '[{"user_id":null,"amount":60000}]');
select tests.act_as('a0000000-0000-4000-8000-000000000003');
select public.create_expense(tests.id('trip'), 'Homestay advance', 500000, 'stay');
select tests.act_as('a0000000-0000-4000-8000-000000000002');
select public.create_expense(tests.id('trip'), 'Fuel', 160000, 'travel');
select tests.act_as('a0000000-0000-4000-8000-000000000005');
select public.create_expense(tests.id('trip'), 'Dinner at Machali', 150000, 'food');

-- A pending UPI payment does not count until confirmed.
select tests.act_as('a0000000-0000-4000-8000-000000000002');
insert into tests.ctx
select 'e_pending', public.create_expense(tests.id('trip'), 'Ice cream', 38000, 'food', p_status => 'pending');

select tests.act_as('a0000000-0000-4000-8000-000000000001');
select results_eq(
  $$select user_id, net from public.trip_balances(tests.id('trip')) order by user_id$$,
  $$values ('a0000000-0000-4000-8000-000000000001'::uuid, -130000::bigint),
           ('a0000000-0000-4000-8000-000000000002'::uuid,   90000::bigint),
           ('a0000000-0000-4000-8000-000000000003'::uuid,  430000::bigint),
           ('a0000000-0000-4000-8000-000000000004'::uuid,  -70000::bigint),
           ('a0000000-0000-4000-8000-000000000005'::uuid, -320000::bigint)$$,
  'balances match screen 4.2 (₹600 left in the pool is counted against the Head)');
select is((select sum(net)::bigint from public.trip_balances(tests.id('trip'))), 0::bigint, 'balances sum to zero');

select is((public.trip_summary(tests.id('trip')) ->> 'total_spent')::bigint, 2350000::bigint, 'total spent is ₹23,500');
select is((public.trip_summary(tests.id('trip')) ->> 'per_person')::bigint, 470000::bigint, 'per person is ₹4,700');
select is((public.trip_summary(tests.id('trip')) -> 'pool' ->> 'balance')::bigint, 60000::bigint, '₹600 left in the pool');
select is((public.trip_summary(tests.id('trip')) -> 'categories' -> 0 ->> 'category'), 'stay', 'stay is the biggest category');

-- ───────── Permissions (as the real "authenticated" role) ─────────
set local role authenticated;
select tests.act_as('a0000000-0000-4000-8000-000000000006');
select is((select count(*)::int from public.trips where id = tests.id('trip')), 0, 'an outsider cannot see the trip');
select is((select count(*)::int from public.expenses where trip_id = tests.id('trip')), 0, 'an outsider cannot see its expenses');
select throws_ok($$select public.trip_summary(tests.id('trip'))$$, '42501', 'NOT_TRIP_MEMBER',
                 'an outsider cannot read the summary');

select tests.act_as('a0000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.expenses where trip_id = tests.id('trip') and deleted_at is null), 9,
          'a member sees the trip''s expenses');
select throws_ok(
  $$insert into public.expenses (trip_id, description, amount, created_by)
    values (tests.id('trip'), 'Sneaky', 100, 'a0000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'members cannot write expenses directly, only through the functions');
select throws_ok($$select public.end_trip(tests.id('trip'))$$, '42501', 'HEAD_ONLY', 'only the Head can end the trip');
set local role postgres;

-- ───────── End trip & settle up ─────────
select tests.act_as('a0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.end_trip(tests.id('trip'))$$, 'P0001', 'UNRESOLVED_ITEMS',
                 'the trip cannot end while a payment is unconfirmed');

select tests.act_as('a0000000-0000-4000-8000-000000000002');
select public.confirm_expense_payment(tests.id('e_pending'), false);

select tests.act_as('a0000000-0000-4000-8000-000000000001');
select public.end_trip(tests.id('trip'));
select results_eq(
  $$select from_user, to_user, amount from public.settlements where trip_id = tests.id('trip') order by amount desc$$,
  $$values ('a0000000-0000-4000-8000-000000000005'::uuid, 'a0000000-0000-4000-8000-000000000003'::uuid, 320000::bigint),
           ('a0000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000003'::uuid, 110000::bigint),
           ('a0000000-0000-4000-8000-000000000004'::uuid, 'a0000000-0000-4000-8000-000000000002'::uuid,  70000::bigint),
           ('a0000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000002'::uuid,  20000::bigint)$$,
  'settle up in 4 payments, exactly as on screen 4.3');
select is((select status::text from public.trips where id = tests.id('trip')), 'ended', 'trip is ended');
select throws_ok($$select public.create_expense(tests.id('trip'), 'Late', 1000)$$, 'P0001', 'TRIP_NOT_ACTIVE',
                 'no new expenses after the trip ends');

-- Each payer marks paid, each receiver confirms.
do $$
declare s record;
begin
  for s in select * from public.settlements where trip_id = tests.id('trip') loop
    perform tests.act_as(s.from_user);
    perform public.mark_settlement_paid(s.id, 'UPI-' || left(s.id::text, 8));
  end loop;
end $$;
select ok(exists (select 1 from public.notifications
                  where user_id = 'a0000000-0000-4000-8000-000000000003' and type = 'confirm_settlement' and action_required),
          'the receiver is asked to confirm');
do $$
declare s record;
begin
  for s in select * from public.settlements where trip_id = tests.id('trip') loop
    perform tests.act_as(s.to_user);
    perform public.confirm_settlement(s.id, true);
  end loop;
end $$;

select is((select status::text from public.trips where id = tests.id('trip')), 'settled',
          'the trip is settled once every payment is confirmed (screen 4.4)');
select is((select sum(amount)::bigint from public.wallet_transactions
            where user_id = 'a0000000-0000-4000-8000-000000000005' and status = 'confirmed'), -320000::bigint,
          'Kiran''s wallet shows the ₹3,200 paid');
select tests.act_as('a0000000-0000-4000-8000-000000000005');
select is((public.my_overview() ->> 'you_owe')::bigint, 0::bigint, 'Kiran owes nothing after settling');

-- ───────── Invites ─────────
select tests.act_as('a0000000-0000-4000-8000-000000000001');
insert into tests.ctx select 'goa', (public.create_trip('Goa', null, null, 'each_pays', 0, 'equal')).id;
select tests.act_as('a0000000-0000-4000-8000-000000000006');
select is(public.get_trip_invite((select invite_code from public.trips where id = tests.id('goa'))) ->> 'name', 'Goa',
          'anyone signed in can preview an invite');
select public.join_trip((select invite_code from public.trips where id = tests.id('goa')));
select ok(private.is_member(tests.id('goa'), 'a0000000-0000-4000-8000-000000000006'), 'join_trip adds the member');

-- ───────── Formatting ─────────
select is(private.fmt_inr(12345600), '₹1,23,456', 'Indian digit grouping');

select * from finish();
rollback;
