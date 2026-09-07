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

// Hapus produk: tanpa order → fisik; order aktif → ditolak; semua selesai → soft nonaktif.
const delFree = await repo.createProduct({ name: 'Smoke Hapus Bebas', quota: 5 });
const freeRow = delFree.find((x) => x.name === 'Smoke Hapus Bebas');
await repo.deleteProduct(freeRow.id);
assert.ok(!(await repo.listProducts()).some((x) => x.id === freeRow.id), 'produk tanpa order dihapus fisik');

const delActive = await repo.createProduct({ name: 'Smoke Hapus Aktif', quota: 5 });
const activeRow = delActive.find((x) => x.name === 'Smoke Hapus Aktif');
await repo.createOrder({ order_number: `TRK-DEL-${Date.now()}`, recipient_name: 'A', pickup_method: 'zaydan_ambilan_gjm', product_id: activeRow.id, store_id: stores[0].id }, actorId);
await assert.rejects(() => repo.deleteProduct(activeRow.id), /order aktif/, 'produk berorder aktif tidak bisa dihapus');

// Hapus akun: tanpa riwayat → sukses; berorder → ditolak.
const delUser = await repo.createUser({ username: `smoke_del_${Date.now()}`, password_hash: 'x', display_name: 'Del User', role: 'trader' });
await repo.deleteUser(delUser.id);
assert.ok(!(await repo.users()).some((x) => x.id === delUser.id), 'akun tanpa riwayat terhapus');
await assert.rejects(() => repo.deleteUser(actorId), /riwayat/, 'akun berorder/foto tidak bisa dihapus');

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

// Scoping laporan per trader (jalur SQL): trader hanya melihat order miliknya.
const nabila = await repo.userByUsername('nabila');
const scoped = await repo.reports('', undefined, undefined, nabila.id);
assert.ok(scoped.totals.total >= 1, 'laporan trader memuat order miliknya');
assert.ok(scoped.perTrader.length === 1 && scoped.perTrader[0].trader === nabila.display_name, 'laporan trader tidak memuat nama trader lain');
assert.ok(scoped.delayed.every((d) => d.trader === nabila.display_name), 'daftar tertunda trader tidak memuat trader lain');

// listOrders multi-toko (jalur SQL ANY): gabungan dua toko = OR dalam filter.
const avail2 = (await repo.listProducts()).find((x) => x.remaining_quota >= 2);
await repo.createOrder({ order_number: `TRK-ML-A-${Date.now()}`, recipient_name: 'A', pickup_method: 'zaydan_ambilan_gjm', product_id: avail2.id, store_id: stores[0].id }, actorId);
await repo.createOrder({ order_number: `TRK-ML-B-${Date.now()}`, recipient_name: 'B', pickup_method: 'zaydan_ambilan_gjm', product_id: avail2.id, store_id: stores[1].id }, actorId);
const both2 = await repo.listOrders({ store: [stores[0].id, stores[1].id], q: 'TRK-ML-' });
assert.equal(both2.total, 2, 'dua toko terpilih memuat kedua order');
const onlyA = await repo.listOrders({ store: [stores[0].id], q: 'TRK-ML-' });
assert.equal(onlyA.total, 1, 'satu toko hanya memuat order toko itu');

// Aturan bukti ganda di jalur SQL: barcode + foto bukti order wajib untuk order baru.
const dualProduct = (await repo.listProducts()).find((x) => x.remaining_quota >= 3);
const mkOrder = async (suffix) => repo.createOrder(
  { order_number: `TRK-DUAL-${suffix}-${Date.now()}`, recipient_name: 'A', pickup_method: 'self_pick_up', product_id: dualProduct.id, store_id: stores[0].id },
  actorId,
);
const noneYet = await mkOrder('A');
await assert.rejects(() => repo.pickupOrder(noneYet.id, actorId), /barcode/i, 'tanpa bukti apa pun ditolak');

const barcodeOnly = await mkOrder('B');
await repo.attachBarcode(barcodeOnly.id, '/uploads/dual-barcode.jpg');
await assert.rejects(() => repo.pickupOrder(barcodeOnly.id, actorId), /bukti order/i, 'barcode saja belum cukup');

const complete = await mkOrder('C');
await repo.attachBarcode(complete.id, '/uploads/dual-barcode2.jpg');
await repo.uploadPhoto(complete.id, actorId, null, 'order');
const picked = await repo.pickupOrder(complete.id, actorId);
assert.equal(picked.status, 'proses_pick_up', 'kedua bukti lengkap → pick up jalan');

await pool.end();
await db.close();
console.log('Smoke test pg.mjs (products + kuota rebutan lintas toko): LULUS');
process.exit(0);
