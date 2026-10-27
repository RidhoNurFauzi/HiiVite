/*
# Add preview_url to products

- `preview_url`: jalur halaman demo tiap template, misalnya '/demo/floral.html'
- Boleh NULL: template tanpa demo khusus memakai halaman demo umum
*/

ALTER TABLE products ADD COLUMN IF NOT EXISTS preview_url text;