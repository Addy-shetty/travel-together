-- Local development seed: the "Mangalore" trip from the wireframes.
-- Log in locally with any of these phones and OTP 123456 (see config.toml [auth.sms.test_otp]):
--   +91 98765 43210 Harshith (Head) · …11 Anika · …12 Rohan · …13 Divya · …14 Kiran
-- Everything below goes through the same functions the app calls.

create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
$$;

do $$
declare
  h uuid := '11111111-1111-4111-8111-111111111111';
  a uuid := '22222222-2222-4222-8222-222222222222';
  r uuid := '33333333-3333-4333-8333-333333333333';
  d uuid := '44444444-4444-4444-8444-444444444444';
  k uuid := '55555555-5555-4555-8555-555555555555';
  v_trip public.trips;
  v_c    uuid;
  v_e    uuid;
  u      record;
  v_u    uuid;
begin
  for u in
    select * from (values
      (h, '919876543210', 'Harshith M S', 'harshith@okaxis'),
      (a, '919876543211', 'Anika',        'anika.s@ybl'),
      (r, '919876543212', 'Rohan',        'rohan@okhdfc'),
      (d, '919876543213', 'Divya',        'divya@oksbi'),
      (k, '919876543214', 'Kiran',        'kiran@paytm')
    ) as t(id, phone, full_name, upi)
  loop
    insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data,
                            raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
                            email_change_token_new, email_change, phone_change, phone_change_token,
                            email_change_token_current, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.phone, now(),
            '{"provider":"phone","providers":["phone"]}', jsonb_build_object('full_name', u.full_name),
            now(), now(), '', '', '', '', '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id::text, u.id,
            jsonb_build_object('sub', u.id::text, 'phone', u.phone, 'phone_verified', true),
            'phone', now(), now(), now());
    update public.profiles set upi_id = u.upi, upi_name = upper(u.full_name), preferred_upi_app = 'gpay'
     where id = u.id;
  end loop;

  -- Harshith creates the trip: pool of ₹4,000 per person.
  perform pg_temp.act_as(h);
  v_trip := public.create_trip('Mangalore', date '2026-11-14', date '2026-11-17', 'both', 400000, 'equal');

  -- Friends join with the invite code.
  foreach v_u in array array[a, r, d, k] loop
    perform pg_temp.act_as(v_u);
    perform public.join_trip(v_trip.invite_code);
  end loop;

  -- Pool contributions (Kiran hasn't paid; Divya's second half awaits confirmation).
  perform pg_temp.act_as(h);
  perform public.record_pool_contribution(v_trip.id, 400000, 'UPI4810001', 'gpay');
  foreach v_u in array array[a, r, d] loop
    perform pg_temp.act_as(v_u);
    v_c := public.record_pool_contribution(v_trip.id, case when v_u = d then 200000 else 400000 end, null, 'gpay');
    perform pg_temp.act_as(h);
    perform public.confirm_pool_contribution(v_c, true);
  end loop;
  perform pg_temp.act_as(d);
  perform public.record_pool_contribution(v_trip.id, 200000, null, 'phonepe');

  -- Expenses paid from the pool (by the Head).
  perform pg_temp.act_as(h);
  perform public.create_expense(v_trip.id, 'Homestay balance', 300000, 'stay',
    '[{"user_id": null, "amount": 300000}]', p_place_name => 'Ullal', p_spent_at => '2026-11-14 12:30+05:30');
  perform public.create_expense(v_trip.id, 'Lunch · Giri Manja''s', 215000, 'food',
    '[{"user_id": null, "amount": 215000}]', p_place_name => 'Car Street', p_spent_at => '2026-11-15 13:40+05:30');
  perform public.create_expense(v_trip.id, 'Breakfast · Hotel Narayana', 180000, 'food',
    '[{"user_id": null, "amount": 180000}]', p_place_name => 'Hampankatta', p_spent_at => '2026-11-16 09:10+05:30');
  perform public.create_expense(v_trip.id, 'Seafood dinner', 175000, 'food',
    '[{"user_id": null, "amount": 175000}]', p_place_name => 'Bunder', p_spent_at => '2026-11-16 21:00+05:30');
  perform public.create_expense(v_trip.id, 'Cab from airport', 180000, 'travel',
    '[{"user_id": null, "amount": 180000}]', p_place_name => 'Mangalore Airport', p_spent_at => '2026-11-14 10:15+05:30');
  perform public.create_expense(v_trip.id, 'Fuel refill', 220000, 'travel',
    '[{"user_id": null, "amount": 220000}]', p_place_name => 'Kankanady', p_spent_at => '2026-11-16 17:20+05:30');
  perform public.create_expense(v_trip.id, 'Boat ride · Panambur', 120000, 'activities',
    '[{"user_id": null, "amount": 120000}]', p_place_name => 'Panambur Beach', p_spent_at => '2026-11-15 16:12+05:30');
  perform public.create_expense(v_trip.id, 'Surf lesson', 90000, 'activities',
    '[{"user_id": null, "amount": 90000}]', p_place_name => 'Mulki', p_spent_at => '2026-11-16 07:30+05:30');
  perform public.create_expense(v_trip.id, 'Parking & tolls', 60000, 'other',
    '[{"user_id": null, "amount": 60000}]', p_spent_at => '2026-11-17 11:00+05:30');

  -- Expenses people paid themselves.
  perform pg_temp.act_as(r);
  perform public.create_expense(v_trip.id, 'Homestay advance', 500000, 'stay',
    p_place_name => 'Ullal', p_spent_at => '2026-11-10 20:00+05:30');
  perform pg_temp.act_as(a);
  v_e := public.create_expense(v_trip.id, 'Fuel', 160000, 'travel',
    p_place_name => 'Surathkal', p_spent_at => '2026-11-15 08:45+05:30');
  perform pg_temp.act_as(k);
  perform public.create_expense(v_trip.id, 'Dinner at Machali', 150000, 'food',
    p_place_name => 'Kodialbail', p_spent_at => '2026-11-14 21:30+05:30');

  -- A comment, as on screen 3.4.
  perform pg_temp.act_as(a);
  insert into public.expense_comments (expense_id, user_id, body)
  select e.id, a, 'Best fish thali of the trip' from public.expenses e
   where e.trip_id = v_trip.id and e.description like 'Lunch%';

  perform set_config('request.jwt.claims', '', false);
end;
$$;
