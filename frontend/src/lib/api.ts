// Lapisan API — panggilan sungguhan ke server Express + PostgreSQL via REST +
// Socket.IO. Tidak ada fallback mock: bila server tidak terjangkau, error
// dilempar ke pemanggil (layar punya UI error sendiri).

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { io } from 'socket.io-client';
import type { AppSettings, Product, MarketplaceStore, Order, OrderPhoto, OrderEvent, PickupMethod, Role, Status, User } from './types';

export type { AppSettings, Product, MarketplaceStore, Order, OrderPhoto, OrderEvent, PickupMethod, Role, Status, User };

export interface SessionUser {
  id: string;
  username: string;
  display_name: string;
  role: Role;
}

export interface OrderView extends Order {
  trader_name: string;
  product_label: string;
  is_pending: boolean;
}

export interface OrderDetail extends OrderView {
  photos: { id: string; file_path: string; source: string }[];
  events: { id: string; event_type: string; actor_name: string; from_status: Status | null; to_status: Status | null; note: string | null; created_at: string }[];
}

export interface Reports {
  totals: { total: number; data_masuk: number; proses_pick_up: number; selesai: number; bermasalah: number };
  perTrader: { trader: string; total: number; selesai: number; belum_selesai: number }[];
  perProduk: { product_name: string; quota: number; used_quota: number; remaining_quota: number; amount: number }[];
  delayed: { order_number: string; product_name: string; trader: string; duration: string; is_problem: boolean }[];
}

export interface ProductRow extends Product {
  used_quota: number;
  remaining_quota: number;
}

export interface UserRow extends Omit<User, 'password'> {
  order_count: number;
}

/* ---------- Konfigurasi ---------- */

// URL API bertingkat:
// 1. Expo Go / dev di perangkat native — turunkan dari host dev server
//    (hostUri, mis. "192.168.10.77:8081" atau "10.0.2.2:8081") → port 4000.
//    Otomatis mengikuti IP laptop yang sedang dipakai, tanpa edit manual.
// 2. Web & build produksi — pakai extra.apiUrl dari app.json, fallback localhost.
function resolveApiUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri && Platform.OS !== 'web') {
    const host = hostUri.split(':')[0];
    if (host) return `http://${host}:4000`;
  }
  return (Constants.expoConfig?.extra?.apiUrl as string | undefined) || 'http://localhost:4000';
}

const API_URL: string = resolveApiUrl();

const TOKEN_KEY = 'zproject.jwt';

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

/** URL publik untuk berkas upload (dilindungi JWT — disisipkan via query token). */
export async function uploadsUrl(filePath: string): Promise<string> {
  const token = await getToken();
  return `${API_URL}${filePath}?token=${encodeURIComponent(token ?? '')}`;
}

/* ---------- HTTP ---------- */

// FormData lintas platform: web butuh Blob asli (fetch dari blob-uri hasil picker),
// native React Native pakai format {uri, name, type}.
async function photoForm(file: { uri: string; name: string; type: string }, extra?: Record<string, string>): Promise<FormData> {
  const form = new FormData();
  for (const [k, v] of Object.entries(extra ?? {})) form.append(k, v);
  if (Platform.OS === 'web') {
    const res = await fetch(file.uri);
    const blob = await res.blob();
    form.append('photo', blob, file.name);
  } else {
    form.append('photo', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  }
  return form;
}

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
  return () => {
    listeners.delete(fn);
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
  changePassword: (current_password: string, new_password: string) =>
    http<void>('/api/me/password', { method: 'POST', body: { current_password, new_password } }),
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
  createOrder: (body: { order_number: string; recipient_name: string; pickup_method: PickupMethod; product_id: string; store_id: string; trader_id?: string; order_amount?: number | null }) => http<OrderView>('/api/orders', { method: 'POST', body }),
  updateStatus: (id: string, to: Status) => http<OrderView>(`/api/orders/${id}/status`, { method: 'PATCH', body: { to_status: to } }),
  scan: async (code: string, file?: { uri: string; name: string; type: string }) => {
    if (!file) return http<OrderView | null>('/api/orders/scan', { method: 'POST', body: { code } });
    return http<OrderView | null>('/api/orders/scan', { method: 'POST', form: await photoForm(file, { code }) });
  },
  pickup: async (id: string, file?: { uri: string; name: string; type: string }) => {
    if (!file) return http<OrderView>(`/api/orders/${id}/pickup`, { method: 'POST' });
    return http<OrderView>(`/api/orders/${id}/pickup`, { method: 'POST', form: await photoForm(file) });
  },
  attachBarcode: async (id: string, file: { uri: string; name: string; type: string }) => {
    return http<OrderView>(`/api/orders/${id}/barcode`, { method: 'POST', form: await photoForm(file) });
  },
  detail: (id: string) => http<OrderDetail>(`/api/orders/${id}/detail`),
  uploadPhoto: async (id: string, file?: { uri: string; name: string; type: string }) => {
    if (!file) return http<OrderView>(`/api/orders/${id}/photos`, { method: 'POST' });
    return http<OrderView>(`/api/orders/${id}/photos`, { method: 'POST', form: await photoForm(file) });
  },
  deletePhoto: (orderId: string, photoId: string) => http<OrderView>(`/api/orders/${orderId}/photos/${photoId}`, { method: 'DELETE' }),
  completeOrder: (id: string, note: string) => http<OrderView>(`/api/orders/${id}/complete`, { method: 'PATCH', body: { note } }),
  markProblem: (id: string, reason: string) => http<OrderView>(`/api/orders/${id}/problem`, { method: 'PATCH', body: { reason } }),
  reopen: (id: string) => http<OrderView>(`/api/orders/${id}/reopen`, { method: 'PATCH' }),
  deleteOwnOrder: (id: string) => http<void>(`/api/orders/${id}`, { method: 'DELETE' }),
  editOwnOrder: (id: string, patch: Partial<Order>) => http<OrderView>(`/api/orders/${id}`, { method: 'PATCH', body: patch }),

  reports: (range: string, from?: string, to?: string) => {
    const qs = new URLSearchParams({ range });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return http<Reports>(`/api/reports?${qs.toString()}`);
  },
  listMarketplaceStores: () => http<MarketplaceStore[]>('/api/marketplace-stores'),
  createMarketplaceStore: (name: string) => http<MarketplaceStore[]>('/api/marketplace-stores', { method: 'POST', body: { name } }),
  deleteMarketplaceStore: (id: string) => http<MarketplaceStore[]>(`/api/marketplace-stores/${id}`, { method: 'DELETE' }),
  listProducts: () => http<ProductRow[]>('/api/products'),
  createProduct: (input: { name: string; quota: number }) => http<ProductRow[]>('/api/products', { method: 'POST', body: input }),
  updateProduct: (id: string, patch: Partial<ProductRow>) => http<ProductRow[]>(`/api/products/${id}`, { method: 'PATCH', body: patch }),
  addProductQuota: (id: string, amount: number) => http<ProductRow[]>(`/api/products/${id}/quota`, { method: 'POST', body: { amount } }),
  resetProductQuota: (id: string) => http<ProductRow[]>(`/api/products/${id}/reset-quota`, { method: 'POST' }),
  deleteProduct: (id: string) => http<ProductRow[]>(`/api/products/${id}`, { method: 'DELETE' }),

  getSettings: () => http<AppSettings>('/api/settings'),
  saveSettings: (patch: Partial<AppSettings>) => http<AppSettings>('/api/settings', { method: 'PATCH', body: patch }),
  listUsers: () => http<UserRow[]>('/api/users'),
  createUser: (input: { username: string; password: string; display_name: string; role: Role }) => http<void>('/api/users', { method: 'POST', body: input }),
  updateUser: (id: string, patch: Partial<User>) => http<void>(`/api/users/${id}`, { method: 'PATCH', body: patch }),
  deleteUser: (id: string) => http<void>(`/api/users/${id}`, { method: 'DELETE' }),
};

/** api — panggilan langsung; error (termasuk server mati) dilempar ke pemanggil. */
export const api = remote;
