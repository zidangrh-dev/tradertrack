// Lapisan API. Fase 3: panggilan sungguhan ke server Express + PostgreSQL
// via REST + Socket.IO. Mock lokal (store.ts) hanya dipakai sebagai fallback
// dev bila server tidak terjangkau (network error), bukan jalur utama.
// Kontrak endpoint sama persis dengan mock agar kedua mode seragam.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { io } from 'socket.io-client';
import { mock, subscribeChanges as mockSubscribe } from './store';
import type { AppSettings, BankAccount, Order, OrderPhoto, OrderEvent, PickupMethod, Role, Status, User } from './store';

export type { AppSettings, BankAccount, Order, OrderPhoto, OrderEvent, PickupMethod, Role, Status, User };

export interface SessionUser {
  id: string;
  username: string;
  display_name: string;
  role: Role;
}

export interface OrderView extends Order {
  trader_name: string;
  bank_account_label: string;
  is_pending: boolean;
}

export interface OrderDetail extends OrderView {
  photos: { id: string; file_path: string; source: string }[];
  events: { id: string; event_type: string; actor_name: string; from_status: Status | null; to_status: Status | null; note: string | null; created_at: string }[];
}

export interface Reports {
  totals: { total: number; data_masuk: number; proses_pick_up: number; selesai: number; bermasalah: number };
  perTrader: { trader: string; total: number; selesai: number; belum_selesai: number }[];
  perRekening: { account_number: string; bank_name: string; holder: string; orders: number; amount: number }[];
  delayed: { order_number: string; product_name: string; trader: string; duration: string; is_problem: boolean }[];
}

export interface AccountRow extends BankAccount {
  orders: number;
}

export interface UserRow extends Omit<User, 'password'> {
  order_count: number;
}

/* ---------- Konfigurasi ---------- */

const API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) || 'http://localhost:4000';

// Dev-only: true bila aplikasi harus tetap jalan walau server mati (fallback mock).
const USE_MOCK_FALLBACK = true;

const TOKEN_KEY = 'tradertrack.jwt';

async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
async function setToken(token: string | null) {
  try {
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage penuh/kunci — abaikan */
  }
}

/* ---------- HTTP ---------- */

async function http<T>(path: string, options: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = options.form instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: isForm ? headers : options.body ? { ...headers, 'Content-Type': 'application/json' } : headers,
    body: isForm ? options.form : options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    let msg: string | undefined;
    try {
      msg = (await res.json()).error;
    } catch {
      /* badan bukan JSON */
    }
    throw new Error(msg || `Permintaan gagal (HTTP ${res.status}).`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ---------- Realtime (Socket.IO) ---------- */

const listeners = new Set<() => void>();
let socket: ReturnType<typeof io> | null = null;

export function subscribeChanges(fn: () => void) {
  listeners.add(fn);
  const off = mockSubscribe(fn);
  return () => {
    listeners.delete(fn);
    off();
  };
}

function fire() {
  listeners.forEach((fn) => fn());
}

async function connectRealtime() {
  if (socket || !(await getToken())) return;
  socket = io(API_URL, {
    auth: async (cb: (auth: { token: string | null }) => void) => cb({ token: await getToken() }),
  });
  socket.on('packages:changed', fire);
  socket.on('disconnect', () => {
    socket = null;
  });
}

function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
}

/* ---------- API sungguhan ---------- */

const remote = {
  login: async (username: string, password: string) => {
    const data = await http<{ token: string; user: SessionUser }>('/api/login', { method: 'POST', body: { username, password } });
    await setToken(data.token);
    connectRealtime();
    return data;
  },
  logout: async () => {
    disconnectRealtime();
    await http('/api/logout', { method: 'POST' }).catch(() => undefined);
    await setToken(null);
  },
  getSession: async () => {
    try {
      const u = await http<SessionUser | null>('/api/session');
      if (u) connectRealtime();
      return u;
    } catch {
      return null;
    }
  },
  setSessionUser: async (id: string) => {
    const data = await http<{ token: string; user: SessionUser }>('/api/dev/session', { method: 'POST', body: { id } });
    await setToken(data.token);
    connectRealtime();
    return data.user;
  },

  listOrders: (query: Record<string, string> = {}) => {
    const qs = new URLSearchParams(query).toString();
    return http<{ items: OrderView[]; total: number; page: number }>(`/api/orders${qs ? `?${qs}` : ''}`);
  },
  createOrder: (body: Parameters<typeof mock.createOrder>[0]) => http<OrderView>('/api/orders', { method: 'POST', body }),
  updateStatus: (id: string, to: Status) => http<OrderView>(`/api/orders/${id}/status`, { method: 'PATCH', body: { to_status: to } }),
  scan: (code: string) => http<OrderView | null>('/api/orders/scan', { method: 'POST', body: { code } }),
  attachBarcode: (id: string, file: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append('photo', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    return http<OrderView>(`/api/orders/${id}/barcode`, { method: 'POST', form });
  },
  detail: (id: string) => http<OrderDetail>(`/api/orders/${id}/detail`),
  uploadPhoto: (id: string) => http<OrderView>(`/api/orders/${id}/photos`, { method: 'POST' }),
  deletePhoto: (orderId: string, photoId: string) => http<OrderView>(`/api/orders/${orderId}/photos/${photoId}`, { method: 'DELETE' }),
  completeOrder: (id: string, note: string) => http<OrderView>(`/api/orders/${id}/complete`, { method: 'PATCH', body: { note } }),
  markProblem: (id: string, reason: string) => http<OrderView>(`/api/orders/${id}/problem`, { method: 'PATCH', body: { reason } }),
  reopen: (id: string) => http<OrderView>(`/api/orders/${id}/reopen`, { method: 'PATCH' }),
  deleteOwnOrder: (id: string) => http<void>(`/api/orders/${id}`, { method: 'DELETE' }),
  editOwnOrder: (id: string, patch: Partial<Order>) => http<OrderView>(`/api/orders/${id}`, { method: 'PATCH', body: patch }),

  reports: (range: string) => http<Reports>(`/api/reports?range=${range}`),
  listAccounts: () => http<AccountRow[]>('/api/bank-accounts'),
  createAccount: (input: { account_number: string; bank_name: string; account_holder_name: string }) => http<AccountRow[]>('/api/bank-accounts', { method: 'POST', body: input }),
  setAccountActive: (id: string, active: boolean) => http<AccountRow[]>(`/api/bank-accounts/${id}`, { method: 'PATCH', body: { is_active: active } }),

  getSettings: () => http<AppSettings>('/api/settings'),
  saveSettings: (patch: Partial<AppSettings>) => http<AppSettings>('/api/settings', { method: 'PATCH', body: patch }),
  listUsers: () => http<UserRow[]>('/api/users'),
  createUser: (input: { username: string; password: string; display_name: string; role: Role }) => http<void>('/api/users', { method: 'POST', body: input }),
  updateUser: (id: string, patch: Partial<User>) => http<void>(`/api/users/${id}`, { method: 'PATCH', body: patch }),
};

function isNetworkError(e: unknown) {
  return e instanceof TypeError || (e instanceof Error && /fetch|network|load failed/i.test(e.message));
}

/** api = remote; bila server mati (network error) dan mode fallback aktif, pakai mock dev. */
export const api: typeof remote = new Proxy(remote, {
  get(target, prop) {
    const value = target[prop as keyof typeof remote];
    if (typeof value !== 'function') return value;
    return (...args: unknown[]) =>
      (value as (...a: unknown[]) => Promise<unknown>).apply(target, args).catch((e) => {
        if (USE_MOCK_FALLBACK && isNetworkError(e) && typeof (mock as unknown as Record<string, unknown>)[prop as string] === 'function') {
          console.warn(`[api] server tak terjangkau — fallback mock untuk ${String(prop)}`);
          return (mock as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop as string](...args);
        }
        throw e;
      });
  },
});
