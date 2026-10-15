// ============================================================================
//  create-order  —  Tạo đơn hàng THẬT + sinh mã VietQR động
// ----------------------------------------------------------------------------
//  Luồng: khách bấm "Tạo đơn & lấy mã thanh toán" trên zizichinese.com
//    → gọi hàm này → hàm tự đọc GIÁ THẬT của sản phẩm (không tin giá từ trình
//      duyệt), tạo đơn 'pending', trả về mã đơn + ảnh VietQR để khách quét.
//  Bảo mật: chạy bằng SERVICE_ROLE phía máy chủ (không lộ ra trình duyệt).
//  Deploy:  supabase functions deploy create-order --no-verify-jwt
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

function code6() {
  return "ZIZI" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const { slug, product_id, variant = "course", name = "", email = "", phone = "", address = "", source = "" } = body;
    const channel = (String(source || "web").trim() || "web").slice(0, 120);

    const mail = String(email).trim().toLowerCase();
    if (!mail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      return json({ error: "email_invalid", message: "Email không hợp lệ." }, 400);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) Lấy sản phẩm + GIÁ THẬT từ DB (không tin số tiền gửi từ trình duyệt)
    let q = sb.from("products").select("id,slug,name,type,price,hard_price,ship_fee,published").limit(1);
    q = product_id ? q.eq("id", product_id) : q.eq("slug", slug);
    const { data: prod, error: pErr } = await q.maybeSingle();
    if (pErr || !prod || prod.published === false) {
      return json({ error: "product_not_found", message: "Không tìm thấy sản phẩm." }, 404);
    }

    // 2) Tính số tiền + loại biến thể
    let amount = prod.price || 0;
    let ship = 0;
    let vr: "course" | "soft" | "hard" = "course";
    if (prod.type === "doc") {
      if (variant === "hard") {
        vr = "hard";
        amount = (prod.hard_price || prod.price || 0) + (prod.ship_fee || 0);
        ship = prod.ship_fee || 0;
      } else {
        vr = "soft";
        amount = prod.price || 0;
      }
    }

    // 3) Thông tin ngân hàng (admin điền ở Cài đặt → settings.bank_info)
    const { data: bankRow } = await sb.from("settings").select("value").eq("key", "bank_info").maybeSingle();
    const bank = (bankRow?.value || {}) as { bank?: string; account_no?: string; account_name?: string };
    if (!bank.bank || !bank.account_no) {
      return json({ error: "bank_not_configured", message: "Chưa cấu hình tài khoản ngân hàng nhận tiền." }, 503);
    }

    // 4) Tạo mã đơn duy nhất rồi insert đơn 'pending'
    let order: any = null;
    for (let i = 0; i < 5 && !order; i++) {
      const code = code6();
      const { data, error } = await sb.from("orders").insert({
        code,
        product_id: prod.id,
        customer_name: name || null,
        customer_email: mail,
        customer_phone: phone || null,
        shipping_address: vr === "hard" ? (address || null) : null,
        variant: vr,
        amount,
        ship_fee: ship,
        status: "pending",
        source: "auto",
        channel,
      }).select("id,code,amount").single();
      if (!error) order = data;
      else if (!String(error.message || "").includes("duplicate")) {
        return json({ error: "insert_failed", message: error.message }, 500);
      }
    }
    if (!order) return json({ error: "code_clash" }, 500);

    // 5) Dựng ảnh VietQR động (số tiền + nội dung = mã đơn đã nhúng sẵn)
    const acctName = encodeURIComponent(bank.account_name || "ZIZI CHINESE");
    const qr_url = `https://img.vietqr.io/image/${bank.bank}-${bank.account_no}-compact2.png` +
      `?amount=${order.amount}&addInfo=${order.code}&accountName=${acctName}`;

    return json({
      ok: true,
      code: order.code,
      amount: order.amount,
      qr_url,
      bank: { bank: bank.bank, account_no: bank.account_no, account_name: bank.account_name || "ZIZI CHINESE" },
      product: { name: prod.name, type: prod.type },
    });
  } catch (e) {
    return json({ error: "server", message: String(e) }, 500);
  }
});
