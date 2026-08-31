// Token tema TraderTrack — palet terang untuk mode Operate.
// Satu sumber kebenaran warna, radius, dan spacing.

export const colors = {
  // Brand
  primary: '#4F5DF5',
  primarySoft: '#ECEFFE',
  primaryMuted: '#7E89F8',
  onPrimary: '#FFFFFF',
  brand: '#C7F544',
  onBrand: '#1B2233',

  // Surfaces
  canvas: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1F8',
  line: '#E4E8F1',

  // Text
  text: '#1B2233',
  muted: '#677084',
  faint: '#9AA3B2',

  // Status
  amber: '#E8A33D',
  blue: '#4C8DE8',
  green: '#2FA36B',
  red: '#E2604D',
};

export const radius = { sm: 8, md: 12, lg: 16, full: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const statusLabel = {
  data_masuk: 'Data masuk',
  proses_pick_up: 'Proses pick up',
  selesai: 'Selesai',
} as const;

export type Status = keyof typeof statusLabel;

export const pickupMethodLabel = {
  zaydan_ambilan_gjm: 'Zaydan Ambilan GJM',
  self_pick_up: 'Self Pick Up',
} as const;
