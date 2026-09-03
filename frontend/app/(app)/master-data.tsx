import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { api, type MarketplaceStore, type ProductRow } from '../../src/lib/api';
import { notify, confirmAsk } from '../../src/lib/notify';
import { useAdminOnly } from '../../src/hooks/useRoleGuard';
import { colors, radius } from '../../src/theme';
import { Button, Field, PageHeader, SearchInput, Sheet } from '../../src/components/ui';
import { MetricsRow, ProductTable, StoreTable } from './_master-tables';

function StoreForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  const save = () => { if (name.trim()) { onSave(name); setName(''); } };
  return (
    <Sheet open={open} onClose={onClose} title="Tambah toko marketplace">
      <Field label="Nama toko" value={name} onChangeText={setName} placeholder="Contoh: Tokopedia" />
      <View style={styles.modalActions}><Button label="Batal" variant="secondary" onPress={onClose} /><Button label="Tambah toko" onPress={save} style={{ flex: 1 }} /></View>
    </Sheet>
  );
}

export default function MasterData() {
  useAdminOnly();

  const [items, setItems] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showStoreForm, setShowStoreForm] = useState(false);
  const [search, setSearch] = useState('');
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
        <MetricsRow stats={stats} styles={styles} />

        {/* Filter & Search Bar */}
        <View style={styles.controlBar}>
          <View style={styles.searchBox}>
            <SearchInput value={search} onChangeText={setSearch} placeholder="Cari nama produk..." />
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
        <ProductTable
          items={filteredItems}
          loading={loading}
          styles={styles}
          onMore={(item, pos) => { setActionPosition(pos); setActionItem(item); }}
        />

        <StoreTable
          stores={stores}
          styles={styles}
          onRemove={(store) => confirmAsk('Hapus toko marketplace', `Hapus "${store.name}" dari daftar?`, () => removeStore(store))}
          onAdd={() => setShowStoreForm(true)}
        />
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

  actionBackdrop: { flex: 1, backgroundColor: 'transparent' },
  actionPopup: { position: 'absolute', width: 148, padding: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: '#D8DEE6', backgroundColor: '#FFFFFF', shadowColor: '#0F172A', shadowOpacity: 0.14, shadowOffset: { width: 0, height: 5 }, shadowRadius: 12, elevation: 8 },
  popupItem: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 5 },
  popupText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  popupDanger: { backgroundColor: '#FFF7F7' },
  popupDangerText: { fontSize: 11, fontWeight: '700', color: '#991B1B' },

  // Empty state inside table
  emptyTable: {
    paddingVertical: 40,
    alignItems: 'center',
  },

  // Modal styling
  formContainer: {
    gap: 12,
    paddingVertical: 8,
  },
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
