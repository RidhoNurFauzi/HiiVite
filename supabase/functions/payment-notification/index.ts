import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY") ?? "";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
const BREVO_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM_EMAIL") ?? "";
const MAIL_NAME = Deno.env.get("MAIL_FROM_NAME") ?? "Hiivite";
const FONNTE = Deno.env.get("FONNTE_TOKEN") ?? "";
const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TG_CHAT = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";
const DEV_WA = Deno.env.get("DEV_WHATSAPP") ?? "6281316065637";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const ok = (body: unknown = { ok: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sha512(text: string) {
  const buf = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const rupiah = (n: unknown) => "IDR " + Number(n).toLocaleString("id-ID");

function normPhone(p: string) {
  const d = String(p).replace(/\D/g, "");
  if (d.startsWith("62")) return d;
  if (d.startsWith("0")) return "62" + d.slice(1);
  if (d.startsWith("8")) return "62" + d;
  return d;
}

// ---------- Pengirim ----------
async function sendEmail(to: string, subject: string, html: string) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: MAIL_NAME, email: MAIL_FROM },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!r.ok) throw new Error(`brevo ${r.status}: ${await r.text()}`);
}

async function sendWhatsApp(phone: string, message: string) {
  const form = new FormData();
  form.append("target", normPhone(phone));
  form.append("message", message);
  const r = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: FONNTE },
    body: form,
  });
  if (!r.ok) throw new Error(`fonnte ${r.status}`);
}

async function notifyOwner(text: string) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text }),
    });
  } catch (e) {
    console.error("[payment-notification] telegram:", (e as Error).message);
  }
}

// ---------- Isi pesan ----------
function invoiceHtml(o: any, productName: string, invoiceUrl: string | null, inviteUrl: string | null) {
  const paid = new Date(o.paid_at).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short",
  });
  const who = o.category === "greeting_card"
    ? `${esc(o.sender_name)} → ${esc(o.recipient_name)}`
    : `${esc(o.groom_name)} &amp; ${esc(o.bride_name)}`;
  const td = "padding:10px 0;border-bottom:1px solid #eee;font-size:14px;";
  const addon = Number(o.addon_price) > 0
    ? `<tr><td style="${td}">WhatsApp RSVP Add-on</td><td style="${td}text-align:right;">${rupiah(o.addon_price)}</td></tr>` : "";
  const btn = (href: string, label: string) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:6px 6px 0 0;padding:12px 22px;background:#2A2420;color:#fff;text-decoration:none;border-radius:999px;font-size:13px;">${label}</a>`;

  return `<!doctype html><html><body style="margin:0;background:#FBF8F3;font-family:Arial,sans-serif;color:#2A2420;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <h1 style="font-family:Georgia,serif;letter-spacing:4px;font-size:22px;margin:0 0 4px;">HIIVITE</h1>
    <p style="margin:0 0 24px;color:#857B71;font-size:13px;">Invoice pembelian</p>
    <div style="background:#fff;border:1px solid #efe6d8;border-radius:12px;padding:24px;">
      <p style="margin:0;font-size:12px;color:#857B71;">No. Invoice</p>
      <p style="margin:0 0 16px;font-weight:bold;">${esc(o.order_id)}</p>
      <p style="margin:0;font-size:12px;color:#857B71;">Dibayar pada</p>
      <p style="margin:0 0 16px;">${esc(paid)} WIB &nbsp;<strong style="color:#15803d;">LUNAS</strong></p>
      <p style="margin:0;font-size:12px;color:#857B71;">Atas nama</p>
      <p style="margin:0 0 20px;">${who}</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="${td}">${esc(productName)}</td><td style="${td}text-align:right;">${rupiah(o.base_price)}</td></tr>
        ${addon}
        <tr><td style="padding:14px 0;font-weight:bold;">Total</td><td style="padding:14px 0;text-align:right;font-weight:bold;font-size:18px;">${rupiah(o.total_price)}</td></tr>
      </table>
    </div>
    <p style="margin:24px 0 0;">
      ${inviteUrl ? btn(inviteUrl, "Buka Undangan") : ""}
      ${invoiceUrl ? btn(invoiceUrl, "Lihat / Cetak Invoice") : ""}
    </p>
    <p style="margin:24px 0 0;font-size:12px;color:#857B71;line-height:1.6;">
      Simpan email ini sebagai bukti pembelian. Butuh revisi atau bantuan? Hubungi kami di WhatsApp
      <a href="https://wa.me/${esc(DEV_WA)}?text=${encodeURIComponent("Halo, saya butuh bantuan untuk pesanan " + o.order_id)}">+${esc(DEV_WA)}</a>
      dengan menyebut No. Invoice di atas.
    </p>
  </div></body></html>`;
}

function invoiceText(o: any, productName: string, invoiceUrl: string | null, inviteUrl: string | null) {
  return [
    "*HIIVITE - Pembayaran Berhasil* ✅",
    `No. Invoice: ${o.order_id}`,
    `Produk: ${productName}`,
    `Total: ${rupiah(o.total_price)} (LUNAS)`,
    inviteUrl ? `\nUndangan Anda:\n${inviteUrl}` : "",
    invoiceUrl ? `\nInvoice:\n${invoiceUrl}` : "",
    "\nSimpan pesan ini sebagai bukti pembelian.",
  ].filter(Boolean).join("\n");
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method !== "POST") return ok({ error: "Method not allowed." }, 405);

  let n: Record<string, string>;
  try { n = await req.json(); } catch { return ok({ error: "Invalid body." }, 400); }

  const { order_id, status_code, gross_amount, signature_key, transaction_status } = n;
  if (!order_id || !status_code || !gross_amount || !signature_key) return ok({ error: "Missing fields." }, 400);

  const expected = await sha512(`${order_id}${status_code}${gross_amount}${SERVER_KEY}`);
  if (!safeEqual(expected, String(signature_key))) {
    console.error("[payment-notification] invalid signature for", order_id);
    return ok({ error: "Invalid signature." }, 403);
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("*, products(name, template_url)")
    .eq("order_id", order_id)
    .maybeSingle();
  if (error || !order) return ok({ ok: true, ignored: "order not found" });

  const isPaid = transaction_status === "settlement" || transaction_status === "capture";

  // Pesanan lunas tidak boleh diturunkan statusnya
  if (order.status === "settlement" && !isPaid) return ok();

  if (Number(gross_amount) !== Number(order.total_price)) {
    console.error("[payment-notification] amount mismatch for", order_id);
    return ok({ error: "Amount mismatch." }, 400);
  }

  if (!isPaid) {
    if (["expire", "cancel", "deny", "failure"].includes(transaction_status)) {
      await supabase.from("orders").update({ status: transaction_status }).eq("order_id", order_id);
    }
    return ok();
  }

  const product = Array.isArray(order.products) ? order.products[0] : order.products;
  const productName = product?.name ?? "Hiivite";
  const inviteUrl = SITE_URL && product?.template_url ? `${SITE_URL}${product.template_url}?o=${order_id}` : null;
  const invoiceUrl = SITE_URL ? `${SITE_URL}/invoice.html?o=${order_id}` : null;
  const paidAt = order.paid_at ?? new Date().toISOString();

  if (order.status !== "settlement") {
    const { error: updErr } = await supabase
      .from("orders")
      .update({ status: "settlement", paid_at: paidAt, invitation_link: inviteUrl })
      .eq("order_id", order_id);
    if (updErr) {
      console.error("[payment-notification] update failed:", updErr.message);
      return ok({ error: "Update failed." }, 500); // Midtrans akan mengulang
    }
  }

  // Klaim pengiriman: hanya satu notifikasi yang boleh mengirim invoice
  const { data: claimed } = await supabase
    .from("orders")
    .update({ invoice_sent_at: new Date().toISOString() })
    .eq("order_id", order_id)
    .is("invoice_sent_at", null)
    .select("order_id");
  if (!claimed || claimed.length === 0) return ok();

  const full = { ...order, paid_at: paidAt };
  let emailFailed = false;

  if (order.customer_email && BREVO_KEY && MAIL_FROM) {
    try {
      await sendEmail(
        order.customer_email,
        `Invoice ${order_id} - Pembayaran Berhasil`,
        invoiceHtml(full, productName, invoiceUrl, inviteUrl)
      );
    } catch (e) {
      emailFailed = true;
      console.error("[payment-notification] email failed:", (e as Error).message);
    }
  }

  if (FONNTE && order.customer_phone) {
    try {
      await sendWhatsApp(order.customer_phone, invoiceText(full, productName, invoiceUrl, inviteUrl));
    } catch (e) {
      console.error("[payment-notification] whatsapp failed:", (e as Error).message);
    }
  }

  const detail = order.category === "greeting_card"
    ? `Kartu: ${order.sender_name} → ${order.recipient_name}`
    : `Undangan: ${order.groom_name} & ${order.bride_name} (${order.event_date})`;
  await notifyOwner(
    `💰 Pesanan LUNAS\nID: ${order_id}\nProduk: ${productName}\nTotal: ${rupiah(order.total_price)}\n${detail}\n` +
    `Email: ${order.customer_email ?? "-"}\nHP: ${order.customer_phone ?? "-"}` +
    (emailFailed ? "\n⚠️ Email invoice GAGAL terkirim" : "")
  );

  if (emailFailed) {
    // Lepas klaim supaya percobaan ulang dari Midtrans bisa mengirim lagi
    await supabase.from("orders").update({ invoice_sent_at: null }).eq("order_id", order_id);
    return ok({ error: "Email failed." }, 500);
  }
  return ok();
});