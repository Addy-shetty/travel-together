import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { HeaderButton } from './components';
import { colors, radius } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Header({ title, subtitle, back = true, right }: { title: string; subtitle?: string; back?: boolean | 'close'; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {back ? <HeaderButton kind={back === 'close' ? 'close' : 'back'} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(o.key)}
            style={[styles.segmentItem, active && styles.segmentActive]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, active, onPress, dashed }: { label: string; active?: boolean; onPress?: () => void; dashed?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={onPress}
      style={[styles.chip, active && styles.chipActive, dashed && styles.chipDashed]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Avatar({ name, size = 40, strong, dashed }: { name: string; size?: number; strong?: boolean; dashed?: boolean }) {
  const initials = name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 },
      strong && { backgroundColor: colors.primary }, dashed && styles.avatarDashed]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.33 }, strong && { color: '#FFFFFF' }, dashed && { color: colors.muted }]}>{initials}</Text>
    </View>
  );
}

export function Row({ children, onPress, last, style }: { children: ReactNode; onPress?: () => void; last?: boolean; style?: ViewStyle }) {
  const content = <View style={[styles.row, !last && styles.rowDivider, style]}>{children}</View>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress}>{content}</Pressable> : content;
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.section}>{children.toUpperCase()}</Text>;
}

export function Progress({ value, color = colors.primary }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'live' | 'neutral' | 'warn' | 'good' }) {
  const t = { live: [colors.primarySoft, colors.primary], neutral: [colors.track, colors.muted],
    warn: [colors.oweSoft, '#7A3306'], good: [colors.getsSoft, colors.gets] }[tone];
  return <View style={[styles.pill, { backgroundColor: t[0] }]}><Text style={[styles.pillText, { color: t[1] }]}>{label}</Text></View>;
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <View style={[styles.note, tone === 'warn' ? { backgroundColor: colors.oweSoft } : { backgroundColor: colors.primarySoft }]}>
      <Text style={[styles.noteText, { color: tone === 'warn' ? '#5E2805' : colors.primaryDark }]}>{children}</Text>
    </View>
  );
}

export function Loading() {
  return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <View style={[styles.center, { gap: 10, paddingVertical: 32 }]}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      {children}
    </View>
  );
}

export const textStyles = StyleSheet.create({
  strong: { fontSize: 15, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, color: colors.ink },
  sub: { fontSize: 12, color: colors.muted },
  muted: { fontSize: 14, color: colors.muted },
  amount: { fontSize: 15, fontWeight: '800', color: colors.ink },
  owe: { color: colors.owe },
  gets: { color: colors.gets },
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.ink },
  headerSub: { fontSize: 13, color: colors.muted },
  segment: { flexDirection: 'row', gap: 6, backgroundColor: colors.track, borderRadius: radius.md, padding: 4 },
  segmentItem: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  segmentTextActive: { color: colors.ink, fontWeight: '700' },
  chip: { height: 38, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDashed: { borderStyle: 'dashed', borderColor: '#9AA6B0' },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  chipTextActive: { color: '#FFFFFF', fontWeight: '700' },
  avatar: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarDashed: { backgroundColor: colors.surface, borderWidth: 2, borderStyle: 'dashed', borderColor: '#9AA6B0' },
  avatarText: { fontWeight: '800', color: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted },
  track: { height: 8, borderRadius: 99, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  pillText: { fontSize: 12, fontWeight: '700' },
  note: { borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 12 },
  noteText: { fontSize: 13, lineHeight: 19 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22 },
});
