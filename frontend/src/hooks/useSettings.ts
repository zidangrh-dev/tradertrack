import { useEffect, useState } from 'react';
import { api, type AppSettings } from '../lib/api';

const DEFAULTS: AppSettings = { pending_threshold_hours: 3, min_photos: 1, max_photos: 3, max_file_mb: 20 };

/** Pengaturan operasional (ambang tertunda, aturan foto) — dibaca sekali per sesi halaman. */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  useEffect(() => {
    let alive = true;
    api.getSettings().then((s) => alive && setSettings(s)).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return settings;
}
