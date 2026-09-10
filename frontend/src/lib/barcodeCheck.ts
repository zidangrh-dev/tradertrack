import { scanFromURLAsync } from 'expo-camera';

/**
 * Memastikan sebuah foto benar-benar memuat barcode.
 *
 * Trader kerap mengunggah foto bukti order ke slot barcode, sehingga admin
 * harus memilah satu per satu mana order yang barcodenya sudah benar. Ambang
 * penolakan ada di sini supaya kekeliruan ketahuan sebelum foto terkirim.
 *
 * Berjalan di APK (detektor native) maupun web: expo-camera otomatis memakai
 * BarcodeDetector bawaan browser, dan jatuh ke paket `barcode-detector`
 * berbasis WASM bila browser belum mendukungnya.
 */
export type HasilPeriksaBarcode =
  | { ok: true; tipe: string; nilai: string }
  | { ok: false; alasan: string };

// Jenis yang lazim dipakai label pick up marketplace. Membatasi daftar membuat
// pemindaian lebih cepat sekaligus menutup format eksotis yang tidak relevan.
const JENIS_BARCODE = ['qr', 'ean13', 'ean8', 'code128', 'code39', 'code93', 'upc_a', 'upc_e', 'itf14', 'codabar'] as const;

export async function periksaFotoBarcode(uri: string): Promise<HasilPeriksaBarcode> {
  try {
    const hasil = await scanFromURLAsync(uri, [...JENIS_BARCODE]);
    const pertama = hasil?.[0];
    if (!pertama) {
      return {
        ok: false,
        alasan: 'Barcode tidak terbaca pada foto ini. Pastikan yang difoto adalah barcode pick up, bukan bukti order, dan gambarnya tajam serta tidak terpotong.',
      };
    }
    return { ok: true, tipe: pertama.type, nilai: pertama.data };
  } catch {
    // Pemindai gagal dimuat/dijalankan. Menolak di sini akan memblokir trader
    // karena sebab yang bukan salahnya, jadi kegagalan teknis dibedakan dari
    // "foto bukan barcode" dan penilaiannya diserahkan ke pemanggil.
    return {
      ok: false,
      alasan: 'GAGAL_PERIKSA',
    };
  }
}
