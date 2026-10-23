-- Travel-Together: business logic
-- Every write that touches money goes through one of these functions, so the
-- rules (membership, Head-only actions, splits adding up) live in one place.
-- Errors are raised with a machine-readable code as the message, e.g. 'NOT_TRIP_MEMBER'.

-- ───────────────────────────── Internal helpers (schema private) ─────────────────────────────

create or replace function private.is_member(p_trip uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip and m.user_id = p_user and m.left_at is null
  );
$$;

create or replace function private.is_head(p_trip uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.trips t where t.id = p_trip and t.head_id = p_user);
$$;

create or replace function private.shares_trip_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members a
    join public.trip_members b on b.trip_id = a.trip_id
    where a.user_id = auth.uid() and b.user_id = p_other
  );
$$;

create or replace function private.require_member(p_trip uuid)
returns public.trips
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_trip from public.trips t where t.id = p_trip;
  if not found or not private.is_member(p_trip) then
    raise exception 'NOT_TRIP_MEMBER' using errcode = '42501';
  end if;
  return v_trip;
end;
$$;

create or replace function private.require_head(p_trip uuid)
returns public.trips
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
begin
  v_trip := private.require_member(p_trip);
  if v_trip.head_id <> auth.uid() then
    raise exception 'HEAD_ONLY' using errcode = '42501';
  end if;
  return v_trip;
end;
$$;

create or replace function private.require_active(p_trip public.trips)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_trip.status <> 'active' then
    raise exception 'TRIP_NOT_ACTIVE';
  end if;
end;
$$;

create or replace function private.display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(p.full_name, ''), 'Someone') from public.profiles p where p.id = p_user;
$$;

-- 12345600 paise -> '₹1,23,456' (Indian digit grouping)
create or replace function private.fmt_inr(p_paise bigint)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_neg    boolean := p_paise < 0;
  v_abs    bigint := abs(p_paise);
  v_rupees text := (v_abs / 100)::text;
  v_paise  bigint := v_abs % 100;
  v_last3  text;
  v_rest   text;
  v_out    text;
begin
  if length(v_rupees) > 3 then
    v_last3 := right(v_rupees, 3);
    v_rest := left(v_rupees, length(v_rupees) - 3);
    v_rest := regexp_replace(v_rest, '(\d)(?=(\d\d)+$)', '\1,', 'g');
    v_out := v_rest || ',' || v_last3;
  else
    v_out := v_rupees;
  end if;
  if v_paise <> 0 then
    v_out := v_out || '.' || lpad(v_paise::text, 2, '0');
  end if;
  return case when v_neg then '−' else '' end || '₹' || v_out;
end;
$$;

create or replace function private.notify(
  p_user uuid,
  p_trip uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_action_required boolean default false
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, trip_id, type, title, body, data, action_required)
  values (p_user, p_trip, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb), p_action_required);
$$;

-- Clear an "action required" notification once it has been handled.
create or replace function private.resolve_notifications(p_key text, p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
     set action_required = false, read_at = coalesce(n.read_at, now())
   where n.action_required and n.data ->> p_key = p_id::text;
$$;

create or replace function private.generate_invite_code(p_name text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_chars  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_prefix text := upper(left(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]', '', 'g'), 3));
  v_code   text;
begin
  v_prefix := rpad(v_prefix, 3, 'X');
  loop
    v_code := v_prefix || '-';
    for i in 1..4 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.trips t where t.invite_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- ───────────────────────────── Balances ─────────────────────────────
-- net = pool contributed + paid directly − fair share − pool cash still held (Head only)
-- Positive net: gets money back. Negative net: owes money. Nets always sum to zero.
-- The Head physically holds the pool's money, so leftover pool cash counts against
-- the Head; that is how leftovers flow back to everyone without separate refunds.

create or replace function private.trip_balances(p_trip uuid)
returns table (
  user_id        uuid,
  full_name      text,
  role           public.member_role,
  contributed    bigint,
  paid_direct    bigint,
  share          bigint,
  pool_cash_held bigint,
  net            bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select e.id from public.expenses e
    where e.trip_id = p_trip and e.status = 'confirmed' and e.deleted_at is null
  ),
  contrib as (
    select c.user_id, sum(c.amount)::bigint as amt
    from public.pool_contributions c
    where c.trip_id = p_trip and c.status = 'confirmed'
    group by c.user_id
  ),
  paid as (
    select p.user_id, sum(p.amount)::bigint as amt
    from public.expense_payers p join live on live.id = p.expense_id
    where p.user_id is not null
    group by p.user_id
  ),
  owed as (
    select s.user_id, sum(s.amount)::bigint as amt
    from public.expense_splits s join live on live.id = s.expense_id
    group by s.user_id
  ),
  pool as (
    select coalesce((select sum(amt) from contrib), 0)::bigint
         - coalesce((select sum(p.amount) from public.expense_payers p join live on live.id = p.expense_id
                      where p.user_id is null), 0)::bigint as balance
  ),
  rows as (
    select m.user_id,
           pr.full_name,
           m.role,
           coalesce(c.amt, 0) as contributed,
           coalesce(pd.amt, 0) as paid_direct,
           coalesce(o.amt, 0) as share,
           case when m.role = 'head' then (select balance from pool) else 0 end as pool_cash_held
    from public.trip_members m
    join public.profiles pr on pr.id = m.user_id
    left join contrib c on c.user_id = m.user_id
    left join paid pd on pd.user_id = m.user_id
    left join owed o on o.user_id = m.user_id
    where m.trip_id = p_trip
  )
  select r.user_id, r.full_name, r.role, r.contributed, r.paid_direct, r.share, r.pool_cash_held,
         (r.contributed + r.paid_direct - r.share - r.pool_cash_held)::bigint as net
  from rows r
  order by net desc, r.user_id;
$$;

-- Fewest-payments settlement: repeatedly match the biggest debtor with the biggest creditor.
create or replace function private.compute_settlements(p_trip uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    record;
  d_ids    uuid[] := '{}'::uuid[];
  d_amt    bigint[] := '{}'::bigint[];
  c_ids    uuid[] := '{}'::uuid[];
  c_amt    bigint[] := '{}'::bigint[];
  di       int;
  ci       int;
  v_max    bigint;
  v_pay    bigint;
begin
  delete from public.settlements s where s.trip_id = p_trip;

  for v_row in
    select b.user_id, b.net from private.trip_balances(p_trip) b where b.net <> 0 order by b.user_id
  loop
    if v_row.net < 0 then
      d_ids := d_ids || v_row.user_id;
      d_amt := d_amt || (-v_row.net);
    else
      c_ids := c_ids || v_row.user_id;
      c_amt := c_amt || v_row.net;
    end if;
  end loop;

  loop
    di := null; v_max := 0;
    for i in 1..coalesce(array_length(d_amt, 1), 0) loop
      if d_amt[i] > v_max then v_max := d_amt[i]; di := i; end if;
    end loop;
    ci := null; v_max := 0;
    for i in 1..coalesce(array_length(c_amt, 1), 0) loop
      if c_amt[i] > v_max then v_max := c_amt[i]; ci := i; end if;
    end loop;
    exit when di is null or ci is null;

    v_pay := least(d_amt[di], c_amt[ci]);
    insert into public.settlements (trip_id, from_user, to_user, amount)
    values (p_trip, d_ids[di], c_ids[ci], v_pay);
    d_amt[di] := d_amt[di] - v_pay;
    c_amt[ci] := c_amt[ci] - v_pay;
  end loop;
end;
$$;

-- ───────────────────────────── Expense lines (payers + splits) ─────────────────────────────

create or replace function private.write_expense_lines(
  p_expense uuid,
  p_trip public.trips,
  p_amount bigint,
  p_payers jsonb,
  p_method public.split_method,
  p_splits jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row          record;
  v_total        bigint := 0;
  v_count        int;
  v_distinct     int;
  v_total_shares numeric;
  v_written      bigint;
begin
  delete from public.expense_payers p where p.expense_id = p_expense;
  delete from public.expense_splits s where s.expense_id = p_expense;

  -- Payers
  if p_payers is null or jsonb_typeof(p_payers) <> 'array' or jsonb_array_length(p_payers) = 0 then
    raise exception 'INVALID_PAYERS';
  end if;
  for v_row in
    select nullif(x ->> 'user_id', '')::uuid as uid, (x ->> 'amount')::bigint as amt
    from jsonb_array_elements(p_payers) x
  loop
    if v_row.amt is null or v_row.amt <= 0 then
      raise exception 'INVALID_PAYERS';
    end if;
    if v_row.uid is null then
      if p_trip.money_mode = 'each_pays' then
        raise exception 'POOL_NOT_ENABLED';
      end if;
    elsif not private.is_member(p_trip.id, v_row.uid) then
      raise exception 'PAYER_NOT_MEMBER';
    end if;
    insert into public.expense_payers (expense_id, user_id, amount) values (p_expense, v_row.uid, v_row.amt);
    v_total := v_total + v_row.amt;
  end loop;
  if v_total <> p_amount then
    raise exception 'PAYERS_TOTAL_MISMATCH';
  end if;

  -- Splits
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'INVALID_SPLITS';
  end if;
  select count(*), count(distinct x ->> 'user_id') into v_count, v_distinct from jsonb_array_elements(p_splits) x;
  if v_count <> v_distinct then
    raise exception 'DUPLICATE_SPLIT_MEMBER';
  end if;
  for v_row in select (x ->> 'user_id')::uuid as uid from jsonb_array_elements(p_splits) x loop
    if v_row.uid is null or not private.is_member(p_trip.id, v_row.uid) then
      raise exception 'SPLIT_MEMBER_NOT_IN_TRIP';
    end if;
  end loop;

  if p_method = 'equal' then
    -- Remainder paise go one each to the first people in the list.
    insert into public.expense_splits (expense_id, user_id, shares, amount)
    select p_expense, (t.x ->> 'user_id')::uuid, null,
           p_amount / v_count + case when t.ord <= p_amount % v_count then 1 else 0 end
    from jsonb_array_elements(p_splits) with ordinality as t(x, ord);

  elsif p_method = 'shares' then
    if exists (select 1 from jsonb_array_elements(p_splits) x
               where (x ->> 'shares') is null or (x ->> 'shares')::numeric < 0) then
      raise exception 'INVALID_SHARES';
    end if;
    select sum((x ->> 'shares')::numeric) into v_total_shares from jsonb_array_elements(p_splits) x;
    if v_total_shares is null or v_total_shares <= 0 then
      raise exception 'INVALID_SHARES';
    end if;
    -- Floor each share, then hand out the leftover paise by largest fractional part.
    insert into public.expense_splits (expense_id, user_id, shares, amount)
    with s as (
      select (t.x ->> 'user_id')::uuid as uid,
             (t.x ->> 'shares')::numeric as sh,
             t.ord,
             p_amount * (t.x ->> 'shares')::numeric / v_total_shares as exact
      from jsonb_array_elements(p_splits) with ordinality as t(x, ord)
      where (t.x ->> 'shares')::numeric > 0
    ),
    f as (
      select s.*, floor(s.exact)::bigint as base,
             row_number() over (order by s.exact - floor(s.exact) desc, s.ord) as rn
      from s
    )
    select p_expense, f.uid, f.sh,
           f.base + case when f.rn <= p_amount - (select sum(base) from f) then 1 else 0 end
    from f;

  else -- exact
    if exists (select 1 from jsonb_array_elements(p_splits) x
               where (x ->> 'amount') is null or (x ->> 'amount')::bigint < 0) then
      raise exception 'INVALID_SPLITS';
    end if;
    insert into public.expense_splits (expense_id, user_id, shares, amount)
    select p_expense, (x ->> 'user_id')::uuid, null, (x ->> 'amount')::bigint
    from jsonb_array_elements(p_splits) x
    where (x ->> 'amount')::bigint > 0;
  end if;

  select coalesce(sum(s.amount), 0) into v_written from public.expense_splits s where s.expense_id = p_expense;
  if v_written <> p_amount then
    raise exception 'SPLITS_TOTAL_MISMATCH';
  end if;
end;
$$;

create or replace function private.expense_snapshot(p_expense uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'description',  e.description,
    'category',     e.category,
    'amount',       e.amount,
    'split_method', e.split_method,
    'status',       e.status,
    'place_name',   e.place_name,
    'spent_at',     e.spent_at,
    'payers', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'amount', p.amount)
                                         order by p.user_id nulls first), '[]'::jsonb)
               from public.expense_payers p where p.expense_id = e.id),
    'splits', (select coalesce(jsonb_agg(jsonb_build_object('user_id', s.user_id, 'shares', s.shares, 'amount', s.amount)
                                         order by s.user_id), '[]'::jsonb)
               from public.expense_splits s where s.expense_id = e.id)
  )
  from public.expenses e where e.id = p_expense;
$$;

-- Only the fields that changed: {"amount": {"from": 205000, "to": 215000}, ...}
create or replace function private.jsonb_diff(p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('from', p_old -> k, 'to', p_new -> k)), '{}'::jsonb)
  from jsonb_object_keys(p_new) k
  where (p_old -> k) is distinct from (p_new -> k);
$$;

create or replace function private.notify_expense_shares(p_expense uuid, p_actor uuid, p_verb text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exp  public.expenses;
  v_row  record;
begin
  select * into v_exp from public.expenses e where e.id = p_expense;
  for v_row in
    select s.user_id, s.amount from public.expense_splits s
    where s.expense_id = p_expense and s.user_id <> p_actor
  loop
    perform private.notify(
      v_row.user_id, v_exp.trip_id, 'expense_' || p_verb,
      private.display_name(p_actor) || ' ' || p_verb || ' ' || v_exp.description || ' · ' || private.fmt_inr(v_exp.amount),
      'Your share is ' || private.fmt_inr(v_row.amount),
      jsonb_build_object('expense_id', p_expense)
    );
  end loop;
end;
$$;

-- ───────────────────────────── Trips ─────────────────────────────

create or replace function public.create_trip(
  p_name text,
  p_start_date date default null,
  p_end_date date default null,
  p_money_mode public.money_mode default 'both',
  p_pool_amount_per_person bigint default 0,
  p_default_split public.split_method default 'equal'
)
returns public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_profile public.profiles;
  v_trip    public.trips;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_profile from public.profiles p where p.id = v_uid;

  if p_money_mode = 'each_pays' then
    p_pool_amount_per_person := 0;
  elsif coalesce(p_pool_amount_per_person, 0) < 0 then
    raise exception 'INVALID_POOL_AMOUNT';
  elsif v_profile.upi_id is null then
    raise exception 'UPI_ID_REQUIRED';
  end if;

  insert into public.trips (name, start_date, end_date, head_id, money_mode, pool_amount_per_person,
                            pool_upi_id, default_split, invite_code)
  values (btrim(p_name), p_start_date, p_end_date, v_uid, p_money_mode, coalesce(p_pool_amount_per_person, 0),
          case when p_money_mode = 'each_pays' then null else v_profile.upi_id end,
          p_default_split, private.generate_invite_code(p_name))
  returning * into v_trip;

  insert into public.trip_members (trip_id, user_id, role) values (v_trip.id, v_uid, 'head');
  return v_trip;
end;
$$;

-- Head edits trip details. NULL arguments keep the current value.
create or replace function public.update_trip(
  p_trip_id uuid,
  p_name text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_money_mode public.money_mode default null,
  p_pool_amount_per_person bigint default null,
  p_default_split public.split_method default null
)
returns public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
begin
  v_trip := private.require_head(p_trip_id);
  perform private.require_active(v_trip);

  if p_money_mode = 'each_pays' and v_trip.money_mode <> 'each_pays' and (
       exists (select 1 from public.pool_contributions c where c.trip_id = p_trip_id and c.status <> 'rejected')
    or exists (select 1 from public.expense_payers p join public.expenses e on e.id = p.expense_id
               where e.trip_id = p_trip_id and p.user_id is null and e.deleted_at is null)
  ) then
    raise exception 'POOL_ALREADY_USED';
  end if;
  if p_pool_amount_per_person is not null and p_pool_amount_per_person < 0 then
    raise exception 'INVALID_POOL_AMOUNT';
  end if;

  update public.trips t set
    name                   = coalesce(nullif(btrim(p_name), ''), t.name),
    start_date             = coalesce(p_start_date, t.start_date),
    end_date               = coalesce(p_end_date, t.end_date),
    money_mode             = coalesce(p_money_mode, t.money_mode),
    pool_amount_per_person = case when coalesce(p_money_mode, t.money_mode) = 'each_pays' then 0
                                  else coalesce(p_pool_amount_per_person, t.pool_amount_per_person) end,
    default_split          = coalesce(p_default_split, t.default_split)
  where t.id = p_trip_id
  returning * into v_trip;
  return v_trip;
end;
$$;

-- Screen 2.4: what someone sees after opening an invite link (before joining).
create or replace function public.get_trip_invite(p_invite_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_trip from public.trips t where t.invite_code = upper(btrim(p_invite_code));
  if not found or v_trip.status <> 'active' then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'trip_id',                v_trip.id,
    'name',                   v_trip.name,
    'start_date',             v_trip.start_date,
    'end_date',               v_trip.end_date,
    'money_mode',             v_trip.money_mode,
    'pool_amount_per_person', v_trip.pool_amount_per_person,
    'pool_upi_id',            v_trip.pool_upi_id,
    'default_split',          v_trip.default_split,
    'head',                   jsonb_build_object('id', v_trip.head_id, 'full_name', private.display_name(v_trip.head_id)),
    'already_member',         private.is_member(v_trip.id),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name,
                                                   'avatar_url', p.avatar_url, 'role', m.role)
                                order by m.role, m.joined_at), '[]'::jsonb)
      from public.trip_members m join public.profiles p on p.id = m.user_id
      where m.trip_id = v_trip.id and m.left_at is null
    )
  );
end;
$$;

create or replace function public.join_trip(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_trip public.trips;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  select * into v_trip from public.trips t where t.invite_code = upper(btrim(p_invite_code));
  if not found or v_trip.status <> 'active' then
    raise exception 'INVITE_NOT_FOUND';
  end if;
  if private.is_member(v_trip.id) then
    return v_trip.id;
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip.id, v_uid, 'member')
  on conflict (trip_id, user_id) do update set left_at = null, joined_at = now();

  perform private.notify(v_trip.head_id, v_trip.id, 'member_joined',
    private.display_name(v_uid) || ' joined ' || v_trip.name, null,
    jsonb_build_object('user_id', v_uid));
  return v_trip.id;
end;
$$;

create or replace function public.leave_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_trip public.trips;
begin
  v_trip := private.require_member(p_trip_id);
  perform private.require_active(v_trip);
  if v_trip.head_id = v_uid then
    raise exception 'HEAD_CANNOT_LEAVE';
  end if;
  if exists (select 1 from public.pool_contributions c
             where c.trip_id = p_trip_id and c.user_id = v_uid and c.status <> 'rejected')
     or exists (select 1 from public.expenses e
                where e.trip_id = p_trip_id and e.deleted_at is null and e.status <> 'rejected'
                  and (exists (select 1 from public.expense_payers p where p.expense_id = e.id and p.user_id = v_uid)
                       or exists (select 1 from public.expense_splits s where s.expense_id = e.id and s.user_id = v_uid)))
  then
    raise exception 'MEMBER_HAS_ACTIVITY';
  end if;
  update public.trip_members m set left_at = now() where m.trip_id = p_trip_id and m.user_id = v_uid;
end;
$$;

-- ───────────────────────────── Pool contributions ─────────────────────────────

-- Screen 2.5: "Pay my share". Call after the UPI app returns success.
create or replace function public.record_pool_contribution(
  p_trip_id uuid,
  p_amount bigint,
  p_upi_ref text default null,
  p_upi_app text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_trip public.trips;
  v_id   uuid;
begin
  v_trip := private.require_member(p_trip_id);
  perform private.require_active(v_trip);
  if v_trip.money_mode = 'each_pays' then
    raise exception 'POOL_NOT_ENABLED';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  if v_trip.head_id = v_uid then
    -- The Head's own share is already in their account: confirm straight away.
    insert into public.pool_contributions (trip_id, user_id, amount, status, upi_ref, upi_app, confirmed_by, confirmed_at)
    values (p_trip_id, v_uid, p_amount, 'confirmed', p_upi_ref, p_upi_app, v_uid, now())
    returning id into v_id;
    insert into public.wallet_transactions (user_id, type, amount, status, trip_id, note, confirmed_at)
    values (v_uid, 'pool_contribution', -p_amount, 'confirmed', p_trip_id, v_trip.name || ' pool contribution', now());
  else
    insert into public.pool_contributions (trip_id, user_id, amount, upi_ref, upi_app)
    values (p_trip_id, v_uid, p_amount, p_upi_ref, p_upi_app)
    returning id into v_id;
    perform private.notify(v_trip.head_id, p_trip_id, 'confirm_contribution',
      'Confirm a payment to you',
      private.display_name(v_uid) || ' says they paid ' || private.fmt_inr(p_amount) || ' into the '
        || v_trip.name || ' pool. Did you receive it?',
      jsonb_build_object('contribution_id', v_id, 'user_id', v_uid, 'amount', p_amount),
      true);
  end if;
  return v_id;
end;
$$;

-- Head confirms (or rejects) that a contribution actually arrived.
create or replace function public.confirm_pool_contribution(p_contribution_id uuid, p_received boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c    public.pool_contributions;
  v_trip public.trips;
begin
  select * into v_c from public.pool_contributions c where c.id = p_contribution_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  v_trip := private.require_head(v_c.trip_id);
  perform private.require_active(v_trip);
  if v_c.status <> 'pending' then
    raise exception 'ALREADY_RESOLVED';
  end if;

  update public.pool_contributions c
     set status = case when p_received then 'confirmed'::public.payment_status else 'rejected' end,
         confirmed_by = auth.uid(), confirmed_at = now()
   where c.id = p_contribution_id;

  if p_received then
    insert into public.wallet_transactions (user_id, type, amount, status, upi_ref, upi_app, trip_id, note, confirmed_at)
    values (v_c.user_id, 'pool_contribution', -v_c.amount, 'confirmed', v_c.upi_ref, v_c.upi_app,
            v_c.trip_id, v_trip.name || ' pool contribution', now());
  end if;

  perform private.resolve_notifications('contribution_id', p_contribution_id);
  perform private.notify(v_c.user_id, v_c.trip_id, 'contribution_' || case when p_received then 'confirmed' else 'rejected' end,
    case when p_received
         then 'Your ' || private.fmt_inr(v_c.amount) || ' pool payment was received'
         else private.display_name(auth.uid()) || ' hasn''t received your ' || private.fmt_inr(v_c.amount) || ' pool payment' end,
    case when p_received then null else 'Check your UPI app, then pay again if it failed.' end,
    jsonb_build_object('contribution_id', p_contribution_id));
end;
$$;

-- ───────────────────────────── Expenses ─────────────────────────────

-- Screens 3.1–3.3. Amounts are in paise.
--   p_payers: [{"user_id": "<uuid>" | null (= pool), "amount": 120000}]   (default: caller paid it all)
--   p_splits: equal  → [{"user_id": "..."}]
--             shares → [{"user_id": "...", "shares": 2}]
--             exact  → [{"user_id": "...", "amount": 50000}]
--             (default: everyone in the trip, equally)
--   p_status: 'pending' while waiting for the UPI app, 'confirmed' when already paid.
create or replace function public.create_expense(
  p_trip_id uuid,
  p_description text,
  p_amount bigint,
  p_category public.expense_category default 'other',
  p_payers jsonb default null,
  p_split_method public.split_method default null,
  p_splits jsonb default null,
  p_status public.payment_status default 'confirmed',
  p_place_name text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_spent_at timestamptz default null,
  p_receipt_path text default null,
  p_upi_ref text default null,
  p_payee_name text default null,
  p_payee_upi text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_trip   public.trips;
  v_method public.split_method;
  v_splits jsonb := p_splits;
  v_id     uuid;
begin
  v_trip := private.require_member(p_trip_id);
  perform private.require_active(v_trip);
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_status = 'rejected' then
    raise exception 'INVALID_STATUS';
  end if;

  v_method := coalesce(p_split_method, v_trip.default_split);
  if v_splits is null then
    if v_method <> 'equal' then
      raise exception 'INVALID_SPLITS';
    end if;
    select jsonb_agg(jsonb_build_object('user_id', m.user_id) order by m.joined_at)
      into v_splits
      from public.trip_members m
     where m.trip_id = p_trip_id and m.left_at is null;
  end if;

  insert into public.expenses (trip_id, description, category, amount, split_method, status, place_name,
                               latitude, longitude, spent_at, receipt_path, upi_ref, payee_name, payee_upi, created_by)
  values (p_trip_id, btrim(p_description), p_category, p_amount, v_method, p_status, p_place_name,
          p_latitude, p_longitude, coalesce(p_spent_at, now()), p_receipt_path, p_upi_ref, p_payee_name, p_payee_upi, v_uid)
  returning id into v_id;

  perform private.write_expense_lines(
    v_id, v_trip, p_amount,
    coalesce(p_payers, jsonb_build_array(jsonb_build_object('user_id', v_uid, 'amount', p_amount))),
    v_method, v_splits);

  insert into public.expense_events (expense_id, actor_id, action, changes)
  values (v_id, v_uid, 'created', private.expense_snapshot(v_id));

  if p_status = 'confirmed' then
    perform private.notify_expense_shares(v_id, v_uid, 'added');
  end if;
  return v_id;
end;
$$;

-- Edit an expense (creator or Head, while the trip is active). NULL keeps the current value.
-- If the amount changes and payers/splits are not sent, a single payer and equal/shares
-- splits are recalculated for the new amount; anything else must be sent explicitly.
create or replace function public.update_expense(
  p_expense_id uuid,
  p_description text default null,
  p_amount bigint default null,
  p_category public.expense_category default null,
  p_payers jsonb default null,
  p_split_method public.split_method default null,
  p_splits jsonb default null,
  p_place_name text default null,
  p_spent_at timestamptz default null,
  p_receipt_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_exp    public.expenses;
  v_trip   public.trips;
  v_before jsonb;
  v_after  jsonb;
  v_amount bigint;
  v_method public.split_method;
  v_payers jsonb := p_payers;
  v_splits jsonb := p_splits;
  v_diff   jsonb;
begin
  select * into v_exp from public.expenses e where e.id = p_expense_id and e.deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  v_trip := private.require_member(v_exp.trip_id);
  perform private.require_active(v_trip);
  if v_exp.created_by <> v_uid and v_trip.head_id <> v_uid then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_amount is not null and p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  v_before := private.expense_snapshot(p_expense_id);
  v_amount := coalesce(p_amount, v_exp.amount);
  v_method := coalesce(p_split_method, v_exp.split_method);

  if p_amount is not null or p_payers is not null or p_split_method is not null or p_splits is not null then
    if v_payers is null then
      if (select count(*) from public.expense_payers p where p.expense_id = p_expense_id) <> 1 then
        raise exception 'PAYERS_REQUIRED';
      end if;
      select jsonb_build_array(jsonb_build_object('user_id', p.user_id, 'amount', v_amount))
        into v_payers from public.expense_payers p where p.expense_id = p_expense_id;
    end if;
    if v_splits is null then
      if v_method = 'exact' then
        raise exception 'SPLITS_REQUIRED';
      end if;
      select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'shares', coalesce(s.shares, 1)) order by s.user_id)
        into v_splits from public.expense_splits s where s.expense_id = p_expense_id;
    end if;
    perform private.write_expense_lines(p_expense_id, v_trip, v_amount, v_payers, v_method, v_splits);
  end if;

  update public.expenses e set
    description  = coalesce(nullif(btrim(p_description), ''), e.description),
    amount       = v_amount,
    category     = coalesce(p_category, e.category),
    split_method = v_method,
    place_name   = coalesce(p_place_name, e.place_name),
    spent_at     = coalesce(p_spent_at, e.spent_at),
    receipt_path = coalesce(p_receipt_path, e.receipt_path)
  where e.id = p_expense_id;

  v_after := private.expense_snapshot(p_expense_id);
  v_diff := private.jsonb_diff(v_before, v_after);
  if v_diff <> '{}'::jsonb then
    insert into public.expense_events (expense_id, actor_id, action, changes)
    values (p_expense_id, v_uid, 'updated', v_diff);
    if v_exp.status = 'confirmed' then
      perform private.notify_expense_shares(p_expense_id, v_uid, 'edited');
    end if;
  end if;
end;
$$;

create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_exp  public.expenses;
  v_trip public.trips;
begin
  select * into v_exp from public.expenses e where e.id = p_expense_id and e.deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  v_trip := private.require_member(v_exp.trip_id);
  perform private.require_active(v_trip);
  if v_exp.created_by <> v_uid and v_trip.head_id <> v_uid then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  update public.expenses e set deleted_at = now() where e.id = p_expense_id;
  insert into public.expense_events (expense_id, actor_id, action) values (p_expense_id, v_uid, 'deleted');
end;
$$;

-- Screen 3.3: after the UPI app returns, confirm whether the payment went through.
create or replace function public.confirm_expense_payment(
  p_expense_id uuid,
  p_success boolean,
  p_upi_ref text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_exp  public.expenses;
  v_trip public.trips;
begin
  select * into v_exp from public.expenses e where e.id = p_expense_id and e.deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  v_trip := private.require_member(v_exp.trip_id);
  if v_exp.created_by <> v_uid and v_trip.head_id <> v_uid then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_exp.status <> 'pending' then
    raise exception 'ALREADY_RESOLVED';
  end if;
  perform private.require_active(v_trip);

  update public.expenses e
     set status = case when p_success then 'confirmed'::public.payment_status else 'rejected' end,
         upi_ref = coalesce(p_upi_ref, e.upi_ref)
   where e.id = p_expense_id;
  insert into public.expense_events (expense_id, actor_id, action, changes)
  values (p_expense_id, v_uid, case when p_success then 'confirmed' else 'rejected' end,
          case when p_upi_ref is null then null else jsonb_build_object('upi_ref', p_upi_ref) end);

  if p_success then
    perform private.notify_expense_shares(p_expense_id, v_uid, 'added');
  end if;
end;
$$;

-- Notify the expense's creator about new comments.
create or replace function private.on_expense_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exp public.expenses;
begin
  select * into v_exp from public.expenses e where e.id = new.expense_id;
  if v_exp.created_by <> new.user_id then
    perform private.notify(v_exp.created_by, v_exp.trip_id, 'expense_comment',
      private.display_name(new.user_id) || ' commented on ' || v_exp.description,
      left(new.body, 140),
      jsonb_build_object('expense_id', v_exp.id, 'comment_id', new.id));
  end if;
  return new;
end;
$$;

create trigger expense_comments_notify
  after insert on public.expense_comments
  for each row execute function private.on_expense_comment();

-- ───────────────────────────── Balances & summaries (read) ─────────────────────────────

-- Screen 3.5 Live balances.
create or replace function public.trip_balances(p_trip_id uuid)
returns table (
  user_id        uuid,
  full_name      text,
  role           public.member_role,
  contributed    bigint,
  paid_direct    bigint,
  share          bigint,
  pool_cash_held bigint,
  net            bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_member(p_trip_id);
  return query select * from private.trip_balances(p_trip_id);
end;
$$;

-- Screens 2.6 Trip dashboard and 4.2 Trip summary.
create or replace function public.trip_summary(p_trip_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trip    public.trips;
  v_total   bigint;
  v_count   int;
  v_members int;
  v_days    int;
  v_collect bigint;
  v_pool_sp bigint;
begin
  v_trip := private.require_member(p_trip_id);

  select coalesce(sum(e.amount), 0), count(*) into v_total, v_count
    from public.expenses e
   where e.trip_id = p_trip_id and e.status = 'confirmed' and e.deleted_at is null;

  select count(*) into v_members from public.trip_members m where m.trip_id = p_trip_id and m.left_at is null;

  if v_trip.start_date is not null and v_trip.end_date is not null then
    v_days := v_trip.end_date - v_trip.start_date + 1;
  else
    select greatest(count(distinct (e.spent_at at time zone 'Asia/Kolkata')::date), 1) into v_days
      from public.expenses e
     where e.trip_id = p_trip_id and e.status = 'confirmed' and e.deleted_at is null;
  end if;

  select coalesce(sum(c.amount), 0) into v_collect
    from public.pool_contributions c where c.trip_id = p_trip_id and c.status = 'confirmed';
  select coalesce(sum(p.amount), 0) into v_pool_sp
    from public.expense_payers p join public.expenses e on e.id = p.expense_id
   where e.trip_id = p_trip_id and e.status = 'confirmed' and e.deleted_at is null and p.user_id is null;

  return jsonb_build_object(
    'trip', jsonb_build_object(
      'id', v_trip.id, 'name', v_trip.name, 'start_date', v_trip.start_date, 'end_date', v_trip.end_date,
      'status', v_trip.status, 'money_mode', v_trip.money_mode, 'head_id', v_trip.head_id,
      'pool_amount_per_person', v_trip.pool_amount_per_person, 'pool_upi_id', v_trip.pool_upi_id,
      'invite_code', v_trip.invite_code, 'default_split', v_trip.default_split,
      'ended_at', v_trip.ended_at, 'settled_at', v_trip.settled_at),
    'total_spent',   v_total,
    'expense_count', v_count,
    'member_count',  v_members,
    'per_person',    case when v_members > 0 then round(v_total::numeric / v_members)::bigint else 0 end,
    'days',          v_days,
    'per_day',       round(v_total::numeric / greatest(v_days, 1))::bigint,
    'pool', jsonb_build_object(
      'target',    v_trip.pool_amount_per_person * v_members,
      'collected', v_collect,
      'spent',     v_pool_sp,
      'balance',   v_collect - v_pool_sp),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('category', c.category, 'amount', c.amt) order by c.amt desc), '[]'::jsonb)
      from (select e.category, sum(e.amount)::bigint as amt
              from public.expenses e
             where e.trip_id = p_trip_id and e.status = 'confirmed' and e.deleted_at is null
             group by e.category) c),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'amount', d.amt) order by d.day), '[]'::jsonb)
      from (select (e.spent_at at time zone 'Asia/Kolkata')::date as day, sum(e.amount)::bigint as amt
              from public.expenses e
             where e.trip_id = p_trip_id and e.status = 'confirmed' and e.deleted_at is null
             group by 1) d),
    'members', (
      select coalesce(jsonb_agg(to_jsonb(b) order by b.net desc), '[]'::jsonb)
      from private.trip_balances(p_trip_id) b),
    'settlements', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'from_user', s.from_user, 'from_name', private.display_name(s.from_user),
               'to_user', s.to_user, 'to_name', private.display_name(s.to_user),
               'to_upi_id', (select p.upi_id from public.profiles p where p.id = s.to_user),
               'amount', s.amount, 'status', s.status, 'upi_ref', s.upi_ref,
               'paid_at', s.paid_at, 'confirmed_at', s.confirmed_at)
             order by s.amount desc), '[]'::jsonb)
      from public.settlements s where s.trip_id = p_trip_id)
  );
end;
$$;

-- Screen 4.1: what must be resolved before the trip can end.
create or replace function public.end_trip_checklist(p_trip_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trip    public.trips;
  v_pending jsonb;
  v_claims  jsonb;
begin
  v_trip := private.require_member(p_trip_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'description', e.description, 'amount', e.amount,
           'created_by', e.created_by, 'created_by_name', private.display_name(e.created_by))
         order by e.spent_at), '[]'::jsonb)
    into v_pending
    from public.expenses e
   where e.trip_id = p_trip_id and e.status = 'pending' and e.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'user_id', c.user_id, 'full_name', private.display_name(c.user_id), 'amount', c.amount)
         order by c.created_at), '[]'::jsonb)
    into v_claims
    from public.pool_contributions c
   where c.trip_id = p_trip_id and c.status = 'pending';

  return jsonb_build_object(
    'confirmed_expense_count', (select count(*) from public.expenses e
                                 where e.trip_id = p_trip_id and e.status = 'confirmed' and e.deleted_at is null),
    'confirmed_total', (select coalesce(sum(e.amount), 0) from public.expenses e
                         where e.trip_id = p_trip_id and e.status = 'confirmed' and e.deleted_at is null),
    'pending_expenses', v_pending,
    'pending_contributions', v_claims,
    'missing_contributions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'user_id', b.user_id, 'full_name', b.full_name,
               'expected', v_trip.pool_amount_per_person, 'paid', b.contributed,
               'missing', v_trip.pool_amount_per_person - b.contributed)), '[]'::jsonb)
      from private.trip_balances(p_trip_id) b
      join public.trip_members m on m.trip_id = p_trip_id and m.user_id = b.user_id and m.left_at is null
      where v_trip.pool_amount_per_person > 0 and b.contributed < v_trip.pool_amount_per_person),
    'pool_leftover', (select b.pool_cash_held from private.trip_balances(p_trip_id) b where b.role = 'head'),
    'can_end', v_trip.status = 'active' and jsonb_array_length(v_pending) = 0 and jsonb_array_length(v_claims) = 0
  );
end;
$$;

-- Home (1.6), Trips (2.1) and Profile (1.8) in one call.
create or replace function public.my_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  return (
    with my_trips as (
      select t.*, m.role as my_role
      from public.trips t
      join public.trip_members m on m.trip_id = t.id and m.user_id = v_uid and m.left_at is null
    ),
    nets as (
      select mt.id as trip_id,
             (select b.net from private.trip_balances(mt.id) b where b.user_id = v_uid) as my_net,
             (select coalesce(sum(e.amount), 0) from public.expenses e
               where e.trip_id = mt.id and e.status = 'confirmed' and e.deleted_at is null)::bigint as total_spent,
             (select coalesce(sum(s.amount), 0) from public.expense_splits s
                join public.expenses e on e.id = s.expense_id
               where e.trip_id = mt.id and e.status = 'confirmed' and e.deleted_at is null
                 and s.user_id = v_uid)::bigint as my_share,
             (select count(*) from public.trip_members m2 where m2.trip_id = mt.id and m2.left_at is null) as member_count
      from my_trips mt
    ),
    owing as (
      -- Active trips: live net. Ended trips: unconfirmed settlements. Settled trips: nothing.
      select
        coalesce(sum(case when mt.status = 'active' and n.my_net < 0 then -n.my_net else 0 end), 0)
          + coalesce((select sum(s.amount) from public.settlements s join my_trips t2 on t2.id = s.trip_id
                      where t2.status = 'ended' and s.status <> 'confirmed' and s.from_user = v_uid), 0) as you_owe,
        coalesce(sum(case when mt.status = 'active' and n.my_net > 0 then n.my_net else 0 end), 0)
          + coalesce((select sum(s.amount) from public.settlements s join my_trips t2 on t2.id = s.trip_id
                      where t2.status = 'ended' and s.status <> 'confirmed' and s.to_user = v_uid), 0) as you_get_back
      from my_trips mt join nets n on n.trip_id = mt.id
    )
    select jsonb_build_object(
      'wallet_balance', (select coalesce(sum(w.amount), 0) from public.wallet_transactions w
                          where w.user_id = v_uid and w.status = 'confirmed'),
      'you_owe',        (select you_owe from owing),
      'you_get_back',   (select you_get_back from owing),
      'unread_notifications', (select count(*) from public.notifications nt where nt.user_id = v_uid and nt.read_at is null),
      'stats', jsonb_build_object(
        'trips',       (select count(*) from my_trips),
        'friends',     (select count(distinct m.user_id) from public.trip_members m
                         join my_trips t on t.id = m.trip_id where m.user_id <> v_uid),
        'total_spent', (select coalesce(sum(n.my_share), 0) from nets n)),
      'trips', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', mt.id, 'name', mt.name, 'start_date', mt.start_date, 'end_date', mt.end_date,
                 'status', mt.status, 'my_role', mt.my_role, 'head_id', mt.head_id,
                 'member_count', n.member_count, 'total_spent', n.total_spent, 'my_net', n.my_net,
                 'pool_amount_per_person', mt.pool_amount_per_person)
               order by (mt.status = 'active') desc, mt.start_date desc nulls last, mt.created_at desc), '[]'::jsonb)
        from my_trips mt join nets n on n.trip_id = mt.id)
    )
  );
end;
$$;

-- ───────────────────────────── End trip & settle up ─────────────────────────────

create or replace function public.end_trip(p_trip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip  public.trips;
  v_check jsonb;
  v_count int;
  v_row   record;
begin
  v_trip := private.require_head(p_trip_id);
  perform private.require_active(v_trip);

  v_check := public.end_trip_checklist(p_trip_id);
  if not (v_check ->> 'can_end')::boolean then
    raise exception 'UNRESOLVED_ITEMS';
  end if;

  perform private.compute_settlements(p_trip_id);
  select count(*) into v_count from public.settlements s where s.trip_id = p_trip_id;

  update public.trips t
     set status = case when v_count = 0 then 'settled'::public.trip_status else 'ended' end,
         ended_at = now(),
         settled_at = case when v_count = 0 then now() else null end
   where t.id = p_trip_id;

  for v_row in select m.user_id from public.trip_members m where m.trip_id = p_trip_id and m.left_at is null loop
    perform private.notify(v_row.user_id, p_trip_id, 'trip_ended',
      v_trip.name || ' has ended',
      case when v_count = 0 then 'Everyone is even. Nothing to settle.'
           else 'See the summary and settle up in ' || v_count || ' payment' || case when v_count > 1 then 's' else '' end || '.' end,
      jsonb_build_object('trip_id', p_trip_id));
  end loop;

  return public.trip_summary(p_trip_id) -> 'settlements';
end;
$$;

-- Head reopens an ended trip to fix something (only before any payment has been made).
create or replace function public.reopen_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
begin
  v_trip := private.require_head(p_trip_id);
  if v_trip.status <> 'ended' then
    raise exception 'TRIP_NOT_ENDED';
  end if;
  if exists (select 1 from public.settlements s where s.trip_id = p_trip_id and s.status <> 'pending') then
    raise exception 'SETTLEMENT_IN_PROGRESS';
  end if;
  delete from public.settlements s where s.trip_id = p_trip_id;
  update public.trips t set status = 'active', ended_at = null where t.id = p_trip_id;
end;
$$;

-- Payer marks a settlement as paid after the UPI app returns success.
create or replace function public.mark_settlement_paid(p_settlement_id uuid, p_upi_ref text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s    public.settlements;
  v_trip public.trips;
begin
  select * into v_s from public.settlements s where s.id = p_settlement_id;
  if not found or v_s.from_user <> auth.uid() then
    raise exception 'NOT_FOUND';
  end if;
  if v_s.status <> 'pending' then
    raise exception 'ALREADY_RESOLVED';
  end if;
  select * into v_trip from public.trips t where t.id = v_s.trip_id;

  update public.settlements s set status = 'paid', paid_at = now(), upi_ref = p_upi_ref where s.id = p_settlement_id;

  perform private.notify(v_s.to_user, v_s.trip_id, 'confirm_settlement',
    'Confirm a payment to you',
    private.display_name(v_s.from_user) || ' says they paid you ' || private.fmt_inr(v_s.amount)
      || ' for ' || v_trip.name || '. Did you receive it?',
    jsonb_build_object('settlement_id', p_settlement_id, 'amount', v_s.amount),
    true);
end;
$$;

-- Receiver confirms the money arrived (screen 4.3: "A payment counts once the person receiving it confirms").
-- The receiver may also confirm a pending settlement directly, e.g. when paid in cash.
create or replace function public.confirm_settlement(p_settlement_id uuid, p_received boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s    public.settlements;
  v_trip public.trips;
  v_row  record;
begin
  select * into v_s from public.settlements s where s.id = p_settlement_id;
  if not found or v_s.to_user <> auth.uid() then
    raise exception 'NOT_FOUND';
  end if;
  if v_s.status = 'confirmed' then
    raise exception 'ALREADY_RESOLVED';
  end if;
  select * into v_trip from public.trips t where t.id = v_s.trip_id;

  perform private.resolve_notifications('settlement_id', p_settlement_id);

  if not p_received then
    update public.settlements s set status = 'pending', paid_at = null where s.id = p_settlement_id;
    perform private.notify(v_s.from_user, v_s.trip_id, 'settlement_not_received',
      private.display_name(v_s.to_user) || ' hasn''t received your ' || private.fmt_inr(v_s.amount) || ' yet',
      'Check your UPI app, then pay again if it failed.',
      jsonb_build_object('settlement_id', p_settlement_id));
    return;
  end if;

  update public.settlements s
     set status = 'confirmed', confirmed_at = now(), paid_at = coalesce(s.paid_at, now())
   where s.id = p_settlement_id;

  insert into public.wallet_transactions (user_id, type, amount, status, upi_ref, trip_id, note, confirmed_at)
  values
    (v_s.from_user, 'settlement_paid', -v_s.amount, 'confirmed', v_s.upi_ref, v_s.trip_id,
     v_trip.name || ' settlement to ' || private.display_name(v_s.to_user), now()),
    (v_s.to_user, 'settlement_received', v_s.amount, 'confirmed', v_s.upi_ref, v_s.trip_id,
     v_trip.name || ' settlement from ' || private.display_name(v_s.from_user), now());

  perform private.notify(v_s.from_user, v_s.trip_id, 'settlement_confirmed',
    private.display_name(v_s.to_user) || ' confirmed your ' || private.fmt_inr(v_s.amount) || ' payment', null,
    jsonb_build_object('settlement_id', p_settlement_id));

  if not exists (select 1 from public.settlements s where s.trip_id = v_s.trip_id and s.status <> 'confirmed') then
    update public.trips t set status = 'settled', settled_at = now() where t.id = v_s.trip_id;
    for v_row in select m.user_id from public.trip_members m where m.trip_id = v_s.trip_id and m.left_at is null loop
      perform private.notify(v_row.user_id, v_s.trip_id, 'trip_settled',
        v_trip.name || ' is all settled!', 'Everyone has paid their fair share.',
        jsonb_build_object('trip_id', v_s.trip_id));
    end loop;
  end if;
end;
$$;

-- "Remind" buttons (2.3, 3.5, 4.3). p_kind: 'pool' or 'settlement'. One reminder per person every 6 hours.
create or replace function public.send_reminder(p_trip_id uuid, p_user_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_trip   public.trips;
  v_amount bigint;
  v_body   text;
begin
  v_trip := private.require_member(p_trip_id);
  if p_user_id = v_uid or not private.is_member(p_trip_id, p_user_id) then
    raise exception 'INVALID_RECIPIENT';
  end if;
  if p_kind not in ('pool', 'settlement') then
    raise exception 'INVALID_KIND';
  end if;
  if exists (select 1 from public.notifications n
             where n.user_id = p_user_id and n.type = 'reminder' and n.trip_id = p_trip_id
               and n.data ->> 'kind' = p_kind and n.created_at > now() - interval '6 hours') then
    raise exception 'REMINDER_RATE_LIMITED';
  end if;

  if p_kind = 'pool' then
    perform private.require_active(v_trip);
    select v_trip.pool_amount_per_person - b.contributed into v_amount
      from private.trip_balances(p_trip_id) b where b.user_id = p_user_id;
    v_body := 'Your ' || v_trip.name || ' pool share of ' || private.fmt_inr(v_amount) || ' is still pending.';
  else
    select coalesce(sum(s.amount), 0) into v_amount
      from public.settlements s where s.trip_id = p_trip_id and s.from_user = p_user_id and s.status = 'pending';
    v_body := 'You still need to pay ' || private.fmt_inr(v_amount) || ' to settle ' || v_trip.name || '.';
  end if;
  if coalesce(v_amount, 0) <= 0 then
    raise exception 'NOTHING_TO_REMIND';
  end if;

  perform private.notify(p_user_id, p_trip_id, 'reminder',
    'Reminder from ' || private.display_name(v_uid), v_body,
    jsonb_build_object('kind', p_kind, 'from', v_uid, 'amount', v_amount), true);
end;
$$;

-- ───────────────────────────── Wallet & notifications ─────────────────────────────

-- Screen 1.7: record a top-up started in the UPI app (pending until confirmed).
create or replace function public.record_wallet_topup(
  p_amount bigint,
  p_upi_ref text default null,
  p_upi_app text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  insert into public.wallet_transactions (user_id, type, amount, upi_ref, upi_app, note)
  values (auth.uid(), 'topup', p_amount, p_upi_ref, p_upi_app, 'Added via ' || coalesce(p_upi_app, 'UPI'))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.confirm_wallet_transaction(
  p_transaction_id uuid,
  p_success boolean,
  p_upi_ref text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.wallet_transactions w
     set status = case when p_success then 'confirmed'::public.payment_status else 'rejected' end,
         confirmed_at = now(),
         upi_ref = coalesce(p_upi_ref, w.upi_ref)
   where w.id = p_transaction_id and w.user_id = auth.uid() and w.status = 'pending';
  if not found then
    raise exception 'NOT_FOUND';
  end if;
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
     set read_at = now()
   where n.user_id = auth.uid() and n.read_at is null
     and (p_ids is null or n.id = any (p_ids));
$$;
