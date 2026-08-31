import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { api, type OrderView } from '../../src/lib/api';
import { useOrders } from '../../src/hooks/useOrders';
import { useAdminOnly } from '../../src/hooks/useRoleGuard';
import { colors, radius, space } from '../../src/theme';
import { dateTime } from '../../src/lib/format';
import { Button, EmptyState, Field, OrderCard, PageHeader, Sheet } from '../../src/components/ui';
import { OrderDetailModal } from '../../src/components/OrderDetailModal';

export default function Pickup() {
  useAdminOnly();
  const { orders, refresh } = useOrders({ status: 'data_masuk' });
  const queue = useMemo(() => orders.filter((o) => o.status === 'data_masuk'), [orders]);
  const pickedToday = useMemo(() => orders.filter((o) => o.status === 'proses_pick_up').length, [orders]);

  const [scanOpen, setScanOpen] = useState(false);
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState<OrderView | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const doScan = async (value: string) => {
    const c = value.trim();
    if (!c) return;
    setCode('');
    setScanOpen(false);
    try {
      const result = await api.scan(c);
      if (!result) {
        Alert.alert('Tidak ditemukan', `"${c}" tidak cocok dengan nomor pesanan mana pun.`);
        return;
      }
      if (result.status !== 'proses_pick_up') {
        setInfo(`Order #${result.order_number} sudah diproses · ${result.picked_up_at ? dateTime(result.picked_up_at) : ''}`);
      } else {
        setInfo(`#${result.order_number} → Proses pick up`);
      }
      refresh();
    } catch (e) {
      Alert.alert('Gagal', (e as Error).message);
    }
  };

  return (
    <View style={styles.wrap}>
      <PageHeader
        title="Pick up"
        subtitle="Cocokkan paket yang datang dengan nomor pesanan."
        action={
          <Button label="Scan" icon="⌗" onPress={() => setScanOpen(true)} />
        }
      />

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Scan. Cocokkan. Pindahkan.</Text>
          <Text style={styles.heroSub}>Setiap scan mencocokkan nomor pesanan ke order yang tepat dan mencatat waktu serta adminnya.</Text>
        </View>
        <View style={styles.heroStats}>
          <View style={styles.stat}><Text style={styles.statValue}>{queue.length}</Text><Text style={styles.statLabel}>Menunggu scan</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{pickedToday}</Text><Text style={styles.statLabel}>Sudah dipindai</Text></View>
        </View>
      </View>

      {!!info && (
        <Pressable style={styles.info} onPress={() => setInfo(null)}>
          <Text style={styles.infoText}>{info}</Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>Antrean paket ({queue.length})</Text>
      {queue.length === 0 ? (
        <EmptyState icon="⌗" text="Tidak ada paket yang menunggu scan." />
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 24, paddingHorizontal: 16 }}
          renderItem={({ item: o }) => (
            <OrderCard
              order={o}
              onPress={() => setSelected(o)}
              actions={
                <Button label="Proses pick up" icon="→" variant="soft" size="sm" fullWidth style={{ marginTop: 12 }} onPress={async () => {
                  try {
                    await api.updateStatus(o.id, 'proses_pick_up');
                    setInfo(`#${o.order_number} → Proses pick up`);
                    refresh();
                  } catch (e) {
                    Alert.alert('Gagal', (e as Error).message);
                  }
                }} />
              }
            />
          )}
        />
      )}

      <Sheet open={scanOpen} onClose={() => setScanOpen(false)} title="Scan nomor pesanan">
        <Text style={styles.note}>
          {Platform.OS === 'web'
            ? 'Prototype web tidak membuka kamera asli — masukkan nomor pesanan untuk simulasi pemindaian.'
            : 'Kamera native terbuka di APK Android. Di prototype ini masukkan nomor pesanan manual.'}
        </Text>
        <Field label="Nomor pesanan" value={code} onChangeText={setCode} placeholder="Contoh: TRK-240626-018" autoCapitalize="characters" />
        <Button label="Cocokkan" fullWidth onPress={() => doScan(code)} />
      </Sheet>

      <OrderDetailModal order={selected} onClose={() => setSelected(null)} onChanged={refresh} />
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { flex: 1 },
  hero: {
    backgroundColor: colors.primarySoft, borderRadius: radius.lg, marginHorizontal: 16, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#DEE2FC',
  },
  heroCopy: { flex: 1 },
  heroTitle: { color: colors.text, fontSize: 20, fontWeight: '800', lineHeight: 27, letterSpacing: -0.3 },
  heroSub: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  heroStats: { flexDirection: 'row', gap: 8 },
  stat: { backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 14, alignItems: 'center', minWidth: 80, borderWidth: 1, borderColor: '#DEE2FC' },
  statValue: { color: colors.primary, fontSize: 20, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 9, marginTop: 3 },
  info: { backgroundColor: '#E3F5EC', borderRadius: radius.sm, padding: 12, marginTop: 12, marginHorizontal: 16 },
  infoText: { color: '#1F7A4D', fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 16, marginBottom: 10, paddingHorizontal: 16 },
  note: { fontSize: 11, color: colors.muted, lineHeight: 17, marginBottom: space.lg },
});
