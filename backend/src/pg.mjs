// Repo PostgreSQL (produksi). Factory menerima pg.Pool dan mengembalikan
// interface yang identik dengan memdb.mjs — routes memanggil keduanya sama.
import { rangeToFrom } from './ranges.mjs';

const SELECT_VIEW = `
  SELECT o.*, u.display_name AS trader_name,
         o.product_name || ' · ' || o.store_name AS product_label
  FROM orders o
  JOIN users u ON u.id = o.trader_id`;

function toView(row, threshold) {
  const ageHours = (Date.now() - new Date(row.updated_at).getTime()) / 3600000;
  const pending = (row.status === 'data_masuk' || row.status === 'proses_pick_up') && ageHours >= threshold;
  const { tracking_number: _t, ...rest } = row;
  return {
    ...rest,
    order_amount: rest.order_amount == null ? null : Number(rest.order_amount),
    created_at: new Date(rest.created_at).toISOString(),
    updated_at: new Date(rest.updated_at).toISOString(),
    picked_up_at: rest.picked_up_at ? new Date(rest.picked_up_at).toISOString() : null,
    completed_at: rest.completed_at ? new Date(rest.completed_at).toISOString() : null,
    is_pending: pending,
  };
}

const SETTINGS_SQL = `SELECT setting_key, setting_value FROM app_settings`;
async function loadSettings(pool) {
  const { rows } = await pool.query(SETTINGS_SQL);
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  return {
    pending_threshold_hours: Number(map.pending_threshold_hours ?? 3),
    min_photos: Number(map.min_photos ?? 1),
    max_photos: Number(map.max_photos ?? 3),
    max_file_mb: Number(map.max_file_mb ?? 20),
  };
}

export default (pool) => {
  const S = () => loadSettings(pool);

  const settings = async () => S();

  const settingsPatch = async (patch) => {
    if (patch.min_photos !== undefined && Number(patch.min_photos) < 1) {
      throw new Error('Jumlah minimal foto tidak boleh nol.');
    }
    const pairs = [
      ['pending_threshold_hours', patch.pending_threshold_hours],
      ['min_photos', patch.min_photos],
      ['max_photos', patch.max_photos],
      ['max_file_mb', patch.max_file_mb],
    ].filter(([, v]) => v !== undefined);
    for (const [k, v] of pairs) {
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = now()`,
        [k, String(v)],
      );
    }
    return S();
  };

  const users = async () => {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.role, u.is_active, u.last_login_at, u.created_at, u.updated_at,
              COUNT(o.id)::int AS order_count
       FROM users u LEFT JOIN orders o ON o.trader_id = u.id
       GROUP BY u.id ORDER BY u.created_at`,
    );
    return rows.map((r) => ({ ...r, last_login_at: r.last_login_at ? new Date(r.last_login_at).toISOString() : null, created_at: new Date(r.created_at).toISOString(), updated_at: new Date(r.updated_at).toISOString() }));
  };

  const userByUsername = async (username) => {
    const { rows } = await pool.query(`SELECT * FROM users WHERE username = $1`, [username.toLowerCase()]);
    return rows[0] ?? null;
  };

  const userById = async (id) => {
    const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
    return rows[0] ?? null;
  };

  // Owner foto bukti dari nama file di /uploads (untuk object-level authorization,
  // vuln-0004): cari di order_photos maupun barcode_path orders.
  const photoOwner = async (fileName) => {
    const path = `/uploads/${fileName}`;
    const { rows } = await pool.query(
      `SELECT o.trader_id, o.id AS order_id FROM order_photos op
       JOIN orders o ON o.id = op.order_id WHERE op.file_path = $1
       UNION SELECT o.trader_id, o.id FROM orders o WHERE o.barcode_path = $1`,
      [path],
    );
    return rows[0] ?? null;
  };

  const setLastLogin = (id) => pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [id]);

  const activeAdminCount = async () => {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND is_active`);
    return rows[0].n;
  };

  const createUser = async (input) => {
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (username, password_hash, display_name, role)
         VALUES ($1, $2, $3, $4) RETURNING id, username, display_name, role, is_active, created_at`,
        [input.username.toLowerCase(), input.password_hash, input.display_name, input.role],
      );
      return rows[0];
    } catch (e) {
      if (e.code === '23505') throw new Error('Username sudah dipakai.');
      throw e;
    }
  };

  const updateUser = async (id, patch) => {
    const sets = [];
    const vals = [];
    if (patch.role) { sets.push('role = $' + (vals.length + 1)); vals.push(patch.role); }
    if (patch.display_name) { sets.push('display_name = $' + (vals.length + 1)); vals.push(patch.display_name); }
    if (patch.password_hash) { sets.push('password_hash = $' + (vals.length + 1)); vals.push(patch.password_hash); }
    if (patch.is_active !== undefined) { sets.push('is_active = $' + (vals.length + 1)); vals.push(patch.is_active); }
    if (sets.length === 0) return;
    vals.push(id);
    const { rowCount } = await pool.query(
      `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`,
      vals,
    );
    if (rowCount === 0) throw new Error('Pengguna tidak ditemukan.');
  };

  const deleteUser = async (id) => {
    const exists = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
    if (!exists.rows[0]) throw new Error('Pengguna tidak ditemukan.');
    // Riwayat mereferensikan user (order, foto, event) — hapus fisik tidak boleh.
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE trader_id = $1)::int AS orders,
         (SELECT COUNT(*) FROM order_photos WHERE uploaded_by = $1)::int AS photos,
         (SELECT COUNT(*) FROM order_events WHERE actor_id = $1)::int AS events`,
      [id],
    );
    const { orders, photos, events } = rows[0];
    if (orders + photos + events > 0) {
      throw new Error('Akun masih memiliki riwayat order/foto. Nonaktifkan bila tidak dipakai.');
    }
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  };

  // ---------- Katalog: produk (tipe barang, kuota lintas toko) + toko marketplace ----------

  const listMarketplaceStores = async () => {
    const { rows } = await pool.query(`SELECT id, name, is_active, created_at, updated_at FROM marketplace_stores WHERE is_active = true ORDER BY lower(name)`);
    return rows;
  };

  const createMarketplaceStore = async (name) => {
    const clean = String(name ?? '').trim();
    if (!clean || clean.length > 100) throw new Error('Nama toko wajib diisi dan maksimal 100 karakter.');
    try {
      await pool.query(`INSERT INTO marketplace_stores (name) VALUES ($1)`, [clean]);
    } catch (e) {
      if (e.code === '23505') throw new Error('Nama toko sudah terdaftar.');
      throw e;
    }
    return listMarketplaceStores();
  };

  const deleteMarketplaceStore = async (id) => {
    const { rows } = await pool.query(`SELECT name FROM marketplace_stores WHERE id = $1 AND is_active = true`, [id]);
    if (!rows[0]) throw new Error('Toko marketplace tidak ditemukan.');
    const used = await pool.query(`SELECT 1 FROM orders WHERE store_id = $1 LIMIT 1`, [id]);
    if (used.rows[0]) throw new Error('Toko masih dipakai order. Nonaktifkan bila tidak digunakan.');
    await pool.query(`UPDATE marketplace_stores SET is_active = false, updated_at = now() WHERE id = $1`, [id]);
    return listMarketplaceStores();
  };

  const listProducts = async () => {
    const { rows } = await pool.query(
      `SELECT p.*, COUNT(o.id)::int AS used_quota
       FROM products p LEFT JOIN orders o ON o.product_id = p.id
       GROUP BY p.id ORDER BY p.created_at`,
    );
    return rows.map((r) => ({
      ...r,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
      remaining_quota: Math.max(0, r.quota - r.used_quota),
    }));
  };

  const createProduct = async (input) => {
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 150) throw new Error('Nama produk wajib diisi dan maksimal 150 karakter.');
    try {
      await pool.query(
        `INSERT INTO products (name, quota) VALUES ($1, $2)`,
        [name, Math.max(0, Math.floor(Number(input.quota) || 0))],
      );
    } catch (e) {
      if (e.code === '23505') throw new Error('Nama produk sudah terdaftar.');
      throw e;
    }
    return listProducts();
  };

  const deleteProduct = async (id) => {
    const exists = await pool.query(`SELECT id FROM products WHERE id = $1`, [id]);
    if (!exists.rows[0]) throw new Error('Produk tidak ditemukan.');
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM((status <> 'selesai')::int), 0)::int AS active
       FROM orders WHERE product_id = $1`,
      [id],
    );
    const { total, active } = rows[0];
    if (active > 0) throw new Error('Produk masih memiliki order aktif. Selesaikan semua order sebelum menghapus produk.');
    if (total > 0) {
      // Semua order sudah selesai: tidak bisa hapus fisik (FK), arsipkan lewat nonaktif.
      await pool.query(`UPDATE products SET is_active = false, updated_at = now() WHERE id = $1`, [id]);
    } else {
      const result = await pool.query(`DELETE FROM products WHERE id = $1`, [id]);
      if (result.rowCount === 0) throw new Error('Produk tidak ditemukan.');
    }
    return listProducts();
  };

  // Atomic: kuota berubah lewat UPDATE tunggal di transaksi — bebas lost update
  // ketika banyak admin menambah kuota bersamaan (80+ trader rebutan aman).
  const addProductQuota = async (id, amount) => {
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) throw new Error('Tambahan kuota tidak valid.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`UPDATE products SET quota = quota + $1, updated_at = now() WHERE id = $2 RETURNING id`, [amount, id]);
      if (!rows[0]) throw new Error('Produk tidak ditemukan.');
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return listProducts();
  };

  // Reset = kuota disamakan dengan jumlah terpakai (sisa 0). Row lock agar
  // tidak balapan dengan add-quota/create-order yang berlangsung bersamaan.
  const resetProductQuota = async (id) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`SELECT id FROM products WHERE id = $1 FOR UPDATE`, [id]);
      if (!rows[0]) throw new Error('Produk tidak ditemukan.');
      await client.query(
        `UPDATE products p SET quota = used.used, updated_at = now()
         FROM (SELECT COUNT(*)::int AS used FROM orders WHERE product_id = $1) used
         WHERE p.id = $1`,
        [id],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return listProducts();
  };

  const updateProduct = async (id, patch) => {
    const { rows } = await pool.query(`SELECT * FROM products WHERE id = $1`, [id]);
    const m = rows[0];
    if (!m) throw new Error('Produk tidak ditemukan.');
    if (patch.name) {
      const dup = await pool.query(`SELECT id FROM products WHERE lower(name) = lower($1) AND id <> $2`, [patch.name, id]);
      if (dup.rows[0]) throw new Error('Nama produk sudah terdaftar.');
    }
    if (patch.quota !== undefined) {
      const q = Math.max(0, Math.floor(Number(patch.quota) || 0));
      const { rows: usedRows } = await pool.query(`SELECT COUNT(*)::int AS used FROM orders WHERE product_id = $1`, [id]);
      if (q < usedRows[0].used) throw new Error('Kuota tidak boleh lebih kecil dari jumlah order yang sudah ada.');
    }
    const sets = ['updated_at = now()'];
    const vals = [];
    for (const k of ['name', 'quota', 'is_active']) {
      if (patch[k] !== undefined) { sets.push(`${k} = $${vals.length + 1}`); vals.push(patch[k]); }
    }
    vals.push(id);
    await pool.query(`UPDATE products SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    return listProducts();
  };

  const orderByNumber = async (num) => {
    const { rows } = await pool.query(`SELECT * FROM orders WHERE order_number = $1`, [num]);
    return rows[0] ?? null;
  };

  const getOrder = async (id) => {
    const { rows } = await pool.query(`${SELECT_VIEW} WHERE o.id = $1`, [id]);
    if (!rows[0]) throw new Error('Order tidak ditemukan');
    return toView(rows[0], (await S()).pending_threshold_hours);
  };

  const listOrders = async (query = {}) => {
    const conds = [];
    const vals = [];
    if (query.q) {
      const q = `%${query.q}%`;
      conds.push(`(o.order_number ILIKE $${vals.length + 1} OR o.product_name ILIKE $${vals.length + 1} OR o.recipient_name ILIKE $${vals.length + 1})`);
      vals.push(q);
    }
    if (query.status) { conds.push(`o.status = $${vals.length + 1}`); vals.push(query.status); }
    if (query.pickup_method) { conds.push(`o.pickup_method = $${vals.length + 1}`); vals.push(query.pickup_method); }
    if (query.store) { conds.push(`o.store_id = $${vals.length + 1}`); vals.push(query.store); }
    if (query.trader) { conds.push(`o.trader_id = $${vals.length + 1}`); vals.push(query.trader); }
    if (query.from) { conds.push(`o.created_at >= $${vals.length + 1}`); vals.push(query.from); }
    if (query.to) { conds.push(`o.created_at <= $${vals.length + 1}`); vals.push(query.to); }
    const where = conds.length ? ` WHERE ${conds.join(' AND ')}` : '';
    const threshold = (await S()).pending_threshold_hours;

    // Server-side pagination: total dihitung via COUNT, item dibatasi LIMIT/OFFSET.
    const perPage = Math.max(1, Math.min(200, Number(query.per_page ?? 50)));
    const page = Math.max(1, Number(query.page ?? 1));
    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS total FROM (${SELECT_VIEW}${where}) c`, vals);
    const total = countRows[0].total;
    const { rows } = await pool.query(
      `${SELECT_VIEW}${where} ORDER BY o.created_at DESC LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
      [...vals, perPage, (page - 1) * perPage],
    );
    return { items: rows.map((r) => toView(r, threshold)), total, page, per_page: perPage };
  };

  const createOrder = async (input, actorId) => {
    const dup = await orderByNumber(input.order_number);
    if (dup) {
      const { rows } = await pool.query(`SELECT display_name FROM users WHERE id = $1`, [dup.trader_id]);
      throw new Error(`Nomor pesanan ${input.order_number} sudah pernah diinput. Order #${dup.order_number} dari ${rows[0]?.display_name ?? '—'}.`);
    }
    let id;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Rebutan kuota per tipe barang (lintas toko): lock baris produk agar
      // pengecekan sisa kuota atomik terhadap order konkuren.
      const { rows: pRows } = await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [input.product_id]);
      const p = pRows[0];
      if (!p) throw new Error('Produk tidak ditemukan.');
      if (!p.is_active) throw new Error(`Produk ${p.name} sedang nonaktif.`);
      const { rows: storeRows } = await client.query(`SELECT * FROM marketplace_stores WHERE id = $1`, [input.store_id]);
      const st = storeRows[0];
      if (!st) throw new Error('Toko marketplace tidak ditemukan.');
      if (!st.is_active) throw new Error(`Toko ${st.name} sedang nonaktif.`);
      const { rows: usedRows } = await client.query(`SELECT COUNT(*)::int AS used FROM orders WHERE product_id = $1`, [p.id]);
      if (usedRows[0].used >= p.quota) {
        throw new Error(`Kuota produk ${p.name} sudah habis!`);
      }
      const { rows } = await client.query(
        `INSERT INTO orders (order_number, product_name, store_name, recipient_name, pickup_method, trader_id, product_id, store_id, order_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [input.order_number, p.name, st.name, input.recipient_name, input.pickup_method, input.trader_id ?? actorId, p.id, st.id, input.order_amount ?? null],
      );
      id = rows[0].id;
      await client.query(
        `INSERT INTO order_events (order_id, actor_id, event_type, to_status, note) VALUES ($1,$2,'created','data_masuk','Order dibuat')`,
        [id, actorId],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505') {
        const dup2 = await orderByNumber(input.order_number);
        const { rows } = await pool.query(`SELECT display_name FROM users WHERE id = $1`, [dup2.trader_id]);
        throw new Error(`Nomor pesanan ${input.order_number} sudah pernah diinput. Order #${dup2.order_number} dari ${rows[0]?.display_name ?? '—'}.`);
      }
      throw e;
    } finally {
      client.release();
    }
    return getOrder(id);
  };

  const pushEvent = (clientOrPool, orderId, actorId, type, from, to, note) =>
    clientOrPool.query(
      `INSERT INTO order_events (order_id, actor_id, event_type, from_status, to_status, note) VALUES ($1,$2,$3,$4,$5,$6)`,
      [orderId, actorId, type, from, to, note],
    );

  const updateStatus = async (id, to, actorId) => {
    if (to === 'proses_pick_up') {
      // Jalur proses pick up mewajibkan foto barcode — pakai POST /orders/:id/pickup.
      throw new Error('Foto barcode pengambilan wajib diunggah untuk memproses pick up.');
    }
    const s = await S();
    const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [id]);
    const o = rows[0];
    if (!o) throw new Error('Order tidak ditemukan');
    if (to === 'selesai' && o.photo_count < s.min_photos) {
      throw new Error(`Minimal ${s.min_photos} foto bukti sebelum order selesai.`);
    }
    const from = o.status;
    const sets = ['status = $1', 'updated_at = now()'];
    if (to === 'selesai') sets.push('completed_at = now()');
    if (to === 'data_masuk') sets.push('picked_up_at = NULL', 'completed_at = NULL');
    await pool.query(`UPDATE orders SET ${sets.join(', ')} WHERE id = $2`, [to, id]);
    await pushEvent(pool, id, actorId, to === 'selesai' ? 'completed' : 'status', from, to, null);
    return getOrder(id);
  };

  // Transisi data_masuk → proses_pick_up + simpan foto barcode pengambilan (atomik).
  // Foto baru opsional bila order sudah punya barcode terpasang ATAU sudah ada minimal
  // satu foto bukti (diupload lewat mana pun).
  const applyPickup = async (orderId, actorId, file, note, hasEvidence = false) => {
    if (!file && !hasEvidence) {
      throw new Error('Foto barcode pengambilan wajib diunggah untuk memproses pick up.');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sets = [`status = 'proses_pick_up'`, 'picked_up_at = now()', 'updated_at = now()'];
      if (file) sets.push('photo_count = photo_count + 1');
      await client.query(`UPDATE orders SET ${sets.join(', ')} WHERE id = $1`, [orderId]);
      if (file) {
        await client.query(
          `INSERT INTO order_photos (order_id, file_path, file_name, mime_type, file_size, source, uploaded_by) VALUES ($1,$2,$3,$4,$5,'pickup',$6)`,
          [orderId, `/uploads/${file.filename}`, file.originalname, file.mimetype, file.size, actorId],
        );
      }
      await pushEvent(client, orderId, actorId, 'picked_up', 'data_masuk', 'proses_pick_up', note);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  };

  const scan = async (code, actorId, file = null) => {
    const normalized = String(code).trim();
    const { rows } = await pool.query(`SELECT * FROM orders WHERE order_number = $1`, [normalized]);
    const o = rows[0];
    if (!o) return null;
    if (o.status !== 'data_masuk') return getOrder(o.id);
    await applyPickup(o.id, actorId, file, 'Scan nomor pesanan', !!o.barcode_path || o.photo_count >= 1);
    return getOrder(o.id);
  };

  const pickupOrder = async (id, actorId, file = null) => {
    const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [id]);
    const o = rows[0];
    if (!o) throw new Error('Order tidak ditemukan');
    if (o.status !== 'data_masuk') throw new Error('Order ini sudah diproses sebelumnya.');
    await applyPickup(id, actorId, file, 'Proses pick up', !!o.barcode_path || o.photo_count >= 1);
    return getOrder(id);
  };

  const attachBarcode = async (id, path) => {
    await pool.query(`UPDATE orders SET barcode_path = $1, updated_at = now() WHERE id = $2`, [path, id]);
    return getOrder(id);
  };

  const detail = async (id) => {
    const view = await getOrder(id);
    const { rows: photos } = await pool.query(`SELECT id, file_path, source FROM order_photos WHERE order_id = $1`, [id]);
    const { rows: events } = await pool.query(
      `SELECT e.id, e.event_type, e.from_status, e.to_status, e.note, e.created_at, u.display_name AS actor_name
       FROM order_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.order_id = $1 ORDER BY e.created_at DESC`,
      [id],
    );
    return {
      ...view,
      photos: photos.map((p) => ({ id: p.id, file_path: p.file_path, source: p.source })),
      events: events.map((e) => ({ ...e, created_at: new Date(e.created_at).toISOString() })),
    };
  };

  const uploadPhoto = async (orderId, actorId, file = null) => {
    const s = await S();
    const o = await getOrder(orderId);
    if (o.photo_count >= s.max_photos) throw new Error(`Maksimal ${s.max_photos} foto per order.`);
    const path = file ? `/uploads/${file.filename}` : `/uploads/demo-${orderId.slice(0, 4)}.jpg`;
    const name = file ? file.originalname : 'bukti.jpg';
    const mime = file ? file.mimetype : 'image/jpeg';
    const size = file ? file.size : 1024;
    await pool.query(
      `UPDATE orders SET photo_count = photo_count + 1, updated_at = now() WHERE id = $1`,
      [orderId],
    );
    await pool.query(
      `INSERT INTO order_photos (order_id, file_path, file_name, mime_type, file_size, source, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [orderId, path, name, mime, size, file ? 'berkas' : 'kamera', actorId],
    );
    return getOrder(orderId);
  };

  const deletePhoto = async (orderId, photoId) => {
    await pool.query(`DELETE FROM order_photos WHERE id = $1 AND order_id = $2`, [photoId, orderId]);
    await pool.query(`UPDATE orders SET photo_count = GREATEST(photo_count - 1, 0), updated_at = now() WHERE id = $1`, [orderId]);
    return getOrder(orderId);
  };

  const completeOrder = async (id, note, actorId) => {
    const s = await S();
    const o = await getOrder(id);
    if (o.photo_count < s.min_photos) throw new Error(`Minimal ${s.min_photos} foto bukti wajib diunggah.`);
    const from = o.status;
    await pool.query(`UPDATE orders SET status = 'selesai', note = $1, completed_at = now(), updated_at = now() WHERE id = $2`, [note, id]);
    await pushEvent(pool, id, actorId, 'completed', from, 'selesai', note);
    return getOrder(id);
  };

  const markProblem = async (id, reason, actorId) => {
    await pool.query(`UPDATE orders SET is_problem = true, problem_reason = $1, updated_at = now() WHERE id = $2`, [reason, id]);
    await pushEvent(pool, id, actorId, 'problem', null, null, reason);
    return getOrder(id);
  };

  const reopen = async (id, actorId) => {
    const o = await getOrder(id);
    if (o.status !== 'selesai') throw new Error('Hanya order Selesai yang dapat dibuka kembali.');
    const from = o.status;
    await pool.query(`UPDATE orders SET status = 'proses_pick_up', completed_at = NULL, updated_at = now() WHERE id = $1`, [id]);
    await pushEvent(pool, id, actorId, 'reopened', from, 'proses_pick_up', 'Order dibuka kembali oleh admin');
    return getOrder(id);
  };

  const deleteOrder = async (id) => {
    await pool.query(`DELETE FROM orders WHERE id = $1`, [id]);
  };

  const editOrder = async (id, patch, actorId) => {
    const dup = patch.order_number ? await orderByNumber(patch.order_number) : null;
    if (dup && dup.id !== id) throw new Error(`Nomor pesanan ${patch.order_number} sudah dipakai order lain.`);
    const sets = [];
    const vals = [];
    for (const k of ['product_name', 'store_name', 'order_number', 'recipient_name']) {
      if (patch[k] !== undefined) { sets.push(`${k} = $${vals.length + 1}`); vals.push(patch[k]); }
    }
    if (sets.length) {
      vals.push(id);
      await pool.query(`UPDATE orders SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals);
    }
    return getOrder(id);
  };

  const reports = async (range, from, to) => {
    // Rentang khusus (from/to eksplisit) menimpa rentang bernama (range).
    const start = from || rangeToFrom(range);
    const where = [];
    const args = [];
    if (start) { where.push(`o.created_at >= $${args.length + 1}`); args.push(start); }
    if (to) { where.push(`o.created_at <= $${args.length + 1}`); args.push(to); }
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const { rows: totalRows } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM((o.status = 'data_masuk')::int), 0) AS data_masuk,
              COALESCE(SUM((o.status = 'proses_pick_up')::int), 0) AS proses_pick_up,
              COALESCE(SUM((o.status = 'selesai')::int), 0) AS selesai,
              COALESCE(SUM(o.is_problem::int), 0) AS bermasalah
       FROM orders o${whereSql}`,
      args,
    );
    const totals = totalRows[0];

    const { rows: perTrader } = await pool.query(
      `SELECT u.display_name AS trader, COUNT(*)::int AS total, COALESCE(SUM((o.status = 'selesai')::int), 0)::int AS selesai
       FROM orders o JOIN users u ON u.id = o.trader_id${whereSql}
       GROUP BY u.display_name ORDER BY total DESC`,
      args,
    );
    const traderRows = perTrader.map((t) => ({ ...t, belum_selesai: t.total - t.selesai }));

    // Rekap per tipe barang (kuota lintas toko): gabungkan order dari semua toko.
    const { rows: perProdukRaw } = await pool.query(
      `SELECT p.name AS product_name, p.quota,
              COUNT(o.id)::int AS used_quota, COALESCE(SUM(o.order_amount), 0)::numeric AS amount
       FROM orders o JOIN products p ON p.id = o.product_id${whereSql}
       GROUP BY p.id ORDER BY used_quota DESC`,
      args,
    );
    const perProduk = perProdukRaw.map((r) => ({ ...r, amount: Number(r.amount), remaining_quota: Math.max(0, r.quota - r.used_quota) }));

    const threshold = (await S()).pending_threshold_hours;
    // Delayed ikut rentang: hanya order yang masih pending/bermasalah dan
    // pembaruannya terjadi di dalam rentang terpilih.
    const delayedConds = [
      `(o.is_problem OR (o.status IN ('data_masuk','proses_pick_up') AND o.updated_at <= now() - ($1 || ' hours')::interval))`,
    ];
    const delayedArgs = [String(threshold)];
    if (start) { delayedConds.push(`o.updated_at >= $${delayedArgs.length + 1}`); delayedArgs.push(start); }
    if (to) { delayedConds.push(`o.updated_at <= $${delayedArgs.length + 1}`); delayedArgs.push(to); }
    const { rows: delayed } = await pool.query(
      `SELECT o.order_number, o.product_name, u.display_name AS trader, o.updated_at, o.is_problem
       FROM orders o JOIN users u ON u.id = o.trader_id
       WHERE ${delayedConds.join(' AND ')}
       ORDER BY o.updated_at ASC`,
      delayedArgs,
    );
    const delayedRows = delayed.map((o) => {
      const hours = (Date.now() - new Date(o.updated_at).getTime()) / 3600000;
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      return { order_number: o.order_number, product_name: o.product_name, trader: o.trader, duration: `${h}j ${m}m`, is_problem: o.is_problem };
    });

    return { totals, perTrader: traderRows, perProduk, delayed: delayedRows };
  };

  return {
    settings, settingsPatch, listMarketplaceStores, createMarketplaceStore, deleteMarketplaceStore, users, userByUsername, userById, photoOwner, setLastLogin,
    activeAdminCount, createUser, updateUser, deleteUser, listProducts, createProduct, addProductQuota, updateProduct, resetProductQuota, deleteProduct,
    orderByNumber, getOrder, listOrders, createOrder, updateStatus, scan, pickupOrder, attachBarcode,
    detail, uploadPhoto, deletePhoto, completeOrder, markProblem, reopen, deleteOrder, editOrder, reports,
  };
};
