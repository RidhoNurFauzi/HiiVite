(function () {
  var API = 'https://dfzfdctinntceledejds.supabase.co/functions/v1/get-invitation';
  var params = new URLSearchParams(location.search);
  var orderId = params.get('o');
  var SAMPLE = { groom_name: 'Raka Pratama', bride_name: 'Andini Kirana', event_date: '2026-12-12', venue_url: '' };

  document.documentElement.style.visibility = 'hidden';

  var first = function (s) { return String(s || '').trim().split(/\s+/)[0]; };
  var pad = function (n) { return String(n).padStart(2, '0'); };

  function tokens(o) {
    var d = new Date(o.event_date + 'T12:00:00');
    var fmt = function (loc, opt) { return d.toLocaleDateString(loc, opt); };
    var gf = first(o.groom_name), bf = first(o.bride_name);
    return {
      groom: o.groom_name, bride: o.bride_name,
      groom_first: gf, bride_first: bf,
      initials: (bf[0] || '') + '&' + (gf[0] || ''),
      date_id: fmt('id-ID', { weekday: 'long' }) + ', ' + fmt('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      date_en: fmt('en-GB', { weekday: 'long' }) + ', ' + fmt('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      dd: pad(d.getDate()), mm: pad(d.getMonth() + 1), yyyy: String(d.getFullYear())
    };
  }

  function apply(o) {
    var t = tokens(o);
    window.INV = { eventISO: o.event_date + 'T08:00:00+07:00' };

    var sub = function (s) {
      return s.replace(/\{\{(\w+)\}\}/g, function (m, k) { return t[k] != null ? t[k] : m; });
    };

    document.title = sub(document.title);

    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var p = node.parentNode && node.parentNode.nodeName;
      if (p === 'SCRIPT' || p === 'STYLE') continue;
      if (node.nodeValue.indexOf('{{') > -1) node.nodeValue = sub(node.nodeValue);
    }
    document.querySelectorAll('[alt],[title]').forEach(function (el) {
      ['alt', 'title'].forEach(function (a) {
        var v = el.getAttribute(a);
        if (v && v.indexOf('{{') > -1) el.setAttribute(a, sub(v));
      });
    });

    if (/^https?:\/\//i.test(o.venue_url || '')) {
      document.querySelectorAll('a[href*="maps.google.com"]').forEach(function (a) {
        a.href = o.venue_url; a.target = '_blank'; a.rel = 'noopener';
      });
    }

    // Nama tamu dari ?to=Nama
    var guest = params.get('to');
    var g = document.getElementById('guestName');
    if (guest && g) g.textContent = guest;

    // Bagian yang masih data contoh (rekening, dll) dibuang pada undangan asli
    if (orderId) document.querySelectorAll('[data-sample-only]').forEach(function (el) { el.remove(); });
  }

  function show() { document.documentElement.style.visibility = ''; }
  function fail() {
    document.body.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;text-align:center;padding:24px;background:#FBF8F3;color:#2A2420">' +
      '<div><h2 style="font-family:Georgia,serif">Undangan tidak ditemukan</h2>' +
      '<p style="color:#857B71">Link tidak valid atau pembayaran belum selesai.</p></div></div>';
    show();
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!orderId) { apply(SAMPLE); show(); return; }
    fetch(API + '?o=' + encodeURIComponent(orderId))
      .then(function (r) { if (!r.ok) throw new Error('nf'); return r.json(); })
      .then(function (o) { apply(o); show(); })
      .catch(fail);
  });
})();