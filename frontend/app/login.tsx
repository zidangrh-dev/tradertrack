import { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useAuth } from '../src/hooks/useAuth';
import { colors, radius } from '../src/theme';

export default function Login() {
  const { signIn } = useAuth();
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
        <View style={styles.card}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>T</Text></View>
            <Text style={styles.brand}>TRADER<Text style={styles.brandLight}>TRACK</Text></Text>
          </View>

          <Text style={styles.kicker}>SELAMAT DATANG KEMBALI</Text>
          <Text style={styles.title}>Masuk ke workspace</Text>
          <Text style={styles.note}>
            Gunakan akun yang diberikan admin tim Anda. Tidak ada pendaftaran mandiri.{'\n'}
            Prototype: admin / admin (Administrator) · nabila / trader (Trader).
          </Text>

          <Text style={styles.label}>Username</Text>
          <TextInput style={styles.input} autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} placeholder="username Anda" placeholderTextColor={colors.faint} />

          <Text style={styles.label}>Kata sandi</Text>
          <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={colors.faint} />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={submit}
            disabled={busy}
            style={({ pressed }) => [styles.submit, busy && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.submitText}>{busy ? 'Memproses…' : 'Masuk'}</Text>
          </Pressable>

          <Text style={styles.foot}>Sesi dilindungi token JWT. Seluruh lalu lintas terenkripsi HTTPS.</Text>
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
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  brandMark: { width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.onBrand, fontWeight: '800', fontStyle: 'italic', fontSize: 19 },
  brand: { color: colors.text, fontWeight: '800', fontSize: 16, letterSpacing: -0.5 },
  brandLight: { color: colors.faint, fontWeight: '600' },
  kicker: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 8, letterSpacing: -0.5 },
  note: { fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 19, marginBottom: 20 },
  label: { fontSize: 11, fontWeight: '700', color: colors.muted, marginTop: 14 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, height: 44,
    paddingHorizontal: 12, marginTop: 6, fontSize: 14, backgroundColor: colors.surface, color: colors.text,
  },
  error: { color: '#C1433A', fontSize: 12, marginTop: 12, backgroundColor: '#FCE9E6', borderRadius: radius.sm, padding: 10 },
  submit: {
    backgroundColor: colors.primary, borderRadius: radius.md, height: 46, alignItems: 'center',
    justifyContent: 'center', marginTop: 20,
  },
  submitText: { color: colors.onPrimary, fontWeight: '800', fontSize: 14 },
  foot: { textAlign: 'center', color: colors.faint, fontSize: 10, marginTop: 18 },
});
