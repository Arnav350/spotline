export const colors = {
  bg: '#141414',
  bgPanel: '#1a1a1a',
  bgNav: '#161616',
  bgCard: '#202020',
  bgCardHover: '#272727',
  border: '#242424',
  borderSubtle: '#2a2a2a',
  borderMed: '#333',
  borderStrong: '#444',
  accent: '#7c3aed',
  accentLight: '#9d6fff',
  accentDark: '#6d28d9',
  text: '#ffffff',
  textSecondary: '#aaa',
  textMuted: '#777',
  textFaint: '#666',
  textGhost: '#444',
  danger: '#ef4444',
  dangerLight: '#f87171',
  dangerBg: '#1a1010',
  success: '#22c55e',
} as const;

export const fontSize = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 14,
  xl: 18,
} as const;

export const fontWeight = {
  medium: 500,
  bold: 700,
} as const;

export const radius = {
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 10,
  pill: 999,
} as const;

export const spacing = {
  xxs: 2,   // sub-grid — micro offsets, thin dividers
  xs: 4,    // quarter grid — icon gaps, tight labels
  sm: 8,    // base unit — button padding, standard gaps
  md: 12,   // 1.5× — medium sections
  lg: 16,   // 2× — panel padding, large gaps
  xl: 24,   // 3× — modal/section spacing
  xxl: 32,  // 4× — large container padding
} as const;
