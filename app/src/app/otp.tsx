import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { formatIndianMobile, isValidOtp, normalizeIndianMobile } from '@/lib/validation';
import { Button, ErrorText, HeaderButton, Screen } from '@/ui/components';
import { colors, radius, type } from '@/ui/theme';

const RESEND_SECONDS = 60;

// Screen 1.3. One hidden input drives the six boxes, so Android SMS autofill and
// iOS "From Messages" both work.
export default function Otp() {
  const params = useLocalSearchParams<{ phone?: string }>();
  // Never trust route params: re-validate before using.
  const phone = normalizeIndianMobile(typeof params.phone === 'string' ? params.phone : '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (!phone) router.replace('/login');
  }, [phone]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (value = code) => {
    if (!phone || verifying) return;
    if (!isValidOtp(value)) {
      setError('Enter the 6-digit code.');
      return;
    }
    setError(null);
    setVerifying(true);
    const { error: err } = await supabase.auth.verifyOtp({ phone, token: value, type: 'sms' });
    setVerifying(false);
    if (err) {
      setCode('');
      setError(friendlyError(err));
    }
    // On success the auth listener updates the session and the route guards move on.
  };

  const resend = async () => {
    if (!phone || cooldown > 0) return;
    setCooldown(RESEND_SECONDS);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ phone });
    if (err) setError(friendlyError(err));
  };

  if (!phone) return null;

  return (
    <Screen scroll>
      <HeaderButton onPress={() => router.replace('/login')} />
      <View style={{ gap: 10 }}>
        <Text style={type.title}>Enter the code</Text>
        <Text style={styles.body}>
          We sent a 6-digit code to <Text style={styles.strong}>{formatIndianMobile(phone)}</Text>.
        </Text>
      </View>

      <Pressable onPress={() => input.current?.focus()} accessibilityLabel="One-time code" style={styles.boxes}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={[styles.box, i < code.length && styles.boxFilled, i === code.length && styles.boxActive]}>
            <Text style={styles.digit}>{code[i] ?? ''}</Text>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={input}
        value={code}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '').slice(0, 6);
          setCode(digits);
          if (digits.length === 6) verify(digits);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        autoFocus
        style={styles.hidden}
        accessibilityLabel="One-time code"
      />
      <ErrorText>{error}</ErrorText>

      <View style={styles.resendRow}>
        <Text style={type.small}>Didn’t get it?</Text>
        {cooldown > 0
          ? <Text style={type.small}>Resend in <Text style={styles.strong}>0:{String(cooldown).padStart(2, '0')}</Text></Text>
          : <Pressable accessibilityRole="button" onPress={resend}><Text style={styles.link}>Resend code</Text></Pressable>}
      </View>

      <Button title="Verify & continue" onPress={() => verify()} loading={verifying} style={{ marginTop: 'auto' }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 16, color: colors.muted, lineHeight: 24 },
  strong: { color: colors.ink, fontWeight: '700' },
  boxes: { flexDirection: 'row', gap: 8 },
  box: {
    flex: 1, height: 60, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  boxFilled: { borderColor: colors.primary },
  boxActive: { borderColor: colors.ink, borderWidth: 2 },
  digit: { fontSize: 24, fontWeight: '800', color: colors.ink },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  resendRow: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { fontSize: 14, fontWeight: '700', color: colors.primary },
});
