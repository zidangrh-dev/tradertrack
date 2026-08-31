import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from './useAuth';

// Layar khusus admin: trader yang membuka URL langsung dialihkan ke Daftar Order.
export function useAdminOnly() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user?.role !== 'admin') {
      router.replace('/(app)/orders');
    }
  }, [user, loading, router]);
}
