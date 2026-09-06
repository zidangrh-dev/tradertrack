import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { api, type OrderView } from '../../src/lib/api';
import { notify } from '../../src/lib/notify';
import { useOrders } from '../../src/hooks/useOrders';
import { useAdminOnly } from '../../src/hooks/useRoleGuard';
import { useSettings } from '../../src/hooks/useSettings';
import { colors, radius, space } from '../../src/theme';
import { Button, EmptyState, Field, OrderCard, PageHeader, Sheet } from '../../src/components/ui';
import { OrderDetailModal } from '../../src/components/OrderDetailModal';
import { BarcodeScanner } from '../../src/components/BarcodeScanner';

export default function Pickup() {
  useAdminOnly();
  const { orders, refresh } = useOrders();
  const pending = useMemo(() => orders.filter((o) => o.status === 'proses_pick_up'), [orders]);
  const scannedToday = useMemo(
    () => pending.filter((o) => o.picked_up_at && new Date(o.picked_up_at).toDateString() === new Date().toDateString()).length,
    [pending],
  );

  const [scanOpen, setScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'camera' | 'manual'>(Platform.OS === 'web' ? 'manual' : 'camera');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<OrderView | null>(null);
  const [scanOrder, setScanOrder] = useState<OrderView | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const settings = useSettings();

  const completePickup = async (o: OrderView) => {
    // Foto bukti cukup → selesaikan langsung; kurang → buka modal untuk tambah foto.
    if (o.photo_count < settings.min_photos) {
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

  const doScan = async (raw: string) => {
    const c = raw.trim();
    if (!c) return;
    setCode('');
    setScanOpen(false);
    try {
      const result = await api.scan(c);
      if (!result) {
        notify('Tidak ditemukan', `"${c}" tidak cocok dengan nomor pesanan mana pun.`);
        return;
      }
      refresh();
      // Scan cocok → buka modal detail untuk proses paket (pickup/foto/selesai).
      setScanOrder(result);
    } catch (e) {
      // Order baru (data_masuk) tanpa bukti ditolak server → toast pesannya, tanpa modal.
      notify('Scan tidak dapat diproses', (e as Error).message);
    }
  };

  const openScan = () => {
    setScanMode(Platform.OS === 'web' ? 'manual' : 'camera');
    setCode('');
    setScanOpen(true);
  };

  return (
    <View style={styles.wrap}>
      <PageHeader
        title="Pick up"
        subtitle="Kelola verifikasi paket dan pindahkan order dengan bukti yang tepat."
        action={<Button label="Scan nomor pesanan" icon="⌗" onPress={openScan} />}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.controlBar}>
          <View style={styles.controlIntro}>
            <Text style={styles.controlTitle}>Workspace pick up</Text>
            <Text style={styles.controlSub}>Order siap pickup dikelola melalui scan dan verifikasi.</Text>
          </View>
          <View style={styles.metrics}>
            <View style={styles.metric}><Text style={styles.metricValue}>{pending.length}</Text><Text style={styles.metricLabel}>Order pickup</Text></View>
            <View style={styles.metric}><Text style={styles.metricValue}>{scannedToday}</Text><Text style={styles.metricLabel}>Diskan hari ini</Text></View>
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
        {scanMode === 'camera' ? (
          <>
            <BarcodeScanner
              onDetected={(c) => doScan(c)}
              onClose={() => { setScanOpen(false); }}
            />
            <Button label="Atau masukkan nomor manual" variant="ghost" size="sm" fullWidth onPress={() => setScanMode('manual')} />
          </>
        ) : (
          <>
            <Text style={styles.note}>
              {Platform.OS === 'web'
                ? 'Scan kamera tidak tersedia di browser — masukkan nomor pesanan untuk simulasi pemindaian.'
                : 'Masukkan nomor pesanan secara manual, atau gunakan kamera barcode.'}
            </Text>
            <Field label="Nomor pesanan" value={code} onChangeText={setCode} placeholder="Contoh: TRK-240626-018" autoCapitalize="characters" />
            <Button label="Cocokkan" fullWidth onPress={() => doScan(code)} />
            {Platform.OS !== 'web' && (
              <Button label="Buka kamera barcode" variant="secondary" size="sm" fullWidth onPress={() => setScanMode('camera')} />
            )}
          </>
        )}
      </Sheet>

      <OrderDetailModal order={selected} onClose={() => setSelected(null)} onChanged={refresh} />
      <OrderDetailModal order={scanOrder} onClose={() => setScanOrder(null)} onChanged={refresh} />
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
});
