import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { api, type Reports } from '../../src/lib/api';
import { notify } from '../../src/lib/notify';
import { useAdminOnly } from '../../src/hooks/useRoleGuard';
import { colors, radius, space, type Status } from '../../src/theme';
import { money } from '../../src/lib/format';
import { Button, EmptyState, PageHeader, Sheet } from '../../src/components/ui';

const STATUS_META: { key: Status; label: string; color: string }[] = [
  { key: 'data_masuk', label: 'Data masuk', color: colors.amber },
  { key: 'proses_pick_up', label: 'Proses pick up', color: colors.blue },
  { key: 'selesai', label: 'Selesai', color: colors.green },
];

/* ---------- Hover helper (web) ---------- */

function Hover({ children, style, hoverStyle }: { children: ReactNode; style?: StyleProp<ViewStyle>; hoverStyle?: StyleProp<ViewStyle> }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} style={[style, hovered && hoverStyle]}>
      {children}
    </Pressable>
  );
}

/* ---------- Count-up ---------- */

function useCountUp(target: number, duration = 550) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: target, duration, useNativeDriver: false }).start();
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    return () => anim.removeListener(id);
  }, [target, anim, duration]);
  return display;
}

/* ---------- Kalender: satu-satunya filter rentang tanggal ---------- */

const DAYS = ['M', 'S', 'S', 'R', 'K', 'J', 'S']; // Senin pertama

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Kunci berpadding (2026-09-03) — perbandingan rentang lewat string butuh urutan leksikografis.
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Ambil 6 minggu penuh (Senin–Minggu) yang memuat bulan `view`. */
function monthGrid(view: Date): Date[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // mundur ke Senin
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Pill rentang tanggal — di header kanan (lebar) atau baris aksi sendiri (HP).
function RangePill({ fromKey, toKey, onPress, flex }: { fromKey: string; toKey: string; onPress: () => void; flex?: boolean }) {
  return (
    <Pressable
      accessibilityLabel="Pilih rentang tanggal"
      onPress={onPress}
      style={({ pressed }) => [styles.rangePill, flex && styles.rangePillFlex, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.rangePillGlyphBox}>
        <Text style={styles.rangePillGlyph}>▦</Text>
      </View>
      <View style={styles.rangePillText}>
        <Text style={styles.rangePillLabel}>Rentang tanggal</Text>
        <Text style={styles.rangePillValue} numberOfLines={1}>{fmtDate(parseKey(fromKey))} — {fmtDate(parseKey(toKey))}</Text>
      </View>
      <Text style={styles.rangePillCaret}>▾</Text>
    </Pressable>
  );
}

function Calendar({ initialFrom, initialTo, onApply, onCancel }: {
  initialFrom: string;
  initialTo: string;
  onApply: (fromKey: string, toKey: string) => void;
  onCancel: () => void;
}) {
  // Draf di dalam modal: menutup tanpa "Terapkan" tidak mengubah rentang aktif.
  const [fromKey, setFromKey] = useState<string | null>(initialFrom);
  const [toKey, setToKey] = useState<string | null>(initialTo);
  // Buka di bulan yang memuat rentang aktif.
  const [view, setView] = useState(() => {
    const base = parseKey(initialTo);
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const cells = useMemo(() => monthGrid(view), [view]);

  const go = (delta: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  // Urutan ketuk: mulai → akhir (otomatis tukar bila terbalik) → ketuk lagi memulai rentang baru.
  const pick = (k: string) => {
    if (!fromKey) { setFromKey(k); return; }
    if (!toKey) {
      if (k < fromKey) { setToKey(fromKey); setFromKey(k); } else { setToKey(k); }
      return;
    }
    setFromKey(k);
    setToKey(null);
  };

  const inRange = (k: string) => !!fromKey && !!toKey && k > fromKey && k < toKey;
  const complete = !!fromKey && !!toKey;

  return (
    <View>
      <View style={styles.calHead}>
        <Pressable onPress={() => go(-1)} hitSlop={10} style={styles.calNav}>
          <Text style={styles.calNavText}>‹</Text>
        </Pressable>
        <Text style={styles.calTitle}>{MONTHS[view.getMonth()]} {view.getFullYear()}</Text>
        <Pressable onPress={() => go(1)} hitSlop={10} style={styles.calNav}>
          <Text style={styles.calNavText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.calDow}>
        {DAYS.map((d, i) => <Text key={i} style={styles.calDowText}>{d}</Text>)}
      </View>

      <View style={styles.calGrid}>
        {cells.map((d, i) => {
          const k = keyOf(d);
          const outside = d.getMonth() !== view.getMonth();
          const isFrom = fromKey === k;
          const isTo = toKey === k;
          const style = isFrom || isTo ? styles.calCellEnd : inRange(k) ? styles.calCellRange : undefined;
          const textStyle = isFrom || isTo ? styles.calCellTextEnd : inRange(k) ? styles.calCellTextRange : undefined;
          return (
            <Pressable
              key={i}
              disabled={outside}
              onPress={() => pick(k)}
              style={[styles.calCell, style, outside && { opacity: 0 }]}
            >
              <Text style={[styles.calCellText, textStyle]}>{d.getDate()}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.calHint}>
        {!fromKey ? 'Ketuk tanggal mulai.' : !toKey ? 'Ketuk tanggal akhir.' : `${fmtDate(parseKey(fromKey))} — ${fmtDate(parseKey(toKey))}`}
      </Text>
      <View style={styles.calActions}>
        <Button label="Batal" variant="secondary" onPress={onCancel} />
        <Button label="Terapkan" disabled={!complete} onPress={() => complete && onApply(fromKey!, toKey!)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/* ---------- KPI card ---------- */

function MetricCard({ label, value, color, danger, wide, dangerSpan }: { label: string; value: number; color: string; danger?: boolean; wide?: boolean; dangerSpan?: boolean }) {
  const shown = useCountUp(value);
  return (
    <Hover
      style={[
        styles.metric,
        !wide && styles.metricMobile,
        dangerSpan && styles.metricDangerSpan,
        danger && styles.metricDanger,
      ]}
      hoverStyle={styles.metricHover}
    >
      <View style={[styles.metricDot, { backgroundColor: color }]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, !wide && styles.metricValueMobile, danger && { color: colors.red }]}>{shown}</Text>
    </Hover>
  );
}

/* ---------- Animated bar ---------- */

function Bar({ pct, color }: { pct: number; color: string }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: pct, duration: 600, useNativeDriver: false }).start();
  }, [pct, w]);
  return (
    <View style={styles.barTrack}>
      <Animated.View
        style={[
          styles.barFill,
          { backgroundColor: color, width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
}

/* ---------- Panel ---------- */

function Panel({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <View style={[styles.panel, !wide && styles.panelMobile]}>
      <Text style={styles.panelTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.panelSub} numberOfLines={wide ? undefined : 2}>{subtitle}</Text>}
      {children}
    </View>
  );
}

export default function Analytics() {
  useAdminOnly();
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
  const statusTotal = t.data_masuk + t.proses_pick_up + t.selesai;
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

      <View style={[styles.metrics, !wide && styles.metricsMobile]}>
        <MetricCard label="Total order" value={t.total} color={colors.primary} wide={wide} />
        <MetricCard label="Data masuk" value={t.data_masuk} color={colors.amber} wide={wide} />
        <MetricCard label="Proses pick up" value={t.proses_pick_up} color={colors.blue} wide={wide} />
        <MetricCard label="Selesai" value={t.selesai} color={colors.green} wide={wide} />
        <MetricCard label="Bermasalah" value={t.bermasalah} color={colors.red} danger dangerSpan wide={wide} />
      </View>

      <Panel wide={wide} title="Distribusi status" subtitle="Proporsi seluruh order pada rentang terpilih">
        <View style={styles.distBar}>
          {STATUS_META.map((s) => {
            const val = t[s.key];
            return val > 0 ? <View key={s.key} style={[styles.distSegment, { backgroundColor: s.color, flex: val }]} /> : null;
          })}
        </View>
        <View style={styles.legend}>
          {STATUS_META.map((s) => (
            <Hover key={s.key} style={styles.legendItem} hoverStyle={styles.legendItemHover}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={styles.legendLabel}>{s.label}</Text>
              <Text style={styles.legendValue}>{t[s.key]}</Text>
              <Text style={styles.legendPct}>{pct(t[s.key])}%</Text>
            </Hover>
          ))}
        </View>
      </Panel>

      <Panel wide={wide} title="Jumlah order per trader" subtitle="Diurutkan menurun · batang = proporsi terhadap total order terbanyak">
        {data.perTrader.map((r) => (
          <Hover key={r.trader} style={[styles.traderRow, !wide && styles.traderRowMobile]} hoverStyle={styles.traderRowHover}>
            <Text style={[styles.traderName, !wide && styles.traderNameMobile]} numberOfLines={1}>{r.trader}</Text>
            <View style={styles.traderBarWrap}>
              <Bar pct={Math.round((r.total / maxTrader) * 100)} color={colors.primary} />
              <View style={styles.traderCounts}>
                <Text style={styles.countSelesai}>{r.selesai} selesai</Text>
                <Text style={styles.countBelum}>{r.belum_selesai} belum</Text>
              </View>
            </View>
            <Text style={styles.traderTotal}>{r.total}</Text>
          </Hover>
        ))}
      </Panel>

      <Panel wide={wide} title="Rekap performa produk" subtitle="Rekap order per tipe barang (kuota lintas toko) · batang = proporsi nominal terbesar">
        {data.perProduk.length === 0 ? (
          <EmptyState icon="▤" text="Belum ada data produk pada rentang ini." />
        ) : (
          data.perProduk.map((r) => (
            <Hover key={r.product_name} style={styles.rekapRow} hoverStyle={styles.traderRowHover}>
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
            </Hover>
          ))
        )}
      </Panel>

      <Panel wide={wide} title="Order tertunda atau bermasalah" subtitle="Diurutkan dari yang paling lama">
        {data.delayed.length === 0 ? (
          <EmptyState icon="✓" text="Tidak ada order tertunda atau bermasalah pada rentang ini." />
        ) : (
          data.delayed.map((d, i) =>
            wide ? (
              <Hover key={i} style={styles.delayedRow} hoverStyle={styles.traderRowHover}>
                <Text style={styles.delayedOrder} numberOfLines={1}>{d.order_number}</Text>
                <Text style={styles.delayedProduct} numberOfLines={1}>{d.product_name}</Text>
                <Text style={styles.delayedTrader} numberOfLines={1}>{d.trader}</Text>
                <Text style={styles.delayedDuration}>{d.duration}</Text>
                <Text style={[styles.delayedStatus, d.is_problem ? styles.problemText : styles.pendingText]}>
                  {d.is_problem ? 'Bermasalah' : 'Tertunda'}
                </Text>
              </Hover>
            ) : (
              <Hover key={i} style={styles.delayedCard} hoverStyle={styles.traderRowHover}>
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
              </Hover>
            ),
          )
        )}
      </Panel>
    </ScrollView>
  );
}

function ExportBtn({ onPress, disabled }: { onPress?: () => void; disabled?: boolean }) {
  return <Button label="Export CSV" icon="↓" variant="secondary" onPress={onPress ?? (() => undefined)} disabled={disabled} />;
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
  wrapContent: { paddingBottom: 32 },
  errorBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 20, marginHorizontal: 16, marginTop: 24, alignItems: 'center', gap: 8 },
  errorTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  errorText: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginBottom: 6 },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  // HP: aksi pindah ke baris sendiri di bawah judul halaman.
  mobileActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  // Pill rentang tanggal (pemicu modal kalender) — setinggi tombol Export CSV.
  rangePill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 40,
    paddingHorizontal: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.full,
    shadowColor: '#0F162A', shadowOpacity: 0.03, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 1,
  },
  rangePillFlex: { flex: 1, minWidth: 0 },
  rangePillGlyphBox: { width: 24, height: 24, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rangePillGlyph: { fontSize: 11, color: colors.primary },
  rangePillText: { flexShrink: 1, minWidth: 0 },
  rangePillLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.7, color: colors.faint, textTransform: 'uppercase' },
  rangePillValue: { fontSize: 11, fontWeight: '700', color: colors.text },
  rangePillCaret: { fontSize: 9, color: colors.faint },

  // Kalender mini di dalam modal
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  calNav: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  calNavText: { fontSize: 18, color: colors.muted, lineHeight: 20, marginTop: -2 },
  calDow: { flexDirection: 'row' },
  calDowText: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '800', color: colors.faint, paddingVertical: 4 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: {
    width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.sm,
  },
  calCellEnd: { backgroundColor: colors.primary },
  calCellRange: { backgroundColor: colors.primarySoft },
  calCellText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  calCellTextEnd: { color: colors.onPrimary, fontWeight: '800' },
  calCellTextRange: { color: colors.primary },
  calHint: { fontSize: 10, color: colors.faint, marginTop: 10 },
  calActions: { flexDirection: 'row', gap: 10, marginTop: 14 },

  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, marginBottom: space.lg },
  // HP: dua kolom rata; kartu Bermasalah membentang penuh di bawah.
  metricsMobile: { gap: 8, paddingHorizontal: 12 },
  metric: {
    flexGrow: 1, flexBasis: 180, minWidth: 150,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
    padding: 14, position: 'relative', overflow: 'hidden',
  },
  metricMobile: { flexBasis: '46%', minWidth: 0, padding: 12 },
  metricDangerSpan: { flexBasis: '100%', minWidth: 0 },
  metricDanger: { backgroundColor: '#FFF7F6', borderColor: '#F5DAD5' },
  metricHover: { backgroundColor: '#F5F6FA' },
  metricDot: { width: 8, height: 8, borderRadius: 4, position: 'absolute', top: 12, left: 12 },
  metricLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, marginLeft: 14 },
  metricValue: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 6, letterSpacing: -0.5 },
  metricValueMobile: { fontSize: 20 },

  panel: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
    padding: 18, marginHorizontal: 20, marginBottom: space.lg,
    shadowColor: '#0F162A', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 1,
  },
  panelTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  panelSub: { fontSize: 10, color: colors.muted, marginTop: 3, marginBottom: 12 },
  panelMobile: { marginHorizontal: 12, padding: 14 },

  distBar: { flexDirection: 'row', height: 12, borderRadius: radius.full, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  distSegment: { height: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.surfaceAlt, borderRadius: radius.full, paddingHorizontal: 11, paddingVertical: 6 },
  legendItemHover: { backgroundColor: '#E9ECF3' },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, color: colors.muted },
  legendValue: { fontSize: 11, fontWeight: '800', color: colors.text },
  legendPct: { fontSize: 10, fontWeight: '700', color: colors.faint },

  traderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  traderRowMobile: { gap: 8 },
  traderRowHover: { backgroundColor: '#F7F8FC' },
  traderName: { width: 110, fontSize: 12, fontWeight: '700', color: colors.text },
  traderNameMobile: { flex: 0.6, width: undefined, minWidth: 0 },
  traderBarWrap: { flex: 1, gap: 5 },
  traderCounts: { flexDirection: 'row', gap: 10 },
  countSelesai: { fontSize: 9, color: '#1F7A4D', fontWeight: '700' },
  countBelum: { fontSize: 9, color: '#A8610F', fontWeight: '700' },
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
  delayedDuration: { fontSize: 10, fontWeight: '700', color: '#C1433A', width: 56, textAlign: 'right' },
  delayedStatus: { fontSize: 9, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
  problemText: { color: '#C1433A', backgroundColor: '#FCE9E6' },
  pendingText: { color: '#A8610F', backgroundColor: '#FCF1DE' },

  // HP: item tertunda jadi kartu dua baris agar tidak sesak satu lajur.
  delayedCard: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt, gap: 4 },
  delayedCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  delayedCardOrder: { flex: 1, fontSize: 11, fontWeight: '800', color: colors.primaryMuted, minWidth: 0 },
  delayedCardDuration: { fontSize: 10, fontWeight: '700', color: '#C1433A' },
  delayedCardMeta: { fontSize: 10, color: colors.faint },
});
