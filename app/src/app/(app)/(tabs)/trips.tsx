import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { rpc, useLoader, type Overview, type OverviewTrip } from '@/lib/api';
import { INVITE_CODE } from '@/lib/deepLinks';
import { supabase } from '@/lib/supabase';
import { Button, ErrorText, Screen, TextField } from '@/ui/components';
import { Empty, Header, Loading, Segmented } from '@/ui/kit';
import { TripCard } from '@/ui/TripCard';

type Tab = 'live' | 'upcoming' | 'past';

function bucket(t: OverviewTrip, today: string): Tab {
  if (t.status !== 'active') return 'past';
  return t.start_date && t.start_date > today ? 'upcoming' : 'live';
}

// Screen 2.1.
export default function Trips() {
  const { data, error, loading, reload } = useLoader(() => rpc<Overview>(supabase.rpc('my_overview')), []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const [tab, setTab] = useState<Tab>('live');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const trips = data?.trips ?? [];
  const count = (b: Tab) => trips.filter((t) => bucket(t, today) === b).length;
  const shown = trips.filter((t) => bucket(t, today) === tab);

  const join = () => {
    const c = code.trim().toUpperCase();
    if (!INVITE_CODE.test(c)) {
      setCodeError('Codes look like MAN-HHNK.');
      return;
    }
    setCodeError(null);
    router.push(`/join/${c}`);
  };

  return (
    <Screen scroll edges={['top']} refreshing={loading && !!data} onRefresh={reload}>
      <Header title="Trips" back={false} />
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <TextField label="Have an invite code?" value={code} onChangeText={(t) => setCode(t.toUpperCase().slice(0, 8))}
            placeholder="MAN-HHNK" autoCapitalize="characters" autoCorrect={false} error={codeError} onSubmitEditing={join} />
        </View>
        <Button title="Join" variant="secondary" onPress={join} style={{ marginTop: 28, height: 52 }} />
      </View>
      <Button title="+ Plan a new trip" onPress={() => router.push('/trip/new')} />

      <Segmented<Tab> value={tab} onChange={setTab} options={[
        { key: 'live', label: `Live · ${count('live')}` },
        { key: 'upcoming', label: `Upcoming · ${count('upcoming')}` },
        { key: 'past', label: `Past · ${count('past')}` },
      ]} />

      {loading && !data ? <Loading /> : null}
      <ErrorText>{error}</ErrorText>
      {data && shown.length === 0 ? (
        <Empty title={tab === 'past' ? 'No past trips' : tab === 'upcoming' ? 'Nothing planned yet' : 'No live trips'} />
      ) : null}
      {shown.map((t) => <TripCard key={t.id} trip={t} />)}
      <Text style={{ height: 4 }} />
    </Screen>
  );
}
