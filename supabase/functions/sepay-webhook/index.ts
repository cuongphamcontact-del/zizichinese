// ============================================================================
//  sepay-webhook  —  SePay báo "tiền đã về" → tự kích hoạt học viên
// ----------------------------------------------------------------------------
//  Đây là trái tim của luồng "thanh toán trước, cấp tài khoản sau":
//    1. SePay gọi hàm này mỗi khi có tiền chuyển vào tài khoản ngân hàng.
//    2. Hàm khớp giao dịch với đơn 'pending' qua NỘI DUNG chuyển khoản (mã đơn)
//       và SỐ TIỀN.
//    3. Đổi đơn sang 'paid', TẠO TÀI KHOẢN học viên (mật khẩu ngẫu nhiên),
//       cấp quyền học (enrollment), rồi GỬI EMAIL thông tin đăng nhập.
//
//  Bảo mật:
//    - SERVICE_ROLE + mọi khoá bí mật chỉ nằm ở đây (biến môi trường máy chủ),
//      KHÔNG BAO GIỜ lộ ra code trình duyệt.
//    - Xác thực SePay bằng header  Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>.
//
//  Deploy:  supabase functions deploy sepay-webhook --no-verify-jwt
//  Secrets cần set (xem docs/setup-sepay.md):
//    SUPABASE_SERVICE_ROLE_KEY, SEPAY_WEBHOOK_API_KEY, RESEND_API_KEY,
//    MAIL_FROM (vd 'ZiZi Chinese <no-reply@zizichinese.com>'), SITE_URL
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_KEY = Deno.env.get("SEPAY_WEBHOOK_API_KEY") || "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") || "ZiZi Chinese <onboarding@resend.dev>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://zizichinese.com";

function genPassword() {
  // Mật khẩu dễ gõ nhưng đủ mạnh: 3 chữ + 4 số, vd "ziziK7m3x9"
  const a = "abcdefghijkmnpqrstuvwxyz";
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const d = "23456789";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  return "Zi" + pick(A) + pick(a) + pick(a) + pick(d) + pick(d) + pick(a) + pick(d) + pick(d);
}

async function sendMail(to: string, subject: string, html: string, log: (n: string) => void) {
  if (!RESEND_KEY) { log("no_resend_key:mail_skipped"); return; }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to, subject, html }),
    });
    if (!r.ok) log("mail_fail:" + r.status + ":" + (await r.text()).slice(0, 120));
    else log("mail_sent");
  } catch (e) { log("mail_err:" + String(e).slice(0, 120)); }
}

function credEmail(name: string, email: string, pass: string, course: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#243b36">
    <div style="background:#1aa88e;color:#fff;padding:22px;border-radius:14px 14px 0 0">
      <h2 style="margin:0">ZiZi Chinese · 字字</h2></div>
    <div style="border:1px solid #e4efe9;border-top:none;padding:24px;border-radius:0 0 14px 14px">
      <p>Chào ${name || "bạn"}, cảm ơn bạn đã mua <b>${course}</b>! 🎉</p>
      <p>Tài khoản học của bạn đã được <b>kích hoạt tự động</b>. Thông tin đăng nhập:</p>
      <table style="background:#f2faf8;border-radius:10px;padding:14px;width:100%;margin:12px 0">
        <tr><td style="padding:6px 10px;color:#5b726b">Email</td><td style="padding:6px 10px"><b>${email}</b></td></tr>
        <tr><td style="padding:6px 10px;color:#5b726b">Mật khẩu</td><td style="padding:6px 10px"><b>${pass}</b></td></tr>
      </table>
      <p style="text-align:center;margin:22px 0">
        <a href="${SITE_URL}/#dang-nhap" style="background:#1aa88e;color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:700">Đăng nhập & vào học →</a>
      </p>
      <p style="font-size:13px;color:#5b726b">Vì bảo mật, bạn nên đổi mật khẩu sau khi đăng nhập lần đầu. Nếu cần hỗ trợ, trả lời email này nhé.</p>
    </div></div>`;
}

function unlockEmail(name: string, email: string, course: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#243b36">
    <div style="background:#1aa88e;color:#fff;padding:22px;border-radius:14px 14px 0 0">
      <h2 style="margin:0">ZiZi Chinese · 字字</h2></div>
    <div style="border:1px solid #e4efe9;border-top:none;padding:24px;border-radius:0 0 14px 14px">
      <p>Chào ${name || "bạn"}, bạn vừa mở khoá thành công <b>${course}</b>! 🎉</p>
      <p>Khoá học đã được thêm vào tài khoản <b>${email}</b> sẵn có của bạn. Đăng nhập như bình thường để vào học:</p>
      <p style="text-align:center;margin:22px 0">
        <a href="${SITE_URL}/#dang-nhap" style="background:#1aa88e;color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:700">Đăng nhập & vào học →</a></p>
      <p style="font-size:13px;color:#5b726b">Quên mật khẩu? Dùng "Quên mật khẩu" ở trang đăng nhập. Cần hỗ trợ, trả lời email này hé.</p>
    </div></div>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const notes: string[] = [];
  const log = (n: string) => notes.push(n);
  let payload: any = {};
  let matched: string | null = null;

  try {
    // --- Xác thực SePay: Authorization: Apikey <key> ---
    const auth = req.headers.get("authorization") || "";
    const presented = auth.replace(/^Apikey\s+/i, "").replace(/^Bearer\s+/i, "").trim();
    if (WEBHOOK_KEY && presented !== WEBHOOK_KEY) {
      return new Response(JSON.stringify({ success: false, error: "unauthorized" }), { status: 401 });
    }

    payload = await req.json().catch(() => ({}));
    // SePay: { id, transferType:'in', transferAmount, content, code, referenceCode, gateway, ... }
    const type = payload.transferType || payload.transfer_type;
    const amount = Number(payload.transferAmount ?? payload.amount ?? 0);
    const content = String(payload.content ?? payload.description ?? "");
    // Chống xử lý trùng: dùng id giao dịch SePay (ổn định qua các lần gửi lại;
    // referenceCode có thể rỗng nên KHÔNG dùng làm khoá chính).
    const txnId = String(payload.id ?? payload.referenceCode ?? "") || null;

    if (type && type !== "in") { log("skip:not_incoming"); throw { soft: true }; }

    // --- Tìm mã đơn: ưu tiên field 'code' SePay đã tách, sau đó regex trong nội dung ---
    let orderCode = String(payload.code || "").toUpperCase().trim();
    if (!/^ZIZI[A-Z0-9]{4,8}$/.test(orderCode)) {
      const m = content.toUpperCase().match(/ZIZI[A-Z0-9]{4,8}/);
      orderCode = m ? m[0] : "";
    }
    if (!orderCode) { log("no_order_code_in_content"); throw { soft: true }; }

    // --- Idempotency: giao dịch này xử lý rồi? ---
    if (txnId) {
      const { data: dup } = await sb.from("orders").select("id,status").eq("sepay_txn_id", txnId).maybeSingle();
      if (dup) { matched = dup.id; log("already_processed:" + txnId); throw { soft: true }; }
    }

    // --- Lấy đơn 'pending' theo mã ---
    const { data: order } = await sb.from("orders")
      .select("id,code,status,amount,customer_email,customer_name,product_id,variant,items")
      .eq("code", orderCode).maybeSingle();
    if (!order) { log("order_not_found:" + orderCode); throw { soft: true }; }
    matched = order.id;
    if (order.status === "paid") { log("order_already_paid"); throw { soft: true }; }

    // --- Kiểm số tiền: phải >= số tiền đơn hàng ---
    if (amount < order.amount) {
      await sb.from("orders").update({ status: "review" }).eq("id", order.id);
      log(`underpaid:${amount}<${order.amount}`); throw { soft: true };
    }

    const email = String(order.customer_email || "").toLowerCase();
    const fullName = order.customer_name || "";

    // --- Tạo / tìm tài khoản học viên ---
    let userId: string | null = null;
    let newPass: string | null = null;
    if (email) {
      newPass = genPassword();
      const { data: created, error: cErr } = await sb.auth.admin.createUser({
        email, password: newPass, email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (created?.user) {
        userId = created.user.id; log("user_created");
      } else {
        // Đã có tài khoản → không đổi mật khẩu, chỉ tìm id qua bảng profiles
        newPass = null;
        log("user_exists:" + String(cErr?.message || "").slice(0, 60));
        const { data: prof } = await sb.from("profiles").select("id").eq("email", email).maybeSingle();
        userId = prof?.id || null;
      }
    }

    // --- Đánh dấu đơn đã thanh toán ---
    await sb.from("orders").update({
      status: "paid", paid_at: new Date().toISOString(),
      sepay_txn_id: txnId, user_id: userId,
    }).eq("id", order.id);
    log("order_paid");

    // --- Danh sách món trong đơn (giỏ hàng) ---
    const items = (Array.isArray(order.items) && order.items.length)
      ? order.items
      : [{ product_id: order.product_id, variant: order.variant, name: null }];

    // --- Cấp quyền học cho TẤT CẢ món (trừ bản cứng = chỉ giao hàng) ---
    let enrolledCount = 0;
    if (userId) {
      for (const it of items) {
        if (!it.product_id || it.variant === "hard") continue;
        const { error: eErr } = await sb.from("enrollments").upsert(
          { user_id: userId, product_id: it.product_id, order_id: order.id, granted_by: "purchase" },
          { onConflict: "user_id,product_id", ignoreDuplicates: true },
        );
        if (!eErr) enrolledCount++;
      }
      log("enrolled:" + enrolledCount);
    }

    // --- Tên khoá cho email ---
    let course = "khoá học ZiZi";
    const names = items.map((i: any) => i.name).filter(Boolean);
    if (names.length) course = names.length > 1 ? (names[0] + ` +${names.length - 1} khoá khác`) : names[0];
    else {
      const { data: prod } = await sb.from("products").select("name").eq("id", order.product_id).maybeSingle();
      if (prod?.name) course = prod.name;
    }
    if (email) {
      if (newPass) await sendMail(email, `✅ Tài khoản học "${course}" đã sẵn sàng`, credEmail(fullName, email, newPass, course), log);
      else await sendMail(email, `✅ Đã mở khoá "${course}" cho tài khoản của bạn`, unlockEmail(fullName, email, course), log);
    }

    await sb.from("webhook_logs").insert({ provider: "sepay", payload, matched_order: matched, note: notes.join("; ") });
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    // 'soft' = trường hợp đã xử lý xong/bỏ qua hợp lệ → vẫn trả 200 để SePay không gọi lại mãi
    const soft = e && e.soft;
    try { await sb.from("webhook_logs").insert({ provider: "sepay", payload, matched_order: matched, note: notes.join("; ") + (soft ? "" : "; ERR:" + String(e).slice(0, 160)) }); } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ success: soft ? true : false }), {
      status: soft ? 200 : 500, headers: { "Content-Type": "application/json" },
    });
  }
});
