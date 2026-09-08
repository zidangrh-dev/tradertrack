import type { Role } from './types';

// Superadmin adalah superset admin: semua kemampuan admin, ditambah setelan
// versi aplikasi. Perbandingan role SELALU lewat helper ini — literal
// `role === 'admin'` mudah terlewat dan diam-diam mencabut akses superadmin.
export const isAdminLevel = (role?: Role | string | null): boolean =>
  role === 'admin' || role === 'superadmin';

export const isSuperadmin = (role?: Role | string | null): boolean => role === 'superadmin';

export const roleLabel = (role?: Role | string | null): string =>
  role === 'superadmin' ? 'Superadmin' : role === 'admin' ? 'Administrator' : 'Trader';
