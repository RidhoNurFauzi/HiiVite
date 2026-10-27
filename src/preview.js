// ============================================================
// preview.js — template preview modal
// Used by app.js: initPreview(onUse) once, openPreview(product) per card.
// ============================================================

const modal = document.getElementById('previewModal');
const frame = document.getElementById('previewFrame');
const titleEl = document.getElementById('previewTitle');
const useBtn = document.getElementById('previewUseBtn');

let activeProduct = null;
let onUse = () => {};

// Sample invitation page. The template slug lets the demo pick a colour theme.
// If a product ever has its own demo page, pass product.preview_url.
function previewUrl(product) {
  const base =
    product.preview_url ||
    `/demo/invitation.html?template=${encodeURIComponent(product.slug || product.name || '')}`;
  const url = new URL(base, window.location.origin);

  // If the buyer already typed their details, show them in the preview.
  const val = (id) => document.getElementById(id)?.value?.trim();
  if (val('groom_name')) url.searchParams.set('groom', val('groom_name'));
  if (val('bride_name')) url.searchParams.set('bride', val('bride_name'));
  if (val('event_date')) url.searchParams.set('date', val('event_date'));
  return url.toString();
}

export function openPreview(product) {
  activeProduct = product;
  titleEl.textContent = product.name;
  
  // Sesuaikan teks tombol jika produk adalah desain custom
  useBtn.textContent = product.is_custom ? 'Customize via WhatsApp' : 'Use This Template';
  
  frame.src = previewUrl(product);
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closePreview() {
  modal.classList.remove('open');
  document.body.style.overflow = '';
  frame.src = 'about:blank'; // Menghentikan loading iframe di background
  activeProduct = null;
}

export function initPreview(useCallback) {
  onUse = useCallback;

  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closePreview();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closePreview();
  });

  useBtn.addEventListener('click', () => {
    const product = activeProduct;
    closePreview();
    if (product) onUse(product);
  });

  // Mobile / Desktop toggle
  modal.querySelectorAll('[data-device]').forEach((btn) => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('[data-device]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      frame.classList.toggle('desktop', btn.dataset.device === 'desktop');
    });
  });
}