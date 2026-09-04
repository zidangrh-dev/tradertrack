// Smoke test jalur produksi (pg.mjs) memakai PGlite via socket server (seperti dev-db).
// Validasi schema products/marketplace_stores + kuota rebutan lintas toko di jalur SQL asli.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import assert from 'node:assert/strict';

const db = new PGlite();
const socketServer = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 54331, maxConnections: 10 });
await socketServer.start();

process.env.DATABASE_URL = 'postgres://tradertrack:tradertrack@127.0.0.1:54331/tradertrack';
process.env.PG_POOL_MAX = '1';
const { createPool, migrate } = await import('../src/db.mjs');
const { seedDemoData } = await import('../src/seed.mjs');
const pgFactory = (await import('../src/pg.mjs')).default;

const pool = createPool();
await migrate(pool);
await seedDemoData(pool);
const repo = pgFactory(pool);

const all = await repo.listProducts();
assert.ok(all.length >= 10, 'produk ter-seed');
const seeded = all.find((p) => p.name === 'Wireless Keyboard K2');
assert.ok(seeded.used_quota >= 1, 'used_quota terhitung');

const stores = await repo.listMarketplaceStores();
assert.ok(stores.length >= 2, 'toko marketplace ter-seed');
const admin = await repo.userByUsername('admin');
const actorId = admin.id;

// Rebutan kuota per tipe barang (lintas toko): kuota 1 dihabiskan lewat toko berbeda.
const created = await repo.createProduct({ name: 'Smoke Quota', quota: 1 });
const p = created.find((m) => m.name === 'Smoke Quota');
await repo.createOrder({ order_number: `TRK-SQ-1-${Date.now()}`, recipient_name: 'A', pickup_method: 'zaydan_ambilan_gjm', product_id: p.id, store_id: stores[0].id }, actorId);
await assert.rejects(
  () => repo.createOrder({ order_number: `TRK-SQ-2-${Date.now()}`, recipient_name: 'B', pickup_method: 'zaydan_ambilan_gjm', product_id: p.id, store_id: stores[1].id }, actorId),
  /Kuota produk .* sudah habis/,
  'order kedua (toko berbeda) ditolak saat kuota produk habis',
);
const refreshed = (await repo.listProducts()).find((m) => m.id === p.id);
assert.equal(refreshed.remaining_quota, 0);

// Kuota tidak boleh turun di bawah terpakai.
await assert.rejects(() => repo.updateProduct(p.id, { quota: 0 }), /tidak boleh lebih kecil/);

// Hapus order → kuota kembali.
const orders = await repo.listOrders({ q: 'TRK-SQ-1' });
await repo.deleteOrder(orders.items[0].id);
const freed = (await repo.listProducts()).find((m) => m.id === p.id);
assert.equal(freed.remaining_quota, 1, 'kuota kembali setelah order dihapus');

// Duplikat nama produk → ditolak.
await assert.rejects(() => repo.createProduct({ name: 'Smoke Quota', quota: 5 }), /sudah terdaftar/);

// Add-quota atomic + reset.
await repo.addProductQuota(p.id, 10);
const added = (await repo.listProducts()).find((m) => m.id === p.id);
assert.equal(added.quota, 11);
await repo.resetProductQuota(p.id);
const reset = (await repo.listProducts()).find((m) => m.id === p.id);
assert.equal(reset.quota, 0);

// reports: dari/to membatasi totals DAN delayed (jalur SQL produksi).
const rAll = await repo.reports('', undefined, undefined);
assert.ok(rAll.totals.total >= 1, 'reports tanpa filter memuat order');
const farFuture = await repo.reports('', '2099-01-01T00:00:00.000Z', '2099-02-01T00:00:00.000Z');
assert.equal(farFuture.totals.total, 0, 'rentang masa depan total 0');
assert.equal(farFuture.delayed.length, 0, 'rentang masa depan tidak memuat delayed');
assert.ok(!farFuture.perTrader.length && !farFuture.perProduk.length, 'rentang masa depan kosong di semua bagian');

await pool.end();
await db.close();
console.log('Smoke test pg.mjs (products + kuota rebutan lintas toko): LULUS');
process.exit(0);
