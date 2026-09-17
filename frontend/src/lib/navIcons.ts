import type Ionicons from '@expo/vector-icons/Ionicons';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Satu sumber ikon navigasi untuk Sidebar (layar lebar) dan FloatingTabBar (HP).
// Sebelumnya keduanya menyimpan daftar glyph sendiri-sendiri dan sudah menyimpang:
// Sidebar memakai ▦ ≡ ⌗ ◒ ▤ ⚙, tab bar memakai set yang mirip tapi tidak sama.
// Kuncinya = nama route, jadi tab bar bisa mencarinya langsung.
export const NAV_ICON: Record<string, { on: IconName; off: IconName }> = {
  index: { on: 'grid', off: 'grid-outline' },
  orders: { on: 'list', off: 'list-outline' },
  pickup: { on: 'cube', off: 'cube-outline' },
  analytics: { on: 'stats-chart', off: 'stats-chart-outline' },
  'master-data': { on: 'albums', off: 'albums-outline' },
  settings: { on: 'settings', off: 'settings-outline' },
};

export const NAV_ICON_FALLBACK = { on: 'ellipse', off: 'ellipse-outline' } as const;
