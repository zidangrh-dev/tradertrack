import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, type Reports } from '../../src/lib/api';
import { notify } from '../../src/lib/notify';
import { useAuth } from '../../src/hooks/useAuth';
import { colors, pendingPalette, problemPalette, radius, space, type Status } from '../../src/theme';
import { money } from '../../src/lib/format';
import { Button, EmptyState, PageHeader, Sheet } from '../../src/components/ui';
import { Calendar, fmtDate, keyOf, parseKey } from '../../src/components/DateRangePicker';
import { isAdminLevel } from '../../src/lib/roles';

const STATUS_META: { key: Status; label: string; color: string }[] = [
  { key: 'data_masuk', label: 'Data masuk', color: colors.amber },
  { key: 'proses_pick_up', label: 'Proses pick up', color: colors.blue },
  { key: 'done_pickup', label: 'Done pickup', color: colors.teal },
  { key: 'selesai', label: 'Selesai', color: colors.green },
];

// Pill rentang tanggal — di header kanan (lebar) atau baris aksi sendiri (HP).
function RangePill({ fromKey, toKey, onPress, flex }: { fromKey: string; toKey: string; onPress: () => void; flex?: boolean }) {
  return (
    <Pressable
      accessibilityLabel="Pilih rentang tanggal"
      onPress={onPress}
      style={({ pressed }) => [styles.rangePill, flex && styles.rangePillFlex, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.rangePillGlyphBox}>
        <Ionicons name="calendar-outline" size={13} color={colors.primary} />
      </View>
      <View style={styles.rangePillText}>
        <Text style={styles.rangePillLabel}>Rentang tanggal</Text>
        <Text style={styles.rangePillValue} numberOfLines={1}>{fmtDate(parseKey(fromKey))} s/d {fmtDate(parseKey(toKey))}</Text>
      </View>
      <Ionicons name="chevron-down" size={12} color={colors.faint} />
    </Pressable>
  );
}

/* ---------- Ringkasan status ---------- */

// Satu angka per status. Ukurannya seragam DI ANTARA sesamanya karena keempatnya
// memang setara; yang membedakan mereka dari total ada di StatusSummary.
function StatusFigure({ label, value, pct, color, wide }: { label: string; value: number; pct: number; color: string; wide?: boolean }) {
  return (
    <View style={[styles.figure, !wide && styles.figureMobile]}>
      <View style={[styles.figureRule, { backgroundColor: color }]} />
      <View style={styles.figureRow}>
        <Text style={styles.figureValue}>{value}</Text>
        <Text style={styles.figurePct}>{pct}%</Text>
      </View>
      <Text style={styles.figureLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* ---------- Bar ---------- */

// Lebar batang langsung dari data, tanpa animasi: refresh realtime terjadi tiap
// kali ada mutasi order, dan batang yang tumbuh ulang setiap kali membuat
// seluruh panel bergoyang tanpa menjelaskan apa pun.
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { backgroundColor: color, width: `${pct}%` }]} />
    </View>
  );
}

/* ---------- Panel ---------- */

// `count` dan `alert` memberi panel bobot yang berbeda-beda: RHYTHM 2 menuntut
// bagian tidak semuanya berkomposisi sama. Panel yang menuntut tindakan menaikkan
// nada hanya saat benar-benar ada isinya.
function Panel({ title, subtitle, count, alert, children, wide }: {
  title: string;
  subtitle?: string;
  count?: number;
  alert?: boolean;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <View style={[styles.panel, !wide && styles.panelMobile, alert && styles.panelAlert]}>
      <View style={styles.panelHead}>
        <Text style={[styles.panelTitle, alert && { color: problemPalette.fg }]}>{title}</Text>
        {count !== undefined && count > 0 && (
          <Text style={[styles.panelCount, alert && styles.panelCountAlert]}>{count}</Text>
        )}
      </View>
      {!!subtitle && <Text style={styles.panelSub} numberOfLines={wide ? undefined : 2}>{subtitle}</Text>}
      {children}
    </View>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  // Satu-satunya filter: rentang tanggal lewat kalender. Bawaan = bulan berjalan.
  const [fromKey, setFromKey] = useState(() => keyOf(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [toKey, setToKey] = useState(() => keyOf(new Date()));
  const [showCal, setShowCal] = useState(false);
  const [data, setData] = useState<Reports | null>(null);
  const [error, setError] = useState(false);
  const [load, setLoad] = useState(0);

  useEffect(() => {
    setData(null);
    setError(false);
    const from = parseKey(fromKey).toISOString();
    const to = parseKey(toKey);
    to.setDate(to.getDate() + 1); // inklusif sampai akhir hari
    api.reports('', from, to.toISOString()).then(setData).catch(() => setError(true));
  }, [fromKey, toKey, load]);

  // Header halaman: lebar = aksi di kanan; HP = judul sendiri + baris aksi di bawah.
  const pageTitle = (
    <PageHeader
      title="Analytics"
      subtitle={wide ? 'Baca performa order dan rekap pembayaran dalam satu tampilan.' : undefined}
    />
  );

  const renderCal = () => (
    <Sheet open={showCal} onClose={() => setShowCal(false)} title="Pilih rentang tanggal">
      {showCal && (
        <Calendar
          initialFrom={fromKey}
          initialTo={toKey}
          onApply={(f, t) => { setFromKey(f); setToKey(t); setShowCal(false); }}
          onCancel={() => setShowCal(false)}
        />
      )}
    </Sheet>
  );

  if (error) return (
    <View style={styles.wrap}>
      {pageTitle}
      {!wide && <View style={styles.mobileActions}><RangePill flex fromKey={fromKey} toKey={toKey} onPress={() => setShowCal(true)} /></View>}
      {renderCal()}
      <View style={styles.errorBox}>
        <Text style={styles.errorTitle}>Gagal memuat laporan</Text>
        <Text style={styles.errorText}>Terjadi kendala saat mengambil data. Periksa koneksi ke server, lalu coba muat ulang.</Text>
        <Button label="Muat ulang" variant="secondary" size="sm" onPress={() => setLoad((n) => n + 1)} />
      </View>
    </View>
  );
  if (!data) return (
    <View style={styles.wrap}>
      {pageTitle}
      {!wide && <View style={styles.mobileActions}><RangePill flex fromKey={fromKey} toKey={toKey} onPress={() => setShowCal(true)} /></View>}
      {renderCal()}
      <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
    </View>
  );

  const t = data.totals;
  const statusTotal = t.data_masuk + t.proses_pick_up + t.done_pickup + t.selesai;
  const pct = (n: number) => (statusTotal ? Math.round((n / statusTotal) * 100) : 0);
  const maxTrader = Math.max(1, ...data.perTrader.map((r) => r.total));
  const maxAmount = Math.max(1, ...data.perProduk.map((r) => r.amount));

  const exportCsv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: string[] = [];
    rows.push('Laporan order per trader');
    rows.push(['Trader', 'Total order', 'Selesai', 'Belum selesai'].join(','));
    data.perTrader.forEach((r) => rows.push([r.trader, r.total, r.selesai, r.belum_selesai].map(esc).join(',')));
    rows.push('');
    rows.push('Rekap performa produk');
    rows.push(['Produk', 'Order terpakai', 'Sisa kuota', 'Total nominal'].join(','));
    data.perProduk.forEach((r) => rows.push([r.product_name, r.used_quota, r.remaining_quota, r.amount].map(esc).join(',')));
    rows.push('');
    rows.push('Order tertunda atau bermasalah');
    rows.push(['Nomor order', 'Produk', 'Trader', 'Durasi', 'Status'].join(','));
    data.delayed.forEach((d) => rows.push([d.order_number, d.product_name, d.trader, d.duration, d.is_problem ? 'Bermasalah' : 'Tertunda'].map(esc).join(',')));
    downloadCsv(rows.join('\n'), `zproject-laporan-${fromKey}-${toKey}.csv`);
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.wrapContent}>
      {wide ? (
        <PageHeader
          title="Analytics"
          subtitle="Baca performa order dan rekap pembayaran dalam satu tampilan."
          action={
            <View style={styles.headerActions}>
              <RangePill fromKey={fromKey} toKey={toKey} onPress={() => setShowCal(true)} />
              <ExportBtn onPress={exportCsv} />
            </View>
          }
        />
      ) : (
        <>
          <PageHeader title="Analytics" />
          <View style={styles.mobileActions}>
            <RangePill flex fromKey={fromKey} toKey={toKey} onPress={() => setShowCal(true)} />
            <ExportBtn onPress={exportCsv} />
          </View>
        </>
      )}

      {renderCal()}

      {/* Satu focal point halaman: total order, dengan sebarannya sebagai anak
          kalimat. Enam kartu sebobot dulu menyembunyikan fakta bahwa total
          adalah JUMLAH dari empat status di bawahnya. */}
      <View style={[styles.summary, !wide && styles.summaryMobile]}>
        <View style={styles.summaryHead}>
          <View style={styles.summaryTotal}>
            <Text style={styles.summaryCaption}>Total order</Text>
            <Text style={[styles.summaryValue, !wide && styles.summaryValueMobile]}>{t.total}</Text>
            <Text style={styles.summaryRange} numberOfLines={1}>
              {fmtDate(parseKey(fromKey))} s/d {fmtDate(parseKey(toKey))}
            </Text>
          </View>
          {/* Bermasalah hanya muncul saat ada. Kartu permanen bernilai 0 melatih
              mata untuk mengabaikannya, justru saat isinya paling perlu dilihat. */}
          {t.bermasalah > 0 && (
            <View style={styles.summaryProblem}>
              <Text style={styles.summaryProblemValue}>{t.bermasalah}</Text>
              <Text style={styles.summaryProblemLabel}>Bermasalah</Text>
            </View>
          )}
        </View>

        {statusTotal > 0 ? (
          <View style={styles.distBar}>
            {STATUS_META.map((s) => {
              const val = t[s.key];
              return val > 0 ? <View key={s.key} style={[styles.distSegment, { backgroundColor: s.color, flex: val }]} /> : null;
            })}
          </View>
        ) : (
          <View style={styles.distBarEmpty} />
        )}

        <View style={[styles.figures, !wide && styles.figuresMobile]}>
          {STATUS_META.map((s) => (
            <StatusFigure key={s.key} label={s.label} value={t[s.key]} pct={pct(t[s.key])} color={s.color} wide={wide} />
          ))}
        </View>
      </View>

      {/* Perbandingan antar-trader khusus admin; trader hanya melihat datanya sendiri. */}
      {isAdmin && (
        <Panel wide={wide} title="Jumlah order per trader" count={data.perTrader.length} subtitle="Diurutkan menurun">
          {data.perTrader.length === 0 ? (
            <EmptyState icon="people-outline" text="Belum ada order dari trader mana pun pada rentang ini." />
          ) : (
            data.perTrader.map((r) => (
              <View key={r.trader} style={[styles.traderRow, !wide && styles.traderRowMobile]}>
                <Text style={[styles.traderName, !wide && styles.traderNameMobile]} numberOfLines={1}>{r.trader}</Text>
                <View style={styles.traderBarWrap}>
                  <Bar pct={Math.round((r.total / maxTrader) * 100)} color={colors.primary} />
                  <View style={styles.traderCounts}>
                    <Text style={styles.countSelesai}>{r.selesai} selesai</Text>
                    <Text style={styles.countBelum}>{r.belum_selesai} belum</Text>
                  </View>
                </View>
                <Text style={styles.traderTotal}>{r.total}</Text>
              </View>
            ))
          )}
        </Panel>
      )}

      <Panel wide={wide} title="Rekap performa produk" count={data.perProduk.length} subtitle="Kuota menempel di produk, berlaku lintas toko">
        {data.perProduk.length === 0 ? (
          <EmptyState icon="cube-outline" text="Belum ada data produk pada rentang ini." />
        ) : (
          data.perProduk.map((r) => (
            <View key={r.product_name} style={styles.rekapRow}>
              <View style={styles.rekapMain}>
                <Text style={styles.rekapName} numberOfLines={1}>{r.product_name}</Text>
                <Text style={styles.rekapSub}>{r.used_quota} order · Sisa kuota {r.remaining_quota}/{r.quota}</Text>
              </View>
              <View style={styles.rekapRight}>
                <Text style={styles.rekapAmount}>{money(r.amount)}</Text>
                <View style={styles.rekapBarTrack}>
                  <Bar pct={Math.round((r.amount / maxAmount) * 100)} color={colors.green} />
                </View>
              </View>
            </View>
          ))
        )}
      </Panel>

      <Panel
        wide={wide}
        title="Order tertunda atau bermasalah"
        count={data.delayed.length}
        alert={data.delayed.length > 0}
        subtitle="Diurutkan dari yang paling lama"
      >
        {data.delayed.length === 0 ? (
          <EmptyState icon="checkmark-circle-outline" text="Tidak ada order tertunda atau bermasalah pada rentang ini." />
        ) : (
          data.delayed.map((d, i) =>
            wide ? (
              <View key={i} style={styles.delayedRow}>
                <Text style={styles.delayedOrder} numberOfLines={1}>{d.order_number}</Text>
                <Text style={styles.delayedProduct} numberOfLines={1}>{d.product_name}</Text>
                <Text style={styles.delayedTrader} numberOfLines={1}>{d.trader}</Text>
                <Text style={styles.delayedDuration}>{d.duration}</Text>
                <Text style={[styles.delayedStatus, d.is_problem ? styles.problemText : styles.pendingText]}>
                  {d.is_problem ? 'Bermasalah' : 'Tertunda'}
                </Text>
              </View>
            ) : (
              <View key={i} style={styles.delayedCard}>
                <View style={styles.delayedCardTop}>
                  <Text style={styles.delayedCardOrder} numberOfLines={1}>{d.order_number}</Text>
                  <Text style={styles.delayedCardDuration}>{d.duration}</Text>
                  <Text style={[styles.delayedStatus, d.is_problem ? styles.problemText : styles.pendingText]}>
                    {d.is_problem ? 'Bermasalah' : 'Tertunda'}
                  </Text>
                </View>
                <Text style={styles.delayedCardMeta} numberOfLines={1}>
                  {d.product_name} · {d.trader}
                </Text>
              </View>
            ),
          )
        )}
      </Panel>
    </ScrollView>
  );
}

function ExportBtn({ onPress, disabled }: { onPress?: () => void; disabled?: boolean }) {
  return <Button label="Export CSV" icon="download-outline" variant="secondary" onPress={onPress ?? (() => undefined)} disabled={disabled} />;
}

function downloadCsv(content: string, filename: string) {
  if (typeof window !== 'undefined') {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    notify('Export CSV', content);
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  wrapContent: { paddingBottom: 120 },
  errorBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 20, marginHorizontal: 16, marginTop: 24, alignItems: 'center', gap: 8 },
  errorTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  errorText: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginBottom: 6 },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  // HP: aksi pindah ke baris sendiri di bawah judul halaman.
  mobileActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  // Pill rentang tanggal (pemicu modal kalender) — setinggi tombol Export CSV.
  rangePill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 44,
    paddingHorizontal: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.full,
  },
  rangePillFlex: { flex: 1, minWidth: 0 },
  rangePillGlyphBox: { width: 24, height: 24, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rangePillText: { flexShrink: 1, minWidth: 0 },
  // 9px = batas bawah skala caption DESIGN.md. 8px sebelumnya di bawah skala.
  rangePillLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7, color: colors.faint, textTransform: 'uppercase' },
  rangePillValue: { fontSize: 11, fontWeight: '700', color: colors.text },

  // Kalender mini di dalam modal

  // Blok ringkasan: satu-satunya permukaan halaman yang boleh berteriak.
  summary: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
    marginHorizontal: 20, marginBottom: space.lg, padding: 20, gap: 16,
  },
  summaryMobile: { marginHorizontal: 12, padding: 16, gap: 14 },
  summaryHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  summaryTotal: { flex: 1, minWidth: 0 },
  summaryCaption: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: colors.muted, textTransform: 'uppercase' },
  // 44px: satu-satunya angka sebesar ini di seluruh aplikasi. Itu yang membuatnya
  // terbaca sebagai induk, bukan sebagai kartu keenam.
  summaryValue: { fontSize: 44, fontWeight: '800', color: colors.text, letterSpacing: -1.4, marginTop: 2 },
  summaryValueMobile: { fontSize: 34, letterSpacing: -1 },
  summaryRange: { fontSize: 10, color: colors.muted, marginTop: 2 },
  summaryProblem: {
    alignItems: 'flex-end', paddingLeft: 16,
    borderLeftWidth: 1, borderLeftColor: colors.line,
  },
  summaryProblemValue: { fontSize: 22, fontWeight: '800', color: problemPalette.fg, letterSpacing: -0.5 },
  summaryProblemLabel: { fontSize: 10, fontWeight: '700', color: problemPalette.fg, marginTop: 2 },

  // Empat status setara: garis warna tipis di atas angka, tanpa kotak sendiri.
  // Kartu bergaris penuh dulu memberi bobot yang sama dengan blok induk.
  figures: { flexDirection: 'row', gap: 20 },
  figuresMobile: { flexWrap: 'wrap', gap: 14 },
  figure: { flex: 1, minWidth: 68, gap: 4 },
  figureMobile: { flexBasis: '44%', flexGrow: 1 },
  figureRule: { height: 3, borderRadius: radius.full, width: 26 },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  figureValue: { fontSize: 19, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  figurePct: { fontSize: 10, fontWeight: '700', color: colors.muted },
  figureLabel: { fontSize: 10, fontWeight: '600', color: colors.muted },

  panel: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
    padding: 18, marginHorizontal: 20, marginBottom: space.lg,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  // Jumlah baris sebagai pil kecil: menjawab "berapa banyak" tanpa menambah baris teks.
  panelCount: {
    fontSize: 10, fontWeight: '800', color: colors.muted, backgroundColor: colors.canvas,
    borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden',
  },
  panelCountAlert: { color: problemPalette.fg, backgroundColor: problemPalette.bg },
  panelSub: { fontSize: 10, color: colors.muted, marginTop: 3, marginBottom: 12 },
  panelMobile: { marginHorizontal: 12, padding: 14 },
  // Panel yang menuntut tindakan: garis tepi kiri tebal sebagai penanda keadaan,
  // bukan hiasan. Hanya aktif saat daftarnya benar-benar berisi.
  panelAlert: { borderLeftWidth: 3, borderLeftColor: problemPalette.fg },

  distBar: { flexDirection: 'row', height: 8, borderRadius: radius.full, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  distSegment: { height: 8 },
  // Rentang tanpa order: track kosong tetap dirender supaya tinggi blok tidak
  // melompat saat data pertama masuk.
  distBarEmpty: { height: 8, borderRadius: radius.full, backgroundColor: colors.surfaceAlt },

  traderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  traderRowMobile: { gap: 8 },
  traderName: { width: 110, fontSize: 12, fontWeight: '700', color: colors.text },
  traderNameMobile: { flex: 0.6, width: undefined, minWidth: 0 },
  traderBarWrap: { flex: 1, gap: 5 },
  traderCounts: { flexDirection: 'row', gap: 10 },
  countSelesai: { fontSize: 9, color: colors.green, fontWeight: '700' },
  countBelum: { fontSize: 9, color: pendingPalette.fg, fontWeight: '700' },
  traderTotal: { fontSize: 15, fontWeight: '800', color: colors.text, minWidth: 28, textAlign: 'right' },

  barTrack: { height: 8, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: radius.full },

  rekapRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  rekapMain: { flex: 1 },
  rekapName: { fontSize: 12, fontWeight: '700', color: colors.text },
  rekapSub: { fontSize: 10, color: colors.faint, marginTop: 2 },
  rekapRight: { width: '42%', gap: 6, alignItems: 'flex-end' },
  rekapAmount: { fontSize: 13, fontWeight: '800', color: colors.text },
  rekapBarTrack: { width: '100%' },

  delayedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  delayedOrder: { fontSize: 11, fontWeight: '800', color: colors.primaryMuted, width: 120 },
  delayedProduct: { flex: 1, fontSize: 11, color: colors.muted },
  delayedTrader: { width: 90, fontSize: 10, color: colors.faint },
  delayedDuration: { fontSize: 10, fontWeight: '700', color: problemPalette.fg, width: 56, textAlign: 'right' },
  delayedStatus: { fontSize: 9, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
  // Token bersama, bukan hex lokal: badge yang sama pernah tampil beda warna di
  // Analytics (#C1433A) dibanding halaman lain (#B23E35).
  problemText: { color: problemPalette.fg, backgroundColor: problemPalette.bg },
  pendingText: { color: pendingPalette.fg, backgroundColor: pendingPalette.bg },

  // HP: item tertunda jadi kartu dua baris agar tidak sesak satu lajur.
  delayedCard: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt, gap: 4 },
  delayedCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  delayedCardOrder: { flex: 1, fontSize: 11, fontWeight: '800', color: colors.primaryMuted, minWidth: 0 },
  delayedCardDuration: { fontSize: 10, fontWeight: '700', color: problemPalette.fg },
  delayedCardMeta: { fontSize: 10, color: colors.faint },
});
