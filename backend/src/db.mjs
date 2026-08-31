// Koneksi PostgreSQL + migrasi skema otomatis (PRD: migrate() di db.mjs).
import pg from 'pg';
import { readFileSync } from 'node:fs';

const { Pool } = pg;

export function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX || 10),
  });
}

export async function migrate(pool) {
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, description) VALUES
      ('pending_threshold_hours', '3', 'Ambang waktu tertunda (jam)'),
      ('min_photos', '1', 'Jumlah minimal foto bukti penyelesaian'),
      ('max_photos', '3', 'Jumlah maksimal foto per order'),
      ('max_file_mb', '20', 'Ukuran maksimal per berkas foto (MB)')
     ON CONFLICT (setting_key) DO NOTHING`,
  );
}
