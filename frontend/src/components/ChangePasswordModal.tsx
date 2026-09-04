import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { notify } from '../lib/notify';
import { colors, radius, webNoOutline } from '../theme';
import { Button, Field, Sheet } from './ui';

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrent(''); setNext(''); setConfirm('');
  }, [open]);

  const save = async () => {
    if (!current || !next) {
      notify('Lengkapi data', 'Kata sandi lama dan baru wajib diisi.');
      return;
    }
    if (next.length < 6) {
      notify('Kata sandi terlalu pendek', 'Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (next !== confirm) {
      notify('Tidak cocok', 'Ulangi kata sandi baru harus sama dengan kata sandi baru.');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      notify('Berhasil', 'Kata sandi Anda telah diganti.');
      onClose();
    } catch (e) {
      notify('Gagal', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Ganti kata sandi">
      <Text style={styles.hint}>
        Gunakan kata sandi baru untuk login berikutnya. Minimal 6 karakter dan berbeda dari kata sandi lama.
      </Text>
      <Field style={webNoOutline} label="Kata sandi lama" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" placeholder="Kata sandi saat ini" />
      <Field style={webNoOutline} label="Kata sandi baru" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" placeholder="Minimal 6 karakter" />
      <Field style={webNoOutline} label="Ulangi kata sandi baru" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" placeholder="Ketik ulang kata sandi baru" />
      <View style={styles.actions}>
        <Button label="Batal" variant="secondary" onPress={onClose} disabled={busy} />
        <Button label={busy ? 'Menyimpan…' : 'Simpan kata sandi'} onPress={save} disabled={busy} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 11, color: colors.muted, lineHeight: 17, marginBottom: 6,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 10,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
});
