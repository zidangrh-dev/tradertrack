// Seluruh endpoint REST TraderTrack + emit Socket.IO `packages:changed`.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { requireAuth, requireAdmin, signToken } from './auth.mjs';
import { getRepo } from './repo.mjs';

const METHOD_WHITELIST = ['zaydan_ambilan_gjm', 'self_pick_up'];
const STATUS_WHITELIST = ['data_masuk', 'proses_pick_up', 'selesai'];

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
  r.get('/orders', requireAuth, asyncH(async (req, res) => {
    const { q, status, pickup_method, trader, page, from, to } = req.query;
    ok(res, await repo.listOrders({ q, status, pickup_method, trader, page, from, to }));
  }));

  r.post('/orders', requireAuth, asyncH(async (req, res) => {
    const b = req.body ?? {};
    const missing = ['product_name', 'store_name', 'order_number', 'recipient_name', 'bank_account_id']
      .filter((k) => !b[k]);
    if (missing.length) return res.status(400).json({ error: `Kolom wajib belum diisi: ${missing.join(', ')}` });
    if (!METHOD_WHITELIST.includes(b.pickup_method)) {
      return res.status(400).json({ error: 'Metode pengambilan tidak valid.' });
    }
    const trader_id = req.user.role === 'admin' ? (b.trader_id ?? req.user.id) : req.user.id;
    const order = await repo.createOrder({
      product_name: String(b.product_name).trim(),
      store_name: String(b.store_name).trim(),
      order_number: String(b.order_number).trim(),
      recipient_name: String(b.recipient_name).trim(),
      pickup_method: b.pickup_method,
      trader_id,
      bank_account_id: String(b.bank_account_id),
      order_amount: b.order_amount == null || b.order_amount === '' ? null : Number(b.order_amount),
    }, req.user.id);
    emit();
    ok(res, order, 201);
  }));

  r.post('/orders/scan', requireAdmin, asyncH(async (req, res) => {
    const result = await repo.scan(String(req.body?.code ?? ''), req.user.id);
    if (result) emit();
    ok(res, result); // null bila tidak cocok (frontend menangani pesan)
  }));

  r.get('/orders/:id/detail', requireAuth, asyncH(async (req, res) => {
    ok(res, await repo.detail(req.params.id));
  }));

  r.patch('/orders/:id/status', requireAdmin, asyncH(async (req, res) => {
    const to = req.body?.to_status;
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
    const updated = await repo.attachBarcode(req.params.id, `/uploads/${req.file.filename}`);
    emit();
    ok(res, updated);
  }));

  r.post('/orders/:id/photos', requireAdmin, upload.single('photo'), asyncH(async (req, res) => {
    const order = await repo.uploadPhoto(req.params.id, req.user.id, req.file ?? null);
    emit();
    ok(res, order);
  }));

  r.delete('/orders/:id/photos/:photoId', requireAdmin, asyncH(async (req, res) => {
    const order = await repo.deletePhoto(req.params.id, req.params.photoId);
    emit();
    ok(res, order);
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

  // ---------- Bank accounts ----------
  r.get('/bank-accounts', requireAuth, asyncH(async (_req, res) => {
    ok(res, await repo.listAccounts());
  }));
  r.post('/bank-accounts', requireAdmin, asyncH(async (req, res) => {
    const b = req.body ?? {};
    if (!b.account_number || !b.bank_name || !b.account_holder_name) {
      return res.status(400).json({ error: 'Nomor rekening, nama bank, dan nama pemilik wajib diisi.' });
    }
    ok(res, await repo.createAccount({
      account_number: String(b.account_number).trim(),
      bank_name: String(b.bank_name).trim(),
      account_holder_name: String(b.account_holder_name).trim(),
    }), 201);
  }));
  r.patch('/bank-accounts/:id', requireAdmin, asyncH(async (req, res) => {
    ok(res, await repo.setAccountActive(req.params.id, Boolean(req.body?.is_active)));
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
}
