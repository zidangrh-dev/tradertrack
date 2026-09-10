// Pembatas percobaan login.
//
// Tanpa ini, penebak kata sandi bisa mencoba tanpa henti: 30 percobaan
// beruntun sempat diuji dan semuanya dilayani. Penghitungnya disimpan di
// memori proses — cukup untuk satu instans API seperti sekarang, dan tidak
// menambah dependensi baru ke produksi.

const JENDELA_MS = 15 * 60 * 1000;   // rentang pengamatan
const BATAS_IP = 10;                 // gagal per IP sebelum diblokir
const BATAS_AKUN = 5;                // gagal per username sebelum diblokir
const BLOKIR_MS = 15 * 60 * 1000;    // lama pendinginan

const percobaan = new Map();

function ambil(kunci) {
  const rec = percobaan.get(kunci);
  if (!rec) return null;
  if (rec.blokirSampai && rec.blokirSampai <= Date.now()) {
    percobaan.delete(kunci);
    return null;
  }
  if (!rec.blokirSampai && rec.pertama + JENDELA_MS <= Date.now()) {
    percobaan.delete(kunci);
    return null;
  }
  return rec;
}

/** Sisa detik pendinginan bila kunci sedang diblokir, selain itu 0. */
function sisaBlokir(kunci) {
  const rec = ambil(kunci);
  if (!rec?.blokirSampai) return 0;
  return Math.ceil((rec.blokirSampai - Date.now()) / 1000);
}

/**
 * Dipanggil sebelum kata sandi diperiksa. Mengembalikan sisa detik blokir
 * (0 = boleh lanjut). IP dan username dihitung terpisah supaya serangan dari
 * banyak IP ke satu akun tetap tertahan.
 */
export function cekLogin(ip, username) {
  const kunciAkun = 'akun:' + String(username ?? '').toLowerCase();
  return Math.max(sisaBlokir('ip:' + ip), sisaBlokir(kunciAkun));
}

/** Dicatat saat kata sandi salah. */
export function catatGagal(ip, username) {
  for (const [kunci, batas] of [['ip:' + ip, BATAS_IP], ['akun:' + String(username ?? '').toLowerCase(), BATAS_AKUN]]) {
    const rec = ambil(kunci) ?? { gagal: 0, pertama: Date.now(), blokirSampai: 0 };
    rec.gagal += 1;
    if (rec.gagal >= batas) rec.blokirSampai = Date.now() + BLOKIR_MS;
    percobaan.set(kunci, rec);
  }
}

/** Login berhasil — hitungan dinolkan supaya user sah tidak terhukum. */
export function resetGagal(ip, username) {
  percobaan.delete('ip:' + ip);
  percobaan.delete('akun:' + String(username ?? '').toLowerCase());
}

// Buang catatan kedaluwarsa berkala agar Map tidak tumbuh terus.
const sapu = setInterval(() => {
  for (const kunci of [...percobaan.keys()]) ambil(kunci);
}, 10 * 60 * 1000);
sapu.unref?.();
