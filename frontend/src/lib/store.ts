// Mock store lokal — Fase 1 prototype.
// Meniru seluruh skema DB (users, products, marketplace_stores, orders,
// order_photos, order_events, app_settings) dengan logika bisnis sesuai PRD. Tanpa jaringan.
// Fase 3 akan mengganti file ini dengan pemanggilan API sungguhan.

export type Role = 'admin' | 'trader';
export type Status = 'data_masuk' | 'proses_pick_up' | 'selesai';
export type PickupMethod = 'zaydan_ambilan_gjm' | 'self_pick_up';

export interface User {
  id: string;
  username: string;
  password: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface MarketplaceStore {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Product {
  id: string;
  name: string;
  quota: number;
  is_active: boolean;
  used_quota: number;
  remaining_quota: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  product_name: string;
  store_name: string;
  recipient_name: string;
  pickup_method: PickupMethod;
  trader_id: string;
  product_id: string;
  store_id: string;
  status: Status;
  order_amount: number | null;
  note: string | null;
  is_problem: boolean;
  problem_reason: string | null;
  barcode_path: string | null;
  photo_count: number;
  created_at: string;
  picked_up_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface OrderPhoto {
  id: string;
  order_id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  source: string;
  uploaded_by: string;
  created_at: string;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  actor_id: string;
  event_type: string;
  from_status: Status | null;
  to_status: Status | null;
  note: string | null;
  created_at: string;
}

export interface AppSettings {
  pending_threshold_hours: number;
  min_photos: number;
  max_photos: number;
  max_file_mb: number;
}

const now = (msOffset = 0) => new Date(Date.now() + msOffset).toISOString();
const uid = () => Math.random().toString(36).slice(2, 10);
const hoursAgo = (h: number) => now(-h * 3600 * 1000);
const minutesAgo = (m: number) => now(-m * 60 * 1000);

function seed(): { users: User[]; orders: Order[]; photos: OrderPhoto[]; events: OrderEvent[]; products: Product[]; marketplaceStores: MarketplaceStore[]; settings: AppSettings } {
  const users: User[] = [
    { id: 'u-admin', username: 'admin', password: 'admin', display_name: 'Dimas Arya', role: 'admin', is_active: true, last_login_at: null, created_at: hoursAgo(200) },
    { id: 'u-nabila', username: 'nabila', password: 'trader', display_name: 'Nabila Putri', role: 'trader', is_active: true, last_login_at: null, created_at: hoursAgo(190) },
    { id: 'u-fajar', username: 'fajar', password: 'trader', display_name: 'Fajar Rahman', role: 'trader', is_active: true, last_login_at: null, created_at: hoursAgo(180) },
  ];

  const marketplaceStores: MarketplaceStore[] = [
    { id: 'st-tokopedia', name: 'Tokopedia', is_active: true },
    { id: 'st-shopee', name: 'Shopee', is_active: true },
    { id: 'st-lazada', name: 'Lazada', is_active: true },
    { id: 'st-blibli', name: 'Blibli', is_active: true },
  ];
  const storeOf = (store: string) => marketplaceStores.find((s) => s.name === store)!.id;

  const products: Product[] = [
    { id: 'p-keyboard', name: 'Wireless Keyboard K2', quota: 50, is_active: true, used_quota: 0, remaining_quota: 50, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-rak', name: 'Rak Serbaguna 4 Susun', quota: 50, is_active: true, used_quota: 0, remaining_quota: 50, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-mousepad', name: 'Mouse Pad XL', quota: 50, is_active: true, used_quota: 0, remaining_quota: 50, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-hdmi', name: 'HDMI Cable 2.1 3M', quota: 50, is_active: true, used_quota: 0, remaining_quota: 50, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-monitor', name: 'Monitor LG 24 inch', quota: 50, is_active: true, used_quota: 0, remaining_quota: 50, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-mekanik', name: 'Mechanical Keyboard V1', quota: 50, is_active: true, used_quota: 0, remaining_quota: 50, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-usbc', name: 'USB-C Hub 7 in 1', quota: 50, is_active: true, used_quota: 0, remaining_quota: 50, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-meja', name: 'Standing Desk Mat', quota: 50, is_active: true, used_quota: 0, remaining_quota: 50, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-webcam', name: 'Webcam Full HD', quota: 50, is_active: true, used_quota: 0, remaining_quota: 50, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-kursi', name: 'Kursi Kerja Ergonomis', quota: 50, is_active: true, used_quota: 0, remaining_quota: 50, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-limit', name: 'Produk Kuota Penuh', quota: 1, is_active: true, used_quota: 0, remaining_quota: 1, created_at: hoursAgo(120), updated_at: hoursAgo(120) },
  ];
  const productOf = (product: string) => products.find((p) => p.name === product)!.id;

  const mkOrder = (
    num: string, product: string, store: string, recipient: string,
    method: PickupMethod, trader: string, status: Status,
    extra: Partial<Order> & { minutes?: number },
  ): Order => ({
    id: uid(), order_number: `TRK-${num}`, product_name: product, store_name: store,
    recipient_name: recipient, pickup_method: method, trader_id: trader,
    product_id: productOf(product), store_id: storeOf(store),
    status, order_amount: null, note: null, is_problem: false,
    problem_reason: null, barcode_path: null, photo_count: 0, created_at: minutesAgo(extra.minutes ?? 10),
    picked_up_at: null, completed_at: null, updated_at: minutesAgo(extra.minutes ?? 10),
    ...extra,
  });

  const orders: Order[] = [
    mkOrder('240626-018', 'Wireless Keyboard K2', 'Tokopedia', 'Nadia Putri', 'zaydan_ambilan_gjm', 'u-nabila', 'data_masuk', { minutes: 14 }),
    mkOrder('240626-017', 'Rak Serbaguna 4 Susun', 'Shopee', 'Fajar Rahman', 'self_pick_up', 'u-fajar', 'data_masuk', { minutes: 32 }),
    mkOrder('240626-016', 'Mouse Pad XL', 'Lazada', 'Rina Sari', 'zaydan_ambilan_gjm', 'u-admin', 'data_masuk', { minutes: 48 }),
    mkOrder('240626-015', 'HDMI Cable 2.1 3M', 'Lazada', 'Dimas Arya', 'zaydan_ambilan_gjm', 'u-admin', 'data_masuk', { minutes: 68 }),
    mkOrder('240626-011', 'Monitor LG 24 inch', 'Blibli', 'Rizky Maulana', 'zaydan_ambilan_gjm', 'u-admin', 'proses_pick_up', { minutes: 102, picked_up_at: minutesAgo(58) }),
    mkOrder('240626-008', 'Mechanical Keyboard V1', 'Tokopedia', 'Bagus Santoso', 'self_pick_up', 'u-nabila', 'proses_pick_up', { minutes: 198, picked_up_at: minutesAgo(160), is_problem: true, problem_reason: 'Label barcode tertukar dengan pesanan lain.' }),
    mkOrder('240626-009', 'USB-C Hub 7 in 1', 'Tokopedia', 'Rina Sari', 'zaydan_ambilan_gjm', 'u-nabila', 'selesai', { minutes: 320, photo_count: 2, picked_up_at: minutesAgo(300), completed_at: minutesAgo(280), note: 'Barang dalam kondisi baik.' }),
    mkOrder('240626-006', 'Standing Desk Mat', 'Shopee', 'Fauzan Hadi', 'zaydan_ambilan_gjm', 'u-fajar', 'selesai', { minutes: 500, photo_count: 1, picked_up_at: minutesAgo(480), completed_at: minutesAgo(450), note: 'Sudah diambil.' }),
    mkOrder('240626-004', 'Webcam Full HD', 'Lazada', 'Dimas Arya', 'zaydan_ambilan_gjm', 'u-admin', 'selesai', { minutes: 600, photo_count: 1, picked_up_at: minutesAgo(570), completed_at: minutesAgo(540) }),
    mkOrder('240625-189', 'Kursi Kerja Ergonomis', 'Shopee', 'Fajar Rahman', 'self_pick_up', 'u-fajar', 'proses_pick_up', { minutes: 1180, picked_up_at: minutesAgo(1140), is_problem: true, problem_reason: 'Paket hilang di titik ambil.' }),
  ];

  const photos: OrderPhoto[] = [
    { id: uid(), order_id: orders[6].id, file_path: '/uploads/demo-1.jpg', file_name: 'bukti-1.jpg', mime_type: 'image/jpeg', file_size: 1042, source: 'kamera', uploaded_by: 'u-admin', created_at: minutesAgo(285) },
    { id: uid(), order_id: orders[6].id, file_path: '/uploads/demo-2.jpg', file_name: 'bukti-2.jpg', mime_type: 'image/jpeg', file_size: 987, source: 'berkas', uploaded_by: 'u-admin', created_at: minutesAgo(282) },
    { id: uid(), order_id: orders[7].id, file_path: '/uploads/demo-3.jpg', file_name: 'bukti-1.jpg', mime_type: 'image/jpeg', file_size: 1101, source: 'kamera', uploaded_by: 'u-admin', created_at: minutesAgo(455) },
  ];

  const events: OrderEvent[] = [];
  orders.forEach((o) => {
    events.push({ id: uid(), order_id: o.id, actor_id: o.trader_id, event_type: 'created', from_status: null, to_status: 'data_masuk', note: 'Order dibuat', created_at: o.created_at });
  });
  orders.filter((o) => o.picked_up_at).forEach((o) => {
    events.push({ id: uid(), order_id: o.id, actor_id: 'u-admin', event_type: 'picked_up', from_status: 'data_masuk', to_status: 'proses_pick_up', note: 'Scan nomor pesanan', created_at: o.picked_up_at! });
  });
  orders.filter((o) => o.completed_at).forEach((o) => {
    events.push({ id: uid(), order_id: o.id, actor_id: 'u-admin', event_type: 'completed', from_status: 'proses_pick_up', to_status: 'selesai', note: o.note, created_at: o.completed_at! });
  });
  orders.filter((o) => o.is_problem).forEach((o) => {
    events.push({ id: uid(), order_id: o.id, actor_id: 'u-admin', event_type: 'problem', from_status: null, to_status: null, note: o.problem_reason, created_at: o.updated_at });
  });

  const settings: AppSettings = { pending_threshold_hours: 3, min_photos: 1, max_photos: 3, max_file_mb: 20 };

  return { users, orders, photos, events, products, marketplaceStores, settings };
}

const db = seed();
let currentUserId: string | null = null;

const listeners = new Set<() => void>();
export function subscribeChanges(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emitChange() {
  listeners.forEach((fn) => fn());
}
const delay = () => new Promise((r) => setTimeout(r, 120));
const authFail = (): never => {
  throw new Error('UNAUTHORIZED');
};

function findOrder(id: string) {
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new Error('Order tidak ditemukan');
  return o;
}
function userName(id: string) {
  return db.users.find((u) => u.id === id)?.display_name ?? '—';
}
export interface OrderView extends Order {
  trader_name: string;
  product_label: string;
  is_pending: boolean;
}

function withMeta(o: Order): OrderView {
  const pendingHours = (Date.now() - new Date(o.updated_at).getTime()) / 3600000;
  const pending = (o.status === 'data_masuk' || o.status === 'proses_pick_up') &&
    pendingHours >= db.settings.pending_threshold_hours;
  return { ...o, trader_name: userName(o.trader_id), product_label: `${o.product_name} · ${o.store_name}`, is_pending: pending };
}

function mockPickup(o: Order, hasFile?: boolean) {
  o.status = 'proses_pick_up';
  o.picked_up_at = now();
  o.updated_at = now();
  if (hasFile) {
    o.photo_count += 1;
    db.photos.push({ id: uid(), order_id: o.id, file_path: `/uploads/pickup-${Date.now()}.jpg`, file_name: 'barcode-pengambilan.jpg', mime_type: 'image/jpeg', file_size: 1024, source: 'pickup', uploaded_by: currentUserId!, created_at: now() });
  }
  db.events.push({ id: uid(), order_id: o.id, actor_id: currentUserId!, event_type: 'picked_up', from_status: 'data_masuk', to_status: 'proses_pick_up', note: 'Proses pick up', created_at: now() });
}

function applyQuery(list: Order[], query: Record<string, string>) {
  let out = [...list];
  if (query.q) {
    const q = query.q.toLowerCase();
    out = out.filter((o) =>
      o.order_number.toLowerCase().includes(q) ||
      o.product_name.toLowerCase().includes(q) ||
      o.recipient_name.toLowerCase().includes(q),
    );
  }
  if (query.status) out = out.filter((o) => o.status === query.status);
  if (query.pickup_method) out = out.filter((o) => o.pickup_method === query.pickup_method);
  if (query.trader) out = out.filter((o) => o.trader_id === query.trader);
  if (query.from) out = out.filter((o) => o.created_at >= query.from!);
  if (query.to) out = out.filter((o) => o.created_at <= query.to!);
  out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return out;
}

export const mock = {
  login: async (username: string, password: string) => {
    await delay();
    const u = db.users.find((x) => x.username === username.toLowerCase());
    if (!u || u.password !== password) throw new Error('UNAUTHORIZED');
    if (!u.is_active) throw new Error('UNAUTHORIZED');
    currentUserId = u.id;
    u.last_login_at = now();
    return { token: 'mock-jwt', user: { id: u.id, username: u.username, display_name: u.display_name, role: u.role } };
  },
  logout: async () => {
    currentUserId = null;
  },

  listOrders: async (query: Record<string, string> = {}) => {
    await delay();
    const rows = applyQuery(db.orders, query).map(withMeta);
    return { items: rows, total: rows.length, page: Number(query.page ?? 1) };
  },

  createOrder: async (input: Partial<Order>) => {
    await delay();
    const trader = input.trader_id ?? currentUserId;
    if (!trader) throw new Error('UNAUTHORIZED');
    if (db.orders.some((o) => o.order_number === input.order_number)) {
      const dup = db.orders.find((o) => o.order_number === input.order_number)!;
      throw new Error(`Nomor pesanan ${input.order_number} sudah pernah diinput. Order #${dup.order_number} dari ${userName(dup.trader_id)}.`);
    }
    // Rebutan kuota per tipe barang (lintas toko): hitung order vs kuota produk.
    const p = db.products.find((m) => m.id === input.product_id);
    if (!p) throw new Error('Produk tidak ditemukan.');
    if (!p.is_active) throw new Error(`Produk ${p.name} sedang nonaktif.`);
    const st = db.marketplaceStores.find((s) => s.id === input.store_id);
    if (!st) throw new Error('Toko marketplace tidak ditemukan.');
    if (!st.is_active) throw new Error(`Toko ${st.name} sedang nonaktif.`);
    const used = db.orders.filter((o) => o.product_id === p.id).length;
    if (used >= p.quota) throw new Error(`Kuota produk ${p.name} sudah habis!`);
    const o: Order = {
      id: uid(), order_number: input.order_number!, product_name: p.name,
      store_name: st.name, recipient_name: input.recipient_name!,
      pickup_method: input.pickup_method!, trader_id: trader, product_id: p.id, store_id: st.id,
      status: 'data_masuk', order_amount: input.order_amount ?? null,
      note: null, is_problem: false, problem_reason: null, barcode_path: null, photo_count: 0,
      created_at: now(), picked_up_at: null, completed_at: null, updated_at: now(),
    };
    db.orders.unshift(o);
    db.events.push({ id: uid(), order_id: o.id, actor_id: trader, event_type: 'created', from_status: null, to_status: 'data_masuk', note: 'Order dibuat', created_at: o.created_at });
    emitChange();
    return withMeta(o);
  },

  updateStatus: async (id: string, to_status: Status) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    const o = findOrder(id);
    if (to_status === 'proses_pick_up') throw new Error('Foto barcode pengambilan wajib diunggah untuk memproses pick up.');
    if (to_status === 'selesai' && o.photo_count < db.settings.min_photos) {
      throw new Error(`Minimal ${db.settings.min_photos} foto bukti sebelum order selesai.`);
    }
    const from = o.status;
    o.status = to_status;
    o.updated_at = now();
    if (to_status === 'selesai') o.completed_at = now();
    if (to_status === 'data_masuk') { o.picked_up_at = null; o.completed_at = null; }
    db.events.push({ id: uid(), order_id: id, actor_id: currentUserId!, event_type: to_status === 'selesai' ? 'completed' : 'status', from_status: from, to_status, note: null, created_at: now() });
    emitChange();
    return withMeta(o);
  },

  scan: async (code: string, _file?: unknown) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    const normalized = code.trim();
    const o = db.orders.find((x) => x.order_number === normalized);
    if (!o) return null;
    if (o.status !== 'data_masuk') return withMeta(o);
    if (!_file && !o.barcode_path && o.photo_count < 1) throw new Error('Foto barcode pengambilan wajib diunggah untuk memproses pick up.');
    mockPickup(o, !!_file);
    emitChange();
    return withMeta(o);
  },

  pickup: async (id: string, _file?: unknown) => {
    await delay();
    const o = findOrder(id);
    // Pemilik order (trader) atau admin boleh memproses; bukti wajib bila belum ada.
    if (o.trader_id !== currentUserId && currentUserId !== 'u-admin') authFail();
    if (o.status !== 'data_masuk') throw new Error('Order ini sudah diproses sebelumnya.');
    if (!_file && !o.barcode_path && o.photo_count < 1) throw new Error('Foto barcode pengambilan wajib diunggah untuk memproses pick up.');
    mockPickup(o, !!_file);
    emitChange();
    return withMeta(o);
  },

  attachBarcode: async (id: string, path: string | { uri?: string }) => {
    await delay();
    const o = findOrder(id);
    if (o.trader_id !== currentUserId && currentUserId !== 'u-admin') authFail();
    if (o.status !== 'data_masuk') throw new Error('Barcode hanya bisa dilampirkan saat status Data masuk.');
    // remote.attachBarcode mengirim objek berkas {uri,name,type} — mock menyimpan path demo.
    o.barcode_path = typeof path === 'string' ? path : `/uploads/barcode-${Date.now()}.jpg`;
    o.updated_at = now();
    emitChange();
    return withMeta(o);
  },

  detail: async (id: string) => {
    await delay();
    const o = findOrder(id);
    const photos = db.photos.filter((p) => p.order_id === id);
    const events = db.events.filter((e) => e.order_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { ...withMeta(o), photos: photos.map((p) => ({ id: p.id, file_path: p.file_path, source: p.source })), events: events.map((e) => ({ ...e, actor_name: userName(e.actor_id) })) };
  },

  uploadPhoto: async (orderId: string) => {
    await delay();
    const o = findOrder(orderId);
    // Pemilik order (trader) atau admin boleh mengunggah bukti.
    if (o.trader_id !== currentUserId && currentUserId !== 'u-admin') authFail();
    if (o.status === 'selesai') throw new Error('Order selesai terkunci. Buka kembali order terlebih dahulu.');
    if (o.photo_count >= db.settings.max_photos) throw new Error(`Maksimal ${db.settings.max_photos} foto per order.`);
    o.photo_count += 1;
    o.updated_at = now();
    db.photos.push({ id: uid(), order_id: orderId, file_path: `/uploads/demo-${orderId.slice(0, 4)}-${o.photo_count}.jpg`, file_name: `bukti-${o.photo_count}.jpg`, mime_type: 'image/jpeg', file_size: 1024, source: 'kamera', uploaded_by: currentUserId!, created_at: now() });
    emitChange();
    return withMeta(o);
  },

  deletePhoto: async (orderId: string, photoId: string) => {
    await delay();
    const o = findOrder(orderId);
    // Pemilik order (trader) atau admin boleh menghapus bukti.
    if (o.trader_id !== currentUserId && currentUserId !== 'u-admin') authFail();
    if (o.status === 'selesai') throw new Error('Foto bukti order selesai tidak dapat dihapus. Buka kembali order terlebih dahulu.');
    const idx = db.photos.findIndex((p) => p.id === photoId && p.order_id === orderId);
    if (idx >= 0) db.photos.splice(idx, 1);
    if (o.photo_count > 0) o.photo_count -= 1;
    o.updated_at = now();
    emitChange();
    return withMeta(o);
  },

  completeOrder: async (id: string, note: string) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    const o = findOrder(id);
    if (o.photo_count < db.settings.min_photos) throw new Error(`Minimal ${db.settings.min_photos} foto bukti wajib diunggah.`);
    const from = o.status;
    o.status = 'selesai';
    o.note = note;
    o.completed_at = now();
    o.updated_at = now();
    db.events.push({ id: uid(), order_id: id, actor_id: currentUserId!, event_type: 'completed', from_status: from, to_status: 'selesai', note, created_at: now() });
    emitChange();
    return withMeta(o);
  },

  markProblem: async (id: string, reason: string) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    const o = findOrder(id);
    o.is_problem = true;
    o.problem_reason = reason;
    o.updated_at = now();
    db.events.push({ id: uid(), order_id: id, actor_id: currentUserId!, event_type: 'problem', from_status: null, to_status: null, note: reason, created_at: now() });
    emitChange();
    return withMeta(o);
  },

  reopen: async (id: string) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    const o = findOrder(id);
    if (o.status !== 'selesai') throw new Error('Hanya order Selesai yang dapat dibuka kembali.');
    const from = o.status;
    o.status = 'proses_pick_up';
    o.completed_at = null;
    o.updated_at = now();
    db.events.push({ id: uid(), order_id: id, actor_id: currentUserId!, event_type: 'reopened', from_status: from, to_status: 'proses_pick_up', note: 'Order dibuka kembali oleh admin', created_at: now() });
    emitChange();
    return withMeta(o);
  },

  deleteOwnOrder: async (id: string) => {
    await delay();
    const o = findOrder(id);
    if (o.trader_id !== currentUserId) authFail();
    if (o.status !== 'data_masuk') throw new Error('Order hanya bisa dihapus saat status Data masuk.');
    db.orders.splice(db.orders.indexOf(o), 1);
    emitChange();
  },

  editOwnOrder: async (id: string, patch: Partial<Order>) => {
    await delay();
    const o = findOrder(id);
    if (o.trader_id !== currentUserId) authFail();
    if (o.status !== 'data_masuk') throw new Error('Order hanya bisa diubah saat status Data masuk.');
    if (patch.order_number && db.orders.some((x) => x.order_number === patch.order_number && x.id !== id)) {
      throw new Error(`Nomor pesanan ${patch.order_number} sudah dipakai order lain.`);
    }
    Object.assign(o, patch, { updated_at: now() });
    emitChange();
    return withMeta(o);
  },

  reports: async (range: string) => {
    await delay();
    let from = '';
    const d = new Date();
    if (range === 'hari_ini') from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    if (range === '7_hari') from = new Date(Date.now() - 7 * 864e5).toISOString();
    if (range === 'bulan_ini') from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    const inRange = (o: Order) => !from || o.created_at >= from;

    const list = db.orders.filter(inRange);
    const totals = {
      total: list.length,
      data_masuk: list.filter((o) => o.status === 'data_masuk').length,
      proses_pick_up: list.filter((o) => o.status === 'proses_pick_up').length,
      selesai: list.filter((o) => o.status === 'selesai').length,
      bermasalah: list.filter((o) => o.is_problem).length,
    };

    const byTrader = new Map<string, { trader: string; total: number; selesai: number }>();
    list.forEach((o) => {
      const t = byTrader.get(o.trader_id) ?? { trader: userName(o.trader_id), total: 0, selesai: 0 };
      t.total += 1;
      if (o.status === 'selesai') t.selesai += 1;
      byTrader.set(o.trader_id, t);
    });
    const perTrader = [...byTrader.values()].sort((a, b) => b.total - a.total).map((t) => ({ ...t, belum_selesai: t.total - t.selesai }));

    const byProduk = new Map<string, { product_name: string; quota: number; used_quota: number; amount: number }>();
    list.forEach((o) => {
      const p = db.products.find((x) => x.id === o.product_id);
      if (!p) return;
      const r = byProduk.get(p.id) ?? { product_name: p.name, quota: p.quota, used_quota: 0, amount: 0 };
      r.used_quota += 1;
      r.amount += o.order_amount ?? 0;
      byProduk.set(p.id, r);
    });
    const perProduk = [...byProduk.values()].map((r) => ({ ...r, remaining_quota: Math.max(0, r.quota - r.used_quota) }));

    const delayed = db.orders
      .filter((o) => o.is_problem || withMeta(o).is_pending)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      .map((o) => {
        const hours = (Date.now() - new Date(o.updated_at).getTime()) / 3600000;
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return { order_number: o.order_number, product_name: o.product_name, trader: userName(o.trader_id), duration: `${h}j ${m}m`, is_problem: o.is_problem };
      });

    return { totals, perTrader, perProduk, delayed };
  },

  listProducts: async () => {
    await delay();
    // Dibaca oleh trader dan admin; manajemen (tambah/ubah kuota/nonaktifkan) hanya admin.
    const withQuota = () => db.products.map((p) => {
      const used_quota = db.orders.filter((o) => o.product_id === p.id).length;
      return { ...p, used_quota, remaining_quota: Math.max(0, p.quota - used_quota) };
    });
    return withQuota();
  },
  createProduct: async (input: { name: string; quota: number }) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    const name = input.name.trim();
    if (!name) throw new Error('Nama produk wajib diisi.');
    if (db.products.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Nama produk sudah terdaftar.');
    }
    db.products.push({
      id: uid(), name, quota: Math.max(0, Math.floor(input.quota)), is_active: true,
      used_quota: 0, remaining_quota: Math.max(0, Math.floor(input.quota)),
      created_at: now(), updated_at: now(),
    });
    emitChange();
    return db.products.map((p) => {
      const used_quota = db.orders.filter((o) => o.product_id === p.id).length;
      return { ...p, used_quota, remaining_quota: Math.max(0, p.quota - used_quota) };
    });
  },
  deleteProduct: async (id: string) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    const used = db.orders.filter((o) => o.product_id === id).length;
    if (used > 0) throw new Error('Produk yang sudah dipakai order tidak dapat dihapus. Nonaktifkan bila tidak digunakan.');
    const index = db.products.findIndex((p) => p.id === id);
    if (index < 0) throw new Error('Produk tidak ditemukan.');
    db.products.splice(index, 1);
    emitChange();
    return db.products.map((p) => {
      const used_quota = db.orders.filter((o) => o.product_id === p.id).length;
      return { ...p, used_quota, remaining_quota: Math.max(0, p.quota - used_quota) };
    });
  },
  addProductQuota: async (id: string, amount: number) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) throw new Error('Tambahan kuota tidak valid.');
    const p = db.products.find((x) => x.id === id);
    if (!p) throw new Error('Produk tidak ditemukan.');
    p.quota += amount;
    p.updated_at = now();
    emitChange();
    return db.products.map((x) => {
      const used_quota = db.orders.filter((o) => o.product_id === x.id).length;
      return { ...x, used_quota, remaining_quota: Math.max(0, x.quota - used_quota) };
    });
  },
  resetProductQuota: async (id: string) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    const p = db.products.find((x) => x.id === id);
    if (!p) throw new Error('Produk tidak ditemukan.');
    p.quota = db.orders.filter((o) => o.product_id === id).length;
    p.updated_at = now();
    emitChange();
    return db.products.map((x) => {
      const used_quota = db.orders.filter((o) => o.product_id === x.id).length;
      return { ...x, used_quota, remaining_quota: Math.max(0, x.quota - used_quota) };
    });
  },
  updateProduct: async (id: string, patch: Partial<Product>) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    const p = db.products.find((x) => x.id === id);
    if (!p) throw new Error('Produk tidak ditemukan.');
    if (patch.quota !== undefined) {
      const used = db.orders.filter((o) => o.product_id === id).length;
      if (patch.quota < used) throw new Error('Kuota tidak boleh lebih kecil dari jumlah order yang sudah ada.');
      p.quota = patch.quota;
    }
    if (patch.name) p.name = patch.name;
    if (patch.is_active !== undefined) p.is_active = patch.is_active;
    p.updated_at = now();
    emitChange();
    return db.products.map((x) => {
      const used_quota = db.orders.filter((o) => o.product_id === x.id).length;
      return { ...x, used_quota, remaining_quota: Math.max(0, x.quota - used_quota) };
    });
  },

  listMarketplaceStores: async () => {
    await delay();
    return db.marketplaceStores.filter((s) => s.is_active);
  },
  createMarketplaceStore: async (name: string) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    const clean = name.trim();
    if (!clean) throw new Error('Nama toko wajib diisi.');
    if (db.marketplaceStores.some((s) => s.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error('Nama toko sudah terdaftar.');
    }
    db.marketplaceStores.push({ id: uid(), name: clean, is_active: true });
    emitChange();
    return db.marketplaceStores.filter((s) => s.is_active);
  },
  deleteMarketplaceStore: async (id: string) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    const s = db.marketplaceStores.find((x) => x.id === id && x.is_active);
    if (!s) throw new Error('Toko marketplace tidak ditemukan.');
    if (db.orders.some((o) => o.store_id === id)) throw new Error('Toko masih dipakai order. Nonaktifkan bila tidak digunakan.');
    s.is_active = false;
    emitChange();
    return db.marketplaceStores.filter((x) => x.is_active);
  },

  getSettings: async () => {
    await delay();
    return { ...db.settings };
  },
  saveSettings: async (patch: Partial<AppSettings>) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    if (patch.min_photos !== undefined && patch.min_photos < 1) throw new Error('Jumlah minimal foto tidak boleh nol.');
    db.settings.min_photos = patch.min_photos ?? db.settings.min_photos;
    db.settings.max_photos = patch.max_photos ?? db.settings.max_photos;
    db.settings.max_file_mb = patch.max_file_mb ?? db.settings.max_file_mb;
    db.settings.pending_threshold_hours = patch.pending_threshold_hours ?? db.settings.pending_threshold_hours;
    emitChange();
    return { ...db.settings };
  },

  listUsers: async () => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    return db.users.map(({ password: _pw, ...u }) => ({ ...u, order_count: db.orders.filter((o) => o.trader_id === u.id).length }));
  },
  createUser: async (input: { username: string; password: string; display_name: string; role: Role }) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    if (db.users.some((u) => u.username === input.username)) throw new Error('Username sudah dipakai.');
    db.users.push({ id: uid(), username: input.username, password: input.password, display_name: input.display_name, role: input.role, is_active: true, last_login_at: null, created_at: now() });
    emitChange();
  },
  updateUser: async (id: string, patch: Partial<User>) => {
    await delay();
    if (currentUserId !== 'u-admin') authFail();
    const u = db.users.find((x) => x.id === id);
    if (!u) throw new Error('Pengguna tidak ditemukan.');
    if (id === currentUserId && patch.role && patch.role !== u.role) throw new Error('Anda tidak dapat mengubah role diri sendiri.');
    const admins = db.users.filter((x) => x.role === 'admin' && x.is_active);
    if (patch.is_active === false && u.role === 'admin' && admins.length <= 1) throw new Error('Akun admin terakhir tidak dapat dinonaktifkan.');
    Object.assign(u, patch, { updated_at: now() });
    emitChange();
  },

  getSession: async () => {
    if (!currentUserId) return null;
    const u = db.users.find((x) => x.id === currentUserId);
    if (!u || !u.is_active) return null;
    return { id: u.id, username: u.username, display_name: u.display_name, role: u.role };
  },
  setSessionUser: async (id: string) => {
    currentUserId = id;
  },
};

export type MockApi = typeof mock;
