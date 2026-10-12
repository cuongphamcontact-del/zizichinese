// =====================================================================
// ZiZi Chinese — Edge Function nhận webhook SePay (chạy PHÍA MÁY CHỦ)
//
// Đây là nơi DUY NHẤT được dùng khóa bí mật:
//   - SEPAY_WEBHOOK_KEY          : API key bạn đặt trong SePay → Webhooks
//   - SUPABASE_SERVICE_ROLE_KEY  : Supabase tự cấp cho Edge Function
// Cả hai đọc từ biến môi trường (Deno.env), KHÔNG ghi vào code, KHÔNG
// bao giờ xuất hiện trong index.html / code trình duyệt.
//
// Cài đặt:
//   supabase secrets set SEPAY_WEBHOOK_KEY=<chuỗi ngẫu nhiên dài>
//   supabase functions deploy sepay-webhook --no-verify-jwt
// Trong SePay → Webhooks:
//   URL  : https://<project-ref>.supabase.co/functions/v1/sepay-webhook
//   Kiểu chứng thực: API Key  → SePay gửi header "Authorization: Apikey <key>"
//
// Lưu ý: kiểm tra lại tài liệu SePay mới nhất (định dạng payload/xác thực).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type SepayPayload = {
  id: number;                 // id giao dịch SePay
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  code?: string | null;       // mã thanh toán SePay tự nhận diện (nếu cấu hình)
  content?: string;           // nội dung chuyển khoản
  transferType?: "in" | "out";
  transferAmount?: number;
  referenceCode?: string;
  description?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// So sánh chuỗi thời gian hằng (tránh dò key theo thời gian phản hồi)
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) {
    diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return diff === 0;
}

// Tìm mã đơn trong nội dung CK. Ngân hàng hay bỏ dấu "-"/khoảng trắng,
// nên chấp nhận "ZIZI7K3P", "ZIZI 7K3P", "ZIZI-7K3P" và trả về phần đuôi.
function extractOrderSuffix(p: SepayPayload): string | null {
  const text = `${p.code ?? ""} ${p.content ?? ""} ${p.description ?? ""}`;
  const m = text.toUpperCase().match(/ZIZI[\s-]?([A-Z0-9]{4,8})/);
  return m ? m[1] : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ success: false, error: "method" }, 405);

  const expectedKey = Deno.env.get("SEPAY_WEBHOOK_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expectedKey || !supabaseUrl || !serviceKey) {
    console.error("Thiếu biến môi trường SEPAY_WEBHOOK_KEY / SUPABASE_*");
    return json({ success: false, error: "server_not_configured" }, 500);
  }

  // 1) Xác thực: từ chối mọi request không mang đúng API key của SePay
  const auth = req.headers.get("authorization") ?? "";
  const given = auth.replace(/^Apikey\s+/i, "").trim();
  if (!given || !safeEqual(given, expectedKey)) {
    return json({ success: false, error: "unauthorized" }, 401);
  }

  let p: SepayPayload;
  try {
    p = await req.json();
  } catch {
    return json({ success: false, error: "bad_json" }, 400);
  }
  if (!p || typeof p.id === "undefined") {
    return json({ success: false, error: "bad_payload" }, 400);
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const txnId = String(p.id);
  const log = (note: string, orderId: string | null = null) =>
    db.from("webhook_logs").insert({
      provider: "sepay",
      payload: p,
      matched_order: orderId,
      note,
    });

  // Chỉ xử lý tiền VÀO
  if (p.transferType !== "in") {
    await log("bỏ qua: không phải tiền vào");
    return json({ success: true });
  }

  // 2) Idempotent: giao dịch này đã gắn với đơn nào chưa?
  const { data: dup } = await db
    .from("orders")
    .select("id")
    .eq("sepay_txn_id", txnId)
    .maybeSingle();
  if (dup) return json({ success: true, duplicate: true });

  // 3) Ghép đơn theo mã trong nội dung chuyển khoản
  const suffix = extractOrderSuffix(p);
  if (!suffix) {
    await log("không tìm thấy mã đơn trong nội dung CK");
    return json({ success: true });
  }
  const { data: order, error: findErr } = await db
    .from("orders")
    .select("id, user_id, product_id, amount, ship_fee, status")
    .in("code", [`ZIZI${suffix}`, `ZIZI-${suffix}`])
    .maybeSingle();
  if (findErr || !order) {
    await log(`không có đơn ZIZI${suffix}`);
    return json({ success: true });
  }
  if (order.status !== "pending") {
    await log(`đơn đang ở trạng thái ${order.status}, không tự xử lý`, order.id);
    return json({ success: true });
  }

  // 4) Kiểm tra số tiền: thiếu → chuyển 'review' để admin xử lý tay
  const due = (order.amount ?? 0) + (order.ship_fee ?? 0);
  const paid = Number(p.transferAmount ?? 0);
  if (paid < due) {
    await db.from("orders")
      .update({ status: "review", sepay_txn_id: txnId })
      .eq("id", order.id)
      .eq("status", "pending");
    await log(`thiếu tiền: nhận ${paid}, cần ${due}`, order.id);
    return json({ success: true });
  }

  // 5) Đánh dấu đã thanh toán (điều kiện status='pending' chống xử lý trùng
  //    khi SePay gửi lại song song; sepay_txn_id unique cũng chặn trùng)
  const { data: updated, error: updErr } = await db
    .from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), sepay_txn_id: txnId })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (updErr || !updated) {
    // Unique violation = giao dịch đã được xử lý ở request khác
    return json({ success: true, duplicate: true });
  }

  // 6) Mở quyền học (nếu đơn gắn với tài khoản)
  if (order.user_id && order.product_id) {
    const { error: enrErr } = await db.from("enrollments").upsert(
      {
        user_id: order.user_id,
        product_id: order.product_id,
        order_id: order.id,
        granted_by: "purchase",
      },
      { onConflict: "user_id,product_id" },
    );
    if (enrErr) {
      await log(`đã thanh toán nhưng lỗi mở quyền: ${enrErr.message}`, order.id);
      return json({ success: true });
    }
  }

  // TODO (giai đoạn 4): gửi email qua Resend — RESEND_API_KEY cũng đặt bằng
  // `supabase secrets set`, không bao giờ để trong code trình duyệt.
  await log("đã thanh toán", order.id);
  return json({ success: true });
});
