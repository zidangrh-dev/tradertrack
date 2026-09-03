import { useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle,
} from 'react-native';
import { api, type OrderView } from '../../src/lib/api';
import { notify, confirmAsk } from '../../src/lib/notify';
import { pickPhoto } from '../../src/lib/photo';
import { useOrders } from '../../src/hooks/useOrders';
import { useAuth } from '../../src/hooks/useAuth';
import { colors, radius, statusLabel, pickupMethodLabel } from '../../src/theme';
import { durationLabel, statusPalette } from '../../src/lib/format';
import { Avatar, Button, DataTable, Field, Select, Sheet, type DataTableColumn, type SelectOption } from '../../src/components/ui';
import { NewOrderModal } from '../../src/components/NewOrderModal';
import { OrderDetailModal } from '../../src/components/OrderDetailModal';

const STATUS_OPTIONS: Record<string, string> = { data_masuk: 'Data masuk', proses_pick_up: 'Proses pick up', selesai: 'Selesai' };
const METHOD_OPTIONS: Record<string, string> = { zaydan_ambilan_gjm: 'Zaydan Ambilan GJM', self_pick_up: 'Self Pick Up' };
const TRADERS: SelectOption[] = [
  { value: 'u-nabila', label: 'Nabila Putri', sub: '@nabila' },
  { value: 'u-fajar', label: 'Fajar Rahman', sub: '@fajar' },
  { value: 'u-admin', label: 'Dimas Arya', sub: '@admin' },
];
const PERIOD_OPTIONS: Record<string, string> = { hari_ini: 'Hari ini', '7_hari': '7 hari terakhir', bulan_ini: 'Bulan berjalan' };
const PER_PAGE = 50;
const COPY_HEADERS = ['Nomor order', 'Produk & toko', 'Penerima', 'Trader'];

function orderCopyRow(o: OrderView) {
  return [
    o.order_number,
    `${o.product_name} · ${o.store_name}`,
    o.recipient_name,
    o.trader_name,
  ];
}

async function copyText(text: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) throw new Error('Clipboard tidak tersedia di browser ini.');
  await navigator.clipboard.writeText(text);
}

export default function Orders() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [search, setSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [trader, setTrader] = useState('');
  const [period, setPeriod] = useState('');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<OrderView | null>(null);
  const [editing, setEditing] = useState<OrderView | null>(null);

  const query = useMemo(() => {
    const q: Record<string, string> = {};
    if (search.trim()) q.q = search.trim();
    if (status) q.status = status;
    if (method) q.pickup_method = method;
    if (trader) q.trader = trader;
    const d = new Date();
    if (period === 'hari_ini') q.from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    if (period === '7_hari') q.from = new Date(Date.now() - 7 * 864e5).toISOString();
    if (period === 'bulan_ini') q.from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    return q;
  }, [search, status, method, trader, period]);

  const { orders, total, loading, error, refresh } = useOrders(query);

  const sorted = useMemo(() => {
    const list = [...orders];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'order_number': cmp = a.order_number.localeCompare(b.order_number); break;
        case 'product': cmp = a.product_name.localeCompare(b.product_name); break;
        case 'recipient': cmp = a.recipient_name.localeCompare(b.recipient_name); break;
        case 'trader': cmp = a.trader_name.localeCompare(b.trader_name); break;
        case 'method': cmp = a.pickup_method.localeCompare(b.pickup_method); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'photo_count': cmp = a.photo_count - b.photo_count; break;
        case 'created_at': cmp = a.created_at.localeCompare(b.created_at); break;
        default: cmp = a.created_at.localeCompare(b.created_at);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [orders, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const visiblePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (visiblePage - 1) * PER_PAGE;
    return sorted.slice(start, start + PER_PAGE);
  }, [sorted, visiblePage]);

  const handleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const resetFilters = () => {
    setStatus(''); setMethod(''); setTrader(''); setPeriod(''); setPage(1);
  };

  const activeFilters = [status, method, trader, period].filter(Boolean).length;
  const copyFiltered = async () => {
    try {
      const text = [COPY_HEADERS, ...sorted.map(orderCopyRow)].map((row) => row.join('\t')).join('\n');
      await copyText(text);
      notify('Berhasil', `${sorted.length} order berhasil disalin.`);
    } catch (e) {
      notify('Gagal menyalin', (e as Error).message);
    }
  };
  const rangeStart = sorted.length === 0 ? 0 : (visiblePage - 1) * PER_PAGE + 1;
  const rangeEnd = Math.min(visiblePage * PER_PAGE, sorted.length);

  const columns: DataTableColumn<OrderView>[] = [
    {
      key: 'order_number', label: 'Nomor order', sortKey: 'order_number' as keyof OrderView, width: 175,
      render: (o) => <Text style={dtStyles.orderCode}>{o.order_number}</Text>,
    },
    {
      key: 'product', label: 'Produk & toko', sortKey: 'product' as keyof OrderView,
      render: (o) => (
        <View>
          <Text style={dtStyles.productName} numberOfLines={1}>{o.product_name}</Text>
          <Text style={dtStyles.storeName}>{o.store_name}</Text>
        </View>
      ),
    },
    {
      key: 'recipient', label: 'Penerima', sortKey: 'recipient' as keyof OrderView,
      render: (o) => <Text style={dtStyles.cellText} numberOfLines={1}>{o.recipient_name}</Text>,
    },
    {
      key: 'trader', label: 'Trader', sortKey: 'trader' as keyof OrderView, width: 160,
      render: (o) => (
        <View style={dtStyles.person}>
          <Avatar name={o.trader_name} size={22} />
          <Text style={dtStyles.personName} numberOfLines={1}>{o.trader_name}</Text>
        </View>
      ),
    },
    {
      key: 'method', label: 'Metode', sortKey: 'method' as keyof OrderView, width: 165,
      render: (o) => <Text style={dtStyles.method}>{pickupMethodLabel[o.pickup_method]}</Text>,
    },
    {
      key: 'status', label: 'Status', sortKey: 'status' as keyof OrderView, width: 140,
      render: (o) => {
        if (o.is_problem) return <Text style={[dtStyles.tag, { color: '#C1433A', backgroundColor: '#FCE9E6' }]}>Bermasalah</Text>;
        if (o.is_pending) return <Text style={[dtStyles.tag, { color: '#A8610F', backgroundColor: '#FCF1DE' }]}>Tertunda</Text>;
        const pal = statusPalette(o.status);
        return <Text style={[dtStyles.tag, { color: pal.color, backgroundColor: pal.bg }]}>{statusLabel[o.status]}</Text>;
      },
    },
    {
      key: 'photo_count', label: 'Bukti', sortKey: 'photo_count' as keyof OrderView, width: 95,
      render: (o) => (
        <Text style={o.photo_count > 0 ? dtStyles.photoOk : dtStyles.photoEmpty}>
          {o.photo_count > 0 ? `▣ ${o.photo_count}` : '—'}
        </Text>
      ),
    },
    {
      key: 'created_at', label: 'Input', sortKey: 'created_at' as keyof OrderView, width: 115,
      render: (o) => <Text style={dtStyles.timeText}>{durationLabel(o.updated_at)}</Text>,
    },
    {
      key: 'actions', label: '', width: 110,
      render: (o) => {
        const isOwner = o.trader_id === user?.id;
        const editable = isOwner && o.status === 'data_masuk';
        if (!editable) {
          return (
            <Pressable onPress={() => setSelected(o)} hitSlop={8}>
              <Text style={dtStyles.actionBtn}>›</Text>
            </Pressable>
          );
        }
        return (
          <View style={dtStyles.rowActions}>
            <Pressable onPress={async () => {
              try {
                await copyText(orderCopyRow(o).join('\t'));
                notify('Berhasil', 'Data order disalin.');
              } catch (e) {
                notify('Gagal menyalin', (e as Error).message);
              }
            }} hitSlop={8}>
              <Text style={dtStyles.actionBtn}>⧉</Text>
            </Pressable>
            <Pressable onPress={() => processPickup(o, refresh)} hitSlop={8}>
              <Text style={[dtStyles.actionBtn, { color: colors.primary }]}>→</Text>
            </Pressable>
            <Pressable onPress={() => setEditing(o)} hitSlop={8}>
              <Text style={dtStyles.actionBtn}>✎</Text>
            </Pressable>
            <Pressable onPress={() => removeOrder(o, refresh)} hitSlop={8}>
              <Text style={[dtStyles.actionBtn, { color: colors.red }]}>✕</Text>
            </Pressable>
          </View>
        );
      },
    },
  ];

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.wrapContent}>
      <View style={styles.pageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Daftar order</Text>
          <Text style={styles.pageSubtitle}>{total} order · diperbarui realtime</Text>
        </View>
        <Button label="Order baru" icon="+" onPress={() => setShowNew(true)} />
      </View>

      <View style={styles.filterBar}>
        <View style={[styles.searchBox, isSearchFocused && styles.searchBoxFocused]}>
          <Text style={[styles.searchIcon, isSearchFocused && styles.searchIconFocused]}>⌕</Text>
          <TextInput
            style={[styles.searchInput, webNoOutline]}
            placeholder="Cari nomor order, produk, atau penerima..."
            placeholderTextColor={colors.faint}
            value={search}
            onChangeText={(t) => { setSearch(t); setPage(1); }}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
          {!!search && (
            <Pressable onPress={() => setSearch('')} hitSlop={6}>
              <Text style={styles.clearBtn}>✕</Text>
            </Pressable>
          )}
        </View>

        <Select
          label="Status"
          value={status}
          options={Object.entries(STATUS_OPTIONS).map(([value, label]) => ({ value, label }))}
          onChange={(v) => { setStatus(v); setPage(1); }}
          placeholder="Semua"
          clearLabel="Semua"
        />
        <Select
          label="Metode"
          value={method}
          options={Object.entries(METHOD_OPTIONS).map(([value, label]) => ({ value, label }))}
          onChange={(v) => { setMethod(v); setPage(1); }}
          placeholder="Semua"
          clearLabel="Semua"
        />
        {isAdmin && (
          <Select
            label="Trader"
            value={trader}
            options={TRADERS}
            onChange={(v) => { setTrader(v); setPage(1); }}
            placeholder="Semua"
            clearLabel="Semua"
          />
        )}
        <Select
          label="Periode"
          value={period}
          options={Object.entries(PERIOD_OPTIONS).map(([value, label]) => ({ value, label }))}
          onChange={(v) => { setPeriod(v); setPage(1); }}
          placeholder="Semua"
          clearLabel="Semua"
        />

        {activeFilters > 0 && (
          <Pressable onPress={resetFilters} style={styles.resetBtn}>
            <Text style={styles.resetIcon}>↻</Text>
            <Text style={styles.resetText}>Reset{activeFilters > 1 ? ` (${activeFilters})` : ''}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.tableSection}>
        <View style={styles.tableIntro}>
          <View>
            <Text style={styles.tableTitle}>{isAdmin ? 'Semua order' : 'Order saya'}</Text>
            <Text style={styles.tableHint}>Klik judul kolom untuk mengurutkan data.</Text>
          </View>
          <View style={styles.tableTools}>
            <Text style={styles.tableCount}>{rangeStart}–{rangeEnd} dari {sorted.length}</Text>
            <Button label="Copy hasil filter" icon="⧉" variant="secondary" size="sm" onPress={copyFiltered} disabled={sorted.length === 0} />
          </View>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Gagal memuat order</Text>
            <Text style={styles.errorText}>Terjadi kendala saat mengambil data. Periksa koneksi ke server, lalu coba muat ulang.</Text>
            <Button label="Muat ulang" variant="secondary" size="sm" onPress={refresh} />
          </View>
        ) : (
          <DataTable
            columns={columns}
            data={paged}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onRowPress={(o) => setSelected(o)}
            emptyText="Tidak ada order yang cocok dengan filter."
            page={visiblePage}
            totalPages={totalPages}
            totalItems={sorted.length}
            onPageChange={setPage}
          />
        )}
      </View>

      <NewOrderModal open={showNew} onClose={() => setShowNew(false)} user={user} onCreated={refresh} />
      <OrderDetailModal order={selected} onClose={() => setSelected(null)} onChanged={refresh} />
      <EditOrderModal
        key={editing?.id ?? 'none'}
        order={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }}
      />
    </ScrollView>
  );
}

/* ---------- Aksi order ---------- */

async function processPickup(o: OrderView, refresh: () => void) {
  // Order sudah punya bukti (barcode/foto) → proses langsung; belum → wajib lampirkan foto dulu.
  let photo: { uri: string; name: string; type: string } | undefined;
  if (!o.barcode_path && o.photo_count < 1) {
    photo = (await pickPhoto('Foto barcode pengambilan')) ?? undefined;
    if (!photo) return notify('Foto wajib', 'Lampirkan minimal 1 foto barcode pengambilan sebelum memproses pick up.');
  }
  try {
    await api.pickup(o.id, photo);
    notify('Berhasil', `${o.order_number} → Proses pick up`);
    refresh();
  } catch (e) {
    notify('Gagal', (e as Error).message);
  }
}

async function removeOrder(o: OrderView, refresh: () => void) {
  confirmAsk('Hapus order', `Hapus #${o.order_number}?`, async () => {
    try { await api.deleteOwnOrder(o.id); refresh(); } catch (e) { notify('Gagal', (e as Error).message); }
  });
}

function EditOrderModal({ order, onClose, onSaved }: { order: OrderView | null; onClose: () => void; onSaved: () => void }) {
  const [product, setProduct] = useState(order?.product_name ?? '');
  const [store, setStore] = useState(order?.store_name ?? '');
  const [orderNumber, setOrderNumber] = useState(order?.order_number.replace('TRK-', '') ?? '');
  const [recipient, setRecipient] = useState(order?.recipient_name ?? '');

  if (!order) return null;

  const save = async () => {
    try {
      await api.editOwnOrder(order.id, {
        product_name: product.trim(), store_name: store.trim(),
        order_number: orderNumber.trim(), recipient_name: recipient.trim(),
      });
      onSaved();
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };

  return (
    <Sheet open onClose={onClose} title={`Edit #${order.order_number}`}>
      <Field label="Nama produk" value={product} onChangeText={setProduct} />
      <Field label="Nama toko" value={store} onChangeText={setStore} />
      <Field label="Nomor pesanan" value={orderNumber} onChangeText={setOrderNumber} hint="Harus unik." />
      <Field label="Nama penerima" value={recipient} onChangeText={setRecipient} />
      <Text style={styles.ownerNote}>Hanya order milik Anda yang masih berstatus Data masuk yang dapat diubah.</Text>
      <Button label="Simpan perubahan" fullWidth onPress={save} />
    </Sheet>
  );
}

const dtStyles = StyleSheet.create({
  orderCode: { fontSize: 13, fontWeight: '800', color: colors.primaryMuted },
  productName: { fontSize: 14, fontWeight: '700', color: colors.text },
  storeName: { fontSize: 12, color: colors.muted, marginTop: 3 },
  cellText: { fontSize: 14, color: colors.muted },
  person: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  personName: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  method: { fontSize: 12, fontWeight: '700', color: colors.muted, letterSpacing: 0.2 },
  tag: { fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, overflow: 'hidden', alignSelf: 'flex-start' },
  photoOk: { fontSize: 13, fontWeight: '700', color: '#1F7A4D' },
  photoEmpty: { fontSize: 13, color: colors.faint },
  timeText: { fontSize: 13, color: colors.faint },
  rowActions: { flexDirection: 'row', gap: 10 },
  actionBtn: { fontSize: 17, color: colors.faint, paddingHorizontal: 2 },
});

const webNoOutline = ({ outlineStyle: 'none', outlineWidth: 0 } as unknown) as ViewStyle;

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  wrapContent: { paddingBottom: 32 },
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 14 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  pageSubtitle: { fontSize: 13, color: colors.muted, marginTop: 4 },

  // Filter bar ala ERP: satu baris kardus, dropdown anchored.
  filterBar: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 18,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#D8DEE6',
    borderRadius: radius.md, padding: 10,
  },
  searchBox: {
    flex: 1, minWidth: 280, flexDirection: 'row', alignItems: 'center', gap: 9,
    borderWidth: 1, borderColor: '#CBD5E1', borderRadius: radius.sm, backgroundColor: colors.surface,
    paddingHorizontal: 12, height: 42,
  },
  searchBoxFocused: { borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 }, shadowRadius: 5 },
  searchIcon: { color: colors.faint, fontSize: 16 },
  searchIconFocused: { color: colors.text },
  searchInput: { flex: 1, height: 44, fontSize: 14, color: colors.text, padding: 0 },
  clearBtn: { fontSize: 15, color: colors.faint, paddingHorizontal: 4 },

  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 44, paddingHorizontal: 12, borderRadius: radius.md,
  },
  resetIcon: { fontSize: 14, color: colors.primary },
  resetText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  tableSection: { marginHorizontal: 20 },
  tableIntro: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 10, paddingHorizontal: 2 },
  tableTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  tableHint: { fontSize: 11, color: colors.faint, marginTop: 3 },
  tableTools: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tableCount: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  errorBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 20, marginTop: 24, alignItems: 'center', gap: 8 },
  errorTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  errorText: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginBottom: 6 },
  ownerNote: { fontSize: 9, color: colors.faint, marginVertical: 8 },
});
