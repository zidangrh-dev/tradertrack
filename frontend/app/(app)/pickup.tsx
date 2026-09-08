import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Platform, useWindowDimensions } from 'react-native';
import { api, type OrderView } from '../../src/lib/api';
import { notify } from '../../src/lib/notify';
import { useOrders } from '../../src/hooks/useOrders';
import { useAdminOnly } from '../../src/hooks/useRoleGuard';
import { useSettings } from '../../src/hooks/useSettings';
import { colors, radius, pickupMethodOptions, space } from '../../src/theme';
import { Button, EmptyState, Field, MultiSelect, OrderCard, PageHeader, SearchInput, Select, Sheet, type SelectOption } from '../../src/components/ui';
import { DateRangeField, endOfDayISO, startOfDayISO } from '../../src/components/DateRangePicker';
import { OrderDetailModal } from '../../src/components/OrderDetailModal';
import { BarcodeScanner } from '../../src/components/BarcodeScanner';


export default function Pickup() {
  useAdminOnly();
  const { width } = useWindowDimensions();
  const isNarrow = width < 700;
  // Layar lebar: kartu disusun dua kolom agar padat & terbaca, bukan pita panjang.
  const wide = width >= 900;

  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [store, setStore] = useState<string[]>([]);
  const [product, setProduct] = useState<string[]>([]);
  const [trader, setTrader] = useState('');
  // Rentang tanggal kosong = semua tanggal.
  const [fromKey, setFromKey] = useState<string | null>(null);
  const [toKey, setToKey] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [traders, setTraders] = useState<SelectOption[]>([]);
  const [stores, setStores] = useState<SelectOption[]>([]);
  const [products, setProducts] = useState<SelectOption[]>([]);

  useEffect(() => {
    api.listUsers().then((users) =>
      setTraders(users.filter((u) => u.is_active).map((u) => ({ value: u.id, label: u.display_name, sub: `@${u.username}` }))),
    ).catch(() => setTraders([]));
    api.listMarketplaceStores().then((ss) =>
      setStores(ss.map((s) => ({ value: s.id, label: s.name }))),
    ).catch(() => setStores([]));
    // Produk nonaktif ikut ditampilkan agar order lama tetap bisa disaring.
    api.listProducts().then((ps) =>
      setProducts(
        [...ps]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => ({ value: p.id, label: p.name, sub: p.is_active ? undefined : 'Nonaktif' })),
      ),
    ).catch(() => setProducts([]));
  }, []);

  // Selalu status proses_pick_up dikirim ke server (bukan filter klien) agar
  // akurat walau order harian > 200. Filter lain menyusul sebagai parameter.
  const query = useMemo(() => {
    const q: Record<string, string> = { status: 'proses_pick_up', per_page: '200' };
    if (search.trim()) q.q = search.trim();
    if (method) q.pickup_method = method;
    if (store.length) q.store = store.join(',');
    if (product.length) q.product = product.join(',');
    if (trader) q.trader = trader;
    // Batas atas akhir hari agar rentang inklusif sampai tanggal terpilih.
    if (fromKey) q.from = startOfDayISO(fromKey);
    if (toKey) q.to = endOfDayISO(toKey);
    return q;
  }, [search, method, store, product, trader, fromKey, toKey]);

  const { orders, refresh, loading } = useOrders(query);
  const pending = useMemo(
    () => orders.filter((o) => !flagged || o.is_problem || o.is_pending),
    [orders, flagged],
  );
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

  const activeFilters = [search.trim(), method, trader].filter(Boolean).length + (store.length > 0 ? 1 : 0) + (product.length > 0 ? 1 : 0) + (fromKey && toKey ? 1 : 0) + (flagged ? 1 : 0);

  const resetFilters = () => {
    setSearch(''); setMethod(''); setStore([]); setProduct([]); setTrader(''); setFromKey(null); setToKey(null); setFlagged(false);
  };

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
      {/* Header & filter ikut di dalam ScrollView: bila di luar, scrollbar web
          memangkas lebar konten di dalamnya sehingga tepi kanan kartu tidak
          sejajar dengan tombol Scan/Filter. */}
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
      <PageHeader
        title="Pick up"
        subtitle="Kelola verifikasi paket dan pindahkan order dengan bukti yang tepat."
        action={<Button label="Scan nomor pesanan" icon="⌗" onPress={openScan} />}
      />

      <View style={styles.filterBar}>
        <View style={styles.searchBox}>
          <SearchInput compact value={search} onChangeText={setSearch} placeholder="Cari nomor order, produk, atau penerima..." />
        </View>
        <Pressable
          onPress={() => setShowFilters((v) => !v)}
          style={[styles.filterBtn, activeFilters > 0 && styles.filterBtnActive]}
          accessibilityLabel={showFilters ? 'Sembunyikan filter' : 'Tampilkan filter'}
        >
          <Text style={[styles.filterIcon, activeFilters > 0 && styles.filterIconActive]}>⚙</Text>
          <Text style={[styles.filterText, activeFilters > 0 && styles.filterTextActive]}>Filter</Text>
          {activeFilters > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilters}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {showFilters && (
        <View style={[styles.filterBar, styles.filterPanel, isNarrow && styles.filterBarNarrow]}>
          <Select
            label="Metode"
            value={method}
            options={pickupMethodOptions}
            onChange={(v) => setMethod(v)}
            placeholder="Semua metode"
            clearLabel="Semua"
            compact
            block={isNarrow}
          />
          <MultiSelect
            label="Produk"
            value={product}
            options={products}
            onChange={setProduct}
            placeholder="Semua produk"
            clearLabel="Semua"
            compact
            block={isNarrow}
          />
          <MultiSelect
            label="Toko"
            value={store}
            options={stores}
            onChange={setStore}
            placeholder="Semua toko"
            clearLabel="Semua"
            compact
            block={isNarrow}
          />
          <Select
            label="Trader"
            value={trader}
            options={traders}
            onChange={setTrader}
            placeholder="Semua trader"
            clearLabel="Semua"
            compact
            block={isNarrow}
          />
          <DateRangeField
            fromKey={fromKey}
            toKey={toKey}
            onChange={(f, t) => { setFromKey(f); setToKey(t); }}
            block={isNarrow}
          />
          <Pressable onPress={() => setFlagged((v) => !v)} style={[styles.flagChip, flagged && styles.flagChipActive, isNarrow && { alignSelf: 'flex-start' }]}>
            <Text style={[styles.flagChipText, flagged && styles.flagChipTextActive]}>
              {flagged ? '☑ Bermasalah & tertunda' : '☐ Bermasalah & tertunda'}
            </Text>
          </Pressable>
          {activeFilters > 0 && (
            <Pressable onPress={resetFilters} style={[styles.resetBtn, isNarrow && styles.resetBtnNarrow]}>
              <Text style={styles.resetIcon}>↻</Text>
              <Text style={styles.resetText}>Reset{activeFilters > 1 ? ` (${activeFilters})` : ''}</Text>
            </Pressable>
          )}
        </View>
      )}

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
            <Text style={styles.sectionSub}>
              {activeFilters > 0 ? 'Hasil filter pada order berstatus pickup.' : 'Order berstatus pickup yang menunggu penyelesaian.'}
            </Text>
          </View>
          <Text style={styles.count}>{pending.length}</Text>
        </View>
        <View style={[styles.listWrap, wide && styles.listWrapGrid]}>
          {loading ? (
            <Text style={styles.emptyNote}>Memuat…</Text>
          ) : pending.length === 0 ? (
            activeFilters > 0 ? (
              <View style={styles.emptyFiltered}>
                <EmptyState icon="⌕" text="Tidak ada order pickup yang cocok dengan filter." />
                <Button label="Reset filter" variant="secondary" size="sm" onPress={resetFilters} />
              </View>
            ) : (
              <EmptyState icon="→" text="Tidak ada order dalam proses." />
            )
          ) : pending.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              style={wide ? styles.cardGridItem : undefined}
              onPress={() => setSelected(o)}
              actions={
                <Button
                  label={busy === o.id ? 'Menyelesaikan…' : 'Selesaikan order'}
                  icon="✓"
                  variant="soft"
                  size="sm"
                  fullWidth
                  disabled={busy !== null}
                  onPress={() => completePickup(o)}
                />
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
  // Baris filter: kolom cari + tombol Filter (kriteria di panel yang bisa dibuka).
  filterBar: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6,
    marginHorizontal: 16, marginBottom: 6,
  },
  filterPanel: { marginBottom: 12 },
  filterBarNarrow: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch', gap: 8, marginBottom: 12 },
  searchBox: { flex: 1, minWidth: 0 },

  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 34, paddingHorizontal: 10, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  filterBtnActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterIcon: { fontSize: 13, color: colors.muted },
  filterIconActive: { color: colors.primary },
  filterText: { fontSize: 11, fontWeight: '700', color: colors.muted },
  filterTextActive: { color: colors.primary },
  filterBadge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  filterBadgeText: { fontSize: 10, fontWeight: '800', color: colors.onPrimary },

  flagChip: {
    height: 34, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 12, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  flagChipActive: { borderColor: colors.amber, backgroundColor: '#FCF3E3' },
  flagChipText: { fontSize: 11, fontWeight: '700', color: colors.muted },
  flagChipTextActive: { color: '#A8610F' },

  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 34, paddingHorizontal: 8, borderRadius: radius.sm,
  },
  resetBtnNarrow: { alignSelf: 'flex-start' },
  resetIcon: { fontSize: 13, color: colors.primary },
  resetText: { fontSize: 11, fontWeight: '700', color: colors.primary },

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
  listWrap: { gap: 12, paddingHorizontal: 16 },
  listWrapGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  // Lebar kolom dikunci: kartu tunggal tidak memuai mengisi baris.
  cardGridItem: { width: '48.6%', flexGrow: 0, minWidth: 340, maxWidth: 720 },
  emptyFiltered: { alignItems: 'center', gap: 12 },
  emptyNote: { color: colors.faint, fontSize: 12, textAlign: 'center', marginVertical: 24 },
  note: { fontSize: 11, color: colors.muted, lineHeight: 17, marginBottom: space.lg },
});
