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

// Hapus barcode mengembalikan order ke keadaan tidak lengkap (jalur SQL).
const removable = await mkOrder('D');
await repo.attachBarcode(removable.id, '/uploads/dual-barcode3.jpg');
await repo.uploadPhoto(removable.id, actorId, null, 'order');
const cleared = await repo.clearBarcode(removable.id);
assert.equal(cleared.barcode_path, null, 'barcode dikosongkan');
await assert.rejects(() => repo.pickupOrder(removable.id, actorId), /barcode/i, 'tanpa barcode kembali ditolak');

await pool.end();
await db.close();
console.log('Smoke test pg.mjs (products + kuota rebutan lintas toko): LULUS');
process.exit(0);

// Setting gerbang versi tersimpan & terbaca di jalur SQL (string, bukan angka).
const s0 = await repo.settings();
assert.equal(s0.required_app_version, '', 'default: gerbang versi mati');
const s1 = await repo.settingsPatch({ required_app_version: '2.4.1', app_update_url: 'https://contoh.test/app.apk' });
assert.equal(s1.required_app_version, '2.4.1');
assert.equal(s1.app_update_url, 'https://contoh.test/app.apk');
await assert.rejects(() => repo.settingsPatch({ required_app_version: 'terbaru' }), /1\.2\.0/, 'format versi divalidasi');
await assert.rejects(() => repo.settingsPatch({ app_update_url: 'ftp://x/a.apk' }), /http/, 'skema URL divalidasi');
const s2 = await repo.settingsPatch({ required_app_version: '' });
assert.equal(s2.required_app_version, '', 'dikosongkan → gerbang mati');

// Role superadmin di jalur SQL: migrasi menaikkan akun 'admin' dan hitungan
// admin ikut mencakup superadmin.
const saUser = await repo.userByUsername('admin');
assert.equal(saUser.role, 'superadmin', 'akun admin bawaan dinaikkan jadi superadmin');
assert.ok((await repo.activeSuperadminCount()) >= 1, 'ada superadmin aktif');
assert.ok((await repo.activeAdminCount()) >= 1, 'superadmin ikut dihitung sebagai admin');

// CHECK constraint menerima role baru, menolak yang tidak dikenal.
const saBaru = await repo.createUser({
  username: `sa_smoke_${Date.now()}`, password_hash: 'x', display_name: 'SA Smoke', role: 'superadmin',
});
assert.equal(saBaru.role, 'superadmin');
assert.equal(await repo.activeSuperadminCount(), 2, 'superadmin bertambah');
await assert.rejects(
  () => repo.createUser({ username: `bad_${Date.now()}`, password_hash: 'x', display_name: 'X', role: 'dewa' }),
  'role di luar daftar ditolak database',
);
await repo.deleteUser(saBaru.id);
assert.equal(await repo.activeSuperadminCount(), 1, 'kembali satu superadmin');

// Filter produk (jalur SQL ANY): OR di dalam filter, AND dengan toko.
const prodFilter = (await repo.listProducts()).find((x) => x.remaining_quota >= 2);
await repo.createOrder(
  { order_number: `TRK-PF-A-${Date.now()}`, recipient_name: 'A', pickup_method: 'self_pick_up', product_id: prodFilter.id, store_id: stores[0].id },
  actorId,
);
await repo.createOrder(
  { order_number: `TRK-PF-B-${Date.now()}`, recipient_name: 'B', pickup_method: 'self_pick_up', product_id: prodFilter.id, store_id: stores[1].id },
  actorId,
);
const byProduct = await repo.listOrders({ product: [prodFilter.id], q: 'TRK-PF-' });
assert.equal(byProduct.total, 2, 'filter produk memuat kedua order');
assert.ok(byProduct.items.every((o) => o.product_id === prodFilter.id), 'hanya produk terpilih');
const produkDanToko = await repo.listOrders({ product: [prodFilter.id], store: [stores[0].id], q: 'TRK-PF-' });
assert.equal(produkDanToko.total, 1, 'produk + toko dipersempit (AND antar-filter)');
const produkTakDipakai = await repo.listOrders({ product: ['00000000-0000-0000-0000-000000000000'], q: 'TRK-PF-' });
assert.equal(produkTakDipakai.total, 0, 'produk lain tidak memuat order ini');

// Alur done_pickup di jalur SQL: CHECK constraint + urutan transisi.
const flowProd = (await repo.listProducts()).find((x) => x.remaining_quota >= 2);
const mkFlow = async (tag) => repo.createOrder(
  { order_number: `TRK-FLOW-${tag}-${Date.now()}`, recipient_name: 'A', pickup_method: 'self_pick_up', product_id: flowProd.id, store_id: stores[0].id },
  actorId,
);

// Melompati done_pickup ditolak.
const lompat = await mkFlow('A');
await repo.attachBarcode(lompat.id, '/uploads/flow-a.jpg');
await repo.uploadPhoto(lompat.id, actorId, null, 'order');
await repo.pickupOrder(lompat.id, actorId);
await assert.rejects(() => repo.completeOrder(lompat.id, '', actorId), /Done pickup/i, 'tidak boleh langsung selesai');
await assert.rejects(() => repo.updateStatus(lompat.id, 'selesai', actorId), /Done pickup/i, 'jalur status juga ditolak');

// Rantai penuh berhasil: done_pickup via repo.donePickup (2 foto, transaksi).
const penuh = await mkFlow('B');
await repo.attachBarcode(penuh.id, '/uploads/flow-b.jpg');
await repo.uploadPhoto(penuh.id, actorId, null, 'order');
await repo.pickupOrder(penuh.id, actorId);
const duaFoto = [
  { filename: 'flow-b1.jpg', originalname: 'a.jpg', mimetype: 'image/jpeg', size: 1 },
  { filename: 'flow-b2.jpg', originalname: 'b.jpg', mimetype: 'image/jpeg', size: 1 },
];
const done = await repo.donePickup(penuh.id, duaFoto, actorId);
assert.equal(done.status, 'done_pickup', 'CHECK constraint menerima done_pickup');
assert.equal(done.photo_count, 3, '2 foto pengambilan + 1 bukti order');
assert.ok(done.picked_up_at, 'waktu pengambilan tercatat');
const beres = await repo.completeOrder(penuh.id, 'ok', actorId);
assert.equal(beres.status, 'selesai');

// done_pickup hanya dari proses_pick_up.
const langsung = await mkFlow('C');
await assert.rejects(() => repo.donePickup(langsung.id, duaFoto, actorId), /Proses pick up/i);

// updateStatus ke done_pickup ditolak — jalur wajib lewat donePickup.
await assert.rejects(() => repo.updateStatus(penuh.id, 'done_pickup', actorId), /2 foto pengambilan/i);

// donePickup tanpa berkas baru: bukti sudah dilampirkan lebih dulu lewat galeri
// (uploadPhoto source pickup_evidence). photo_count hanya menghitung yang nyata.
const galeri = await mkFlow('D');
await repo.attachBarcode(galeri.id, '/uploads/flow-d.jpg');
await repo.uploadPhoto(galeri.id, actorId, null, 'order');
await repo.pickupOrder(galeri.id, actorId);
await repo.uploadPhoto(galeri.id, actorId, null, 'pickup_evidence');
const sebelumTandai = (await repo.getOrder(galeri.id)).photo_count;
const tanpaBerkas = await repo.donePickup(galeri.id, [], actorId);
assert.equal(tanpaBerkas.status, 'done_pickup', 'bukti dari galeri cukup untuk menandai');
assert.equal(tanpaBerkas.photo_count, sebelumTandai, 'photo_count tidak naik tanpa berkas baru');
const fotoGaleri = (await repo.detail(galeri.id)).photos.filter((p) => p.source === 'pickup_evidence');
assert.equal(fotoGaleri.length, 1, 'foto tidak terduplikasi');

// max_photos tidak memblokir foto pengambilan (kuotanya sendiri, di routes).
const kuota = await mkFlow('E');
await repo.attachBarcode(kuota.id, '/uploads/flow-e.jpg');
await repo.uploadPhoto(kuota.id, actorId, null, 'order');
await repo.pickupOrder(kuota.id, actorId);
await repo.uploadPhoto(kuota.id, actorId, null, 'kamera');
await repo.uploadPhoto(kuota.id, actorId, null, 'berkas');
await assert.rejects(
  () => repo.uploadPhoto(kuota.id, actorId, null, 'kamera'), /Maksimal/i,
  'foto biasa tetap dibatasi max_photos',
);
const lolos = await repo.uploadPhoto(kuota.id, actorId, null, 'pickup_evidence');
assert.ok(lolos, 'foto pengambilan lolos meski max_photos tercapai');

// Laporan mengenal status baru.
const repFlow = await repo.reports('', undefined, undefined);
assert.equal(typeof repFlow.totals.done_pickup, 'number', 'totals memuat done_pickup');

// Urutan daftar berbasis status_changed_at: geser status menaikkan order,
// unggah foto tidak. Kolomnya sengaja dipisah dari updated_at.
const urutA = await mkFlow('URUT-A');
const urutB = await mkFlow('URUT-B');
const posisiUrut = async (id) => {
  const { items } = await repo.listOrders({ per_page: 200 });
  return items.findIndex((x) => x.id === id);
};
assert.ok(await posisiUrut(urutA.id) > await posisiUrut(urutB.id), 'A mula-mula di bawah B');

const stempelAwal = (await repo.getOrder(urutA.id)).status_changed_at;
await repo.uploadPhoto(urutA.id, actorId, null, 'order');
assert.equal(
  (await repo.getOrder(urutA.id)).status_changed_at, stempelAwal,
  'unggah foto tidak menggeser status_changed_at',
);
assert.ok(await posisiUrut(urutA.id) > await posisiUrut(urutB.id), 'unggah foto tidak menaikkan urutan');

await repo.attachBarcode(urutA.id, '/uploads/urut-a.jpg');
await repo.pickupOrder(urutA.id, actorId);
assert.notEqual(
  (await repo.getOrder(urutA.id)).status_changed_at, stempelAwal,
  'perpindahan status menggeser status_changed_at',
);
assert.ok(await posisiUrut(urutA.id) < await posisiUrut(urutB.id), 'setelah digeser A naik di atas B');
