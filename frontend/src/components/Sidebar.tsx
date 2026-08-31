import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useOrders } from '../hooks/useOrders';
import { colors, radius, space } from '../theme';

interface Item {
  href: string;
  icon: string;
  label: string;
  badge?: string;
  badgeDanger?: boolean;
  adminOnly?: boolean;
}

export function Sidebar() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = user?.role === 'admin';
  const { orders } = useOrders();

  const total = orders.length;
  const pickupCount = orders.filter((o) => o.status === 'proses_pick_up').length;

  const MAIN_ITEMS: Item[] = [
    { href: '/(app)', icon: '▦', label: 'Papan kerja', adminOnly: true },
    { href: '/(app)/orders', icon: '≡', label: 'Daftar order', badge: String(total) },
    { href: '/(app)/pickup', icon: '⌗', label: 'Pick up', badge: String(pickupCount), badgeDanger: true, adminOnly: true },
    { href: '/(app)/analytics', icon: '◒', label: 'Analytics', adminOnly: true },
  ];

  const MANAGE_ITEMS: Item[] = [
    { href: '/(app)/accounts', icon: '▤', label: 'Master rekening', adminOnly: true },
    { href: '/(app)/settings', icon: '⚙', label: 'Pengaturan', adminOnly: true },
  ];

  const isActive = (item: Item) =>
    item.href === '/(app)' ? pathname === '/' || pathname?.endsWith('(app)') : pathname?.includes(item.href.split('/').pop() ?? '');

  const renderItem = (item: Item) => {
    const active = isActive(item);
    return (
      <Pressable
        key={item.href}
        style={({ pressed }) => [styles.navItem, active && styles.navActive, pressed && { opacity: 0.85 }]}
        onPress={() => router.navigate(item.href as never)}
      >
        <Text style={[styles.navIcon, active && styles.navIconActive]}>{item.icon}</Text>
        <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
        {!!item.badge && (
          <Text style={[styles.badge, item.badgeDanger && styles.badgeDanger]}>{item.badge}</Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.sidebar}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>T</Text>
        </View>
        <Text style={styles.brand}>
          TRADER<Text style={styles.brandLight}>TRACK</Text>
        </Text>
      </View>

      <Text style={styles.section}>WORKSPACE</Text>
      <View style={styles.group}>{MAIN_ITEMS.filter((i) => isAdmin || !i.adminOnly).map(renderItem)}</View>

      {isAdmin && (
        <>
          <Text style={styles.section}>PENGELOLAAN</Text>
          <View style={styles.group}>{MANAGE_ITEMS.map(renderItem)}</View>
        </>
      )}

      <View style={{ marginTop: 'auto' }}>
        <View style={styles.status}>
          <View style={styles.statusDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>Semua sistem normal</Text>
            <Text style={styles.statusSub}>Sinkron realtime aktif</Text>
          </View>
        </View>
        <Pressable style={({ pressed }) => [styles.profile, pressed && { opacity: 0.8 }]} onPress={signOut}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.display_name ?? 'TT').slice(0, 2).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.display_name}</Text>
            <Text style={styles.profileRole}>{user?.role === 'admin' ? 'Administrator' : 'Trader'} · Keluar</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 248,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.line,
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 14,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, marginBottom: 26 },
  brandMark: {
    width: 30, height: 30, borderRadius: radius.md, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  brandMarkText: { color: colors.onBrand, fontWeight: '800', fontStyle: 'italic', fontSize: 18 },
  brand: { color: colors.text, fontWeight: '800', fontSize: 15, letterSpacing: -0.5 },
  brandLight: { color: colors.faint, fontWeight: '600' },
  section: {
    color: colors.faint, fontSize: 9, fontWeight: '800', letterSpacing: 1.5,
    paddingHorizontal: 10, marginBottom: 8, marginTop: 16,
  },
  group: { gap: 2 },
  navItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12,
    paddingVertical: 11, borderRadius: radius.md,
  },
  navActive: { backgroundColor: colors.primarySoft },
  navIcon: { color: colors.faint, fontSize: 16, width: 20, textAlign: 'center' },
  navIconActive: { color: colors.primary },
  navLabel: { color: colors.muted, fontSize: 12, flex: 1 },
  navLabelActive: { color: colors.primary, fontWeight: '700' },
  badge: {
    backgroundColor: colors.surfaceAlt, color: colors.muted, fontSize: 10, fontWeight: '700',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full, overflow: 'hidden', minWidth: 22, textAlign: 'center',
  },
  badgeDanger: { backgroundColor: '#FCE9E6', color: '#C1433A' },
  status: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line,
    paddingVertical: 13, paddingHorizontal: 8, marginBottom: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  statusTitle: { color: colors.text, fontSize: 10, fontWeight: '700' },
  statusSub: { color: colors.faint, fontSize: 9, marginTop: 2 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md },
  avatar: {
    width: 30, height: 30, borderRadius: radius.full, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: '800', fontSize: 11 },
  profileName: { color: colors.text, fontSize: 11, fontWeight: '700' },
  profileRole: { color: colors.faint, fontSize: 9, marginTop: 2 },
});
