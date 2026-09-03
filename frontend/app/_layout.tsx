import { useEffect } from 'react';
import { Stack, Redirect, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { colors } from '../src/theme';
import { NotifyHost } from '../src/components/NotifyHost';

function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const inAuth = segments[0] === 'login';

  useEffect(() => {
    if (loading) return;
    if (user && inAuth) {
      // Sudah login tapi masih di /login -> arahkan sesuai role.
      router.replace(user.role === 'admin' ? '/(app)' : '/(app)/orders');
    }
  }, [user, loading, inAuth, router]);

  if (loading) return null;

  // Belum login dan bukan di /login: JANGAN render Stack (agar layar (app)
  // tidak pernah ter-mount dengan user null) — langsung redirect ke login.
  if (!user && !inAuth) {
    return <Redirect href="/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Gate />
      <NotifyHost />
    </AuthProvider>
  );
}
