import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { api, type Reports } from '../../src/lib/api';
import { useAdminOnly } from '../../src/hooks/useRoleGuard';
import { colors, radius, space, type Status } from '../../src/theme';
import { money } from '../../src/lib/format';
import { Button, EmptyState, PageHeader } from '../../src/components/ui';

const RANGES = [
  { key: 'hari_ini', label: 'Hari ini' },
  { key: '7_hari', label: '7 hari terakhir' },
  { key: 'bulan_ini', label: 'Bulan berjalan' },
  { key: 'kustom', label: 'Rentang khusus' },
] as const;

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

/* ---------- Segmented range (slider mengikuti pilihan) ---------- */

function Segmented({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [pos, setPos] = useState<{ x: number; w: number }[]>([]);
  const [pillW, setPillW] = useState(0);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const idx = RANGES.findIndex((r) => r.key === value);
    const p = pos[idx];
    if (p) {
      setPillW(p.w);
      Animated.spring(slide, { toValue: p.x, useNativeDriver: true, friction: 9, tension: 120 }).start();
    }
  }, [value, pos, slide]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segScroll}>
      <View style={styles.seg}>
        <Animated.View style={[styles.segPill, { width: pillW, transform: [{ translateX: slide }] }]} />
        {RANGES.map((r, i) => {
          const active = r.key === value;
          return (
            <Pressable
              key={r.key}
              onPress={() => onChange(r.key)}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                setPos((cur) => {
                  const next = [...cur];
                  next[i] = { x, w: width };
                  return next;
                });
              }}
              style={({ pressed }) => [styles.segItem, pressed && { opacity: 0.8 }]}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

/* ---------- KPI card ---------- */

function MetricCard({ label, value, color, danger }: { label: string; value: number; color: string; danger?: boolean }) {
  const shown = useCountUp(value);
  return (
    <Hover style={[styles.metric, danger && styles.metricDanger]} hoverStyle={styles.metricHover}>
      <View style={[styles.metricDot, { backgroundColor: color }]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, danger && { color: colors.red }]}>{shown}</Text>
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

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.panelSub}>{subtitle}</Text>}
      {children}
    </View>
  );
}

export default function Analytics() {
  useAdminOnly();
  const [range, setRange] = useState<string>('bulan_ini');
  const [data, setData] = useState<Reports | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api.reports(range).then(setData).catch((e) => setError((e as Error).message));
  }, [range]);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!data) return (
    <View style={styles.wrap}>
      <PageHeader title="Analytics" subtitle="Baca performa order dan rekap pembayaran dalam satu tampilan." action={<ExportBtn disabled />} />
      <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
    </View>
  );

  const t = data.totals;
  const statusTotal = t.data_masuk + t.proses_pick_up + t.selesai;
  const pct = (n: number) => (statusTotal ? Math.round((n / statusTotal) * 100) : 0);
  const maxTrader = Math.max(1, ...data.perTrader.map((r) => r.total));
  const maxAmount = Math.max(1, ...data.perRekening.map((r) => r.amount));

  const exportCsv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: string[] = [];
    rows.push('Laporan order per trader');
    rows.push(['Trader', 'Total order', 'Selesai', 'Belum selesai'].join(','));
    data.perTrader.forEach((r) => rows.push([r.trader, r.total, r.selesai, r.belum_selesai].map(esc).join(',')));
    rows.push('');
    rows.push('Rekap pembayaran per rekening');
    rows.push(['Bank', 'Nomor rekening', 'Pemilik', 'Jumlah order', 'Total nominal'].join(','));
    data.perRekening.forEach((r) => rows.push([r.bank_name, r.account_number, r.holder, r.orders, r.amount].map(esc).join(',')));
    rows.push('');
    rows.push('Order tertunda atau bermasalah');
    rows.push(['Nomor order', 'Produk', 'Trader', 'Durasi', 'Status'].join(','));
    data.delayed.forEach((d) => rows.push([d.order_number, d.product_name, d.trader, d.duration, d.is_problem ? 'Bermasalah' : 'Tertunda'].map(esc).join(',')));
    downloadCsv(rows.join('\n'), `tradertrack-laporan-${range}.csv`);
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.wrapContent}>
      <PageHeader title="Analytics" subtitle="Baca performa order dan rekap pembayaran dalam satu tampilan." action={<ExportBtn onPress={exportCsv} />} />

      <View style={styles.rangeRow}>
        <Segmented value={range} onChange={setRange} />
      </View>

      <View style={styles.metrics}>
        <MetricCard label="Total order" value={t.total} color={colors.primary} />
        <MetricCard label="Data masuk" value={t.data_masuk} color={colors.amber} />
        <MetricCard label="Proses pick up" value={t.proses_pick_up} color={colors.blue} />
        <MetricCard label="Selesai" value={t.selesai} color={colors.green} />
        <MetricCard label="Bermasalah" value={t.bermasalah} color={colors.red} danger />
      </View>

      <Panel title="Distribusi status" subtitle="Proporsi seluruh order pada rentang terpilih">
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

      <Panel title="Jumlah order per trader" subtitle="Diurutkan menurun · batang = proporsi terhadap total order terbanyak">
        {data.perTrader.map((r) => (
          <Hover key={r.trader} style={styles.traderRow} hoverStyle={styles.traderRowHover}>
            <Text style={styles.traderName} numberOfLines={1}>{r.trader}</Text>
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

      <Panel title="Rekap pembayaran per rekening" subtitle="Nominal hanya bila kolom nominal diisi · batang = proporsi nominal terbesar">
        {data.perRekening.length === 0 ? (
          <EmptyState icon="▤" text="Belum ada data rekening pada rentang ini." />
        ) : (
          data.perRekening.map((r) => (
            <Hover key={r.account_number} style={styles.rekapRow} hoverStyle={styles.traderRowHover}>
              <View style={styles.rekapMain}>
                <Text style={styles.rekapName} numberOfLines={1}>{r.bank_name} · {r.account_number}</Text>
                <Text style={styles.rekapSub}>{r.holder} · {r.orders} order</Text>
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

      <Panel title="Order tertunda atau bermasalah" subtitle="Diurutkan dari yang paling lama">
        {data.delayed.length === 0 ? (
          <EmptyState icon="✓" text="Tidak ada order tertunda atau bermasalah pada rentang ini." />
        ) : (
          data.delayed.map((d, i) => (
            <Hover key={i} style={styles.delayedRow} hoverStyle={styles.traderRowHover}>
              <Text style={styles.delayedOrder}>#{d.order_number}</Text>
              <Text style={styles.delayedProduct} numberOfLines={1}>{d.product_name}</Text>
              <Text style={styles.delayedTrader} numberOfLines={1}>{d.trader}</Text>
              <Text style={styles.delayedDuration}>{d.duration}</Text>
              <Text style={[styles.delayedStatus, d.is_problem ? styles.problemText : styles.pendingText]}>
                {d.is_problem ? 'Bermasalah' : 'Tertunda'}
              </Text>
            </Hover>
          ))
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
    Alert.alert('Export CSV', content);
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  wrapContent: { paddingBottom: 32 },
  error: { color: colors.red, margin: 24 },

  rangeRow: { paddingHorizontal: 20, marginBottom: space.lg },
  segScroll: { paddingRight: 20 },
  seg: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.full, alignSelf: 'flex-start' },
  segPill: {
    position: 'absolute', left: 0, top: 4, bottom: 4, borderRadius: radius.full,
    backgroundColor: colors.primary, shadowColor: '#0F162A', shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 3,
  },
  segItem: { paddingHorizontal: 15, height: 34, justifyContent: 'center' },
  segText: { fontSize: 12, fontWeight: '700', color: colors.muted },
  segTextActive: { color: colors.onPrimary },

  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, marginBottom: space.lg },
  metric: {
    flexGrow: 1, flexBasis: 180, minWidth: 150,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
    padding: 14, position: 'relative', overflow: 'hidden',
  },
  metricDanger: { backgroundColor: '#FFF7F6', borderColor: '#F5DAD5' },
  metricHover: { backgroundColor: '#F5F6FA' },
  metricDot: { width: 8, height: 8, borderRadius: 4, position: 'absolute', top: 12, left: 12 },
  metricLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, marginLeft: 14 },
  metricValue: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 6, letterSpacing: -0.5 },

  panel: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
    padding: 18, marginHorizontal: 20, marginBottom: space.lg,
    shadowColor: '#0F162A', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 1,
  },
  panelTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  panelSub: { fontSize: 10, color: colors.muted, marginTop: 3, marginBottom: 12 },

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
  traderRowHover: { backgroundColor: '#F7F8FC' },
  traderName: { width: 110, fontSize: 12, fontWeight: '700', color: colors.text },
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
});
