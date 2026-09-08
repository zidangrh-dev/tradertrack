import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { api, APP_VERSION, type AppSettings, type Role, type UserRow } from '../../src/lib/api';
import { notify, confirmAsk } from '../../src/lib/notify';
import { useAdminOnly } from '../../src/hooks/useRoleGuard';
import { useAuth } from '../../src/hooks/useAuth';
import { colors, radius, space } from '../../src/theme';
import { ActionMenu, Avatar, Button, Field, PageHeader, SelectField, Sheet, type ActionMenuItem } from '../../src/components/ui';
import { isAdminLevel, isSuperadmin, roleLabel } from '../../src/lib/roles';

export default function Settings() {
  useAdminOnly();
  const { user, refreshUser } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [showUsers, setShowUsers] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const superadmin = isSuperadmin(user?.role);
  const [requiredVersion, setRequiredVersion] = useState('');
  const [updateUrl, setUpdateUrl] = useState('');

  const load = useCallback(() => {
    api.getSettings().then(setSettings).catch(() => setSettings(null));
    api.listUsers().then(setUsers).catch(() => setUsers([]));
  }, []);
  useEffect(load, [load]);

  // Sinkronkan input dari data server (juga setelah simpan berhasil).
  useEffect(() => {
    setRequiredVersion(settings?.required_app_version ?? '');
    setUpdateUrl(settings?.app_update_url ?? '');
  }, [settings?.required_app_version, settings?.app_update_url]);

  const save = async (patch: Partial<AppSettings>) => {
    if (!settings) return;
    try {
      const next = await api.saveSettings(patch);
      setSettings(next);
      setSaved('Pengaturan disimpan.');
      setTimeout(() => setSaved(null), 2500);
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };

  if (!settings) return null;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ paddingBottom: 120 }}>
      <PageHeader title="Pengaturan" subtitle="Atur batas operasional dan aturan bukti penyelesaian order." />

      <Panel title="Ambang waktu tertunda" note="Order akan diberi penanda Tertunda setelah melewati durasi ini di satu status. Dipakai oleh papan Kanban dan laporan order tertunda.">
        <NumField label="Durasi maksimum (jam)" value={String(settings.pending_threshold_hours)} onChange={(v) => save({ pending_threshold_hours: Number(v) || 0 })} />
      </Panel>

      <Panel title="Bukti foto penyelesaian" note="Order tidak boleh berpindah ke Selesai sebelum jumlah minimal foto terunggah. Tombol Selesaikan Order nonaktif sampai syarat terpenuhi.">
        <NumField label="Jumlah minimal foto per order" value={String(settings.min_photos)} onChange={(v) => save({ min_photos: Math.max(1, Number(v) || 1) })} />
        <NumField label="Jumlah maksimal foto per order" value={String(settings.max_photos)} onChange={(v) => save({ max_photos: Number(v) || 0 })} />
        <NumField label="Ukuran maksimal per berkas (MB)" value={String(settings.max_file_mb)} onChange={(v) => save({ max_file_mb: Number(v) || 0 })} />
        <Text style={styles.rule}>Aturan: jumlah minimal foto tidak boleh disetel nol.</Text>
      </Panel>

      {superadmin && (
      <Panel
        title="Versi aplikasi"
        note="Kunci aplikasi HP pada versi tertentu. Isi versi wajib HANYA setelah APK baru siap diunduh — begitu disimpan, semua pengguna HP dengan versi lain langsung terkunci sampai memperbarui. Kosongkan untuk mematikan penguncian. Versi web tidak pernah terkunci."
      >
        <Text style={styles.versionNow}>Versi aplikasi ini: {APP_VERSION || '—'}</Text>
        <TextField
          label="Versi wajib (mis. 0.2.0 — kosongkan untuk mematikan)"
          value={requiredVersion}
          onChange={setRequiredVersion}
          placeholder="0.2.0"
        />
        <TextField
          label="Link unduhan APK"
          value={updateUrl}
          onChange={setUpdateUrl}
          placeholder="https://..."
        />
        <Button
          label="Simpan versi aplikasi"
          fullWidth
          onPress={() => save({ required_app_version: requiredVersion.trim(), app_update_url: updateUrl.trim() })}
        />
      </Panel>
      )}

      <Panel title="Akun pengguna" note="Admin membuat akun trader/admin. Tidak ada registrasi mandiri.">
        <Button label={`Kelola ${users.length} akun`} icon="→" variant="secondary" onPress={() => setShowUsers(true)} />
      </Panel>

      {!!saved && <Text style={styles.saved}>{saved}</Text>}

      <UsersSheet open={showUsers} onClose={() => setShowUsers(false)} users={users} meId={user?.id ?? ''} onChanged={async () => { await load(); await refreshUser(); }} onCreate={() => setShowCreate(true)} viewerIsSuperadmin={superadmin} />
      <CreateUserSheet open={showCreate} onClose={() => setShowCreate(false)} onCreated={async () => { await load(); setShowCreate(false); }} viewerIsSuperadmin={superadmin} />
    </ScrollView>
  );
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <Text style={styles.panelNote}>{note}</Text>
      {children}
    </View>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} keyboardType="number-pad" value={value} onChangeText={onChange} />
    </View>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function UsersSheet({ open, onClose, users, meId, onChanged, onCreate, viewerIsSuperadmin }: { open: boolean; onClose: () => void; users: UserRow[]; meId: string; onChanged: () => void; onCreate: () => void; viewerIsSuperadmin: boolean }) {
  const { height: winH } = useWindowDimensions();
  return (
    <Sheet open={open} onClose={onClose} title="Kelola akun pengguna" wide>
      <ScrollView style={{ maxHeight: Math.round(winH * 0.52) }} bounces={false} showsVerticalScrollIndicator>
        {users.map((u) => (
          <UserRow key={u.id} user={u} isSelf={u.id === meId} onChanged={onChanged} viewerIsSuperadmin={viewerIsSuperadmin} />
        ))}
      </ScrollView>
      <View style={{ marginTop: space.md }}>
        <Button label="Buat akun baru" icon="+" variant="secondary" fullWidth onPress={onCreate} />
      </View>
    </Sheet>
  );
}

// Opsi role: hanya superadmin yang boleh mengangkat superadmin, sejalan
// dengan aturan server (403 bila dilanggar).
const roleOptionsFor = (viewerIsSuperadmin: boolean) => [
  { value: 'trader', label: 'Trader' },
  { value: 'admin', label: 'Admin' },
  ...(viewerIsSuperadmin ? [{ value: 'superadmin', label: 'Superadmin' }] : []),
];

function UserRow({ user, isSelf, onChanged, viewerIsSuperadmin }: { user: UserRow; isSelf: boolean; onChanged: () => void; viewerIsSuperadmin: boolean }) {
  const roleOptions = roleOptionsFor(viewerIsSuperadmin);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.display_name);
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState('');

  const save = async () => {
    try {
      await api.updateUser(user.id, {
        display_name: name.trim() || user.display_name,
        role,
        ...(password ? { password } : {}),
      });
      setEditing(false); setPassword('');
      onChanged();
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };

  const toggleActive = async () => {
    try {
      await api.updateUser(user.id, { is_active: !user.is_active });
      onChanged();
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };

  const remove = async () => {
    try {
      await api.deleteUser(user.id);
      notify('Berhasil', `Akun ${user.display_name} dihapus.`);
      onChanged();
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };

  const menuItems: ActionMenuItem[] = [
    {
      key: 'edit',
      label: editing ? 'Tutup edit' : 'Edit akun',
      icon: editing ? 'close-outline' : 'create-outline',
      onPress: () => setEditing((e) => !e),
    },
    {
      key: 'active',
      label: user.is_active ? 'Nonaktifkan akun' : 'Aktifkan akun',
      icon: user.is_active ? 'pause-circle-outline' : 'play-circle-outline',
      onPress: toggleActive,
    },
  ];
  if (!isSelf) {
    menuItems.push({
      key: 'delete',
      label: 'Hapus akun',
      icon: 'trash-outline',
      danger: true,
      separated: true,
      onPress: () => confirmAsk(
        'Hapus akun pengguna',
        `Hapus akun "${user.display_name}"? Akun tanpa riwayat order/foto akan dihapus permanen.`,
        () => remove(),
        { okLabel: 'Hapus', danger: true },
      ),
    });
  }

  return (
    <View style={styles.userRow}>
      <Avatar name={user.display_name} size={30} />
      <View style={{ flex: 1 }}>
        <Text style={styles.userName}>{user.display_name} {isSelf && <Text style={styles.selfTag}>(Anda)</Text>}</Text>
        <Text style={styles.userMeta}>@{user.username} · {roleLabel(user.role)} · {user.order_count} order</Text>
        <Text style={styles.userMeta}>Status: {user.is_active ? 'Aktif' : 'Nonaktif'}</Text>
        {editing && (
          <View style={styles.editBox}>
            <Field label="Nama lengkap" value={name} onChangeText={setName} />
            <SelectField label="Role" value={role} onChange={(v) => setRole(v as Role)} options={roleOptions} />
            <Field label="Reset kata sandi (kosongkan bila tidak diubah)" value={password} onChangeText={setPassword} secureTextEntry />
            <Button label="Simpan" fullWidth onPress={save} />
          </View>
        )}
      </View>
      <ActionMenu label={`Aksi akun ${user.display_name}`} items={menuItems} />
    </View>
  );
}

function CreateUserSheet({ open, onClose, onCreated, viewerIsSuperadmin }: { open: boolean; onClose: () => void; onCreated: () => void; viewerIsSuperadmin: boolean }) {
  const roleOptions = roleOptionsFor(viewerIsSuperadmin);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('trader');

  const create = async () => {
    if (!username.trim() || !password.trim() || !name.trim()) {
      notify('Lengkapi data', 'Username, kata sandi, dan nama lengkap wajib diisi.');
      return;
    }
    try {
      await api.createUser({ username: username.trim(), password, display_name: name.trim(), role });
      onCreated();
      setUsername(''); setPassword(''); setName(''); setRole('trader');
    } catch (e) {
      notify('Gagal', (e as Error).message);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Buat akun baru">
      <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" />
      <Field label="Nama lengkap" value={name} onChangeText={setName} />
      <Field label="Kata sandi" value={password} onChangeText={setPassword} secureTextEntry />
      <SelectField label="Role" value={role} onChange={(v) => setRole(v as Role)} options={roleOptions} />
      <Button label="Buat akun" fullWidth onPress={create} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 18, marginHorizontal: 16, marginBottom: space.lg, shadowColor: '#0F162A', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 1 },
  panelTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  panelNote: { fontSize: 11, color: colors.muted, marginTop: 4, marginBottom: 14, lineHeight: 17 },
  field: { marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '700', color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, height: 40, paddingHorizontal: 12, marginTop: 6, backgroundColor: colors.surface, color: colors.text },
  rule: { fontSize: 10, color: '#A8610F', fontWeight: '700', marginTop: 4 },
  versionNow: { fontSize: 11, color: colors.muted, marginBottom: 10, fontWeight: '700' },
  saved: { color: '#1F7A4D', fontWeight: '700', fontSize: 11, textAlign: 'center', marginVertical: 6 },
  userRow: { flexDirection: 'row', gap: 10, paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.surfaceAlt },
  userName: { fontSize: 13, fontWeight: '700', color: colors.text },
  selfTag: { fontSize: 9, color: colors.primary },
  userMeta: { fontSize: 10, color: colors.faint, marginTop: 2 },
  editBox: { marginTop: 10 },
});
