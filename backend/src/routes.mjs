// Seluruh endpoint REST ZProject + emit Socket.IO `packages:changed`.
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { requireAuth, requireAdmin, signToken } from './auth.mjs';
import { getRepo } from './repo.mjs';

const METHOD_WHITELIST = ['zaydan_ambilan_gjm', 'self_pick_up'];
const STATUS_WHITELIST = ['data_masuk', 'selesai'];

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/bmp']);
const MAX_MULTER_MB = 50; // pagar keras DoS; batas bisnis diambil dari setting max_file_mb.

// Deteksi tipe berkas sungguhan dari magic bytes (bukan sekadar ekstensi/MIME klaim).
function sniffMime(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (/^(heic|heix|hevc|hevx|mif1|msf1|heif)/.test(brand)) return 'image/heic';
  }
  if (buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  return null;
}

// Validasi berkas gambar hasil multer: limit per setting + magic bytes. File
// yang gagal dihapus dari disk agar tidak jadi sampah/eksploit.
async function validateImage(file, uploadDir) {
  const repo = getRepo();
  const s = await repo.settings();
  const maxBytes = s.max_file_mb * 1024 * 1024;
  if (file.size > maxBytes) {
    fs.promises.unlink(path.join(uploadDir, file.filename)).catch(() => {});
    const err = new Error(`Ukuran berkas melebihi batas ${s.max_file_mb} MB.`);
    err.status = 400;
    throw err;
  }
  const fp = path.join(uploadDir, path.basename(file.filename));
  const fh = await fs.promises.open(fp, 'r');
  let ok = false;
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await fh.read(buf, 0, 16, 0);
    ok = IMAGE_MIME.has(sniffMime(buf.subarray(0, bytesRead)) ?? '');
  } finally {
    await fh.close();
  }
  if (!ok) {
    fs.promises.unlink(fp).catch(() => {});
    const err = new Error('Isi berkas bukan gambar yang valid (JPG, PNG, WebP, HEIC).');
    err.status = 400;
    throw err;
  }
}

const asyncH = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    const status = e.status || (e.message === 'UNAUTHORIZED' ? 401 : 400);
    res.status(status).json({ error: e.message });
  });
};

const ok = (res, data, code = 200) => res.status(code).json(data);
const noContent = (res) => res.status(204).end();

export function setupRoutes(app, io, uploadDir) {
  const repo = getRepo();
  const emit = () => io.emit('packages:changed');

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
      },
    }),
    limits: { fileSize: MAX_MULTER_MB * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!IMAGE_MIME.has(file.mimetype)) {
        cb(Object.assign(new Error(`Format berkas harus gambar (${[...IMAGE_MIME].join(', ')}).`), { status: 400 }));
        return;
      }
      cb(null, true);
    },
  });

  const r = Router();

  // ---------- Auth ----------
  r.post('/login', asyncH(async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) return res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
    const u = await repo.userByUsername(String(username));
    if (!u || !u.is_active || !(await bcrypt.compare(String(password), u.password_hash))) {
      return res.status(401).json({ error: 'Username atau kata sandi salah, atau akun sedang nonaktif.' });
    }
    await repo.setLastLogin(u.id);
    const user = { id: u.id, username: u.username, display_name: u.display_name, role: u.role };
    ok(res, { token: signToken(user), user });
  }));

  r.post('/logout', (_req, res) => noContent(res));

  r.get('/session', requireAuth, asyncH(async (req, res) => {
    const u = await repo.userById(req.user.id);
    if (!u || !u.is_active) return ok(res, null);
    ok(res, { id: u.id, username: u.username, display_name: u.display_name, role: u.role });
  }));

  if (process.env.NODE_ENV !== 'production') {
    r.post('/dev/session', asyncH(async (req, res) => {
      const u = await repo.userById(String(req.body?.id));
      if (!u) return res.status(404).json({ error: 'User tidak ditemukan' });
      const user = { id: u.id, username: u.username, display_name: u.display_name, role: u.role };
      ok(res, { token: signToken(user), user });
    }));
  }

  // ---------- Orders ----------
  // Trader hanya melihat order miliknya sendiri; admin melihat semua (filter trader opsional).
  r.get('/orders', requireAuth, asyncH(async (req, res) => {
    const { q, status, pickup_method, page, from, to } = req.query;
    const trader = req.user.role === 'admin' ? req.query.trader : req.user.id;
    ok(res, await repo.listOrders({ q, status, pickup_method, trader, page, from, to }));
  }));

  r.post('/orders', requireAuth, asyncH(async (req, res) => {
    const b = req.body ?? {};
    const missing = ['order_number', 'recipient_name', 'product_id', 'store_id']
      .filter((k) => !b[k]);
    if (missing.length) return res.status(400).json({ error: `Kolom wajib belum diisi: ${missing.join(', ')}` });
    if (!METHOD_WHITELIST.includes(b.pickup_method)) {
      return res.status(400).json({ error: 'Metode pengambilan tidak valid.' });
    }
    const trader_id = req.user.role === 'admin' ? (b.trader_id ?? req.user.id) : req.user.id;
    const order = await repo.createOrder({
      order_number: String(b.order_number).trim(),
      recipient_name: String(b.recipient_name).trim(),
      pickup_method: b.pickup_method,
      trader_id,
      product_id: String(b.product_id),
      store_id: String(b.store_id),
      order_amount: b.order_amount == null || b.order_amount === '' ? null : Number(b.order_amount),
    }, req.user.id);
    emit();
    ok(res, order, 201);
  }));

  r.post('/orders/scan', requireAdmin, upload.single('photo'), asyncH(async (req, res) => {
    if (req.file) await validateImage(req.file, uploadDir);
    const result = await repo.scan(String(req.body?.code ?? ''), req.user.id, req.file ?? null);
    if (result) emit();
    ok(res, result); // null bila tidak cocok (frontend menangani pesan)
  }));

  // Proses pick up — trader memproses order miliknya sendiri (wajib ada bukti:
  // foto di request ATAU barcode/foto sudah terpasang), admin bebas seperti sebelumnya.
  r.post('/orders/:id/pickup', requireAuth, upload.single('photo'), asyncH(async (req, res) => {
    if (req.user.role !== 'admin') {
      const own = await repo.getOrder(req.params.id);
      if (own.trader_id !== req.user.id) {
        return res.status(403).json({ error: 'Hanya order milik Anda yang dapat diproses.' });
      }
    }
    if (req.file) await validateImage(req.file, uploadDir);
    const order = await repo.pickupOrder(req.params.id, req.user.id, req.file ?? null);
    emit();
    ok(res, order);
  }));

  r.get('/orders/:id/detail', requireAuth, asyncH(async (req, res) => {
    const order = await repo.getOrder(req.params.id);
    if (req.user.role !== 'admin' && order.trader_id !== req.user.id) {
      return res.status(403).json({ error: 'Hanya order milik Anda yang dapat dilihat.' });
    }
    ok(res, await repo.detail(req.params.id));
  }));

  r.patch('/orders/:id/status', requireAdmin, asyncH(async (req, res) => {
    const to = req.body?.to_status;
    if (to === 'proses_pick_up') {
      return res.status(400).json({ error: 'Gunakan unggahan foto barcode untuk memproses pick up.' });
    }
    if (!STATUS_WHITELIST.includes(to)) return res.status(400).json({ error: 'Status tujuan tidak valid.' });
    const order = await repo.updateStatus(req.params.id, to, req.user.id);
    emit();
    ok(res, order);
  }));

  r.post('/orders/:id/barcode', requireAuth, upload.single('photo'), asyncH(async (req, res) => {
    const order = await repo.getOrder(req.params.id);
    if (order.trader_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Hanya pembuat order atau admin yang dapat melampirkan barcode.' });
    }
    if (order.status !== 'data_masuk') {
      return res.status(400).json({ error: 'Barcode hanya bisa dilampirkan saat status Data masuk.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Berkas gambar barcode wajib diunggah.' });
    await validateImage(req.file, uploadDir);
    const updated = await repo.attachBarcode(req.params.id, `/uploads/${req.file.filename}`);
    emit();
    ok(res, updated);
  }));

  r.post('/orders/:id/photos', requireAuth, upload.single('photo'), asyncH(async (req, res) => {
    const order = await repo.getOrder(req.params.id);
    // Pemilik order (trader) atau admin boleh mengelola foto bukti.
    if (order.trader_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Hanya order milik Anda yang dapat dilengkapi bukti.' });
    }
    if (order.status === 'selesai') {
      return res.status(400).json({ error: 'Order selesai terkunci. Buka kembali order terlebih dahulu.' });
    }
    if (req.file) await validateImage(req.file, uploadDir);
    const updated = await repo.uploadPhoto(req.params.id, req.user.id, req.file ?? null);
    emit();
    ok(res, updated);
  }));

  r.delete('/orders/:id/photos/:photoId', requireAuth, asyncH(async (req, res) => {
    const order = await repo.getOrder(req.params.id);
    if (order.trader_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Hanya order milik Anda yang dapat diubah buktinya.' });
    }
    if (order.status === 'selesai') {
      return res.status(400).json({ error: 'Foto bukti order selesai tidak dapat dihapus. Buka kembali order terlebih dahulu.' });
    }
    const updated = await repo.deletePhoto(req.params.id, req.params.photoId);
    emit();
    ok(res, updated);
  }));

  r.patch('/orders/:id/complete', requireAdmin, asyncH(async (req, res) => {
    const order = await repo.completeOrder(req.params.id, String(req.body?.note ?? '').trim(), req.user.id);
    emit();
    ok(res, order);
  }));

  r.patch('/orders/:id/problem', requireAdmin, asyncH(async (req, res) => {
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) return res.status(400).json({ error: 'Alasan kendala wajib diisi.' });
    const order = await repo.markProblem(req.params.id, reason, req.user.id);
    emit();
    ok(res, order);
  }));

  r.patch('/orders/:id/reopen', requireAdmin, asyncH(async (req, res) => {
    const order = await repo.reopen(req.params.id, req.user.id);
    emit();
    ok(res, order);
  }));

  r.delete('/orders/:id', requireAuth, asyncH(async (req, res) => {
    const order = await repo.getOrder(req.params.id);
    if (order.trader_id !== req.user.id) return res.status(403).json({ error: 'Hanya order milik Anda yang dapat dihapus.' });
    if (order.status !== 'data_masuk') return res.status(400).json({ error: 'Order hanya bisa dihapus saat status Data masuk.' });
    await repo.deleteOrder(req.params.id);
    emit();
    noContent(res);
  }));

  r.patch('/orders/:id', requireAuth, asyncH(async (req, res) => {
    const order = await repo.getOrder(req.params.id);
    if (order.trader_id !== req.user.id) return res.status(403).json({ error: 'Hanya order milik Anda yang dapat diubah.' });
    if (order.status !== 'data_masuk') return res.status(400).json({ error: 'Order hanya bisa diubah saat status Data masuk.' });
    const patch = {
      product_name: req.body?.product_name ?? undefined,
      store_name: req.body?.store_name ?? undefined,
      order_number: req.body?.order_number ?? undefined,
      recipient_name: req.body?.recipient_name ?? undefined,
    };
    const updated = await repo.editOrder(req.params.id, patch, req.user.id);
    emit();
    ok(res, updated);
  }));

  // ---------- Reports ----------
  r.get('/reports', requireAdmin, asyncH(async (req, res) => {
    ok(res, await repo.reports(String(req.query.range ?? '')));
  }));

  // ---------- Produk (tipe barang + kuota) ----------
  r.get('/products', requireAuth, asyncH(async (_req, res) => {
    ok(res, await repo.listProducts());
  }));
  r.post('/products', requireAdmin, asyncH(async (req, res) => {
    const b = req.body ?? {};
    if (!b.name) {
      return res.status(400).json({ error: 'Nama produk dan kuota wajib diisi.' });
    }
    ok(res, await repo.createProduct({
      name: String(b.name).trim(),
      quota: b.quota ?? 0,
    }), 201);
  }));
  r.delete('/products/:id', requireAdmin, asyncH(async (req, res) => {
    ok(res, await repo.deleteProduct(req.params.id));
  }));
  r.post('/products/:id/quota', requireAdmin, asyncH(async (req, res) => {
    const amount = Number(req.body?.amount);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) {
      return res.status(400).json({ error: 'Tambahan kuota harus berupa bilangan bulat antara 1 dan 1.000.000.' });
    }
    ok(res, await repo.addProductQuota(req.params.id, amount));
  }));
  r.post('/products/:id/reset-quota', requireAdmin, asyncH(async (req, res) => {
    ok(res, await repo.resetProductQuota(req.params.id));
  }));
  r.patch('/products/:id', requireAdmin, asyncH(async (req, res) => {
    const b = req.body ?? {};
    const patch = {
      name: b.name ?? undefined,
      quota: b.quota !== undefined ? Number(b.quota) : undefined,
      is_active: b.is_active,
    };
    ok(res, await repo.updateProduct(req.params.id, patch));
  }));

  // ---------- Marketplace stores ----------
  r.get('/marketplace-stores', requireAuth, asyncH(async (_req, res) => {
    ok(res, await repo.listMarketplaceStores());
  }));
  r.post('/marketplace-stores', requireAdmin, asyncH(async (req, res) => {
    ok(res, await repo.createMarketplaceStore(req.body?.name), 201);
  }));
  r.delete('/marketplace-stores/:id', requireAdmin, asyncH(async (req, res) => {
    ok(res, await repo.deleteMarketplaceStore(req.params.id));
  }));

  // ---------- Settings ----------
  r.get('/settings', requireAuth, asyncH(async (_req, res) => {
    ok(res, await repo.settings());
  }));
  r.patch('/settings', requireAdmin, asyncH(async (req, res) => {
    ok(res, await repo.settingsPatch(req.body ?? {}));
  }));

  // ---------- Users ----------
  r.get('/users', requireAdmin, asyncH(async (_req, res) => {
    ok(res, await repo.users());
  }));
  r.post('/users', requireAdmin, asyncH(async (req, res) => {
    const b = req.body ?? {};
    if (!b.username || !b.password || !b.display_name) {
      return res.status(400).json({ error: 'Username, kata sandi, dan nama lengkap wajib diisi.' });
    }
    if (!['admin', 'trader'].includes(b.role)) return res.status(400).json({ error: 'Role tidak valid.' });
    const created = await repo.createUser({
      username: String(b.username),
      password_hash: await bcrypt.hash(String(b.password), 10),
      display_name: String(b.display_name).trim(),
      role: b.role,
    });
    ok(res, created, 201);
  }));
  r.patch('/users/:id', requireAdmin, asyncH(async (req, res) => {
    const b = req.body ?? {};
    const target = await repo.userById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    if (req.params.id === req.user.id && b.role && b.role !== target.role) {
      return res.status(400).json({ error: 'Anda tidak dapat mengubah role diri sendiri.' });
    }
    if (b.is_active === false && target.role === 'admin' && (await repo.activeAdminCount()) <= 1) {
      return res.status(400).json({ error: 'Akun admin terakhir tidak dapat dinonaktifkan.' });
    }
    await repo.updateUser(req.params.id, {
      role: b.role,
      display_name: b.display_name,
      is_active: b.is_active,
      password_hash: b.password ? await bcrypt.hash(String(b.password), 10) : undefined,
    });
    noContent(res);
  }));

  app.use('/api', r);

  // Middleware error untuk multer (fileFilter/limits) — di luar asyncH.
  app.use((err, _req, res, _next) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `Ukuran berkas melebihi batas ${MAX_MULTER_MB} MB.` });
    }
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Unggahan tidak valid.' });
    }
    res.status(err?.status || 500).json({ error: err?.message || 'Permintaan tidak valid.' });
  });
}
