// Token tema ZProject — palet terang untuk mode Operate.
// Satu sumber kebenaran warna, radius, dan spacing.

export const colors = {
  // Brand
  primary: '#1F4B7A',
  primarySoft: '#EAF1F8',
  primaryMuted: '#4E6E92',
  onPrimary: '#FFFFFF',
  brand: '#1F4B7A',
  onBrand: '#FFFFFF',

  // Surfaces
  canvas: '#F4F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#E9EDF2',
  line: '#D8DEE6',

  // Text — ketiganya lolos WCAG AA (4.5:1) di atas surface putih.
  text: '#17202B',
  muted: '#596675',
  faint: '#6B747F',

  // Status
  amber: '#7A6540',
  blue: '#1F4B7A',
  green: '#3E6654',
  red: '#A34848',
};

// Permukaan gelap: latar panggung pratinjau foto + glyph penggantinya.
export const previewStage = { bg: '#1B2432', glyph: '#93A3B8' };

// Slot lampiran foto: kotak putus-putus saat kosong, latar biru sangat muda.
export const slotPalette = { border: '#B9C8DA', bg: '#F4F8FD' };

// Catatan peringatan (bukti belum lengkap) — senada pendingPalette.
export const notePalette = { fg: '#8A5310', bg: '#FCF3E3', accent: '#A8610F' };

// Tabel data: semua permukaan diturunkan dari palet inti, bukan keluarga abu
// terpisah. rowAlt sengaja memakai canvas agar baris selang-seling menyatu
// dengan halaman, bukan memperkenalkan abu kelima.
export const tablePalette = {
  headerBg: colors.canvas,
  headerText: colors.muted,
  rowAlt: colors.canvas,
  rowLine: colors.surfaceAlt,
  footerBg: colors.canvas,
};

// Penanda bukti foto lengkap pada baris tabel & kartu order.
export const proofOkColor = colors.green;
// Chip bukti pada kartu order selesai — teks hijau di atas latar hijau muda.
export const proofChipPalette = { fg: colors.green, bg: '#E3F5EC' };

export const radius = { sm: 8, md: 12, lg: 16, full: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Palet status khusus (badge Bermasalah/Tertunda) — dipakai lintas layar.
export const problemPalette = { fg: '#B23E35', bg: '#FCE9E6' };
export const pendingPalette = { fg: '#9B590E', bg: '#FCF1DE' };

// Backdrop gelap bersama untuk semua modal kustom.
export const backdropColor = 'rgba(15,22,42,.45)';

// Hilangkan outline hitam bawaan browser pada TextInput (react-native-web).
export const webNoOutline = ({ outlineStyle: 'none', outlineWidth: 0 } as unknown) as import('react-native').ViewStyle;

export const statusLabel = {
  data_masuk: 'Data masuk',
  proses_pick_up: 'Proses pick up',
  done_pickup: 'Done pickup',
  selesai: 'Selesai',
} as const;

export type Status = keyof typeof statusLabel;

// Urutan alur order — SATU sumber kebenaran. Kanban, drag, dan pengurutan
// mengacu ke sini agar penambahan status tidak perlu menyunting banyak tempat.
export const STATUS_FLOW: Status[] = ['data_masuk', 'proses_pick_up', 'done_pickup', 'selesai'];

export const pickupMethodLabel = {
  zaydan_ambilan_gjm: 'Zaydan Ambilan GJM',
  self_pick_up: 'Self Pick Up',
} as const;

// Opsi siap pakai untuk Select/filter — derive dari label di atas agar tidak ada duplikasi teks.
export const statusOptions = Object.entries(statusLabel).map(([value, label]) => ({ value, label }));
export const pickupMethodOptions = Object.entries(pickupMethodLabel).map(([value, label]) => ({ value, label }));
