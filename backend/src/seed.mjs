// Seed data demo untuk PostgreSQL. Bisa dipakai sebagai fungsi (dev-db) atau CLI:
//   node src/seed.mjs
// Idempoten: dilewati bila tabel users sudah terisi.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createPool, migrate } from './db.mjs';

export async function seedDemoData(pool) {
  const { rows: existing } = await pool.query('SELECT id FROM users LIMIT 1');
  if (existing.length) return false;

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const { rows: admins } = await pool.query(
    `INSERT INTO users (username, password_hash, display_name, role) VALUES
     ('admin', $1, 'Dimas Arya', 'admin'),
     ('nabila', $2, 'Nabila Putri', 'trader'),
     ('fajar', $3, 'Fajar Rahman', 'trader')
     RETURNING id, username`,
    [hash('admin'), hash('trader'), hash('trader')],
  );
  const byName = Object.fromEntries(admins.map((u) => [u.username, u.id]));

  const { rows: storeRows } = await pool.query(
    `INSERT INTO marketplace_stores (name) VALUES
     ('Tokopedia'), ('Shopee'), ('Lazada'), ('Blibli')
     RETURNING name, id`,
  );
  const byStore = Object.fromEntries(storeRows.map((s) => [s.name, s.id]));

  const { rows: productRows } = await pool.query(
    `INSERT INTO products (name, quota) VALUES
     ('Wireless Keyboard K2', 50),
     ('Rak Serbaguna 4 Susun', 50),
     ('Mouse Pad XL', 50),
     ('HDMI Cable 2.1 3M', 50),
     ('Monitor LG 24 inch', 50),
     ('Mechanical Keyboard V1', 50),
     ('USB-C Hub 7 in 1', 50),
     ('Standing Desk Mat', 50),
     ('Webcam Full HD', 50),
     ('Kursi Kerja Ergonomis', 5)
     RETURNING name, id`,
  );
  const byProduct = Object.fromEntries(productRows.map((p) => [p.name, p.id]));

  const orderSpecs = [
    ['240626-018', 'Wireless Keyboard K2', 'Tokopedia', 'Nadia Putri', 'zaydan_ambilan_gjm', byName.nabila, 'data_masuk', {}],
    ['240626-017', 'Rak Serbaguna 4 Susun', 'Shopee', 'Fajar Rahman', 'self_pick_up', byName.fajar, 'data_masuk', {}],
    ['240626-016', 'Mouse Pad XL', 'Lazada', 'Rina Sari', 'zaydan_ambilan_gjm', byName.admin, 'data_masuk', {}],
    ['240626-015', 'HDMI Cable 2.1 3M', 'Lazada', 'Dimas Arya', 'zaydan_ambilan_gjm', byName.admin, 'data_masuk', {}],
    ['240626-011', 'Monitor LG 24 inch', 'Blibli', 'Rizky Maulana', 'zaydan_ambilan_gjm', byName.admin, 'proses_pick_up', { picked_up_at: new Date() }],
    ['240626-008', 'Mechanical Keyboard V1', 'Tokopedia', 'Bagus Santoso', 'self_pick_up', byName.nabila, 'proses_pick_up', { is_problem: true, problem_reason: 'Label barcode tertukar dengan pesanan lain.' }],
    ['240626-009', 'USB-C Hub 7 in 1', 'Tokopedia', 'Rina Sari', 'zaydan_ambilan_gjm', byName.nabila, 'selesai', { photo_count: 2, picked_up_at: new Date(), completed_at: new Date(), note: 'Barang dalam kondisi baik.' }],
    ['240626-006', 'Standing Desk Mat', 'Shopee', 'Fauzan Hadi', 'zaydan_ambilan_gjm', byName.fajar, 'selesai', { photo_count: 1, picked_up_at: new Date(), completed_at: new Date(), note: 'Sudah diambil.' }],
    ['240626-004', 'Webcam Full HD', 'Lazada', 'Dimas Arya', 'zaydan_ambilan_gjm', byName.admin, 'selesai', { photo_count: 1, picked_up_at: new Date(), completed_at: new Date() }],
    ['240625-189', 'Kursi Kerja Ergonomis', 'Shopee', 'Fajar Rahman', 'self_pick_up', byName.fajar, 'proses_pick_up', { is_problem: true, problem_reason: 'Paket hilang di titik ambil.' }],
  ];

  for (const [num, product, store, recipient, method, trader, status, extra] of orderSpecs) {
    const cols = ['order_number', 'product_name', 'store_name', 'recipient_name', 'pickup_method', 'trader_id', 'product_id', 'store_id', 'status'];
    const vals = [`TRK-${num}`, product, store, recipient, method, trader, byProduct[product], byStore[store], status];
    for (const [k, v] of Object.entries(extra)) {
      cols.push(k);
      vals.push(v);
    }
    const { rows } = await pool.query(
      `INSERT INTO orders (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      vals,
    );
    await pool.query(
      `INSERT INTO order_events (order_id, actor_id, event_type, to_status, note) VALUES ($1, $2, 'created', 'data_masuk', 'Order dibuat')`,
      [rows[0].id, trader],
    );
  }
  return true;
}

// CLI langsung.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const pool = createPool();
  await migrate(pool);
  const did = await seedDemoData(pool);
  await pool.end();
  console.log(did ? 'Seed selesai. Demo: admin/admin, nabila/trader, fajar/trader.' : 'Seed dilewati — database sudah terisi.');
}
