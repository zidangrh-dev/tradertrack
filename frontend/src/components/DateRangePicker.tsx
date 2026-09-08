import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';
import { Button, Sheet } from './ui';

/* ---------- Util tanggal (satu sumber untuk seluruh aplikasi) ---------- */

const DAYS = ['S', 'S', 'R', 'K', 'J', 'S', 'M']; // Senin pertama
const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** Kunci berpadding (2026-09-03) — perbandingan rentang lewat string butuh urutan leksikografis. */
export const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const fmtDate = (d: Date) =>
  d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

/** Awal hari (00:00:00.000) dalam ISO — batas bawah filter. */
export const startOfDayISO = (k: string) => parseKey(k).toISOString();

/** Akhir hari (23:59:59.999) dalam ISO — batas atas inklusif. */
export const endOfDayISO = (k: string) => {
  const d = parseKey(k);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

/** Ambil 6 minggu penuh (Senin–Minggu) yang memuat bulan `view`. */
export function monthGrid(view: Date): Date[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // mundur ke Senin
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/* ---------- Kalender rentang ---------- */

export function Calendar({ initialFrom, initialTo, onApply, onCancel, showShortcuts = true }: {
  initialFrom: string | null;
  initialTo: string | null;
  onApply: (fromKey: string, toKey: string) => void;
  onCancel: () => void;
  /** Pintasan cepat (hari ini / 7 hari / bulan berjalan). */
  showShortcuts?: boolean;
}) {
  // Draf di dalam modal: menutup tanpa "Terapkan" tidak mengubah rentang aktif.
  const [fromKey, setFromKey] = useState<string | null>(initialFrom);
  const [toKey, setToKey] = useState<string | null>(initialTo);
  // Buka di bulan yang memuat rentang aktif (atau bulan ini bila belum ada).
  const [view, setView] = useState(() => {
    const base = initialTo ? parseKey(initialTo) : new Date();
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

  const setRange = (from: Date, to: Date) => {
    setFromKey(keyOf(from));
    setToKey(keyOf(to));
    setView(new Date(to.getFullYear(), to.getMonth(), 1));
  };

  const shortcuts = [
    {
      label: 'Hari ini',
      apply: () => { const d = new Date(); setRange(d, d); },
    },
    {
      label: '7 hari terakhir',
      apply: () => { const to = new Date(); const from = new Date(Date.now() - 6 * 864e5); setRange(from, to); },
    },
    {
      label: 'Bulan berjalan',
      apply: () => {
        const d = new Date();
        setRange(new Date(d.getFullYear(), d.getMonth(), 1), d);
      },
    },
  ];

  const inRange = (k: string) => !!fromKey && !!toKey && k > fromKey && k < toKey;
  const complete = !!fromKey && !!toKey;

  return (
    <View>
      {showShortcuts && (
        <View style={styles.shortcutRow}>
          {shortcuts.map((s) => (
            <Pressable
              key={s.label}
              onPress={s.apply}
              style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.shortcutText}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.calHead}>
        <Pressable onPress={() => go(-1)} hitSlop={10} style={styles.calNav} accessibilityLabel="Bulan sebelumnya">
          <Text style={styles.calNavText}>‹</Text>
        </Pressable>
        <Text style={styles.calTitle}>{MONTHS[view.getMonth()]} {view.getFullYear()}</Text>
        <Pressable onPress={() => go(1)} hitSlop={10} style={styles.calNav} accessibilityLabel="Bulan berikutnya">
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
        {!fromKey
          ? 'Ketuk tanggal mulai.'
          : !toKey
            ? 'Ketuk tanggal akhir.'
            : `${fmtDate(parseKey(fromKey))} — ${fmtDate(parseKey(toKey))}`}
      </Text>
      <View style={styles.calActions}>
        <Button label="Batal" variant="secondary" onPress={onCancel} />
        <Button label="Terapkan" disabled={!complete} onPress={() => complete && onApply(fromKey!, toKey!)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/* ---------- Pemicu filter (sebaris dengan Select compact) ---------- */

export function DateRangeField({ fromKey, toKey, onChange, block, compact = true }: {
  fromKey: string | null;
  toKey: string | null;
  onChange: (from: string | null, to: string | null) => void;
  block?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const terisi = !!fromKey && !!toKey;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Pilih rentang tanggal"
        style={({ pressed }) => [
          styles.field,
          compact && styles.fieldCompact,
          block && styles.fieldBlock,
          terisi && styles.fieldActive,
          pressed && { opacity: 0.9 },
        ]}
      >
        <Text style={[styles.fieldValue, terisi && styles.fieldValueActive]} numberOfLines={1}>
          {terisi ? `${fmtDate(parseKey(fromKey!))} — ${fmtDate(parseKey(toKey!))}` : 'Semua tanggal'}
        </Text>
        {terisi ? (
          <Pressable
            onPress={() => onChange(null, null)}
            hitSlop={8}
            accessibilityLabel="Kosongkan rentang tanggal"
          >
            <Text style={styles.fieldClear}>✕</Text>
          </Pressable>
        ) : (
          <Text style={styles.fieldCaret}>▾</Text>
        )}
      </Pressable>

      <Sheet open={open} onClose={() => setOpen(false)} title="Pilih rentang tanggal">
        {open && (
          <Calendar
            initialFrom={fromKey}
            initialTo={toKey}
            onApply={(f, t) => { onChange(f, t); setOpen(false); }}
            onCancel={() => setOpen(false)}
          />
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  // Pemicu: setinggi & segaya Select compact agar sebaris rapi dengan filter lain.
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 46, paddingHorizontal: 12, minWidth: 180, maxWidth: '100%',
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface,
  },
  fieldCompact: { height: 34, minWidth: 150, paddingHorizontal: 10 },
  fieldBlock: { alignSelf: 'stretch', width: '100%' },
  fieldActive: { borderColor: '#A8BACD', backgroundColor: colors.primarySoft },
  fieldValue: { flex: 1, fontSize: 11, fontWeight: '600', color: colors.faint },
  fieldValueActive: { color: colors.primary, fontWeight: '700' },
  fieldCaret: { fontSize: 9, color: colors.faint },
  fieldClear: { fontSize: 11, color: colors.primary, fontWeight: '800' },

  // Pintasan cepat — menggantikan kemudahan dropdown periode lama.
  shortcutRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  shortcut: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceAlt,
  },
  shortcutText: { fontSize: 10, fontWeight: '700', color: colors.muted },

  // Kalender
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
});
