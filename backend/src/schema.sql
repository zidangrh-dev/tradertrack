-- ZProject — skema PostgreSQL sesuai PRD bagian 7.
-- Nama tabel dan kolom PERSIS seperti di PRD, jangan diganti.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('superadmin', 'admin', 'trader')),
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_stores_name_ci ON marketplace_stores (lower(name));

-- Produk = tipe barang. Kuota menempel di produk (lintas toko).
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  quota integer NOT NULL DEFAULT 0 CHECK (quota >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_name_ci ON products (lower(name));

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  product_name text NOT NULL,
  store_name text NOT NULL,
  recipient_name text NOT NULL,
  pickup_method text NOT NULL CHECK (pickup_method IN ('zaydan_ambilan_gjm', 'self_pick_up')),
  trader_id uuid NOT NULL REFERENCES users(id),
  product_id uuid NOT NULL REFERENCES products(id),
  store_id uuid NOT NULL REFERENCES marketplace_stores(id),
  status text NOT NULL DEFAULT 'data_masuk' CHECK (status IN ('data_masuk', 'proses_pick_up', 'done_pickup', 'selesai')),
  order_amount numeric,
  note text,
  is_problem boolean NOT NULL DEFAULT false,
  problem_reason text,
  barcode_path text,
  photo_count integer NOT NULL DEFAULT 0,
  -- Order yang dibuat sejak aturan bukti ganda berlaku: wajib barcode pick up
  -- DAN foto bukti order sebelum bisa diproses. Order lama tetap false.
  requires_dual_evidence boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  picked_up_at timestamptz,
  completed_at timestamptz,
  -- Waktu perpindahan status TERAKHIR. Sengaja dipisah dari updated_at: unggah
  -- foto / edit order menaikkan updated_at, dan kanban tidak boleh mengurutkan
  -- ulang karenanya. Hanya transisi status yang menyentuh kolom ini.
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Bersihkan warisan tabel lama (skema sebelumnya).
DROP TABLE IF EXISTS master_data CASCADE;

-- Kolom menyusul untuk database yang dibuat sebelum aturan bukti ganda.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS requires_dual_evidence boolean NOT NULL DEFAULT false;

-- Penanda toko yang menerbitkan barcode pick up (Roxy dan sejenisnya).
-- Order dari toko ini wajib melampirkan barcode + bukti order; toko lain cukup
-- bukti order saja. Default false supaya toko baru tidak diam-diam mewajibkan
-- barcode sebelum admin menandainya.
ALTER TABLE marketplace_stores ADD COLUMN IF NOT EXISTS has_barcode boolean NOT NULL DEFAULT false;

-- Backfill sekali jalan: toko Roxy yang sudah ada ditandai punya barcode.
-- Dibatasi pada baris yang belum pernah ditandai agar perubahan manual admin
-- tidak tertimpa setiap kali migrasi dijalankan ulang.
UPDATE marketplace_stores SET has_barcode = true
  WHERE has_barcode = false AND name ILIKE '%roxy%'
    AND NOT EXISTS (SELECT 1 FROM marketplace_stores WHERE has_barcode = true);

-- Kolom menyusul untuk database lama: urutan kanban berbasis perpindahan status.
-- Backfill memakai jejak waktu terbaik yang ada, bukan now(), agar urutan awal
-- tidak jadi acak — semua baris lama kebagian stempel yang sama.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
UPDATE orders SET status_changed_at = COALESCE(completed_at, picked_up_at, created_at)
  WHERE status_changed_at IS NULL;
ALTER TABLE orders ALTER COLUMN status_changed_at SET DEFAULT now();
ALTER TABLE orders ALTER COLUMN status_changed_at SET NOT NULL;

-- Role superadmin: constraint lama hanya mengizinkan admin/trader, jadi harus
-- diganti sebelum ada baris ber-role superadmin.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('superadmin', 'admin', 'trader'));

-- Status done_pickup: CHECK inline hanya berlaku untuk tabel yang baru dibuat,
-- jadi database yang sudah ada perlu constraint-nya diganti di sini.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('data_masuk', 'proses_pick_up', 'done_pickup', 'selesai'));

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status_changed_at ON orders(status_changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_trader_id ON orders(trader_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id);

CREATE TABLE IF NOT EXISTS order_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  source text NOT NULL,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id),
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key text PRIMARY KEY,
  setting_value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
