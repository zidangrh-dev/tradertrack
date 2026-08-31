import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, type OrderDetail, type OrderView } from '../lib/api';
import { colors, pickupMethodLabel } from '../theme';
import { useAuth } from '../hooks/useAuth';
import { Avatar, Button, Sheet, StatusTag } from './ui';

export function OrderDetailModal({ order, onClose, onChanged }: { order: OrderView | null; onClose: () => void; onChanged?: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isOwner = order?.trader_id === user?.id;
  const canEdit = !!order && (isAdmin || (isOwner && order.status === 'data_masuk'));

  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (order) api.detail(order.id).then(setDetail);
  }, [order]);

  useEffect(() => {
    setProblem(detail?.is_problem ?? false);
    setReason(detail?.problem_reason ?? '');
    setNote(detail?.note ?? '');
  }, [detail]);

  const mutate = useCallback(async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      const fresh = order ? await api.detail(order.id) : null;
      setDetail(fresh);
      onChanged?.();
    } catch (e) {
      Alert.alert('Gagal', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [order, onChanged]);

  const minPhotos = 1;

  if (!order) return null;
  const canComplete = !!detail && detail.photo_count >= minPhotos && isAdmin;

  const finish = () => mutate(() => api.completeOrder(order.id, note.trim()), 'diselesaikan');
  const saveProblem = () => mutate(() => api.markProblem(order.id, reason.trim()), 'ditandai bermasalah');
  const reopen = () => mutate(() => api.reopen(order.id), 'dibuka kembali');

  return (
    <Sheet open={!!order} onClose={onClose} title={`#${order.order_number}`} wide>
      <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
        <View style={styles.topRow}>
          <StatusTag status={order.status} />
          {detail?.is_problem && <Text style={styles.problemTag}>Bermasalah</Text>}
          <Text style={styles.metaRight}>Input {new Date(order.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</Text>
        </View>

        <Text style={styles.product}>{order.product_name}</Text>
        <View style={styles.grid}>
          <DetailItem label="Toko" value={order.store_name} />
          <DetailItem label="Penerima" value={order.recipient_name} />
          <DetailItem label="Trader (checkout)" value={order.trader_name} />
          <DetailItem label="Metode" value={pickupMethodLabel[order.pickup_method]} />
          <DetailItem label="Rekening" value={order.bank_account_label} />
        </View>

        {typeof order.barcode_path === 'string' && order.barcode_path.length > 0 && (
          <>
            <Text style={styles.section}>Barcode pengambilan</Text>
            <View style={styles.photoRow}>
              <Pressable style={styles.thumb} onPress={() => setPreview(order.barcode_path!)}>
                <View style={styles.thumbInner}>
                  <Text style={styles.thumbGlyph}>▣</Text>
                  <Text style={styles.thumbCaption}>Barcode</Text>
                </View>
              </Pressable>
            </View>
          </>
        )}

        {isAdmin && (
          <>
            <Text style={styles.section}>Catatan penyelesaian</Text>            <TextInput style={styles.textarea} multiline placeholder="Tulis catatan kondisi barang atau kendala..." value={note} onChangeText={setNote} />

            <Text style={styles.section}>
              Foto bukti (minimal 1) · {detail?.photo_count ?? 0} terunggah
            </Text>
            <View style={styles.photoRow}>
              {detail?.photos.map((p) => (
                <Pressable key={p.id} style={styles.thumb} onPress={() => setPreview(p.file_path)}>
                  <View style={styles.thumbInner}>
                    <Text style={styles.thumbGlyph}>▣</Text>
                    <Text style={styles.thumbCaption}>{p.source === 'kamera' ? 'Kamera' : 'Berkas'}</Text>
                  </View>
                  <Pressable
                    style={styles.thumbDelete}
                    onPress={() => mutate(() => api.deletePhoto(order.id, p.id), 'dihapus')}
                  >
                    <Text style={styles.thumbDeleteText}>×</Text>
                  </Pressable>
                </Pressable>
              ))}
              {!detail || detail.photo_count < 3 ? (
                <Pressable
                  style={styles.photoAdd}
                  onPress={() => mutate(() => api.uploadPhoto(order.id), 'foto diunggah')}
                  disabled={busy}
                >
                  <Text style={styles.photoAddPlus}>+</Text>
                  <Text style={styles.photoAddLabel}>Ambil dari Kamera / Pilih dari Berkas</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.hint}>Foto dikompresi otomatis sebelum diunggah. Maksimal 3 foto, 20 MB per berkas.</Text>
          </>
        )}

        {isAdmin && (
          <View style={styles.problemBox}>
            <Pressable onPress={() => setProblem((p) => !p)} style={styles.problemToggle}>
              <Text style={styles.problemCheckbox}>{problem ? '☑' : '☐'}</Text>
              <Text style={styles.problemLabel}>Tandai order ini bermasalah</Text>
            </Pressable>
            {problem && (
              <>
                <TextInput style={styles.textarea} placeholder="Alasan kendala..." value={reason} onChangeText={setReason} />
                <Button label="Simpan tanda bermasalah" variant="secondary" fullWidth onPress={saveProblem} />
              </>
            )}
          </View>
        )}

        {!isAdmin && detail && detail.photos.length > 0 && order.status === 'selesai' && (
          <>
            <Text style={styles.section}>Foto bukti (pratinjau)</Text>
            <View style={styles.photoRow}>
              {detail.photos.map((p) => (
                <Pressable key={p.id} style={styles.thumb} onPress={() => setPreview(p.file_path)}>
                  <View style={styles.thumbInner}>
                    <Text style={styles.thumbGlyph}>▣</Text>
                    <Text style={styles.thumbCaption}>{p.source === 'kamera' ? 'Kamera' : 'Berkas'}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Text style={styles.section}>Riwayat status</Text>
        {detail?.events.map((e) => (
          <View key={e.id} style={styles.eventRow}>
            <View style={[styles.eventDot, e.event_type === 'completed' && { backgroundColor: colors.green }, e.event_type === 'problem' && { backgroundColor: colors.red }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>
                {eventLabel(e.event_type)} <Text style={styles.eventActor}>· {e.actor_name}</Text>
              </Text>
              {!!e.note && <Text style={styles.eventNote}>{e.note}</Text>}
            </View>
            <Text style={styles.eventTime}>{new Date(e.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</Text>
          </View>
        ))}

        {isAdmin && (
          <View style={styles.actions}>
            {order.status === 'selesai' ? (
              <Button label="Buka kembali order" variant="secondary" onPress={reopen} />
            ) : (
              <>
                {order.status === 'data_masuk' && (
                  <Button label="Proses pick up" variant="soft" onPress={() => mutate(() => api.updateStatus(order.id, 'proses_pick_up'), 'diproses')} />
                )}
                <Button label="Tutup" variant="secondary" onPress={onClose} />
                <Button
                  label={canComplete ? 'Selesaikan order' : `Unggah minimal 1 foto untuk selesai`}
                  onPress={finish}
                  disabled={!canComplete || busy}
                  style={{ flex: 1 }}
                />
              </>
            )}
          </View>
        )}

        {!isAdmin && canEdit && (
          <View style={styles.actions}>
            <Button label="Hapus order" variant="danger" onPress={() => Alert.alert('Hapus', 'Hapus order ini?', [
              { text: 'Batal', style: 'cancel' },
              { text: 'Hapus', style: 'destructive', onPress: async () => { try { await api.deleteOwnOrder(order.id); onChanged?.(); onClose(); } catch (e) { Alert.alert('Gagal', (e as Error).message); } } },
            ])} />
          </View>
        )}

        {!isAdmin && order.status === 'selesai' && detail && detail.photos.length > 0 && (
          <Text style={styles.hint}>Anda hanya dapat melihat pratinjau foto bukti pada order selesai.</Text>
        )}

        <Sheet open={!!preview} onClose={() => setPreview(null)} title="Pratinjau foto">
          <View style={styles.previewBox}>
            <Text style={styles.previewPlaceholder}>▣</Text>
            <Text style={styles.previewCaption}>{preview}</Text>
          </View>
        </Sheet>
      </ScrollView>
    </Sheet>
  );
}

function DetailItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.item}>
      <Text style={styles.itemLabel}>{label}</Text>
      <Text style={[styles.itemValue, mono && { fontFamily: undefined as never, fontWeight: '700', color: '#2E6EB5' }]}>{value}</Text>
    </View>
  );
}

function eventLabel(type: string) {
  switch (type) {
    case 'created': return 'Data masuk';
    case 'picked_up': return 'Scan nomor pesanan';
    case 'completed': return 'Selesai';
    case 'problem': return 'Ditandai bermasalah';
    case 'reopened': return 'Dibuka kembali';
    default: return type;
  }
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  problemTag: { fontSize: 9, fontWeight: '800', color: '#C1433A', backgroundColor: '#FCE9E6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
  metaRight: { marginLeft: 'auto', fontSize: 9, color: colors.faint },
  product: { fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 10, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 0, borderWidth: 1, borderColor: colors.line, borderRadius: 10, marginTop: 10, overflow: 'hidden' },
  item: { width: '50%', padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surfaceAlt },
  itemLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, color: colors.muted, textTransform: 'uppercase' },
  itemValue: { fontSize: 12, color: colors.text, marginTop: 4 },
  section: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: colors.muted, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  textarea: { borderWidth: 1, borderColor: colors.line, borderRadius: 9, minHeight: 68, padding: 11, fontSize: 12, color: colors.text, textAlignVertical: 'top', backgroundColor: '#fff' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  thumb: { width: 88, height: 88, borderRadius: 10, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', position: 'relative', backgroundColor: '#F4F8FD' },
  thumbInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  thumbGlyph: { fontSize: 26, color: colors.primaryMuted },
  thumbCaption: { fontSize: 8, color: colors.muted },
  thumbDelete: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 6, backgroundColor: 'rgba(255,255,255,.9)', alignItems: 'center', justifyContent: 'center' },
  thumbDeleteText: { color: '#42536B', fontSize: 14, lineHeight: 16 },
  photoAdd: { width: 88, height: 88, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9C8DA', backgroundColor: '#F4F8FD', alignItems: 'center', justifyContent: 'center', padding: 6, gap: 3 },
  photoAddPlus: { fontSize: 22, color: colors.primaryMuted, lineHeight: 24 },
  photoAddLabel: { fontSize: 8, color: colors.muted, textAlign: 'center' },
  hint: { fontSize: 9, color: colors.faint, marginTop: 8 },
  problemBox: { marginTop: 14, backgroundColor: '#FFF9F2', borderRadius: 9, padding: 12, gap: 10, borderWidth: 1, borderColor: '#F3E2CF' },
  problemToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  problemCheckbox: { fontSize: 16, color: colors.red },
  problemLabel: { fontSize: 12, color: colors.muted },
  eventRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.surfaceAlt },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue, marginTop: 4 },
  eventTitle: { fontSize: 12, color: colors.text, fontWeight: '700' },
  eventActor: { color: colors.muted, fontWeight: '400' },
  eventNote: { fontSize: 10, color: '#7E8B98', marginTop: 2 },
  eventTime: { fontSize: 9, color: colors.faint },
  actions: { flexDirection: 'row', gap: 9, marginTop: 18 },
  actionsChild: { flex: 1 },
  previewBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, backgroundColor: '#F4F6F7', borderRadius: 10, gap: 8 },
  previewPlaceholder: { fontSize: 60, color: colors.primaryMuted },
  previewCaption: { fontSize: 11, color: colors.muted },
});
