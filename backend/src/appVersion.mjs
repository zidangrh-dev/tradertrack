// Aturan gerbang versi aplikasi — dipakai bersama oleh repo (validasi simpan)
// dan routes (penegakan). Satu sumber kebenaran agar tidak ada dua tafsir.

/** Versi sah: kosong (gerbang mati) atau semantik x.y.z / x.y. */
export function normalizeRequiredVersion(value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (!/^\d+\.\d+(\.\d+)?$/.test(v)) {
    throw new Error('Versi wajib harus berformat angka, contoh: 1.2.0. Kosongkan untuk mematikan gerbang versi.');
  }
  return v;
}

/** URL sah: kosong atau http(s). Skema lain ditolak agar tidak jadi jalur berbahaya. */
export function normalizeUpdateUrl(value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (!/^https?:\/\/\S+$/i.test(v)) {
    throw new Error('Link unduhan harus diawali http:// atau https://. Kosongkan bila belum ada.');
  }
  return v;
}

/** Hanya aplikasi native yang dijaga; web selalu lolos (jalur pemulihan admin). */
export function isGatedPlatform(platform) {
  const p = String(platform ?? '').toLowerCase();
  return p === 'android' || p === 'ios';
}

/** Gerbang mati bila versi wajib kosong atau rem darurat APP_VERSION_GATE=off. */
export function gateEnabled(requiredVersion) {
  if (String(process.env.APP_VERSION_GATE ?? '').toLowerCase() === 'off') return false;
  return !!String(requiredVersion ?? '').trim();
}

/** Cocok bila sama persis (setelah dirapikan spasi). */
export function versionMatches(clientVersion, requiredVersion) {
  return String(clientVersion ?? '').trim() === String(requiredVersion ?? '').trim();
}
