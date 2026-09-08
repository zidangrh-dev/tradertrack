import { useState } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_VERSION } from '../lib/api';
import { notify } from '../lib/notify';
import { colors, radius } from '../theme';

/**
 * Popup pembaruan yang mengunci aplikasi: tanpa tombol tutup, tap di luar dan
 * tombol Back Android tidak menutupnya. Versi lama memang tidak boleh dipakai.
 */
export function UpdateGate({ requiredVersion, updateUrl, onRetry }: {
  requiredVersion: string;
  updateUrl: string;
  onRetry: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const unduh = async () => {
    if (!updateUrl) return;
    try {
      const bisa = await Linking.canOpenURL(updateUrl);
      if (!bisa) throw new Error('Tautan tidak dapat dibuka.');
      await Linking.openURL(updateUrl);
    } catch {
      notify('Gagal membuka tautan', 'Salin alamat unduhan ini ke peramban: ' + updateUrl);
    }
  };

  const cobaLagi = async () => {
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      // Sengaja kosong: tombol Back Android tidak boleh menutup gerbang.
      onRequestClose={() => undefined}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconBox}>
            <Text style={styles.icon}>↓</Text>
          </View>

          <Text style={styles.title}>Pembaruan diperlukan</Text>
          <Text style={styles.body}>
            Versi aplikasi yang terpasang sudah tidak didukung. Perbarui aplikasi untuk melanjutkan.
          </Text>

          <View style={styles.versionBox}>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Versi terpasang</Text>
              <Text style={styles.versionOld}>{APP_VERSION || '—'}</Text>
            </View>
            <View style={styles.versionDivider} />
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Versi diperlukan</Text>
              <Text style={styles.versionNew}>{requiredVersion || '—'}</Text>
            </View>
          </View>

          {!!updateUrl && (
            <Pressable
              onPress={unduh}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>Unduh pembaruan</Text>
            </Pressable>
          )}

          <Pressable
            onPress={cobaLagi}
            disabled={busy}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.9 }, busy && { opacity: 0.5 }]}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>{busy ? 'Memeriksa…' : 'Sudah diperbarui — coba lagi'}</Text>
          </Pressable>

          <Text style={styles.foot}>
            {updateUrl
              ? 'Pasang berkas yang diunduh, lalu buka kembali aplikasi ini.'
              : 'Hubungi admin untuk mendapatkan berkas pembaruan.'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(15,22,42,.72)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  card: {
    width: '100%', maxWidth: 380, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: 22,
    shadowColor: '#0F162A', shadowOpacity: 0.24, shadowOffset: { width: 0, height: 18 }, shadowRadius: 34, elevation: 18,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  icon: { fontSize: 22, color: colors.primary, fontWeight: '800', lineHeight: 26 },
  title: { fontSize: 19, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  body: { fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: 8 },
  versionBox: {
    marginTop: 16, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden',
  },
  versionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  versionDivider: { height: 1, backgroundColor: colors.surfaceAlt },
  versionLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  versionOld: { fontSize: 13, fontWeight: '800', color: colors.faint, fontVariant: ['tabular-nums'] },
  versionNew: { fontSize: 13, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },
  primaryBtn: {
    height: 44, borderRadius: radius.md, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: 16,
  },
  primaryText: { color: colors.onPrimary, fontSize: 13, fontWeight: '800' },
  secondaryBtn: {
    height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  secondaryText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  foot: { fontSize: 10, color: colors.faint, lineHeight: 15, marginTop: 12, textAlign: 'center' },
});
