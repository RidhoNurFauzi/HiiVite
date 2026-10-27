import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });

  const o = new URL(req.url).searchParams.get("o") ?? "";
  if (!/^HV-[A-Z0-9]{16}$/.test(o)) return json(400, { error: "invalid_order" });

  const { data, error } = await supabase
    .from("orders")
    .select(
      "order_id, status, category, groom_name, bride_name, event_date, venue_url, whatsapp_rsvp, " +
      "bride_photo_url, groom_photo_url, gallery_urls, background_music_url, " +
      "recipient_name, sender_name, occasion, card_message, " +
      "base_price, addon_price, total_price, paid_at, invitation_link, products(name)"
    )
    .eq("order_id", o)
    .maybeSingle();

  // Belum lunas / tidak ada: jawaban sama supaya tidak bisa ditebak
  if (error || !data || data.status !== "settlement") return json(404, { error: "not_found" });

  const p = Array.isArray(data.products) ? data.products[0] : data.products;
  const { products: _p, status: _s, ...safe } = data as Record<string, unknown>;
  return json(200, { ...safe, product_name: p?.name ?? "Hiivite" });
});