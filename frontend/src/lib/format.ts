import { colors, statusLabel, type Status } from '../theme';

export function durationLabel(updatedAt: string) {
  const ms = Date.now() - new Date(updatedAt).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} mnt`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d} hari`;
}

export function dateTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}

export function dateShort(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { dateStyle: 'short' });
}

export function isToday(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

export function statusPalette(status: Status) {
  switch (status) {
    case 'selesai': return { color: '#1F7A4D', bg: '#E3F5EC' };
    case 'proses_pick_up': return { color: '#2E6EB5', bg: '#E7F1FD' };
    default: return { color: '#A8610F', bg: '#FCF1DE' };
  }
}

export function statusText(status: Status) {
  return statusLabel[status];
}

export const statusColor: Record<Status, string> = {
  data_masuk: colors.amber,
  proses_pick_up: colors.blue,
  selesai: colors.green,
};

export function money(n: number) {
  return `Rp ${n.toLocaleString('id-ID')}`;
}
