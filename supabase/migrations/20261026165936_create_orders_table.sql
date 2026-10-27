/*
# Create orders table

- Mendukung dua kategori: undangan (groom/bride/event_date) dan kartu ucapan
  (recipient/sender/occasion/message). Field khusus tiap kategori boleh NULL.
- Harga bigint (IDR tanpa desimal)
- KEAMANAN: anon TIDAK punya akses langsung ke tabel ini.
  Insert/update dilakukan Edge Function (service_role).
  Frontend cek status lewat function get_order_status().
*/

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text UNIQUE NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'invitation'
    CHECK (category IN ('invitation', 'greeting_card')),

  -- Data undangan
  groom_name text,
  bride_name text,
  event_date date,
  venue_url text,
  whatsapp_rsvp boolean NOT NULL DEFAULT false,

  -- Data Kustomisasi Pembeli (Foto & Musik)
  bride_photo_url text,
  groom_photo_url text,
  gallery_urls text[],
  background_music_url text,

  -- Data kartu ucapan
  recipient_name text,
  sender_name text,
  occasion text,
  card_message text,

  -- Data pembeli
  customer_email text,
  customer_phone text,

  -- Pembayaran & Invoice
  base_price bigint NOT NULL,
  addon_price bigint NOT NULL DEFAULT 0,
  total_price bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  midtrans_transaction_id text,
  qr_code_url text,
  invitation_link text,
  expires_at timestamptz,
  paid_at timestamptz,
  invoice_sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders (order_id);
CREATE INDEX IF NOT EXISTS idx_orders_midtrans_transaction_id ON orders (midtrans_transaction_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_category ON orders (category);

-- RLS aktif, tanpa policy untuk anon = anon tidak bisa akses apa pun.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON orders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON orders TO service_role;

-- Function cek status untuk frontend (hanya kolom yang diperlukan)
CREATE OR REPLACE FUNCTION public.get_order_status(p_order_id text)
RETURNS TABLE (order_id text, status text, invitation_link text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.order_id, o.status, o.invitation_link
  FROM orders o
  WHERE o.order_id = p_order_id;
$$;

REVOKE ALL ON FUNCTION public.get_order_status(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_order_status(text) TO anon, authenticated;