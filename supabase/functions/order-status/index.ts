// ============================================================================
//  order-status  —  Trình duyệt hỏi "đơn này đã thanh toán chưa?"
// ----------------------------------------------------------------------------
//  Trang thanh toán gọi hàm này vài giây/lần. Khi SePay báo tiền về,
//  sepay-webhook đã đổi status → 'paid', nên hàm này trả 'paid' và trang
//  sẽ hiện màn hình "đã kích hoạt, kiểm tra email".
//  Chỉ trả về tối thiểu (status) theo mã đơn — không lộ thông tin khách.
//  Deploy:  supabase functions deploy order-status --no-verify-jwt
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors, ...extra },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const code = (url.searchParams.get("code") || "").trim().toUpperCase();
    if (!code) return json({ error: "code_required" }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await sb
      .from("orders")
      .select("status,variant")
      .eq("code", code)
      .maybeSingle();

    if (error) return json({ error: "server", message: error.message }, 500);
    if (!data) return json({ error: "not_found" }, 404);

    return json({ ok: true, status: data.status, variant: data.variant });
  } catch (e) {
    return json({ error: "server", message: String(e) }, 500);
  }
});
