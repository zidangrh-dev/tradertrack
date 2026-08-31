// Stack lengkap lokal tanpa Docker: PostgreSQL nyata (PGlite/WASM) yang
// menyajikan wire protocol Postgres, lalu API Express menyambung ke sana
// lewat DATABASE_URL — jalur kode produksi (src/pg.mjs), bukan repo memori.
//
//   npm run dev:db
//
// Data tersimpan persisten di backend/data/pglite.
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PORT = Number(process.env.PG_LITE_PORT || 54329);
const dataDir = path.join(__dirname, '..', 'data', 'pglite');

const db = new PGlite(dataDir);
console.log('[dev-db] PGlite siap');
const socketServer = new PGLiteSocketServer({ db, host: '127.0.0.1', port: DB_PORT, maxConnections: 10 });
await socketServer.start();
console.log(`[dev-db] PostgreSQL (PGlite) di 127.0.0.1:${DB_PORT} · data: ${dataDir}`);

// API server membaca DATABASE_URL saat inisialisasi — set sebelum import.
process.env.DATABASE_URL = `postgres://tradertrack:tradertrack@127.0.0.1:${DB_PORT}/tradertrack`;
// PGlite single-writer: pool 1 koneksi agar transaksi aman.
process.env.PG_POOL_MAX = '1';
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'dev-secret-ganti-di-produksi';

const { createPool } = await import('../src/db.mjs');
const { migrate } = await import('../src/db.mjs');
const { seedDemoData } = await import('../src/seed.mjs');

const pool = createPool();
await migrate(pool);
const did = await seedDemoData(pool);
await pool.end(); // bebaskan koneksi untuk pool server API
console.log(did ? '[dev-db] Seed demo dimuat (admin/admin, nabila/trader, fajar/trader).' : '[dev-db] Database sudah terisi — seed dilewati.');

await import('../server.mjs');
