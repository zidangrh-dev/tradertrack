import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { APP_VERSION, AppVersionError, fetchVersionGate } from '../lib/api';

type GateState = { blocked: boolean; requiredVersion: string; updateUrl: string };

const EMPTY: GateState = { blocked: false, requiredVersion: '', updateUrl: '' };

const VersionGateContext = createContext<{
  state: GateState;
  /** Dipanggil saat permintaan API ditolak karena versi (409). */
  report: (e: AppVersionError) => void;
  /** Periksa ulang ke server — dipakai tombol "coba lagi". */
  recheck: () => Promise<void>;
}>({ state: EMPTY, report: () => undefined, recheck: async () => undefined });

/**
 * Gerbang versi aplikasi. Hanya berlaku di aplikasi native; web dibiarkan
 * lewat agar admin selalu punya jalan memperbaiki versi wajib yang salah.
 */
export function VersionGateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>(EMPTY);
  const gated = Platform.OS !== 'web';

  const evaluate = useCallback(async () => {
    if (!gated) return;
    try {
      const { required_version, update_url } = await fetchVersionGate();
      const required = String(required_version ?? '').trim();
      // Versi wajib kosong = gerbang mati.
      const blocked = !!required && required !== APP_VERSION;
      setState(blocked ? { blocked: true, requiredVersion: required, updateUrl: update_url ?? '' } : EMPTY);
    } catch {
      // Server tak terjangkau bukan alasan mengunci aplikasi.
      setState(EMPTY);
    }
  }, [gated]);

  useEffect(() => { evaluate(); }, [evaluate]);

  const report = useCallback((e: AppVersionError) => {
    if (!gated) return;
    setState({ blocked: true, requiredVersion: e.requiredVersion, updateUrl: e.updateUrl });
  }, [gated]);

  const value = useMemo(() => ({ state, report, recheck: evaluate }), [state, report, evaluate]);
  return <VersionGateContext.Provider value={value}>{children}</VersionGateContext.Provider>;
}

export const useVersionGate = () => useContext(VersionGateContext);
