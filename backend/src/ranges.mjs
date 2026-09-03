// Helper bersama: rentang laporan → batas waktu awal (ISO).
export function rangeToFrom(range) {
  let from = '';
  const d = new Date();
  if (range === 'hari_ini') from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  if (range === '7_hari') from = new Date(Date.now() - 7 * 864e5).toISOString();
  if (range === 'bulan_ini') from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  return from;
}
