import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions, View } from 'react-native';
import { Sidebar } from '../../src/components/Sidebar';
import { MobileProfileBar } from '../../src/components/MobileProfileBar';
import { FloatingTabBar } from '../../src/components/FloatingTabBar';
import { useAuth } from '../../src/hooks/useAuth';
import { colors } from '../../src/theme';

export default function AppLayout() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  // Web desktop/tablet lebar memakai sidebar; layar sempit memakai kapsul bawah.
  const wide = useWindowDimensions().width >= 900;
  // Android edge-to-edge: konten digambar sampai ke belakang status bar, jadi
  // beri jarak atas setinggi inset agar header halaman tidak tertutup bar HP.
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', paddingTop: insets.top }}>
      {wide && <Sidebar />}
      {/* Latar kanvas: area di belakang kapsul tidak boleh putih polos agar
          navbar benar-benar tampak melayang tanpa batas. */}
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        {!wide && <MobileProfileBar />}
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: wide ? { display: 'none' } : { position: 'absolute' },
            // Tanpa padding bawah: konten menerus sampai belakang kapsul.
            sceneStyle: { backgroundColor: colors.canvas },
          }}
          tabBar={(props: any) => <FloatingTabBar {...props} />}
        >
          <Tabs.Screen
            name="index"
            options={{ title: 'Papan Kerja', href: isAdmin ? undefined : null }}
          />
          <Tabs.Screen name="orders" options={{ title: 'Daftar Order' }} />
          <Tabs.Screen
            name="pickup"
            options={{ title: 'Pick Up', href: isAdmin ? undefined : null }}
          />
          <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
          <Tabs.Screen
            name="master-data"
            options={{ title: 'Master Data', href: isAdmin ? undefined : null }}
          />
          <Tabs.Screen
            name="settings"
            options={{ title: 'Pengaturan', href: isAdmin ? undefined : null }}
          />
        </Tabs>
      </View>
    </View>
  );
}
