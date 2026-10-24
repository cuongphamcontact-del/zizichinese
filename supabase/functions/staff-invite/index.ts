// ============================================================================
//  staff-invite — Phân quyền cho nhân viên hỗ trợ + gửi email thông báo
// ----------------------------------------------------------------------------
//  Chủ shop (role=admin) gọi hàm này với {email, name, full, perms, permsText}.
//  Hàm sẽ:
//    1) Xác minh người gọi đúng là CHỦ (role='admin') bằng JWT.
//    2) Tìm/ tạo tài khoản nhân viên theo email; đặt role + perms.
//    3) Gửi email thông báo (Resend) kèm danh sách quyền + link đăng nhập.
//  Deploy:  supabase functions deploy staff-invite
//  Biến môi trường cần: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                       RESEND_API_KEY, MAIL_FROM, SITE_URL
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
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") || "ZiZi Chinese <onboarding@resend.dev>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://zizichinese.com";

function inviteEmail(name: string, roleLabel: string, items: string[], link: string) {
  const list = items.length
    ? `<ul style="margin:10px 0 0;padding-left:18px">${items.map((x) => `<li style="margin:3px 0">${x}</li>`).join("")}</ul>`
    : "<p style='margin:8px 0 0'>Toàn quyền quản trị.</p>";
  return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;color:#243b36">
    <div style="background:#1aa88e;color:#fff;padding:22px;border-radius:14px 14px 0 0"><h2 style="margin:0">ZiZi Chinese · 字字</h2></div>
    <div style="border:1px solid #e4efe9;border-top:none;padding:24px;border-radius:0 0 14px 14px">
      <p>Xin chào ${name || "bạn"},</p>
      <p>Bạn vừa được cấp quyền <b>${roleLabel}</b> trên hệ thống quản trị ZiZi Chinese.</p>
      <p style="margin:14px 0 4px"><b>Những phần bạn được truy cập:</b></p>
      ${list}
      <p style="text-align:center;margin:24px 0"><a href="${link}" style="background:#1aa88e;color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:700">Đăng nhập quản trị →</a></p>
      <p style="font-size:13px;color:#5b726b">Đăng nhập bằng chính email này. Nếu chưa có mật khẩu, bấm "Quên mật khẩu" ở trang đăng nhập để đặt mật khẩu mới.</p>
    </div></div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    // 1) Xác minh người gọi là CHỦ
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON || SERVICE_ROLE, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: me } = await admin.from("profiles").select("role").eq("id", caller.id).single();
    if (!me || me.role !== "admin") return json({ error: "forbidden", message: "Chỉ chủ tài khoản mới được phân quyền." }, 403);

    // 2) Dữ liệu vào
    const body = await req.json().catch(() => ({}));
    const mail = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const full = !!body.full;
    const perms: string[] = Array.isArray(body.perms) ? body.perms : [];
    const items: string[] = Array.isArray(body.permsText) ? body.permsText : [];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return json({ error: "email_invalid", message: "Email không hợp lệ." }, 400);
    const role = full ? "admin" : "staff";
    const permVal = full ? [] : perms;

    // 3) Tìm hồ sơ theo email
    let created = false;
    const { data: prof } = await admin.from("profiles").select("id").eq("email", mail).maybeSingle();
    let uid = prof?.id as string | undefined;
    if (!uid) {
      // chưa có tài khoản → mời tạo (Supabase gửi link đặt mật khẩu)
      const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(mail, { redirectTo: SITE_URL });
      if (invErr || !inv?.user?.id) return json({ error: "invite_failed", message: "Không tạo được tài khoản nhân viên: " + (invErr?.message || "") }, 400);
      uid = inv.user.id;
      created = true;
    }
    // 4) Đặt role + perms
    const { error: upErr } = await admin.from("profiles")
      .upsert({ id: uid, email: mail, full_name: name || null, role, perms: permVal }, { onConflict: "id" });
    if (upErr) return json({ error: "update_failed", message: upErr.message }, 400);

    // 5) Gửi email thông báo
    let mailSent = false, mailError = "";
    if (RESEND_KEY) {
      try {
        const rr = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: MAIL_FROM, to: mail, subject: "Bạn được cấp quyền quản trị ZiZi Chinese", html: inviteEmail(name, full ? "Quản trị viên (toàn quyền)" : "Nhân viên hỗ trợ", items, SITE_URL + "#quantri") }),
        });
        if (rr.ok) mailSent = true;
        else mailError = "Resend " + rr.status + ": " + (await rr.text().catch(() => "")).slice(0, 300);
      } catch (e) { mailError = String(e); }
    } else {
      mailError = "Chưa khai báo RESEND_API_KEY trong Edge Functions → Secrets.";
    }
    return json({ ok: true, created, role, mailSent, mailError });
  } catch (e) {
    return json({ error: "server", message: String(e) }, 500);
  }
});
