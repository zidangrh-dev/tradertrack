import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { api, type OrderView } from '../../src/lib/api';
import { notify } from '../../src/lib/notify';
import { useOrders } from '../../src/hooks/useOrders';
import { useAdminOnly } from '../../src/hooks/useRoleGuard';
import { colors, radius, space } from '../../src/theme';
import { dateTime } from '../../src/lib/format';
import { Button, EmptyState, Field, OrderCard, PageHeader, Sheet } from '../../src/components/ui';
import { OrderDetailModal } from '../../src/components/OrderDetailModal';

export default function Pickup() {
  useAdminOnly();
  const { orders, refresh } = useOrders();
  const pending = useMemo(() => orders.filter((o) => o.status === 'proses_pick_up'), [orders]);
  const pickedToday = pending.length;
  const totalOrders = pending.length;

  const [scanOpen, setScanOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<OrderView | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const completePickup = async (o: OrderView) => {
    // Foto bukti cukup → selesaikan langsung; kurang → buka modal untuk tambah foto.
    if (o.photo_count < 1) {
      setSelected(o);
      return;
    }
    setBusy(o.id);
    try {
      await api.completeOrder(o.id, '');
      setInfo(`${o.order_number} → Selesai`);
      refresh();
    } catch (e) {
      notify('Gagal', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doScan = async () => {
    const c = code.trim();
    if (!c) return;
    setCode('');
    setScanOpen(false);
    try {
      const result = await api.scan(c);
      if (!result) {
        notify('Tidak ditemukan', `"${c}" tidak cocok dengan nomor pesanan mana pun.`);
        return;
      }
      if (result.status !== 'proses_pick_up') {
        setInfo(`Order #${result.order_number} sudah diproses · ${result.picked_up_at ? dateTime(result.picked_up_at) : ''}`);
      } else {
        setInfo(`${result.order_number} → Proses pick up`);
      }
      refresh();
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };

  return (
    <View style={styles.wrap}>
      <PageHeader
        title="Pick up"
        subtitle="Kelola verifikasi paket dan pindahkan order dengan bukti yang tepat."
        action={<Button label="Scan nomor pesanan" icon="⌗" onPress={() => setScanOpen(true)} />}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.controlBar}>
          <View style={styles.controlIntro}>
            <Text style={styles.controlTitle}>Workspace pick up</Text>
            <Text style={styles.controlSub}>Order siap pickup dikelola melalui scan dan verifikasi.</Text>
          </View>
          <View style={styles.metrics}>
            <View style={styles.metric}><Text style={styles.metricValue}>{pending.length}</Text><Text style={styles.metricLabel}>Order pickup</Text></View>
            <View style={styles.metric}><Text style={styles.metricValue}>{pickedToday}</Text><Text style={styles.metricLabel}>Diproses</Text></View>
            <View style={styles.metric}><Text style={styles.metricValue}>{totalOrders}</Text><Text style={styles.metricLabel}>Total aktif</Text></View>
          </View>
        </View>

        {!!info && (
          <Pressable style={styles.info} onPress={() => setInfo(null)}>
            <Text style={styles.infoText}>{info}</Text>
          </Pressable>
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Order siap pickup</Text>
            <Text style={styles.sectionSub}>Order berstatus pickup yang menunggu penyelesaian.</Text>
          </View>
          <Text style={styles.count}>{pending.length}</Text>
        </View>
        <View style={styles.listWrap}>
          {pending.length === 0 ? (
            <EmptyState icon="→" text="Tidak ada order dalam proses." />
          ) : pending.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onPress={() => setSelected(o)}
              actions={
                <Button label={busy === o.id ? 'Menyelesaikan…' : 'Selesaikan order'} icon="✓" variant="soft" size="sm" fullWidth style={{ marginTop: 12 }}
                  disabled={busy !== null}
                  onPress={() => completePickup(o)} />
              }
            />
          ))}
        </View>
      </ScrollView>

      <Sheet open={scanOpen} onClose={() => setScanOpen(false)} title="Scan nomor pesanan">
        <Text style={styles.note}>
          {Platform.OS === 'web'
            ? 'Prototype web tidak membuka kamera asli — masukkan nomor pesanan untuk simulasi pemindaian.'
            : 'Kamera native terbuka di APK Android. Di prototype ini masukkan nomor pesanan manual.'}
        </Text>
        <Field label="Nomor pesanan" value={code} onChangeText={setCode} placeholder="Contoh: TRK-240626-018" autoCapitalize="characters" />
        <Button label="Cocokkan" fullWidth onPress={() => doScan()} />
      </Sheet>

      <OrderDetailModal order={selected} onClose={() => setSelected(null)} onChanged={refresh} />
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { flex: 1 },
  controlBar: {
    marginHorizontal: 16, padding: 16, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  },
  controlIntro: { flex: 1 },
  controlTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  controlSub: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  metrics: { flexDirection: 'row', gap: 18 },
  metric: { minWidth: 72 },
  metricValue: { color: colors.primary, fontSize: 20, fontWeight: '800' },
  metricLabel: { color: colors.muted, fontSize: 9, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10, paddingHorizontal: 16 },
  sectionSub: { color: colors.muted, fontSize: 10, marginTop: 3 },
  count: { color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: '800' },
  info: { backgroundColor: '#E3F5EC', borderRadius: radius.sm, padding: 12, marginTop: 12, marginHorizontal: 16 },
  infoText: { color: '#1F7A4D', fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  listWrap: { gap: 10, paddingHorizontal: 16 },
  note: { fontSize: 11, color: colors.muted, lineHeight: 17, marginBottom: space.lg },
  scanAdd: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9C8DA', backgroundColor: '#F4F8FD',
    borderRadius: radius.md, paddingVertical: 18, alignItems: 'center', gap: 3, marginBottom: 14,
  },
  scanAttached: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14,
    backgroundColor: '#F4F8FD', borderWidth: 1, borderColor: '#DCE7F5', borderRadius: radius.md, padding: 12,
  },
  scanAddIcon: { fontSize: 22, color: colors.primaryMuted, lineHeight: 24 },
  scanAddLabel: { fontSize: 11, fontWeight: '700', color: '#557EAE' },
  scanAddHint: { fontSize: 9, color: '#7E94AC', marginTop: 2 },
});
