# Design

Arah visual ZProject. Dokumen ini **merekam** bahasa rupa yang sudah berjalan di
`frontend/src/theme.ts` dan `frontend/src/components/ui.tsx` — bukan usulan
penggantian. Kalau kode dan dokumen ini berselisih, kode yang menang dan dokumen
ini yang harus diperbarui.

## Konteks teknis

Expo React Native: satu basis kode untuk web (React Native Web) dan APK Android.
Konsekuensinya mengikat setiap keputusan rupa:

- Styling lewat `StyleSheet.create`, bukan CSS. Tidak ada media query, tidak ada
  pseudo-selector, tidak ada `:hover`. Layar lebar ditangani `useWindowDimensions`.
- Tidak ada shadow CSS lintas platform — pakai pasangan `shadow*` (iOS/web) dan
  `elevation` (Android) sekaligus, seperti pada `ui.tsx`.
- Font memakai bawaan sistem. Tidak ada webfont; jangan mengusulkannya.
- Keadaan tekan diurus `Pressable` lewat `({ pressed })`, bukan transisi CSS.

## Watak

Alat kerja internal, dipakai berulang kali sepanjang hari oleh tim kecil yang
sudah hafal jalannya. Bukan halaman jualan, bukan etalase.

- **Padat, bukan lapang.** Satu layar memuat banyak order. Ruang kosong yang
  berlebihan memaksa gulir dan memperlambat kerja.
- **Status terbaca sekilas.** Warna dan badge dipakai untuk menyampaikan
  keadaan, bukan untuk menghias.
- **Tenang saat normal, tegas saat perlu.** Merah dan kuning hanya untuk
  bermasalah dan tertunda; selebihnya biru dan abu.
- **Tanpa dekorasi.** Tidak ada gradien, ilustrasi, ikon dekoratif, atau animasi
  yang tidak menjelaskan apa pun.

## Dial

`ENERGY 2 / RHYTHM 2 / MOTION 1`

Padat bukan berarti rata. Halaman yang setiap elemennya berbobot sama menuntut
mata bekerja lebih keras, bukan lebih ringan: kalau semuanya penting, tidak ada
yang penting.

- **ENERGY 2.** Satu angka boleh besar bila ia memang induk dari angka lain.
  Analytics memakai 44px untuk total order karena total adalah jumlah dari empat
  status di bawahnya. Bobot itu tidak boleh diberikan dua kali dalam satu layar.
- **RHYTHM 2.** Bagian boleh berbeda komposisi bila isinya memang berbeda bobot.
  Panel yang menuntut tindakan menaikkan nada; panel rekap tidak. Perbedaan
  datang dari keadaan data, bukan dari selera per halaman.
- **MOTION 1.** Tidak berubah. Gerak hanya untuk menjelaskan perpindahan
  keadaan. Angka yang berhitung naik dan batang yang tumbuh saat dimuat adalah
  gerak tanpa penjelasan, dan keduanya sudah dicabut.

Yang tetap terlarang: aksen warna kedua, gradien, bayangan pada permukaan yang
tidak mengambang, dan ruang kosong tanpa alasan. Naik ke ENERGY 2 dikerjakan
lewat hierarki dan penahanan diri, bukan lewat tambahan hiasan.

## Warna

Sumber: `theme.ts`. Palet terang, kontras tinggi, satu warna merek.

| Peran | Nilai | Dipakai untuk |
|---|---|---|
| `primary` | `#1F4B7A` | tombol utama, tautan, penanda terpilih |
| `primarySoft` | `#EAF1F8` | latar tombol `soft`, sorotan tipis |
| `primaryMuted` | `#52749A` | ikon dan teks pendukung di atas latar terang |
| `canvas` | `#F4F6F8` | latar halaman |
| `surface` | `#FFFFFF` | kartu, modal, baris tabel |
| `surfaceAlt` | `#E9EDF2` | latar sekunder, placeholder gambar |
| `line` | `#D8DEE6` | semua garis batas |
| `text` | `#17202B` | teks utama |
| `muted` | `#596675` | label, teks pendukung |
| `faint` | `#8995A3` | hint, placeholder, meta |

Status memakai warna yang sengaja diredam agar tidak berteriak di antara ratusan
baris: `amber #7A6540`, `blue #1F4B7A`, `green #3E6654`, `red #A34848`,
`teal #0F766E` (done pickup).

Badge Bermasalah dan Tertunda SELALU memakai `problemPalette` dan
`pendingPalette`, tidak pernah heksadesimal lokal. Analytics pernah memakai
`#C1433A` sementara halaman lain memakai `#B23E35`, sehingga badge yang sama
tampil berbeda tergantung halaman.

Badge Bermasalah dan Tertunda punya pasangan sendiri (`problemPalette`,
`pendingPalette`) — latar sangat terang dengan teks pekat, supaya terbaca tanpa
mengalahkan isi baris.

Aturan: satu aksen saja. Warna baru harus masuk `theme.ts` lebih dulu; jangan
menulis nilai heksadesimal langsung di komponen.

## Tipografi

Skala padat, karena kepadatan informasi lebih penting daripada keluasan.

| Ukuran | Pemakaian |
|---|---|
| 9-10px | caption uppercase, hint, meta |
| 11px | label field, badge |
| 12-13px | isi utama, teks tombol, nilai tabel |
| 14-15px | judul bagian, keadaan kosong |
| 19-22px | angka status, angka pengecualian |
| 24px | judul halaman |
| 44px | angka induk, satu per layar |

Tiga tingkat teratas adalah perkakas hierarki, bukan gaya. 44px hanya sah untuk
angka yang merangkum angka lain di layar yang sama, dan tidak boleh muncul dua
kali. Tanpa aturan itu, skala besar berubah jadi dekorasi.

Bobot bekerja lebih keras daripada ukuran: 600 untuk isi, 700 untuk label dan
tombol, 800 untuk caption uppercase dan badge. Caption memakai `letterSpacing`
0.55-0.8 dengan `textTransform: 'uppercase'`.

Hierarki dibangun dari bobot dan warna, bukan dari ukuran yang melompat jauh.

## Ruang dan bentuk

Spacing dari `space`: 4 / 8 / 12 / 16 / 24 / 32. Radius dari `radius`: 8 kecil,
12 sedang (tombol, input, kartu), 16 besar (kontainer), `full` untuk pil.

Tinggi kendali dipatok: tombol 32 / 40 / 46, input dan trigger select 42. Baris
form sejajar karena tingginya sama, bukan karena disetel satu per satu.

Ritme vertikal form berasal dari `marginBottom` milik `Field` dan `Select`
(13px), bukan dari `gap` induknya. Menambahkan `gap` besar di pembungkus akan
menggandakan jarak — ini pernah terjadi dan sudah diperbaiki.

Batas garis 1px `colors.line` dipakai di hampir semua permukaan. Bayangan hanya
untuk lapisan yang benar-benar mengambang: dropdown dan modal
(`shadowOpacity` 0.14-0.16, `elevation` 10-12). Kotak pencarian memakai bayangan
yang nyaris tak terlihat (0.03) yang menguat saat fokus. Warnanya dari
`shadowColor` di `theme.ts`. Panel dan kartu tidak mengambang, jadi tidak
berbayang: panel Analytics pernah memakainya dan membuat seluruh halaman
seperti melayang tanpa ada lapisan yang benar-benar di atas.

Warna bayangan selalu lewat token `shadowColor`. Nilai `#0F162A` pernah
tertulis langsung di sembilan berkas dan itu bukan pilihan, melainkan salinan
yang menumpuk.

## Komponen

- **Button** — empat rupa: `primary` (isi biru), `secondary` (putih bergaris),
  `soft` (biru muda), `ghost` (tanpa latar). Saat ditekan: opasitas 0.85 dan
  skala 0.985. Saat nonaktif: opasitas 0.45.
- **Field / Select** — label di luar kotak, hint kecil di bawah label, kendali
  setinggi 42. Select mode `field` sengaja dibuat sejajar dengan Field.
- **StatusTag** — pil kecil, bobot 800, warna dari status.
- **Sheet** — modal dengan backdrop `rgba(15,22,42,.45)` bersama.
- **Table** — header uppercase 10px, baris putih, pemisah 1px.
- **EmptyState** — kotak bergaris dengan padding vertikal lega (56), satu-satunya
  tempat ruang kosong dipakai dengan sengaja.
- **Panel** — judul, pil jumlah baris, subjudul opsional. `alert` menambah garis
  tepi kiri tebal dan menaikkan nada judul, dipakai HANYA saat daftarnya berisi.

## Ikon

Ionicons (`@expo/vector-icons`), sudah menjadi dependensi sejak awal. Glyph
Unicode seperti `◒` dan `⌗` sempat dipakai sebagai ikon dan itu keliru: bentuknya
bergantung pada font sistem, jadi rupanya berubah antar perangkat dan antara web
dengan APK.

Ikon harus menerangkan isinya, bukan menghias. Keadaan aktif memakai varian
pejal, keadaan diam memakai `-outline`. `Button` dan `EmptyState` menerima nama
Ionicons maupun satu karakter glyph; yang mengandung tanda hubung dibaca sebagai
nama ikon.

Tidak ada lagi glyph Unicode yang berperan sebagai ikon di seluruh aplikasi.
`…` dan `·` tetap dipakai karena keduanya tanda baca, bukan ikon.

Ikon navigasi tinggal di `src/lib/navIcons.ts`, satu peta untuk `Sidebar` (layar
lebar) dan `FloatingTabBar` (HP). Sebelumnya keduanya menyimpan daftar sendiri
dan sudah menyimpang satu sama lain.

## Bahasa

Seluruh antarmuka berbahasa Indonesia. Istilah operasional tetap apa adanya
karena itu yang dipakai tim sehari-hari: "pick up", "done pickup", "barcode",
"trader".

Pesan kesalahan menyebut apa yang harus dilakukan, bukan hanya apa yang salah.
Contoh yang sudah dipakai: *"Barcode pick up belum dilampirkan. Pesanan tanpa
barcode tidak akan diproses."*

Label tombol menyesuaikan keadaan bila artinya berubah — misalnya
"Tandai sudah diambil" versus "Lampirkan foto & tandai diambil".

## Terjangkau tanpa tetikus

Sasaran sentuh minimal 44px di layar sempit. Ini mengikat elemen yang terlihat
kecil sekalipun: pil legend Analytics dulu setinggi 24px dan praktis tidak bisa
disentuh.

Setiap kendali yang memakai `webNoOutline` wajib punya penanda fokus pengganti,
karena properti itu mencabut outline bawaan browser. `Field` memakai garis tepi
warna merek dengan latar `primarySoft`; `SearchBox` memakai `searchBoxFocused`.
Tanpa penanda pengganti, formulir hanya bisa dipakai dengan tetikus.

Kontras minimal 4.5:1 untuk teks kecil. Yang sering lolos dari perhatian adalah
teks `faint` di atas `surfaceAlt` (hanya 4.03:1) dan teks kecil di atas latar
badge yang sudah berwarna.

`Pressable` tanpa `onPress` dilarang. Di web ia memasang `cursor: pointer` dan
`tabindex="0"`, sehingga baris yang hanya dekoratif ikut menjadi perhentian Tab
yang tidak melakukan apa-apa. Umpan balik baris juga tidak boleh bergantung pada
`onHoverIn`, karena hover tidak pernah aktif di APK.

## Jangkauan layar

Web dipakai di desktop dan tablet, APK di ponsel. Titik patah ditentukan di
komponen lewat `useWindowDimensions`, bukan lewat nilai global:

- Kanban beralih dari empat kolom lentur ke kolom lebar tetap (320px) dengan
  gulir mendatar saat ruang kurang.
- Baris dua kolom pada form menumpuk jadi satu kolom di layar sempit.
- Sasaran sentuh mengikuti tinggi kendali yang sudah dipatok.

Komponen yang membaca `useWindowDimensions` untuk memutuskan dirinya tidak
dirender harus menaruh `return null` di BAWAH seluruh hook. `FloatingTabBar`
pernah memulangkan `null` sebelum `useState`, dan melewati titik patah 900px
membuat jumlah hook berubah sehingga React membuang seluruh pohon.

## Yang tidak dilakukan

- Menulis warna langsung di komponen — semua lewat `theme.ts`.
- Menambah pustaka ikon atau ilustrasi.
- Animasi yang tidak menjelaskan perubahan keadaan.
- Menambah aksen warna kedua.
- Angka atau klaim yang tidak berasal dari data nyata. `PRODUCT.md` menegaskan:
  belum ada testimonial, logo pelanggan, atau benchmark — jangan mengarangnya.
