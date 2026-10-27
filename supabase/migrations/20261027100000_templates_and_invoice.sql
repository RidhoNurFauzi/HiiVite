alter table products
  add column if not exists preview_url text,
  add column if not exists template_url text;

alter table orders
  add column if not exists invoice_sent_at timestamptz;

-- Hubungkan tiap produk ke file template-nya (sesuaikan slug produkmu)
update products set template_url = '/templates/classic-gold.html',
                    preview_url  = '/templates/classic-gold.html'
 where slug = 'classic-elegance';
update products set template_url = '/templates/floral-green.html',
                    preview_url  = '/templates/floral-green.html'
 where slug = 'floral-garden';