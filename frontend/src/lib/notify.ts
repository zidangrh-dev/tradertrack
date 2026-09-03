// Notifikasi & konfirmasi custom lintas platform.
// Di web memakai overlay React sendiri (bukan window.alert/confirm bawaan browser).
// Di native memakai Alert bawaan OS.
import { Alert, Platform } from 'react-native';

export type NotifyKind = 'success' | 'error' | 'warn' | 'info';

export interface Toast {
  id: number;
  title: string;
  message?: string;
  kind: NotifyKind;
}

export interface ConfirmRequest {
  id: number;
  title: string;
  message: string;
  okLabel?: string;
  danger?: boolean;
  onOk: () => void;
  onCancel?: () => void;
}

export interface PromptRequest {
  id: number;
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  okLabel?: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
}

let seq = 0;
let toasts: Toast[] = [];
let confirm: ConfirmRequest | null = null;
let prompt: PromptRequest | null = null;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((fn) => fn()); }

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function getToasts() { return toasts; }
export function getConfirm() { return confirm; }
export function getPrompt() { return prompt; }

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function resolveConfirm(ok: boolean) {
  const c = confirm;
  confirm = null;
  emit();
  if (ok && c) c.onOk();
  if (!ok && c) c.onCancel?.();
}

export function resolvePrompt(ok: boolean, value?: string) {
  const p = prompt;
  prompt = null;
  emit();
  if (ok && p && value !== undefined) p.onSubmit(value);
  if (!ok && p) p.onCancel?.();
}

function inferKind(title: string): NotifyKind {
  const t = title.toLowerCase();
  if (/gagal|tidak dapat|error|tidak ditemukan/.test(t)) return 'error';
  if (/berhasil|tersalin|disimpan|ditambahkan|dihapus|diubah|reset/.test(t)) return 'success';
  if (/foto wajib|lengkapi|tolak/.test(t)) return 'warn';
  return 'info';
}

/* ---- Web: overlay custom ---- */

export function notify(title: string, message?: string) {
  if (Platform.OS !== 'web') { Alert.alert(title, message); return; }
  const t: Toast = { id: ++seq, title, message, kind: inferKind(title) };
  toasts = [t, ...toasts];
  emit();
  setTimeout(() => dismissToast(t.id), 3500);
}

export function confirmAsk(title: string, message: string, onOk: () => void, opts?: { okLabel?: string; danger?: boolean }) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, [
      { text: 'Batal', style: 'cancel' },
      { text: opts?.okLabel ?? 'OK', style: opts?.danger ? 'destructive' : 'default', onPress: onOk },
    ]);
    return;
  }
  confirm = { id: ++seq, title, message, okLabel: opts?.okLabel, danger: opts?.danger, onOk };
  emit();
}

export function promptAsk(title: string, label: string, onSubmit: (value: string) => void, opts?: { placeholder?: string; defaultValue?: string; okLabel?: string }) {
  if (Platform.OS !== 'web') return; // tanpa UI prompt native: batalkan (parity window.prompt null).
  prompt = { id: ++seq, title, label, placeholder: opts?.placeholder, defaultValue: opts?.defaultValue, okLabel: opts?.okLabel, onSubmit };
  emit();
}
