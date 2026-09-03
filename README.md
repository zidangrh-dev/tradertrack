# ZProject — Aplikasi Operasional Marketplace

Satu basis kode **Expo (React Native)** menghasilkan aplikasi web (statis) dan APK Android, dengan **backend Express + PostgreSQL** terpisah di folder `backend/`.

Aplikasi ini menggantikan konsep awal "TraderTrack". Dokumen sumber product truth tetap `PRD_TraderTrack.md`; ringkasan tertanam ada di `PRODUCT.md`.

---

## 1. Gambaran produk

**ZProject** adalah aplikasi internal (web + Android) untuk sebuah tim yang membeli barang di marketplace, mengambilnya secara fisik, lalu mencatat serta memverifikasi tiap pesanan sampai selesai.

- **Trader** — input pesanan hasil checkout marketplace, lalu *memproses pick up* pesanannya sendiri dengan bukti foto barcode.
- **Admin** — mengelola katalog (produk + toko marketplace), mengalokasikan kuota, memvalidasi & menyelesaikan order, memindai resi, dan melihat analytics.

Dua role, tanpa registrasi mandiri. Seluruh UI berbahasa Indonesia.

### Alur hidup order

```
data_masuk ──proses pick up──▶ proses_pick_up ──selesai──▶ selesai
   (baru dibuat)      (wajib ada bukti)          (admin, wajib ≥1 foto)
```

1. **Trader input order** → memilih **produk** (dari katalog) dan **toko marketplace** dari dua dropdown terpisah, mengisi nomor pesanan & penerima. Kuota produk dicek saat itu.
2. **Trader (atau admin) proses pick up** → order berpindah ke `proses_pick_up`. Syarat: order sudah punya ≥1 bukti (foto barcode yang dilampirkan saat input, atau foto yang diunggah saat proses). Pemilik order juga bisa mengunggah/menghapus foto bukti lewat modal detail, persis seperti admin.
3. **Admin selesaikan order** → wajib `photo_count >= min_photos` (default 1). Trader **tidak** boleh menyelesaikan order.
4. Order bisa ditandai **bermasalah**, dan order `selesai` bisa **dibuka kembali** (reopen) oleh admin.

### Kuota — per tipe barang, lintas toko

- Admin membuat **produk** (tipe barang) dan memberinya **kuota total**.
- Kuota produk **dibagi lintas toko**: order produk yang sama lewat toko mana pun memotong kuota produk yang sama (`used_quota = COUNT(order pada produk itu)`).
- Kuota diubah lewat dua operasi atomik, bukan set ulang total:
  - `POST /api/products/:id/quota` `{amount}` → `quota = quota + amount` (atomic, bebas lost-update multi-admin).
  - `POST /api/products/:id/reset-quota` → `quota` disamakan dengan jumlah terpakai (sisa = 0).
- Produk yang sudah dipakai order tidak bisa dihapus (hanya dinonaktifkan). Nama produk unik (case-insensitive). Toko yang sudah dipakai order tidak bisa dihapus.

### Akses per role

| Aksi | Admin | Trader |
|---|---|---|
| Lihat daftar order | Semua | **Hanya miliknya** (dipaksa di server) |
| Input order | Untuk siapa pun | Untuk dirinya sendiri |
| Proses pick up order | Semua | Miliknya saja |
| Unggah/hapus foto bukti | Semua (non-selesai) | Miliknya saja (non-selesai) |
| Selesaikan order / tandai bermasalah / reopen | ✔ | ✗ |
| Scan resi | ✔ | ✗ |
| Kelola produk, toko, kuota | ✔ | ✗ |
| Reports / analytics | ✔ | ✗ |

> Scoping dilakukan di **server** (route memaksa `trader_id = req.user.id`), sehingga filter `?trader=` dari client tidak bisa dipakai trader untuk membuka data orang lain. Detail order milik orang lain → 403.

### Penanda "Tertunda"

Tidak disimpan — dihitung saat render: status `data_masuk`/`proses_pick_up` yang `updated_at`-nya lebih lama dari `pending_threshold_hours` (default 3 jam, atur di Pengaturan). Order bermasalah menampilkan badge "Bermasalah" (menimpa Tertunda).

---

## 2. Arsitektur

```
project-zubair/
├── frontend/   Expo SDK 57 + expo-router (React Native → web + Android)
├── backend/    Express + Socket.IO + PostgreSQL (pglite utk dev lokal)
├── PRD_TraderTrack.md   sumber product truth (nama historis)
├── PRODUCT.md           konteks produk terverifikasi untuk agen
└── docker-compose.yml   produksi (postgres + api + nginx; meili = sisa lama, belum dipakai aplikasi)
```

**Frontend** — SPA React Native Web. Satu file komponen inti (`src/components/ui.tsx`: Button, Field, Select ERP, DataTable, Sheet, OrderCard). Semua dialog/notifikasi **custom** (bukan `window.alert/confirm/prompt`) lewat `NotifyHost` yang di-portal ke `document.body` dengan z-index tinggi.

**Backend** — pola repo: `server.mjs` → `setupRoutes` (`src/routes.mjs`) → `getRepo()` memilih implementasi:
- `src/pg.mjs` (PostgreSQL — jalur produksi & dev:db), atau
- `src/memdb.mjs` (in-memory, hanya bila `DATABASE_URL` tidak di-set — data hilang saat restart).

Kedua repo menghadirkan interface yang sama.

**Realtime** — Socket.IO event `packages:changed` dikirim pada tiap mutasi order; frontend langsung me-refresh. Data yang tampil tetap di-scope oleh role.

---

## 3. Model data (PostgreSQL — `backend/src/schema.sql`)

| Tabel | Isi |
|---|---|
| `users` | `username`, `password_hash`, `display_name`, `role` (`admin`/`trader`), `is_active` |
| `products` | `name` (unik, case-insensitive), `quota` (int ≥ 0), `is_active` — **kuota menempel di sini** |
| `marketplace_stores` | `name` (unik, case-insensitive), `is_active` |
| `orders` | `order_number` (unik), `product_name`/`store_name` (denormalisasi utk tampilan), `product_id`/`store_id` (FK), `trader_id`, `status`, `order_amount`, `note`, `is_problem`, `barcode_path`, `photo_count`, waktu (`created_at`, `picked_up_at`, `completed_at`, `updated_at`) |
| `order_photos` | bukti foto (`file_path`, `source`: `pickup`/`kamera`/`berkas`, `uploaded_by`) |
| `order_events` | riwayat status (actor + note + timestamp) |
| `app_settings` | `pending_threshold_hours`, `min_photos`, `max_photos`, `max_file_mb` |

`used_quota`/`remaining_quota` produk **bukan kolom** — dihitung dari `COUNT(order)` per `product_id`.

### Kunci ketepatan & race condition

- **Create order**: transaksi + `SELECT ... FROM products WHERE id=$1 FOR UPDATE` → cek `used < quota` → insert. Rebutan antar banyak trader aman.
- **Tambah kuota**: satu `UPDATE ... SET quota = quota + $n` dalam transaksi (bukan read-then-write).
- **Reset kuota**: `FOR UPDATE` dulu, lalu `quota = COUNT(used)`.
- Nama produk/toko dilindungi unique index **case-insensitive** + error `23505` dipetakan ke pesan bisnis.

---

## 4. API (semua `/api`, kecuali catatan)

Autentikasi: `POST /login` → JWT → header `Authorization: Bearer <token>`. Foto lewat `multipart/form-data` dengan field `photo`; validasi magic-bytes + batas MB dari settings.

| Metode & path | Akses | Fungsi |
|---|---|---|
| `POST /login`, `POST /logout`, `GET /session` | publik/auth | sesi & token (di dev: `POST /dev/session` ganti user) |
| `GET/POST /orders` | auth | daftar (filter `q,status,pickup_method,trader,from,to`) & buat order (`product_id`, `store_id`, `order_number`, `recipient_name`, `pickup_method`, `order_amount?`) |
| `POST /orders/scan` | admin | cocokkan nomor resi (foto barcode opsional) → `proses_pick_up` |
| `POST /orders/:id/pickup` | pemilik/admin | proses pick up; butuh bukti bila belum ada |
| `GET /orders/:id/detail` | pemilik/admin | order + foto + riwayat events |
| `POST /orders/:id/photos` · `DELETE /orders/:id/photos/:photoId` | pemilik/admin | kelola bukti (terkunci saat `selesai`) |
| `PATCH /orders/:id/status` | admin | `data_masuk` ↔ `selesai` (bukan `proses_pick_up`) |
| `POST /orders/:id/barcode` | pemilik/admin | lampirkan foto barcode pengambilan |
| `PATCH /orders/:id/complete` · `:id/problem` · `:id/reopen` | admin | selesaikan / tandai masalah / buka kembali |
| `DELETE /orders/:id` · `PATCH /orders/:id` | pemilik | hapus/edit order sendiri saat `data_masuk` |
| `GET /reports?range=` | admin | totals, per-trader, rekap per produk, tertunda/bermasalah |
| `GET/POST /products`, `PATCH/DELETE /products/:id`, `POST /products/:id/quota`, `POST /products/:id/reset-quota` | baca: auth; tulis: admin | katalog produk & kuota |
| `GET/POST/DELETE /marketplace-stores` | baca: auth; tulis: admin | katalog toko |
| `GET/PATCH /settings` | baca: auth; tulis: admin | pengaturan operasional |
| `GET/POST /users`, `PATCH /users/:id` | admin | akun (tanpa hapus — nonaktifkan) |
| `GET /uploads/:name` | JWT | akses file foto |

`GET /orders` **selalu** men-scope trader ke dirinya sendiri (lihat §1).

---

## 5. Halaman frontend

| Rute | Peran | Dipakai |
|---|---|---|
| `/login` | Masuk, redirect per role (trader → `/orders`) | semua |
| `/` — Papan Kerja (Kanban) | Data masuk → proses → selesai | admin |
| `/orders` — Daftar order | tabel + pencarian/filter/periode, copy hasil, proses pick up, detail | admin & trader |
| `/pickup` | kelola order berstatus `proses_pick_up` + scan nomor pesanan | admin |
| `/master-data` | **Produk** (tabel + kuota) dan **Toko marketplace** | admin |
| `/analytics` | metrik, per trader, rekap per produk, export CSV | admin |
| `/settings` | ambang tertunda, aturan foto, kelola akun | admin |

Modal input order (`NewOrderModal`) dipakai admin maupun trader; trader (non-admin) mengisi produk+toko dari katalog dan memilih trader tidak tersedia (otomatis dirinya).

---

## 6. Menjalankan (pengembangan)

```bash
# Terminal 1 — backend + PostgreSQL persisten (WAJIB jalur ini, bukan npm run dev)
cd backend
npm install
npm run dev:db        # PGlite persisten di backend/data/pglite; seed otomatis bila DB kosong
                      # akun demo: admin/admin, nabila/trader, fajar/trader

# Terminal 2 — frontend
cd frontend
npm install
npm run web           # expo.extra.apiUrl → http://localhost:4000
```

Peringatan penting:

- **`npm run dev` (node --watch server.mjs) tanpa `DATABASE_URL` = repo MEMORI.** Semua data hilang tiap restart. Untuk data persisten selalu `npm run dev:db`.
- Hentikan server dengan Ctrl+C (SIGTERM), jangan `kill -9` — PGlite bisa kehilangan checkpoint dan DB dianggap kosong saat dibuka lagi.
- `frontend/dist/` adalah artefak `npm run build:web`; kalau UI tampak "kuno", regenerate export itu (jangan edit dist manual).
- PGlite dev single-writer: `PG_POOL_MAX=1` sudah diset oleh `dev:db`.

### Test

```bash
cd backend
npm test        # 87 uji API (node --test) + smoke test jalur PostgreSQL (PGlite)
```

Frontend: `cd frontend && npx tsc --noEmit`. Tidak ada framework test frontend; verifikasi visual lewat `npm run web`.

Gotcha untuk yang mengubah test: file `test/api.test.mjs` **harus memakai satu hook root `before` saja** — dua hook root `before` membuat fetch di hook kedua gagal (keanehan node:test runner).

---

## 7. Peta file penting

**Frontend (`frontend/`)**
- `app/_layout.tsx` · `app/(app)/_layout.tsx` — root auth gate + navigasi tab/role.
- `app/login.tsx`, `app/(app)/orders.tsx`, `index.tsx`, `pickup.tsx`, `master-data.tsx`, `analytics.tsx`, `settings.tsx`.
- `src/lib/api.ts` — klien REST + fallback mock (`store.ts`) hanya saat server tidak terjangkau (network error).
- `src/lib/store.ts` — mock dev yang MENYAMAI perilaku backend (model produk+toko+kuota).
- `src/components/ui.tsx` — sistem komponen (Button/Field/Select/DataTable/Sheet/OrderCard).
- `src/components/NotifyHost.tsx` — toast & dialog konfirmasi custom global (portal web).
- `src/hooks/useAuth.tsx`, `useOrders.ts`, `useRoleGuard.ts`, `useFileUrl.ts`.
- `src/theme.ts` — token warna/radius/spasi (palet navy/slate enterprise).
- `src/lib/notify.ts` — API `notify`, `confirmAsk`, `promptAsk` → overlay web / Alert OS native.

**Backend (`backend/`)**
- `server.mjs` — bootstrap Express + Socket.IO + migrasi otomatis saat `dev:db`.
- `src/routes.mjs` — seluruh endpoint + validasi + pemetaan error bisnis.
- `src/pg.mjs` — repo PostgreSQL (produksi & dev:db) — otorisasi & lock di sini/route.
- `src/memdb.mjs` — repo memori (dev tanpa DB).
- `src/schema.sql` — skema (migrasi idempoten via `CREATE TABLE IF NOT EXISTS`).
- `src/seed.mjs` — seed demo idempoten (dilewati bila users sudah ada).
- `src/repo.mjs` — pemilih repo berdasarkan `DATABASE_URL`.
- `test/api.test.mjs` (87 uji end-to-end API), `test/pg.smoke.mjs` (jalur SQL asli PGlite).

**Dokumen** — `PRODUCT.md` (konteks terverifikasi), `PRD_TraderTrack.md` (spesifikasi sumber, nama historis).

---

## 8. Catatan singkat untuk pengembangan berikutnya

- Jika menambah kolom ke tabel, `CREATE TABLE IF NOT EXISTS` **tidak** menambah kolom pada DB lama — tambahkan `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, atau reset DB dev.
- Pertahankan aturan kuota lintas toko & atomic add/reset; jangan balik ke kuota per kombinasi produk+toko.
- UI pesan & tombol berbahasa Indonesia; nomor order ditampilkan **tanpa** prefiks `#`.
- Perubahan yang menyentuh UI web: jalankan detector desain bila tersedia, lalu `npm run build:web` bila `dist/` diserve.
