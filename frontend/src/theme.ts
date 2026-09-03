// Token tema ZProject — palet terang untuk mode Operate.
// Satu sumber kebenaran warna, radius, dan spacing.

export const colors = {
  // Brand
  primary: '#1F4B7A',
  primarySoft: '#EAF1F8',
  primaryMuted: '#52749A',
  onPrimary: '#FFFFFF',
  brand: '#1F4B7A',
  onBrand: '#FFFFFF',

  // Surfaces
  canvas: '#F4F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#E9EDF2',
  line: '#D8DEE6',

  // Text
  text: '#17202B',
  muted: '#596675',
  faint: '#8995A3',

  // Status
  amber: '#7A6540',
  blue: '#1F4B7A',
  green: '#3E6654',
  red: '#A34848',
};

export const radius = { sm: 8, md: 12, lg: 16, full: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Palet status khusus (badge Bermasalah/Tertunda) — dipakai lintas layar.
export const problemPalette = { fg: '#C1433A', bg: '#FCE9E6' };
export const pendingPalette = { fg: '#A8610F', bg: '#FCF1DE' };

// Backdrop gelap bersama untuk semua modal kustom.
export const backdropColor = 'rgba(15,22,42,.45)';

// Hilangkan outline hitam bawaan browser pada TextInput (react-native-web).
export const webNoOutline = ({ outlineStyle: 'none', outlineWidth: 0 } as unknown) as import('react-native').ViewStyle;

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

// Opsi siap pakai untuk Select/filter — derive dari label di atas agar tidak ada duplikasi teks.
export const statusOptions = Object.entries(statusLabel).map(([value, label]) => ({ value, label }));
export const pickupMethodOptions = Object.entries(pickupMethodLabel).map(([value, label]) => ({ value, label }));
