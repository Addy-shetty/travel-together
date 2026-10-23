// Design tokens from the Travel-Together wireframes.
export const colors = {
  bg: '#F3F5F7',
  surface: '#FFFFFF',
  ink: '#111C24',
  inkSoft: '#24333D',
  muted: '#52606B',
  line: '#DCE2E7',
  lineSoft: '#EEF1F4',
  primary: '#0B5D6B',
  primaryDark: '#07434E',
  primarySoft: '#E2F0F2',
  onPrimarySoft: '#CFE6EA',
  owe: '#A94608',
  oweSoft: '#FBEBDD',
  gets: '#1B5FA8',
  getsSoft: '#E3EEFA',
  track: '#E6EAEE',
} as const;

export const radius = { sm: 10, md: 12, lg: 14, xl: 18, xxl: 22 } as const;

export const type = {
  title: { fontSize: 28, fontWeight: '800' as const, color: colors.ink },
  heading: { fontSize: 22, fontWeight: '800' as const, color: colors.ink },
  body: { fontSize: 16, color: colors.ink },
  label: { fontSize: 14, fontWeight: '600' as const, color: colors.ink },
  small: { fontSize: 13, color: colors.muted },
};
