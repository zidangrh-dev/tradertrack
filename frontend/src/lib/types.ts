// Tipe domain bersama — sumber kebenaran kontrak frontend ↔ backend.

export type Role = 'admin' | 'trader';
export type Status = 'data_masuk' | 'proses_pick_up' | 'selesai';
export type PickupMethod = 'zaydan_ambilan_gjm' | 'self_pick_up';

export interface User {
  id: string;
  username: string;
  password: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface MarketplaceStore {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Product {
  id: string;
  name: string;
  quota: number;
  is_active: boolean;
  used_quota: number;
  remaining_quota: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  product_name: string;
  store_name: string;
  recipient_name: string;
  pickup_method: PickupMethod;
  trader_id: string;
  product_id: string;
  store_id: string;
  status: Status;
  order_amount: number | null;
  note: string | null;
  is_problem: boolean;
  problem_reason: string | null;
  barcode_path: string | null;
  photo_count: number;
  created_at: string;
  picked_up_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface OrderPhoto {
  id: string;
  order_id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  source: string;
  uploaded_by: string;
  created_at: string;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  actor_id: string;
  event_type: string;
  from_status: Status | null;
  to_status: Status | null;
  note: string | null;
  created_at: string;
}

export interface AppSettings {
  pending_threshold_hours: number;
  min_photos: number;
  max_photos: number;
  max_file_mb: number;
}
