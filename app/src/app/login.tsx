import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { normalizeIndianMobile } from '@/lib/validation';
import { Button, ErrorText, Screen } from '@/ui/components';
import { LogoMark } from '@/ui/icons';
import { colors, radius, type } from '@/ui/theme';

// Screen 1.2. Only Indian mobile numbers are accepted, which (with Twilio geo permissions)
// limits SMS pumping. The server applies its own rate limits on top.
export default function Login() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    const e164 = normalizeIndianMobile(phone);
    if (!e164) {
      setError('Enter a 10-digit Indian mobile number.');
      return;
    }
    setError(null);
    setSending(true);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
    setSending(false);
    if (err) {
      setError(friendlyError(err));
      return;
    }
    router.push({ pathname: '/otp', params: { phone: e164 } });
  };

  return (
    <Screen scroll>
      <View style={styles.brand}>
        <View style={styles.mark}><LogoMark size={32} color="#FFFFFF" /></View>
        <Text style={styles.brandName}>Travel-Together</Text>
      </View>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Travel together.{'\n'}Split it fairly.</Text>
        <Text style={styles.heroBody}>One shared pool, every expense tracked, a fair split when you get back.</Text>
      </View>

      <View style={styles.field}>
        <Text style={type.label} nativeID="phoneLabel">Mobile number</Text>
        <View style={styles.row}>
          <View style={styles.prefix}><Text style={styles.prefixText}>+91</Text></View>
          <TextInput
            accessibilityLabelledBy="phoneLabel"
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/[^\d\s]/g, '').slice(0, 12))}
            placeholder="98765 43210"
            placeholderTextColor="#7A8791"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={12}
            returnKeyType="send"
            onSubmitEditing={send}
            style={[styles.input, error ? styles.inputError : null]}
          />
        </View>
        <ErrorText>{error}</ErrorText>
      </View>
      <Button title="Send OTP" onPress={send} loading={sending} />

      <Text style={styles.terms}>By continuing you agree to the Terms and Privacy Policy.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 },
  mark: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 20, fontWeight: '800', color: colors.primary },
  hero: { gap: 12, marginBottom: 8 },
  heroTitle: { fontSize: 32, fontWeight: '800', color: colors.ink, lineHeight: 38 },
  heroBody: { fontSize: 16, color: colors.muted, lineHeight: 24 },
  field: { gap: 10 },
  row: { flexDirection: 'row', gap: 8 },
  prefix: {
    height: 52, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5,
    borderColor: colors.line, justifyContent: 'center',
  },
  prefixText: { fontSize: 16, fontWeight: '600', color: colors.ink },
  input: {
    flex: 1, height: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary,
    backgroundColor: colors.surface, paddingHorizontal: 14, fontSize: 16, color: colors.ink,
  },
  inputError: { borderColor: colors.owe },
  terms: { marginTop: 'auto', textAlign: 'center', fontSize: 13, color: colors.muted },
});
