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
    assert.equal(data.role, 'admin');
  });
  test('trader akses endpoint admin → 403', async () => {
    for (const p of ['/api/users', '/api/reports?range=bulan_ini']) {
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
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status, data: r } = await postMultipart(admin, '/api/orders/scan', { code: o.order_number, file: 'scan.jpg' });
    assert.equal(status, 200);
    assert.equal(r.status, 'proses_pick_up');
    assert.ok(r.picked_up_at);
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.ok(d.events.some((e) => e.event_type === 'picked_up'));
    assert.ok(d.photos.some((p) => p.source === 'pickup'), 'foto barcode pengambilan tersimpan');
  });
  test('scan tanpa foto pada order data_masuk → 400 (foto wajib)', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status, data: r } = await client(admin).post('/api/orders/scan', { code: o.order_number });
    assert.equal(status, 400);
    assert.match(r.error, /Foto barcode/);
    // order tidak berubah status
    const { data: after } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.equal(after.status, 'data_masuk');
  });
  test('scan tanpa foto pada order yang sudah punya barcode → izinkan', async () => {
    const { data: o } = await client(trader).post('/api/orders', order());
    // attach barcode
    const fd = new FormData();
    fd.append('photo', jpegBlob('barcode.jpg'));
    await fetch(`${BASE}/api/orders/${o.id}/barcode`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${trader}` },
      body: fd,
    });
    // scan tanpa foto — barcode_path sudah ada → izinkan
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

  test('POST /orders/:id/pickup tanpa foto → 400', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status, data: r } = await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    assert.equal(status, 400);
    assert.match(r.error, /Foto barcode/);
  });
  test('POST /orders/:id/pickup tanpa foto saat barcode sudah terpasang → izinkan', async () => {
    const { data: o } = await client(trader).post('/api/orders', order());
    // lampirkan barcode pengambilan dulu
    const fd = new FormData();
    fd.append('photo', jpegBlob('barcode.jpg'));
    await fetch(`${BASE}/api/orders/${o.id}/barcode`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${trader}` },
      body: fd,
    });
    // pickup tanpa foto baru — barcode_path sudah ada
    const { status, data: r } = await client(admin).post(`/api/orders/${o.id}/pickup`, {});
    assert.equal(status, 200);
    assert.equal(r.status, 'proses_pick_up');
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.ok(d.events.some((e) => e.event_type === 'picked_up'));
    assert.equal(d.photos.length, 0, 'tidak ada foto baru ditambahkan');
  });
  test('POST /orders/:id/pickup dengan foto → proses_pick_up + event + foto pickup', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status, data: r } = await postMultipart(admin, `/api/orders/${o.id}/pickup`, { file: 'barcode-ambil.jpg' });
    assert.equal(status, 200);
    assert.equal(r.status, 'proses_pick_up');
    assert.ok(r.picked_up_at);
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.ok(d.photos.some((p) => p.source === 'pickup'));
    assert.ok(d.events.some((e) => e.event_type === 'picked_up' && e.note === 'Proses pick up'));
  });
  test('POST /orders/:id/pickup tanpa foto saat ada foto bukti sudah diupload → izinkan', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    // upload foto bukti (via /photos) dulu
    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti.jpg' });
    // pickup tanpa foto baru — sudah ada 1 foto bukti
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
    const { data: o } = await client(trader).post('/api/orders', order());
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
    assert.match(r.error, /Foto barcode/);
  });
  test('trader proses pick up tanpa foto saat barcode sudah terpasang → izinkan', async () => {
    const { data: o } = await client(trader).post('/api/orders', order());
    const fd = new FormData();
    fd.append('photo', jpegBlob('barcode.jpg'));
    await fetch(`${BASE}/api/orders/${o.id}/barcode`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${trader}` },
      body: fd,
    });
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
  test('lampirkan barcode pada order bukan Data masuk → 400', async () => {
    const { data: list } = await client(admin).get('/api/orders?status=proses_pick_up');
    const o = list.items[0];
    const res = await fetch(`${BASE}/api/orders/${o.id}/barcode`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin}` },
      body: (() => { const fd = new FormData(); fd.append('photo', jpegBlob('b.jpg')); return fd; })(),
    });
    assert.equal(res.status, 400);
  });
});

describe('CF5 Detail & penyelesaian dengan foto', () => {
  let admin, trader;
  before(async () => { admin = await login('admin', 'admin'); trader = await login('nabila', 'trader'); });

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
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status, data: err } = await client(admin).patch(`/api/orders/${o.id}/complete`, { note: 'x' });
    assert.equal(status, 400);
    assert.match(err.error, /foto bukti/);
  });
  test('complete dengan foto → selesai + note + event', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti.jpg' });
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
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status: s1 } = await client(admin).patch(`/api/orders/${o.id}/problem`, { reason: '' });
    assert.equal(s1, 400);
    const { data: r } = await client(admin).patch(`/api/orders/${o.id}/problem`, { reason: 'Paket hilang' });
    assert.equal(r.is_problem, true);
    assert.equal(r.problem_reason, 'Paket hilang');
  });
  test('buka kembali order selesai', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti.jpg' });
    await client(admin).patch(`/api/orders/${o.id}/complete`, { note: 'x' });
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
    const { data: o } = await client(admin).post('/api/orders', order());
    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti.jpg' });
    await client(admin).patch(`/api/orders/${o.id}/complete`, { note: 'x' });
    const { status } = await client(admin).patch(`/api/orders/${o.id}`, { recipient_name: 'Revisi' });
    assert.equal(status, 400);
    assert.equal((await client(admin).get(`/api/orders/${o.id}/detail`)).data.recipient_name, 'Penerima Uji', 'data tidak berubah');
  });
  test('hapus order selesai (oleh admin sekalipun) → tolak', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti.jpg' });
    await client(admin).patch(`/api/orders/${o.id}/complete`, { note: 'x' });
    const { status } = await client(admin).del(`/api/orders/${o.id}`);
    assert.equal(status, 400);
    const { data: still } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.equal(still.status, 'selesai', 'order masih ada');
  });
  test('upload foto pada order selesai → tolak', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti.jpg' });
    await client(admin).patch(`/api/orders/${o.id}/complete`, { note: 'x' });
    const { status, data: r } = await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti-lagi.jpg' });
    assert.equal(status, 400);
    assert.match(r.error, /terkunci|Buka kembali/);
  });
  test('hapus foto pada order selesai → tolak', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti.jpg' });
    await client(admin).patch(`/api/orders/${o.id}/complete`, { note: 'x' });
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    const { status, data: r } = await client(admin).del(`/api/orders/${o.id}/photos/${d.photos[0].id}`);
    assert.equal(status, 400);
    assert.match(r.error, /Buka kembali/);
    const { data: after } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.equal(after.photo_count, 1, 'foto tetap ada');
  });
  test('buka kembali lalu edit/hapus foto → boleh lagi', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    await postMultipart(admin, `/api/orders/${o.id}/photos`, { file: 'bukti.jpg' });
    await client(admin).patch(`/api/orders/${o.id}/complete`, { note: 'x' });
    await client(admin).patch(`/api/orders/${o.id}/reopen`);
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    const { status } = await client(admin).del(`/api/orders/${o.id}/photos/${d.photos[0].id}`);
    assert.equal(status, 200);
  });
  test('nomor pesanan bentrok saat edit → tolak', async () => {
    const { data: a } = await client(admin).post('/api/orders', order());
    const { data: b } = await client(admin).post('/api/orders', order());
    const { status, data: r } = await client(admin).patch(`/api/orders/${b.id}`, { order_number: a.order_number });
    assert.equal(status, 400);
    assert.match(r.error, /sudah dipakai/);
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
      const got = new Promise((resolve) => socket.on('packages:changed', resolve));
      await client(token).post('/api/orders', order({ order_number: `TRK-RT-${Date.now()}` }));
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
  test('reports oleh trader → 403', async () => {
    const trader = await login('nabila', 'trader');
    const { status } = await client(trader).get('/api/reports?range=bulan_ini');
    assert.equal(status, 403);
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
