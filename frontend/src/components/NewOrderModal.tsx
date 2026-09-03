import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { api, type MarketplaceStore, type ProductRow, type SessionUser } from '../lib/api';
import { notify } from '../lib/notify';
import { pickPhoto, type PickedPhoto } from '../lib/photo';
import { colors, radius, pickupMethodOptions, webNoOutline } from '../theme';
import { Button, Field, Select, Sheet, type SelectOption } from './ui';

export function NewOrderModal({ open, onClose, user, onCreated }: { open: boolean; onClose: () => void; user: SessionUser | null; onCreated: () => void }) {
  const isAdmin = user?.role === 'admin';
  const [orderNumber, setOrderNumber] = useState('');
  const [recipient, setRecipient] = useState('');
  const [method, setMethod] = useState<'zaydan_ambilan_gjm' | 'self_pick_up'>('zaydan_ambilan_gjm');
  const [traderId, setTraderId] = useState<string>(user?.id ?? '');
  const [traders, setTraders] = useState<SessionUser[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productId, setProductId] = useState('');
  const [stores, setStores] = useState<MarketplaceStore[]>([]);
  const [storeId, setStoreId] = useState('');
  const [amount, setAmount] = useState('');
  const [barcodeImg, setBarcodeImg] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTrader, setShowTrader] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setOrderNumber(''); setRecipient('');
    setMethod('zaydan_ambilan_gjm'); setAmount(''); setProductId(''); setStoreId(''); setBarcodeImg(null);
    setTraderId(user.id);
    if (isAdmin) api.listUsers().then((us) => setTraders(us.filter((u) => u.is_active)));
    api.listProducts().then(setProducts).catch(() => setProducts([]));
    api.listMarketplaceStores().then(setStores).catch(() => setStores([]));
  }, [open, user, isAdmin]);

  const pickBarcode = async () => {
    setBarcodeImg(await pickPhoto('Lampirkan barcode'));
  };

  if (!user) return null;

  const selectedProduct = products.find((p) => p.id === productId);
  const traderOptions: SelectOption[] = traders.map((t) => ({ value: t.id, label: t.display_name, sub: `@${t.username}` }));
  // Rebutan kuota per tipe barang: hanya produk aktif dengan sisa kuota > 0 yang bisa dipilih.
  const productOptions: SelectOption[] = products
    .filter((p) => p.is_active)
    .map((p) => ({
      value: p.id,
      label: p.name,
      sub: p.remaining_quota > 0 ? `Sisa kuota: ${p.remaining_quota}/${p.quota}` : '[KUOTA HABIS]',
      disabled: p.remaining_quota <= 0,
    }));
  const storeOptions: SelectOption[] = stores
    .filter((s) => s.is_active)
    .map((s) => ({ value: s.id, label: s.name }));

  const save = async () => {
    if (!productId || !storeId || !orderNumber.trim() || !recipient.trim()) {
      notify('Lengkapi data', 'Produk, toko, nomor pesanan, dan penerima wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      const order = await api.createOrder({
        order_number: orderNumber.trim(),
        recipient_name: recipient.trim(),
        pickup_method: method,
        trader_id: traderId,
        product_id: productId,
        store_id: storeId,
        order_amount: amount ? Number(amount) : null,
      });
      if (barcodeImg) {
        await api.attachBarcode(order.id, barcodeImg);
      }
      onCreated();
      onClose();
    } catch (e) {
      notify('Tidak dapat menyimpan', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addTrader = async () => { setShowTrader(true); };
  const createTrader = async (username: string, name: string, password: string) => {
    try {
      await api.createUser({ username, password, display_name: name, role: 'trader' });
      const us = await api.listUsers();
      setTraders(us.filter((u) => u.is_active));
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Input order baru">
      <ScrollView contentContainerStyle={{ paddingBottom: 6 }}>
        <View style={styles.formStack}>
          <View style={styles.twoColumn}>
            <View style={styles.column}>
              <Select
                block
                label="Pilih produk"
                value={productId}
                options={productOptions}
                onChange={setProductId}
                placeholder="Pilih produk"
              />
              {selectedProduct && <Text style={styles.locked}>{selectedProduct.name} · Sisa {selectedProduct.remaining_quota}</Text>}
            </View>
            <View style={styles.column}>
              <Select
                block
                label="Pilih toko"
                value={storeId}
                options={storeOptions}
                onChange={setStoreId}
                placeholder="Pilih toko"
              />
            </View>
          </View>

          <View style={styles.twoColumn}>
            <View style={styles.column}>
              <Field style={webNoOutline} label="Nomor pesanan" value={orderNumber} onChangeText={setOrderNumber} placeholder="TRK-..." />
            </View>
            <View style={styles.column}>
              <Field style={webNoOutline} label="Nama penerima" value={recipient} onChangeText={setRecipient} placeholder="Nama penerima" />
            </View>
          </View>

          <View style={styles.twoColumn}>
            <View style={styles.column}>
              <Select block label="Metode pengambilan" value={method} options={pickupMethodOptions} onChange={(v) => setMethod(v as 'zaydan_ambilan_gjm' | 'self_pick_up')} placeholder="Pilih metode" />
            </View>
            <View style={styles.column}>
              {isAdmin ? (
                <Select block label="Nama trader" value={traderId} options={traderOptions} onChange={setTraderId} placeholder="Pilih trader" onAdd={addTrader} addLabel="Tambah trader baru" />
              ) : (
                <Text style={styles.locked}>{user.display_name}</Text>
              )}
            </View>
          </View>

          <View style={styles.formBlock}>
            <Field style={webNoOutline} label="Nominal order (opsional)" value={amount} onChangeText={setAmount} placeholder="Untuk rekap per produk" keyboardType="numeric" />
          </View>

          <View style={styles.formBlock}>
        {barcodeImg ? (
          <View style={styles.barcodeBox}>
            <Pressable onPress={pickBarcode} style={styles.barcodePreview}>
              <Text style={styles.barcodeGlyph}>▣</Text>
              <View>
                <Text style={styles.barcodeLabel}>Barcode terpasang</Text>
                <Text style={styles.barcodeHint}>Ketuk untuk mengganti gambar</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => setBarcodeImg(null)} hitSlop={6}>
              <Text style={styles.barcodeRemove}>✕ Hapus</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={pickBarcode} style={({ pressed }) => [styles.barcodeAdd, pressed && { opacity: 0.85 }]}>
            <Text style={styles.barcodeAddIcon}>＋</Text>
            <Text style={styles.barcodeAddLabel}>Lampirkan gambar barcode pengambilan</Text>
            <Text style={styles.barcodeAddHint}>Ambil dari Kamera / Pilih dari Galeri</Text>
          </Pressable>
          )}
          </View>
        </View>

        <View style={styles.formActions}>
          <Button label={busy ? 'Menyimpan…' : 'Simpan order'} onPress={save} disabled={busy} fullWidth />
        </View>
      </ScrollView>

      <TraderForm open={showTrader} onClose={() => setShowTrader(false)} onSave={async (u, n, p) => { await createTrader(u, n, p); setShowTrader(false); }} />
    </Sheet>
  );
}

function TraderForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (username: string, name: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!username.trim() || !name.trim() || !password) {
      notify('Lengkapi data', 'Username, nama lengkap, dan kata sandi wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      await onSave(username.trim(), name.trim(), password);
      setUsername(''); setName(''); setPassword('');
    } catch (e) {
      notify('Gagal', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Tambah trader baru">
      <Field style={webNoOutline} label="Username" value={username} onChangeText={setUsername} placeholder="mis. trader-budi" autoCapitalize="none" />
      <Field style={webNoOutline} label="Nama lengkap" value={name} onChangeText={setName} placeholder="Nama lengkap trader" />
      <Field style={webNoOutline} label="Kata sandi awal" value={password} onChangeText={setPassword} secureTextEntry placeholder="Kata sandi untuk login" />
      <View style={styles.modalActions}>
        <Button label="Batal" variant="secondary" onPress={onClose} disabled={busy} />
        <Button label={busy ? 'Menyimpan…' : 'Simpan trader'} onPress={save} disabled={busy} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  formStack: { gap: 20 },
  formBlock: { width: '100%' },
  twoColumn: { flexDirection: 'row', gap: 14 },
  column: { flex: 1, minWidth: 0 },
  formActions: { marginTop: 26, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  locked: { fontSize: 11, color: colors.muted, marginTop: 6, backgroundColor: '#F4F6F8', borderRadius: 8, padding: 11, borderWidth: 1, borderColor: '#E2E8F0' },
  barcodeAdd: {
    borderWidth: 1, borderStyle: 'dashed', borderColor: '#AAB7C5', backgroundColor: '#F8FAFC',
    borderRadius: radius.md, paddingVertical: 18, alignItems: 'center', gap: 3,
  },
  barcodeAddIcon: { fontSize: 22, color: colors.primaryMuted, lineHeight: 24 },
  barcodeAddLabel: { fontSize: 11, fontWeight: '700', color: colors.primary },
  barcodeAddHint: { fontSize: 9, color: colors.muted },
  barcodeBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#D8DEE6', borderRadius: radius.md, padding: 12,
  },
  barcodePreview: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  barcodeGlyph: { fontSize: 26, color: colors.primaryMuted },
  barcodeLabel: { fontSize: 11, fontWeight: '700', color: colors.muted },
  barcodeHint: { fontSize: 9, color: colors.faint, marginTop: 2 },
  barcodeRemove: { fontSize: 11, color: colors.red, fontWeight: '700' },
});
