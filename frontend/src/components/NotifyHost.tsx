import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { backdropColor, colors, radius } from '../theme';
import { dismissToast, getConfirm, getToasts, resolveConfirm, subscribe, type ConfirmRequest, type Toast } from '../lib/notify';

const kindPalette: Record<string, { bg: string; accent: string }> = {
  success: { bg: '#E7F4ED', accent: '#1F7A4D' },
  error: { bg: '#FBECEC', accent: '#A34848' },
  warn: { bg: '#FCF3E3', accent: '#A8610F' },
  info: { bg: '#EAF1F8', accent: '#1F4B7A' },
};

// ponytail: portal ke document.body dengan zIndex 20000 — Modal react-native-web
// memakai fixed zIndex 9999 dan stacking-nya bergantung urutan mount portal, sehingga
// dialog global bisa tenggelam di bawah Sheet yang dibuka belakangan. zIndex berbeda
// membuat urutan mount tidak relevan. Di native NotifyHost tidak dirender (Alert OS).
function WebPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

export function NotifyHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  useEffect(() => subscribe(() => {
    setToasts(getToasts());
    setConfirm(getConfirm());
  }), []);

  if (Platform.OS !== 'web') return null;

  return (
    <WebPortal>
      {toasts.length > 0 && (
        <View style={styles.toastLayer} pointerEvents="box-none">
          {toasts.map((t) => {
            const pal = kindPalette[t.kind] ?? kindPalette.info;
            return (
              <Pressable key={t.id} onPress={() => dismissToast(t.id)} style={styles.toast}>
                <View style={[styles.toastAccent, { backgroundColor: pal.accent }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.toastTitle}>{t.title}</Text>
                  {!!t.message && <Text style={styles.toastMsg}>{t.message}</Text>}
                </View>
                <Text style={styles.toastClose}>×</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {!!confirm && (
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => resolveConfirm(false)} />
          <View style={styles.dialog}>
            <View style={[styles.dialogIcon, confirm.danger ? styles.dialogIconDanger : styles.dialogIconWarn]}>
              <Text style={[styles.dialogIconText, confirm.danger && styles.dialogIconTextDanger]}>!</Text>
            </View>
            <Text style={styles.dialogTitle}>{confirm.title}</Text>
            <Text style={styles.dialogMessage}>{confirm.message}</Text>
            <View style={styles.dialogActions}>
              <Pressable style={styles.dialogCancel} onPress={() => resolveConfirm(false)}>
                <Text style={styles.dialogCancelText}>Batal</Text>
              </Pressable>
              <Pressable
                style={[styles.dialogOk, confirm.danger && styles.dialogOkDanger]}
                onPress={() => resolveConfirm(true)}
              >
                <Text style={styles.dialogOkText}>{confirm.okLabel ?? 'OK'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </WebPortal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: backdropColor,
    alignItems: 'center', justifyContent: 'center', padding: 16,
    zIndex: 20000, elevation: 20000,
  } as unknown as ViewStyle,
  toastLayer: {
    position: 'fixed', top: 16, right: 16, gap: 8,
    maxWidth: 380, minWidth: 260, alignItems: 'stretch',
    zIndex: 20001, elevation: 20001,
  } as unknown as ViewStyle,
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.line,
    shadowColor: '#0F162A', shadowOpacity: 0.14, shadowOffset: { width: 0, height: 8 }, shadowRadius: 18, elevation: 8,
  },
  toastAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  toastTitle: { fontSize: 12, fontWeight: '800', color: colors.text },
  toastMsg: { fontSize: 10, color: colors.muted, marginTop: 2, lineHeight: 14 },
  toastClose: { color: colors.faint, fontSize: 18, paddingHorizontal: 2 },
  dialog: {
    backgroundColor: colors.surface, borderRadius: radius.lg, width: '100%', maxWidth: 400, padding: 20,
    shadowColor: '#0F162A', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 16 }, shadowRadius: 32, elevation: 16,
  },
  dialogIcon: { width: 38, height: 38, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  dialogIconWarn: { backgroundColor: '#FCF3E3' },
  dialogIconDanger: { backgroundColor: '#FBECEC' },
  dialogIconText: { fontSize: 18, fontWeight: '800', color: '#A8610F' },
  dialogIconTextDanger: { color: colors.red },
  dialogTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  dialogLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, marginTop: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  dialogInput: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface,
    height: 42, paddingHorizontal: 12, fontSize: 13, color: colors.text,
  },
  dialogMessage: { fontSize: 11, color: colors.muted, lineHeight: 17, marginTop: 8 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  dialogCancel: { paddingHorizontal: 16, height: 36, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  dialogCancelText: { fontSize: 12, fontWeight: '700', color: colors.muted },
  dialogOk: { paddingHorizontal: 16, height: 36, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  dialogOkDanger: { backgroundColor: colors.red },
  dialogOkText: { fontSize: 12, fontWeight: '800', color: colors.onPrimary },
});