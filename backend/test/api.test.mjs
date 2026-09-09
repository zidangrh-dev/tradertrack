// Suite uji API ZProject — memetakan Core Features (PRD §3), User Flow (§4),
// dan jalur gagal (input kosong/salah, akses tanpa izin). Memakai node:test.
// Server dibangun sendiri sebagai child process (mode repo memori) di port uji.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const BASE = 'http://127.0.0.1:4099';
let server;
let seq = 0;

before(async () => {
  server = spawn('node', ['server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: '4099', NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) break;
    } catch { /* belum siap */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  // Satu root-before saja: dua hook root sekaligus membuat fetch pada hook
  // kedua gagal (keanehan node:test runner) — init default order di sini.
  const t = await login('admin', 'admin');
  await initOrderDefaults(t);
});

after(() => {
  server?.kill();
});

function client(token = null) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const req = async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...headers, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  };
  return {
    req,
    get: (p) => req('GET', p),
    post: (p, b) => req('POST', p, b),
    patch: (p, b) => req('PATCH', p, b),
    del: (p) => req('DELETE', p),
  };
}

async function login(username, password) {
  const c = client();
  const { status, data } = await c.post('/api/login', { username, password });
  assert.equal(status, 200, `login ${username}`);
  return data.token;
}

const orderDefaults = { product_id: '', store_id: '' };
async function initOrderDefaults(token) {
  if (orderDefaults.product_id) return;
  const products = (await client(token).get('/api/products')).data;
  const stores = (await client(token).get('/api/marketplace-stores')).data;
  orderDefaults.product_id = products[0].id;
  orderDefaults.store_id = stores[0].id;
}

const order = (over = {}) => ({
  product_name: 'Produk Uji', store_name: 'Toko Uji', order_number: `TRK-IT-${Date.now()}-${seq++}`,
  recipient_name: 'Penerima Uji', pickup_method: 'zaydan_ambilan_gjm',
  product_id: orderDefaults.product_id, store_id: orderDefaults.store_id,
  ...over,
});

// JPEG asli (magic bytes FF D8 FF) — dipakai untuk uji validasi isi berkas.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const jpegBlob = (name = 'foto.jpg') => new Blob([JPEG], { type: 'image/jpeg' });

// Order baru wajib bukti ganda: barcode pick up + foto bukti order.
// Helper ini melengkapinya agar tes yang menguji hal lain tidak terhalang.
async function attachBarcode(token, orderId, name = 'barcode.jpg') {
  const fd = new FormData();
  fd.append('photo', jpegBlob(name), name);
  const res = await fetch(`${BASE}/api/orders/${orderId}/barcode`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  return res.status;
}
async function attachOrderProof(token, orderId, name = 'bukti-order.jpg') {
  const fd = new FormData();
  fd.append('photo', jpegBlob(name), name);
  fd.append('source', 'order');
  const res = await fetch(`${BASE}/api/orders/${orderId}/photos`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  return res.status;
}
/** Buat order lalu lengkapi kedua bukti — siap diproses pick up. */
async function orderReadyForPickup(token, over = {}) {
  const { data: o } = await client(token).post('/api/orders', order(over));
  await attachBarcode(token, o.id);
  await attachOrderProof(token, o.id);
  return o;
}

/** Tandai sudah diambil. `n` = jumlah foto baru yang dikirim (0 = pakai yang
 *  sudah dilampirkan lewat galeri). Total bukti wajib 1-3. */
async function markDonePickup(token, orderId, n = 2) {
  const fd = new FormData();
  for (let i = 0; i < n; i++) fd.append('photo', jpegBlob(`ambilan-${i}.jpg`), `ambilan-${i}.jpg`);
  const res = await fetch(`${BASE}/api/orders/${orderId}/done-pickup`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

/** Bawa order sampai done_pickup: buat → lengkapi bukti → pickup → tandai diambil. */
async function orderDonePickup(token, over = {}) {
  const o = await orderReadyForPickup(token, over);
  await client(token).post(`/api/orders/${o.id}/pickup`, {});
  const r = await markDonePickup(token, o.id);
  assert.equal(r.status, 200, 'order sampai done_pickup');
  return o;
}

/** Bawa order sampai selesai (lewat done_pickup, sesuai alur baru). */
async function orderSelesai(token, note = 'x', over = {}) {
  const o = await orderDonePickup(token, over);
  const r = await client(token).patch(`/api/orders/${o.id}/complete`, { note });
  assert.equal(r.status, 200, 'order sampai selesai');
  return o;
}

async function postMultipart(token, url, { code, file, raw } = {}) {
  const fd = new FormData();
  if (code !== undefined) fd.append('code', code);
  if (file) fd.append('photo', raw ?? jpegBlob(file), file);
  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

describe('CF1 Autentikasi & role', () => {
  let admin, trader, tra2;
  before(async () => {
    admin = await login('admin', 'admin');
    trader = await login('nabila', 'trader');
    tra2 = await login('fajar', 'trader');
  });

  test('login salah kata sandi → 401', async () => {
    const { status } = await client().post('/api/login', { username: 'admin', password: 'salah' });
    assert.equal(status, 401);
  });
  test('login tanpa body → 400', async () => {
    const { status } = await client().post('/api/login', {});
    assert.equal(status, 400);
  });
  test('akses tanpa token → 401', async () => {
    const { status } = await client().get('/api/orders');
    assert.equal(status, 401);
  });
  test('token rusak → 401', async () => {
    const { status } = await client('abcdef').get('/api/orders');
    assert.equal(status, 401);
  });
  test('session valid', async () => {
    const { status, data } = await client(admin).get('/api/session');
    assert.equal(status, 200);
    // Akun 'admin' bawaan dinaikkan jadi superadmin oleh migrasi.
    assert.equal(data.role, 'superadmin');
  });
  test('trader akses endpoint admin → 403', async () => {
    for (const p of ['/api/users']) {
      const { status } = await client(trader).get(p);
      assert.equal(status, 403, p);
    }
  });
  test('admin buat akun + ubah role + reset password', async () => {
    const u = `qa_${Date.now()}`;
    const { status: s1, data: created } = await client(admin).post('/api/users', { username: u, password: 'pw1', display_name: 'QA User', role: 'trader' });
    assert.equal(s1, 201);
    const { status: s2 } = await client(admin).patch(`/api/users/${created.id}`, { role: 'admin', display_name: 'QA Admin' });
    assert.equal(s2, 204);
    const { status: s3 } = await client(admin).patch(`/api/users/${created.id}`, { password: 'pw2' });
    assert.equal(s3, 204);
    const { status: s4 } = await client().post('/api/login', { username: u, password: 'pw2' });
    assert.equal(s4, 200);
    // cleanup: nonaktifkan (bukan hapus) — akun terakhir admin protection
    const { status: s5 } = await client(admin).patch(`/api/users/${created.id}`, { is_active: false });
    assert.equal(s5, 204);
  });
  test('duplikat username → tolak', async () => {
    const { status } = await client(admin).post('/api/users', { username: 'nabila', password: 'x', display_name: 'X', role: 'trader' });
    assert.equal(status, 400);
  });
  test('hapus akun: tanpa riwayat → sukses; berorder → tolak; diri sendiri → tolak', async () => {
    // Akun baru tanpa order → hapus sukses.
    const u = `del_${Date.now()}`;
    const { data: created } = await client(admin).post('/api/users', { username: u, password: 'pw', display_name: 'Del User', role: 'trader' });
    const delOk = await client(admin).del(`/api/users/${created.id}`);
    assert.equal(delOk.status, 204);
    const { data: after } = await client(admin).get('/api/users');
    assert.ok(!after.some((x) => x.id === created.id), 'akun tanpa riwayat terhapus');

    // Akun berorder → tolak.
    const u2 = `del2_${Date.now()}`;
    const { data: created2 } = await client(admin).post('/api/users', { username: u2, password: 'pw', display_name: 'Del2', role: 'trader' });
    const tok2 = await login(u2, 'pw');
    const o = await client(tok2).post('/api/orders', order());
    assert.equal(o.status, 201);
    const delBlocked = await client(admin).del(`/api/users/${created2.id}`);
    assert.equal(delBlocked.status, 400);
    assert.match(delBlocked.data.error, /riwayat/);
    // cleanup: hapus ordernya dulu supaya akun bisa dibersihkan.
    const { data: orders } = await client(tok2).get('/api/orders');
    await client(tok2).del(`/api/orders/${orders.items[0].id}`);
    await client(admin).del(`/api/users/${created2.id}`);

    // Hapus diri sendiri → tolak.
    const delSelf = await client(admin).del('/api/users/u-admin');
    assert.equal(delSelf.status, 400);
  });
  test('nonaktifkan admin terakhir → tolak', async () => {
    const { status } = await client(admin).patch('/api/users/u-admin', { is_active: false });
    assert.equal(status, 400);
  });
  test('ubah role diri sendiri → tolak', async () => {
    const { status } = await client(admin).patch('/api/users/u-admin', { role: 'trader' });
    assert.equal(status, 400);
  });
  test('akun nonaktif tidak bisa login', async () => {
    const u = `off_${Date.now()}`;
    const { data: created } = await client(admin).post('/api/users', { username: u, password: 'pw', display_name: 'Off', role: 'trader' });
    await client(admin).patch(`/api/users/${created.id}`, { is_active: false });
    const { status } = await client().post('/api/login', { username: u, password: 'pw' });
    assert.equal(status, 401);
  });
  test('ganti password sendiri — sukses & login pakai baru', async () => {
    // akun sementara agar tidak mengubah sandi admin/nabila global
    const u = `pw_${Date.now()}`;
    const { data: created } = await client(admin).post('/api/users', { username: u, password: 'old123', display_name: 'PW User', role: 'trader' });
    const tok = await login(u, 'old123');
    // salah sandi lama → tolak
    const { status: bad } = await client(tok).post('/api/me/password', { current_password: 'salah', new_password: 'new12345' });
    assert.equal(bad, 400);
    // sukses
    const { status: ok1 } = await client(tok).post('/api/me/password', { current_password: 'old123', new_password: 'new12345' });
    assert.equal(ok1, 204);
    // sandi lama tak bisa dipakai, yang baru bisa
    const rOld = await client().post('/api/login', { username: u, password: 'old123' });
    const rNew = await client().post('/api/login', { username: u, password: 'new12345' });
    assert.equal(rOld.status, 401);
    assert.equal(rNew.status, 200);
    // cleanup
    await client(admin).patch(`/api/users/${created.id}`, { is_active: false });
  });
  test('ganti password sendiri — validasi input', async () => {
    const tok = await login('nabila', 'trader');
    const r1 = await client(tok).post('/api/me/password', { current_password: 'trader', new_password: '123' });
    assert.equal(r1.status, 400, 'minimal 6 karakter');
    const r2 = await client(tok).post('/api/me/password', { current_password: 'trader', new_password: 'trader' });
    assert.equal(r2.status, 400, 'sama dengan lama ditolak');
    const r3 = await client().post('/api/me/password', { current_password: 'x', new_password: 'y12345' });
    assert.equal(r3.status, 401, 'tanpa token');
  });
  void tra2;
});

describe('CF2 Input order', () => {
  let admin, trader;
  before(async () => { admin = await login('admin', 'admin'); trader = await login('nabila', 'trader'); });

  test('trader buat order → trader_id otomatis diri sendiri', async () => {
    const { status, data } = await client(trader).post('/api/orders', order({ trader_id: 'u-fajar' }));
    assert.equal(status, 201);
    assert.equal(data.status, 'data_masuk');
    assert.equal(data.trader_id, 'u-nabila', 'trader tak boleh menginput atas nama orang lain');
  });
  test('admin buat order atas nama trader lain', async () => {
    const { data } = await client(admin).post('/api/orders', order({ trader_id: 'u-fajar' }));
    assert.equal(data.trader_id, 'u-fajar');
  });
  test('nomor pesanan duplikat → tolak + pesan berisi order lama', async () => {
    const { data } = await client(trader).post('/api/orders', order());
    const { status, data: err } = await client(trader).post('/api/orders', order({ order_number: data.order_number }));
    assert.equal(status, 400);
    assert.match(err.error, /sudah pernah diinput/);
  });
  test('kolom wajib kosong → 400', async () => {
    for (const missing of ['order_number', 'recipient_name', 'product_id', 'store_id']) {
      const { status } = await client(trader).post('/api/orders', order({ [missing]: undefined }));
      assert.equal(status, 400, missing);
    }
  });
  test('produk nonaktif tidak bisa dipilih → 400', async () => {
    const created = await client(admin).post('/api/products', { name: `Nonaktif ${Date.now()}`, quota: 5 });
    const item = created.data.find((m) => m.name.startsWith('Nonaktif'));
    await client(admin).patch(`/api/products/${item.id}`, { is_active: false });
    const { status, data: err } = await client(trader).post('/api/orders', order({ product_id: item.id }));
    assert.equal(status, 400);
    assert.match(err.error, /nonaktif/);
  });
  test('order memakai nama produk + toko yang dipilih trader', async () => {
    const { data: list } = await client(admin).get('/api/products');
    const { data: stores } = await client(admin).get('/api/marketplace-stores');
    const p = list.find((m) => m.is_active && m.remaining_quota > 0);
    const s = stores.find((x) => x.is_active);
    const { data: o } = await client(trader).post('/api/orders', order({ product_id: p.id, store_id: s.id }));
    assert.equal(o.product_name, p.name);
    assert.equal(o.store_name, s.name);
    assert.equal(o.product_label, `${p.name} · ${s.name}`);
  });
  test('metode pengambilan tidak valid → 400', async () => {
    const { status } = await client(trader).post('/api/orders', order({ pickup_method: 'kurir' }));
    assert.equal(status, 400);
  });
  test('nominal opsional + tersimpan', async () => {
    const { data } = await client(trader).post('/api/orders', order({ order_amount: 250000 }));
    assert.equal(data.order_amount, 250000);
  });
});

describe('CF3 Daftar order', () => {
  let admin, trader;
  before(async () => { admin = await login('admin', 'admin'); trader = await login('nabila', 'trader'); });

  test('list memuat meta trader, produk master data, is_pending', async () => {
    const { data } = await client(admin).get('/api/orders');
    assert.ok(data.total >= 10);
    const first = data.items[0];
    assert.ok(first.trader_name);
    assert.ok(first.product_label.includes('·'));
    assert.equal(typeof first.is_pending, 'boolean');
  });
  test('pencarian: nomor order, produk, penerima', async () => {
    const { data } = await client(admin).get('/api/orders');
    const o = data.items[0];
    for (const q of [o.order_number, o.product_name, o.recipient_name]) {
      const r = await client(admin).get(`/api/orders?q=${encodeURIComponent(q)}`);
      assert.ok(r.data.items.some((x) => x.id === o.id), `q=${q}`);
    }
  });
  test('filter status / metode / trader', async () => {
    const s = await client(admin).get('/api/orders?status=selesai');
    assert.ok(s.data.items.every((o) => o.status === 'selesai'));
    const m = await client(admin).get('/api/orders?pickup_method=self_pick_up');
    assert.ok(m.data.items.every((o) => o.pickup_method === 'self_pick_up'));
    const t = await client(admin).get('/api/orders?trader=u-nabila');
    assert.ok(t.data.items.every((o) => o.trader_id === 'u-nabila'));
    const st = await client(admin).get('/api/orders?store=st-shopee');
    assert.ok(st.data.items.length >= 1);
    assert.ok(st.data.items.every((o) => o.store_id === 'st-shopee'));
    // Multi-toko: koma → beberapa toko; hasil hanya dari toko yang dipilih.
    const two = await client(admin).get('/api/orders?store=st-shopee,st-lazada');
    assert.ok(two.data.items.length >= 1);
    assert.ok(two.data.items.every((o) => ['st-shopee', 'st-lazada'].includes(o.store_id)));
    const countTwo = two.data.total;
    const countShopee = st.data.total;
    const lazada = await client(admin).get('/api/orders?store=st-lazada');
    assert.equal(countTwo, countShopee + lazada.data.total, 'gabungan dua toko = jumlah masing-masing (OR)');
  });
  test('filter produk: tunggal, multi (OR), dan gabungan dengan toko (AND)', async () => {
    const { data: produk } = await client(admin).get('/api/products');
    const dipakai = [];
    for (const p of produk) {
      const r = await client(admin).get(`/api/orders?product=${p.id}`);
      if (r.data.total > 0) dipakai.push({ id: p.id, total: r.data.total });
      if (dipakai.length === 2) break;
    }
    assert.ok(dipakai.length >= 1, 'ada produk yang dipakai order');

    // Tunggal: semua item memakai produk itu.
    const satu = await client(admin).get(`/api/orders?product=${dipakai[0].id}`);
    assert.equal(satu.status, 200);
    assert.ok(satu.data.items.every((o) => o.product_id === dipakai[0].id));

    if (dipakai.length === 2) {
      // Multi: gabungan dua produk = jumlah masing-masing (OR di dalam filter).
      const dua = await client(admin).get(`/api/orders?product=${dipakai[0].id},${dipakai[1].id}`);
      assert.ok(dua.data.items.every((o) => [dipakai[0].id, dipakai[1].id].includes(o.product_id)));
      assert.equal(dua.data.total, dipakai[0].total + dipakai[1].total, 'gabungan dua produk = jumlah masing-masing (OR)');
    }

    // AND antar-filter: produk + toko menyempit, tidak melebar.
    const storeId = satu.data.items[0]?.store_id;
    if (storeId) {
      const kombinasi = await client(admin).get(`/api/orders?product=${dipakai[0].id}&store=${storeId}`);
      assert.ok(kombinasi.data.items.every((o) => o.product_id === dipakai[0].id && o.store_id === storeId));
      assert.ok(kombinasi.data.total <= satu.data.total, 'menambah filter tidak boleh menambah hasil');
    }
  });
  test('filter produk tidak membocorkan order trader lain', async () => {
    const { data: produk } = await client(admin).get('/api/products');
    const semua = await client(admin).get(`/api/orders?product=${produk[0].id}`);
    const milikTrader = await client(trader).get(`/api/orders?product=${produk[0].id}`);
    assert.ok(milikTrader.data.items.every((o) => o.trader_id === 'u-nabila'), 'scoping trader tetap berlaku');
    assert.ok(milikTrader.data.total <= semua.data.total);
  });
  test('filter rentang tanggal from/to', async () => {
    const now = new Date();
    const from = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const to = now.toISOString();
    const { data } = await client(admin).get(`/api/orders?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    assert.ok(data.items.length >= 1);
    assert.ok(data.items.every((o) => o.created_at >= from && o.created_at <= to));
    const far = new Date(Date.now() + 10 * 864e5).toISOString();
    const { data: none } = await client(admin).get(`/api/orders?to=${encodeURIComponent(far)}&from=${encodeURIComponent('1970-01-01T00:00:00.000Z')}`);
    assert.ok(none.items.every((o) => o.created_at <= far));
  });
  test('trader hanya melihat order miliknya sendiri', async () => {
    const { data } = await client(trader).get('/api/orders');
    assert.ok(data.items.length >= 1);
    assert.ok(data.items.every((o) => o.trader_id === 'u-nabila'), 'ada order milik trader lain bocor');
    // Filter trader dari client tidak boleh bisa membuka cakupan.
    const bypass = await client(trader).get('/api/orders?trader=u-admin');
    assert.ok(bypass.data.items.every((o) => o.trader_id === 'u-nabila'));
    const { data: all } = await client(admin).get('/api/orders');
    assert.ok(all.total > data.total, 'admin harusnya melihat lebih banyak');
  });
  test('trader membuka detail order orang lain → 403', async () => {
    const { data: adminOrder } = await client(admin).get('/api/orders?trader=u-admin');
    const target = adminOrder.items.find((o) => o.trader_id !== 'u-nabila');
    const { status } = await client(trader).get(`/api/orders/${target.id}/detail`);
    assert.equal(status, 403);
    const { status: ownStatus } = await client(trader).get(`/api/orders/${adminOrder.items[0] && (await client(trader).post('/api/orders', order())).data.id}/detail`);
    assert.equal(ownStatus, 200);
  });
  test('edit order milik sendiri (data_masuk) → ok', async () => {
    const { data } = await client(trader).post('/api/orders', order());
    const { status, data: updated } = await client(trader).patch(`/api/orders/${data.id}`, { product_name: 'Produk Revisi' });
    assert.equal(status, 200);
    assert.equal(updated.product_name, 'Produk Revisi');
  });
  test('edit order milik orang lain → 403', async () => {
    const { data } = await client(admin).get('/api/orders?trader=u-admin&status=data_masuk');
    const o = data.items[0];
    const { status } = await client(trader).patch(`/api/orders/${o.id}`, { product_name: 'X' });
    assert.equal(status, 403);
  });
  test('edit order yang sudah diproses → 400', async () => {
    const { data } = await client(admin).get('/api/orders?trader=u-nabila&status=proses_pick_up');
    const o = data.items[0];
    const { status } = await client(trader).patch(`/api/orders/${o.id}`, { product_name: 'X' });
    assert.equal(status, 400);
  });
  test('hapus order milik sendiri (data_masuk) → 204', async () => {
    const { data } = await client(trader).post('/api/orders', order());
    const { status } = await client(trader).del(`/api/orders/${data.id}`);
    assert.equal(status, 204);
  });
  test('hapus order milik orang lain → 403', async () => {
    const { data } = await client(admin).get('/api/orders?trader=u-admin&status=data_masuk');
    const o = data.items[0];
    const { status } = await client(trader).del(`/api/orders/${o.id}`);
    assert.equal(status, 403);
  });
  test('hapus order bukan data_masuk → 400', async () => {
    const { data } = await client(admin).get('/api/orders?trader=u-nabila&status=proses_pick_up');
    const o = data.items[0];
    const { status } = await client(trader).del(`/api/orders/${o.id}`);
    assert.equal(status, 400);
  });
});

describe('CF4 Pick up scan resi + foto barcode wajib', () => {
  let admin, trader;
  before(async () => { admin = await login('admin', 'admin'); trader = await login('nabila', 'trader'); });

  test('scan cocok + foto barcode → proses_pick_up + event + foto tersimpan', async () => {
    const o = await orderReadyForPickup(admin);
    const { status, data: r } = await postMultipart(admin, '/api/orders/scan', { code: o.order_number, file: 'scan.jpg' });
    assert.equal(status, 200);
    assert.equal(r.status, 'proses_pick_up');
    assert.ok(r.picked_up_at);
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.ok(d.events.some((e) => e.event_type === 'picked_up'));
    assert.ok(d.photos.some((p) => p.source === 'pickup'), 'foto barcode pengambilan tersimpan');
  });
  test('scan order tanpa barcode → 400 (pesanan tanpa barcode tidak diproses)', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    await attachOrderProof(admin, o.id); // bukti order ada, barcode belum
    const { status, data: r } = await client(admin).post('/api/orders/scan', { code: o.order_number });
    assert.equal(status, 400);
    assert.match(r.error, /barcode/i);
    const { data: after } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.equal(after.status, 'data_masuk');
  });
  test('scan order berbarcode tapi tanpa foto bukti order → 400', async () => {
    const { data: o } = await client(trader).post('/api/orders', order());
    await attachBarcode(trader, o.id);
    const { status, data: r } = await client(admin).post('/api/orders/scan', { code: o.order_number });
    assert.equal(status, 400);
    assert.match(r.error, /bukti order/i);
  });
  test('scan tanpa foto saat kedua bukti lengkap → izinkan', async () => {
    const o = await orderReadyForPickup(trader);
    const { status, data: r } = await client(admin).post('/api/orders/scan', { code: o.order_number });
    assert.equal(status, 200);
    assert.equal(r.status, 'proses_pick_up');
  });
  test('scan isi berkas bukan gambar → 400', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    const raw = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    const { status, data: r } = await postMultipart(admin, '/api/orders/scan', { code: o.order_number, file: 'palsu.jpg', raw });
    assert.equal(status, 400);
    assert.match(r.error, /bukan gambar/);
    const { data: after } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.equal(after.status, 'data_masuk', 'status tidak berubah saat berkas ditolak');
  });
  test('scan MIME tidak didukung (bukan gambar) → 400', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    const raw = new Blob([new TextEncoder().encode('%PDF-1.4 fake')], { type: 'application/pdf' });
    const { status } = await postMultipart(admin, '/api/orders/scan', { code: o.order_number, file: 'doc.pdf', raw });
    assert.equal(status, 400);
  });
  test('scan ulang nomor yang sama → info sudah diproses (tanpa perubahan ganda)', async () => {
    const { data: list } = await client(admin).get('/api/orders?status=proses_pick_up');
    const o = list.items[0];
    const { status, data: r } = await client(admin).post('/api/orders/scan', { code: o.order_number });
    assert.equal(status, 200);
    assert.ok(r.status === 'proses_pick_up' || r.status === 'selesai');
  });
  test('scan tak dikenal → null', async () => {
    const { status, data } = await client(admin).post('/api/orders/scan', { code: 'TIDAKADA-12345' });
    assert.equal(status, 200);
    assert.equal(data, null);
  });
  test('scan oleh trader → 403', async () => {
    const { status } = await client(trader).post('/api/orders/scan', { code: 'X' });
    assert.equal(status, 403);
  });

  test('POST /orders/:id/pickup tanpa bukti apa pun → 400', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status, data: r } = await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    assert.equal(status, 400);
    assert.match(r.error, /barcode/i);
  });
  test('POST /orders/:id/pickup tanpa foto saat kedua bukti lengkap → izinkan', async () => {
    const o = await orderReadyForPickup(trader);
    // pickup tanpa foto baru — barcode & bukti order sudah ada
    const { status, data: r } = await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    assert.equal(status, 200);
    assert.equal(r.status, 'proses_pick_up');
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.ok(d.events.some((e) => e.event_type === 'picked_up'));
    assert.ok(!d.photos.some((p) => p.source === 'pickup'), 'tidak ada foto pickup baru ditambahkan');
  });
  test('POST /orders/:id/pickup dengan foto → proses_pick_up + event + foto pickup', async () => {
    const o = await orderReadyForPickup(admin);
    const { status, data: r } = await postMultipart(admin, `/api/orders/${o.id}/pickup`, { file: 'barcode-ambil.jpg' });
    assert.equal(status, 200);
    assert.equal(r.status, 'proses_pick_up');
    assert.ok(r.picked_up_at);
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.ok(d.photos.some((p) => p.source === 'pickup'));
    assert.ok(d.events.some((e) => e.event_type === 'picked_up' && e.note === 'Proses pick up'));
  });
  test('POST /orders/:id/pickup dengan barcode saja (tanpa bukti order) → 400', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    await attachBarcode(admin, o.id);
    const { status, data: r } = await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    assert.equal(status, 400);
    assert.match(r.error, /bukti order/i);
    const { data: after } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.equal(after.status, 'data_masuk', 'status tidak berubah');
  });
  test('POST /orders/:id/pickup tanpa foto saat kedua bukti sudah diupload → izinkan', async () => {
    const o = await orderReadyForPickup(admin);
    const { status, data: r } = await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    assert.equal(status, 200);
    assert.equal(r.status, 'proses_pick_up');
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.ok(d.events.some((e) => e.event_type === 'picked_up'));
    assert.equal(d.photo_count, 1, 'tidak menambah foto baru');
  });
  test('POST /orders/:id/pickup pada order sudah diproses → 400', async () => {
    const { data: list } = await client(admin).get('/api/orders?status=proses_pick_up');
    const o = list.items[0];
    const { status } = await postMultipart(admin, `/api/orders/${o.id}/pickup`, { file: 'lagi.jpg' });
    assert.equal(status, 400);
  });
  test('pickup order milik orang lain oleh trader → 403', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status } = await postMultipart(trader, `/api/orders/${o.id}/pickup`, { file: 'x.jpg' });
    assert.equal(status, 403);
  });
  test('trader proses pick up order miliknya + foto → 200', async () => {
    const o = await orderReadyForPickup(trader);
    const { status, data: r } = await postMultipart(trader, `/api/orders/${o.id}/pickup`, { file: 'bukti-trader.jpg' });
    assert.equal(status, 200);
    assert.equal(r.status, 'proses_pick_up');
    const { data: d } = await client(trader).get(`/api/orders/${o.id}/detail`);
    assert.ok(d.photos.some((p) => p.source === 'pickup'));
    assert.ok(d.events.some((e) => e.event_type === 'picked_up'));
  });
  test('trader proses pick up order miliknya tanpa bukti → 400', async () => {
    const { data: o } = await client(trader).post('/api/orders', order());
    const { status, data: r } = await client(trader).post(`/api/orders/${o.id}/pickup`, {});
    assert.equal(status, 400);
    assert.match(r.error, /barcode/i);
  });
  test('trader proses pick up tanpa foto saat kedua bukti lengkap → izinkan', async () => {
    const o = await orderReadyForPickup(trader);
    const { status, data: r } = await client(trader).post(`/api/orders/${o.id}/pickup`, {});
    assert.equal(status, 200);
    assert.equal(r.status, 'proses_pick_up');
  });
  test('PATCH /orders/:id/status ke proses_pick_up → 400 (jalur wajib foto)', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status } = await client(admin).patch(`/api/orders/${o.id}/status`, { to_status: 'proses_pick_up' });
    assert.equal(status, 400);
  });

  test('trader lampirkan barcode ke order miliknya', async () => {
    const { data: o } = await client(trader).post('/api/orders', order());
    const res = await fetch(`${BASE}/api/orders/${o.id}/barcode`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${trader}` },
      body: (() => { const fd = new FormData(); fd.append('photo', jpegBlob('barcode.jpg')); return fd; })(),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.barcode_path, /^\/uploads\//);
  });
  test('hapus barcode: sukses saat Data masuk, lalu pick up tertahan lagi', async () => {
    const o = await orderReadyForPickup(trader);
    // barcode terpasang → pick up boleh
    const { data: before } = await client(trader).get(`/api/orders/${o.id}/detail`);
    assert.match(before.barcode_path, /^\/uploads\//);

    const del = await client(trader).del(`/api/orders/${o.id}/barcode`);
    assert.equal(del.status, 200);
    assert.equal(del.data.barcode_path, null, 'barcode dikosongkan');

    // Inti aturan: tanpa barcode, order tidak bisa diproses walau bukti order ada.
    const { status, data: err } = await client(trader).post(`/api/orders/${o.id}/pickup`, {});
    assert.equal(status, 400);
    assert.match(err.error, /barcode/i);

    // dilampirkan lagi → bisa diproses
    assert.equal(await attachBarcode(trader, o.id), 200);
    const { status: s2 } = await client(trader).post(`/api/orders/${o.id}/pickup`, {});
    assert.equal(s2, 200, 'setelah barcode dipasang ulang, pick up jalan');
  });
  test('hapus barcode saat order sudah diproses → 400', async () => {
    const o = await orderReadyForPickup(admin);
    await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    const { status, data } = await client(admin).del(`/api/orders/${o.id}/barcode`);
    assert.equal(status, 400);
    assert.match(data.error, /Data masuk/);
  });
  test('hapus barcode order milik orang lain → 403', async () => {
    const o = await orderReadyForPickup(admin);
    const { status } = await client(trader).del(`/api/orders/${o.id}/barcode`);
    assert.equal(status, 403);
  });
  test('hapus barcode pada order tanpa barcode → 400', async () => {
    const { data: o } = await client(trader).post('/api/orders', order());
    const { status, data } = await client(trader).del(`/api/orders/${o.id}/barcode`);
    assert.equal(status, 400);
    assert.match(data.error, /belum memiliki barcode/);
  });
  test('lampirkan barcode ke order orang lain → 403', async () => {
    const { data: list } = await client(admin).get('/api/orders?trader=u-admin&status=data_masuk');
    const o = list.items[0];
    const res = await fetch(`${BASE}/api/orders/${o.id}/barcode`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${trader}` },
      body: (() => { const fd = new FormData(); fd.append('photo', jpegBlob('b.jpg')); return fd; })(),
    });
    assert.equal(res.status, 403);
  });
  test('lampirkan barcode pada order yang sudah berbarcode & diproses → 400', async () => {
    const o = await orderReadyForPickup(admin);
    await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    // Barcode sudah terpasang sejak Data masuk → celah susulan tidak berlaku.
    const res = await fetch(`${BASE}/api/orders/${o.id}/barcode`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin}` },
      body: (() => { const fd = new FormData(); fd.append('photo', jpegBlob('b.jpg')); return fd; })(),
    });
    assert.equal(res.status, 400);
    const { error } = await res.json();
    assert.match(error, /sudah memiliki barcode/i);
  });

  // Order warisan (dibuat sebelum aturan bukti ganda) bisa masuk Proses pick up
  // tanpa barcode dan dulu terkunci selamanya. Celah susulan menambalnya.
  describe('barcode susulan untuk order warisan', () => {
    // Produk sendiri: kuota produk bawaan dipakai bersama seluruh suite.
    let produkBc;
    before(async () => {
      const nama = `Produk Barcode ${Date.now()}`;
      const { data } = await client(admin).post('/api/products', { name: nama, quota: 50 });
      produkBc = data.find((p) => p.name === nama).id;
    });

    /** Order warisan: proses_pick_up tanpa barcode. Diambil dari data seed. */
    const cariWarisan = async () => {
      const { data } = await client(admin).get('/api/orders?status=proses_pick_up&per_page=200');
      return data.items.find((x) => !x.barcode_path);
    };

    test('pemilik boleh melampirkan barcode susulan, lalu terkunci lagi', async () => {
      const o = await cariWarisan();
      assert.ok(o, 'ada order warisan tanpa barcode di data uji');
      const pemilik = o.trader_id === 'u-nabila' ? trader : await login('fajar', 'trader');

      assert.equal(await attachBarcode(pemilik, o.id), 200, 'barcode susulan diterima');
      const { data: sesudah } = await client(admin).get(`/api/orders/${o.id}/detail`);
      assert.match(sesudah.barcode_path, /^\/uploads\//, 'barcode tersimpan');
      assert.equal(sesudah.status, 'proses_pick_up', 'status tidak berubah');

      // Inti pertanyaan: celah menutup sendiri setelah barcode terisi.
      const ulang = await fetch(`${BASE}/api/orders/${o.id}/barcode`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${pemilik}` },
        body: (() => { const fd = new FormData(); fd.append('photo', jpegBlob('b2.jpg')); return fd; })(),
      });
      assert.equal(ulang.status, 400, 'terkunci lagi begitu barcode terisi');
      assert.match((await ulang.json()).error, /sudah memiliki barcode/i);
    });

    test('bukan pemilik tetap ditolak 403', async () => {
      const o = await cariWarisan();
      if (!o) return; // sudah ditambal tes lain — aturan kepemilikan diuji terpisah
      const lain = o.trader_id === 'u-nabila' ? await login('fajar', 'trader') : trader;
      const res = await fetch(`${BASE}/api/orders/${o.id}/barcode`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${lain}` },
        body: (() => { const fd = new FormData(); fd.append('photo', jpegBlob('b.jpg')); return fd; })(),
      });
      assert.equal(res.status, 403);
    });

    test('celah tidak berlaku setelah done_pickup', async () => {
      const o = await orderReadyForPickup(admin, { product_id: produkBc });
      await client(admin).post(`/api/orders/${o.id}/pickup`, {});
      await markDonePickup(admin, o.id);
      const res = await fetch(`${BASE}/api/orders/${o.id}/barcode`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${admin}` },
        body: (() => { const fd = new FormData(); fd.append('photo', jpegBlob('b.jpg')); return fd; })(),
      });
      assert.equal(res.status, 400, 'done_pickup tidak kebagian celah susulan');
    });
  });
});

describe('CF5 Detail & penyelesaian dengan foto', () => {
  let admin, trader, produkCf5;
  before(async () => {
    admin = await login('admin', 'admin');
    trader = await login('nabila', 'trader');
    // Produk sendiri: kuota produk bawaan dipakai bersama seluruh suite dan
    // bisa habis, membuat POST /orders gagal diam-diam di tengah tes.
    const nama = `Produk CF5 ${Date.now()}`;
    const { data } = await client(admin).post('/api/products', { name: nama, quota: 100 });
    produkCf5 = data.find((p) => p.name === nama).id;
  });

  test('detail memuat foto + riwayat + actor_name', async () => {
    const { data: list } = await client(admin).get('/api/orders');
    const o = list.items.find((x) => x.status === 'selesai');
    const { data: d } = await client(trader).get(`/api/orders/${o.id}/detail`);
    assert.ok(d.photos.length >= 1);
    assert.ok(d.events.length >= 1);
    assert.ok(d.events[0].actor_name);
  });
  test('upload foto + batas maksimal', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti.jpg' });
    const { data: r } = await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti-2.jpg' });
    assert.equal(r.photo_count, o.photo_count + 2);
    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti.jpg' });
    const { status } = await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti-4.jpg' }); // melebihi max 3
    assert.equal(status, 400);
  });
  test('trader (pemilik) unggah foto bukti order miliknya → 200', async () => {
    const { data: o } = await client(trader).post('/api/orders', order());
    const { status, data: r } = await postMultipart(trader, `/api/orders/${o.id}/photos`, { file: 'bukti-trader.jpg' });
    assert.equal(status, 200);
    assert.equal(r.photo_count, 1);
    const { data: d } = await client(trader).get(`/api/orders/${o.id}/detail`);
    assert.equal(d.photos.length, 1);
  });
  test('trader unggah foto bukti order milik orang lain → 403', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status } = await client(trader).post(`/api/orders/${o.id}/photos`);
    assert.equal(status, 403);
  });
  test('trader (pemilik) hapus foto bukti order miliknya → 200', async () => {
    const { data: o } = await client(trader).post('/api/orders', order());
    await postMultipart(trader, `/api/orders/${o.id}/photos`, { file: 'bukti-trader.jpg' });
    const { data: d } = await client(trader).get(`/api/orders/${o.id}/detail`);
    const { status, data: r } = await client(trader).del(`/api/orders/${o.id}/photos/${d.photos[0].id}`);
    assert.equal(status, 200);
    assert.equal(r.photo_count, 0);
  });
  test('trader hapus foto order milik orang lain → 403', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti.jpg' });
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    const { status } = await client(trader).del(`/api/orders/${o.id}/photos/${d.photos[0].id}`);
    assert.equal(status, 403);
  });
  test('complete tanpa foto minimal → tolak', async () => {
    // Order di done_pickup selalu punya 2 foto pengambilan (tak bisa dihapus),
    // jadi naikkan min_photos sementara agar syarat foto gagal.
    const o = await orderDonePickup(admin);
    await client(admin).patch('/api/settings', { min_photos: 5 });
    try {
      const { status, data: err } = await client(admin).patch(`/api/orders/${o.id}/complete`, { note: 'x' });
      assert.equal(status, 400);
      assert.match(err.error, /foto bukti/);
    } finally {
      await client(admin).patch('/api/settings', { min_photos: 1 });
    }
  });
  test('complete dengan foto → selesai + note + event', async () => {
    const o = await orderDonePickup(admin);
    const { status, data: r } = await client(admin).patch(`/api/orders/${o.id}/complete`, { note: 'Barang bagus' });
    assert.equal(status, 200);
    assert.equal(r.status, 'selesai');
    assert.equal(r.note, 'Barang bagus');
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.ok(d.events.some((e) => e.event_type === 'completed'));
  });
  test('hapus foto → photo_count turun', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti.jpg' });
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    const { data: r } = await client(admin).del(`/api/orders/${o.id}/photos/${d.photos[0].id}`);
    assert.equal(r.photo_count, 0);
  });
  test('tandai bermasalah + alasan wajib', async () => {
    const { data: o } = await client(admin).post('/api/orders', order({ product_id: produkCf5 }));
    const { status: s1 } = await client(admin).patch(`/api/orders/${o.id}/problem`, { reason: '' });
    assert.equal(s1, 400);
    const { data: r } = await client(admin).patch(`/api/orders/${o.id}/problem`, { reason: 'Paket hilang' });
    assert.equal(r.is_problem, true);
    assert.equal(r.problem_reason, 'Paket hilang');
  });
  test('cabut tanda bermasalah → is_problem false + alasan dikosongkan', async () => {
    const { data: o } = await client(admin).post('/api/orders', order({ product_id: produkCf5 }));
    await client(admin).patch(`/api/orders/${o.id}/problem`, { reason: 'Paket hilang' });

    const { status, data: r } = await client(admin).del(`/api/orders/${o.id}/problem`);
    assert.equal(status, 200);
    assert.equal(r.is_problem, false);
    assert.equal(r.problem_reason, null, 'alasan ikut dibersihkan');

    // Inti keluhan: tanda tidak boleh hidup lagi saat detail dimuat ulang.
    const { data: lagi } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.equal(lagi.is_problem, false, 'tetap tidak bermasalah setelah dimuat ulang');
    assert.ok(
      lagi.events.some((e) => e.event_type === 'problem_cleared'),
      'pencabutan tercatat di riwayat',
    );
  });
  test('cabut tanda bermasalah bersifat idempoten', async () => {
    const { data: o } = await client(admin).post('/api/orders', order({ product_id: produkCf5 }));
    const { status } = await client(admin).del(`/api/orders/${o.id}/problem`);
    assert.equal(status, 200, 'order yang tidak bermasalah tetap 200');
  });
  test('trader tidak bisa mencabut tanda bermasalah', async () => {
    const { data: o } = await client(admin).post('/api/orders', order({ product_id: produkCf5 }));
    await client(admin).patch(`/api/orders/${o.id}/problem`, { reason: 'Paket hilang' });
    const { status } = await client(trader).del(`/api/orders/${o.id}/problem`);
    assert.equal(status, 403);
  });
  test('tandai bermasalah tidak mengubah urutan (status_changed_at)', async () => {
    const { data: o } = await client(admin).post('/api/orders', order({ product_id: produkCf5 }));
    const stamp = o.status_changed_at;
    const { data: ditandai } = await client(admin).patch(`/api/orders/${o.id}/problem`, { reason: 'x' });
    assert.equal(ditandai.status_changed_at, stamp, 'menandai tidak menggeser stempel status');
    const { data: dicabut } = await client(admin).del(`/api/orders/${o.id}/problem`);
    assert.equal(dicabut.status_changed_at, stamp, 'mencabut juga tidak');
  });
  test('buka kembali order selesai', async () => {
    const o = await orderSelesai(admin);
    const { data: r } = await client(admin).patch(`/api/orders/${o.id}/reopen`);
    assert.equal(r.status, 'proses_pick_up');
    assert.equal(r.completed_at, null);
  });
  test('buka kembali order bukan selesai → tolak', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status } = await client(admin).patch(`/api/orders/${o.id}/reopen`);
    assert.equal(status, 400);
  });
  test('update status ke nilai tidak valid → 400', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status } = await client(admin).patch(`/api/orders/${o.id}/status`, { to_status: 'batal' });
    assert.equal(status, 400);
  });

  // ---- Order selesai terkunci: tidak bisa diedit/dihapus/fotonya diubah ----
  test('edit order selesai (oleh admin sekalipun) → tolak', async () => {
    const o = await orderSelesai(admin);
    const { status } = await client(admin).patch(`/api/orders/${o.id}`, { recipient_name: 'Revisi' });
    assert.equal(status, 400);
    assert.equal((await client(admin).get(`/api/orders/${o.id}/detail`)).data.recipient_name, 'Penerima Uji', 'data tidak berubah');
  });
  test('hapus order selesai (oleh admin sekalipun) → tolak', async () => {
    const o = await orderSelesai(admin);
    const { status } = await client(admin).del(`/api/orders/${o.id}`);
    assert.equal(status, 400);
    const { data: still } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.equal(still.status, 'selesai', 'order masih ada');
  });
  test('upload foto pada order selesai → tolak', async () => {
    const o = await orderSelesai(admin);
    const { status, data: r } = await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti-lagi.jpg' });
    assert.equal(status, 400);
    assert.match(r.error, /terkunci|Buka kembali/);
  });
  test('hapus foto pada order selesai → tolak', async () => {
    const o = await orderSelesai(admin);
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    const { status, data: r } = await client(admin).del(`/api/orders/${o.id}/photos/${d.photos[0].id}`);
    assert.equal(status, 400);
    assert.match(r.error, /Buka kembali/);
    const { data: before } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.ok(before.photos.some((f) => f.id === d.photos[0].id), 'foto tetap ada');
  });
  test('buka kembali lalu edit/hapus foto → boleh lagi', async () => {
    const o = await orderSelesai(admin);
    await client(admin).patch(`/api/orders/${o.id}/reopen`);
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    const { status } = await client(admin).del(`/api/orders/${o.id}/photos/${d.photos[0].id}`);
    assert.equal(status, 200);
  });
  test('nomor pesanan bentrok saat edit → tolak', async () => {
    const { data: a } = await client(admin).post('/api/orders', order({ product_id: produkCf5 }));
    const { data: b } = await client(admin).post('/api/orders', order({ product_id: produkCf5 }));
    const { status, data: r } = await client(admin).patch(`/api/orders/${b.id}`, { order_number: a.order_number });
    assert.equal(status, 400);
    assert.match(r.error, /sudah dipakai/);
  });
  test('nomor pesanan bentrok lewat spasi juga ditolak', async () => {
    const { data: a } = await client(admin).post('/api/orders', order({ product_id: produkCf5 }));
    const { data: b } = await client(admin).post('/api/orders', order({ product_id: produkCf5 }));
    // Tanpa trim di server, ' NOMOR ' lolos sebagai nomor berbeda.
    const { status, data: r } = await client(admin).patch(`/api/orders/${b.id}`, { order_number: `  ${a.order_number}  ` });
    assert.equal(status, 400);
    assert.match(r.error, /sudah dipakai/);
    const { data: after } = await client(admin).get(`/api/orders/${b.id}/detail`);
    assert.equal(after.order_number, b.order_number, 'nomor tidak berubah');
  });
  test('nomor pesanan kosong saat edit → tolak', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status } = await client(admin).patch(`/api/orders/${o.id}`, { order_number: '   ' });
    assert.equal(status, 400);
  });
  test('edit menyimpan nomor pesanan apa adanya (tanpa memotong awalan)', async () => {
    // Produk sendiri: kuota produk bawaan sudah terpakai tes-tes sebelumnya.
    const nama = `Produk Edit ${Date.now()}`;
    const { data: prods } = await client(admin).post('/api/products', { name: nama, quota: 5 });
    const pid = prods.find((p) => p.name === nama).id;
    const { data: o } = await client(admin).post('/api/orders', order({ product_id: pid }));
    const baru = `TRK-EDIT-${Date.now()}`;
    const { status, data: r } = await client(admin).patch(`/api/orders/${o.id}`, { order_number: baru });
    assert.equal(status, 200, `gagal: ${JSON.stringify(r)}`);
    assert.equal(r.order_number, baru, 'nomor tersimpan utuh');
  });
});

describe('CF6 Realtime', () => {
  test('mutasi order mengirim packages:changed', async () => {
    const token = await login('admin', 'admin');
    const socket = io('http://127.0.0.1:4099', { auth: { token } });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout connect socket')), 4000);
      socket.on('connect', () => { clearTimeout(t); resolve(); });
      socket.on('connect_error', (e) => { clearTimeout(t); reject(e); });
    });
    try {
      // Produk sendiri: kuota produk bawaan bisa habis oleh tes-tes sebelumnya,
      // membuat order gagal dibuat sehingga event tidak pernah terkirim.
      const nama = `Produk RT ${Date.now()}`;
      const { data: prods } = await client(token).post('/api/products', { name: nama, quota: 5 });
      const pid = prods.find((p) => p.name === nama).id;
      const got = new Promise((resolve) => socket.on('packages:changed', resolve));
      const dibuat = await client(token).post('/api/orders', order({ order_number: `TRK-RT-${Date.now()}`, product_id: pid }));
      assert.equal(dibuat.status, 201, `order uji gagal dibuat: ${JSON.stringify(dibuat.data)}`);
      const timer = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout event')), 4000));
      await Promise.race([got, timer]);
    } finally {
      socket.close();
    }
  });
});

describe('CF7 Analytics', () => {
  let admin;
  before(async () => { admin = await login('admin', 'admin'); });

  test('reports: totals + per trader + rekap produk + delayed', async () => {
    const { status, data } = await client(admin).get('/api/reports?range=bulan_ini');
    assert.equal(status, 200);
    assert.ok(data.totals.total >= 10);
    assert.ok(Array.isArray(data.perTrader) && data.perTrader.length >= 1);
    assert.ok(data.perTrader.every((t) => t.total === t.selesai + t.belum_selesai));
    assert.ok(Array.isArray(data.perProduk) && data.perProduk.length >= 1);
    assert.ok(Array.isArray(data.delayed));
    for (const t of data.perProduk) {
      assert.equal(typeof t.amount, 'number');
      assert.ok(typeof t.quota === 'number');
      assert.equal(t.remaining_quota, Math.max(0, t.quota - t.used_quota));
    }
  });
  test('reports rentang tak dikenal → ok (tanpa filter waktu)', async () => {
    const { status } = await client(admin).get('/api/reports?range=abc');
    assert.equal(status, 200);
  });
  test('reports oleh trader → hanya data miliknya (scoping, tanpa kebocoran)', async () => {
    const trader = await login('nabila', 'trader');
    const { status, data } = await client(trader).get('/api/reports');
    assert.equal(status, 200);
    assert.ok(data.totals.total >= 1, 'trader melihat laporannya sendiri');
    // Scoping: tidak boleh ada nama/trader lain di mana pun.
    assert.equal(data.perTrader.length, 1, 'rekap per trader hanya berisi dirinya');
    const myName = data.perTrader[0].trader;
    assert.ok(data.delayed.every((d) => d.trader === myName), 'daftar tertunda hanya order miliknya');
  });
  test('reports rentang khusus from/to membatasi hasil', async () => {
    // order dibuat 'sekarang'; rentang kemarin-hari ini pasti memuatnya,
    // rentang bulan lalu tidak.
    const d = new Date();
    const iso = (dt) => dt.toISOString();
    const fromToday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const toToday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const lastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const { status: s1, data: r1 } = await client(admin).get(`/api/reports?range=kustom&from=${encodeURIComponent(iso(fromToday))}&to=${encodeURIComponent(iso(toToday))}`);
    assert.equal(s1, 200);
    const { status: s2, data: r2 } = await client(admin).get(`/api/reports?range=kustom&from=${encodeURIComponent(iso(lastMonth))}&to=${encodeURIComponent(iso(new Date(d.getFullYear(), d.getMonth() - 1, 28)))}`);
    assert.equal(s2, 200);
    // rentang hari ini harus memuat order (seluruh suite membuat banyak order);
    // rentang bulan lalu yang sempit hampir pasti kosong — paling tidak
    // tidak lebih besar dari rentang hari ini.
    assert.ok(r1.totals.total > 0, 'rentang hari ini memuat order');
    assert.ok(r2.totals.total <= r1.totals.total, 'rentang bulan lalu <= hari ini');
  });
  test('reports from > to tetap ok (tanpa hasil)', async () => {
    const { status, data } = await client(admin).get('/api/reports?range=kustom&from=2026-01-02T00:00:00.000Z&to=2026-01-01T00:00:00.000Z');
    assert.equal(status, 200);
    assert.equal(data.totals.total, 0);
  });
  test('reports: delayed ikut dibatasi rentang from/to', async () => {
    // Buat order baru (updated_at = sekarang) supaya ada kandidat delayed.
    const o = await (await client(admin).post('/api/orders', order())).data;
    const { status: s, data: d } = await client(admin).get('/api/reports?range=kustom&from=2026-01-02T00:00:00.000Z&to=2026-01-01T00:00:00.000Z');
    assert.equal(s, 200);
    assert.equal(d.totals.total, 0);
    // Rentang yang tidak memuat order ini tidak boleh memuatnya di delayed.
    assert.ok(!d.delayed.some((x) => x.order_number === o.order_number), 'order di luar rentang tidak muncul di delayed');
    // Order yang baru dibuat masuk rentang today → boleh muncul di delayed bila pending.
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate() + 1);
    const { data: d2 } = await client(admin).get(`/api/reports?range=kustom&from=${encodeURIComponent(todayStart.toISOString())}&to=${encodeURIComponent(tomorrow.toISOString())}`);
    assert.ok(d2.totals.total >= 1, 'rentang hari ini memuat order baru');
  });
});

describe('CF8 Produk, toko marketplace & pengaturan', () => {
  let admin, trader;
  before(async () => { admin = await login('admin', 'admin'); trader = await login('nabila', 'trader'); });

  test('toko marketplace: tambah + duplikat → tolak + hapus', async () => {
    const name = `Toko QA ${Date.now()}`;
    const { status, data: created } = await client(admin).post('/api/marketplace-stores', { name });
    assert.equal(status, 201);
    assert.ok(created.some((s) => s.name === name));
    const dup = await client(admin).post('/api/marketplace-stores', { name });
    assert.equal(dup.status, 400);
    const target = created.find((s) => s.name === name);
    const del = await client(admin).del(`/api/marketplace-stores/${target.id}`);
    assert.equal(del.status, 200);
  });
  test('buat produk + nonaktifkan (bukan hapus)', async () => {
    const { status, data: created } = await client(admin).post('/api/products', { name: `Produk QA ${Date.now()}`, quota: 7 });
    assert.equal(status, 201);
    const newest = created[created.length - 1];
    assert.equal(newest.is_active, true);
    assert.equal(newest.quota, 7);
    assert.equal(newest.used_quota, 0);
    assert.equal(newest.remaining_quota, 7);
    const { data: after } = await client(admin).patch(`/api/products/${newest.id}`, { is_active: false });
    assert.equal(after.find((a) => a.id === newest.id).is_active, false);
  });
  test('produk memuat kuota terpakai & sisa', async () => {
    const { data } = await client(trader).get('/api/products');
    assert.ok(data.every((m) => typeof m.used_quota === 'number' && typeof m.remaining_quota === 'number'));
    const limited = data.find((m) => m.name === 'Produk Kuota Penuh');
    assert.ok(limited, 'produk kuota penuh ada di seed');
    assert.equal(limited.remaining_quota, 0);
  });
  test('kuota habis → tolak order + pesan rebutan', async () => {
    const { data: list } = await client(trader).get('/api/products');
    const limited = list.find((m) => m.name === 'Produk Kuota Penuh');
    const { status, data: err } = await client(trader).post('/api/orders', order({ product_id: limited.id }));
    assert.equal(status, 400);
    assert.match(err.error, /Kuota produk .* sudah habis/);
  });
  test('kuota per tipe barang dipakai lintas toko', async () => {
    const { data: stores } = await client(admin).get('/api/marketplace-stores');
    const { status, data: created } = await client(admin).post('/api/products', { name: `Produk Lintas Toko ${Date.now()}`, quota: 2 });
    const item = created.find((m) => m.name.startsWith('Produk Lintas Toko'));
    const storeA = stores[0];
    const storeB = stores[1] ?? stores[0];
    // Order di toko A memotong kuota produk.
    const s1 = await client(trader).post('/api/orders', order({ product_id: item.id, store_id: storeA.id }));
    assert.equal(s1.status, 201);
    // Order di toko B juga memotong kuota produk yang sama.
    const s2 = await client(trader).post('/api/orders', order({ product_id: item.id, store_id: storeB.id }));
    assert.equal(s2.status, 201);
    // Kuota habis → order ketiga di toko mana pun ditolak.
    const { status: s3, data: err } = await client(trader).post('/api/orders', order({ product_id: item.id, store_id: storeA.id }));
    assert.equal(s3, 400);
    assert.match(err.error, /Kuota produk .* sudah habis/);
    const { data: after } = await client(admin).get('/api/products');
    const full = after.find((m) => m.id === item.id);
    assert.equal(full.used_quota, 2);
    assert.equal(full.remaining_quota, 0);
  });
  test('kuota turun ketika order dibuat, kembali saat order dihapus', async () => {
    const { status, data: created } = await client(admin).post('/api/products', { name: `Produk Kuota Test ${Date.now()}`, quota: 1 });
    const item = created.find((m) => m.name.startsWith('Produk Kuota Test'));
    const { status: s1 } = await client(trader).post('/api/orders', order({ product_id: item.id }));
    assert.equal(s1, 201);
    const { data: after } = await client(admin).get('/api/products');
    const full = after.find((m) => m.id === item.id);
    assert.equal(full.used_quota, 1);
    assert.equal(full.remaining_quota, 0);
    // order kedua → kuota habis
    const { status: s2 } = await client(trader).post('/api/orders', order({ product_id: item.id }));
    assert.equal(s2, 400);
    // hapus order pertama → kuota kembali
    const { data: orders } = await client(trader).get('/api/orders');
    const mine = orders.items.find((o) => o.product_id === item.id);
    await client(trader).del(`/api/orders/${mine.id}`);
    const { data: restored } = await client(admin).get('/api/products');
    const freed = restored.find((m) => m.id === item.id);
    assert.equal(freed.remaining_quota, 1);
  });
  test('kuota tidak boleh di bawah order terpakai', async () => {
    const { data: list } = await client(admin).get('/api/products');
    const used = list.find((m) => m.used_quota > 0);
    const { status } = await client(admin).patch(`/api/products/${used.id}`, { quota: 0 });
    assert.equal(status, 400);
  });
  test('hapus produk: tanpa order → fisik; order aktif → tolak; semua selesai → soft delete', async () => {
    const mk = async (name) => (await client(admin).post('/api/products', { name, quota: 5 })).data.find((p) => p.name === name);

    // Tanpa order sama sekali → dihapus fisik dari daftar.
    const pEmpty = await mk(`Produk Hapus Kosong ${Date.now()}`);
    const delEmpty = await client(admin).del(`/api/products/${pEmpty.id}`);
    assert.equal(delEmpty.status, 200);
    assert.ok(!delEmpty.data.some((p) => p.id === pEmpty.id), 'produk tanpa order dihapus fisik');

    // Masih ada order aktif (data_masuk) → tolak.
    const pAct = await mk(`Produk Hapus Aktif ${Date.now()}`);
    const o1 = await client(trader).post('/api/orders', order({ product_id: pAct.id }));
    assert.equal(o1.status, 201);
    const delAct = await client(admin).del(`/api/products/${pAct.id}`);
    assert.equal(delAct.status, 400);
    assert.match(delAct.data.error, /order aktif/);

    // Semua order selesai → hapus boleh, tapi menjadi soft (nonaktif) karena order merujuk.
    const pDone = await mk(`Produk Hapus Selesai ${Date.now()}`);
    // Order harus menempuh alur penuh sampai selesai agar produk bisa di-soft delete.
    const o2 = { data: await orderReadyForPickup(trader, { product_id: pDone.id }) };
    await client(trader).post(`/api/orders/${o2.data.id}/pickup`, {});
    const up = await postMultipart(admin, `/api/orders/${o2.data.id}/photos`, { file: "bukti-selesai.jpg" }); assert.equal(up.status, 200);
    const dp = await markDonePickup(admin, o2.data.id);
    assert.equal(dp.status, 200);
    const comp = await client(admin).patch(`/api/orders/${o2.data.id}/complete`, { note: 'x' });
    assert.equal(comp.status, 200);
    const delDone = await client(admin).del(`/api/products/${pDone.id}`);
    assert.equal(delDone.status, 200);
    const doneRow = delDone.data.find((p) => p.id === pDone.id);
    assert.ok(doneRow, 'produk tetap ada (soft delete)');
    assert.equal(doneRow.is_active, false, 'soft delete menonaktifkan produk');
  });
  test('nama produk duplikat → tolak', async () => {
    // Seed sudah punya 'Wireless Keyboard K2'.
    const dup = await client(admin).post('/api/products', { name: 'Wireless Keyboard K2', quota: 3 });
    assert.equal(dup.status, 400);
  });
  test('tambah kuota atomic + reset kuota', async () => {
    const { data: created } = await client(admin).post('/api/products', { name: `Produk Kuota Atomic ${Date.now()}`, quota: 1 });
    const item = created.find((m) => m.name.startsWith('Produk Kuota Atomic'));
    const add1 = await client(admin).post(`/api/products/${item.id}/quota`, { amount: 10 });
    assert.equal(add1.status, 200);
    const afterAdd = add1.data.find((m) => m.id === item.id);
    assert.equal(afterAdd.quota, 11);
    const bad = await client(admin).post(`/api/products/${item.id}/quota`, { amount: 0 });
    assert.equal(bad.status, 400);
    const reset = await client(admin).post(`/api/products/${item.id}/reset-quota`);
    assert.equal(reset.status, 200);
    const afterReset = reset.data.find((m) => m.id === item.id);
    assert.equal(afterReset.quota, 0);
    assert.equal(afterReset.remaining_quota, 0);
  });
  test('buat produk oleh trader → 403', async () => {
    const { status } = await client(trader).post('/api/products', { name: 'X', quota: 1 });
    assert.equal(status, 403);
  });
  test('simpan pengaturan + aturan min_photos bukan nol', async () => {
    const { data: s } = await client(admin).get('/api/settings');
    assert.ok(s.min_photos >= 1);
    const { status: s1 } = await client(admin).patch('/api/settings', { min_photos: 0 });
    assert.equal(s1, 400);
    const { data: after } = await client(admin).patch('/api/settings', { pending_threshold_hours: 5 });
    assert.equal(after.pending_threshold_hours, 5);
    await client(admin).patch('/api/settings', { pending_threshold_hours: 3 });
  });
  test('simpan pengaturan oleh trader → 403', async () => {
    const { status } = await client(trader).patch('/api/settings', { min_photos: 2 });
    assert.equal(status, 403);
  });
});

describe('CF9 Gerbang versi aplikasi', () => {
  let admin, trader;
  before(async () => { admin = await login('admin', 'admin'); trader = await login('nabila', 'trader'); });
  // Selalu matikan gerbang setelah blok ini agar tidak mengganggu tes lain.
  after(async () => { await client(admin).patch('/api/settings', { required_app_version: '', app_update_url: '' }); });

  // Klien native: kirim header versi + platform seperti APK sungguhan.
  const nativeClient = (token, version, platform = 'android') => {
    const req = async (method, path) => {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-App-Version': version,
          'X-App-Platform': platform,
        },
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      return { status: res.status, data };
    };
    return { get: (p) => req('GET', p) };
  };

  test('info versi publik tanpa token', async () => {
    const res = await fetch(`${BASE}/api/app-version`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok('required_version' in body && 'update_url' in body);
  });

  test('gerbang mati saat versi wajib kosong', async () => {
    await client(admin).patch('/api/settings', { required_app_version: '' });
    const { status } = await nativeClient(admin, '0.0.1').get('/api/orders');
    assert.equal(status, 200, 'tanpa versi wajib tidak boleh memblokir');
  });

  test('versi APK tidak sama → 409 + link unduhan', async () => {
    await client(admin).patch('/api/settings', { required_app_version: '9.9.9', app_update_url: 'https://contoh.test/app.apk' });
    const { status, data } = await nativeClient(admin, '0.1.0').get('/api/orders');
    assert.equal(status, 409);
    assert.equal(data.code, 'APP_VERSION_MISMATCH');
    assert.equal(data.required_version, '9.9.9');
    assert.equal(data.update_url, 'https://contoh.test/app.apk');
  });

  test('versi APK sama persis → lolos', async () => {
    await client(admin).patch('/api/settings', { required_app_version: '9.9.9' });
    const { status } = await nativeClient(trader, '9.9.9').get('/api/orders');
    assert.equal(status, 200);
  });

  test('web tidak pernah diblokir walau versi beda', async () => {
    await client(admin).patch('/api/settings', { required_app_version: '9.9.9' });
    const { status } = await nativeClient(admin, '0.1.0', 'web').get('/api/orders');
    assert.equal(status, 200, 'web adalah jalur pemulihan admin');
    const { status: s2 } = await client(admin).get('/api/orders');
    assert.equal(s2, 200, 'klien tanpa header platform tidak diblokir');
  });

  test('jalur pemulihan admin tetap terbuka saat terblokir', async () => {
    await client(admin).patch('/api/settings', { required_app_version: '9.9.9' });
    const c = nativeClient(admin, '0.1.0');
    // Tanpa ini, versi wajib yang salah ketik akan mengunci admin selamanya.
    assert.equal((await c.get('/api/settings')).status, 200, 'settings wajib lolos');
    assert.equal((await c.get('/api/session')).status, 200, 'session wajib lolos');
    assert.equal((await c.get('/api/app-version')).status, 200, 'app-version wajib lolos');
    const res = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Version': '0.1.0', 'X-App-Platform': 'android' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    assert.equal(res.status, 200, 'login wajib lolos');
  });

  test('mengosongkan versi wajib membatalkan blokir', async () => {
    await client(admin).patch('/api/settings', { required_app_version: '9.9.9' });
    assert.equal((await nativeClient(admin, '0.1.0').get('/api/orders')).status, 409);
    await client(admin).patch('/api/settings', { required_app_version: '' });
    assert.equal((await nativeClient(admin, '0.1.0').get('/api/orders')).status, 200);
  });

  test('format versi & link divalidasi', async () => {
    const bad = await client(admin).patch('/api/settings', { required_app_version: 'versi-terbaru' });
    assert.equal(bad.status, 400);
    assert.match(bad.data.error, /1\.2\.0/);
    const badUrl = await client(admin).patch('/api/settings', { app_update_url: 'drive.google.com/x' });
    assert.equal(badUrl.status, 400);
    assert.match(badUrl.data.error, /http/);
    const okUrl = await client(admin).patch('/api/settings', { app_update_url: 'https://contoh.test/a.apk' });
    assert.equal(okUrl.status, 200);
  });

  test('trader tidak bisa mengubah versi wajib', async () => {
    const { status } = await client(trader).patch('/api/settings', { required_app_version: '1.0.0' });
    assert.equal(status, 403);
  });
});

describe('CF10 Superadmin', () => {
  let sa, adminBiasa, trader, adminId;
  before(async () => {
    sa = await login('admin', 'admin'); // akun bawaan → superadmin
    trader = await login('nabila', 'trader');
    // Admin biasa dibuat oleh superadmin untuk menguji batas hak akses.
    const u = `adm_${Date.now()}`;
    const { data } = await client(sa).post('/api/users', { username: u, password: 'pw', display_name: 'Admin Biasa', role: 'admin' });
    adminId = data.id;
    adminBiasa = await login(u, 'pw');
  });
  after(async () => {
    await client(sa).patch('/api/settings', { required_app_version: '', app_update_url: '' });
  });

  test('superadmin punya semua akses admin', async () => {
    assert.equal((await client(sa).get('/api/users')).status, 200);
    assert.equal((await client(sa).get('/api/orders')).status, 200);
    assert.equal((await client(sa).get('/api/products')).status, 200);
    assert.equal((await client(sa).get('/api/reports')).status, 200);
    const { status } = await client(sa).post('/api/products', { name: `P-SA-${Date.now()}`, quota: 3 });
    assert.equal(status, 201, 'superadmin bisa membuat produk seperti admin');
  });

  test('hanya superadmin yang bisa mengubah setelan versi', async () => {
    const okSa = await client(sa).patch('/api/settings', { required_app_version: '3.3.3' });
    assert.equal(okSa.status, 200);
    assert.equal(okSa.data.required_app_version, '3.3.3');

    const ditolak = await client(adminBiasa).patch('/api/settings', { required_app_version: '4.4.4' });
    assert.equal(ditolak.status, 403);
    assert.match(ditolak.data.error, /superadmin/i);

    const linkDitolak = await client(adminBiasa).patch('/api/settings', { app_update_url: 'https://x.test/a.apk' });
    assert.equal(linkDitolak.status, 403);

    assert.equal((await client(trader).patch('/api/settings', { required_app_version: '5.5.5' })).status, 403);
    // nilai tidak berubah oleh percobaan yang ditolak
    assert.equal((await client(sa).get('/api/settings')).data.required_app_version, '3.3.3');
  });

  test('admin biasa tetap bisa mengubah setelan operasional', async () => {
    const { status, data } = await client(adminBiasa).patch('/api/settings', { pending_threshold_hours: 4 });
    assert.equal(status, 200, 'pembatasan hanya untuk setelan versi');
    assert.equal(data.pending_threshold_hours, 4);
    await client(adminBiasa).patch('/api/settings', { pending_threshold_hours: 3 });
  });

  test('setelan versi tersembunyi dari non-superadmin', async () => {
    await client(sa).patch('/api/settings', { required_app_version: '3.3.3', app_update_url: 'https://x.test/a.apk' });
    const s1 = (await client(sa).get('/api/settings')).data;
    assert.ok('required_app_version' in s1 && 'app_update_url' in s1, 'superadmin melihat setelan versi');

    const s2 = (await client(adminBiasa).get('/api/settings')).data;
    assert.ok(!('required_app_version' in s2), 'admin biasa tidak melihat versi wajib');
    assert.ok(!('app_update_url' in s2), 'admin biasa tidak melihat link unduhan');

    const s3 = (await client(trader).get('/api/settings')).data;
    assert.ok(!('required_app_version' in s3) && !('app_update_url' in s3), 'trader tidak melihat setelan versi');
    // Setelan operasional tetap terbaca semua role.
    assert.ok(typeof s3.min_photos === 'number');
  });

  test('popup pembaruan tetap dapat data lewat endpoint publik', async () => {
    await client(sa).patch('/api/settings', { required_app_version: '3.3.3', app_update_url: 'https://x.test/a.apk' });
    const res = await fetch(`${BASE}/api/app-version`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.required_version, '3.3.3');
    assert.equal(body.update_url, 'https://x.test/a.apk', 'link tetap terkirim walau tanpa login');
  });

  test('admin biasa tidak bisa membuat atau mengangkat superadmin', async () => {
    const buat = await client(adminBiasa).post('/api/users', {
      username: `sa_${Date.now()}`, password: 'pw', display_name: 'Coba SA', role: 'superadmin',
    });
    assert.equal(buat.status, 403);
    assert.match(buat.data.error, /superadmin/i);

    const { data: target } = await client(sa).post('/api/users', {
      username: `t_${Date.now()}`, password: 'pw', display_name: 'Target', role: 'trader',
    });
    const angkat = await client(adminBiasa).patch(`/api/users/${target.id}`, { role: 'superadmin' });
    assert.equal(angkat.status, 403, 'admin tidak boleh mengangkat dirinya/orang lain jadi superadmin');
    await client(sa).del(`/api/users/${target.id}`);
  });

  test('admin biasa tidak bisa menyentuh akun superadmin', async () => {
    const { data: users } = await client(sa).get('/api/users');
    const saUser = users.find((u) => u.role === 'superadmin');
    assert.ok(saUser, 'akun superadmin ada');

    const ubah = await client(adminBiasa).patch(`/api/users/${saUser.id}`, { display_name: 'Diretas' });
    assert.equal(ubah.status, 403);
    const nonaktif = await client(adminBiasa).patch(`/api/users/${saUser.id}`, { is_active: false });
    assert.equal(nonaktif.status, 403);
    const hapus = await client(adminBiasa).del(`/api/users/${saUser.id}`);
    assert.equal(hapus.status, 403);
  });

  test('superadmin terakhir tidak bisa diturunkan, dinonaktifkan, atau dihapus', async () => {
    const { data: users } = await client(sa).get('/api/users');
    const saUser = users.find((u) => u.role === 'superadmin');
    // Diri sendiri: role ditolak lebih dulu oleh aturan "ubah role sendiri".
    const turun = await client(sa).patch(`/api/users/${saUser.id}`, { role: 'admin' });
    assert.equal(turun.status, 400);
    const hapus = await client(sa).del(`/api/users/${saUser.id}`);
    assert.equal(hapus.status, 400, 'tanpa proteksi ini setelan versi terkunci selamanya');
  });

  test('superadmin bisa mengangkat & menurunkan superadmin lain', async () => {
    const u = `sa2_${Date.now()}`;
    const { status: s1, data: baru } = await client(sa).post('/api/users', {
      username: u, password: 'pw', display_name: 'SA Kedua', role: 'superadmin',
    });
    assert.equal(s1, 201);

    // Superadmin kedua ini juga bisa mengubah setelan versi.
    const sa2 = await login(u, 'pw');
    assert.equal((await client(sa2).patch('/api/settings', { required_app_version: '3.3.3' })).status, 200);

    // Karena bukan yang terakhir, boleh diturunkan lalu dibersihkan.
    assert.equal((await client(sa).patch(`/api/users/${baru.id}`, { role: 'trader' })).status, 204);
    assert.equal((await client(sa).del(`/api/users/${baru.id}`)).status, 204);
  });

  test('admin biasa tetap tunduk aturan admin terakhir', async () => {
    const { status } = await client(sa).del(`/api/users/${adminId}`);
    assert.equal(status, 204, 'admin biasa boleh dihapus selagi masih ada superadmin');
  });
});

describe('CF11 Alur done pickup', () => {
  let admin, trader, produkUji;
  before(async () => {
    admin = await login('admin', 'admin');
    trader = await login('nabila', 'trader');
    // Produk sendiri berkuota longgar: produk bawaan sudah terpakai tes lain.
    const nama = `Produk Alur ${Date.now()}`;
    const { data } = await client(admin).post('/api/products', { name: nama, quota: 50 });
    produkUji = data.find((p) => p.name === nama).id;
  });

  test('rantai lengkap: data_masuk → proses_pick_up → done_pickup → selesai', async () => {
    const o = await orderReadyForPickup(admin, { product_id: produkUji });
    assert.equal((await client(admin).get(`/api/orders/${o.id}/detail`)).data.status, 'data_masuk');

    const pk = await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    assert.equal(pk.data.status, 'proses_pick_up');

    const dp = await markDonePickup(admin, o.id);
    assert.equal(dp.status, 200);
    assert.equal(dp.data.status, 'done_pickup');
    assert.ok(dp.data.picked_up_at, 'waktu pengambilan tercatat');

    const sel = await client(admin).patch(`/api/orders/${o.id}/complete`, { note: 'ok' });
    assert.equal(sel.data.status, 'selesai');

    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.ok(d.events.some((e) => e.to_status === 'done_pickup'), 'transisi done_pickup tercatat di riwayat');
  });

  test('proses_pick_up → selesai langsung ditolak (wajib lewat done pickup)', async () => {
    const o = await orderReadyForPickup(admin, { product_id: produkUji });
    await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti.jpg' });

    const viaComplete = await client(admin).patch(`/api/orders/${o.id}/complete`, { note: 'x' });
    assert.equal(viaComplete.status, 400);
    assert.match(viaComplete.data.error, /Done pickup/i);

    const viaStatus = await client(admin).patch(`/api/orders/${o.id}/status`, { to_status: 'selesai' });
    assert.equal(viaStatus.status, 400);

    assert.equal((await client(admin).get(`/api/orders/${o.id}/detail`)).data.status, 'proses_pick_up', 'status tidak berubah');
  });

  test('done_pickup hanya dari proses_pick_up', async () => {
    const o = await orderReadyForPickup(admin, { product_id: produkUji }); // masih data_masuk
    const { status, data } = await markDonePickup(admin, o.id);
    assert.equal(status, 400);
    assert.match(data.error, /Proses pick up/i);
  });

  test('done_pickup tanpa foto sama sekali → 400', async () => {
    const o = await orderReadyForPickup(admin, { product_id: produkUji });
    await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    const nol = await markDonePickup(admin, o.id, 0);
    assert.equal(nol.status, 400);
    assert.match(nol.data.error, /minimal 1 foto/i);
    assert.equal((await client(admin).get(`/api/orders/${o.id}/detail`)).data.status, 'proses_pick_up', 'status tidak berubah');
  });

  test('done_pickup menerima 1 foto (batas minimum)', async () => {
    const o = await orderReadyForPickup(admin, { product_id: produkUji });
    await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    const satu = await markDonePickup(admin, o.id, 1);
    assert.equal(satu.status, 200, '1 foto sudah memenuhi syarat');
    assert.equal(satu.data.status, 'done_pickup');
  });

  test('done_pickup memakai foto yang sudah dilampirkan lewat galeri', async () => {
    const o = await orderReadyForPickup(admin, { product_id: produkUji });
    await client(admin).post(`/api/orders/${o.id}/pickup`, {});

    // Admin melampirkan bukti lebih dulu lewat galeri (POST /photos).
    const fd = new FormData();
    fd.append('photo', jpegBlob('galeri.jpg'), 'galeri.jpg');
    fd.append('source', 'pickup_evidence');
    const up = await fetch(`${BASE}/api/orders/${o.id}/photos`, {
      method: 'POST', headers: { Authorization: `Bearer ${admin}` }, body: fd,
    });
    assert.equal(up.status, 200);
    const { data: sebelum } = await client(admin).get(`/api/orders/${o.id}/detail`);
    const jumlahSebelum = sebelum.photo_count;

    // Tandai TANPA berkas baru — inti perbaikan: tidak membuka picker lagi.
    const dp = await markDonePickup(admin, o.id, 0);
    assert.equal(dp.status, 200, 'bukti yang sudah ada dihitung');
    assert.equal(dp.data.status, 'done_pickup');
    assert.equal(dp.data.photo_count, jumlahSebelum, 'photo_count tidak naik tanpa berkas baru');

    const { data: sesudah } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.equal(
      sesudah.photos.filter((p) => p.source === 'pickup_evidence').length, 1,
      'foto tidak terduplikasi',
    );
  });

  test('foto pengambilan dibatasi 3 per order', async () => {
    const o = await orderReadyForPickup(admin, { product_id: produkUji });
    await client(admin).post(`/api/orders/${o.id}/pickup`, {});

    const unggahGaleri = async (name) => {
      const fd = new FormData();
      fd.append('photo', jpegBlob(name), name);
      fd.append('source', 'pickup_evidence');
      const res = await fetch(`${BASE}/api/orders/${o.id}/photos`, {
        method: 'POST', headers: { Authorization: `Bearer ${admin}` }, body: fd,
      });
      return res.status;
    };
    assert.equal(await unggahGaleri('g1.jpg'), 200);
    assert.equal(await unggahGaleri('g2.jpg'), 200);
    assert.equal(await unggahGaleri('g3.jpg'), 200);
    assert.equal(await unggahGaleri('g4.jpg'), 400, 'foto keempat ditolak');

    // Sudah 3 bukti; kirim 1 lagi lewat done-pickup → total 4, ditolak.
    const lebih = await markDonePickup(admin, o.id, 1);
    assert.equal(lebih.status, 400);
    assert.match(lebih.data.error, /Maksimal 3 foto pengambilan/i);

    // Tanpa berkas baru → tepat 3, diterima.
    const pas = await markDonePickup(admin, o.id, 0);
    assert.equal(pas.status, 200);
  });

  test('foto pengambilan membeku di done_pickup, cair lagi setelah reopen', async () => {
    const o = await orderReadyForPickup(admin, { product_id: produkUji });
    await client(admin).post(`/api/orders/${o.id}/pickup`, {});

    const unggahAmbilan = async (name) => {
      const fd = new FormData();
      fd.append('photo', jpegBlob(name), name);
      fd.append('source', 'pickup_evidence');
      const res = await fetch(`${BASE}/api/orders/${o.id}/photos`, {
        method: 'POST', headers: { Authorization: `Bearer ${admin}` }, body: fd,
      });
      return { status: res.status, data: await res.json().catch(() => null) };
    };

    // Saat proses_pick_up → boleh.
    assert.equal((await unggahAmbilan('beku-1.jpg')).status, 200);

    // Setelah ditandai sudah diambil → membeku, sejalan dengan aturan hapus.
    assert.equal((await markDonePickup(admin, o.id, 0)).status, 200);
    const beku = await unggahAmbilan('beku-2.jpg');
    assert.equal(beku.status, 400, 'tidak bisa menambah foto setelah done_pickup');
    assert.match(beku.data.error, /Proses pick up/i);
    const { data: tetap } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.equal(
      tetap.photos.filter((p) => p.source === 'pickup_evidence').length, 1,
      'jumlah bukti tidak bertambah',
    );

    // Reopen (hanya dari selesai) mengembalikan ke proses_pick_up → cair lagi.
    assert.equal((await client(admin).patch(`/api/orders/${o.id}/complete`, { note: 'x' })).status, 200);
    const ro = await client(admin).patch(`/api/orders/${o.id}/reopen`);
    assert.equal(ro.status, 200);
    assert.equal(ro.data.status, 'proses_pick_up');
    assert.equal((await unggahAmbilan('beku-3.jpg')).status, 200, 'setelah reopen boleh menambah lagi');
  });

  test('trader tidak bisa menandai done pickup maupun menyelesaikan', async () => {
    const o = await orderReadyForPickup(trader, { product_id: produkUji });
    await client(trader).post(`/api/orders/${o.id}/pickup`, {});

    const dp = await markDonePickup(trader, o.id);
    assert.equal(dp.status, 403, 'hanya admin yang boleh menandai sudah diambil');

    assert.equal((await markDonePickup(admin, o.id)).status, 200, 'admin menandai');
    const sel = await client(trader).patch(`/api/orders/${o.id}/complete`, { note: 'x' });
    assert.equal(sel.status, 403, 'hanya admin yang boleh menyelesaikan');
  });

  test('filter & laporan mengenali done_pickup', async () => {
    await orderDonePickup(admin, { product_id: produkUji });
    const f = await client(admin).get('/api/orders?status=done_pickup');
    assert.equal(f.status, 200);
    assert.ok(f.data.total >= 1);
    assert.ok(f.data.items.every((o) => o.status === 'done_pickup'));

    const rep = await client(admin).get('/api/reports');
    assert.equal(typeof rep.data.totals.done_pickup, 'number', 'totals memuat done_pickup');
    assert.ok(rep.data.totals.done_pickup >= 1);
  });

  test('reopen dari selesai kembali ke proses_pick_up', async () => {
    const o = await orderSelesai(admin, 'x', { product_id: produkUji });
    const { data: r } = await client(admin).patch(`/api/orders/${o.id}/reopen`);
    assert.equal(r.status, 'proses_pick_up');
    assert.equal(r.completed_at, null);
  });

  test('status tak dikenal tetap ditolak', async () => {
    const o = await orderReadyForPickup(admin, { product_id: produkUji });
    const { status } = await client(admin).patch(`/api/orders/${o.id}/status`, { to_status: 'done' });
    assert.equal(status, 400);
  });
  test('PATCH /status ke done_pickup → 400 (wajib lewat unggahan 2 foto)', async () => {
    const o = await orderReadyForPickup(admin, { product_id: produkUji });
    await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    const { status, data } = await client(admin).patch(`/api/orders/${o.id}/status`, { to_status: 'done_pickup' });
    assert.equal(status, 400);
    assert.match(data.error, /2 foto pengambilan/i);
    assert.equal((await client(admin).get(`/api/orders/${o.id}/detail`)).data.status, 'proses_pick_up');
  });
  /** Unggah foto dengan source tertentu sebagai aktor mana pun. */
  const unggahFoto = async (token, orderId, source, name = 'ambilan.jpg') => {
    const fd = new FormData();
    fd.append('photo', jpegBlob(name), name);
    if (source) fd.append('source', source);
    const res = await fetch(`${BASE}/api/orders/${orderId}/photos`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    });
    return res.status;
  };

  test('foto pengambilan hanya boleh diinput admin — trader ditolak', async () => {
    const o = await orderReadyForPickup(trader, { product_id: produkUji });
    await client(trader).post(`/api/orders/${o.id}/pickup`, {});

    // Trader tidak boleh melampirkan foto pengambilan, walau order miliknya.
    assert.equal(
      await unggahFoto(trader, o.id, 'pickup_evidence'), 403,
      'trader ditolak melampirkan foto pengambilan',
    );
    const { data: kosong } = await client(trader).get(`/api/orders/${o.id}/detail`);
    assert.ok(!kosong.photos.some((p) => p.source === 'pickup_evidence'), 'tidak ada foto pengambilan tersimpan');

    // Admin boleh.
    assert.equal(await unggahFoto(admin, o.id, 'pickup_evidence'), 200, 'admin boleh melampirkan');
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    const foto = d.photos.find((p) => p.source === 'pickup_evidence');
    assert.ok(foto, 'foto pengambilan tersimpan');

    // Trader tidak boleh menghapusnya meski order masih proses_pick_up.
    const delTrader = await client(trader).del(`/api/orders/${o.id}/photos/${foto.id}`);
    assert.equal(delTrader.status, 403, 'trader ditolak menghapus foto pengambilan');

    // Admin boleh menghapus selama masih proses_pick_up.
    const delAdmin = await client(admin).del(`/api/orders/${o.id}/photos/${foto.id}`);
    assert.equal(delAdmin.status, 200, 'admin hapus foto pengambilan sebelum done_pickup');

    // Setelah done_pickup → terkunci, admin pun ditolak.
    await markDonePickup(admin, o.id);
    const { data: d2 } = await client(admin).get(`/api/orders/${o.id}/detail`);
    const terkunci = d2.photos.find((p) => p.source === 'pickup_evidence');
    const delKunci = await client(admin).del(`/api/orders/${o.id}/photos/${terkunci.id}`);
    assert.equal(delKunci.status, 400, 'foto pengambilan tidak bisa dihapus setelah done_pickup');
  });

  test('trader tetap bisa MELIHAT foto pengambilan di order miliknya', async () => {
    const o = await orderReadyForPickup(trader, { product_id: produkUji });
    await client(trader).post(`/api/orders/${o.id}/pickup`, {});
    await markDonePickup(admin, o.id);

    const { status, data } = await client(trader).get(`/api/orders/${o.id}/detail`);
    assert.equal(status, 200);
    const terlihat = data.photos.filter((p) => p.source === 'pickup_evidence');
    assert.equal(terlihat.length, 2, 'trader melihat kedua foto pengambilan (read-only)');
    assert.ok(terlihat.every((p) => p.file_path), 'file_path tersedia untuk pratinjau');
  });

  test('trader tetap boleh unggah foto bukti biasa (bukan pengambilan)', async () => {
    const o = await orderReadyForPickup(trader, { product_id: produkUji });
    await client(trader).post(`/api/orders/${o.id}/pickup`, {});
    assert.equal(await unggahFoto(trader, o.id, null, 'bukti-biasa.jpg'), 200, 'foto bukti biasa tidak terdampak');
  });
});

describe('CF12 Urutan kanban: geser status naik, unggah foto tidak', () => {
  let admin, produkUrut;
  before(async () => {
    admin = await login('admin', 'admin');
    await initOrderDefaults(admin);
    // Produk sendiri berkuota lega: suite lain sudah menghabiskan kuota produk
    // bawaan, dan order yang gagal dibuat membuat asersi urutan tidak berarti.
    const nama = `Produk Urutan ${Date.now()}`;
    // POST /products membalas daftar produk terbaru, bukan satu objek.
    const { data } = await client(admin).post('/api/products', { name: nama, quota: 50 });
    produkUrut = data.find((p) => p.name === nama).id;
  });

  const orderUrut = async () => {
    const { status, data } = await client(admin).post('/api/orders', order({ product_id: produkUrut }));
    assert.equal(status, 201, 'order uji dibuat');
    await attachBarcode(admin, data.id);
    await attachOrderProof(admin, data.id);
    return data;
  };

  // Daftar order dibatasi per_page, dan suite lain sudah membuat banyak order,
  // jadi urutan diuji relatif antar dua order uji — bukan lewat indeks absolut.
  const urutanRelatif = async (token, idA, idB) => {
    const { data } = await client(token).get('/api/orders?per_page=200');
    const pos = (id) => data.items.findIndex((x) => x.id === id);
    return { a: pos(idA), b: pos(idB) };
  };

  test('geser status → order naik di atas order yang lebih baru', async () => {
    const lama = await orderUrut();
    const baru = await orderUrut();
    const awal = await urutanRelatif(admin, lama.id, baru.id);
    assert.ok(awal.a >= 0 && awal.b >= 0, 'kedua order uji ada di halaman pertama');
    assert.ok(awal.a > awal.b, 'mula-mula order lama berada di bawah order baru');

    const pu = await client(admin).post(`/api/orders/${lama.id}/pickup`, {});
    assert.equal(pu.status, 200);
    const akhir = await urutanRelatif(admin, lama.id, baru.id);
    assert.ok(akhir.a < akhir.b, 'setelah digeser, order lama naik di atas order baru');
    assert.equal(akhir.a, 0, 'order yang baru digeser berada di puncak');
  });

  test('unggah foto TIDAK mengubah urutan', async () => {
    const bawah = await orderUrut();
    await client(admin).post(`/api/orders/${bawah.id}/pickup`, {});
    const atas = await orderUrut();
    await client(admin).post(`/api/orders/${atas.id}/pickup`, {});
    const sebelum = await urutanRelatif(admin, bawah.id, atas.id);
    assert.ok(sebelum.a > sebelum.b, 'order uji berada di bawah order pembanding');

    const up = await postMultipart(admin, `/api/orders/${bawah.id}/photos`, { file: 'urutan.jpg' });
    assert.equal(up.status, 200, 'foto terunggah');
    const sesudah = await urutanRelatif(admin, bawah.id, atas.id);
    assert.ok(sesudah.a > sesudah.b, 'unggah foto tidak menaikkan order ke atas');
  });

  test('unggah foto tidak me-reset jam tertunda (status_changed_at)', async () => {
    const o = await orderUrut();
    const { data: sebelum } = await client(admin).get(`/api/orders/${o.id}/detail`);
    const stamp = sebelum.status_changed_at;
    assert.ok(stamp, 'status_changed_at tersedia di view');

    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'tunda.jpg' });
    const { data: sesudah } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.equal(sesudah.status_changed_at, stamp, 'stempel status tidak bergerak karena foto');

    await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    const { data: digeser } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.notEqual(digeser.status_changed_at, stamp, 'stempel status bergerak saat status berubah');
  });
});
