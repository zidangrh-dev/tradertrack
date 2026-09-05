import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { confirmAsk } from '../lib/notify';
import { colors, radius } from '../theme';
import { ChangePasswordModal } from './ChangePasswordModal';

// Bilah profil global khusus layar HP (<900): logo kiri, avatar kanan dengan
// menu Ganti kata sandi / Keluar — sisi HP dari Sidebar desktop.
export function MobileProfileBar() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const logout = () => {
    setMenuOpen(false);
    confirmAsk(
      'Keluar dari akun?',
      `Sesi Anda sebagai ${user?.display_name ?? 'pengguna'} akan diakhiri dan kembali ke halaman masuk.`,
      () => signOut(),
      { okLabel: 'Keluar', danger: true },
    );
  };

  return (
    <View style={styles.bar}>
      <Image source={require('../../assets/zproject-logo.jpg')} style={styles.brandMark} resizeMode="contain" />
      <Text style={styles.brand}>
        Z<Text style={styles.brandLight}>PROJECT</Text>
      </Text>

      <View style={{ marginLeft: 'auto' }}>
        <Pressable
          style={({ pressed }) => [styles.avatarBtn, pressed && { opacity: 0.8 }]}
          onPress={() => setMenuOpen((v) => !v)}
          accessibilityLabel="Menu akun"
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.display_name ?? 'TT').slice(0, 2).toUpperCase()}</Text>
          </View>
          <Text style={[styles.caret, menuOpen && { color: colors.primary }]}>▾</Text>
        </Pressable>

        {menuOpen && (
          <>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
            <View style={styles.menu}>
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: '#F2F4F9' }]}
                onPress={() => { setMenuOpen(false); setShowPassword(true); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuLabel}>Ganti kata sandi</Text>
                  <Text style={styles.menuHint}>Perbarui kata sandi login Anda</Text>
                </View>
              </Pressable>
              <View style={styles.divider} />
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: '#F2F4F9' }]}
                onPress={logout}
              >
                <Text style={styles.menuDanger}>Keluar</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <ChangePasswordModal open={showPassword} onClose={() => setShowPassword(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 46, paddingHorizontal: 14,
    backgroundColor: colors.canvas,
    // zIndex tinggi: subtree bar (termasuk dropdown absolut) menggambar di atas
    // konten Tabs (sibling belakangan) sehingga menu tidak terpotong.
    zIndex: 100,
  },
  brandMark: { width: 26, height: 26, borderRadius: radius.sm, overflow: 'hidden' },
  brand: { color: colors.text, fontWeight: '800', fontSize: 14, letterSpacing: -0.3 },
  brandLight: { color: colors.faint, fontWeight: '600' },
  avatarBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  avatar: {
    width: 30, height: 30, borderRadius: radius.full, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: '800', fontSize: 11 },
  caret: { fontSize: 8, color: colors.faint },
  menu: {
    position: 'absolute', right: 0, top: 40,
    minWidth: 220, backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
    shadowColor: '#0F162A', shadowOpacity: 0.16, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 24, zIndex: 10,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 },
  menuLabel: { color: colors.text, fontSize: 12, fontWeight: '600' },
  menuHint: { color: colors.faint, fontSize: 9, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.line },
  menuDanger: { color: colors.red, fontSize: 12, fontWeight: '700' },
});
