import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { api, type OrderDetail, type OrderView } from '../lib/api';
import { notify, confirmAsk } from '../lib/notify';
import { pickPhoto } from '../lib/photo';
import { dateTime } from '../lib/format';
import { useFileUrl } from '../hooks/useFileUrl';
import { colors, pickupMethodLabel } from '../theme';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
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

  // Modal ini tidak pernah di-unmount (selalu dirender dengan prop order), jadi
  // state HARUS dibersihkan saat order berganti — kalau tidak, detail order
  // sebelumnya (foto, catatan, riwayat) sempat tampil di order berikutnya.
  // Kunci pada order?.id: objek order berganti identitas tiap refresh realtime.
  const orderId = order?.id ?? null;
  // Selalu menunjuk order yang sedang dibuka — dipakai menolak respons basi.
  const orderIdRef = useRef<string | null>(orderId);
  useEffect(() => { orderIdRef.current = orderId; }, [orderId]);

  useEffect(() => {
    // Buang detail lama lebih dulu; jangan pernah menampilkan data order lain.
    setDetail(null);
    setPreview(null);
    setNote('');
    setProblem(false);
    setReason('');
    if (!orderId) return;
    let cancelled = false;
    api.detail(orderId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => { if (!cancelled) notify('Gagal memuat detail', (e as Error).message); });
    // Respons yang datang terlambat diabaikan — cegah detail order lama
    // menimpa order yang sedang dibuka (race saat berpindah cepat).
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    if (!detail) return;
    setProblem(detail.is_problem ?? false);
    setReason(detail.problem_reason ?? '');
    setNote(detail.note ?? '');
  }, [detail]);

  const mutate = useCallback(async (fn: () => Promise<unknown>) => {
    if (!orderId) return;
    setBusy(true);
    try {
      await fn();
      const fresh = await api.detail(orderId);
      // Order mungkin sudah berganti saat mutasi berjalan — jangan menimpa.
      setDetail((prev) => (orderId === orderIdRef.current ? fresh : prev));
      onChanged?.();
    } catch (e) {
      notify('Gagal', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [orderId, onChanged]);

  const settings = useSettings();

  if (!order) return null;
  // Status tampilan diambil dari detail terbaru (di-refresh setelah setiap mutasi)
  // agar modal otomatis berubah ke step selanjutnya tanpa tutup-buka.
  const status = detail?.status ?? order.status;
  const canComplete = !!detail && detail.photo_count >= settings.min_photos && isAdmin;

  // Aturan bukti ganda: order baru wajib barcode pick up + foto bukti order.
  const dualRequired = !!order.requires_dual_evidence && status === 'data_masuk';
  const hasBarcode = !!order.barcode_path;
  const hasOrderProof = !!detail?.photos.some((p) => p.source === 'order');
  const dualReady = hasBarcode && hasOrderProof;

  const attachOrderProof = async () => {
    const photo = await pickPhoto('Foto bukti order');
    if (!photo) return;
    mutate(() => api.uploadPhoto(order.id, photo, 'order'));
  };
  const attachBarcode = async () => {
    const photo = await pickPhoto('Foto barcode pick up');
    if (!photo) return;
    mutate(() => api.attachBarcode(order.id, photo));
  };

  const finish = () => mutate(() => api.completeOrder(order.id, note.trim()));
  const saveProblem = () => mutate(() => api.markProblem(order.id, reason.trim()));
  const reopen = () => mutate(() => api.reopen(order.id));

  return (
    <Sheet open={!!order} onClose={onClose} title={order.order_number} wide>
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
        <View style={styles.topRow}>
          <StatusTag status={status} />
          {detail?.is_problem && <Text style={styles.problemTag}>Bermasalah</Text>}
          <Text style={styles.metaRight}>Input {dateTime(order.created_at)}</Text>
        </View>

        <Text style={styles.product}>{order.product_name}</Text>
        <View style={styles.grid}>
          <DetailItem label="Toko" value={order.store_name} />
          <DetailItem label="Penerima" value={order.recipient_name} />
          <DetailItem label="Trader (checkout)" value={order.trader_name} />
          <DetailItem label="Metode" value={pickupMethodLabel[order.pickup_method]} />
          <DetailItem label="Produk" value={`${order.product_name} · ${order.store_name}`} />
        </View>

        {typeof order.barcode_path === 'string' && order.barcode_path.length > 0 && (
          <>
            <Text style={styles.section}>Barcode pengambilan</Text>
            <View style={styles.photoRow}>
              <PhotoThumb filePath={order.barcode_path} caption="Barcode" onPress={() => setPreview(order.barcode_path!)} />
            </View>
          </>
        )}

        {isAdmin && (
          <>
            <Text style={styles.section}>Catatan penyelesaian</Text>
            {detail ? (
              <TextInput style={styles.textarea} multiline placeholder="Tulis catatan kondisi barang atau kendala..." value={note} onChangeText={setNote} />
            ) : (
              <View style={styles.skeletonBox} />
            )}
          </>
        )}

        {(isAdmin || isOwner) && detail && (
          <>
            <Text style={styles.section}>
              Foto bukti (minimal 1) · {detail.photo_count} terunggah{status === 'selesai' ? ' — order terkunci' : ''}
            </Text>
            <View style={styles.photoRow}>
              {detail.photos.map((p) => (
                <PhotoThumb
                  key={p.id}
                  filePath={p.file_path}
                  caption={p.source === 'pickup' ? 'Barcode' : p.source === 'kamera' ? 'Kamera' : 'Berkas'}
                  onPress={() => setPreview(p.file_path)}
                  onDelete={status !== 'selesai' ? () => mutate(() => api.deletePhoto(order.id, p.id)) : undefined}
                />
              ))}
              {status !== 'selesai' && detail.photo_count < settings.max_photos ? (
                <Pressable
                  style={styles.photoAdd}
                  onPress={async () => {
                    const photo = await pickPhoto('Ambil foto bukti');
                    if (!photo) return;
                    mutate(() => api.uploadPhoto(order.id, photo));
                  }}
                  disabled={busy}
                >
                  <Text style={styles.photoAddPlus}>+</Text>
                  <Text style={styles.photoAddLabel}>Ambil dari Kamera / Pilih dari Berkas</Text>
                </Pressable>
              ) : null}
            </View>
            {status !== 'selesai' && <Text style={styles.hint}>Foto dikompresi otomatis sebelum diunggah. Maksimal {settings.max_photos} foto, {settings.max_file_mb} MB per berkas.</Text>}
          </>
        )}

        {isAdmin && detail && (
          <View style={styles.problemBox}>
            <Pressable onPress={() => setProblem((p) => !p)} style={styles.problemToggle} disabled={busy}>
              <Text style={styles.problemCheckbox}>{problem ? '☑' : '☐'}</Text>
              <Text style={styles.problemLabel}>Tandai order ini bermasalah</Text>
            </Pressable>
            {problem && (
              <>
                <TextInput style={styles.textarea} placeholder="Alasan kendala..." value={reason} onChangeText={setReason} />
                <Button label="Simpan tanda bermasalah" variant="secondary" fullWidth disabled={busy} onPress={saveProblem} />
              </>
            )}
          </View>
        )}

        <Text style={styles.section}>Riwayat status</Text>
        {!detail && <Text style={styles.loadingText}>Memuat detail order…</Text>}
        {detail?.events.map((e) => (
          <View key={e.id} style={styles.eventRow}>
            <View style={[styles.eventDot, e.event_type === 'completed' && { backgroundColor: colors.green }, e.event_type === 'problem' && { backgroundColor: colors.red }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>
                {eventLabel(e.event_type)} <Text style={styles.eventActor}>· {e.actor_name}</Text>
              </Text>
              {!!e.note && <Text style={styles.eventNote}>{e.note}</Text>}
            </View>
            <Text style={styles.eventTime}>{dateTime(e.created_at)}</Text>
          </View>
        ))}

        {dualRequired && detail && (isAdmin || isOwner) && (
          <>
            <Text style={styles.section}>Kelengkapan pick up</Text>
            <View style={styles.checklist}>
              <ChecklistRow
                label="Foto bukti order"
                done={hasOrderProof}
                busy={busy}
                onAttach={attachOrderProof}
              />
              <View style={styles.checklistDivider} />
              <ChecklistRow
                label="Barcode pick up"
                done={hasBarcode}
                busy={busy}
                onAttach={attachBarcode}
              />
            </View>
            {!dualReady && (
              <View style={styles.dualNote}>
                <Text style={styles.dualNoteText}>
                  Pesanan tanpa barcode pick up dan foto bukti order tidak akan diproses. Lengkapi keduanya
                  agar order bisa masuk proses pick up.
                </Text>
              </View>
            )}
          </>
        )}

        {(isAdmin || (isOwner && status === 'data_masuk')) && (
          <View style={styles.actions}>
            {status === 'selesai' && isAdmin ? (
              <Button label="Buka kembali order" variant="secondary" onPress={reopen} />
            ) : status === 'data_masuk' ? (
              <>
                <Button
                  label={!detail ? 'Memuat…' : dualRequired && !dualReady ? 'Lengkapi bukti untuk pick up' : 'Proses pick up'}
                  variant="soft"
                  style={{ flex: 1 }}
                  // Aksi terkunci sampai detail order yang benar tiba — cegah
                  // aksi terkirim ke order yang salah saat berpindah cepat.
                  disabled={busy || !detail || (dualRequired && !dualReady)}
                  onPress={async () => {
                    if (order.barcode_path || (detail?.photo_count ?? 0) > 0) {
                      mutate(() => api.pickup(order.id));
                      return;
                    }
                    const photo = await pickPhoto('Foto barcode pengambilan');
                    if (!photo) return notify('Foto wajib', 'Foto barcode pengambilan wajib dilampirkan sebelum memproses pick up.');
                    mutate(() => api.pickup(order.id, photo));
                  }}
                />
                <Button label="Tutup" variant="secondary" onPress={onClose} />
              </>
            ) : (
              <>
                <Button
                  label={canComplete ? 'Selesaikan order' : `Unggah minimal 1 foto untuk selesai`}
                  onPress={finish}
                  disabled={!canComplete || busy}
                  style={{ flex: 1 }}
                />
                <Button label="Tutup" variant="secondary" onPress={onClose} />
              </>
            )}
          </View>
        )}

        {!isAdmin && canEdit && (
          <View style={styles.actions}>
            <Button label="Hapus order" variant="danger" onPress={() => confirmAsk('Hapus', 'Hapus order ini?', async () => { try { await api.deleteOwnOrder(order.id); onChanged?.(); onClose(); } catch (e) { notify('Gagal', (e as Error).message); } })} />
          </View>
        )}
      </ScrollView>
      {/* Modal pratinjau di luar ScrollView — Modal tak boleh berada dalam elemen scroll. */}
      <Sheet open={!!preview} onClose={() => setPreview(null)} title="Pratinjau foto">
        <PhotoPreview filePath={preview} />
      </Sheet>
    </Sheet>
  );
}

/** Satu syarat kelengkapan pick up: status terpenuhi + aksi melampirkan. */
function ChecklistRow({ label, done, busy, onAttach }: {
  label: string;
  done: boolean;
  busy: boolean;
  onAttach: () => void;
}) {
  return (
    <View style={styles.checkRow}>
      <View style={[styles.checkMark, done ? styles.checkMarkDone : styles.checkMarkTodo]}>
        <Text style={[styles.checkGlyph, done ? styles.checkGlyphDone : styles.checkGlyphTodo]}>
          {done ? '✓' : '!'}
        </Text>
      </View>
      <Text style={[styles.checkLabel, done && styles.checkLabelDone]} numberOfLines={1}>{label}</Text>
      {/* Slot aksi berlebar & bertinggi tetap: baris terlampir dan belum
          terlampir punya tinggi sama, tidak ada lompatan saat status berubah. */}
      <View style={styles.checkAction}>
        {done ? (
          <Text style={styles.checkStatus}>Terlampir</Text>
        ) : (
          <Button label="Lampirkan" variant="secondary" size="sm" disabled={busy} onPress={onAttach} />
        )}
      </View>
    </View>
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

function PhotoThumb({ filePath, caption, onPress, onDelete }: { filePath: string; caption: string; onPress?: () => void; onDelete?: () => void }) {
  const uri = useFileUrl(filePath);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return (
    <Pressable style={styles.thumb} onPress={onPress}>
      {uri && !failed ? <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" onError={() => setFailed(true)} /> : (
        <View style={styles.thumbInner}>
          <Text style={styles.thumbGlyph}>▣</Text>
          <Text style={styles.thumbCaption}>{caption}</Text>
        </View>
      )}
      {onDelete && (
        <Pressable style={styles.thumbDelete} onPress={onDelete}>
          <Text style={styles.thumbDeleteText}>×</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

function PhotoPreview({ filePath }: { filePath: string | null }) {
  const uri = useFileUrl(filePath);
  if (!filePath) return null;
  return (
    <View style={styles.previewBox}>
      <ZoomableImage uri={uri} />
      <Text style={styles.previewCaption}>{filePath.split('/').pop()}</Text>
      <Text style={styles.previewHint}>Cubit untuk zoom · seret untuk geser · ketuk dua kali untuk kembali</Text>
    </View>
  );
}

// Foto bisa dicubit (pinch) untuk zoom 1×–3×, digeser saat membesar, dan
// ketuk dua kali untuk kembali ke ukuran semula (RNGH + Reanimated 4).
function ZoomableImage({ uri }: { uri: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const areaW = useSharedValue(1);
  const areaH = useSharedValue(1);
  const MAX = 3;

  // Reset zoom saat foto berganti (Sheet pratinjau dipakai ulang).
  useEffect(() => {
    scale.value = 1; savedScale.value = 1;
    tx.value = 0; ty.value = 0; savedTx.value = 0; savedTy.value = 0;
  }, [uri, scale, savedScale, tx, ty, savedTx, savedTy]);

  const clamp = (v: number, lo: number, hi: number) => {
    'worklet';
    return Math.min(hi, Math.max(lo, v));
  };

  // Jaga agar foto membesar tidak digeser keluar dari area tampil.
  const clampPan = () => {
    'worklet';
    if (scale.value <= 1.01) { tx.value = 0; ty.value = 0; return; }
    const mx = Math.max(0, (areaW.value * (scale.value - 1)) / 2);
    const my = Math.max(0, (areaH.value * (scale.value - 1)) / 2);
    tx.value = clamp(tx.value, -mx, mx);
    ty.value = clamp(ty.value, -my, my);
  };

  const pinch = Gesture.Pinch()
    .onStart(() => { savedScale.value = scale.value; })
    .onUpdate((e) => { scale.value = clamp(savedScale.value * e.scale, 1, MAX); })
    .onEnd(() => { savedScale.value = scale.value; clampPan(); });

  const pan = Gesture.Pan()
    .onStart(() => { savedTx.value = tx.value; savedTy.value = ty.value; })
    .onUpdate((e) => {
      if (scale.value <= 1.01) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => clampPan());

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.01) {
        scale.value = 1; savedScale.value = 1; tx.value = 0; ty.value = 0;
      } else {
        scale.value = 2.5; savedScale.value = 2.5;
      }
      clampPan();
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View
      style={styles.previewStage}
      onLayout={(e) => {
        areaW.value = e.nativeEvent.layout.width || 1;
        areaH.value = e.nativeEvent.layout.height || 1;
      }}
    >
      <GestureDetector gesture={gesture}>
        <Animated.View style={[{ width: '100%', height: '100%' }, contentStyle]}>
          {uri && !failed ? (
            <Image source={{ uri }} style={styles.previewImg} resizeMode="contain" onError={() => setFailed(true)} />
          ) : (
            <View style={styles.previewEmpty}>
              <Text style={styles.previewPlaceholder}>▣</Text>
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
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
  thumbImg: { width: 86, height: 86 },
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
  // Placeholder saat detail order belum tiba (mencegah data order lain terlihat).
  skeletonBox: { minHeight: 68, borderRadius: 9, backgroundColor: colors.surfaceAlt, marginTop: 2 },
  loadingText: { fontSize: 11, color: colors.faint, paddingVertical: 10 },
  // Kelengkapan pick up
  checklist: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, overflow: 'hidden' },
  checklistDivider: { height: 1, backgroundColor: colors.surfaceAlt },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: 52 },
  checkAction: { width: 92, alignItems: 'flex-end', justifyContent: 'center' },
  checkMark: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  checkMarkDone: { backgroundColor: '#E3F5EC' },
  checkMarkTodo: { backgroundColor: '#FCF1DE' },
  checkGlyph: { fontSize: 12, fontWeight: '800' },
  checkGlyphDone: { color: '#1F7A4D' },
  checkGlyphTodo: { color: '#A8610F' },
  checkLabel: { flex: 1, fontSize: 12, color: colors.muted, fontWeight: '600' },
  checkLabelDone: { color: colors.text },
  checkStatus: { fontSize: 10, fontWeight: '800', color: '#1F7A4D' },
  dualNote: {
    marginTop: 10, backgroundColor: '#FCF3E3', borderRadius: 8,
    borderLeftWidth: 3, borderLeftColor: '#A8610F', paddingVertical: 9, paddingHorizontal: 11,
  },
  dualNoteText: { fontSize: 10, color: '#8A5310', lineHeight: 15 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 18 },
  actionsChild: { flex: 1 },
  previewBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 8 },
  previewStage: { width: '100%', height: 340, overflow: 'hidden', borderRadius: 10, backgroundColor: '#1B2432', alignItems: 'center', justifyContent: 'center' },
  previewEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewImg: { width: '100%', height: '100%' },
  previewPlaceholder: { fontSize: 60, color: '#5A6B82' },
  previewCaption: { fontSize: 11, color: colors.muted },
  previewHint: { fontSize: 9, color: colors.faint },
});
