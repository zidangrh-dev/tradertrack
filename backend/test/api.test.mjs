// Suite uji API TraderTrack — memetakan Core Features (PRD §3), User Flow (§4),
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
      if (r.ok) return;
    } catch { /* belum siap */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Server uji tidak mau mulai.');
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

const order = (over = {}) => ({
  product_name: 'Produk Uji', store_name: 'Toko Uji', order_number: `TRK-IT-${Date.now()}-${seq++}`,
  recipient_name: 'Penerima Uji', pickup_method: 'zaydan_ambilan_gjm', bank_account_id: 'bca-dimas',
  ...over,
});

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
    for (const missing of ['product_name', 'store_name', 'order_number', 'recipient_name', 'bank_account_id']) {
      const { status } = await client(trader).post('/api/orders', order({ [missing]: undefined }));
      assert.equal(status, 400, missing);
    }
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

  test('list memuat meta trader, rekening, is_pending', async () => {
    const { data } = await client(admin).get('/api/orders');
    assert.ok(data.total >= 10);
    const first = data.items[0];
    assert.ok(first.trader_name);
    assert.ok(first.bank_account_label.includes('·'));
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

describe('CF4 Pick up scan resi', () => {
  let admin, trader;
  before(async () => { admin = await login('admin', 'admin'); trader = await login('nabila', 'trader'); });

  test('scan cocok nomor order → proses_pick_up + event', async () => {
    const { data } = await client(admin).post('/api/orders', order());
    const { status, data: r } = await client(admin).post('/api/orders/scan', { code: data.order_number });
    assert.equal(status, 200);
    assert.equal(r.status, 'proses_pick_up');
    assert.ok(r.picked_up_at);
    const { data: d } = await client(admin).get(`/api/orders/${data.id}/detail`);
    assert.ok(d.events.some((e) => e.event_type === 'picked_up'));
  });
  test('scan ulang nomor yang sama → info sudah diproses (tanpa perubahan ganda)', async () => {
    const { data: list } = await client(admin).get('/api/orders?status=proses_pick_up');
    const o = list.items[0];
    const { data: r } = await client(admin).post('/api/orders/scan', { code: o.order_number });
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
  test('trader lampirkan barcode ke order miliknya', async () => {
    const { data: o } = await client(trader).post('/api/orders', order());
    const fd = new FormData();
    fd.append('photo', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'barcode.jpg');
    const res = await fetch(`${BASE}/api/orders/${o.id}/barcode`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${trader}` },
      body: fd,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.barcode_path, /^\/uploads\//);
  });
  test('lampirkan barcode ke order orang lain → 403', async () => {
    const { data: list } = await client(admin).get('/api/orders?trader=u-admin&status=data_masuk');
    const o = list.items[0];
    const fd = new FormData();
    fd.append('photo', new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), 'b.jpg');
    const res = await fetch(`${BASE}/api/orders/${o.id}/barcode`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${trader}` },
      body: fd,
    });
    assert.equal(res.status, 403);
  });
  test('lampirkan barcode pada order bukan Data masuk → 400', async () => {
    const { data: list } = await client(admin).get('/api/orders?status=proses_pick_up');
    const o = list.items[0];
    const fd = new FormData();
    fd.append('photo', new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), 'b.jpg');
    const res = await fetch(`${BASE}/api/orders/${o.id}/barcode`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin}` },
      body: fd,
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
    await client(admin).post(`/api/orders/${o.id}/photos`);
    const { data: r } = await client(admin).post(`/api/orders/${o.id}/photos`);
    assert.equal(r.photo_count, o.photo_count + 2);
    await client(admin).post(`/api/orders/${o.id}/photos`);
    const { status } = await client(admin).post(`/api/orders/${o.id}/photos`); // melebihi max 3
    assert.equal(status, 400);
  });
  test('upload foto oleh trader → 403', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    const { status } = await client(trader).post(`/api/orders/${o.id}/photos`);
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
    await client(admin).post(`/api/orders/${o.id}/photos`);
    const { status, data: r } = await client(admin).patch(`/api/orders/${o.id}/complete`, { note: 'Barang bagus' });
    assert.equal(status, 200);
    assert.equal(r.status, 'selesai');
    assert.equal(r.note, 'Barang bagus');
    const { data: d } = await client(admin).get(`/api/orders/${o.id}/detail`);
    assert.ok(d.events.some((e) => e.event_type === 'completed'));
  });
  test('hapus foto → photo_count turun', async () => {
    const { data: o } = await client(admin).post('/api/orders', order());
    await client(admin).post(`/api/orders/${o.id}/photos`);
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
    await client(admin).post(`/api/orders/${o.id}/photos`);
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

  test('reports: totals + per trader + rekap rekening + delayed', async () => {
    const { status, data } = await client(admin).get('/api/reports?range=bulan_ini');
    assert.equal(status, 200);
    assert.ok(data.totals.total >= 10);
    assert.ok(Array.isArray(data.perTrader) && data.perTrader.length >= 1);
    assert.ok(data.perTrader.every((t) => t.total === t.selesai + t.belum_selesai));
    assert.ok(Array.isArray(data.perRekening) && data.perRekening.length >= 1);
    assert.ok(Array.isArray(data.delayed));
    for (const t of data.perRekening) assert.equal(typeof t.amount, 'number');
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
});

describe('CF8 Master rekening & pengaturan', () => {
  let admin, trader;
  before(async () => { admin = await login('admin', 'admin'); trader = await login('nabila', 'trader'); });

  test('buat rekening + nonaktifkan (bukan hapus)', async () => {
    const { status, data: created } = await client(admin).post('/api/bank-accounts', { account_number: `99${Date.now()}`, bank_name: 'Bank QA', account_holder_name: 'QA' });
    assert.equal(status, 201);
    const newest = created[created.length - 1];
    assert.equal(newest.is_active, true);
    const { data: after } = await client(admin).patch(`/api/bank-accounts/${newest.id}`, { is_active: false });
    assert.equal(after.find((a) => a.id === newest.id).is_active, false);
  });
  test('rekening memuat jumlah order', async () => {
    const { data } = await client(trader).get('/api/bank-accounts');
    assert.ok(data.every((a) => typeof a.orders === 'number'));
  });
  test('buat rekening oleh trader → 403', async () => {
    const { status } = await client(trader).post('/api/bank-accounts', { account_number: '1', bank_name: 'B', account_holder_name: 'H' });
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
