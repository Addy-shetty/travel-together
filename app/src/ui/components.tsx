import type { ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  View, type TextInputProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BackIcon, CloseIcon } from './icons';
import { colors, radius, type } from './theme';

export function Screen({
  children, scroll = false, style, edges = ['top', 'bottom'], refreshing, onRefresh, footer,
}: {
  children: ReactNode; scroll?: boolean; style?: ViewStyle; edges?: Edge[];
  refreshing?: boolean; onRefresh?: () => void; footer?: ReactNode;
}) {
  const body = scroll
    ? (
      <ScrollView
        contentContainerStyle={[styles.content, style]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
      >
        {children}
      </ScrollView>
    )
    : <View style={[styles.content, styles.fill, style]}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {body}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Button({
  title, onPress, variant = 'primary', loading = false, disabled = false, style,
}: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={variant === 'primary' ? '#FFFFFF' : colors.primary} />
        : <Text style={[styles.buttonText, variant !== 'primary' && styles.buttonTextAlt]}>{title}</Text>}
    </Pressable>
  );
}

export function TextField({ label, error, hint, ...input }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#7A8791"
        {...input}
        accessibilityLabel={label}
        style={[styles.input, error ? styles.inputError : null, input.style]}
      />
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
        : hint ? <Text style={type.small}>{hint}</Text> : null}
    </View>
  );
}

export function HeaderButton({ kind = 'back', onPress }: { kind?: 'back' | 'close'; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={kind === 'back' ? 'Back' : 'Close'}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
      style={styles.headerButton}
    >
      {kind === 'back' ? <BackIcon /> : <CloseIcon />}
    </Pressable>
  );
}

export function ErrorText({ children }: { children: string | null }) {
  if (!children) return null;
  return <Text style={styles.error} accessibilityLiveRegion="polite">{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 8, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 16, flexGrow: 1 },
  button: { height: 54, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  buttonTextAlt: { color: colors.ink, fontSize: 16 },
  field: { gap: 8 },
  input: {
    height: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface,
    paddingHorizontal: 14, fontSize: 16, color: colors.ink,
  },
  inputError: { borderColor: colors.owe },
  error: { color: colors.owe, fontSize: 13, fontWeight: '600' },
  headerButton: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1,
    borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
});
