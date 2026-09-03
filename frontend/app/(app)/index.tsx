import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from "react-native";
import { api, type OrderView } from '../../src/lib/api';
import { notify } from '../../src/lib/notify';
import { useOrders } from '../../src/hooks/useOrders';
import { useAuth } from '../../src/hooks/useAuth';
import { useSettings } from '../../src/hooks/useSettings';
import { useAdminOnly } from '../../src/hooks/useRoleGuard';
import { colors, radius, statusLabel, webNoOutline, type Status } from '../../src/theme';
import { durationLabel, isToday, statusColor } from '../../src/lib/format';
import { Avatar, Button, EmptyState, FlagBadge, PageHeader, SearchInput } from '../../src/components/ui';
import { NewOrderModal } from '../../src/components/NewOrderModal';
import { OrderDetailModal } from '../../src/components/OrderDetailModal';

const COLUMNS: Status[] = ['data_masuk', 'proses_pick_up', 'selesai'];
const DRAG_THRESHOLD = 60;

const COL_SUB: Record<Status, string> = {
  data_masuk: 'Menunggu diproses',
  proses_pick_up: 'Menunggu barang diambil',
  selesai: 'Selesai hari ini',
};

function DraggableCard({
  order, onTap, onMove, dragEnabled,
}: { order: OrderView; onTap: (o: OrderView) => void; onMove: (o: OrderView, to: Status) => void; dragEnabled: boolean }) {
  const dx = useRef(new Animated.Value(0)).current;
  const movedRef = useRef(false);

  const responder = useMemo(
    () =>
      dragEnabled
        ? PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8,
            onPanResponderMove: (_e, g) => {
              dx.setValue(g.dx);
              movedRef.current = Math.abs(g.dx) > 12;
            },
            onPanResponderRelease: (_e, g) => {
              const step = g.dx > DRAG_THRESHOLD ? 1 : g.dx < -DRAG_THRESHOLD ? -1 : 0;
              Animated.spring(dx, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
              if (movedRef.current && step !== 0) {
                const from = COLUMNS.indexOf(order.status);
                const to = COLUMNS[Math.max(0, Math.min(COLUMNS.length - 1, from + step))];
                if (to !== order.status) onMove(order, to);
              }
              movedRef.current = false;
            },
          })
        : undefined,
    [dx, order, onMove, dragEnabled],
  );

  return (
    <Animated.View {...(responder?.panHandlers ?? {})} style={{ transform: [{ translateX: dx }] }}>
      <Pressable
        onPress={() => {
          if (!movedRef.current) onTap(order);
        }}
        onPressIn={() => {
          movedRef.current = false;
        }}
        style={({ pressed }) => [
          styles.card,
          order.is_problem && styles.cardProblem,
          order.status === 'proses_pick_up' && styles.cardPicked,
          pressed && { opacity: 0.92 },
        ]}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardNumber}>{order.order_number}</Text>
          {order.is_problem ? (
            <FlagBadge kind="problem" />
          ) : order.is_pending ? (
            <FlagBadge kind="pending" />
          ) : null}
        </View>
        <Text style={styles.cardProduct} numberOfLines={2}>{order.product_name}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>{order.store_name} · {order.recipient_name}</Text>

        <View style={styles.cardFoot}>
          <View style={styles.person}>
            <Avatar name={order.trader_name} size={18} />
            <Text style={styles.personName} numberOfLines={1}>{order.trader_name}</Text>
          </View>
          <Text style={[styles.duration, order.is_pending && styles.durationPending]}>{durationLabel(order.updated_at)}</Text>
        </View>

        {order.status === 'selesai' && (
          <View style={styles.proofChip}>
            <Text style={styles.proofText}>▣ {order.photo_count} foto</Text>
          </View>
        )}
        {order.status === 'data_masuk' && (
          <Button label="Proses pick up" icon="→" variant="soft" size="sm" fullWidth style={{ marginTop: 10 }} onPress={() => onMove(order, 'proses_pick_up')} />
        )}
        {order.status === 'proses_pick_up' && (
          <Button label="Selesaikan order" icon="✓" variant="soft" size="sm" fullWidth style={{ marginTop: 10 }} onPress={() => onMove(order, 'selesai')} />
        )}
      </Pressable>
    </Animated.View>
  );
}

function ColumnEmpty({ text }: { text: string }) {
  return (
    <View style={styles.colEmpty}>
      <Text style={styles.colEmptyText}>{text}</Text>
    </View>
  );
}

export default function Kanban() {
  useAdminOnly();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { orders, refresh, loading } = useOrders();
  const [selected, setSelected] = useState<OrderView | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');
  const settings = useSettings();

  const byStatus = useMemo(() => {
    const m: Record<Status, OrderView[]> = { data_masuk: [], proses_pick_up: [], selesai: [] };
    const q = search.trim().toLowerCase();
    orders.forEach((o) => {
      // Kolom Selesai secara bawaan hanya menampilkan order hari berjalan.
      if (o.status === 'selesai' && !isToday(o.completed_at ?? o.updated_at)) return;
      if (q) {
        const hay = `${o.order_number} ${o.product_name} ${o.recipient_name} ${o.trader_name} ${o.store_name}`.toLowerCase();
        if (!hay.includes(q)) return;
      }
      m[o.status].push(o);
    });
    return m;
  }, [orders, search]);

  const searching = search.trim().length > 0;

  const move = async (o: OrderView, to: Status) => {
    // Perpindahan ke Selesai — foto bukti cukup → selesaikan langsung; kurang → buka modal.
    if (to === 'selesai') {
      if (o.photo_count >= settings.min_photos) {
        try {
          await api.completeOrder(o.id, '');
          refresh();
        } catch (e) {
          notify('Gagal', (e as Error).message);
        }
        return;
      }
      setSelected(o);
      return;
    }
    if (to === 'proses_pick_up') {
      // Sudah ada foto/barcode → proses langsung; belum → buka modal detail untuk tambah foto.
      if (o.barcode_path || o.photo_count > 0) {
        try {
          await api.pickup(o.id);
          refresh();
        } catch (e) {
          notify('Gagal', (e as Error).message);
        }
        return;
      }
      setSelected(o);
      return;
    }
    try {
      await api.updateStatus(o.id, to);
      refresh();
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };

  return (
    <View style={styles.wrap}>
      <PageHeader
        title="Papan kerja"
        subtitle={wide ? 'Seret kartu untuk mengubah status · ketuk untuk buka detail.' : 'Ketuk kartu untuk buka detail.'}
        action={
          user?.role === 'admin' ? (
            <Button label="Input order baru" icon="+" onPress={() => setShowNew(true)} />
          ) : undefined
        }
      />

      <View style={styles.searchWrap}>
        <SearchInput value={search} onChangeText={setSearch} placeholder="Cari nomor pesanan, produk, penerima, atau trader..." />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      ) : orders.length === 0 ? (
        <EmptyState icon="▦" text="Belum ada order. Trader mulai mencatat order dari Daftar Order." />
      ) : searching && byStatus.data_masuk.length + byStatus.proses_pick_up.length + byStatus.selesai.length === 0 ? (
        <EmptyState icon="⌕" text={`Tidak ada order yang cocok dengan "${search.trim()}".`} />
      ) : (
        <View style={styles.viewport}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.boardScrollOuter} contentContainerStyle={styles.boardScroll}>
            <View style={styles.board}>
              {COLUMNS.map((status) => (
                <View key={status} style={[styles.column, wide && styles.columnWide, !wide && { width: Math.round(width * 0.82) }]}>
                  <View style={styles.colHead}>
                    <View style={[styles.dot, { backgroundColor: statusColor[status] }]} />
                    <Text style={styles.colTitle}>{statusLabel[status]}</Text>
                    <View style={styles.colCountPill}>
                      <Text style={[styles.colCount, { color: statusColor[status] }]}>{byStatus[status].length}</Text>
                    </View>
                  </View>
                  <Text style={styles.colSub}>{COL_SUB[status]}</Text>

                  <ScrollView style={styles.cardList} contentContainerStyle={styles.cardListContent} showsVerticalScrollIndicator={false}>
                    {byStatus[status].length === 0 ? (
                      <ColumnEmpty text={searching ? 'Tidak cocok' : 'Belum ada kartu'} />
                    ) : (
                      byStatus[status].map((o) => (
                        <DraggableCard key={o.id} order={o} onTap={setSelected} onMove={move} dragEnabled={wide} />
                      ))
                    )}
                  </ScrollView>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      <NewOrderModal open={showNew} onClose={() => setShowNew(false)} user={user} onCreated={refresh} />
      <OrderDetailModal order={selected} onClose={() => setSelected(null)} onChanged={refresh} />
    </View>
  );
}


const styles = StyleSheet.create({
  wrap: { flex: 1 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  viewport: { flex: 1 },
  boardScrollOuter: { flex: 1 },
  boardScroll: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 12 },
  board: { flexDirection: 'row', gap: 14, flexGrow: 1 },

  column: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  columnWide: { flex: 1 },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  colTitle: { fontWeight: '800', fontSize: 14, color: colors.text, letterSpacing: -0.2 },
  colCountPill: {
    marginLeft: 'auto', minWidth: 26, alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
  },
  colCount: { fontSize: 11, fontWeight: '800' },
  colSub: { fontSize: 10, color: colors.faint, marginTop: 4, marginBottom: 10 },

  cardList: { flex: 1 },
  cardListContent: { gap: 8, paddingBottom: 6 },

  colEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  colEmptyText: { fontSize: 10, color: colors.faint },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
    padding: 12, shadowColor: '#0F162A', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 3 }, shadowRadius: 10, elevation: 1,
  },
  cardProblem: { borderTopWidth: 3, borderTopColor: colors.red },
  cardPicked: { borderColor: '#C9DAF5', backgroundColor: '#FAFCFF' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  cardNumber: { fontSize: 9, fontWeight: '800', color: colors.primaryMuted, letterSpacing: 0.3 },
  
  
  cardProduct: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 8 },
  cardMeta: { fontSize: 10, color: colors.muted, marginTop: 3 },
  cardFoot: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 11, borderTopWidth: 1, borderTopColor: colors.surfaceAlt, paddingTop: 9,
  },
  person: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  personName: { fontSize: 9, color: colors.muted, flexShrink: 1 },
  duration: {
    fontSize: 9, color: colors.faint, fontWeight: '700',
    backgroundColor: colors.surfaceAlt, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden',
  },
  durationPending: { color: '#A8610F', backgroundColor: '#FCF1DE' },
  proofChip: { marginTop: 9, alignSelf: 'flex-start' },
  proofText: { fontSize: 9, fontWeight: '800', color: '#1F7A4D', backgroundColor: '#E3F5EC', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, overflow: 'hidden' },
});
