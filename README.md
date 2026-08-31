# TraderTrack — Frontend

Frontend **Expo (React Native)** satu basis kode sesuai `PRD_TraderTrack.md`:
satu proyek menghasilkan aplikasi web statis dan APK Android.

## Menjalankan stack lengkap (frontend + backend + PostgreSQL)

```bash
# Terminal 1 — API + PostgreSQL nyata (PGlite, persisten di backend/data/pglite)
cd backend
npm install
npm run dev:db        # seed demo otomatis: admin/admin, nabila/trader, fajar/trader

# Terminal 2 — frontend
cd frontend
npm install
npm run web           # expo.extra.apiUrl sudah menunjuk http://localhost:4000
```

Semua data kini nyata: tersimpan di PostgreSQL dan selamat antar restart.
Realtime Socket.IO aktif (`packages:changed`), foto/barcode tersimpan di `backend/uploads/`.

Produksi (VPS): `docker compose up -d --build` di root — Postgres, API, Meilisearch,
Nginx sesuai PRD. Set `.env` dari `.env.example` lebih dulu.

## Tech stack

| Komponen | Pilihan |
|---|---|
| Framework | React Native + Expo SDK 57 (expo-router) |
| Target Web | `npm run build:web` → aset statis untuk Nginx (`/var/www/`) |
| Target Android | `npm run build:apk` → EAS Build, APK profil preview |
| Realtime | `socket.io-client`, event `packages:changed` |
| Kamera & barcode | `expo-camera` (scan resi + foto bukti) |
| Kompresi foto | `expo-image-manipulator` sebelum unggah |
| Penyimpanan token | `@react-native-async-storage/async-storage` (JWT) |
| State & data | Custom hooks (`useAuth`, `useOrders`) + fetch biasa |

## Menjalankan

```bash
cd frontend
npm install
npm run web        # pengembangan di browser
npm run android    # emulator/perangkat Android
```

Set `expo.extra.apiUrl` di `app.json` ke URL API server sebelum build.

## Struktur halaman (expo-router)

| Rute | Peran | Pengguna |
|---|---|---|
| `/login` | Autentikasi username + kata sandi, redirect per role | Semua |
| `/` (Papan Kerja) | Kanban realtime Data Masuk / Proses Pick Up / Selesai | Admin |
| `/orders` | Daftar order lengkap, pencarian & realtime | Admin & Trader |
| `/pickup` | Scan barcode resi, mode pindai berturut-turut | Admin |
| `/analytics` | Ringkasan, order per trader, rekap rekening, order tertunda | Admin |
| `/accounts` | Master rekening (nonaktif, bukan hapus) | Admin |
| `/settings` | Ambang tertunda & aturan foto bukti | Admin |

## Titik sambung backend

- `POST /api/login`, JWT di header `Authorization: Bearer`
- `GET/POST /api/orders`, `PATCH /api/orders/:id/status`
- `POST /api/orders/scan` (cocokkan resi), `PATCH /api/orders/:id/complete`
- `POST /api/orders/:id/photos` (multipart) → folder `uploads/` di VPS
- `GET /api/reports?range=...` (SQL views agregat)
- CRUD `bank-accounts` dan `settings`
- Socket.IO event `packages:changed` → refresh papan Kerja dan Order tanpa pull-to-refresh
