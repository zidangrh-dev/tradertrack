import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from 'react-native';
import { api, type MarketplaceStore, type ProductRow, type SessionUser } from '../lib/api';
import { notify } from '../lib/notify';
import { pickPhoto, type PickedPhoto } from '../lib/photo';
import { colors, radius, pickupMethodOptions, webNoOutline } from '../theme';
import { Button, Field, PasswordField, Select, Sheet, type SelectOption } from './ui';
import { isAdminLevel } from '../lib/roles';

export function NewOrderModal({ open, onClose, user, onCreated }: { open: boolean; onClose: () => void; user: SessionUser | null; onCreated: () => void }) {
  const isAdmin = isAdminLevel(user?.role);
  const [orderNumber, setOrderNumber] = useState('');
  const [recipient, setRecipient] = useState('');
  const [method, setMethod] = useState<'zaydan_ambilan_gjm' | 'self_pick_up'>('self_pick_up');
  const [traderId, setTraderId] = useState<string>(user?.id ?? '');
  const [traders, setTraders] = useState<SessionUser[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productId, setProductId] = useState('');
  const [stores, setStores] = useState<MarketplaceStore[]>([]);
  const [storeId, setStoreId] = useState('');
  const [amount, setAmount] = useState('');
  const [orderImg, setOrderImg] = useState<PickedPhoto | null>(null);
  const [barcodeImg, setBarcodeImg] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTrader, setShowTrader] = useState(false);
  // Dua kolom juga di HP (sama seperti web) — Select mode field tidak lagi
  // memaksa lebar minimum 180px. Hanya layar sangat kecil yang ditumpuk.
  const isNarrow = useWindowDimensions().width < 360;

  useEffect(() => {
    if (!open || !user) return;
    setOrderNumber(''); setRecipient('');
    setMethod('self_pick_up'); setAmount(''); setProductId(''); setStoreId('');
    setOrderImg(null); setBarcodeImg(null);
    setTraderId(user.id);
    if (isAdmin) api.listUsers().then((us) => setTraders(us.filter((u) => u.is_active)));
    api.listProducts().then(setProducts).catch(() => setProducts([]));
    api.listMarketplaceStores().then(setStores).catch(() => setStores([]));
  }, [open, user, isAdmin]);

  const pickOrderProof = async () => {
    const photo = await pickPhoto('Lampirkan foto bukti order');
    if (photo) setOrderImg(photo);
  };
  const pickBarcode = async () => {
    const photo = await pickPhoto('Lampirkan barcode pick up');
    if (photo) setBarcodeImg(photo);
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
      // Order tetap tersimpan bila lampiran gagal — trader diberi tahu mana yang
      // perlu diulang lewat modal detail, tidak ada order hantu.
      const failed: string[] = [];
      if (orderImg) {
        try { await api.uploadPhoto(order.id, orderImg, 'order'); } catch { failed.push('foto bukti order'); }
      }
      if (barcodeImg) {
        try { await api.attachBarcode(order.id, barcodeImg); } catch { failed.push('barcode pick up'); }
      }
      if (failed.length) {
        notify('Order tersimpan, lampiran gagal', `Gagal mengunggah ${failed.join(' dan ')}. Lampirkan ulang dari detail order sebelum pick up.`);
      } else if (!orderImg || !barcodeImg) {
        notify('Order tersimpan', 'Lengkapi foto bukti order dan barcode pick up agar pesanan bisa diproses.');
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
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 6 }}>
        <View style={styles.formStack}>
          <View style={[styles.twoColumn, isNarrow && styles.twoColumnStacked]}>
            <View style={styles.column}>
              <Select
                block
                field
                label="Pilih produk"
                value={productId}
                options={productOptions}
                onChange={setProductId}
                placeholder="Pilih produk"
              />
              {/* Ruang info sisa kuota selalu disediakan agar tinggi kolom tidak
                  berubah saat produk dipilih (nama produk sudah tampil di trigger). */}
              <Text style={styles.quotaHint} numberOfLines={1}>
                {selectedProduct ? `Sisa kuota ${selectedProduct.remaining_quota} dari ${selectedProduct.quota}` : ' '}
              </Text>
            </View>
            <View style={styles.column}>
              <Select
                block
                field
                label="Pilih toko"
                value={storeId}
                options={storeOptions}
                onChange={setStoreId}
                placeholder="Pilih toko"
              />
              {/* Penyeimbang tinggi terhadap info kuota di kolom kiri. */}
              <Text style={styles.quotaHint}> </Text>
            </View>
          </View>

          <View style={[styles.twoColumn, isNarrow && styles.twoColumnStacked]}>
            <View style={styles.column}>
              <Field style={webNoOutline} label="Nomor pesanan" value={orderNumber} onChangeText={setOrderNumber} placeholder="TRK-..." />
            </View>
            <View style={styles.column}>
              <Field style={webNoOutline} label="Nama penerima" value={recipient} onChangeText={setRecipient} placeholder="Nama penerima" />
            </View>
          </View>

          <View style={[styles.twoColumn, isNarrow && styles.twoColumnStacked]}>
            <View style={styles.column}>
              <Select block field label="Metode pengambilan" value={method} options={pickupMethodOptions} onChange={(v) => setMethod(v as 'zaydan_ambilan_gjm' | 'self_pick_up')} placeholder="Pilih metode" />
            </View>
            <View style={styles.column}>
              {isAdmin ? (
                <Select block field label="Nama trader" value={traderId} options={traderOptions} onChange={setTraderId} placeholder="Pilih trader" onAdd={addTrader} addLabel="Tambah trader baru" />
              ) : (
                // Trader terkunci ke dirinya sendiri — bentuknya tetap sebaris kolom lain.
                <>
                  <Text style={styles.readonlyLabel}>Nama trader</Text>
                  <View style={styles.readonlyBox}>
                    <Text style={styles.readonlyText} numberOfLines={1}>{user.display_name}</Text>
                  </View>
                </>
              )}
            </View>
          </View>

          <View style={styles.formBlock}>
            <Field style={webNoOutline} label="Nominal order (opsional)" value={amount} onChangeText={setAmount} placeholder="Untuk rekap per produk" keyboardType="numeric" />
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.attachTitle}>Lampiran pick up</Text>
            <View style={[styles.twoColumn, isNarrow && styles.twoColumnStacked]}>
              <View style={styles.column}>
                <AttachSlot
                  label="Foto bukti order"
                  hint="Tangkapan layar pesanan marketplace"
                  photo={orderImg}
                  onPick={pickOrderProof}
                  onClear={() => setOrderImg(null)}
                />
              </View>
              <View style={styles.column}>
                <AttachSlot
                  label="Barcode pick up"
                  hint="Barcode/resi untuk pengambilan paket"
                  photo={barcodeImg}
                  onPick={pickBarcode}
                  onClear={() => setBarcodeImg(null)}
                />
              </View>
            </View>
            {(!orderImg || !barcodeImg) && (
              <View style={styles.attachNote}>
                <Text style={styles.attachNoteText}>
                  Pesanan tanpa barcode pick up dan foto bukti order tidak akan diproses. Lampiran bisa dilengkapi
                  nanti dari detail order, tetapi harus lengkap sebelum masuk proses pick up.
                </Text>
              </View>
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

/** Satu slot lampiran: kosong → area unggah; terisi → pratinjau + ganti/hapus. */
function AttachSlot({ label, hint, photo, onPick, onClear }: {
  label: string;
  hint: string;
  photo: PickedPhoto | null;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <View>
      <Text style={styles.attachLabel}>{label}</Text>
      {photo ? (
        <View style={styles.attachFilled}>
          <Pressable onPress={onPick} style={styles.attachPreview} accessibilityLabel={`Ganti ${label}`}>
            <Image source={{ uri: photo.uri }} style={styles.attachThumb} resizeMode="cover" />
            <View style={styles.attachInfo}>
              <Text style={styles.attachOk} numberOfLines={1}>Terlampir</Text>
              <Text style={styles.attachSub} numberOfLines={1}>Ketuk untuk mengganti</Text>
            </View>
          </Pressable>
          <Pressable onPress={onClear} hitSlop={8} accessibilityLabel={`Hapus ${label}`}>
            <Text style={styles.attachRemove}>✕</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={onPick} style={({ pressed }) => [styles.attachEmpty, pressed && { opacity: 0.85 }]}>
          <Text style={styles.attachIcon}>＋</Text>
          <Text style={styles.attachAdd}>Lampirkan foto</Text>
          <Text style={styles.attachSub} numberOfLines={2}>{hint}</Text>
        </Pressable>
      )}
    </View>
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
      <PasswordField style={webNoOutline} label="Kata sandi awal" value={password} onChangeText={setPassword} placeholder="Kata sandi untuk login" />
      <View style={styles.modalActions}>
        <Button label="Batal" variant="secondary" onPress={onClose} disabled={busy} />
        <Button label={busy ? 'Menyimpan…' : 'Simpan trader'} onPress={save} disabled={busy} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Field/Select sudah membawa marginBottom 13 sendiri — gap di sini hanya
  // penambah tipis, bukan sumber ritme, agar baris tidak berjarak ganda.
  formStack: { gap: 4 },
  formBlock: { width: '100%' },
  // Kolom rapat (10) supaya pasangan kiri-kanan terbaca satu kesatuan; saat
  // ditumpuk di HP jaraknya sedikit lebih lega karena jadi baris terpisah.
  twoColumn: { flexDirection: 'row', gap: 10 },
  // Saat ditumpuk, jarak vertikal datang dari marginBottom milik tiap field.
  twoColumnStacked: { flexDirection: 'column', gap: 0 },
  column: { flex: 1, minWidth: 0 },
  formActions: { marginTop: 26, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  locked: { fontSize: 11, color: colors.muted, marginTop: 6, backgroundColor: '#F4F6F8', borderRadius: 8, padding: 11, borderWidth: 1, borderColor: '#E2E8F0' },
  // Kolom hanya-baca: setinggi Field/Select agar baris tetap seragam.
  readonlyLabel: { fontSize: 11, fontWeight: '700', color: colors.muted },
  readonlyBox: {
    height: 42, marginTop: 6, justifyContent: 'center', paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: '#F7F9FB',
  },
  readonlyText: { fontSize: 13, color: colors.muted },
  // Tinggi tetap: ruang tersedia baik saat kosong maupun terisi.
  // Select di atasnya membawa marginBottom 13; margin negatif menarik hint
  // kembali menempel ke dropdown produk (jarak nyata ≈ 3px).
  quotaHint: { fontSize: 10, color: colors.muted, marginTop: -10, height: 14, lineHeight: 14 },
  attachTitle: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 },
  attachLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, marginBottom: 6 },
  // Tinggi dipatok (bukan minHeight): kedua kotak identik, baik kosong maupun
  // terisi, dan panjang teks hint tidak lagi mengubah ukuran.
  attachEmpty: {
    height: 96,
    borderWidth: 1, borderStyle: 'dashed', borderColor: '#B9C8DA', borderRadius: radius.md,
    backgroundColor: '#F7FAFD', paddingHorizontal: 12, alignItems: 'center', gap: 3, justifyContent: 'center',
  },
  attachIcon: { fontSize: 20, color: colors.primaryMuted, lineHeight: 22 },
  attachAdd: { fontSize: 11, fontWeight: '700', color: colors.primary },
  attachSub: { fontSize: 9, color: colors.faint, textAlign: 'center', lineHeight: 13 },
  attachFilled: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 96,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    backgroundColor: colors.surface, padding: 10,
  },
  attachPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  attachThumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  attachInfo: { flex: 1, minWidth: 0 },
  attachOk: { fontSize: 11, fontWeight: '800', color: '#1F7A4D' },
  attachRemove: { fontSize: 13, color: colors.red, fontWeight: '800', paddingHorizontal: 4 },
  attachNote: {
    marginTop: 10, backgroundColor: '#FCF3E3', borderRadius: radius.sm,
    borderLeftWidth: 3, borderLeftColor: '#A8610F', paddingVertical: 9, paddingHorizontal: 11,
  },
  attachNoteText: { fontSize: 10, color: '#8A5310', lineHeight: 15 },
});
