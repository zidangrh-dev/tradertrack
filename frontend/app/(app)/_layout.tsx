import { Tabs } from 'expo-router';
import { Text, useWindowDimensions, View, type ColorValue } from 'react-native';
import { Sidebar } from '../../src/components/Sidebar';
import { useAuth } from '../../src/hooks/useAuth';
import { colors } from '../../src/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => (
  <Text style={{ fontSize: 18, color }}>{glyph}</Text>
);

export default function AppLayout() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  // Web desktop/tablet lebar memakai sidebar; layar sempit memakai tab bawah.
  const wide = useWindowDimensions().width >= 900;

  return (
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
      {wide && <Sidebar />}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.faint,
            tabBarStyle: [
              { backgroundColor: colors.surface, borderTopColor: colors.line },
              wide ? { display: 'none' } : undefined,
            ],
            sceneStyle: { backgroundColor: colors.canvas },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{ title: 'Papan Kerja', tabBarIcon: icon('▦'), href: isAdmin ? undefined : null }}
          />
          <Tabs.Screen name="orders" options={{ title: 'Daftar Order', tabBarIcon: icon('≡') }} />
          <Tabs.Screen
            name="pickup"
            options={{ title: 'Pick Up', tabBarIcon: icon('⌗'), href: isAdmin ? undefined : null }}
          />
          <Tabs.Screen
            name="analytics"
            options={{ title: 'Analytics', tabBarIcon: icon('◒'), href: isAdmin ? undefined : null }}
          />
          <Tabs.Screen
            name="master-data"
            options={{ title: 'Master Data', tabBarIcon: icon('▤'), href: isAdmin ? undefined : null }}
          />
          <Tabs.Screen
            name="settings"
            options={{ title: 'Pengaturan', tabBarIcon: icon('⚙'), href: isAdmin ? undefined : null }}
          />
        </Tabs>
      </View>
    </View>
  );
}
