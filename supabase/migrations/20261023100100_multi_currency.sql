-- Multi-currency support for international trips.
-- Amounts are stored in the trip's currency (smallest unit, e.g. cents/paise).
-- Settlements can be viewed in the trip currency or converted to a member's home currency.

-- Supported currencies (ISO 4217 codes)
create type public.currency_code as enum (
  'INR',  -- Indian Rupee (default)
  'USD',  -- US Dollar
  'EUR',  -- Euro
  'GBP',  -- British Pound
  'AED',  -- UAE Dirham
  'SGD',  -- Singapore Dollar
  'THB',  -- Thai Baht
  'MYR',  -- Malaysian Ringgit
  'IDR',  -- Indonesian Rupiah
  'JPY',  -- Japanese Yen
  'AUD',  -- Australian Dollar
  'CAD'   -- Canadian Dollar
);

-- Currency metadata (symbol, decimal places, name)
create table public.currencies (
  code        public.currency_code primary key,
  symbol      text not null,
  decimals    int not null default 2,
  name        text not null
);

insert into public.currencies (code, symbol, decimals, name) values
  ('INR', '₹', 2, 'Indian Rupee'),
  ('USD', '$', 2, 'US Dollar'),
  ('EUR', '€', 2, 'Euro'),
  ('GBP', '£', 2, 'British Pound'),
  ('AED', 'د.إ', 2, 'UAE Dirham'),
  ('SGD', 'S$', 2, 'Singapore Dollar'),
  ('THB', '฿', 2, 'Thai Baht'),
  ('MYR', 'RM', 2, 'Malaysian Ringgit'),
  ('IDR', 'Rp', 0, 'Indonesian Rupiah'),
  ('JPY', '¥', 0, 'Japanese Yen'),
  ('AUD', 'A$', 2, 'Australian Dollar'),
  ('CAD', 'C$', 2, 'Canadian Dollar');

-- Exchange rates (updated periodically via Edge Function or manually)
create table public.exchange_rates (
  from_currency  public.currency_code not null,
  to_currency    public.currency_code not null,
  rate           numeric(20, 10) not null check (rate > 0),
  updated_at     timestamptz not null default now(),
  primary key (from_currency, to_currency)
);

-- Default rates (approximate, should be updated via API)
insert into public.exchange_rates (from_currency, to_currency, rate) values
  ('USD', 'INR', 83.50),
  ('EUR', 'INR', 90.50),
  ('GBP', 'INR', 105.00),
  ('AED', 'INR', 22.70),
  ('SGD', 'INR', 62.00),
  ('THB', 'INR', 2.35),
  ('MYR', 'INR', 17.70),
  ('IDR', 'INR', 0.0053),
  ('JPY', 'INR', 0.56),
  ('AUD', 'INR', 54.00),
  ('CAD', 'INR', 61.50),
  -- Reverse rates
  ('INR', 'USD', 0.012),
  ('INR', 'EUR', 0.011),
  ('INR', 'GBP', 0.0095),
  ('INR', 'AED', 0.044),
  ('INR', 'SGD', 0.016),
  ('INR', 'THB', 0.43),
  ('INR', 'MYR', 0.056),
  ('INR', 'IDR', 188.68),
  ('INR', 'JPY', 1.79),
  ('INR', 'AUD', 0.0185),
  ('INR', 'CAD', 0.0163);

-- Add currency to trips (default INR for backward compatibility)
alter table public.trips
  add column currency public.currency_code not null default 'INR';

-- Add home currency preference to profiles
alter table public.profiles
  add column home_currency public.currency_code not null default 'INR';

-- Function to convert amount between currencies
create or replace function public.convert_currency(
  p_amount bigint,
  p_from public.currency_code,
  p_to public.currency_code
) returns bigint
language plpgsql stable as $$
declare
  v_rate numeric(20, 10);
  v_from_decimals int;
  v_to_decimals int;
begin
  if p_from = p_to then
    return p_amount;
  end if;

  select rate into v_rate
  from public.exchange_rates
  where from_currency = p_from and to_currency = p_to;

  if v_rate is null then
    raise exception 'NO_EXCHANGE_RATE';
  end if;

  select decimals into v_from_decimals from public.currencies where code = p_from;
  select decimals into v_to_decimals from public.currencies where code = p_to;

  -- Convert: amount * rate, adjusting for decimal differences
  return round(p_amount * v_rate * power(10, v_to_decimals - v_from_decimals));
end;
$$;

-- Function to format amount with currency symbol
create or replace function public.format_currency(
  p_amount bigint,
  p_currency public.currency_code
) returns text
language plpgsql stable as $$
declare
  v_symbol text;
  v_decimals int;
  v_value numeric;
begin
  select symbol, decimals into v_symbol, v_decimals
  from public.currencies where code = p_currency;

  v_value := p_amount / power(10, v_decimals);

  return v_symbol || to_char(v_value, 'FM999,999,999,990' ||
    case when v_decimals > 0 then '.' || repeat('0', v_decimals) else '' end);
end;
$$;

-- RLS for new tables
alter table public.currencies enable row level security;
alter table public.exchange_rates enable row level security;

create policy "currencies: public read" on public.currencies for select using (true);
create policy "exchange_rates: public read" on public.exchange_rates for select using (true);

-- Grant access
grant select on public.currencies to authenticated;
grant select on public.exchange_rates to authenticated;
grant execute on function public.convert_currency(bigint, public.currency_code, public.currency_code) to authenticated;
grant execute on function public.format_currency(bigint, public.currency_code) to authenticated;

comment on table public.currencies is 'Currency metadata: symbol, decimal places, display name.';
comment on table public.exchange_rates is 'Exchange rates between currencies. Update via Edge Function or API.';
comment on column public.trips.currency is 'Currency for all amounts in this trip (default INR).';
comment on column public.profiles.home_currency is 'User home currency for viewing converted amounts.';
