// Komponen tabel & metrik Master Data — dipisah dari halaman agar halaman hanya berisi logika.
// Nama file berawalan `_` sehingga expo-router mengabaikannya sebagai rute.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../src/theme';
import type { MarketplaceStore, ProductRow } from '../../src/lib/api';
import { IconAction } from '../../src/components/ui';

export interface TableStyleSet {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export function MetricsRow({ stats, styles }: { stats: { totalProduk: number; aktif: number; totalKuota: number; totalTerpakai: number; totalSisa: number }; styles: TableStyleSet }) {
  return (
    <View style={styles.metricsGrid}>
      <View style={styles.metricCard}>
        <Text style={styles.metricLabel}>TOTAL PRODUK</Text>
        <Text style={styles.metricValue}>{stats.totalProduk}</Text>
        <Text style={styles.metricSub}>{stats.aktif} produk aktif</Text>
      </View>
      <View style={styles.metricCard}>
        <Text style={styles.metricLabel}>TOTAL ALOKASI KUOTA</Text>
        <Text style={styles.metricValue}>{stats.totalKuota}</Text>
        <Text style={styles.metricSub}>Di seluruh produk</Text>
      </View>
      <View style={styles.metricCard}>
        <Text style={styles.metricLabel}>KUOTA TERPAKAI</Text>
        <Text style={styles.metricValue}>{stats.totalTerpakai}</Text>
        <Text style={styles.metricSub}>
          {stats.totalKuota > 0 ? Math.round((stats.totalTerpakai / stats.totalKuota) * 100) : 0}% terisi
        </Text>
      </View>
      <View style={styles.metricCard}>
        <Text style={styles.metricLabel}>SISA KUOTA TERSEDIA</Text>
        <Text style={[styles.metricValue, { color: '#0F172A' }]}>{stats.totalSisa}</Text>
        <Text style={styles.metricSub}>Siap diambil trader</Text>
      </View>
    </View>
  );
}

export function ProductTable({ items, loading, styles, onMore }: {
  items: ProductRow[];
  loading: boolean;
  styles: TableStyleSet;
  onMore: (item: ProductRow, pos: { x: number; y: number }, event?: unknown) => void;
}) {
  return (
    <View style={styles.tableCard}>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { flex: 2 }]}>PRODUK (TIPE BARANG)</Text>
        <Text style={[styles.th, { flex: 1.5 }]}>KUOTA (TERPAKAI / TOTAL)</Text>
        <Text style={[styles.th, { width: 100 }]}>SISA KUOTA</Text>
        <Text style={[styles.th, { width: 90 }]}>STATUS</Text>
        <Text style={[styles.th, { width: 140, textAlign: 'right' }]}>AKSI</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyTable}>
          <Text style={styles.emptyTitle}>
            {loading ? 'Memuat data...' : 'Tidak ada produk ditemukan'}
          </Text>
          <Text style={styles.emptySub}>
            {loading ? 'Harap tunggu sejenak' : 'Coba sesuaikan pencarian atau filter produk Anda.'}
          </Text>
        </View>
      ) : (
        items.map((item, index) => {
          const isEven = index % 2 === 0;
          const usedPct = item.quota > 0 ? Math.min(100, Math.round((item.used_quota / item.quota) * 100)) : 0;
          const isExhausted = item.remaining_quota === 0;

          return (
            <View key={item.id} style={[styles.tableRow, isEven ? styles.rowEven : styles.rowOdd]}>
              <View style={[styles.td, { flex: 2 }]}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.storeName}>Kuota berlaku lintas toko</Text>
              </View>

              <View style={[styles.td, { flex: 1.5 }]}>
                <View style={styles.quotaHeader}>
                  <Text style={styles.quotaNumbers}>
                    {item.used_quota} / {item.quota} terpakai
                  </Text>
                  <Text style={styles.quotaPct}>{usedPct}%</Text>
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

              <View style={[styles.td, { width: 100 }]}>
                {isExhausted ? (
                  <View style={styles.tagExhausted}>
                    <Text style={styles.tagExhaustedText}>HABIS</Text>
                  </View>
                ) : (
                  <Text style={styles.remainingText}>{item.remaining_quota} kuota</Text>
                )}
              </View>

              <View style={[styles.td, { width: 90 }]}>
                <View style={[styles.statusBadge, item.is_active ? styles.badgeActive : styles.badgeInactive]}>
                  <View style={[styles.statusDot, item.is_active ? styles.dotActive : styles.dotInactive]} />
                  <Text style={[styles.statusText, item.is_active ? styles.textActive : styles.textInactive]}>
                    {item.is_active ? 'Aktif' : 'Off'}
                  </Text>
                </View>
              </View>

              <View style={[styles.td, { width: 140, alignItems: 'flex-end' }]}>
                <IconAction
                  icon="⋯"
                  label={`Aksi ${item.name}`}
                  onPress={(event) => {
                    const target = event?.currentTarget as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | undefined;
                    if (target?.measureInWindow) {
                      target.measureInWindow((x, y, width, height) => {
                        onMore(item, { x: x + width - 148, y: y + height + 6 }, event);
                      });
                    } else {
                      onMore(item, { x: 0, y: 0 }, event);
                    }
                  }}
                />
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

export function StoreTable({ stores, styles, onRemove, onAdd }: {
  stores: MarketplaceStore[];
  styles: TableStyleSet;
  onRemove: (store: MarketplaceStore) => void;
  onAdd: () => void;
}) {
  return (
    <View style={[styles.tableCard, styles.tableSpacing]}>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { flex: 1 }]}>TOKO MARKETPLACE</Text>
        <Text style={[styles.th, { width: 90, textAlign: 'right' }]}>AKSI</Text>
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
              <Text style={styles.productName}>{store.name}</Text>
            </View>
            <View style={[styles.td, { width: 90, alignItems: 'flex-end' }]}>
              <IconAction
                icon="✕"
                variant="danger"
                label={`Hapus ${store.name}`}
                onPress={() => onRemove(store)}
              />
            </View>
          </View>
        ))
      )}
      <View style={{ padding: 12 }}>
        <Pressable style={styles.addStoreBtn} onPress={onAdd}>
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
  metricCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 6,
  },
  metricSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableSpacing: { marginTop: 16 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    height: 40,
  },
  th: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rowEven: { backgroundColor: '#FFFFFF' },
  rowOdd: { backgroundColor: '#F8FAFC' },
  td: { paddingVertical: 8 },
  productName: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  storeName: { fontSize: 10, color: '#94A3B8', marginTop: 4 },
  quotaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quotaNumbers: { fontSize: 11, color: '#334155', fontWeight: '600' },
  quotaPct: { fontSize: 10, color: '#94A3B8', fontWeight: '700' },
  progressBarBg: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: radius.full,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressBarFill: { height: 6, borderRadius: radius.full },
  fillNormal: { backgroundColor: colors.primary },
  fillExhausted: { backgroundColor: '#C1433A' },
  remainingText: { fontSize: 11, color: '#0F172A', fontWeight: '700' },
  tagExhausted: { backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  tagExhaustedText: { fontSize: 9, fontWeight: '800', color: '#991B1B' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start',
    borderWidth: 1,
  },
  badgeActive: { backgroundColor: '#ECFDF5', borderColor: '#BBF7D0' },
  badgeInactive: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  statusDot: { width: 6, height: 6, borderRadius: radius.full },
  dotActive: { backgroundColor: '#10B981' },
  dotInactive: { backgroundColor: '#94A3B8' },
  statusText: { fontSize: 10, fontWeight: '700' },
  textActive: { color: '#059669' },
  textInactive: { color: '#64748B' },
  emptyTable: { paddingVertical: 40, alignItems: 'center' },
  emptyTitle: { fontSize: 13, fontWeight: '700', color: '#475569' },
  emptySub: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  addStoreBtn: {
    height: 36, paddingHorizontal: 14, borderRadius: radius.md,
    borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start',
  },
  addStoreBtnText: { fontSize: 12, fontWeight: '700', color: '#334155' },
});
