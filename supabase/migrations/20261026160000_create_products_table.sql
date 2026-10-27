/*
# Create products table

- `products`: katalog undangan & kartu ucapan (dibaca publik, tanpa login)
- `category`: 'invitation' atau 'greeting_card'
- `is_custom`: true untuk opsi custom (tidak tampil di galeri, diarahkan ke WhatsApp)
- Harga bigint (IDR tanpa desimal)
- RLS aktif, anon hanya boleh SELECT
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  image_url text,
  price bigint NOT NULL,
  category text NOT NULL DEFAULT 'invitation'
    CHECK (category IN ('invitation', 'greeting_card')),
  is_custom boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  preview_url text,
  template_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO service_role;

DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT
  TO anon, authenticated USING (is_active = true);