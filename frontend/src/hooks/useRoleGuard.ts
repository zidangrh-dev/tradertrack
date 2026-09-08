import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from './useAuth';
import { isAdminLevel, isSuperadmin } from '../lib/roles';

// Layar khusus admin: trader yang membuka URL langsung dialihkan ke Daftar Order.
export function useAdminOnly() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdminLevel(user?.role)) {
      router.replace('/(app)/orders');
    }
  }, [user, loading, router]);
}

// Layar/panel khusus superadmin: selain superadmin dialihkan ke Daftar Order.
export function useSuperadminOnly() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isSuperadmin(user?.role)) {
      router.replace('/(app)/orders');
    }
  }, [user, loading, router]);
}
