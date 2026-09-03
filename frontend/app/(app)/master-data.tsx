import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle, useWindowDimensions } from 'react-native';
import { api, type MarketplaceStore, type ProductRow } from '../../src/lib/api';
import { notify, confirmAsk } from '../../src/lib/notify';
import { useAdminOnly } from '../../src/hooks/useRoleGuard';
import { colors, radius, space } from '../../src/theme';
import { Button, Field, PageHeader, Sheet } from '../../src/components/ui';

function StoreForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  const save = () => { if (name.trim()) { onSave(name); setName(''); } };
  return <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.storeModalBackdrop}>
      <View style={styles.storeModal}>
        <View style={styles.storeModalHead}><Text style={styles.storeModalTitle}>Tambah toko marketplace</Text><Pressable onPress={onClose} hitSlop={10}><Text style={styles.storeModalClose}>×</Text></Pressable></View>
        <Field label="Nama toko" value={name} onChangeText={setName} placeholder="Contoh: Tokopedia" />
        <View style={styles.modalActions}><Button label="Batal" variant="secondary" onPress={onClose} /><Button label="Tambah toko" onPress={save} style={{ flex: 1 }} /></View>
      </View>
    </View>
  </Modal>;
}

export default function MasterData() {
  useAdminOnly();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [items, setItems] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showStoreForm, setShowStoreForm] = useState(false);
  const [search, setSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'semua' | 'aktif' | 'nonaktif' | 'habis'>('semua');

  // Form Tambah Produk (nama + kuota; toko dikelola terpisah)
  const [product, setProduct] = useState('');
  const [quota, setQuota] = useState('');
  const [stores, setStores] = useState<MarketplaceStore[]>([]);

  const [editingItem, setEditingItem] = useState<ProductRow | null>(null);
  const [actionItem, setActionItem] = useState<ProductRow | null>(null);
  const [actionPosition, setActionPosition] = useState({ x: 0, y: 0 });
  const [resetConfirm, setResetConfirm] = useState(false);
  const [additionalQuota, setAdditionalQuota] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.listMarketplaceStores().then(setStores).catch(() => setStores([]));
    api.listProducts()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Statistik Ringkasan Enterprise
  const stats = useMemo(() => {
    const totalProduk = items.length;
    const aktif = items.filter((m) => m.is_active).length;
    const totalKuota = items.reduce((acc, m) => acc + (m.quota || 0), 0);
    const totalTerpakai = items.reduce((acc, m) => acc + (m.used_quota || 0), 0);
    const totalSisa = Math.max(0, totalKuota - totalTerpakai);
    return { totalProduk, aktif, totalKuota, totalTerpakai, totalSisa };
  }, [items]);

  // Data Terfilter
  const filteredItems = useMemo(() => {
    return items.filter((m) => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q || m.name.toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (statusFilter === 'aktif') return m.is_active;
      if (statusFilter === 'nonaktif') return !m.is_active;
      if (statusFilter === 'habis') return m.remaining_quota === 0;
      return true;
    });
  }, [items, search, statusFilter]);

  const deleteItem = async (m: ProductRow) => {
    try {
      setItems(await api.deleteProduct(m.id));
      notify('Berhasil', `Produk "${m.name}" dihapus.`);
    } catch (e) {
      notify('Tidak dapat menghapus', (e as Error).message);
    }
  };

  const toggleStatus = async (m: ProductRow) => {
    try {
      setItems(await api.updateProduct(m.id, { is_active: !m.is_active }));
      notify('Berhasil', `Status produk "${m.name}" diubah.`);
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };

  const addStore = async (name: string) => {
    if (!name.trim()) return;
    try {
      setStores(await api.createMarketplaceStore(name.trim()));
      setShowStoreForm(false);
      notify('Berhasil', 'Toko marketplace ditambahkan.');
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };
  const removeStore = async (store: MarketplaceStore) => {
    confirmAsk('Hapus toko marketplace', `Hapus "${store.name}" dari daftar?`, async () => {
      try {
        setStores(await api.deleteMarketplaceStore(store.id));
        notify('Berhasil', `Toko "${store.name}" dihapus.`);
      } catch (e) {
        notify('Gagal', (e as Error).message);
      }
    });
  };

  const create = async () => {
    const q = Number(quota);
    if (!product.trim() || !quota.trim() || Number.isNaN(q) || q < 0) {
      notify('Lengkapi data', 'Nama produk dan jumlah kuota wajib diisi.');
      return;
    }
    try {
      setItems(await api.createProduct({ name: product.trim(), quota: q }));
      setShowNew(false);
      setProduct('');
      setQuota('');
      notify('Berhasil', 'Produk baru ditambahkan.');
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };

  const startEdit = (m: ProductRow) => {
    setEditingItem(m);
    setAdditionalQuota('');
  };

  const resetQuota = async () => {
    if (!editingItem) return;
    try {
      setItems(await api.resetProductQuota(editingItem.id));
      setEditingItem(null);
      setResetConfirm(false);
      notify('Berhasil', 'Kuota produk berhasil direset.');
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };

  const saveEdit = async () => {
    if (!editingItem) return;
    const additional = Number(additionalQuota);
    if (!additionalQuota.trim() || !Number.isInteger(additional) || additional <= 0) {
      notify('Lengkapi data', 'Tambahan kuota wajib diisi dengan angka lebih dari 0.');
      return;
    }
    try {
      setItems(await api.addProductQuota(editingItem.id, additional));
      setEditingItem(null);
      notify('Berhasil', `Kuota ditambahkan ${additional}.`);
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };

  return (
    <View style={styles.wrap}>
      <PageHeader
        title="Master data"
        subtitle="Katalog resmi produk, toko marketplace, dan kontrol alokasi kuota."
        action={<Button label="Tambah produk" icon="+" onPress={() => setShowNew(true)} />}
      />

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Metric Summary Cards */}
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

        {/* Filter & Search Bar */}
        <View style={styles.controlBar}>
          <View style={[styles.searchBox, isSearchFocused && styles.searchBoxFocused]}>
            <Text style={[styles.searchIcon, isSearchFocused && styles.searchIconFocused]}>⌕</Text>
            <TextInput
              style={[styles.searchInput, webNoOutline]}
              placeholder="Cari nama produk atau toko..."
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
            {!!search && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Text style={styles.clearSearch}>✕</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.filterGroup}>
            {(['semua', 'aktif', 'nonaktif', 'habis'] as const).map((filterKey) => {
              const active = statusFilter === filterKey;
              const labels = {
                semua: 'Semua',
                aktif: 'Aktif',
                nonaktif: 'Nonaktif',
                habis: 'Kuota Habis',
              };
              return (
                <Pressable
                  key={filterKey}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setStatusFilter(filterKey)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {labels[filterKey]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Enterprise Data Table */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { flex: 2 }]}>PRODUK (TIPE BARANG)</Text>
            <Text style={[styles.th, { flex: 1.5 }]}>KUOTA (TERPAKAI / TOTAL)</Text>
            <Text style={[styles.th, { width: 100 }]}>SISA KUOTA</Text>
            <Text style={[styles.th, { width: 90 }]}>STATUS</Text>
            <Text style={[styles.th, { width: 140, textAlign: 'right' }]}>AKSI</Text>
          </View>

          {filteredItems.length === 0 ? (
            <View style={styles.emptyTable}>
              <Text style={styles.emptyTitle}>
                {loading ? 'Memuat data...' : 'Tidak ada produk ditemukan'}
              </Text>
              <Text style={styles.emptySub}>
                {loading ? 'Harap tunggu sejenak' : 'Coba sesuaikan pencarian atau filter produk Anda.'}
              </Text>
            </View>
          ) : (
            filteredItems.map((item, index) => {
              const isEven = index % 2 === 0;
              const usedPct = item.quota > 0 ? Math.min(100, Math.round((item.used_quota / item.quota) * 100)) : 0;
              const isExhausted = item.remaining_quota === 0;

              return (
                <View
                  key={item.id}
                  style={[styles.tableRow, isEven ? styles.rowEven : styles.rowOdd]}
                >
                  {/* Produk */}
                  <View style={[styles.td, { flex: 2 }]}>
                    <Text style={styles.productName}>{item.name}</Text>
                    <Text style={styles.storeName}>Kuota berlaku lintas toko</Text>
                  </View>

                  {/* Visual Kuota Bar */}
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

                  {/* Sisa Kuota */}
                  <View style={[styles.td, { width: 100 }]}>
                    {isExhausted ? (
                      <View style={styles.tagExhausted}>
                        <Text style={styles.tagExhaustedText}>HABIS</Text>
                      </View>
                    ) : (
                      <Text style={styles.remainingText}>{item.remaining_quota} kuota</Text>
                    )}
                  </View>

                  {/* Status Badge */}
                  <View style={[styles.td, { width: 90 }]}>
                    <View style={[styles.statusBadge, item.is_active ? styles.badgeActive : styles.badgeInactive]}>
                      <View style={[styles.statusDot, item.is_active ? styles.dotActive : styles.dotInactive]} />
                      <Text style={[styles.statusText, item.is_active ? styles.textActive : styles.textInactive]}>
                        {item.is_active ? 'Aktif' : 'Off'}
                      </Text>
                    </View>
                  </View>

                  {/* Aksi */}
                  <View style={[styles.td, { width: 140, alignItems: 'flex-end' }]}>
                    <Pressable
                      style={styles.moreButton}
                      onPress={(event) => event.currentTarget?.measureInWindow((x, y, width, height) => {
                        setActionPosition({ x: x + width - 148, y: y + height + 6 });
                        setActionItem(item);
                      })}
                      accessibilityLabel={`Aksi ${item.name}`}
                    >
                      <Text style={styles.moreButtonText}>⋯</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Toko Marketplace */}
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
                  <Pressable
                    style={styles.moreButton}
                    onPress={() => confirmAsk('Hapus toko marketplace', `Hapus "${store.name}" dari daftar?`, () => removeStore(store))}
                    accessibilityLabel={`Hapus ${store.name}`}
                  >
                    <Text style={[styles.moreButtonText, { color: colors.red }]}>✕</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
          <View style={{ padding: 12 }}>
            <Button label="Tambah toko marketplace" icon="+" variant="secondary" size="sm" onPress={() => setShowStoreForm(true)} />
          </View>
        </View>
      </ScrollView>

      <Modal visible={!!actionItem} transparent animationType="fade" onRequestClose={() => setActionItem(null)}>
        <Pressable style={styles.actionBackdrop} onPress={() => setActionItem(null)}>
          <View style={[styles.actionPopup, { left: actionPosition.x, top: actionPosition.y }]}>
            {actionItem && (
              <>
                <Pressable style={styles.popupItem} onPress={() => { const item = actionItem; setActionItem(null); startEdit(item); }}>
                  <Text style={styles.popupText}>Tambah kuota</Text>
                </Pressable>
                <Pressable style={styles.popupItem} onPress={() => { const item = actionItem; setActionItem(null); confirmAsk(item.is_active ? 'Nonaktifkan Produk' : 'Aktifkan Produk', `Ubah status "${item.name}"?`, () => toggleStatus(item)); }}>
                  <Text style={styles.popupText}>{actionItem.is_active ? 'Nonaktifkan' : 'Aktifkan'}</Text>
                </Pressable>
                <Pressable style={[styles.popupItem, styles.popupDanger]} onPress={() => { const item = actionItem; setActionItem(null); confirmAsk('Hapus produk', `Hapus "${item.name}"?`, () => deleteItem(item)); }}>
                  <Text style={styles.popupDangerText}>Hapus</Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Modal Tambah Produk */}
      <Sheet open={showNew} onClose={() => setShowNew(false)} title="Tambah Produk">
        <View style={styles.formContainer}>
          <Text style={styles.formInfo}>
            Produk (tipe barang) akan tersedia untuk diinput trader dengan kuota yang berlaku lintas toko.
          </Text>

          <Field
            label="Nama Produk"
            value={product}
            onChangeText={setProduct}
            placeholder="Contoh: Wireless Keyboard K2"
          />

          <Field
            label="Alokasi Kuota Total"
            value={quota}
            onChangeText={setQuota}
            placeholder="Jumlah kuota yang dapat diperebutkan (contoh: 50)"
            keyboardType="numeric"
          />

          <View style={styles.modalActions}>
            <Button label="Batal" variant="secondary" onPress={() => setShowNew(false)} />
            <Button label="Simpan Produk" onPress={create} style={{ flex: 1 }} />
          </View>
        </View>
      </Sheet>

      {/* Modal Edit Produk & Kuota */}
      <Sheet open={!!editingItem} onClose={() => setEditingItem(null)} title="Tambah kuota produk">
        <View style={styles.formContainer}>
          <Text style={styles.formInfo}>
            Tambahkan kuota baru tanpa mengubah jumlah order yang sudah digunakan.
          </Text>

          <View style={styles.quotaSummary}>
            <View style={styles.quotaCell}>
              <Text style={styles.quotaSummaryLabel}>KUOTA SAAT INI</Text>
              <Text style={styles.quotaSummaryValue}>{editingItem?.quota ?? 0}</Text>
            </View>
            <Text style={styles.quotaOperator}>+</Text>
            <View style={styles.quotaCellInput}>
              <Field label="TAMBAHAN KUOTA" value={additionalQuota} onChangeText={setAdditionalQuota} placeholder="0" keyboardType="numeric" />
            </View>
            <Text style={styles.quotaOperator}>=</Text>
            <View style={styles.quotaCell}>
              <Text style={styles.quotaSummaryLabel}>KUOTA BARU</Text>
              <Text style={styles.quotaSummaryValue}>{(editingItem?.quota ?? 0) + (Number(additionalQuota) || 0)}</Text>
            </View>
          </View>

          <View style={styles.modalActions}>
            <Button label="Reset kuota" variant="secondary" onPress={() => setResetConfirm(true)} />
            <Button label="Batal" variant="secondary" onPress={() => setEditingItem(null)} />
            <Button label="Tambahkan Kuota" onPress={saveEdit} style={{ flex: 1 }} />
          </View>
        </View>
      </Sheet>

      <Sheet open={resetConfirm} onClose={() => setResetConfirm(false)} title="Konfirmasi reset kuota">
        <View style={styles.confirmBox}>
          <View style={styles.confirmIcon}><Text style={styles.confirmIconText}>!</Text></View>
          <Text style={styles.confirmTitle}>Apakah Anda yakin?</Text>
          <Text style={styles.confirmMessage}>
            Kuota {editingItem?.name ? `"${editingItem.name}" ` : ''}akan direset menjadi {editingItem?.used_quota ?? 0}. Sisa kuota menjadi 0 dan tidak bisa dipakai sampai Anda menambahkan kuota lagi.
          </Text>
          <View style={styles.confirmActions}>
            <Button label="Batal" variant="secondary" onPress={() => setResetConfirm(false)} />
            <Button label="Ya, reset kuota" variant="danger" onPress={resetQuota} style={{ flex: 1 }} />
          </View>
        </View>
      </Sheet>

      <StoreForm open={showStoreForm} onClose={() => setShowStoreForm(false)} onSave={addStore} />
    </View>
  );
}

const webNoOutline = ({ outlineStyle: 'none', outlineWidth: 0 } as unknown) as ViewStyle;

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContainer: { paddingHorizontal: 16, paddingBottom: 32 },

  // Summary Metrics
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
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  metricSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },

  // Search & Filter
  controlBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  searchBox: {
    flex: 1,
    minWidth: 240,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 40,
  },
  searchBoxFocused: {
    borderColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  searchIcon: {
    fontSize: 14,
    color: '#64748B',
    marginRight: 8,
  },
  searchIconFocused: {
    color: '#0F172A',
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
  },
  clearSearch: {
    fontSize: 12,
    color: '#94A3B8',
    padding: 4,
  },
  filterGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Enterprise Table
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rowEven: {
    backgroundColor: '#FFFFFF',
  },
  rowOdd: {
    backgroundColor: '#FAFAFA',
  },
  td: {
    justifyContent: 'center',
  },
  productName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  storeName: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  quotaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  quotaNumbers: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  quotaPct: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  fillNormal: {
    backgroundColor: '#1E293B',
  },
  fillExhausted: {
    backgroundColor: '#DC2626',
  },
  remainingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  tagExhausted: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  tagExhaustedText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#991B1B',
  },

  // Status Badges
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  badgeActive: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  badgeInactive: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: '#10B981',
  },
  dotInactive: {
    backgroundColor: '#94A3B8',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  textActive: {
    color: '#0F172A',
  },
  textInactive: {
    color: '#64748B',
  },

  // Action Buttons
  moreButton: {
    width: 34,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.sm,
    backgroundColor: '#F8FAFC',
  },
  moreButtonText: { fontSize: 20, lineHeight: 20, color: '#334155', fontWeight: '800' },
  actionBackdrop: { flex: 1, backgroundColor: 'transparent' },
  actionPopup: { position: 'absolute', width: 148, padding: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: '#D8DEE6', backgroundColor: '#FFFFFF', shadowColor: '#0F172A', shadowOpacity: 0.14, shadowOffset: { width: 0, height: 5 }, shadowRadius: 12, elevation: 8 },
  popupItem: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 5 },
  popupText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  popupDanger: { backgroundColor: '#FFF7F7' },
  popupDangerText: { fontSize: 11, fontWeight: '700', color: '#991B1B' },
  btnEdit: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  btnEditText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
  },
  btnDelete: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  btnDeleteText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991B1B',
  },
  btnToggle: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  btnToggleOff: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
  },
  btnToggleOffText: {
    color: '#64748B',
  },
  btnToggleOn: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  btnToggleOnText: {
    color: '#FFFFFF',
  },
  btnToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Empty state inside table
  emptyTable: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  emptySub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },

  // Modal styling
  formContainer: {
    gap: 12,
    paddingVertical: 8,
  },
  storeModalBackdrop: { flex: 1, backgroundColor: 'rgba(15,22,42,.45)', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 20 },
  storeModal: { backgroundColor: colors.surface, borderRadius: radius.lg, width: '100%', maxWidth: 460, padding: 20, shadowColor: '#0F162A', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 16 }, shadowRadius: 32, elevation: 20 },
  storeModalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  storeModalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  storeModalClose: { fontSize: 26, color: colors.faint, paddingHorizontal: 4 },
  formInfo: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  quotaSummary: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  quotaCell: { flex: 1, minWidth: 76, justifyContent: 'center' },
  quotaCellInput: { flex: 1.25, minWidth: 110 },
  quotaSummaryLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  quotaSummaryValue: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 5 },
  quotaOperator: { color: colors.faint, fontSize: 18, fontWeight: '800', marginBottom: 3 },
  confirmBox: { gap: 10 },
  confirmIcon: { width: 38, height: 38, borderRadius: radius.full, backgroundColor: '#FFF4E5', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  confirmIconText: { color: '#A8610F', fontSize: 20, fontWeight: '800' },
  confirmTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  confirmMessage: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
