import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { rpc, useLoader, useTripRealtime, type Category, type TripSummary } from './api';
import { useAuth } from './auth';
import { supabase } from './supabase';

export type ExpenseItem = {
  id: string; description: string; category: Category; amount: number; status: 'pending' | 'confirmed' | 'rejected';
  place_name: string | null; spent_at: string; created_by: string;
  expense_payers: { user_id: string | null; amount: number }[];
  expense_splits: { user_id: string; amount: number }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Route param `id`, validated as a UUID before it is sent anywhere. */
export function useTripId(): string | null {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return typeof id === 'string' && UUID.test(id) ? id : null;
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

/** Trip summary + expenses, kept fresh via Realtime and on screen focus. */
export function useTrip(withExpenses = false) {
  const tripId = useTripId();
  const { session } = useAuth();
  const me = session?.user.id ?? '';

  const loader = useLoader(async () => {
    if (!tripId) throw { message: 'NOT_TRIP_MEMBER' };
    const [summary, expenses] = await Promise.all([
      rpc<TripSummary>(supabase.rpc('trip_summary', { p_trip_id: tripId })),
      withExpenses
        ? rpc<ExpenseItem[]>(supabase.from('expenses')
            .select('id, description, category, amount, status, place_name, spent_at, created_by, expense_payers(user_id, amount), expense_splits(user_id, amount)')
            .eq('trip_id', tripId).is('deleted_at', null).neq('status', 'rejected')
            .order('spent_at', { ascending: false }).limit(300))
        : Promise.resolve([] as ExpenseItem[]),
    ]);
    return { summary, expenses };
  }, [tripId, withExpenses]);

  const { reload } = loader;
  useTripRealtime(tripId ?? undefined, reload);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const summary = loader.data?.summary;
  const nameOf = (uid: string | null) =>
    uid === null ? 'Trip pool' : uid === me ? 'You' : summary?.members.find((m) => m.user_id === uid)?.full_name ?? 'Someone';

  return {
    tripId, me, summary, expenses: loader.data?.expenses ?? [],
    isHead: !!summary && summary.trip.head_id === me,
    isActive: summary?.trip.status === 'active',
    error: loader.error, loading: loader.loading, reload, nameOf,
  };
}
