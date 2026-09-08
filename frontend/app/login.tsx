import { useRef, useState } from 'react';
import {
  Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useAuth } from '../src/hooks/useAuth';
import { Field, PasswordField } from '../src/components/ui';
import { colors, radius } from '../src/theme';

export default function Login() {
  const { signIn } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const { width } = useWindowDimensions();
  const isNarrow = width < 480;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
    } catch {
      setError('Username atau kata sandi salah, atau akun sedang nonaktif.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, isNarrow && styles.cardNarrow]}>
          <View style={styles.brandRow}>
            <Image source={require('../assets/zproject-logo.jpg')} style={styles.brandMark} resizeMode="contain" />
            <Text style={styles.brand}>Z<Text style={styles.brandLight}>PROJECT</Text></Text>
          </View>

          <Text style={styles.kicker}>SELAMAT DATANG KEMBALI</Text>
          <Text style={styles.title}>Masuk ke workspace</Text>

          <View style={styles.formBlock}>
            <Field
              label="Username"
              value={username}
              onChangeText={setUsername}
              placeholder="username Anda"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <PasswordField label="Kata sandi" value={password} onChangeText={setPassword} placeholder="••••••••" returnKeyType="go" onSubmitEditing={submit} />
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={submit}
            disabled={busy}
            style={({ pressed }) => [styles.submit, busy && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.submitText}>{busy ? 'Memproses…' : 'Masuk'}</Text>
          </Pressable>

          <Text style={styles.foot}>© {new Date().getFullYear()} ZProject. Hak cipta dilindungi.</Text>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%', maxWidth: 400, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 32, borderWidth: 1, borderColor: colors.line,
    shadowColor: '#0F162A', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 12 }, shadowRadius: 28, elevation: 6,
  },
  // Di layar sempit kartu lebih ramping agar tidak menempel ke tepi layar.
  cardNarrow: { padding: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  brandMark: { width: 34, height: 34, borderRadius: radius.sm, overflow: 'hidden' },
  brand: { color: colors.text, fontWeight: '800', fontSize: 16, letterSpacing: -0.5 },
  brandLight: { color: colors.faint, fontWeight: '600' },
  kicker: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 6, letterSpacing: -0.5 },
  // Pemisah blok: judul -> form -> tombol -> footer, ritme 20px.
  formBlock: { marginTop: 20 },
  error: { color: '#C1433A', fontSize: 12, marginTop: 12, marginBottom: 4, backgroundColor: '#FCE9E6', borderRadius: radius.sm, padding: 10 },
  submit: {
    backgroundColor: colors.primary, borderRadius: radius.md, height: 44, alignItems: 'center',
    justifyContent: 'center', marginTop: 20,
  },
  submitText: { color: colors.onPrimary, fontWeight: '800', fontSize: 14 },
  foot: { textAlign: 'center', color: colors.faint, fontSize: 10, marginTop: 20 },
});
