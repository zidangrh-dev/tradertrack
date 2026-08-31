import { useCallback, useEffect, useState } from 'react';
import { api, subscribeChanges, type OrderView } from '../lib/api';

export function useOrders(query: Record<string, string> = {}) {
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await api.listOrders(query);
      setOrders(data.items);
      setTotal(data.total);
    } catch (e) {
      setError((e as Error).message || 'Gagal memuat order.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(query)]);

  useEffect(() => {
    refresh();
    // Simulasi realtime: setiap mutasi data lokal memicu refresh.
    const off = subscribeChanges(refresh);
    return () => {
      off();
    };
  }, [refresh]);

  return { orders, total, loading, error, refresh };
}
