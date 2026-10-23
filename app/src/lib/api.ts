// Typed shapes for the JSON returned by the database functions, and small data hooks.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Enums, Tables } from './database.types';
import { friendlyError } from './errors';
import { supabase } from './supabase';

export type MoneyMode = Enums<'money_mode'>;
export type TripStatus = Enums<'trip_status'>;
export type Category = Enums<'expense_category'>;
export type SplitMethod = Enums<'split_method'>;
export type Profile = Tables<'profiles'>;
export type Expense = Tables<'expenses'>;
export type Notification = Tables<'notifications'>;
export type WalletTx = Tables<'wallet_transactions'>;

export type OverviewTrip = {
  id: string; name: string; start_date: string | null; end_date: string | null; status: TripStatus;
  my_role: 'head' | 'member'; head_id: string; member_count: number; total_spent: number;
  my_net: number | null; pool_amount_per_person: number;
};
export type Overview = {
  wallet_balance: number; you_owe: number; you_get_back: number; unread_notifications: number;
  stats: { trips: number; friends: number; total_spent: number };
  trips: OverviewTrip[];
};

export type MemberBalance = {
  user_id: string; full_name: string; role: 'head' | 'member'; contributed: number; paid_direct: number;
  share: number; pool_cash_held: number; net: number;
};
export type Settlement = {
  id: string; from_user: string; from_name: string; to_user: string; to_name: string; to_upi_id: string | null;
  amount: number; status: Enums<'settlement_status'>; upi_ref: string | null; paid_at: string | null; confirmed_at: string | null;
};
export type TripSummary = {
  trip: {
    id: string; name: string; start_date: string | null; end_date: string | null; status: TripStatus;
    money_mode: MoneyMode; head_id: string; pool_amount_per_person: number; pool_upi_id: string | null;
    invite_code: string; default_split: SplitMethod; ended_at: string | null; settled_at: string | null;
  };
  total_spent: number; expense_count: number; member_count: number; per_person: number; days: number; per_day: number;
  pool: { target: number; collected: number; spent: number; balance: number };
  categories: { category: Category; amount: number }[];
  by_day: { date: string; amount: number }[];
  members: MemberBalance[];
  settlements: Settlement[];
};
export type Checklist = {
  confirmed_expense_count: number; confirmed_total: number;
  pending_expenses: { id: string; description: string; amount: number; created_by: string; created_by_name: string }[];
  pending_contributions: { id: string; user_id: string; full_name: string; amount: number }[];
  missing_contributions: { user_id: string; full_name: string; expected: number; paid: number; missing: number }[];
  pool_leftover: number | null; can_end: boolean;
};
export type InvitePreview = {
  trip_id: string; name: string; start_date: string | null; end_date: string | null; money_mode: MoneyMode;
  pool_amount_per_person: number; pool_upi_id: string | null; default_split: SplitMethod;
  head: { id: string; full_name: string }; already_member: boolean;
  members: { id: string; full_name: string; avatar_url: string | null; role: 'head' | 'member' }[];
};

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'food', label: 'Food' }, { key: 'travel', label: 'Travel' }, { key: 'stay', label: 'Stay' },
  { key: 'activities', label: 'Activities' }, { key: 'shopping', label: 'Shopping' }, { key: 'other', label: 'Other' },
];
export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.key === c)?.label ?? 'Other';

/** Runs an async loader; exposes data / error / loading / reload. Ignores results after unmount. */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>(
    { data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  useEffect(() => {
    let alive = true;
    loadRef.current().then(
      (data) => { if (alive) setState({ data, error: null, loading: false }); },
      (err) => { if (alive) setState((s) => ({ ...s, error: friendlyError(err), loading: false })); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Throws the Supabase error so useLoader can map it; returns the data otherwise. */
export async function rpc<T>(fn: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await fn;
  if (error) throw error;
  return data as T;
}

let channelSeq = 0;

/**
 * Live updates for one trip: re-runs `onChange` (debounced) when any of its rows change.
 * Realtime applies RLS, and the filter keeps the subscription to this trip.
 */
export function useTripRealtime(tripId: string | undefined, onChange: () => void) {
  const cb = useRef(onChange);
  useEffect(() => { cb.current = onChange; });
  useEffect(() => {
    if (!tripId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(() => cb.current(), 400);
    };
    const filter = `trip_id=eq.${tripId}`;
    // supabase.channel() returns the EXISTING channel for a known name, so every screen
    // (dashboard, pay share, settle…) needs its own name or adding listeners crashes.
    const channel = supabase.channel(`trip-${tripId}-${++channelSeq}`);
    for (const table of ['expenses', 'pool_contributions', 'settlements', 'trip_members'] as const) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, fire);
    }
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` }, fire);
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tripId]);
}
