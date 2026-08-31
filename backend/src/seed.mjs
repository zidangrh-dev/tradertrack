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

  const { rows: accounts } = await pool.query(
    `INSERT INTO bank_accounts (account_number, bank_name, account_holder_name, owner_user_id) VALUES
     ('1280098812', 'BCA', 'Dimas Arya', $1),
     ('1400000921', 'Bank Mandiri', 'Nabila Putri', $2),
     ('30217710', 'BRI', 'Fajar Rahman', $3)
     RETURNING id`,
    [byName.admin, byName.nabila, byName.fajar],
  );
  const [bca, mandiri, bri] = accounts.map((a) => a.id);

  const orderSpecs = [
    ['240626-018', 'Wireless Keyboard K2', 'Tokopedia', 'Nadia Putri', 'zaydan_ambilan_gjm', byName.nabila, mandiri, 'data_masuk', {}],
    ['240626-017', 'Rak Serbaguna 4 Susun', 'Shopee', 'Fajar Rahman', 'self_pick_up', byName.fajar, bri, 'data_masuk', {}],
    ['240626-016', 'Mouse Pad XL', 'Lazada', 'Rina Sari', 'zaydan_ambilan_gjm', byName.admin, bca, 'data_masuk', {}],
    ['240626-015', 'HDMI Cable 2.1 3M', 'Lazada', 'Dimas Arya', 'zaydan_ambilan_gjm', byName.admin, bca, 'data_masuk', {}],
    ['240626-011', 'Monitor LG 24 inch', 'Blibli', 'Rizky Maulana', 'zaydan_ambilan_gjm', byName.admin, bca, 'proses_pick_up', { picked_up_at: new Date() }],
    ['240626-008', 'Mechanical Keyboard V1', 'Tokopedia', 'Bagus Santoso', 'self_pick_up', byName.nabila, mandiri, 'proses_pick_up', { is_problem: true, problem_reason: 'Label barcode tertukar dengan pesanan lain.' }],
    ['240626-009', 'USB-C Hub 7 in 1', 'Tokopedia', 'Rina Sari', 'zaydan_ambilan_gjm', byName.nabila, mandiri, 'selesai', { photo_count: 2, picked_up_at: new Date(), completed_at: new Date(), note: 'Barang dalam kondisi baik.' }],
    ['240626-006', 'Standing Desk Mat', 'Shopee', 'Fauzan Hadi', 'zaydan_ambilan_gjm', byName.fajar, bri, 'selesai', { photo_count: 1, picked_up_at: new Date(), completed_at: new Date(), note: 'Sudah diambil.' }],
    ['240626-004', 'Webcam Full HD', 'Lazada', 'Dimas Arya', 'zaydan_ambilan_gjm', byName.admin, bca, 'selesai', { photo_count: 1, picked_up_at: new Date(), completed_at: new Date() }],
    ['240625-189', 'Kursi Kerja Ergonomis', 'Shopee', 'Fajar Rahman', 'self_pick_up', byName.fajar, bri, 'proses_pick_up', { is_problem: true, problem_reason: 'Paket hilang di titik ambil.' }],
  ];

  for (const [num, product, store, recipient, method, trader, bank, status, extra] of orderSpecs) {
    const cols = ['order_number', 'product_name', 'store_name', 'recipient_name', 'pickup_method', 'trader_id', 'bank_account_id', 'status'];
    const vals = [`TRK-${num}`, product, store, recipient, method, trader, bank, status];
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
