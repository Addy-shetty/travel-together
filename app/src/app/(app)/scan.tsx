import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { CATEGORIES, rpc, useLoader, type Category, type MoneyMode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { formatINR, paiseToInput, parseRupees } from '@/lib/money';
import { payWithUpi } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import { parseUpiQr, type ScannedUpi } from '@/lib/upiQr';
import { isUuid } from '@/lib/useTrip';
import { Button, ErrorText, Screen } from '@/ui/components';
import { Card, Chip, Header, Loading, Note, Pill, Row, textStyles } from '@/ui/kit';
import { ManualPay } from '@/ui/ManualPay';
import { colors, radius, type } from '@/ui/theme';

type TripRow = { id: string; name: string; money_mode: MoneyMode; head_id: string };

// Feature F6: scan any UPI QR, pay through the UPI app, and save it as a trip expense.
// The camera frames are decoded on the device; only the QR text is used.
export default function ScanAndPay() {
  const params = useLocalSearchParams<{ trip?: string }>();
  const presetTrip = isUuid(params.trip) ? params.trip : null;
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<ScannedUpi | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const locked = useRef(false);

  const onScan = ({ data }: BarcodeScanningResult) => {
    if (locked.current) return;
    locked.current = true;
    const result = parseUpiQr(data);
    if (result.ok) {
      setScanError(null);
      setScanned(result.value);
    } else {
      // Never open non-UPI content (web links, app links…) from a QR.
      setScanError(result.reason === 'NOT_UPI'
        ? 'This QR isn’t a UPI payment code. For your safety it won’t be opened.'
        : 'This UPI QR looks broken or unsafe, so it can’t be used.');
      setTimeout(() => { locked.current = false; }, 2000);
    }
  };

  if (scanned) {
    return <ConfirmPayment scanned={scanned} presetTrip={presetTrip}
      onRescan={() => { setScanned(null); locked.current = false; }} />;
  }

  return (
    <Screen>
      <Header title="Scan & Pay" subtitle="Scan any UPI QR: shop, cab or friend" back="close" />
      {!permission ? <Loading /> : !permission.granted ? (
        <View style={{ gap: 12 }}>
          <Note>Travel-Together uses the camera only to read UPI QR codes. Images never leave your phone.</Note>
          {permission.canAskAgain
            ? <Button title="Allow camera" onPress={requestPermission} />
            : <Button title="Open settings to allow camera" onPress={() => Linking.openSettings()} />}
        </View>
      ) : (
        <>
          <View style={styles.cameraWrap}>
            <CameraView style={StyleSheet.absoluteFill} facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
            <View style={styles.frame} pointerEvents="none" />
          </View>
          <Text style={[textStyles.muted, { textAlign: 'center' }]}>Point the camera at the QR code.</Text>
          <ErrorText>{scanError}</ErrorText>
        </>
      )}
    </Screen>
  );
}

function ConfirmPayment({ scanned, presetTrip, onRescan }: { scanned: ScannedUpi; presetTrip: string | null; onRescan: () => void }) {
  const { session, profile } = useAuth();
  const me = session?.user.id ?? '';
  const trips = useLoader(() => rpc<TripRow[]>(supabase.from('trips').select('id, name, money_mode, head_id')
    .eq('status', 'active').order('created_at', { ascending: false })), []);
  const [tripId, setTripId] = useState<string | null>(presetTrip);
  const [amountText, setAmountText] = useState(scanned.amountPaise ? paiseToInput(scanned.amountPaise) : '');
  const [description, setDescription] = useState(scanned.note || scanned.payeeName || '');
  const [category, setCategory] = useState<Category>(scanned.isMerchant ? 'food' : 'other');
  const [fromPool, setFromPool] = useState(false);
  // Personal QRs: UPI apps block app-started payments to people, so paying inside the UPI app is the default.
  const [manual, setManual] = useState(!scanned.isMerchant);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = trips.data ?? [];
  const trip = list.find((t) => t.id === (tripId ?? (list.length === 1 ? list[0].id : '')));
  const canUsePool = !!trip && trip.head_id === me && trip.money_mode !== 'each_pays';
  const amount = scanned.signed && scanned.amountPaise ? scanned.amountPaise : parseRupees(amountText);

  const formError = !trip ? 'Choose the trip this payment belongs to.' : !amount ? 'Enter the amount.'
    : !description.trim() ? 'What is this payment for?' : null;

  const expenseArgs = (status: 'pending' | 'confirmed', upiRef?: string) => ({
    p_trip_id: trip!.id, p_description: description.trim().slice(0, 100), p_amount: amount!, p_category: category,
    p_payers: [{ user_id: fromPool && canUsePool ? null : me, amount: amount! }],
    p_status: status, p_payee_upi: scanned.payeeUpi, p_payee_name: scanned.payeeName.slice(0, 60) || undefined,
    p_upi_ref: upiRef,
  });

  // Paid inside the UPI app: save it as a confirmed expense with the payee details and reference.
  const savePaid = async (upiRef: string | undefined) => {
    if (formError) return setError(formError);
    const { data: expenseId, error: err } = await supabase.rpc('create_expense', expenseArgs('confirmed', upiRef));
    if (err || !expenseId) return setError(friendlyError(err));
    router.replace(`/trip/${trip!.id}/expense/${expenseId}`);
  };

  const pay = async () => {
    if (formError) return setError(formError);
    setError(null);
    setBusy(true);
    const { data: expenseId, error: err } = await supabase.rpc('create_expense', expenseArgs('pending'));
    if (err || !expenseId) {
      setBusy(false);
      return setError(friendlyError(err));
    }
    const result = await payWithUpi(
      { payeeUpi: scanned.payeeUpi, payeeName: scanned.payeeName, amountPaise: amount!, note: description, extra: scanned.passthrough },
      { rawUrl: scanned.signed ? scanned.raw : undefined },
    );
    const { error: confirmErr } = await supabase.rpc('confirm_expense_payment', { p_expense_id: expenseId, p_success: result === 'paid' });
    setBusy(false);
    if (confirmErr) return setError(friendlyError(confirmErr));
    router.replace(result === 'paid' ? `/trip/${trip!.id}/expense/${expenseId}` : `/trip/${trip!.id}`);
  };

  return (
    <Screen scroll footer={<>
      {!manual ? <Button title={amount ? `Pay ${formatINR(amount)}` : 'Pay'} onPress={pay} loading={busy} disabled={!amount || !trip} /> : null}
      <Button title="Scan a different QR" variant="ghost" onPress={onRescan} disabled={busy} />
    </>}>
      <Header title="Confirm payment" back="close" />

      <Card style={{ padding: 16, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[textStyles.strong, { fontSize: 18, flex: 1 }]} numberOfLines={2}>{scanned.payeeName || 'Unnamed payee'}</Text>
          {scanned.isMerchant ? <Pill label="MERCHANT" tone="good" /> : <Pill label="PERSON" tone="warn" />}
        </View>
        <Text style={[textStyles.body, { fontWeight: '600' }]} selectable>{scanned.payeeUpi}</Text>
        <Text style={textStyles.sub}>Check this matches who you’re paying. Your UPI app will show the bank-verified name too.</Text>
      </Card>
      {!scanned.isMerchant ? (
        <Note tone="warn">UPI apps block payments to people that start from another app, so you’ll pay inside your UPI app and confirm here.</Note>
      ) : null}

      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={type.small} nativeID="scanAmount">Amount (₹)</Text>
        <TextInput accessibilityLabelledBy="scanAmount" value={scanned.signed && scanned.amountPaise ? paiseToInput(scanned.amountPaise) : amountText}
          onChangeText={setAmountText} editable={!(scanned.signed && scanned.amountPaise)} placeholder="0" placeholderTextColor="#9AA6B0"
          keyboardType="decimal-pad" maxLength={12} style={styles.amount} />
        {scanned.signed && scanned.amountPaise ? <Text style={textStyles.sub}>Amount fixed by the merchant’s QR</Text> : null}
      </View>

      <TextInput accessibilityLabel="What is it for" value={description} onChangeText={setDescription} placeholder="What is it for?"
        placeholderTextColor="#7A8791" maxLength={100} style={styles.input} />
      <View style={styles.wrap}>
        {CATEGORIES.map((c) => <Chip key={c.key} label={c.label} active={category === c.key} onPress={() => setCategory(c.key)} />)}
      </View>

      <Text style={type.label}>Trip</Text>
      {trips.loading ? <Loading /> : list.length === 0 ? <Note>You have no live trips. Create or join one first.</Note> : (
        <View style={styles.wrap}>
          {list.map((t) => <Chip key={t.id} label={t.name} active={trip?.id === t.id} onPress={() => setTripId(t.id)} />)}
        </View>
      )}

      {canUsePool ? (
        <>
          <Text style={type.label}>Paid from</Text>
          <View style={styles.wrap}>
            <Chip label={`My account (${profile?.full_name.split(' ')[0] ?? 'me'})`} active={!fromPool} onPress={() => setFromPool(false)} />
            <Chip label="Trip pool" active={fromPool} onPress={() => setFromPool(true)} />
          </View>
        </>
      ) : null}

      <Card><Row last>
        <Text style={[textStyles.muted, { flex: 1 }]}>Split</Text>
        <Text style={textStyles.strong}>Everyone equally</Text>
      </Row></Card>
      <Text style={textStyles.sub}>You can change the split afterwards from the expense.</Text>
      <ErrorText>{error}</ErrorText>

      {manual ? (
        formError ? <Note>{formError}</Note> : (
          <ManualPay payeeUpi={scanned.payeeUpi} payeeName={scanned.payeeName} amountPaise={amount!} note={description}
            onPaid={savePaid} allowAppLaunch={false} />
        )
      ) : (
        <Button title="Pay inside my UPI app instead" variant="ghost" onPress={() => setManual(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraWrap: { width: '100%', aspectRatio: 1, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#000' },
  frame: { position: 'absolute', top: '15%', left: '15%', right: '15%', bottom: '15%', borderWidth: 3, borderColor: '#FFFFFF', borderRadius: radius.lg },
  amount: { fontSize: 40, fontWeight: '800', color: colors.ink, textAlign: 'center', minWidth: 160 },
  input: { height: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface,
    paddingHorizontal: 14, fontSize: 15, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
