// Resolve path upload server (mis. `/uploads/demo.jpg`) → URI tampil + token JWT.
import { useEffect, useState } from 'react';
import { uploadsUrl } from '../lib/api';

export function useFileUrl(filePath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!filePath) { setUrl(null); return; }
    let cancelled = false;
    uploadsUrl(filePath).then((u) => { if (!cancelled) setUrl(u); }).catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [filePath]);
  return url;
}