// Kolom yang bisa ikut disalin dari Daftar Order. Satu sumber kebenaran:
// label dan pengambil nilainya menyatu, jadi mustahil header dan isinya
// tidak sinkron. Urutan array ini adalah urutan kolom pada hasil salin.
import { dateTime } from './format';
import { pickupMethodLabel, statusLabel } from '../theme';
import type { OrderView } from './api';

export interface CopyColumn {
  key: string;
  label: string;
  value: (o: OrderView) => string;
}

export const COPY_COLUMNS: CopyColumn[] = [
  { key: 'order_number', label: 'Nomor order', value: (o) => o.order_number },
  { key: 'product', label: 'Produk', value: (o) => o.product_name },
  { key: 'store', label: 'Toko', value: (o) => o.store_name },
  { key: 'recipient', label: 'Penerima', value: (o) => o.recipient_name },
  { key: 'trader', label: 'Trader', value: (o) => o.trader_name },
  { key: 'method', label: 'Metode', value: (o) => pickupMethodLabel[o.pickup_method] },
  { key: 'status', label: 'Status', value: (o) => statusLabel[o.status] },
  // Angka mentah, bukan "Rp150.000": lebih berguna saat ditempel ke spreadsheet.
  { key: 'amount', label: 'Nominal', value: (o) => (o.order_amount == null ? '' : String(o.order_amount)) },
  { key: 'photo_count', label: 'Jumlah bukti', value: (o) => String(o.photo_count) },
  { key: 'created_at', label: 'Waktu input', value: (o) => dateTime(o.created_at) },
];

/** Setara tiga kolom sebelum kolom bisa dipilih — produk & toko kini terpisah. */
export const COPY_COLUMNS_DEFAULT = ['order_number', 'product', 'store', 'recipient'];
