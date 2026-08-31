import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, type AccountRow } from '../../src/lib/api';
import { useAdminOnly } from '../../src/hooks/useRoleGuard';
import { colors, radius } from '../../src/theme';
import { Button, Field, PageHeader, Sheet } from '../../src/components/ui';

export default function Accounts() {
  useAdminOnly();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [number, setNumber] = useState('');
  const [bank, setBank] = useState('');
  const [holder, setHolder] = useState('');

  const load = useCallback(() => {
    api.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);
  useEffect(load, [load]);

  const toggle = async (acc: AccountRow) => {
    try {
      setAccounts(await api.setAccountActive(acc.id, !acc.is_active));
    } catch (e) {
      Alert.alert('Gagal', (e as Error).message);
    }
  };

  const create = async () => {
    if (!number.trim() || !bank.trim() || !holder.trim()) {
      Alert.alert('Lengkapi data', 'Nomor rekening, nama bank, dan nama pemilik wajib diisi.');
      return;
    }
    try {
      setAccounts(await api.createAccount({ account_number: number.trim(), bank_name: bank.trim(), account_holder_name: holder.trim() }));
      setShowNew(false); setNumber(''); setBank(''); setHolder('');
    } catch (e) {
      Alert.alert('Gagal', (e as Error).message);
    }
  };

  return (
    <View style={styles.wrap}>
      <PageHeader
        title="Master rekening"
        subtitle="Rekening yang pernah dipakai order tidak dapat dihapus — cukup dinonaktifkan."
        action={<Button label="Tambah rekening" icon="+" onPress={() => setShowNew(true)} />}
      />

      <FlatList
        data={accounts}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ gap: 10, padding: 16, paddingBottom: 24 }}
        renderItem={({ item: a }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.number}>{a.account_number}</Text>
              <Text style={styles.meta}>{a.bank_name} · {a.account_holder_name}</Text>
              <Text style={styles.usage}>{a.orders} order tercatat</Text>
            </View>
            <Text style={[styles.badge, a.is_active ? styles.active : styles.inactive]}>
              {a.is_active ? 'Aktif' : 'Nonaktif'}
            </Text>
            <Pressable onPress={() => toggle(a)} hitSlop={6}>
              <Text style={styles.action}>{a.is_active ? 'Nonaktifkan' : 'Aktifkan'}</Text>
            </Pressable>
          </View>
        )}
      />

      <Sheet open={showNew} onClose={() => setShowNew(false)} title="Tambah rekening">
        <Field label="Nomor rekening" value={number} onChangeText={setNumber} placeholder="Contoh: 1280098812" />
        <Field label="Nama bank" value={bank} onChangeText={setBank} placeholder="BCA / Mandiri / BRI / ..." />
        <Field label="Nama pemilik" value={holder} onChangeText={setHolder} placeholder="Nama pemilik rekening" />
        <Button label="Simpan rekening" fullWidth onPress={create} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 16,
    shadowColor: '#0F162A', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 1,
  },
  number: { fontWeight: '800', color: colors.primaryMuted, fontSize: 13 },
  meta: { fontSize: 11, color: colors.muted, marginTop: 3 },
  usage: { fontSize: 9, color: colors.faint, marginTop: 4 },
  badge: { fontSize: 9, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, overflow: 'hidden' },
  active: { color: '#1F7A4D', backgroundColor: '#E3F5EC' },
  inactive: { color: '#A8610F', backgroundColor: '#FCF1DE' },
  action: { color: colors.primary, fontWeight: '700', fontSize: 11 },
});
