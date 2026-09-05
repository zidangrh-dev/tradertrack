// Repo memori (dev default, dipakai bila DATABASE_URL tidak di-set).
// Meniru skema dan perilaku PostgreSQL PRD agar server bisa dijalankan tanpa
// Docker/Postgres. Produksi memakai src/pg.mjs (PostgreSQL asli).
// ponytail: hapus repo ini setelah CI/pengetesan selalu memakai Postgres.

import { randomUUID as uid } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { rangeToFrom } from './ranges.mjs';

const hash = (pw) => bcrypt.hashSync(pw, 8);

const now = (msOffset = 0) => new Date(Date.now() + msOffset).toISOString();
const hoursAgo = (h) => now(-h * 3600 * 1000);
const minutesAgo = (m) => now(-m * 60 * 1000);

const db = seed();

export const settings = () => ({ ...db.settings });
export const listMarketplaceStores = () => db.marketplaceStores.filter((s) => s.is_active).sort((a, b) => a.name.localeCompare(b.name));
export function createMarketplaceStore(name) {
  const clean = String(name ?? '').trim();
  if (!clean || clean.length > 100) throw new Error('Nama toko wajib diisi dan maksimal 100 karakter.');
  if (db.marketplaceStores.some((s) => s.name.toLowerCase() === clean.toLowerCase())) throw new Error('Nama toko sudah terdaftar.');
  db.marketplaceStores.push({ id: uid(), name: clean, is_active: true, created_at: now(), updated_at: now() });
  return listMarketplaceStores();
}
export function deleteMarketplaceStore(id) {
  const s = db.marketplaceStores.find((x) => x.id === id && x.is_active);
  if (!s) throw new Error('Toko marketplace tidak ditemukan.');
  if (db.orders.some((o) => o.store_id === s.id)) throw new Error('Toko masih dipakai order. Nonaktifkan bila tidak digunakan.');
  s.is_active = false;
  s.updated_at = now();
  return listMarketplaceStores();
}

export function settingsPatch(patch) {
  if (patch.min_photos !== undefined && Number(patch.min_photos) < 1) {
    throw new Error('Jumlah minimal foto tidak boleh nol.');
  }
  Object.assign(db.settings, {
    pending_threshold_hours: Number(patch.pending_threshold_hours ?? db.settings.pending_threshold_hours),
    min_photos: Number(patch.min_photos ?? db.settings.min_photos),
    max_photos: Number(patch.max_photos ?? db.settings.max_photos),
    max_file_mb: Number(patch.max_file_mb ?? db.settings.max_file_mb),
  });
  return { ...db.settings };
}

export const users = () => db.users.map(({ password_hash: _p, ...u }) => ({ ...u, order_count: countOrdersOf(u.id) }));
export function userByUsername(username) {
  return db.users.find((u) => u.username === username.toLowerCase());
}
export function userById(id) {
  return db.users.find((u) => u.id === id);
}
export function setLastLogin(id) {
  const u = userById(id);
  if (u) u.last_login_at = now();
}
export function activeAdminCount() {
  return db.users.filter((u) => u.role === 'admin' && u.is_active).length;
}
export function createUser(input) {
  if (db.users.some((u) => u.username === input.username.toLowerCase())) throw new Error('Username sudah dipakai.');
  const u = {
    id: uid(), username: input.username.toLowerCase(), password_hash: input.password_hash,
    display_name: input.display_name, role: input.role, is_active: true,
    last_login_at: null, created_at: now(), updated_at: now(),
  };
  db.users.push(u);
  return { ...u, password_hash: undefined };
}
export function updateUser(id, patch) {
  const u = db.users.find((x) => x.id === id);
  if (!u) throw new Error('Pengguna tidak ditemukan.');
  if (patch.role) u.role = patch.role;
  if (patch.display_name) u.display_name = patch.display_name;
  if (patch.password_hash) u.password_hash = patch.password_hash;
  if (patch.is_active !== undefined) u.is_active = patch.is_active;
  u.updated_at = now();
}

export function deleteUser(id) {
  const u = db.users.find((x) => x.id === id);
  if (!u) throw new Error('Pengguna tidak ditemukan.');
  const riwayat =
    db.orders.some((o) => o.trader_id === id) ||
    db.photos.some((p) => p.uploaded_by === id) ||
    db.events.some((e) => e.actor_id === id);
  if (riwayat) throw new Error('Akun masih memiliki riwayat order/foto. Nonaktifkan bila tidak dipakai.');
  db.users.splice(db.users.indexOf(u), 1);
}

// ---------- Katalog: produk (tipe barang, kuota lintas toko) + toko marketplace ----------

function usedQuotaOf(productId) {
  return db.orders.filter((o) => o.product_id === productId).length;
}

export const listProducts = () =>
  db.products.map((p) => {
    const used = usedQuotaOf(p.id);
    return { ...p, used_quota: used, remaining_quota: Math.max(0, p.quota - used) };
  });

export function createProduct(input) {
  const name = String(input.name ?? '').trim();
  if (!name || name.length > 150) throw new Error('Nama produk wajib diisi dan maksimal 150 karakter.');
  if (db.products.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('Nama produk sudah terdaftar.');
  }
  db.products.push({
    id: uid(), name,
    quota: Math.max(0, Math.floor(Number(input.quota) || 0)),
    is_active: true, created_at: now(), updated_at: now(),
  });
  return listProducts();
}

export function deleteProduct(id) {
  const p = findProduct(id);
  const orders = db.orders.filter((o) => o.product_id === id);
  const active = orders.some((o) => o.status !== 'selesai');
  if (active) throw new Error('Produk masih memiliki order aktif. Selesaikan semua order sebelum menghapus produk.');
  if (orders.length > 0) {
    // Semua order sudah selesai: arsipkan lewat nonaktif (hapus fisik tidak mungkin karena order merujuk).
    p.is_active = false;
    p.updated_at = now();
  } else {
    db.products.splice(db.products.indexOf(p), 1);
  }
  return listProducts();
}

export function addProductQuota(id, amount) {
  const p = findProduct(id);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) throw new Error('Tambahan kuota tidak valid.');
  if (p.quota > Number.MAX_SAFE_INTEGER - amount) throw new Error('Total kuota melebihi batas aman.');
  p.quota += amount;
  p.updated_at = now();
  return listProducts();
}

export function resetProductQuota(id) {
  const p = findProduct(id);
  p.quota = usedQuotaOf(id);
  p.updated_at = now();
  return listProducts();
}

export function updateProduct(id, patch) {
  const p = db.products.find((x) => x.id === id);
  if (!p) throw new Error('Produk tidak ditemukan.');
  if (patch.name && db.products.some((x) => x.id !== id && x.name.toLowerCase() === patch.name.toLowerCase())) {
    throw new Error('Nama produk sudah terdaftar.');
  }
  if (patch.quota !== undefined) {
    const q = Math.max(0, Math.floor(Number(patch.quota) || 0));
    if (q < usedQuotaOf(id)) throw new Error('Kuota tidak boleh lebih kecil dari jumlah order yang sudah ada.');
    p.quota = q;
  }
  if (patch.name) p.name = patch.name;
  if (patch.is_active !== undefined) p.is_active = patch.is_active;
  p.updated_at = now();
  return listProducts();
}

function findProduct(id) {
  const p = db.products.find((x) => x.id === id);
  if (!p) throw new Error('Produk tidak ditemukan.');
  return p;
}

// ---------- Orders ----------

function countOrdersOf(traderId) {
  return db.orders.filter((o) => o.trader_id === traderId).length;
}
function userName(id) {
  return db.users.find((u) => u.id === id)?.display_name ?? '—';
}
function productLabel(o) {
  return `${o.product_name} · ${o.store_name}`;
}
function findOrder(id) {
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new Error('Order tidak ditemukan');
  return o;
}
export function orderByNumber(num) {
  return db.orders.find((o) => o.order_number === num) ?? null;
}
function withMeta(o) {
  const ageHours = (Date.now() - new Date(o.updated_at).getTime()) / 3600000;
  const pending = (o.status === 'data_masuk' || o.status === 'proses_pick_up') &&
    ageHours >= db.settings.pending_threshold_hours;
  return { ...o, trader_name: userName(o.trader_id), product_label: productLabel(o), is_pending: pending };
}
function pushEvent(orderId, actorId, eventType, from, to, note) {
  db.events.push({ id: uid(), order_id: orderId, actor_id: actorId, event_type: eventType, from_status: from, to_status: to, note: note ?? null, created_at: now() });
}

export function listOrders(query = {}) {
  let out = [...db.orders];
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
  if (query.from) out = out.filter((o) => o.created_at >= query.from);
  if (query.to) out = out.filter((o) => o.created_at <= query.to);
  out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const total = out.length;
  const perPage = Math.max(1, Math.min(200, Number(query.per_page ?? 50)));
  const page = Math.max(1, Number(query.page ?? 1));
  const start = (page - 1) * perPage;
  return { items: out.slice(start, start + perPage).map(withMeta), total, page, per_page: perPage };
}

export function createOrder(input, actorId) {
  if (orderByNumber(input.order_number)) {
    const dup = orderByNumber(input.order_number);
    throw new Error(`Nomor pesanan ${input.order_number} sudah pernah diinput. Order #${dup.order_number} dari ${userName(dup.trader_id)}.`);
  }
  // Rebutan kuota per tipe barang (lintas toko): produk aktif + sisa kuota > 0.
  const p = db.products.find((x) => x.id === input.product_id);
  if (!p) throw new Error('Produk tidak ditemukan.');
  if (!p.is_active) throw new Error(`Produk ${p.name} sedang nonaktif.`);
  const st = db.marketplaceStores.find((x) => x.id === input.store_id);
  if (!st) throw new Error('Toko marketplace tidak ditemukan.');
  if (!st.is_active) throw new Error(`Toko ${st.name} sedang nonaktif.`);
  if (usedQuotaOf(p.id) >= p.quota) {
    throw new Error(`Kuota produk ${p.name} sudah habis!`);
  }
  const o = {
    id: uid(), order_number: input.order_number, product_name: p.name,
    store_name: st.name, recipient_name: input.recipient_name,
    pickup_method: input.pickup_method, trader_id: input.trader_id ?? actorId,
    product_id: p.id, store_id: st.id, status: 'data_masuk',
    order_amount: input.order_amount ?? null, note: null, is_problem: false,
    problem_reason: null, barcode_path: null, photo_count: 0, created_at: now(),
    picked_up_at: null, completed_at: null, updated_at: now(),
  };
  db.orders.unshift(o);
  pushEvent(o.id, actorId, 'created', null, 'data_masuk', 'Order dibuat');
  return withMeta(o);
}

export const getOrder = (id) => withMeta(findOrder(id));

function applyPickup(o, actorId, file, note) {
  // Foto baru opsional bila order sudah punya barcode pengambilan terpasang ATAU
  // sudah ada minimal satu foto bukti (diupload lewat mana pun).
  if (!file && !o.barcode_path && o.photo_count < 1) {
    throw new Error('Foto barcode pengambilan wajib diunggah untuk memproses pick up.');
  }
  o.status = 'proses_pick_up';
  o.picked_up_at = now();
  o.updated_at = now();
  if (file) {
    o.photo_count += 1;
    db.photos.push({
      id: uid(), order_id: o.id,
      file_path: `/uploads/${file.filename}`,
      file_name: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
      source: 'pickup', uploaded_by: actorId, created_at: now(),
    });
  }
  pushEvent(o.id, actorId, 'picked_up', 'data_masuk', 'proses_pick_up', note);
}

export function updateStatus(id, to, actorId) {
  const o = findOrder(id);
  if (to === 'proses_pick_up') {
    // Jalur proses pick up mewajibkan foto barcode — pakai POST /orders/:id/pickup.
    throw new Error('Foto barcode pengambilan wajib diunggah untuk memproses pick up.');
  }
  if (to === 'selesai' && o.photo_count < db.settings.min_photos) {
    throw new Error(`Minimal ${db.settings.min_photos} foto bukti sebelum order selesai.`);
  }
  const from = o.status;
  o.status = to;
  o.updated_at = now();
  if (to === 'selesai') o.completed_at = now();
  if (to === 'data_masuk') { o.picked_up_at = null; o.completed_at = null; }
  pushEvent(id, actorId, to === 'selesai' ? 'completed' : 'status', from, to, null);
  return withMeta(o);
}

export function scan(code, actorId, file = null) {
  const normalized = String(code).trim();
  const o = db.orders.find((x) => x.order_number === normalized);
  if (!o) return null;
  if (o.status !== 'data_masuk') return withMeta(o);
  applyPickup(o, actorId, file, 'Scan nomor pesanan');
  return withMeta(o);
}

export function pickupOrder(id, actorId, file = null) {
  const o = findOrder(id);
  if (o.status !== 'data_masuk') throw new Error('Order ini sudah diproses sebelumnya.');
  applyPickup(o, actorId, file, 'Proses pick up');
  return withMeta(o);
}

export function attachBarcode(id, path) {
  const o = findOrder(id);
  o.barcode_path = path;
  o.updated_at = now();
  return withMeta(o);
}

export function detail(id) {
  const o = findOrder(id);
  const photos = db.photos.filter((p) => p.order_id === id);
  const events = db.events
    .filter((e) => e.order_id === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((e) => ({ ...e, actor_name: userName(e.actor_id) }));
  return { ...withMeta(o), photos: photos.map((p) => ({ id: p.id, file_path: p.file_path, source: p.source })), events };
}

export function uploadPhoto(orderId, actorId, file = null) {
  const o = findOrder(orderId);
  if (o.photo_count >= db.settings.max_photos) throw new Error(`Maksimal ${db.settings.max_photos} foto per order.`);
  o.photo_count += 1;
  o.updated_at = now();
  db.photos.push({
    id: uid(), order_id: orderId,
    file_path: file ? `/uploads/${file.filename}` : `/uploads/demo-${o.id.slice(0, 4)}-${o.photo_count}.jpg`,
    file_name: file ? file.originalname : `bukti-${o.photo_count}.jpg`,
    mime_type: file ? file.mimetype : 'image/jpeg',
    file_size: file ? file.size : 1024,
    source: file ? 'berkas' : 'kamera', uploaded_by: actorId, created_at: now(),
  });
  return withMeta(o);
}

export function deletePhoto(orderId, photoId, actorId) {
  const o = findOrder(orderId);
  const idx = db.photos.findIndex((p) => p.id === photoId && p.order_id === orderId);
  if (idx >= 0) db.photos.splice(idx, 1);
  if (o.photo_count > 0) o.photo_count -= 1;
  o.updated_at = now();
  return withMeta(o);
}

export function completeOrder(id, note, actorId) {
  const o = findOrder(id);
  if (o.photo_count < db.settings.min_photos) throw new Error(`Minimal ${db.settings.min_photos} foto bukti wajib diunggah.`);
  const from = o.status;
  o.status = 'selesai';
  o.note = note;
  o.completed_at = now();
  o.updated_at = now();
  pushEvent(id, actorId, 'completed', from, 'selesai', note);
  return withMeta(o);
}

export function markProblem(id, reason, actorId) {
  const o = findOrder(id);
  o.is_problem = true;
  o.problem_reason = reason;
  o.updated_at = now();
  pushEvent(id, actorId, 'problem', null, null, reason);
  return withMeta(o);
}

export function reopen(id, actorId) {
  const o = findOrder(id);
  if (o.status !== 'selesai') throw new Error('Hanya order Selesai yang dapat dibuka kembali.');
  const from = o.status;
  o.status = 'proses_pick_up';
  o.completed_at = null;
  o.updated_at = now();
  pushEvent(id, actorId, 'reopened', from, 'proses_pick_up', 'Order dibuka kembali oleh admin');
  return withMeta(o);
}

export function deleteOrder(id) {
  const o = findOrder(id);
  db.orders.splice(db.orders.indexOf(o), 1);
}

export function editOrder(id, patch, actorId) {
  const o = findOrder(id);
  if (patch.order_number && orderByNumber(patch.order_number) && orderByNumber(patch.order_number).id !== id) {
    throw new Error(`Nomor pesanan ${patch.order_number} sudah dipakai order lain.`);
  }
  // Buang field undefined agar tidak menimpa data lama saat Object.assign.
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  Object.assign(o, clean, { updated_at: now() });
  return withMeta(o);
}

export function reports(range, from, to) {
  // Rentang khusus (from/to eksplisit) menimpa rentang bernama (range).
  const start = from || rangeToFrom(range);
  const inRange = (o) => (!start || o.created_at >= start) && (!to || o.created_at <= to);

  const list = db.orders.filter(inRange);
  const totals = {
    total: list.length,
    data_masuk: list.filter((o) => o.status === 'data_masuk').length,
    proses_pick_up: list.filter((o) => o.status === 'proses_pick_up').length,
    selesai: list.filter((o) => o.status === 'selesai').length,
    bermasalah: list.filter((o) => o.is_problem).length,
  };

  const byTrader = new Map();
  list.forEach((o) => {
    const t = byTrader.get(o.trader_id) ?? { trader: userName(o.trader_id), total: 0, selesai: 0 };
    t.total += 1;
    if (o.status === 'selesai') t.selesai += 1;
    byTrader.set(o.trader_id, t);
  });
  const perTrader = [...byTrader.values()].sort((a, b) => b.total - a.total).map((t) => ({ ...t, belum_selesai: t.total - t.selesai }));

  const byProduk = new Map();
  list.forEach((o) => {
    const p = db.products.find((x) => x.id === o.product_id);
    if (!p) return;
    const r = byProduk.get(p.id) ?? { product_name: p.name, quota: p.quota, used_quota: 0, amount: 0 };
    r.used_quota += 1;
    r.amount += o.order_amount ?? 0;
    byProduk.set(p.id, r);
  });
  const perProduk = [...byProduk.values()].map((r) => ({ ...r, remaining_quota: Math.max(0, r.quota - r.used_quota) }));

  // Delayed ikut rentang (berbasis updated_at, selaras PG): order yang masih
  // pending/bermasalah dan pembaruannya terjadi di dalam rentang terpilih.
  const delayedInRange = (o) => (!start || o.updated_at >= start) && (!to || o.updated_at <= to);
  const delayed = db.orders
    .filter((o) => (o.is_problem || withMeta(o).is_pending) && delayedInRange(o))
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
    .map((o) => {
      const hours = (Date.now() - new Date(o.updated_at).getTime()) / 3600000;
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      return { order_number: o.order_number, product_name: o.product_name, trader: userName(o.trader_id), duration: `${h}j ${m}m`, is_problem: o.is_problem };
    });

  return { totals, perTrader, perProduk, delayed };
}

function seed() {
  const users = [
    { id: 'u-admin', username: 'admin', password_hash: hash('admin'), display_name: 'Dimas Arya', role: 'admin', is_active: true, last_login_at: null, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'u-nabila', username: 'nabila', password_hash: hash('trader'), display_name: 'Nabila Putri', role: 'trader', is_active: true, last_login_at: null, created_at: hoursAgo(190), updated_at: hoursAgo(190) },
    { id: 'u-fajar', username: 'fajar', password_hash: hash('trader'), display_name: 'Fajar Rahman', role: 'trader', is_active: true, last_login_at: null, created_at: hoursAgo(180), updated_at: hoursAgo(180) },
  ];

  const marketplaceStores = [
    { id: 'st-tokopedia', name: 'Tokopedia', is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'st-shopee', name: 'Shopee', is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'st-lazada', name: 'Lazada', is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'st-blibli', name: 'Blibli', is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
  ];

  const products = [
    { id: 'p-keyboard', name: 'Wireless Keyboard K2', quota: 50, is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-rak', name: 'Rak Serbaguna 4 Susun', quota: 50, is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-mousepad', name: 'Mouse Pad XL', quota: 50, is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-hdmi', name: 'HDMI Cable 2.1 3M', quota: 50, is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-monitor', name: 'Monitor LG 24 inch', quota: 50, is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-mekanik', name: 'Mechanical Keyboard V1', quota: 50, is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-usbc', name: 'USB-C Hub 7 in 1', quota: 50, is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-meja', name: 'Standing Desk Mat', quota: 50, is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-webcam', name: 'Webcam Full HD', quota: 50, is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-kursi', name: 'Kursi Kerja Ergonomis', quota: 50, is_active: true, created_at: hoursAgo(200), updated_at: hoursAgo(200) },
    { id: 'p-limit', name: 'Produk Kuota Penuh', quota: 1, is_active: true, created_at: hoursAgo(120), updated_at: hoursAgo(120) },
  ];
  const byStore = Object.fromEntries(marketplaceStores.map((s) => [s.name, s.id]));

  const mk = (num, product, store, recipient, method, trader, productId, status, extra) => ({
    id: uid(), order_number: `TRK-${num}`, product_name: product, store_name: store,
    recipient_name: recipient, pickup_method: method, trader_id: trader,
    product_id: productId, store_id: byStore[store],
    status, order_amount: null, note: null, is_problem: false,
    problem_reason: null, barcode_path: null, photo_count: 0, created_at: minutesAgo(extra.minutes ?? 10),
    picked_up_at: null, completed_at: null, updated_at: minutesAgo(extra.minutes ?? 10),
    ...extra,
  });

  const orders = [
    mk('240626-018', 'Wireless Keyboard K2', 'Tokopedia', 'Nadia Putri', 'zaydan_ambilan_gjm', 'u-nabila', 'p-keyboard', 'data_masuk', { minutes: 14 }),
    mk('240626-017', 'Rak Serbaguna 4 Susun', 'Shopee', 'Fajar Rahman', 'self_pick_up', 'u-fajar', 'p-rak', 'data_masuk', { minutes: 32 }),
    mk('240626-016', 'Mouse Pad XL', 'Lazada', 'Rina Sari', 'zaydan_ambilan_gjm', 'u-admin', 'p-mousepad', 'data_masuk', { minutes: 48 }),
    mk('240626-015', 'HDMI Cable 2.1 3M', 'Lazada', 'Dimas Arya', 'zaydan_ambilan_gjm', 'u-admin', 'p-hdmi', 'data_masuk', { minutes: 68 }),
    mk('240626-011', 'Monitor LG 24 inch', 'Blibli', 'Rizky Maulana', 'zaydan_ambilan_gjm', 'u-admin', 'p-monitor', 'proses_pick_up', { minutes: 102, picked_up_at: minutesAgo(58) }),
    mk('240626-008', 'Mechanical Keyboard V1', 'Tokopedia', 'Bagus Santoso', 'self_pick_up', 'u-nabila', 'p-mekanik', 'proses_pick_up', { minutes: 198, picked_up_at: minutesAgo(160), is_problem: true, problem_reason: 'Label barcode tertukar dengan pesanan lain.' }),
    mk('240626-009', 'USB-C Hub 7 in 1', 'Tokopedia', 'Rina Sari', 'zaydan_ambilan_gjm', 'u-nabila', 'p-usbc', 'selesai', { minutes: 320, photo_count: 2, picked_up_at: minutesAgo(300), completed_at: minutesAgo(280), note: 'Barang dalam kondisi baik.' }),
    mk('240626-006', 'Standing Desk Mat', 'Shopee', 'Fauzan Hadi', 'zaydan_ambilan_gjm', 'u-fajar', 'p-meja', 'selesai', { minutes: 500, photo_count: 1, picked_up_at: minutesAgo(480), completed_at: minutesAgo(450), note: 'Sudah diambil.' }),
    mk('240626-004', 'Webcam Full HD', 'Lazada', 'Dimas Arya', 'zaydan_ambilan_gjm', 'u-admin', 'p-webcam', 'selesai', { minutes: 600, photo_count: 1, picked_up_at: minutesAgo(570), completed_at: minutesAgo(540) }),
    mk('240625-189', 'Kursi Kerja Ergonomis', 'Shopee', 'Fajar Rahman', 'self_pick_up', 'u-fajar', 'p-kursi', 'proses_pick_up', { minutes: 1180, picked_up_at: minutesAgo(1140), is_problem: true, problem_reason: 'Paket hilang di titik ambil.' }),
    mk('240626-001', 'Produk Kuota Penuh', 'Tokopedia', 'Testing', 'zaydan_ambilan_gjm', 'u-admin', 'p-limit', 'data_masuk', { minutes: 5 }),
  ];

  const photos = [
    { id: uid(), order_id: orders[6].id, file_path: '/uploads/demo-1.jpg', file_name: 'bukti-1.jpg', mime_type: 'image/jpeg', file_size: 1042, source: 'kamera', uploaded_by: 'u-admin', created_at: minutesAgo(285) },
    { id: uid(), order_id: orders[6].id, file_path: '/uploads/demo-2.jpg', file_name: 'bukti-2.jpg', mime_type: 'image/jpeg', file_size: 987, source: 'berkas', uploaded_by: 'u-admin', created_at: minutesAgo(282) },
    { id: uid(), order_id: orders[7].id, file_path: '/uploads/demo-3.jpg', file_name: 'bukti-1.jpg', mime_type: 'image/jpeg', file_size: 1101, source: 'kamera', uploaded_by: 'u-admin', created_at: minutesAgo(455) },
  ];

  const events = [];
  orders.forEach((o) => events.push({ id: uid(), order_id: o.id, actor_id: o.trader_id, event_type: 'created', from_status: null, to_status: 'data_masuk', note: 'Order dibuat', created_at: o.created_at }));
  orders.filter((o) => o.picked_up_at).forEach((o) => events.push({ id: uid(), order_id: o.id, actor_id: 'u-admin', event_type: 'picked_up', from_status: 'data_masuk', to_status: 'proses_pick_up', note: 'Scan nomor pesanan', created_at: o.picked_up_at }));
  orders.filter((o) => o.completed_at).forEach((o) => events.push({ id: uid(), order_id: o.id, actor_id: 'u-admin', event_type: 'completed', from_status: 'proses_pick_up', to_status: 'selesai', note: o.note, created_at: o.completed_at }));
  orders.filter((o) => o.is_problem).forEach((o) => events.push({ id: uid(), order_id: o.id, actor_id: 'u-admin', event_type: 'problem', from_status: null, to_status: null, note: o.problem_reason, created_at: o.updated_at }));

  return { users, products, marketplaceStores, orders, photos, events, settings: { pending_threshold_hours: 3, min_photos: 1, max_photos: 3, max_file_mb: 20 } };
}
