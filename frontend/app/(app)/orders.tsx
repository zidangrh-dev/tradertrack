import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { api, type OrderView } from '../../src/lib/api';
import { notify, confirmAsk } from '../../src/lib/notify';
import { pickPhoto } from '../../src/lib/photo';
import { useOrders } from '../../src/hooks/useOrders';
import { useAuth } from '../../src/hooks/useAuth';
import { useCopyColumns } from '../../src/hooks/useCopyColumns';
import { COPY_COLUMNS } from '../../src/lib/copyColumns';
import { colors, radius, pickupMethodLabel, pickupMethodOptions, proofOkColor, statusOptions, statusLabel, STATUS_FLOW } from '../../src/theme';
import { dateTime, durationLabel } from '../../src/lib/format';
import { ActionMenu, Avatar, Button, DataTable, EmptyState, Field, FlagBadge, MultiSelect, OrderCard, PageHeader, SearchInput, Select, Sheet, StatusTag, type ActionMenuItem, type DataTableColumn, type SelectOption } from '../../src/components/ui';
import { DateRangeField, endOfDayISO, startOfDayISO } from '../../src/components/DateRangePicker';
import { NewOrderModal } from '../../src/components/NewOrderModal';
import { OrderDetailModal } from '../../src/components/OrderDetailModal';
import { isAdminLevel } from '../../src/lib/roles';

const PER_PAGE = 50;
const COPIED_OPTIONS = [
  { value: 'belum', label: 'Belum disalin' },
  { value: 'sudah', label: 'Sudah disalin' },
];

/** Satu baris salin dibentuk dari daftar ini, bukan dari dua definisi terpisah
 *  (header + nilai) yang bisa tidak sinkron. Urutan array = urutan kolom pada
 *  hasil salin, apa pun urutan admin mencentangnya. */
function orderCopyRow(o: OrderView, keys: string[]) {
  return COPY_COLUMNS.filter((c) => keys.includes(c.key)).map((c) => c.value(o));
}

async function copyText(text: string) {
  // expo-clipboard: native (APK/iOS) + web sekaligus — navigator.clipboard hanya ada di browser.
  await Clipboard.setStringAsync(text);
}

export default function Orders() {
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);
  // Tiga keadaan, bukan dua: halaman dipakai di HP, tablet, dan desktop.
  //  < 700  → kartu (9 kolom mustahil muat)
  //  700-1060 → tabel ringkas: kolom sekunder disembunyikan agar kolom yang
  //             menentukan tindakan tetap lebar dan terbaca
  //  > 1060 → tabel penuh
  const { width } = useWindowDimensions();
  const isNarrow = width < 700;
  const isRingkas = !isNarrow && width < 1060;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [trader, setTrader] = useState('');
  // '' = semua, 'belum' / 'sudah' = saring berdasarkan penanda salin.
  const [copied, setCopied] = useState('');
  // Kolom yang ikut disalin — diingat antar sesi di perangkat ini.
  const { keys: copyCols, toggle: toggleCopyCol, reset: resetCopyCols } = useCopyColumns();
  const [pilihKolom, setPilihKolom] = useState(false);
  const [store, setStore] = useState<string[]>([]);
  const [product, setProduct] = useState<string[]>([]);
  // Rentang tanggal kosong = semua tanggal (tidak ada data yang tersembunyi diam-diam).
  const [fromKey, setFromKey] = useState<string | null>(null);
  const [toKey, setToKey] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<OrderView | null>(null);
  const [editing, setEditing] = useState<OrderView | null>(null);
  const [traders, setTraders] = useState<SelectOption[]>([]);
  const [stores, setStores] = useState<SelectOption[]>([]);
  const [products, setProducts] = useState<SelectOption[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    api.listUsers().then((users) =>
      setTraders(users.filter((u) => u.is_active).map((u) => ({ value: u.id, label: u.display_name, sub: `@${u.username}` }))),
    ).catch(() => setTraders([]));
  }, [isAdmin]);

  useEffect(() => {
    api.listMarketplaceStores().then((ss) =>
      setStores(ss.map((s) => ({ value: s.id, label: s.name }))),
    ).catch(() => setStores([]));
    // Produk nonaktif ikut ditampilkan agar order lama tetap bisa disaring.
    api.listProducts().then((ps) =>
      setProducts(
        [...ps]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => ({ value: p.id, label: p.name, sub: p.is_active ? undefined : 'Nonaktif' })),
      ),
    ).catch(() => setProducts([]));
  }, []);

  const query = useMemo(() => {
    const q: Record<string, string> = {};
    if (search.trim()) q.q = search.trim();
    if (status) q.status = status;
    if (method) q.pickup_method = method;
    if (store.length) q.store = store.join(',');
    if (product.length) q.product = product.join(',');
    if (trader) q.trader = trader;
    if (copied) q.copied = copied;
    q.page = String(page);
    q.per_page = String(PER_PAGE);
    // Batas atas akhir hari agar rentang inklusif sampai tanggal terpilih.
    if (fromKey) q.from = startOfDayISO(fromKey);
    if (toKey) q.to = endOfDayISO(toKey);
    return q;
  }, [search, status, method, store, product, trader, copied, fromKey, toKey, page]);

  const { orders, total, loading, error, refresh } = useOrders(query);

  const sorted = useMemo(() => {
    const list = [...orders];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'order_number': cmp = a.order_number.localeCompare(b.order_number); break;
        case 'product': cmp = a.product_name.localeCompare(b.product_name); break;
        case 'recipient': cmp = a.recipient_name.localeCompare(b.recipient_name); break;
        case 'trader': cmp = a.trader_name.localeCompare(b.trader_name); break;
        case 'method': cmp = a.pickup_method.localeCompare(b.pickup_method); break;
        // Urut mengikuti alur order, bukan alfabetis.
        case 'status': cmp = STATUS_FLOW.indexOf(a.status) - STATUS_FLOW.indexOf(b.status); break;
        case 'photo_count': cmp = a.photo_count - b.photo_count; break;
        case 'created_at': cmp = a.created_at.localeCompare(b.created_at); break;
        default: cmp = a.created_at.localeCompare(b.created_at);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [orders, sortKey, sortDir]);

  // Pagination dilakukan server (LIMIT/OFFSET). Total dari COUNT server.
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const visiblePage = Math.min(page, totalPages);

  const handleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const resetFilters = () => {
    setStatus(''); setMethod(''); setStore([]); setProduct([]); setTrader(''); setCopied(''); setFromKey(null); setToKey(null); setPage(1);
  };

  const activeFilters = [status, method, trader, copied].filter(Boolean).length + (store.length > 0 ? 1 : 0) + (product.length > 0 ? 1 : 0) + (fromKey && toKey ? 1 : 0);
  // Hanya halaman yang tampil yang ikut tersalin (PER_PAGE), jadi penandaan
  // dibatasi ke baris yang benar-benar masuk papan klip — order di halaman
  // berikutnya tidak boleh ikut tertandai.
  const belumDisalin = sorted.filter((o) => !o.copied_at);

  const salinDanTandai = async (daftar: OrderView[], label: string) => {
    if (daftar.length === 0) return;
    try {
      // Tanpa baris header: hasil salin langsung tempel ke chat tanpa perlu
      // menghapus judul kolom lebih dulu.
      const text = daftar.map((o) => orderCopyRow(o, copyCols).join('\t')).join('\n');
      await copyText(text);
      // Penandaan menyusul setelah salin berhasil: kalau papan klip gagal,
      // order tidak boleh terlanjur dianggap sudah dikirim.
      try {
        await api.markCopied(daftar.map((o) => o.id));
        refresh();
      } catch (e) {
        // Sebutkan sebabnya: tanpa ini admin harus menebak antara server mati,
        // versi backend lama yang belum punya endpoint, atau jaringan putus.
        notify(
          'Tersalin, penanda gagal',
          `${daftar.length} order sudah masuk papan klip, tetapi penandanya gagal disimpan: ${(e as Error).message}. Salin ulang untuk menandai.`,
        );
        return;
      }
      notify('Berhasil', `${daftar.length} ${label} berhasil disalin dan ditandai.`);
    } catch (e) {
      notify('Gagal menyalin', (e as Error).message);
    }
  };

  const copyFiltered = () => salinDanTandai(sorted, 'order pada halaman ini');
  const copyBelumDisalin = () => salinDanTandai(belumDisalin, 'order yang belum disalin');

  const batalTandai = async (o: OrderView) => {
    try {
      await api.clearCopied(o.id);
      notify('Berhasil', `${o.order_number} ditandai belum disalin.`);
      refresh();
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };
  const rangeStart = sorted.length === 0 ? 0 : (visiblePage - 1) * PER_PAGE + 1;
  const rangeEnd = Math.min(visiblePage * PER_PAGE, total);

  // Item dropdown aksi — dipakai kolom aksi tabel (desktop) dan footer kartu (HP)
  // agar tidak ada duplikasi handler maupun perbedaan hak akses.
  const actionItems = (o: OrderView): ActionMenuItem[] => {
    const own = o.trader_id === user?.id && o.status === 'data_masuk';
    // Admin mengoreksi data order di semua status (aturan ditegakkan server).
    // Proses pick up tetap hanya pada order Data masuk milik trader sendiri.
    const bisaUbah = own || isAdmin;
    const items: ActionMenuItem[] = [
      { key: 'detail', label: 'Buka detail', icon: 'open-outline', onPress: () => setSelected(o) },
      {
        key: 'copy',
        label: 'Salin data order',
        icon: 'copy-outline',
        onPress: async () => {
          try {
            await copyText(orderCopyRow(o, copyCols).join('\t'));
            notify('Berhasil', 'Data order disalin.');
          } catch (e) {
            notify('Gagal menyalin', (e as Error).message);
          }
        },
      },
    ];
    if (own) {
      items.push(
        { key: 'pickup', label: 'Proses pick up', icon: 'arrow-forward-circle-outline', onPress: () => processPickup(o, refresh) },
      );
    }
    if (o.copied_at) {
      items.push({
        key: 'uncopy', label: 'Batal tandai disalin', icon: 'refresh-outline',
        onPress: () => batalTandai(o),
      });
    }
    if (bisaUbah) {
      items.push(
        { key: 'edit', label: 'Edit order', icon: 'create-outline', onPress: () => setEditing(o) },
        { key: 'delete', label: 'Hapus order', icon: 'trash-outline', danger: true, separated: true, onPress: () => removeOrder(o, refresh) },
      );
    }
    return items;
  };

  // Kolom yang menentukan tindakan admin (order mana yang perlu ditangani)
  // dapat lebar lebih besar dan bertahan di lebar tablet. Metode & Trader
  // jarang menentukan tindakan, jadi keduanya yang pertama disembunyikan.
  const semuaKolom: (DataTableColumn<OrderView> & { sekunder?: boolean })[] = [
    {
      // Lebar tetap: nomor pesanan marketplace 18 digit harus terbaca utuh,
      // tidak boleh menyusut karena kolom lain. Angka tabular agar rata.
      key: 'order_number', label: 'Nomor order', sortKey: 'order_number' as keyof OrderView, width: 172, fixed: true,
      render: (o) => (
        <View style={dtStyles.orderCodeWrap}>
          <Text style={dtStyles.orderCode}>{o.order_number}</Text>
          <CopiedMark copiedAt={o.copied_at} />
        </View>
      ),
    },
    {
      key: 'product', label: 'Produk & toko', sortKey: 'product' as keyof OrderView, width: 2.5,
      render: (o) => (
        <View>
          <Text style={dtStyles.productName} numberOfLines={1}>{o.product_name}</Text>
          <Text style={dtStyles.storeName} numberOfLines={1}>{o.store_name}</Text>
        </View>
      ),
    },
    {
      key: 'recipient', label: 'Penerima', sortKey: 'recipient' as keyof OrderView, width: 2,
      render: (o) => <Text style={dtStyles.cellText} numberOfLines={1}>{o.recipient_name}</Text>,
    },
    {
      key: 'trader', label: 'Trader', sortKey: 'trader' as keyof OrderView, width: 2, sekunder: true,
      render: (o) => (
        <View style={dtStyles.person}>
          <Avatar name={o.trader_name} size={22} />
          <Text style={dtStyles.personName} numberOfLines={1}>{o.trader_name}</Text>
        </View>
      ),
    },
    {
      key: 'method', label: 'Metode', sortKey: 'method' as keyof OrderView, width: 2, sekunder: true,
      render: (o) => <Text style={dtStyles.method} numberOfLines={1}>{pickupMethodLabel[o.pickup_method]}</Text>,
    },
    {
      // Status memimpin keputusan "order mana yang perlu ditangani", jadi
      // lebarnya di atas kolom informatif seperti Metode.
      key: 'status', label: 'Status', sortKey: 'status' as keyof OrderView, width: 2.2,
      render: (o) => {
        if (o.is_problem) return <FlagBadge kind="problem" />;
        if (o.is_pending) return <FlagBadge kind="pending" />;
        return <StatusTag status={o.status} />;
      },
    },
    {
      key: 'photo_count', label: 'Bukti', sortKey: 'photo_count' as keyof OrderView, width: 1.2,
      render: (o) => (
        <Text style={o.photo_count > 0 ? dtStyles.photoOk : dtStyles.photoEmpty}>
          {o.photo_count > 0 ? `${o.photo_count} foto` : 'Belum ada'}
        </Text>
      ),
    },
    {
      key: 'created_at', label: 'Input', sortKey: 'created_at' as keyof OrderView, width: 1.5,
      render: (o) => <Text style={dtStyles.timeText} numberOfLines={1}>{durationLabel(o.updated_at)}</Text>,
    },
    {
      // Satu tombol ⋯: aksi pindah ke dropdown agar baris tetap tenang.
      key: 'actions', label: '', width: 52, fixed: true,
      render: (o) => (
        <View style={dtStyles.actionCell}>
          <ActionMenu label={`Aksi order ${o.order_number}`} items={actionItems(o)} />
        </View>
      ),
    },
  ];

  // Tablet & laptop kecil: buang kolom sekunder agar sisanya tetap lapang.
  // Datanya tidak hilang, tetap terbaca di modal detail lewat klik baris.
  const columns = isRingkas ? semuaKolom.filter((c) => !c.sekunder) : semuaKolom;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.wrapContent}>
      <PageHeader
        title="Daftar order"
        subtitle={`${total} order · diperbarui realtime`}
        action={<Button label="Order baru" icon="+" onPress={() => setShowNew(true)} />}
      />

      <View style={styles.filterBar}>
        <View style={styles.searchBox}>
          <SearchInput compact value={search} onChangeText={(t) => { setSearch(t); setPage(1); }} placeholder="Cari nomor order, produk, atau penerima..." />
        </View>
        <Pressable
          onPress={() => setShowFilters((v) => !v)}
          // Visual 34px + hitSlop 5 = area sentuh 44px, tinggi baris tetap.
          hitSlop={5}
          style={[styles.filterBtn, activeFilters > 0 && styles.filterBtnActive]}
          accessibilityLabel={showFilters ? 'Sembunyikan filter' : 'Tampilkan filter'}
        >
          <Text style={[styles.filterIcon, activeFilters > 0 && styles.filterIconActive]}>⚙</Text>
          <Text style={[styles.filterText, activeFilters > 0 && styles.filterTextActive]}>Filter</Text>
          {activeFilters > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilters}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {showFilters && (
      <View style={[styles.filterBar, styles.filterPanel, isNarrow && styles.filterBarNarrow]}>
        <Select
          label="Status"
          value={status}
          options={statusOptions}
          onChange={(v) => { setStatus(v); setPage(1); }}
          placeholder="Semua status"
          clearLabel="Semua"
          compact
          block={isNarrow}
        />
        <Select
          label="Metode"
          value={method}
          options={pickupMethodOptions}
          onChange={(v) => { setMethod(v); setPage(1); }}
          placeholder="Semua metode"
          clearLabel="Semua"
          compact
          block={isNarrow}
        />
        <Select
          label="Status salin"
          value={copied}
          options={COPIED_OPTIONS}
          onChange={(v) => { setCopied(v); setPage(1); }}
          placeholder="Semua"
          clearLabel="Semua"
          compact
          block={isNarrow}
        />
        <MultiSelect
          label="Produk"
          value={product}
          options={products}
          onChange={(v) => { setProduct(v); setPage(1); }}
          placeholder="Semua produk"
          clearLabel="Semua"
          compact
          block={isNarrow}
        />
        <MultiSelect
          label="Toko"
          value={store}
          options={stores}
          onChange={(v) => { setStore(v); setPage(1); }}
          placeholder="Semua toko"
          clearLabel="Semua"
          compact
          block={isNarrow}
        />
        {isAdmin && (
          <Select
            label="Trader"
            value={trader}
            options={traders}
            onChange={(v) => { setTrader(v); setPage(1); }}
            placeholder="Semua trader"
            clearLabel="Semua"
            compact
            block={isNarrow}
          />
        )}
        <DateRangeField
          fromKey={fromKey}
          toKey={toKey}
          onChange={(f, t) => { setFromKey(f); setToKey(t); setPage(1); }}
          block={isNarrow}
        />

        {activeFilters > 0 && (
          <Pressable onPress={resetFilters} hitSlop={5} style={[styles.resetBtn, isNarrow && styles.resetBtnNarrow]}>
            <Text style={styles.resetIcon}>↻</Text>
            <Text style={styles.resetText}>Reset{activeFilters > 1 ? ` (${activeFilters})` : ''}</Text>
          </Pressable>
        )}
      </View>
      )}

      <View style={[styles.tableSection, isNarrow && styles.tableSectionNarrow]}>
        <View style={[styles.tableIntro, isNarrow && styles.tableIntroNarrow]}>
          <View>
            <Text style={styles.tableTitle}>{isAdmin ? 'Semua order' : 'Order saya'}</Text>
            {!isNarrow && (
              <Text style={styles.tableHint}>
                Klik judul kolom untuk mengurutkan data.
                {isRingkas ? ' Trader & metode tersembunyi di lebar ini — buka detail untuk melihatnya.' : ''}
              </Text>
            )}
          </View>
          <View style={styles.tableTools}>
            <Text style={styles.tableCount}>{rangeStart}–{rangeEnd} dari {total}</Text>
            <Button
              label={`Copy belum disalin (${belumDisalin.length})`}
              icon="⧉"
              size="sm"
              onPress={copyBelumDisalin}
              disabled={belumDisalin.length === 0}
            />
            <Button label="Copy halaman ini" icon="⧉" variant="secondary" size="sm" onPress={copyFiltered} disabled={sorted.length === 0} />
            <Pressable
              onPress={() => setPilihKolom(true)}
              // Visual 32px + hitSlop 6 = area sentuh 44px.
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Pilih kolom yang disalin"
              style={({ pressed }) => [styles.kolomBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.kolomIcon}>⚙</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Gagal memuat order</Text>
            <Text style={styles.errorText}>Terjadi kendala saat mengambil data. Periksa koneksi ke server, lalu coba muat ulang.</Text>
            <Button label="Muat ulang" variant="secondary" size="sm" onPress={refresh} />
          </View>
        ) : isNarrow ? (
          sorted.length === 0 ? (
            <EmptyState icon="≡" text="Tidak ada order yang cocok dengan filter." />
          ) : (
            <>
              <View style={styles.cardList}>
                {sorted.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    onPress={() => setSelected(o)}
                    menu={<ActionMenu label={`Aksi order ${o.order_number}`} items={actionItems(o)} />}
                  />
                ))}
              </View>
              {/* Jumlah total selalu tampil, juga saat hanya satu halaman:
                  tanpa ini pengguna HP kehilangan konteks "dari berapa". */}
              <Text style={styles.cardCount}>{rangeStart}–{rangeEnd} dari {total} order</Text>
              {totalPages > 1 && (
                <View style={styles.cardPager}>
                  <Button label="‹ Sebelumnya" variant="secondary" size="sm" disabled={visiblePage <= 1} onPress={() => setPage(visiblePage - 1)} />
                  <Text style={styles.cardPagerText}>Hal. {visiblePage}/{totalPages}</Text>
                  <Button label="Berikutnya ›" variant="secondary" size="sm" disabled={visiblePage >= totalPages} onPress={() => setPage(visiblePage + 1)} />
                </View>
              )}
            </>
          )
        ) : (
          <DataTable
            columns={columns}
            data={sorted}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onRowPress={(o) => setSelected(o)}
            emptyText="Tidak ada order yang cocok dengan filter."
            page={visiblePage}
            totalPages={totalPages}
            totalItems={total}
            onPageChange={setPage}
          />
        )}
      </View>

      <NewOrderModal open={showNew} onClose={() => setShowNew(false)} user={user} onCreated={refresh} />
      <OrderDetailModal order={selected} onClose={() => setSelected(null)} onChanged={refresh} />
      <EditOrderModal
        key={editing?.id ?? 'none'}
        order={editing}
        productOptions={products}
        storeOptions={stores}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }}
      />
      <Sheet open={pilihKolom} onClose={() => setPilihKolom(false)} title="Kolom yang disalin">
        <Text style={styles.kolomHint}>
          Urutan kolom mengikuti daftar ini, bukan urutan Anda mencentang. Pilihan diingat di perangkat ini.
        </Text>
        {COPY_COLUMNS.map((c) => {
          const aktif = copyCols.includes(c.key);
          return (
            <Pressable
              key={c.key}
              onPress={() => toggleCopyCol(c.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: aktif }}
              style={({ pressed }) => [styles.kolomRow, pressed && { opacity: 0.85 }]}
            >
              <Text style={[styles.kolomBox, aktif && styles.kolomBoxAktif]}>{aktif ? '☑' : '☐'}</Text>
              <Text style={styles.kolomLabel}>{c.label}</Text>
            </Pressable>
          );
        })}
        <View style={styles.kolomActions}>
          <Button label="Kembalikan ke bawaan" variant="secondary" size="sm" onPress={resetCopyCols} />
          <Button label="Selesai" size="sm" onPress={() => setPilihKolom(false)} />
        </View>
      </Sheet>
    </ScrollView>
  );
}

/* ---------- Aksi order ---------- */

/** Penanda order sudah ikut tersalin ke papan klip. Glyph kecil di samping
 *  nomor order — hemat ruang pada tabel yang sudah padat kolom. */
function CopiedMark({ copiedAt }: { copiedAt: string | null }) {
  if (!copiedAt) return null;
  return (
    <Text
      style={dtStyles.copiedMark}
      accessibilityLabel={`Sudah disalin ${dateTime(copiedAt)}`}
    >
      ✓
    </Text>
  );
}

async function processPickup(o: OrderView, refresh: () => void) {
  // Order sudah punya bukti (barcode/foto) → proses langsung; belum → wajib lampirkan foto dulu.
  let photo: { uri: string; name: string; type: string } | undefined;
  if (!o.barcode_path && o.photo_count < 1) {
    photo = (await pickPhoto('Foto barcode pengambilan')) ?? undefined;
    if (!photo) return notify('Foto wajib', 'Lampirkan minimal 1 foto barcode pengambilan sebelum memproses pick up.');
  }
  try {
    await api.pickup(o.id, photo);
    notify('Berhasil', `${o.order_number} → Proses pick up`);
    refresh();
  } catch (e) {
    notify('Gagal', (e as Error).message);
  }
}

async function removeOrder(o: OrderView, refresh: () => void) {
  // Order yang sudah berjalan berisi bukti & riwayat, jadi konfirmasinya
  // menyebut statusnya agar admin sadar bukan sekadar menghapus entri baru.
  const pesan = o.status === 'data_masuk'
    ? `Hapus #${o.order_number}?`
    : `#${o.order_number} berstatus ${statusLabel[o.status] ?? o.status}. Menghapusnya ikut menghilangkan foto & riwayat order. Lanjutkan?`;
  confirmAsk('Hapus order', pesan, async () => {
    try { await api.deleteOwnOrder(o.id); refresh(); } catch (e) { notify('Gagal', (e as Error).message); }
  });
}

function EditOrderModal({ order, productOptions, storeOptions, onClose, onSaved }: {
  order: OrderView | null;
  productOptions: SelectOption[];
  storeOptions: SelectOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);
  // Produk & toko dipilih dari katalog (bukan teks bebas) agar nama selalu
  // cocok dengan master data — sama seperti form input order.
  const [product, setProduct] = useState(order?.product_name ?? '');
  const [store, setStore] = useState(order?.store_name ?? '');
  // Nomor pesanan disimpan utuh; memotong 'TRK-' saat memuat tanpa
  // mengembalikannya saat menyimpan akan diam-diam mengubah nomor order.
  const [orderNumber, setOrderNumber] = useState(order?.order_number ?? '');
  const [recipient, setRecipient] = useState(order?.recipient_name ?? '');
  const [method, setMethod] = useState<OrderView['pickup_method'] | ''>(order?.pickup_method ?? '');
  const [busy, setBusy] = useState(false);

  if (!order) return null;

  // Opsi memakai NAMA sebagai nilai: endpoint edit menerima product_name /
  // store_name, bukan id. Nama lama tetap disertakan bila katalog berubah.
  const byName = (opts: SelectOption[], current: string): SelectOption[] => {
    const names = opts.map((o) => ({ value: o.label, label: o.label, sub: o.sub }));
    return current && !names.some((n) => n.value === current)
      ? [...names, { value: current, label: current, sub: 'Tidak ada di katalog' }]
      : names;
  };

  const save = async () => {
    if (!product.trim() || !store.trim() || !orderNumber.trim() || !recipient.trim()) {
      notify('Lengkapi data', 'Produk, toko, nomor pesanan, dan penerima wajib diisi.');
      return;
    }
    if (!method) {
      notify('Lengkapi data', 'Metode pick up wajib dipilih.');
      return;
    }
    setBusy(true);
    try {
      await api.editOwnOrder(order.id, {
        product_name: product.trim(), store_name: store.trim(),
        order_number: orderNumber.trim(), recipient_name: recipient.trim(),
        pickup_method: method,
      });
      onSaved();
    } catch (e) {
      notify('Gagal', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={`Edit #${order.order_number}`} headGap={13}>
      <Select
        block
        field
        label="Nama produk"
        value={product}
        options={byName(productOptions, order.product_name)}
        onChange={setProduct}
        placeholder="Pilih produk"
      />
      <Select
        block
        field
        label="Nama toko"
        value={store}
        options={byName(storeOptions, order.store_name)}
        onChange={setStore}
        placeholder="Pilih toko"
      />
      <Field label="Nomor pesanan" value={orderNumber} onChangeText={setOrderNumber} hint="Harus unik — tidak boleh sama dengan order lain." />
      <Field label="Nama penerima" value={recipient} onChangeText={setRecipient} />
      <Select
        block
        field
        label="Metode pick up"
        value={method}
        options={pickupMethodOptions}
        onChange={(v) => setMethod(v as OrderView['pickup_method'])}
        placeholder="Pilih metode"
      />
      {!isAdmin && (
        <Text style={styles.ownerNote}>Hanya order milik Anda yang masih berstatus Data masuk yang dapat diubah.</Text>
      )}
      <Button label={busy ? 'Menyimpan…' : 'Simpan perubahan'} fullWidth disabled={busy} onPress={save} />
    </Sheet>
  );
}

const dtStyles = StyleSheet.create({
  // Angka tabular: 18 digit nomor pesanan berbaris rapi antar-baris tabel.
  orderCode: {
    fontSize: 13, fontWeight: '800', color: colors.primaryMuted,
    fontVariant: ['tabular-nums'], letterSpacing: 0.2,
  },
  orderCodeWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // Penanda sudah disalin: glyph kecil, warna hijau bukti agar sejalan dengan
  // penanda "sudah lengkap" di kolom Bukti.
  copiedMark: { fontSize: 11, fontWeight: '800', color: proofOkColor },
  actionCell: { alignItems: 'flex-end' },
  productName: { fontSize: 14, fontWeight: '700', color: colors.text },
  storeName: { fontSize: 12, color: colors.muted, marginTop: 3 },
  cellText: { fontSize: 14, color: colors.muted },
  person: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  personName: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  method: { fontSize: 12, fontWeight: '700', color: colors.muted, letterSpacing: 0.2 },
  photoOk: { fontSize: 13, fontWeight: '700', color: proofOkColor },
  photoEmpty: { fontSize: 13, color: colors.muted },
  timeText: { fontSize: 13, color: colors.muted },
});


const styles = StyleSheet.create({
  wrap: { flex: 1 },
  wrapContent: { paddingBottom: 120 },

  // Baris filter: kolom cari + tombol Filter (kriteria di panel yang bisa dibuka).
  filterBar: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6,
    marginHorizontal: 20, marginBottom: 6,
  },
  filterPanel: { marginBottom: 14 },
  filterBarNarrow: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch', gap: 8, marginBottom: 14 },
  searchBox: { flex: 1, minWidth: 0 },

  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 34, paddingHorizontal: 10, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  filterBtnActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterIcon: { fontSize: 13, color: colors.muted },
  filterIconActive: { color: colors.primary },
  filterText: { fontSize: 11, fontWeight: '700', color: colors.muted },
  filterTextActive: { color: colors.primary },
  filterBadge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  filterBadgeText: { fontSize: 10, fontWeight: '800', color: colors.onPrimary },

  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 34, paddingHorizontal: 8, borderRadius: radius.sm,
  },
  resetBtnNarrow: { alignSelf: 'flex-start' },
  resetIcon: { fontSize: 13, color: colors.primary },
  resetText: { fontSize: 11, fontWeight: '700', color: colors.primary },

  tableSection: { marginHorizontal: 20 },
  tableSectionNarrow: { marginHorizontal: 12 },
  tableIntro: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 10, paddingHorizontal: 2 },
  tableIntroNarrow: { flexWrap: 'wrap', gap: 8 },
  tableTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  tableHint: { fontSize: 11, color: colors.faint, marginTop: 3 },
  tableTools: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  // Pemilih kolom salin
  kolomBtn: {
    width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  kolomIcon: { fontSize: 14, color: colors.muted },
  kolomHint: { fontSize: 11, color: colors.muted, lineHeight: 16, marginBottom: 10 },
  kolomRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  kolomBox: { fontSize: 16, color: colors.muted },
  kolomBoxAktif: { color: colors.primary },
  kolomLabel: { fontSize: 13, color: colors.text },
  kolomActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  tableCount: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  errorBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 20, marginTop: 24, alignItems: 'center', gap: 8 },
  errorTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  errorText: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginBottom: 6 },

  // Tampilan kartu (layar sempit)
  cardList: { gap: 10 },
  cardActions: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  cardCount: { fontSize: 11, color: colors.muted, marginTop: 12, textAlign: 'center' },
  cardPager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  cardPagerText: { fontSize: 12, fontWeight: '700', color: colors.muted },

  // Napas di atas (memisahkan dari field terakhir) dan di bawah (sebelum tombol).
  // Ritme 13px seragam dengan jarak antar-field di atasnya.
  ownerNote: { fontSize: 10, color: colors.faint, lineHeight: 15, marginTop: 0, marginBottom: 13 },
});
