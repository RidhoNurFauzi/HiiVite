// ============================================================
// Edge Function: checkout-qris
// Mendukung undangan (invitation) dan kartu ucapan (greeting_card).
// Harga & kategori SELALU diambil dari database, bukan dari client.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY") ?? "";
const BASE_URL = (Deno.env.get("MIDTRANS_BASE_URL") ?? "https://api.sandbox.midtrans.com").replace(/\/$/, "");

const WHATSAPP_RSVP_PRICE = 50000;
const QRIS_EXPIRY_MINUTES = 15;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Order ID acak & sulit ditebak (dipakai frontend untuk cek status)
function buildOrderId() {
  return `HV-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
}

const str = (v: unknown) => (v ?? "").toString().trim();

function parseOrderPayload(body: Record<string, unknown>) {
  return {
    productId: str(body.product_id),
    customerEmail: str(body.customer_email),
    customerPhone: str(body.customer_phone),
    // undangan
    groomName: str(body.groom_name),
    brideName: str(body.bride_name),
    eventDate: str(body.event_date),
    venueUrl: str(body.venue_url),
    whatsappRsvp: !!body.whatsapp_rsvp,
    // kartu ucapan
    recipientName: str(body.recipient_name),
    senderName: str(body.sender_name),
    occasion: str(body.occasion),
    cardMessage: str(body.card_message),
  };
}

// Validasi tergantung kategori produk (kategori dari DB)
function validate(category: string, d: ReturnType<typeof parseOrderPayload>) {
  const errors: string[] = [];

  if (d.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.customerEmail)) {
    errors.push("Customer email is invalid.");
  }
  if (d.customerPhone && !/^[0-9+\-\s]{8,20}$/.test(d.customerPhone)) {
    errors.push("Customer phone is invalid.");
  }

  if (category === "greeting_card") {
    if (!d.recipientName) errors.push("Recipient name is required.");
    if (!d.senderName) errors.push("Sender name is required.");
    if (!d.cardMessage) errors.push("Card message is required.");
    if (d.cardMessage.length > 500) errors.push("Card message is too long (max 500 characters).");
  } else {
    if (!d.groomName) errors.push("Groom name is required.");
    if (!d.brideName) errors.push("Bride name is required.");
    if (!d.eventDate || Number.isNaN(Date.parse(d.eventDate))) errors.push("A valid event date is required.");
    if (d.venueUrl && !/^https?:\/\//i.test(d.venueUrl)) errors.push("Venue link must be a valid http(s) URL.");
  }
  return errors;
}

async function createQrisCharge(opts: {
  orderId: string;
  grossAmount: number;
  customer: { first_name: string; last_name: string; email: string; phone: string };
  itemDetails: { id: string; name: string; price: number; quantity: number }[];
}) {
  const resp = await fetch(`${BASE_URL}/v2/charge`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${SERVER_KEY}:`)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      payment_type: "gopay",
      transaction_details: { order_id: opts.orderId, gross_amount: opts.grossAmount },
      customer_details: opts.customer,
      item_details: opts.itemDetails,
      gopay: { enable_callback: true },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[checkout-qris] Midtrans ${resp.status}: ${text}`);
    throw new Error("MIDTRANS_CHARGE_FAILED");
  }
  return resp.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid request body." });
    }

    const d = parseOrderPayload(body);
    if (!d.productId) return json(400, { error: "Validation failed", details: ["A product selection is required."] });

    // Ambil produk dari DB: harga & kategori ditentukan server
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, price, category, is_custom")
      .eq("id", d.productId)
      .eq("is_active", true)
      .maybeSingle();

    if (productError || !product) return json(400, { error: "Selected product is not available." });

    // Produk custom tidak boleh dibayar lewat jalur ini (diarahkan ke WhatsApp)
    if (product.is_custom) {
      return json(400, { error: "Custom designs are arranged through WhatsApp." });
    }

    const category: string = product.category ?? "invitation";
    const errors = validate(category, d);
    if (errors.length) return json(400, { error: "Validation failed", details: errors });

    const isCard = category === "greeting_card";
    const basePrice = Number(product.price);
    // Add-on RSVP hanya untuk undangan
    const useRsvp = !isCard && d.whatsappRsvp;
    const addonPrice = useRsvp ? WHATSAPP_RSVP_PRICE : 0;
    const totalPrice = basePrice + addonPrice;

    const orderId = buildOrderId();
    const expiresAt = new Date(Date.now() + QRIS_EXPIRY_MINUTES * 60 * 1000).toISOString();

    const itemDetails = [
      { id: product.id.slice(0, 20), name: String(product.name).slice(0, 50), price: basePrice, quantity: 1 },
    ];
    if (useRsvp) {
      itemDetails.push({ id: "ADD-WA-RSVP", name: "WhatsApp RSVP Feature", price: WHATSAPP_RSVP_PRICE, quantity: 1 });
    }

    const { error: insertError } = await supabase.from("orders").insert({
      order_id: orderId,
      product_id: product.id,
      category,
      // undangan
      groom_name: isCard ? null : d.groomName,
      bride_name: isCard ? null : d.brideName,
      event_date: isCard ? null : d.eventDate,
      venue_url: isCard ? null : d.venueUrl || null,
      whatsapp_rsvp: useRsvp,
      // kartu ucapan
      recipient_name: isCard ? d.recipientName : null,
      sender_name: isCard ? d.senderName : null,
      occasion: isCard ? d.occasion || null : null,
      card_message: isCard ? d.cardMessage : null,
      // pembeli
      customer_email: d.customerEmail || null,
      customer_phone: d.customerPhone || null,
      // pembayaran
      base_price: basePrice,
      addon_price: addonPrice,
      total_price: totalPrice,
      status: "pending",
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error("[checkout-qris] DB insert failed:", insertError.message);
      return json(500, { error: "Could not create order record." });
    }

    let charge;
    try {
      charge = await createQrisCharge({
        orderId,
        grossAmount: totalPrice,
        customer: {
          first_name: (isCard ? d.senderName : d.groomName).slice(0, 255),
          last_name: (isCard ? d.recipientName : d.brideName).slice(0, 255),
          email: d.customerEmail || "no-reply@example.com",
          phone: d.customerPhone,
        },
        itemDetails,
      });
    } catch (err) {
      // Tandai pesanan gagal supaya tidak menggantung sebagai 'pending'
      await supabase.from("orders").update({ status: "failed" }).eq("order_id", orderId);
      throw err;
    }

    const qrAction = (charge.actions ?? []).find((a: { name: string }) => a.name === "generate-qr-code");
    const qrCodeUrl = qrAction ? qrAction.url : null;
    const qrString = charge.qr_string ?? null;
    const midtransTransactionId = charge.transaction_id ?? null;

    if (midtransTransactionId) {
      await supabase
        .from("orders")
        .update({ midtrans_transaction_id: midtransTransactionId, qr_code_url: qrCodeUrl })
        .eq("order_id", orderId);
    }

    return json(200, {
      order_id: orderId,
      total_price: totalPrice,
      qr_code_url: qrCodeUrl,
      qr_string: qrString,
      transaction_status: charge.transaction_status ?? "pending",
      expires_at: expiresAt,
    });
  } catch (err) {
    console.error("[checkout-qris] error:", (err as Error).message);
    return json(502, { error: "Payment gateway error. Please try again." });
  }
});