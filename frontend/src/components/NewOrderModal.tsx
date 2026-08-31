import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api, type AccountRow, type SessionUser } from '../lib/api';
import { colors, radius } from '../theme';
import { Button, Field, Select, Sheet, type SelectOption } from './ui';

const METHOD_OPTIONS: SelectOption[] = [
  { value: 'zaydan_ambilan_gjm', label: 'Zaydan Ambilan GJM' },
  { value: 'self_pick_up', label: 'Self Pick Up' },
];

export function NewOrderModal({ open, onClose, user, onCreated }: { open: boolean; onClose: () => void; user: SessionUser | null; onCreated: () => void }) {
  const isAdmin = user?.role === 'admin';
  const [product, setProduct] = useState('');
  const [store, setStore] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [recipient, setRecipient] = useState('');
  const [method, setMethod] = useState<'zaydan_ambilan_gjm' | 'self_pick_up'>('zaydan_ambilan_gjm');
  const [traderId, setTraderId] = useState<string>(user?.id ?? '');
  const [traders, setTraders] = useState<SessionUser[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [bankId, setBankId] = useState('');
  const [amount, setAmount] = useState('');
  const [barcodeImg, setBarcodeImg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setProduct(''); setStore(''); setOrderNumber(''); setRecipient('');
    setMethod('zaydan_ambilan_gjm'); setAmount(''); setBankId(''); setBarcodeImg(null);
    setTraderId(user.id);
    if (isAdmin) api.listUsers().then((us) => setTraders(us.filter((u) => u.is_active)));
    api.listAccounts().then((acc) => {
      setAccounts(acc);
      setBankId((cur) => cur || acc.find((a) => a.is_active)?.id || '');
    });
  }, [open, user, isAdmin]);

  const pickBarcode = async () => {
    const pick = (source: 'camera' | 'library') =>
      source === 'camera'
        ? ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    let res;
    if (Platform.OS === 'web') {
      res = await pick('library');
    } else {
      res = await new Promise<ImagePicker.ImagePickerResult>((resolve) => {
        Alert.alert('Lampirkan barcode', 'Pilih sumber gambar', [
          { text: 'Batal', style: 'cancel' },
          { text: 'Ambil dari Kamera', onPress: () => pick('camera').then(resolve) },
          { text: 'Pilih dari Galeri', onPress: () => pick('library').then(resolve) },
        ]);
      });
    }
    if (!res.canceled && res.assets?.[0]) setBarcodeImg(res.assets[0].uri);
  };

  if (!user) return null;

  const activeAccounts = accounts.filter((a) => a.is_active);
  const traderOptions: SelectOption[] = traders.map((t) => ({ value: t.id, label: t.display_name, sub: `@${t.username}` }));
  const accountOptions: SelectOption[] = activeAccounts.map((a) => ({ value: a.id, label: `${a.bank_name} · ${a.account_number}`, sub: a.account_holder_name }));

  const save = async () => {
    if (!product.trim() || !store.trim() || !orderNumber.trim() || !recipient.trim() || !bankId) {
      Alert.alert('Lengkapi data', 'Produk, toko, nomor pesanan, penerima, dan rekening wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      const order = await api.createOrder({
        product_name: product.trim(),
        store_name: store.trim(),
        order_number: orderNumber.trim(),
        recipient_name: recipient.trim(),
        pickup_method: method,
        trader_id: traderId,
        bank_account_id: bankId,
        order_amount: amount ? Number(amount) : null,
      });
      if (barcodeImg) {
        await api.attachBarcode(order.id, { uri: barcodeImg, name: `barcode-${Date.now()}.jpg`, type: 'image/jpeg' });
      }
      onCreated();
      onClose();
    } catch (e) {
      Alert.alert('Tidak dapat menyimpan', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addAccount = async () => {
    const number = promptSimple('Nomor rekening baru:');
    if (!number) return;
    const bank = promptSimple('Nama bank:') ?? '';
    const holder = promptSimple('Nama pemilik:') ?? '';
    try {
      const acc = await api.createAccount({ account_number: number, bank_name: bank, account_holder_name: holder });
      setAccounts(acc);
      setBankId(acc[acc.length - 1].id);
    } catch (e) {
      Alert.alert('Gagal', (e as Error).message);
    }
  };

  const addTrader = async () => {
    const username = promptSimple('Username trader baru:');
    if (!username) return;
    const name = promptSimple('Nama lengkap:') ?? '';
    const password = promptSimple('Kata sandi awal:') ?? '';
    if (!name || !password) {
      Alert.alert('Lengkapi data', 'Nama lengkap dan kata sandi wajib diisi.');
      return;
    }
    try {
      await api.createUser({ username, password, display_name: name, role: 'trader' });
      const us = await api.listUsers();
      setTraders(us.filter((u) => u.is_active));
    } catch (e) {
      Alert.alert('Gagal', (e as Error).message);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Input order baru">
      <ScrollView contentContainerStyle={{ paddingBottom: 6 }}>
        <Text style={styles.note}>Order akan tersimpan dengan status Data masuk dan otomatis mencatat pembuatnya.</Text>
        <Field label="Nama produk" value={product} onChangeText={setProduct} placeholder="Contoh: Wireless Keyboard K2" />
        <Field label="Nama toko" value={store} onChangeText={setStore} placeholder="Tokopedia / Shopee / ..." />
        <Field label="Nomor pesanan" value={orderNumber} onChangeText={setOrderNumber} placeholder="#TRK-..." hint="Harus unik. Jika sudah pernah dipakai, sistem akan menolak." />
        <Field label="Nama penerima" value={recipient} onChangeText={setRecipient} placeholder="Nama penerima sesuai alamat kirim" />

        <Text style={styles.fieldLabel}>Metode pengambilan</Text>
        <Select label="Metode" value={method} options={METHOD_OPTIONS} onChange={(v) => setMethod(v as 'zaydan_ambilan_gjm' | 'self_pick_up')} placeholder="Pilih metode" />

        <Text style={styles.fieldLabel}>Nama trader</Text>
        {isAdmin ? (
          <Select
            label="Trader"
            value={traderId}
            options={traderOptions}
            onChange={setTraderId}
            placeholder="Pilih trader"
            onAdd={addTrader}
            addLabel="Tambah trader baru"
          />
        ) : (
          <Text style={styles.locked}>{user.display_name} (terisi otomatis dari akun Anda)</Text>
        )}

        <Text style={styles.fieldLabel}>Nomor rekening</Text>
        <Select
          label="Rekening"
          value={bankId}
          options={accountOptions}
          onChange={setBankId}
          placeholder="Pilih rekening"
          onAdd={isAdmin ? addAccount : undefined}
          addLabel="Tambah rekening baru"
        />

        <View style={styles.amountField}>
          <Field label="Nominal order (opsional)" value={amount} onChangeText={setAmount} placeholder="Hanya untuk rekap per rekening" keyboardType="numeric" />
        </View>

        <Text style={styles.fieldLabel}>Barcode pengambilan (opsional)</Text>
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

        <Button label={busy ? 'Menyimpan…' : 'Simpan order'} onPress={save} disabled={busy} fullWidth />
      </ScrollView>
    </Sheet>
  );
}

function promptSimple(message: string) {
  if (typeof window !== 'undefined' && window.prompt) return window.prompt(message);
  return null;
}

const styles = StyleSheet.create({
  note: { fontSize: 11, color: '#84919C', marginBottom: 14, lineHeight: 17 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#647384', marginTop: 14, marginBottom: 6 },
  amountField: { marginTop: 12 },
  locked: { fontSize: 12, color: colors.muted, marginTop: 6, backgroundColor: '#F4F6F7', borderRadius: 8, padding: 11 },
  barcodeAdd: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9C8DA', backgroundColor: '#F4F8FD',
    borderRadius: radius.md, paddingVertical: 18, alignItems: 'center', gap: 3,
  },
  barcodeAddIcon: { fontSize: 22, color: colors.primaryMuted, lineHeight: 24 },
  barcodeAddLabel: { fontSize: 11, fontWeight: '700', color: '#557EAE' },
  barcodeAddHint: { fontSize: 9, color: '#7E94AC' },
  barcodeBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2,
    backgroundColor: '#F4F8FD', borderWidth: 1, borderColor: '#DCE7F5', borderRadius: radius.md, padding: 12,
  },
  barcodePreview: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  barcodeGlyph: { fontSize: 26, color: colors.primaryMuted },
  barcodeLabel: { fontSize: 11, fontWeight: '700', color: colors.muted },
  barcodeHint: { fontSize: 9, color: colors.faint, marginTop: 2 },
  barcodeRemove: { fontSize: 11, color: colors.red, fontWeight: '700' },
});
