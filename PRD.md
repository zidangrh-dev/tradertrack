# PRD: ZProject

**Product Requirements Document.** Versi: 2.0. Disusun: 2026-10-06 (WIB).
Pengganti `PRD_TraderTrack.md` sebagai rujukan produk berjalan. Nama historis
"TraderTrack" dipertahankan hanya di dokumen lama dan nama repo.

| Item | Nilai |
|---|---|
| Produk | ZProject |
| Platform | Web (statis) + Android (APK), satu basis kode Expo |
| Repo | `zidangrh-dev/tradertrack` |
| Domain produksi | `pasukanzaydan.net` |
| Pengguna | Tim internal, dua kelompok: trader & admin |
| Status | Produksi, dipakai harian |

Dokumen terkait:

- `README.md`: kondisi teknis terkini (arsitektur, API, model data, rilis). **Menang bila berselisih dengan PRD ini.**
- `PRODUCT.md`: konteks produk terverifikasi untuk agen.
- `DESIGN.md`: arah visual dan dial desain.
- `anti-slop/`: hasil audit desain.
- `PRD_TraderTrack.md`: spesifikasi sumber awal (nama historis).

---

## 1. Ringkasan

ZProject adalah aplikasi operasional internal untuk sebuah tim yang membeli barang di
marketplace, mengambilnya secara fisik, lalu mencatat dan memverifikasi tiap pesanan
sampai selesai.

Masalah yang diselesaikan. Pencatatan hasil checkout tersebar di catatan pribadi dan grup
chat. Akibatnya admin tidak tahu pasti barang mana yang sudah datang, siapa trader yang
melakukan checkout, ke rekening mana pembayaran direkap, dan order mana yang tertunda
terlalu lama. Tidak ada bukti visual bahwa barang benar-benar diterima, dan tidak ada satu
sumber data tunggal yang bisa dipercaya untuk rekap harian.

Tujuan. Menyatukan seluruh siklus order ke dalam satu papan kerja: trader menginput
checkout, pick up diproses dengan bukti foto barcode, admin memvalidasi dan menyelesaikan
order, lalu seluruh data mengalir menjadi laporan per trader, per produk, dan rekap
tertunda.

Skala sasaran. Di bawah 20 pengguna aktif, 50 sampai 200 order per hari. Sistem sengaja
ramping dan dijalankan mandiri di satu VPS.

---

## 2. Pengguna dan Peran

Tiga role, tanpa registrasi mandiri. Akun dibuat admin.

| Role | Ringkas |
|---|---|
| **Trader** | Input order hasil checkout, memproses pick up order miliknya sendiri dengan bukti foto |
| **Admin** | Kelola katalog (produk + toko), alokasi kuota, validasi dan penyelesaian order, scan resi, analytics |
| **Superadmin** | Superset admin, ditambah kewenangan setelan versi aplikasi dan pengelolaan akun superadmin |

Batasan peran yang mengikat:

- **Trader hanya melihat order miliknya.** Scope dipaksa di server (`trader_id = req.user.id`), jadi filter `?trader=` dari klien tidak bisa membuka data orang lain. Detail order milik orang lain menghasilkan 403.
- **Superadmin terakhir tidak bisa dihapus, dinonaktifkan, atau diturunkan rolenya.** Tanpa pengaman ini, setelan versi aplikasi bisa terkunci permanen.
- Pengguna tidak bisa mengubah role dirinya sendiri.

---

## 3. Ruang Lingkup

**Termasuk.** Autentikasi dan manajemen akun, input order, katalog produk dan toko,
kuota lintas toko, alur pick up dengan bukti foto bertingkat, Kanban dan daftar order,
scan resi, penandaan tertunda dan bermasalah, reopen order, analytics, pengaturan
operasional, dan gerbang versi aplikasi.

**Tidak termasuk.** Integrasi API marketplace apa pun (semua order diinput manual),
modul stok, pengiriman ke pelanggan akhir, pembayaran di dalam aplikasi, registrasi
mandiri, iklan, dan langganan. Rekap keuangan bersifat pencatatan dan pelaporan saja.

---

## 4. Alur Hidup Order

```
data_masuk ──proses pick up──▶ proses_pick_up ──tandai diambil──▶ done_pickup ──verifikasi──▶ selesai
  (baru dibuat)   (wajib bukti)     (admin, wajib 1-3 foto)      (admin, wajib bukti transfer)
```

1. **Trader input order.** Memilih produk dari katalog dan toko marketplace dari dua dropdown terpisah, mengisi nomor pesanan dan penerima. Kuota produk dicek pada saat itu.
2. **Proses pick up.** Order berpindah ke `proses_pick_up`. Syarat bukti bergantung pada toko dan metode pengambilan (matriks di bawah). Pemilik order maupun admin bisa mengunggah dan menghapus foto bukti lewat modal detail.
3. **Tandai sudah diambil.** Wajib ada 1 sampai 3 foto pengambilan (`source: pickup_evidence`). Foto pengambilan hanya boleh diinput admin; trader hanya melihat. Foto terkunci begitu order masuk `done_pickup`.
4. **Selesaikan order.** Wajib melampirkan bukti transfer (`source: transfer_proof`, tepat 1). Trader tidak boleh menyelesaikan order, tetapi bisa melihat bukti transfernya sebagai tanda pembayaran sudah dikirim. Bukti terkunci begitu order `selesai`.
5. **Penyimpangan.** Order bisa ditandai bermasalah dengan alasan wajib, tandanya bisa dicabut, dan order `selesai` bisa dibuka kembali oleh admin.

### 4.1 Matriks bukti pick up

| Toko | Metode | Barcode | Foto bukti order |
|---|---|---|---|
| `has_barcode: true` | Self Pick Up | **wajib** | **wajib** |
| `has_barcode: true` | Zaydan Ambilan GJM | tidak wajib | **wajib** |
| `has_barcode: false` | keduanya | tidak wajib | minimal 1 foto apa saja |

Aturan ini dievaluasi **saat pick up**, bukan dibekukan saat order dibuat. Mengubah metode
lewat Edit Order karena itu langsung berlaku dan tidak menyisakan celah. Zaydan Ambilan GJM
mengambil barang tanpa melewati loket penerbit barcode, jadi barcodenya memang tidak pernah ada.

### 4.2 Transisi status hanya lewat endpoint berbukti

`PATCH /orders/:id/status` **hanya** melayani transisi ke `data_masuk`. Tiga status lain
punya endpoint sendiri karena mewajibkan bukti: `pickup`, `done-pickup`, `complete`. Jalur
`PATCH` langsung ke `done_pickup` atau `selesai` **ditolak**. Ini yang menjaga bukti tidak
bisa dilewati, termasuk bila permintaan dikirim langsung ke API.

### 4.3 Kelonggaran sempit: barcode susulan (tambalan order warisan)

Order yang dibuat sebelum aturan bukti ganda (`requires_dual_evidence = false`) bisa masuk
`proses_pick_up` dengan hanya foto, tanpa barcode, dan dulu terkunci selamanya. Barcodenya
kini boleh dilampirkan saat `proses_pick_up` **hanya bila `barcode_path` masih kosong**.
Begitu terisi, syaratnya gugur dan endpoint terkunci lagi. `done_pickup` dan `selesai` tidak
kebagian. `DELETE /orders/:id/barcode` tetap hanya melayani `data_masuk`, sehingga celah ini
tidak bisa dibuka ulang.

---

## 5. Kebutuhan Fungsional

### F-1 Autentikasi dan akun

- Login lewat `POST /login`, sesi dipertahankan lewat JWT yang diverifikasi di setiap permintaan.
- Setiap akun memiliki tepat satu role yang menentukan menu dan hak akses.
- Admin membuat akun, mengubah nama lengkap, mengganti role, mereset kata sandi, dan menonaktifkan akun tanpa menghapus riwayat ordernya.
- Akun nonaktif ditolak saat login dan tidak muncul di dropdown pemilihan trader.

### F-2 Input order

- Formulir memuat produk (dari katalog), toko marketplace (dari katalog), nomor pesanan, nama penerima, metode pengambilan, nominal (opsional), dan catatan.
- Metode pengambilan punya dua pilihan tetap: Zaydan Ambilan GJM dan Self Pick Up.
- Trader terisi otomatis dari akun yang login; admin boleh menginput atas nama orang lain.
- Nomor pesanan unik. Duplikat ditolak dan sistem menampilkan order yang sudah ada.
- Kuota produk dicek di dalam transaksi dengan penguncian baris, sehingga rebutan antar banyak trader aman.
- Order baru selalu tersimpan sebagai `data_masuk` dan mencatat waktu input serta pembuatnya.

### F-3 Daftar order

- Tabel padat berisi seluruh order sesuai scope role (admin melihat semua, trader hanya miliknya).
- Pencarian dan filter: status, metode pengambilan, trader, rentang tanggal, dan status salin.
- Penomoran halaman sisi server, 50 baris per halaman.
- Nomor order ditampilkan tanpa prefiks `#`.
- Trader hanya boleh mengedit atau menghapus order miliknya selama masih `data_masuk`.

### F-4 Papan kerja (Kanban)

- Kolom mengikuti status pipeline dan diurutkan `status_changed_at DESC`.
- Kartu naik ke atas saat status berubah, tetapi tidak bergerak saat foto ditambah. Alasannya di §6.2.
- Perubahan status tampil realtime lewat Socket.IO tanpa refresh manual.

### F-5 Pick up, scan, dan bukti foto

- Halaman pick up mengelola order `proses_pick_up` dan menyediakan scan nomor pesanan atau barcode resi.
- Hasil scan dicocokkan ke nomor resi atau nomor pesanan. Cocok berarti status berpindah ke `proses_pick_up`; tidak cocok menampilkan peringatan dan menawarkan pencarian manual.
- Order yang sudah pernah dipindai memberi tahu waktu dan nama admin yang memindai.
- Validasi berkas foto: magic-bytes dan batas ukuran MB dari pengaturan. `max_photos` membatasi bukti umum, sedangkan `pickup_evidence` (maks 3) dan `transfer_proof` (maks 1) punya kuota sendiri dan lepas dari `max_photos`.
- Foto hanya bisa diakses lewat URL yang diverifikasi JWT.

### F-6 Penanda tertunda

Tidak disimpan, dihitung saat render: status aktif yang `status_changed_at`-nya lebih lama
dari `pending_threshold_hours` (bawaan 3 jam, diatur di Pengaturan). Acuannya **bukan**
`updated_at`, jadi mengunggah foto tidak me-reset jam tertunda. Order bermasalah menampilkan
badge Bermasalah yang menimpa Tertunda.

### F-7 Penanda sudah disalin

Daftar order dikirim ke pengguna beberapa kali sehari. Tanpa penanda, salinan siang akan
mengulang isi salinan pagi.

| Tombol | Menyalin |
|---|---|
| Copy belum disalin (N) | hanya baris dengan `copied_at IS NULL` |
| Copy halaman ini | seluruh baris yang tampil |

Hanya baris yang benar-benar masuk papan klip yang ditandai. `copied_at` tidak menyentuh
`updated_at` maupun `status_changed_at`, karena menyalin bukan perubahan data order. Kolom
yang disalin bisa dipilih, bawaannya empat kolom pertama, dan hasil salin tanpa baris header
supaya langsung bisa ditempel ke chat.

### F-8 Katalog produk, toko, dan kuota

- Admin membuat produk (tipe barang) dengan kuota total, dan mengelola daftar toko marketplace.
- Kuota produk dibagi **lintas toko**: order produk yang sama lewat toko mana pun memotong kuota produk yang sama (`used_quota = COUNT(order pada produk itu)`).
- Kuota diubah lewat dua operasi atomik, bukan set ulang total: tambah kuota (`quota = quota + amount`, bebas lost-update multi-admin) dan reset kuota (`quota` disamakan dengan jumlah terpakai, sisa 0).
- Produk yang sudah dipakai order tidak bisa dihapus, hanya dinonaktifkan. Nama produk unik tanpa membedakan huruf besar-kecil. Aturan sama untuk toko yang sudah dipakai order.

### F-9 Analytics dan pengaturan

- Analytics memuat metrik total, rekap per trader, rekap per produk, daftar tertunda dan bermasalah, dengan filter rentang tanggal dan ekspor CSV.
- Pengaturan operasional: ambang jam tertunda, batas jumlah foto, batas ukuran berkas, dan kelola akun.
- Setelan versi aplikasi hanya bisa dilihat dan diubah superadmin.

### F-10 Gerbang versi aplikasi

Aplikasi Android bisa dikunci pada versi tertentu. APK dengan versi berbeda tidak bisa
dipakai dan hanya menampilkan popup pembaruan berisi tombol unduh. **Versi web tidak pernah
dikunci**, dan itulah jalur pemulihan bila terjadi salah setel.

Urutan rilis yang tidak boleh dibalik: naikkan versi dan push, deploy VPS, build APK, taruh
APK di tempat yang bisa diunduh, baru isi link unduhan dan versi wajib sebagai superadmin.
Isi versi wajib setelah APK barunya benar-benar bisa diunduh, karena bila dibalik pengguna
terkunci dengan tombol unduh yang belum ada isinya.

Klien mengirim header `X-App-Version` dan `X-App-Platform`. Server menolak dengan 409
`APP_VERSION_MISMATCH` bila platform native dan versinya tidak sama persis dengan
`required_app_version`. Endpoint `login`, `logout`, `session`, `app-version`, dan `settings`
tidak pernah diblokir supaya admin selalu bisa memperbaiki.

---

## 6. Kebutuhan Non-Fungsional

### 6.1 Keamanan

- Otorisasi ditegakkan di lapisan server pada setiap endpoint, bukan hanya disembunyikan di antarmuka.
- Kata sandi disimpan sebagai hash bcrypt.
- Seluruh lalu lintas memakai HTTPS lewat Nginx dan Certbot.
- Port database tidak dibuka ke internet, hanya lewat jaringan internal Docker.
- Foto hanya bisa diakses lewat URL yang diverifikasi JWT.
- Kredensial berada di `.env` dengan mode 600, di luar kendali versi, dan tidak pernah ditampilkan.

### 6.2 Ketepatan data

Dua stempel waktu sengaja dipisah:

- **`updated_at`** naik pada setiap perubahan baris (unggah atau hapus foto, edit order, tandai bermasalah).
- **`status_changed_at`** naik hanya saat status berpindah.

Keduanya dipakai untuk urutan kanban dan jam tertunda. Konsekuensinya order yang mandek
tidak terlihat segar hanya karena admin mengunggah foto. Database lama di-backfill
`COALESCE(completed_at, picked_up_at, created_at)`.

Operasi rawan rebutan dijaga: pembuatan order memakai transaksi dan penguncian baris produk,
penambahan kuota memakai satu `UPDATE ... SET quota = quota + n` (bukan baca lalu tulis),
reset kuota memakai penguncian baris lebih dulu, dan nama produk atau toko dilindungi unique
index tanpa membedakan huruf besar-kecil dengan pemetaan error `23505` ke pesan bisnis.

### 6.3 Skala dan infrastruktur

Di bawah 20 pengguna aktif dan 50 sampai 200 order per hari. Seluruh backend berjalan
mandiri lewat Docker Compose di satu VPS: reverse proxy Nginx, server API Express,
PostgreSQL, dan penyimpanan berkas lokal untuk foto. Postgres dan penyimpanan berkas lokal
memadai untuk skala ini sampai beberapa tahun.

### 6.4 Cadangan

Backup basis data harian otomatis berupa dump terjadwal beserta salinan berkas foto. Retensi
aktual **7 hari** (`RETENTION_DAYS=7` di `/root/scripts/backup_zproject.sh`), jadwal 02:30 WIB.
Bila butuh jendela pemulihan lebih panjang, naikkan nilai itu dan pastikan ruang disk memadai.

### 6.5 Aksesibilitas

Kontras tinggi, struktur semantik, fokus keyboard, dan layout responsif untuk web desktop,
tablet, dan ponsel. Ambang kontras WCAG AA: 4.5:1 untuk teks normal, 3:1 untuk teks besar.

### 6.6 Bahasa dan gaya antarmuka

Seluruh label berbahasa Indonesia. Tampilan padat informasi dan kontras tinggi, tabel dan
angka sebagai elemen utama.

---

## 7. Standar Desain dan Kualitas (rujukan skill antislop)

Bagian ini mengikat setiap perubahan antarmuka. Sumber aturannya eksternal, bukan selera
per halaman.

### 7.1 Rujukan wajib

| Sumber | Isi | Kapan dibaca |
|---|---|---|
| skill `antislop` (inti) | Filter anti-slop: 38 aturan (R-01 sampai R-38), kriteria craftsmanship C-1 sampai C-5, toolkit liveliness, Delivery Gate | Selalu, sebelum menyentuh UI |
| `antislop-ui` | Warna, layout, komponen, dekorasi, gerak | Saat membangun atau mengubah tampilan |
| `antislop-human` | Kontras, keyboard, fokus, keadaan | Saat menyentuh aksesibilitas |
| `antislop-layoutmobile` | Breakpoint, skala, grid, luapan, target sentuh | Saat menyentuh layout responsif |
| `antislop-copywriting` | Judul, CTA, nilai jual, nada | Saat menulis atau mengubah teks |
| `antislop-code` | Higiene komentar kode | Saat menulis atau mengubah komentar |

Filter ini menolak teknik tanpa tujuan, bukan melarang teknik. Setiap keputusan rupa harus
lolos uji tujuan dan alasannya ditulis satu baris (R-31). Kalau alasan satu keputusan tidak
bisa ditulis dalam satu baris, keputusan itu belum sah.

### 7.2 Arah desain yang sudah terkunci

`DESIGN.md` merekam bahasa rupa yang berjalan di `frontend/src/theme.ts` dan
`frontend/src/components/ui.tsx`. Bila kode dan dokumen berselisih, **kode yang menang** dan
`DESIGN.md` yang diperbarui.

**Dial resmi: `ENERGY 2 / RHYTHM 2 / MOTION 1`.**

| Dial | Nilai | Alasan |
|---|---|---|
| ENERGY | 2 | Alat kerja internal, tetapi satu angka boleh besar bila ia memang induk dari angka lain (mis. total order di Analytics). Bobot itu tidak boleh diberikan dua kali dalam satu layar |
| RHYTHM | 2 | Bagian boleh berbeda komposisi bila isinya memang berbeda bobot. Panel yang menuntut tindakan menaikkan nada, panel rekap tidak |
| MOTION | 1 | Gerak hanya untuk menjelaskan perpindahan keadaan. Angka yang berhitung naik dan batang yang tumbuh saat dimuat sudah dicabut |

Watak yang dijaga: padat bukan lapang, status terbaca sekilas, tenang saat normal dan tegas
saat perlu, tanpa dekorasi. Merah dan kuning hanya untuk bermasalah dan tertunda.

**Terlarang di produk ini:** aksen warna kedua, gradien, bayangan pada permukaan yang tidak
mengambang, ruang kosong tanpa alasan, ilustrasi dekoratif, dan animasi yang tidak
menjelaskan apa pun.

Konsekuensi teknis Expo yang mengikat: styling lewat `StyleSheet.create` (tidak ada media
query, tidak ada `:hover`), lebar layar ditangani `useWindowDimensions`, bayangan memakai
pasangan `shadow*` dan `elevation` sekaligus, font memakai bawaan sistem tanpa webfont, dan
keadaan tekan diurus `Pressable` lewat `({ pressed })`.

### 7.3 Aturan yang paling sering relevan di sini

| Aturan | Tuntutan konkret untuk ZProject |
|---|---|
| R-02 | Tidak ada karakter em dash di teks apa pun |
| R-03 | Layout ponsel sempurna, tanpa luapan horizontal; target sentuh minimal 44px |
| R-17, R-36, R-38 | Tidak ada angka, testimoni, atau klaim tanpa sumber nyata. Lebih baik kosong daripada menipu |
| R-23 | Aset (logo, avatar, angka) tidak dibuat tanpa instruksi atau placeholder jujur |
| R-24, R-26 | Tidak ada tautan navigasi ke halaman yang tidak ada, tidak ada kontrol mati |
| R-25 | Semua teks lolos WCAG AA |
| R-27 | Setiap tampilan data punya keadaan kosong, memuat, dan galat |
| R-32 | Semua kontrol terjangkau keyboard dengan indikator fokus yang terlihat |
| R-34 | Bila ada mode gelap, kedua mode harus benar-benar berfungsi |
| R-35 | Jalankan dan klik semua kontrol sebelum menyatakan selesai, lalu laporkan buktinya |
| R-37 | Arah desain wajib ada sebelum membangun UI, dan dial wajib dinyatakan |

### 7.4 Riwayat kepatuhan

- **Audit antislop 001** (2026-09-18, Mode 2) atas halaman Analytics, merembet ke `FloatingTabBar.tsx`, `ui.tsx`, dan `theme.ts`. Temuan mencakup crash hook saat melewati breakpoint 900px, sepuluh kontrol mati per layar, empat pasangan warna gagal WCAG AA, indikator fokus yang dicabut tanpa pengganti, panel per trader tanpa keadaan kosong, dan em dash di teks UI.
- Temuan itu sudah ditutup lewat rangkaian commit perbaikan: `fix(nav)`, `fix(analytics)`, `fix(a11y)`, `refactor(ui)`, dan kenaikan dial ke ENERGY 2 / RHYTHM 2.
- Audit berikutnya menaikkan nomor berkas: `anti-slop/audit-002-<tanggal>.md` dan seterusnya.

### 7.5 Cara kerja antislop di repo ini

Dua mode, dipilih pemilik produk sebelum UI dikerjakan:

1. **Mode 1, selama pengerjaan.** Aturan dipatuhi sambil menulis, slop dicegah sejak awal, ditutup Delivery Gate.
2. **Mode 2, setelah selesai.** Audit proyek yang sudah jadi. Temuan ditulis bernomor di `anti-slop/audit-00N-<tanggal>.md`, masing-masing menyebut aturan yang dilanggar dan alasan satu baris. Prioritas mengikuti tier aturan: Hard Gate sama dengan HIGH, Purpose-Gate sama dengan MEDIUM, Quality Locks sama dengan LOW. Tidak ada yang diubah sebelum nomor tertentu disetujui.

Belum ada blok penunjuk antislop di berkas pintu masuk repo. Menambahkan blok itu adalah
langkah pemasangan tersendiri dan belum dijalankan.

---

## 8. Kriteria Penerimaan

Sebuah perubahan ZProject dinyatakan selesai hanya bila seluruh butir berikut terpenuhi.

**Fungsional**

1. Alur status hanya bisa dilewati lewat endpoint yang mewajibkan bukti. Jalur `PATCH /orders/:id/status` ke `done_pickup` dan `selesai` terbukti ditolak.
2. Trader tidak bisa melihat, mengubah, atau menghapus order milik orang lain, dan pembatasan itu ditegakkan di server, bukan di klien.
3. Kuota menurun saat order dibuat dan tidak bisa melewati batas, termasuk pada percobaan bersamaan dari banyak trader.
4. Foto pengambilan dan bukti transfer hanya bisa diunggah dan dihapus admin, dan terkunci setelah status terkait lewat.
5. Gerbang versi mengunci APK lama tanpa pernah mengunci web, dan hanya superadmin bisa mengubahnya.

**Teknis**

6. `cd backend && npm test` lulus: **173 uji** (semua lolos) ditambah smoke test jalur PostgreSQL. Angka ini dari eksekusi nyata, bukan dari dokumen lama yang menyebut 87.
7. `cd frontend && npx tsc --noEmit` bersih.
8. `curl http://127.0.0.1:4002/api/health` dan `https://pasukanzaydan.net/api/health` sama-sama 200.
9. Migrasi bersifat idempoten, dan kolom baru ditambahkan lewat `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, bukan mengandalkan `CREATE TABLE IF NOT EXISTS`.
10. Backup basis data dijalankan sebelum setiap operasi yang mengubah data produksi.

**Desain (mengikuti skill antislop)**

11. Delivery Gate dijalankan dan dilaporkan sebagai daftar PASS/FAIL dengan bukti per butir. Laporan yang memuat satu FAIL tidak dikirim.
12. Semua jawaban di Blok 1 Hard Gate bernilai tidak, dan semua jawaban di Blok 3 Liveliness bernilai ya.
13. Dial `ENERGY 2 / RHYTHM 2 / MOTION 1` dinyatakan dan hasilnya konsisten dengannya.
14. Setiap kontrol interaktif diklik satu per satu dan hasilnya dilaporkan, atau dinyatakan tidak bisa dijalankan beserta alasannya.

---

## 9. Risiko dan Catatan

| Risiko | Penanganan |
|---|---|
| Sales salah mengisi data di sumber, mengakibatkan order masuk modul yang salah | Koreksi lewat jalur database dengan skrip mode dry lalu apply, mengikuti runbook koreksi modul |
| APK lama tertinggal versi saat fitur frontend berubah | Gerbang versi, dan urutan rilis yang tidak boleh dibalik |
| Salah setel versi wajib mengunci semua pengguna | Versi web tidak pernah dikunci, dan ada rem darurat `APP_VERSION_GATE=off` di `.env` |
| PGlite dev kehilangan checkpoint bila proses dibunuh paksa | Hentikan dengan SIGTERM, jangan `kill -9`; pakai `npm run dev:db` untuk data persisten |
| `npm run dev` tanpa `DATABASE_URL` memakai repo memori, data hilang saat restart | Selalu pakai `npm run dev:db` bila data perlu bertahan |
| Kolom baru tidak muncul di database lama | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |

---

## 10. Ringkasan Perubahan dari PRD Sebelumnya

`PRD_TraderTrack.md` menggambarkan konsep awal dengan dua role dan tiga status. Produk yang
berjalan sudah berevolusi:

- Role menjadi tiga: superadmin, admin, trader.
- Status menjadi empat: `data_masuk`, `proses_pick_up`, `done_pickup`, `selesai`, ditambah penanda bermasalah dan reopen.
- Bukti foto menjadi bertingkat: bukti order, bukti pengambilan, dan bukti transfer, masing-masing dengan aturan unggah dan penguncian sendiri.
- Masuk katalog produk dan toko marketplace, beserta kuota yang dibagi lintas toko.
- Masuk penanda tertunda, penanda sudah disalin, dan gerbang versi aplikasi.
- Masuk standar desain antislop dengan dial yang dinyatakan, yang tidak ada di dokumen awal.
