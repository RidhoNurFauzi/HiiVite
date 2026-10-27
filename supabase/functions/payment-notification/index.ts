// ============================================================
// Edge Function: payment-notification (webhook Midtrans)
// - Verifikasi signature_key (SHA512)
// - Cocokkan nominal dengan data di database
// - Update status pesanan, isi invitation_link saat lunas
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY") ?? "";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const ok = (body: unknown = { ok: true }, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function sha512(text: string) {
  const buf = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Perbandingan waktu-konstan
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok({ error: "Method not allowed." }, 405);

  let n: Record<string, string>;
  try {
    n = await req.json();
  } catch {
    return ok({ error: "Invalid body." }, 400);
  }

  const { order_id, status_code, gross_amount, signature_key, transaction_status } = n;
  if (!order_id || !status_code || !gross_amount || !signature_key) {
    return ok({ error: "Missing fields." }, 400);
  }

  // 1. Verifikasi signature
  const expected = await sha512(`${order_id}${status_code}${gross_amount}${SERVER_KEY}`);
  if (!safeEqual(expected, String(signature_key))) {
    console.error("[payment-notification] invalid signature for", order_id);
    return ok({ error: "Invalid signature." }, 403);
  }

  // 2. Ambil pesanan
  const { data: order, error } = await supabase
    .from("orders")
    .select("order_id, status, total_price")
    .eq("order_id", order_id)
    .maybeSingle();

  if (error || !order) {
    console.error("[payment-notification] order not found:", order_id);
    return ok({ ok: true, ignored: "order not found" });
  }

  // Sudah lunas: abaikan notifikasi berikutnya (idempoten)
  if (order.status === "settlement") return ok();

  // 3. Cocokkan nominal
  if (Number(gross_amount) !== Number(order.total_price)) {
    console.error("[payment-notification] amount mismatch for", order_id);
    return ok({ error: "Amount mismatch." }, 400);
  }

  // 4. Tentukan status baru
  if (transaction_status === "settlement" || transaction_status === "capture") {
    const { error: updErr } = await supabase
      .from("orders")
      .update({
        status: "settlement",
        paid_at: new Date().toISOString(),
        invitation_link: SITE_URL ? `${SITE_URL}/invitation.html?o=${order_id}` : null,
      })
      .eq("order_id", order_id);

    if (updErr) {
      console.error("[payment-notification] update failed:", updErr.message);
      return ok({ error: "Update failed." }, 500); // Midtrans akan mencoba lagi
    }
  } else if (["expire", "cancel", "deny", "failure"].includes(transaction_status)) {
    await supabase.from("orders").update({ status: transaction_status }).eq("order_id", order_id);
  }
  // status "pending" tidak perlu diubah

  return ok();
});