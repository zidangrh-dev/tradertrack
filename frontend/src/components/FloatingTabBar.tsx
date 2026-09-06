import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

type Route = { key: string; name: string };
type Descriptor = { options: Record<string, any> };

const GLYPH: Record<string, string> = {
  index: '▦',
  orders: '≡',
  pickup: '⌗',
  analytics: '◒',
  'master-data': '▤',
  settings: '⚙',
};

// Kapsul melayang ala Telegram/Instagram: hanya ikon, absolut di atas konten.
// Tab aktif dianimasikan lewat satu "bubble" yang meluncur antar-ikon (spring)
// dan ikon yang aktif muncul memudar + membesar sedikit.
// Layar lebar (≥900) memakai Sidebar — bar tidak dirender.
// Route dengan href:null (menu khusus admin) difilter lewat tabBarItemStyle
// yang di-set expo-router (display:'none') — sama seperti bar bawaan.
export function FloatingTabBar({ state, descriptors, navigation }: {
  state: { routes: Route[]; index: number };
  descriptors: Record<string, Descriptor>;
  navigation: any;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (width >= 900) return null;

  const bottom = Math.max(insets.bottom, 8);
  const visible = state.routes.filter(
    (r) => descriptors[r.key]?.options?.tabBarItemStyle?.display !== 'none',
  );
  const focusedKey = state.routes[state.index]?.key;
  const focusedIdx = Math.max(0, visible.findIndex((r) => r.key === focusedKey));

  const [dockW, setDockW] = useState(0);
  const bubbleX = useRef(new Animated.Value(0)).current;
  const placedRef = useRef(false);

  const n = visible.length;
  const slotW = dockW > 0 && n > 0 ? dockW / n : 0;
  const bubbleW = Math.max(36, Math.min((slotW || 60) - 12, 60));
  const leftFor = (i: number) => (slotW ? i * slotW + (slotW - bubbleW) / 2 : 0);

  useEffect(() => {
    if (!dockW || !n) return;
    const target = leftFor(focusedIdx);
    if (!placedRef.current) {
      bubbleX.setValue(target);
      placedRef.current = true;
      return;
    }
    Animated.spring(bubbleX, {
      toValue: target,
      friction: 9,
      tension: 140,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockW, n, focusedIdx]);

  if (!n) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View style={styles.dock} onLayout={(e) => setDockW(e.nativeEvent.layout.width)}>
        <Animated.View
          style={[
            styles.bubble,
            { width: bubbleW, transform: [{ translateX: bubbleX }] },
          ]}
        />
        {visible.map((route) => {
          const focused = route.key === focusedKey;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          const label = descriptors[route.key]?.options?.title ?? route.name;
          return (
            <DockItem
              key={route.key}
              icon={GLYPH[route.name] ?? '•'}
              label={label}
              focused={focused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

// Satu tombol tab: ikon aktif memudar masuk + membesar (cross-fade dua lapis
// teks agar perubahan warna halus dan tetap memakai native driver).
function DockItem({ icon, label, focused, onPress }: {
  icon: string;
  label: string;
  focused: boolean;
  onPress: () => void;
}) {
  const prog = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(prog, {
      toValue: focused ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [focused, prog]);

  const scale = prog.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
      style={styles.btn}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <View style={styles.glyphWrap}>
          <Text style={[styles.glyph, styles.glyphIdle]}>{icon}</Text>
          <Animated.Text
            style={[styles.glyph, styles.glyphActive, { opacity: prog, position: 'absolute' }]}
          >
            {icon}
          </Animated.Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 18, right: 18 },
  dock: {
    flexDirection: 'row', height: 58,
    backgroundColor: colors.surface, borderRadius: 30,
    borderWidth: 1, borderColor: colors.line,
    shadowColor: '#0F162A', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 14,
  },
  bubble: {
    position: 'absolute', top: 9, height: 40,
    borderRadius: 20, backgroundColor: colors.primarySoft,
  },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glyphWrap: { width: 40, height: 32, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 20, fontWeight: '700' },
  glyphIdle: { color: colors.faint },
  glyphActive: { color: colors.primary },
});
