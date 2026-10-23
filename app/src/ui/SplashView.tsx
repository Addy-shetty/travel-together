import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LogoMark } from './icons';
import { colors } from './theme';

// Screen 1.1: shown while the saved session is read from secure storage.
export function SplashView() {
  return (
    <View style={styles.root} accessibilityLabel="Travel-Together is loading">
      <View style={styles.center}>
        <View style={styles.logo}><LogoMark size={64} /></View>
        <Text style={styles.name}>Travel-Together</Text>
        <Text style={styles.tagline}>One trip. One wallet. A fair split.</Text>
      </View>
      <ActivityIndicator color="#FFFFFF" />
      <Text style={styles.footer}>Pay and split with UPI</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', paddingBottom: 56, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  logo: { width: 112, height: 112, borderRadius: 32, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  name: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  tagline: { color: colors.onPrimarySoft, fontSize: 16 },
  footer: { color: colors.onPrimarySoft, fontSize: 12 },
});
