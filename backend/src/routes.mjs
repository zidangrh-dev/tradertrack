// Seluruh endpoint REST ZProject + emit Socket.IO `packages:changed`.
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { requireAuth, requireAdmin, signToken, isAdminLevel, isSuperadmin } from './auth.mjs';
import { getRepo } from './repo.mjs';
import { gateEnabled, isGatedPlatform, versionMatches } from './appVersion.mjs';

const METHOD_WHITELIST = ['zaydan_ambilan_gjm', 'self_pick_up'];
// proses_pick_up dikecualikan: wajib lewat POST /orders/:id/pickup (butuh foto).
const STATUS_WHITELIST = ['data_masuk', 'done_pickup', 'selesai'];
// 'order' menandai foto bukti order — syarat pick up bersama barcode.
const PHOTO_SOURCE_WHITELIST = ['order', 'kamera', 'berkas', 'pickup_evidence'];

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

// next diteruskan agar pembungkus ini juga sah dipakai sebagai middleware,
// bukan hanya handler akhir.
const asyncH = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((e) => {
    const status = e.status || (e.message === 'UNAUTHORIZED' ? 401 : 400);
    res.status(status).json({ error: e.message });
  });
};

const ok = (res, data, code = 200) => res.status(code).json(data);
const noContent = (res) => res.status(204).end();

export function setupRoutes(app, io, uploadDir) {
  const repo = getRepo();
  const emit = () => io.emit('packages:changed');

  // Ekstensi aman: simpan file SELALU dengan ekstensi gambar baku dari hasil
// sniff magic bytes — nama asli client (termasuk .html/.svg) TIDAK dipakai
// sebagai ekstensi tersimpan, mencegah stored XSS via upload.
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
};

// Pembuat instans multer: `upload` membatasi 1 file (single), `uploadDua`
// mengizinkan 2 file sekaligus (done-pickup). Konfigurasi identik selain itu.
const makeUpload = (maxFiles) => multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => {
        // Simpan dengan ekstensi aman — TANPA nama asli client.
        const ext = EXT_BY_MIME[file.mimetype] || '.jpg';
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
      },
    }),
    limits: { fileSize: MAX_MULTER_MB * 1024 * 1024, files: maxFiles },
    fileFilter: (_req, file, cb) => {
      if (!IMAGE_MIME.has(file.mimetype)) {
        cb(Object.assign(new Error(`Format berkas harus gambar (${[...IMAGE_MIME].join(', ')}).`), { status: 400 }));
        return;
      }
      cb(null, true);
    },
  });

const upload = makeUpload(1);
// Foto pengambilan: 1-3 per order (batas sendiri, lepas dari max_photos).
const MAX_PICKUP_EVIDENCE = 3;
const uploadAmbilan = makeUpload(MAX_PICKUP_EVIDENCE);

  const r = Router();

  // ---------- Gerbang versi aplikasi ----------
  // Info versi wajib — publik: popup pembaruan harus tetap dapat data meski
  // token sudah kedaluwarsa atau permintaan lain diblokir.
  r.get('/app-version', asyncH(async (_req, res) => {
    const s = await repo.settings();
    ok(res, { required_version: s.required_app_version ?? '', update_url: s.app_update_url ?? '' });
  }));

  // Jalur yang TIDAK pernah diblokir: tanpa ini, versi wajib yang salah ketik
  // akan mengunci admin sendiri sehingga mustahil dibatalkan dari aplikasi.
  const VERSION_GATE_EXEMPT = new Set(['/login', '/logout', '/session', '/app-version', '/settings']);

  r.use(asyncH(async (req, res, next) => {
    if (VERSION_GATE_EXEMPT.has(req.path)) return next();
    // Hanya aplikasi native yang dijaga; web adalah jalur pemulihan.
    if (!isGatedPlatform(req.get('X-App-Platform'))) return next();
    const s = await repo.settings();
    const required = s.required_app_version ?? '';
    if (!gateEnabled(required)) return next();
    if (versionMatches(req.get('X-App-Version'), required)) return next();
    return res.status(409).json({
      error: `Versi aplikasi Anda tidak sesuai. Perbarui ke versi ${required} untuk melanjutkan.`,
      code: 'APP_VERSION_MISMATCH',
      required_version: required,
      update_url: s.app_update_url ?? '',
    });
  }));

  // Otorisasi order: fetch order + cek kepemilikan. adminBypass=true berarti
  // admin boleh ke semua order; false = ketat milik sendiri (hapus/edit sendiri).
  // Melempar HttpError 403 bila bukan pemilik — respon JSON seragam via asyncH.
  const orderFor = async (req, id, { adminBypass = true } = {}) => {
    const order = await repo.getOrder(id);
    const isOwner = order.trader_id === req.user.id;
    if (!isOwner && !(adminBypass && isAdminLevel(req.user.role))) {
      throw Object.assign(new Error('Hanya order milik Anda yang dapat diakses.'), { status: 403 });
    }
    return order;
  };

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

  // Ganti password akun sendiri — wajib verifikasi password lama.
  r.post('/me/password', requireAuth, asyncH(async (req, res) => {
    const b = req.body ?? {};
    const current = String(b.current_password ?? '');
    const next = String(b.new_password ?? '');
    if (!current || !next) return res.status(400).json({ error: 'Kata sandi lama dan baru wajib diisi.' });
    if (next.length < 6) return res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
    const u = await repo.userById(req.user.id);
    if (!u || !(await bcrypt.compare(current, u.password_hash))) {
      return res.status(400).json({ error: 'Kata sandi lama salah.' });
    }
    if (await bcrypt.compare(next, u.password_hash)) {
      return res.status(400).json({ error: 'Kata sandi baru tidak boleh sama dengan yang lama.' });
    }
    await repo.updateUser(u.id, { password_hash: await bcrypt.hash(next, 10) });
    noContent(res);
  }));

  // ---------- Orders ----------
  // Trader hanya melihat order miliknya sendiri; admin melihat semua (filter trader opsional).
  r.get('/orders', requireAuth, asyncH(async (req, res) => {
    const { q, status, pickup_method, page, per_page, from, to } = req.query;
    // Toko boleh multi (koma): ?store=A,B → array. Tunggal tetap didukung.
    const store = req.query.store ? String(req.query.store).split(',').filter(Boolean) : undefined;
    // Produk juga multi (koma): ?product=A,B → array. Tunggal tetap didukung.
    const product = req.query.product ? String(req.query.product).split(',').filter(Boolean) : undefined;
    const trader = isAdminLevel(req.user.role) ? req.query.trader : req.user.id;
    ok(res, await repo.listOrders({ q, status, pickup_method, store, product, trader, page, per_page, from, to }));
  }));

  r.post('/orders', requireAuth, asyncH(async (req, res) => {
    const b = req.body ?? {};
    const missing = ['order_number', 'recipient_name', 'product_id', 'store_id']
      .filter((k) => !b[k]);
    if (missing.length) return res.status(400).json({ error: `Kolom wajib belum diisi: ${missing.join(', ')}` });
    if (!METHOD_WHITELIST.includes(b.pickup_method)) {
      return res.status(400).json({ error: 'Metode pengambilan tidak valid.' });
    }
    const trader_id = isAdminLevel(req.user.role) ? (b.trader_id ?? req.user.id) : req.user.id;
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
    await orderFor(req, req.params.id);
    if (req.file) await validateImage(req.file, uploadDir);
    const order = await repo.pickupOrder(req.params.id, req.user.id, req.file ?? null);
    emit();
    ok(res, order);
  }));

  // Tandai sudah diambil — wajib ada foto pengambilan (1-3). Foto yang sudah
  // dilampirkan lebih dulu lewat galeri ikut dihitung, jadi admin tidak perlu
  // memotret ulang: kirim tanpa berkas bila bukti sudah lengkap.
  r.post('/orders/:id/done-pickup', requireAdmin, uploadAmbilan.array('photo', MAX_PICKUP_EVIDENCE), asyncH(async (req, res) => {
    const order = await orderFor(req, req.params.id);
    if (order.status !== 'proses_pick_up') {
      return res.status(400).json({ error: 'Hanya order berstatus Proses pick up yang bisa ditandai sudah diambil.' });
    }
    const files = req.files ?? [];
    const { photos } = await repo.detail(req.params.id);
    const sudahAda = photos.filter((p) => p.source === 'pickup_evidence').length;
    const total = sudahAda + files.length;
    if (total < 1) {
      return res.status(400).json({ error: 'Wajib melampirkan minimal 1 foto pengambilan.' });
    }
    if (total > MAX_PICKUP_EVIDENCE) {
      return res.status(400).json({
        error: `Maksimal ${MAX_PICKUP_EVIDENCE} foto pengambilan per order (sudah ada ${sudahAda}).`,
      });
    }
    for (const f of files) await validateImage(f, uploadDir);
    const updated = await repo.donePickup(req.params.id, files, req.user.id);
    emit();
    ok(res, updated);
  }));

  r.get('/orders/:id/detail', requireAuth, asyncH(async (req, res) => {
    await orderFor(req, req.params.id);
    ok(res, await repo.detail(req.params.id));
  }));

  r.patch('/orders/:id/status', requireAdmin, asyncH(async (req, res) => {
    const to = req.body?.to_status;
    if (to === 'proses_pick_up') {
      return res.status(400).json({ error: 'Gunakan unggahan foto barcode untuk memproses pick up.' });
    }
    if (to === 'done_pickup') {
      return res.status(400).json({ error: 'Gunakan unggahan 2 foto pengambilan untuk menandai order sudah diambil.' });
    }
    if (!STATUS_WHITELIST.includes(to)) return res.status(400).json({ error: 'Status tujuan tidak valid.' });
    const order = await repo.updateStatus(req.params.id, to, req.user.id);
    emit();
    ok(res, order);
  }));

  r.post('/orders/:id/barcode', requireAuth, upload.single('photo'), asyncH(async (req, res) => {
    const order = await orderFor(req, req.params.id);
    // Kelonggaran untuk order warisan: sebelum aturan bukti ganda berlaku, order
    // bisa masuk Proses pick up tanpa barcode dan jadi terkunci selamanya.
    // Celahnya sempit dan menutup sendiri — begitu barcode terisi, syarat
    // `!barcode_path` gugur, jadi tidak bisa dipakai untuk mengganti barcode.
    const susulan = order.status === 'proses_pick_up' && !order.barcode_path;
    if (order.status !== 'data_masuk' && !susulan) {
      return res.status(400).json({
        error: order.barcode_path
          ? 'Order ini sudah memiliki barcode. Barcode hanya bisa diubah saat status Data masuk.'
          : 'Barcode hanya bisa dilampirkan saat status Data masuk atau Proses pick up.',
      });
    }
    if (!req.file) return res.status(400).json({ error: 'Berkas gambar barcode wajib diunggah.' });
    await validateImage(req.file, uploadDir);
    const updated = await repo.attachBarcode(req.params.id, `/uploads/${req.file.filename}`);
    emit();
    ok(res, updated);
  }));

  // Hapus barcode — aturan sama dengan unggahnya: hanya saat Data masuk.
  // Order otomatis tertahan lagi karena kelengkapan divalidasi saat pick up.
  r.delete('/orders/:id/barcode', requireAuth, asyncH(async (req, res) => {
    const order = await orderFor(req, req.params.id);
    if (order.status !== 'data_masuk') {
      return res.status(400).json({ error: 'Barcode hanya bisa diubah saat status Data masuk.' });
    }
    if (!order.barcode_path) {
      return res.status(400).json({ error: 'Order ini belum memiliki barcode.' });
    }
    const updated = await repo.clearBarcode(req.params.id);
    emit();
    ok(res, updated);
  }));

  r.post('/orders/:id/photos', requireAuth, upload.single('photo'), asyncH(async (req, res) => {
    const order = await orderFor(req, req.params.id);
    if (order.status === 'selesai') {
      return res.status(400).json({ error: 'Order selesai terkunci. Buka kembali order terlebih dahulu.' });
    }
    // Foto bukti wajib benar-benar diunggah — larang pemalsuan catatan (vuln-0002).
    if (!req.file) return res.status(400).json({ error: 'Berkas gambar wajib diunggah.' });
    await validateImage(req.file, uploadDir);
    // 'order' = foto bukti order (syarat pick up); selain itu bukti penyelesaian.
    const source = PHOTO_SOURCE_WHITELIST.includes(req.body?.source) ? req.body.source : null;
    // Bukti order: sejajar dengan aturan barcode. Boleh dilampirkan saat Data
    // masuk, atau menyusul pada order yang terlanjur diproses tanpa bukti —
    // celah menutup sendiri begitu buktinya ada, sehingga bukti yang sudah
    // terpasang tidak bisa ditukar setelah order berjalan.
    if (source === 'order' && order.status !== 'data_masuk') {
      const sudahAda = await repo.hasOrderProof(req.params.id);
      if (order.status !== 'proses_pick_up' || sudahAda) {
        return res.status(400).json({
          error: sudahAda
            ? 'Bukti order hanya bisa diubah saat status Data masuk.'
            : 'Bukti order hanya bisa dilampirkan saat status Data masuk atau Proses pick up.',
        });
      }
    }
    // Foto pengambilan adalah bukti verifikasi milik admin — trader hanya boleh
    // melihatnya. Tanpa cek ini, menyembunyikan tombol di UI tidak menutup API.
    if (source === 'pickup_evidence') {
      if (!isAdminLevel(req.user.role)) {
        return res.status(403).json({ error: 'Hanya admin yang boleh melampirkan foto pengambilan.' });
      }
      // Bukti verifikasi membeku setelah order ditandai sudah diambil — sejalan
      // dengan aturan hapus di bawah. Reopen mengembalikan status ke Proses pick
      // up, jadi koreksi tetap mungkin lewat jalur itu.
      if (order.status !== 'proses_pick_up') {
        return res.status(400).json({ error: 'Foto pengambilan hanya bisa dilampirkan saat order masih Proses pick up.' });
      }
      // Batas sendiri (bukan max_photos): bukti wajib tidak boleh diblok setelan.
      const { photos } = await repo.detail(req.params.id);
      if (photos.filter((p) => p.source === 'pickup_evidence').length >= MAX_PICKUP_EVIDENCE) {
        return res.status(400).json({ error: `Maksimal ${MAX_PICKUP_EVIDENCE} foto pengambilan per order.` });
      }
    }
    const updated = await repo.uploadPhoto(req.params.id, req.user.id, req.file, source);
    emit();
    ok(res, updated);
  }));

  r.delete('/orders/:id/photos/:photoId', requireAuth, asyncH(async (req, res) => {
    const order = await orderFor(req, req.params.id);
    if (order.status === 'selesai') {
      return res.status(400).json({ error: 'Foto bukti order selesai tidak dapat dihapus. Buka kembali order terlebih dahulu.' });
    }
    // Foto pengambilan (pickup_evidence) adalah bukti verifikasi milik admin:
    // trader tidak boleh menghapusnya, dan admin pun hanya selama order masih
    // Proses pick up (belum ditandai sudah diambil).
    const { photos } = await repo.detail(req.params.id);
    const foto = photos.find((p) => p.id === req.params.photoId);
    if (foto?.source === 'pickup_evidence') {
      if (!isAdminLevel(req.user.role)) {
        return res.status(403).json({ error: 'Hanya admin yang boleh menghapus foto pengambilan.' });
      }
      if (order.status !== 'proses_pick_up') {
        return res.status(400).json({ error: 'Foto pengambilan hanya bisa dihapus saat order masih Proses pick up.' });
      }
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

  // Cabut tanda bermasalah. Idempoten: order yang memang tidak bermasalah tetap
  // 200 agar klien bisa memanggil tanpa cek lebih dulu.
  r.delete('/orders/:id/problem', requireAdmin, asyncH(async (req, res) => {
    const order = await repo.clearProblem(req.params.id, req.user.id);
    emit();
    ok(res, order);
  }));

  r.patch('/orders/:id/reopen', requireAdmin, asyncH(async (req, res) => {
    const order = await repo.reopen(req.params.id, req.user.id);
    emit();
    ok(res, order);
  }));

  r.delete('/orders/:id', requireAuth, asyncH(async (req, res) => {
    // Admin boleh menghapus di semua status (koreksi data); trader tetap
    // hanya order miliknya sendiri dan hanya selama masih Data masuk.
    const admin = isAdminLevel(req.user.role);
    const order = await orderFor(req, req.params.id, { adminBypass: admin });
    if (!admin && order.status !== 'data_masuk') {
      return res.status(400).json({ error: 'Order hanya bisa dihapus saat status Data masuk.' });
    }
    await repo.deleteOrder(req.params.id, req.user.id);
    emit();
    noContent(res);
  }));

  r.patch('/orders/:id', requireAuth, asyncH(async (req, res) => {
    // Admin boleh mengoreksi data order di semua status; trader tetap dibatasi
    // pada order miliknya sendiri selama masih Data masuk.
    const admin = isAdminLevel(req.user.role);
    const order = await orderFor(req, req.params.id, { adminBypass: admin });
    if (!admin && order.status !== 'data_masuk') {
      return res.status(400).json({ error: 'Order hanya bisa diubah saat status Data masuk.' });
    }
    // Dirapikan seperti saat pembuatan: tanpa trim, ' 123' lolos sebagai
    // nomor berbeda dari '123' dan aturan unik bisa ditembus.
    const trimmed = (v) => (v === undefined || v === null ? undefined : String(v).trim());
    const patch = {
      product_name: trimmed(req.body?.product_name),
      store_name: trimmed(req.body?.store_name),
      order_number: trimmed(req.body?.order_number),
      recipient_name: trimmed(req.body?.recipient_name),
      pickup_method: trimmed(req.body?.pickup_method),
    };
    if (patch.order_number !== undefined && !patch.order_number) {
      return res.status(400).json({ error: 'Nomor pesanan tidak boleh kosong.' });
    }
    // Metode dibatasi whitelist yang sama dengan pembuatan order — nilai bebas
    // akan lolos ke DB dan merusak label serta filter di seluruh aplikasi.
    if (patch.pickup_method !== undefined && !METHOD_WHITELIST.includes(patch.pickup_method)) {
      return res.status(400).json({ error: 'Metode pick up tidak dikenal.' });
    }
    const updated = await repo.editOrder(req.params.id, patch, req.user.id);
    emit();
    ok(res, updated);
  }));

  // ---------- Reports ----------
  r.get('/reports', requireAuth, asyncH(async (req, res) => {
    // Admin: laporan semua trader. Trader: hanya order miliknya (scoping di repo).
    const traderId = isAdminLevel(req.user.role) ? undefined : req.user.id;
    ok(res, await repo.reports(
      String(req.query.range ?? ''),
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined,
      traderId,
    ));
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
  r.get('/settings', requireAuth, asyncH(async (req, res) => {
    const s = await repo.settings();
    // Setelan versi hanya untuk superadmin; popup pembaruan memakai
    // /app-version yang publik, jadi tidak terganggu.
    if (!isSuperadmin(req.user.role)) {
      const { required_app_version: _v, app_update_url: _u, ...rest } = s;
      return ok(res, rest);
    }
    ok(res, s);
  }));
  r.patch('/settings', requireAdmin, asyncH(async (req, res) => {
    const b = req.body ?? {};
    const menyentuhVersi = b.required_app_version !== undefined || b.app_update_url !== undefined;
    if (menyentuhVersi && !isSuperadmin(req.user.role)) {
      return res.status(403).json({ error: 'Hanya superadmin yang dapat mengubah setelan versi aplikasi.' });
    }
    ok(res, await repo.settingsPatch(b));
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
    if (!['superadmin', 'admin', 'trader'].includes(b.role)) return res.status(400).json({ error: 'Role tidak valid.' });
    if (b.role === 'superadmin' && !isSuperadmin(req.user.role)) {
      return res.status(403).json({ error: 'Hanya superadmin yang dapat membuat akun superadmin.' });
    }
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
    // Admin biasa tidak boleh menyentuh akun superadmin — tanpa ini ia bisa
    // menonaktifkan superadmin lalu mengambil alih setelan versi.
    if (isSuperadmin(target.role) && !isSuperadmin(req.user.role)) {
      return res.status(403).json({ error: 'Hanya superadmin yang dapat mengubah akun superadmin.' });
    }
    if (b.role === 'superadmin' && !isSuperadmin(req.user.role)) {
      return res.status(403).json({ error: 'Hanya superadmin yang dapat mengangkat akun superadmin.' });
    }
    // Superadmin terakhir wajib tetap ada, kalau tidak setelan versi terkunci selamanya.
    const menurunkanSuperadmin = isSuperadmin(target.role) && b.role && b.role !== 'superadmin';
    const menonaktifkanSuperadmin = isSuperadmin(target.role) && b.is_active === false;
    if ((menurunkanSuperadmin || menonaktifkanSuperadmin) && (await repo.activeSuperadminCount()) <= 1) {
      return res.status(400).json({ error: 'Akun superadmin terakhir tidak dapat diturunkan atau dinonaktifkan.' });
    }
    if (b.is_active === false && isAdminLevel(target.role) && (await repo.activeAdminCount()) <= 1) {
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

  r.delete('/users/:id', requireAdmin, asyncH(async (req, res) => {
    const target = await repo.userById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Anda tidak dapat menghapus akun sendiri.' });
    }
    if (isSuperadmin(target.role) && !isSuperadmin(req.user.role)) {
      return res.status(403).json({ error: 'Hanya superadmin yang dapat menghapus akun superadmin.' });
    }
    if (isSuperadmin(target.role) && (await repo.activeSuperadminCount()) <= 1) {
      return res.status(400).json({ error: 'Akun superadmin terakhir tidak dapat dihapus.' });
    }
    if (isAdminLevel(target.role) && (await repo.activeAdminCount()) <= 1) {
      return res.status(400).json({ error: 'Akun admin terakhir tidak dapat dihapus.' });
    }
    await repo.deleteUser(req.params.id);
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
