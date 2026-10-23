import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CURRENCIES, type CurrencyCode } from '@/lib/money';
import { colors, radius } from './theme';

const CURRENCY_LIST = Object.entries(CURRENCIES).map(([code, info]) => ({
  code: code as CurrencyCode,
  ...info,
}));

type Props = {
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
  label?: string;
};

export function CurrencyPicker({ value, onChange, label }: Props) {
  const [open, setOpen] = useState(false);
  const current = CURRENCIES[value];

  return (
    <>
      <View style={styles.container}>
        {label && <Text style={styles.label}>{label}</Text>}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Currency: ${current.name}`}
          onPress={() => setOpen(true)}
          style={styles.button}
        >
          <Text style={styles.symbol}>{current.symbol}</Text>
          <Text style={styles.code}>{value}</Text>
          <Text style={styles.name}>{current.name}</Text>
          <Text style={styles.chevron}>▼</Text>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>Select Currency</Text>
            <FlatList
              data={CURRENCY_LIST}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.code === value }}
                  onPress={() => {
                    onChange(item.code);
                    setOpen(false);
                  }}
                  style={[styles.option, item.code === value && styles.optionActive]}
                >
                  <Text style={styles.optionSymbol}>{item.symbol}</Text>
                  <View style={styles.optionText}>
                    <Text style={styles.optionCode}>{item.code}</Text>
                    <Text style={styles.optionName}>{item.name}</Text>
                  </View>
                  {item.code === value && <Text style={styles.check}>✓</Text>}
                </Pressable>
              )}
              style={styles.list}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  symbol: { fontSize: 18, fontWeight: '700', color: colors.primary, width: 28 },
  code: { fontSize: 15, fontWeight: '700', color: colors.ink },
  name: { flex: 1, fontSize: 14, color: colors.muted },
  chevron: { fontSize: 10, color: colors.muted },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingBottom: 34,
    maxHeight: '70%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.line,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 12 },
  list: { paddingHorizontal: 16 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
  },
  optionActive: { backgroundColor: colors.primarySoft },
  optionSymbol: { fontSize: 20, fontWeight: '700', color: colors.ink, width: 32, textAlign: 'center' },
  optionText: { flex: 1 },
  optionCode: { fontSize: 15, fontWeight: '700', color: colors.ink },
  optionName: { fontSize: 13, color: colors.muted },
  check: { fontSize: 18, color: colors.primary, fontWeight: '700' },
});
