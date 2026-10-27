/*
# Add templates, preview URLs, and invoice tracking
*/

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS preview_url text,
  ADD COLUMN IF NOT EXISTS template_url text;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoice_sent_at timestamptz;

-- Hubungkan tiap produk ke file template-nya (sesuai struktur folder public/templates)
UPDATE products 
SET template_url = '/templates/classic-gold.html',
    preview_url  = '/templates/classic-gold.html'
WHERE slug = 'classic-elegance';

UPDATE products 
SET template_url = '/templates/floral-green.html',
    preview_url  = '/templates/floral-green.html'
WHERE slug = 'floral-garden';