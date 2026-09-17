import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COPY_COLUMNS, COPY_COLUMNS_DEFAULT } from '../lib/copyColumns';

const KEY = 'zproject.copyColumns';

/** Pilihan kolom salin, diingat antar sesi di perangkat ini.
 *  Disimpan lokal (bukan server) karena ini preferensi tampilan, bukan data
 *  operasional: menambah kolom server hanya demi ini terlalu mahal. */
export function useCopyColumns() {
  const [keys, setKeys] = useState<string[]>(COPY_COLUMNS_DEFAULT);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const tersimpan: unknown = JSON.parse(raw);
        if (!Array.isArray(tersimpan)) return;
        // Kunci tak dikenal dibuang: kolom yang dihapus dari kode tidak boleh
        // membuat pilihan lama memecahkan tampilan.
        const sah = tersimpan.filter((k): k is string => COPY_COLUMNS.some((c) => c.key === k));
        // Kosong jatuh ke bawaan — menyalin tanpa kolom sama sekali mustahil.
        setKeys(sah.length ? sah : COPY_COLUMNS_DEFAULT);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const simpan = useCallback((next: string[]) => {
    const aman = next.length ? next : COPY_COLUMNS_DEFAULT;
    setKeys(aman);
    AsyncStorage.setItem(KEY, JSON.stringify(aman)).catch(() => undefined);
  }, []);

  const toggle = useCallback((key: string) => {
    setKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      const aman = next.length ? next : COPY_COLUMNS_DEFAULT;
      AsyncStorage.setItem(KEY, JSON.stringify(aman)).catch(() => undefined);
      return aman;
    });
  }, []);

  const reset = useCallback(() => simpan(COPY_COLUMNS_DEFAULT), [simpan]);

  return { keys, toggle, reset };
}
