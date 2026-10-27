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
    const { name = "", email = "", phone = "", address = "", source = "" } = body;
    const channel = (String(source || "web").trim() || "web").slice(0, 120);
    // Dữ liệu đối sánh Facebook (để webhook gửi Purchase qua Conversions API)
    const fbp = String(body.fbp || "").slice(0, 200) || null;
    const fbc = String(body.fbc || "").slice(0, 300) || null;
    const event_source_url = String(body.event_source_url || "").slice(0, 400) || null;
    const client_ua = (req.headers.get("user-agent") || "").slice(0, 400) || null;
    const client_ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64) || null;

    const mail = String(email).trim().toLowerCase();
    if (!mail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      return json({ error: "email_invalid", message: "Email không hợp lệ." }, 400);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) Chuẩn hoá danh sách món: ưu tiên body.items (giỏ hàng), nếu không có → 1 món
    let reqItems: Array<{ slug?: string; product_id?: string; variant?: string; schedule?: string }> = [];
    if (Array.isArray(body.items) && body.items.length) {
      reqItems = body.items.map((it: any) => ({ slug: it.slug, product_id: it.product_id, variant: it.variant || "course", schedule: String(it.schedule || "").slice(0, 40) }));
    } else {
      reqItems = [{ slug: body.slug, product_id: body.product_id, variant: body.variant || "course", schedule: String(body.schedule || "").slice(0, 40) }];
    }
    if (reqItems.length > 20) reqItems = reqItems.slice(0, 20);

    // 2) Lấy GIÁ THẬT từ DB cho từng món (không tin số tiền gửi từ trình duyệt)
    let baseAmount = 0;
    let ship = 0;
    const itemsOut: any[] = [];
    for (const it of reqItems) {
      let q = sb.from("products").select("id,slug,name,type,price,hard_price,ship_fee,published").limit(1);
      q = it.product_id ? q.eq("id", it.product_id) : q.eq("slug", it.slug);
      const { data: prod } = await q.maybeSingle();
      if (!prod || prod.published === false) continue;
      let vr = "course", amt = prod.price || 0;
      if (prod.type === "doc") {
        if (it.variant === "hard") { vr = "hard"; amt = (prod.hard_price || prod.price || 0) + (prod.ship_fee || 0); ship += prod.ship_fee || 0; }
        else { vr = "soft"; amt = prod.price || 0; }
      }
      baseAmount += amt;
      itemsOut.push({ product_id: prod.id, name: prod.name, variant: vr, price: amt, type: prod.type, schedule: prod.type === "live" ? (it.schedule || "") : "" });
    }
    if (!itemsOut.length) return json({ error: "product_not_found", message: "Không có sản phẩm hợp lệ." }, 404);
    const hasHard = itemsOut.some((i) => i.variant === "hard");

    // 2b) Áp mã giảm giá (kiểm tra phía máy chủ)
    let amount = baseAmount;
    let discount = 0;
    let appliedCoupon: any = null;
    const couponCode = String(body.coupon || "").trim().toUpperCase();
    if (couponCode) {
      const { data: dc } = await sb.from("discounts").select("*").eq("code", couponCode).maybeSingle();
      const now = Date.now();
      if (!dc || dc.active === false) { /* bỏ qua: mã sai */ }
      else if (dc.expires_at && new Date(dc.expires_at).getTime() < now) { /* hết hạn */ }
      else if (dc.max_uses != null && dc.used_count >= dc.max_uses) { /* hết lượt */ }
      else if ((dc.min_amount || 0) > baseAmount) { /* chưa đạt đơn tối thiểu */ }
      else {
        discount = dc.kind === "amount" ? (dc.value || 0) : Math.round(baseAmount * (dc.value || 0) / 100);
        if (discount > baseAmount) discount = baseAmount;
        amount = Math.max(0, baseAmount - discount);
        appliedCoupon = dc;
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
        product_id: itemsOut[0].product_id,
        customer_name: name || null,
        customer_email: mail,
        customer_phone: phone || null,
        shipping_address: hasHard ? (address || null) : null,
        variant: itemsOut[0].variant,
        amount,
        ship_fee: ship,
        items: itemsOut,
        status: "pending",
        source: "auto",
        channel,
        fbp, fbc, client_ua, client_ip, event_source_url,
      }).select("id,code,amount").single();
      if (!error) order = data;
      else if (!String(error.message || "").includes("duplicate")) {
        return json({ error: "insert_failed", message: error.message }, 500);
      }
    }
    if (!order) return json({ error: "code_clash" }, 500);

    // 4b) Tăng lượt dùng mã (sau khi đã tạo đơn)
    if (appliedCoupon) {
      await sb.from("discounts").update({ used_count: (appliedCoupon.used_count || 0) + 1 }).eq("id", appliedCoupon.id);
    }

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
      product: { name: itemsOut.length > 1 ? (itemsOut[0].name + " +" + (itemsOut.length - 1) + " món") : itemsOut[0].name, type: itemsOut[0].type },
      items: itemsOut.map((i) => ({ name: i.name, price: i.price, variant: i.variant })),
      base_amount: baseAmount,
      discount,
      coupon: appliedCoupon ? { code: appliedCoupon.code, kind: appliedCoupon.kind, value: appliedCoupon.value } : null,
    });
  } catch (e) {
    return json({ error: "server", message: String(e) }, 500);
  }
});
