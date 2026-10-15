// ============================================================================
//  forgot-password  —  Gửi link đặt lại mật khẩu qua Resend (vào inbox)
// ----------------------------------------------------------------------------
//  Trình duyệt gọi hàm này với {email}. Hàm tạo link khôi phục bằng
//  admin.generateLink (service_role) rồi gửi qua Resend — KHÔNG dùng bộ gửi
//  mặc định của Supabase (hay lỗi/giới hạn). Luôn trả ok để không lộ email nào
//  có tài khoản.
//  Deploy:  supabase functions deploy forgot-password --no-verify-jwt
//  Cần: SITE_URL phải nằm trong Supabase → Authentication → URL Configuration
//       (Site URL / Redirect URLs).
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") || "ZiZi Chinese <onboarding@resend.dev>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://zizichinese.com";

function resetEmail(link: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#243b36">
    <div style="background:#1aa88e;color:#fff;padding:22px;border-radius:14px 14px 0 0"><h2 style="margin:0">ZiZi Chinese · 字字</h2></div>
    <div style="border:1px solid #e4efe9;border-top:none;padding:24px;border-radius:0 0 14px 14px">
      <p>Bạn vừa yêu cầu <b>đặt lại mật khẩu</b> cho tài khoản ZiZi Chinese.</p>
      <p style="text-align:center;margin:22px 0"><a href="${link}" style="background:#1aa88e;color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:700">Đặt mật khẩu mới →</a></p>
      <p style="font-size:13px;color:#5b726b">Link có hạn trong ~1 giờ. Nếu bạn không yêu cầu, bỏ qua email này — mật khẩu của bạn không thay đổi.</p>
    </div></div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const { email } = await req.json().catch(() => ({}));
    const mail = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return json({ error: "email_invalid", message: "Email không hợp lệ." }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await sb.auth.admin.generateLink({
      type: "recovery",
      email: mail,
      options: { redirectTo: SITE_URL },
    });
    // Không lộ email có tồn tại hay không
    if (error || !data?.properties?.action_link) return json({ ok: true });

    if (RESEND_KEY) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: MAIL_FROM, to: mail, subject: "Đặt lại mật khẩu ZiZi Chinese", html: resetEmail(data.properties.action_link) }),
        });
      } catch (_) { /* ignore */ }
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: "server", message: String(e) }, 500);
  }
});
