// ============================================================
// Hiivite — Frontend logic (Vanilla JS ES6+)
// Product catalog + preview + price calculation + QRIS checkout
// + status polling.
// Backend = Supabase (products table read directly, checkout via
// Edge Functions).
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { initPreview, openPreview } from './preview.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const WHATSAPP_RSVP_PRICE = 50000;

const formatIDR = (n) => 'IDR ' + Number(n).toLocaleString('id-ID');

const $ = (id) => document.getElementById(id);

// Escape text coming from the database before putting it into innerHTML.
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const els = {
  productGrid: $('productGrid'),
  noSelectionPrompt: $('noSelectionPrompt'),
  form: $('orderForm'),
  groomName: $('groom_name'),
  brideName: $('bride_name'),
  eventDate: $('event_date'),
  venueUrl: $('venue_url'),
  customerEmail: $('customer_email'),
  customerPhone: $('customer_phone'),
  whatsappRsvp: $('whatsapp_rsvp'),

  summaryProductName: $('summaryProductName'),
  summaryBase: $('summaryBase'),
  summaryAddonRow: $('summaryAddonRow'),
  summaryAddon: $('summaryAddon'),
  summaryTotal: $('summaryTotal'),

  invoiceLink: $('invoiceLink'),
  waInvoiceBtn: $('waInvoiceBtn'),

  payBtn: $('payNowBtn'),
  qrisContainer: $('qrisContainer'),
  qrisImage: $('qrisImage'),
  qrisOrderId: $('qrisOrderId'),
  qrisUrlLink: $('qrisUrlLink'),
  copyQrisBtn: $('copyQrisBtn'),
  countdownWrap: $('countdownWrap'),
  countdownTimer: $('countdownTimer'),
  paymentSuccess: $('paymentSuccess'),
  invitationLink: $('invitationLink'),

  formError: $('formError'),
  formStatus: $('formStatus'),
};

let selectedProduct = null;
let countdownInterval = null;
let pollInterval = null;
let currentOrderId = null;

// ============================================================
// Product catalog
// ============================================================
async function loadProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, slug, name, description, image_url, price, is_custom, sort_order, preview_url')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    els.productGrid.innerHTML =
      '<div class="col-span-full text-center text-red-600 py-10">Could not load designs. Please refresh the page.</div>';
    return;
  }

  if (!data || data.length === 0) {
    els.productGrid.innerHTML =
      '<div class="col-span-full text-center text-muted py-10">No designs available yet.</div>';
    return;
  }

  els.productGrid.innerHTML = '';
  for (const p of data) {
    els.productGrid.appendChild(renderProductCard(p));
  }
}

function renderProductCard(p) {
  const card = document.createElement('div');
  card.className = 'group bg-white rounded-2xl border border-gold/15 overflow-hidden flex flex-col';
  card.dataset.productId = p.id;

  const badge = p.is_custom
    ? '<span class="absolute top-3 right-3 bg-gold text-white text-xs font-semibold px-3 py-1 rounded-full shadow">Custom</span>'
    : '';

  card.innerHTML = `
    <div class="relative overflow-hidden cursor-zoom-in" data-action="preview" title="Preview design">
      <img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy"
        class="w-full h-56 object-cover group-hover:scale-105 transition duration-500" />
      ${badge}
    </div>
    <div class="p-5 flex flex-col flex-1">
      <h3 class="font-serif text-xl text-ink mb-1">${esc(p.name)}</h3>
      <p class="text-muted text-sm flex-1 mb-3">${esc(p.description || '')}</p>
      <span class="font-serif text-xl text-gold-dark">${formatIDR(p.price)}</span>
      <div class="card-actions">
        <button type="button" class="btn-preview" data-action="preview">Preview</button>
        <button type="button" class="btn-buy" data-action="buy">${p.is_custom ? 'Customize' : 'Buy Now'}</button>
      </div>
    </div>
  `;

  // One listener per card: Preview opens the modal, Buy Now selects right away.
  card.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'preview') openPreview(p);
    else if (action === 'buy') selectProduct(p, card);
  });

  return card;
}

function selectProduct(product, cardEl) {
  selectedProduct = product;

  // Highlight the chosen card, dim the others.
  document.querySelectorAll('#productGrid > div').forEach((c) => {
    c.classList.remove('ring-2', 'ring-gold', 'border-gold');
    c.classList.add('border-gold/15');
  });
  if (cardEl) {
    cardEl.classList.remove('border-gold/15');
    cardEl.classList.add('ring-2', 'ring-gold', 'border-gold');
  }

  // Reveal the order form, hide the "no selection" prompt.
  els.noSelectionPrompt.classList.add('hidden');
  els.form.classList.remove('hidden');

  // Update the summary with the product name + price.
  els.summaryProductName.textContent = product.name;
  recalculate();

  // Scroll to the order form.
  els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// "Use This Template" inside the preview modal → same as Buy Now.
initPreview((product) => {
  const card = els.productGrid.querySelector(`[data-product-id="${product.id}"]`);
  selectProduct(product, card);
});

// ============================================================
// Price calculation
// ============================================================
function recalculate() {
  const basePrice = selectedProduct ? selectedProduct.price : 0;
  const addon = els.whatsappRsvp.checked ? WHATSAPP_RSVP_PRICE : 0;
  const total = basePrice + addon;

  els.summaryBase.textContent = formatIDR(basePrice);

  if (addon > 0) {
    els.summaryAddon.textContent = formatIDR(addon);
    els.summaryAddonRow.classList.remove('hidden');
  } else {
    els.summaryAddonRow.classList.add('hidden');
  }

  els.summaryTotal.textContent = formatIDR(total);
}

els.whatsappRsvp.addEventListener('change', recalculate);

// ============================================================
// UI helpers
// ============================================================
function showError(msg) {
  els.formError.textContent = msg;
  els.formError.classList.remove('hidden');
}
function clearError() {
  els.formError.classList.add('hidden');
  els.formError.textContent = '';
}
function showStatus(msg) {
  els.formStatus.textContent = msg;
  els.formStatus.classList.remove('hidden');
}
function clearStatus() {
  els.formStatus.classList.add('hidden');
  els.formStatus.textContent = '';
}
function setLoading(loading) {
  els.payBtn.disabled = loading;
  els.payBtn.textContent = loading ? 'Generating QRIS...' : 'Pay Now with QRIS';
}

// ============================================================
// Edge function invoker
// ============================================================
async function invokeEdgeFunction(slug, body) {
  const url = `${SUPABASE_URL}/functions/v1/${slug}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  return resp;
}

// ============================================================
// Form submit → checkout
// ============================================================
els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  clearStatus();

  if (!selectedProduct) {
    showError('Please choose an invitation design first.');
    return;
  }
  if (!els.groomName.value.trim() || !els.brideName.value.trim()) {
    showError('Please enter both the groom and bride names.');
    return;
  }
  if (!els.eventDate.value || Number.isNaN(Date.parse(els.eventDate.value))) {
    showError('Please select a valid event date.');
    return;
  }
  if (!els.customerEmail.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(els.customerEmail.value.trim())) {
    showError('Please enter a valid email. Your invoice will be sent there.');
    return;
  }
  if (!els.customerPhone.value.trim()) {
    showError('Please enter your WhatsApp number.');
    return;
  }

  const payload = {
    product_id: selectedProduct.id,
    product_name: selectedProduct.name,
    base_price: selectedProduct.price,
    is_custom: selectedProduct.is_custom,
    groom_name: els.groomName.value.trim(),
    bride_name: els.brideName.value.trim(),
    event_date: els.eventDate.value,
    venue_url: els.venueUrl.value.trim(),
    whatsapp_rsvp: els.whatsappRsvp.checked,
    customer_email: els.customerEmail.value.trim(),
    customer_phone: els.customerPhone.value.trim(),
  };

  setLoading(true);

  try {
    const resp = await invokeEdgeFunction('checkout-qris', payload);

    if (!resp.ok) {
      let detail = 'Checkout failed. Please try again.';
      try {
        const err = await resp.json();
        detail = (err.details && err.details.join) ? err.details.join(', ') : (err.error || detail);
      } catch (_) {}
      showError(detail);
      return;
    }

    const data = await resp.json();

    if (!data.qr_code_url && !data.qr_string) {
      showError('The payment gateway did not return a QR code. Please try again.');
      return;
    }

    currentOrderId = data.order_id;
    renderQris(data);
    startCountdown(data.expires_at);
    startPolling(data.order_id);
  } catch (err) {
    showError('Network error. Please check your connection and try again.');
  } finally {
    setLoading(false);
  }
});

// ============================================================
// Render QRIS
// ============================================================
function renderQris(data) {
  els.qrisContainer.classList.remove('hidden');
  els.paymentSuccess.classList.add('hidden');
  els.countdownWrap.classList.remove('hidden');

  if (data.qr_code_url) {
    els.qrisImage.src = data.qr_code_url;
    els.qrisImage.classList.remove('hidden');

    els.qrisUrlLink.href = data.qr_code_url;
    els.qrisUrlLink.classList.remove('hidden');

    els.copyQrisBtn.dataset.url = data.qr_code_url;
    els.copyQrisBtn.textContent = 'Copy QR Link';
    els.copyQrisBtn.classList.remove('hidden');
  } else {
    els.qrisUrlLink.classList.add('hidden');
    els.copyQrisBtn.classList.add('hidden');
  }

  els.qrisOrderId.textContent = 'Order ID: ' + data.order_id;
  els.qrisContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showStatus('QRIS generated. Please complete payment within 15 minutes.');
}

// ============================================================
// Countdown
// ============================================================
function startCountdown(expiresAtIso) {
  const expiry = new Date(expiresAtIso).getTime();
  clearInterval(countdownInterval);
  els.countdownTimer.classList.remove('text-red-600');

  const tick = () => {
    const remaining = expiry - Date.now();
    if (remaining <= 0) {
      els.countdownTimer.textContent = '00:00';
      els.countdownTimer.classList.add('text-red-600');
      clearInterval(countdownInterval);
      showStatus('The payment window has expired. Checking final status...');
      // Beri waktu 30 detik untuk notifikasi yang terlambat, lalu berhenti
      setTimeout(() => {
        clearInterval(pollInterval);
        if (els.paymentSuccess.classList.contains('hidden')) {
          showStatus('The payment window has expired. Please start a new order.');
        }
      }, 30000);
      return;
    }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    els.countdownTimer.textContent =
      String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  };

  tick();
  countdownInterval = setInterval(tick, 1000);
}

// ============================================================
// Status polling (via get_order_status(); anon tidak punya akses
// langsung ke tabel orders)
// ============================================================
let pollBusy = false;
const FAILED_STATUSES = ['expire', 'cancel', 'deny', 'failure', 'failed'];

function showPaid(order) {
  clearInterval(pollInterval);
  clearInterval(countdownInterval);

  // Sembunyikan kartu QR supaya tidak dibayar dua kali
  els.qrisImage.parentElement.classList.add('hidden');
  els.paymentSuccess.classList.remove('hidden');

  if (order.invitation_link) {
    els.invitationLink.href = order.invitation_link;
    els.invitationLink.classList.remove('hidden');
  } else {
    els.invitationLink.classList.add('hidden');
  }

  const invoiceUrl = `${window.location.origin}/invoice.html?o=${encodeURIComponent(currentOrderId)}`;
    els.invoiceLink.href = invoiceUrl;
    els.waInvoiceBtn.href =
    'https://wa.me/?text=' +
    encodeURIComponent(
      `Invoice Hiivite ${currentOrderId}\n${invoiceUrl}` +
      (order.invitation_link ? `\n\nUndangan: ${order.invitation_link}` : '')
    );

  els.payBtn.disabled = true;
  els.payBtn.textContent = 'Payment Completed';
  clearError();
  clearStatus();
  els.paymentSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showFailed(status) {
  clearInterval(pollInterval);
  clearInterval(countdownInterval);

  els.qrisImage.parentElement.classList.add('hidden');
  els.payBtn.disabled = false;
  els.payBtn.textContent = 'Pay Now with QRIS';

  const msg = status === 'expire'
    ? 'The payment window has expired. Please start a new order.'
    : 'The payment was not completed. Please start a new order.';
  showError(msg);
}

async function checkOrderStatus(orderId) {
  if (pollBusy || !orderId) return;
  pollBusy = true;
  try {
    const { data, error } = await supabase.rpc('get_order_status', {
      p_order_id: orderId,
    });
    if (error || !data || data.length === 0) return;

    const order = data[0];
    if (order.status === 'settlement') showPaid(order);
    else if (FAILED_STATUSES.includes(order.status)) showFailed(order.status);
  } catch (_) {
    // lanjut polling tanpa suara
  } finally {
    pollBusy = false;
  }
}

function startPolling(orderId) {
  clearInterval(pollInterval);
  checkOrderStatus(orderId);
  pollInterval = setInterval(() => checkOrderStatus(orderId), 3000);
}

// Pembeli kembali dari aplikasi e-wallet: cek status saat itu juga
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentOrderId) {
    checkOrderStatus(currentOrderId);
  }
});
window.addEventListener('focus', () => {
  if (currentOrderId) checkOrderStatus(currentOrderId);
});


const DEV_WHATSAPP = '6281316065637';

function buildCustomWaUrl(productName) {
  const text = productName
    ? `Hello, I'm interested in the custom invitation "${productName}" from Hiivite.`
    : "Hello, I'm interested in a custom wedding invitation from Hiivite.";
  return `https://wa.me/${DEV_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

els.copyQrisBtn.addEventListener('click', async () => {
  const url = els.copyQrisBtn.dataset.url;
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
  } catch (_) {
    // Cadangan untuk browser yang menolak clipboard API
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  els.copyQrisBtn.textContent = 'Copied!';
  setTimeout(() => { els.copyQrisBtn.textContent = 'Copy QR Link'; }, 2000);
});

// ============================================================
// Init
// ============================================================
loadProducts();
recalculate();