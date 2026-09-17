// Komponen tabel & metrik Master Data — dipisah dari halaman agar halaman hanya berisi logika.
// Berada di src/components (di luar app/) agar tidak dipindai expo-router sebagai rute.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, problemPalette, radius, tablePalette } from '../theme';
import type { MarketplaceStore, ProductRow } from '../lib/api';
import { ActionMenu, type ActionMenuItem } from './ui';

export function MetricsRow({ stats, wide }: { stats: { totalProduk: number; aktif: number; totalKuota: number; totalTerpakai: number; totalSisa: number }; wide?: boolean }) {
  const items: { label: string; value: number; sub: string; dark?: boolean }[] = [
    { label: 'TOTAL PRODUK', value: stats.totalProduk, sub: `${stats.aktif} produk aktif` },
    { label: 'TOTAL ALOKASI KUOTA', value: stats.totalKuota, sub: 'Di seluruh produk' },
    { label: 'KUOTA TERPAKAI', value: stats.totalTerpakai, sub: stats.totalKuota > 0 ? `${Math.round((stats.totalTerpakai / stats.totalKuota) * 100)}% terisi` : '0% terisi' },
    { label: 'SISA KUOTA TERSEDIA', value: stats.totalSisa, sub: 'Siap diambil trader', dark: true },
  ];
  return (
    <View style={[styles.metricsGrid, !wide && styles.metricsGridMobile]}>
      {items.map((it) => (
        <View key={it.label} style={[styles.metricCard, !wide && styles.metricCardMobile]}>
          <Text style={styles.metricLabel}>{it.label}</Text>
          <Text style={[styles.metricValue, it.dark && { color: colors.text }]}>{it.value}</Text>
          <Text style={styles.metricSub}>{it.sub}</Text>
        </View>
      ))}
    </View>
  );
}

// Render sel kuota: teks terpakai/total (+sisa di HP) + progress bar.
function QuotaCell({ item, compact }: { item: ProductRow; compact?: boolean }) {
  const usedPct = item.quota > 0 ? Math.min(100, Math.round((item.used_quota / item.quota) * 100)) : 0;
  const isExhausted = item.remaining_quota === 0;
  // Setelah kuota dikosongkan, kuota dan terpakai sama-sama 0 sehingga
  // "0 / 0 terpakai" tidak memberi tahu apa pun. Sebut keadaannya langsung.
  const kuotaDikosongkan = item.quota === 0 && item.used_quota === 0;
  return (
    <View>
      <View style={styles.quotaHeader}>
        <Text style={styles.quotaNumbers}>
          {kuotaDikosongkan
            ? 'Kuota kosong · tambah kuota untuk mulai'
            : `${item.used_quota} / ${item.quota} terpakai`}
          {compact && !kuotaDikosongkan ? ` · ${isExhausted ? '0' : item.remaining_quota} sisa` : ''}
        </Text>
        {!compact && !kuotaDikosongkan && <Text style={styles.quotaPct}>{usedPct}%</Text>}
      </View>
      <View style={styles.progressBarBg}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${usedPct}%` },
            isExhausted ? styles.fillExhausted : styles.fillNormal,
          ]}
        />
      </View>
    </View>
  );
}

export function ProductTable({ items, loading, wide, actionsFor }: {
  items: ProductRow[];
  loading: boolean;
  wide?: boolean;
  /** Item dropdown per produk — dropdown-nya sendiri dirender di sini (ActionMenu). */
  actionsFor: (item: ProductRow) => ActionMenuItem[];
}) {
  // HP: tabel ringkas — kolom SISA & STATUS disembunyikan, sisa digabung ke sel kuota.
  return (
    <View style={styles.tableCard}>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { flex: wide ? 2 : 2 }]}>PRODUK</Text>
        <Text style={[styles.th, { flex: wide ? 1.5 : 1.6 }]}>KUOTA (TERPAKAI / TOTAL)</Text>
        {wide && <Text style={[styles.th, { width: 90 }]}>SISA KUOTA</Text>}
        {wide && <Text style={[styles.th, { width: 80 }]}>STATUS</Text>}
        <Text style={[styles.th, { width: 48, textAlign: 'right' }]}>AKSI</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyTable}>
          <Text style={styles.emptyTitle}>{loading ? 'Memuat data...' : 'Tidak ada produk ditemukan'}</Text>
          <Text style={styles.emptySub}>
            {loading ? 'Harap tunggu sejenak' : 'Coba sesuaikan pencarian atau filter produk Anda.'}
          </Text>
        </View>
      ) : (
        items.map((item, index) => {
          const isEven = index % 2 === 0;
          const isExhausted = item.remaining_quota === 0;
          return (
            <View key={item.id} style={[styles.tableRow, isEven ? styles.rowEven : styles.rowOdd]}>
              {/* Produk */}
              <View style={[styles.td, { flex: wide ? 2 : 2 }]}>
                <View style={styles.productWrap}>
                  {!wide && (
                    <View style={[styles.statusDot, { backgroundColor: item.is_active ? colors.green : colors.faint }]} />
                  )}
                  <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                </View>
                <Text style={styles.storeName} numberOfLines={1}>Kuota berlaku lintas toko</Text>
              </View>

              {/* Kuota */}
              <View style={[styles.td, { flex: wide ? 1.5 : 1.6 }]}>
                <QuotaCell item={item} compact={!wide} />
              </View>

              {/* Sisa Kuota (desktop) */}
              {wide && (
                <View style={[styles.td, { width: 90 }]}>
                  {isExhausted ? (
                    <View style={styles.tagExhausted}>
                      <Text style={styles.tagExhaustedText}>HABIS</Text>
                    </View>
                  ) : (
                    <Text style={styles.remainingText}>{item.remaining_quota} kuota</Text>
                  )}
                </View>
              )}

              {/* Status (desktop) */}
              {wide && (
                <View style={[styles.td, { width: 80 }]}>
                  <View style={[styles.statusBadge, item.is_active ? styles.badgeActive : styles.badgeInactive]}>
                    <View style={[styles.dot, item.is_active ? styles.dotActive : styles.dotInactive]} />
                    <Text style={[styles.statusText, item.is_active ? styles.textActive : styles.textInactive]}>
                      {item.is_active ? 'Aktif' : 'Off'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Aksi */}
              <View style={[styles.td, { width: 48, alignItems: 'flex-end' }]}>
                <ActionMenu label={`Aksi produk ${item.name}`} items={actionsFor(item)} />
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

export function StoreTable({ stores, wide, onRemove, onAdd, onToggleBarcode }: {
  stores: MarketplaceStore[];
  wide?: boolean;
  onRemove: (store: MarketplaceStore) => void;
  onAdd: () => void;
  onToggleBarcode: (store: MarketplaceStore) => void;
}) {
  return (
    <View style={[styles.tableCard, styles.tableSpacing]}>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { flex: 1 }]}>TOKO MARKETPLACE</Text>
        <Text style={[styles.th, { width: 96 }]}>BARCODE</Text>
        <Text style={[styles.th, { width: 48, textAlign: 'right' }]}>AKSI</Text>
      </View>
      {stores.length === 0 ? (
        <View style={styles.emptyTable}>
          <Text style={styles.emptyTitle}>Belum ada toko</Text>
          <Text style={styles.emptySub}>Tambahkan toko marketplace agar trader bisa memilihnya saat input order.</Text>
        </View>
      ) : (
        stores.map((store, index) => (
          <View key={store.id} style={[styles.tableRow, index % 2 === 0 ? styles.rowEven : styles.rowOdd]}>
            <View style={[styles.td, { flex: 1 }]}>
              <Text style={styles.productName} numberOfLines={1}>{store.name}</Text>
            </View>
            {/* Penanda toko penerbit barcode: menentukan apakah order dari toko
                ini menampilkan slot barcode dan mewajibkan bukti ganda. */}
            <View style={[styles.td, { width: 96 }]}>
              <Text style={store.has_barcode ? styles.barcodeYes : styles.barcodeNo}>
                {store.has_barcode ? 'Pakai barcode' : 'Tanpa barcode'}
              </Text>
            </View>
            <View style={[styles.td, { width: 48, alignItems: 'flex-end' }]}>
              <ActionMenu
                label={`Aksi toko ${store.name}`}
                items={[
                  {
                    key: 'barcode',
                    label: store.has_barcode ? 'Tandai tanpa barcode' : 'Tandai pakai barcode',
                    icon: 'barcode-outline',
                    onPress: () => onToggleBarcode(store),
                  },
                  { key: 'delete', label: 'Hapus toko', icon: 'trash-outline', danger: true, separated: true, onPress: () => onRemove(store) },
                ]}
              />
            </View>
          </View>
        ))
      )}
      <View style={styles.addStoreWrap}>
        <Pressable
          onPress={onAdd}
          hitSlop={4}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addStoreBtn, !wide && styles.addStoreBtnFull, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.addStoreBtnText}>+ Tambah toko marketplace</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  metricsGridMobile: { gap: 8 },
  metricCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  metricCardMobile: { flexBasis: '47%', minWidth: 0, padding: 12 },
  metricLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, letterSpacing: 0.5 },
  metricValue: { fontSize: 22, fontWeight: '800', color: colors.primary, marginTop: 6 },
  metricSub: { fontSize: 10, color: colors.faint, marginTop: 4 },

  tableCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  tableSpacing: { marginTop: 16 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tablePalette.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingHorizontal: 14,
    height: 40,
  },
  th: { fontSize: 10, fontWeight: '800', color: tablePalette.headerText, letterSpacing: 0.5 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tablePalette.rowLine,
  },
  rowEven: { backgroundColor: colors.surface },
  rowOdd: { backgroundColor: tablePalette.rowAlt },
  td: { paddingVertical: 2 },
  productWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  productName: { fontSize: 13, fontWeight: '700', color: colors.text, flexShrink: 1 },
  barcodeYes: { fontSize: 12, fontWeight: '700', color: colors.primaryMuted },
  barcodeNo: { fontSize: 12, color: colors.muted },
  // muted (bukan faint): faint di atas rowAlt hanya 4.38:1, di bawah ambang AA.
  storeName: { fontSize: 10, color: colors.muted, marginTop: 3 },
  quotaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  quotaNumbers: { fontSize: 11, color: colors.text, fontWeight: '600', flexShrink: 1 },
  quotaPct: { fontSize: 10, color: colors.muted, fontWeight: '700' },
  progressBarBg: { height: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.full, marginTop: 6, overflow: 'hidden' },
  progressBarFill: { height: 6, borderRadius: radius.full },
  fillNormal: { backgroundColor: colors.primary },
  fillExhausted: { backgroundColor: problemPalette.fg },
  remainingText: { fontSize: 11, color: colors.text, fontWeight: '700' },
  tagExhausted: { backgroundColor: problemPalette.bg, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  tagExhaustedText: { fontSize: 9, fontWeight: '800', color: problemPalette.fg },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start',
    borderWidth: 1,
  },
  badgeActive: { backgroundColor: colors.surface, borderColor: colors.green },
  badgeInactive: { backgroundColor: tablePalette.headerBg, borderColor: colors.line },
  statusDot: { width: 6, height: 6, borderRadius: radius.full },
  dot: { width: 6, height: 6, borderRadius: radius.full },
  dotActive: { backgroundColor: colors.green },
  dotInactive: { backgroundColor: colors.muted },
  statusText: { fontSize: 10, fontWeight: '700' },
  textActive: { color: colors.green },
  textInactive: { color: colors.muted },

  emptyTable: { paddingVertical: 40, alignItems: 'center' },
  emptyTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 11, color: colors.muted, marginTop: 4, textAlign: 'center', paddingHorizontal: 24 },

  addStoreWrap: { padding: 12 },
  // Tinggi 36 + hitSlop 4 pada Pressable = area sentuh 44px.
  addStoreBtn: {
    height: 36, paddingHorizontal: 14, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start',
  },
  addStoreBtnFull: { alignSelf: 'stretch' },
  addStoreBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
});
