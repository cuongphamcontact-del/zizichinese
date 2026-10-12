// =====================================================================
// ZiZi Chinese - Edge Function nhan webhook SePay (chay PHIA MAY CHU)
//
// Noi DUY NHAT duoc dung khoa bi mat, doc tu bien moi truong (Deno.env):
//   - SEPAY_WEBHOOK_KEY          : API key dat trong SePay -> Webhooks
//   - SUPABASE_SERVICE_ROLE_KEY  : Supabase tu cap cho Edge Function
// KHONG ghi khoa vao code, KHONG dua vao index.html / code trinh duyet.
//
// Khong dung thu vien ngoai (goi thang REST API cua Supabase) de deploy
// duoc tu Dashboard -> Edge Functions -> Via Editor (file phai ten index.ts).
//
// Cai dat:
//   Secrets: SEPAY_WEBHOOK_KEY = <chuoi ngau nhien dai>
//   Function name: sepay-webhook ; TAT "Enforce JWT Verification"
// SePay -> Webhooks:
//   URL : https://<project-ref>.supabase.co/functions/v1/sepay-webhook
//   Kieu chung thuc: API Key -> SePay gui header "Authorization: Apikey <key>"
// =====================================================================

type SepayPayload = {
  id: number;                 // id giao dich SePay
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  code?: string | null;       // ma thanh toan SePay tu nhan dien (neu cau hinh)
  content?: string;           // noi dung chuyen khoan
  transferType?: "in" | "out";
  transferAmount?: number;
  referenceCode?: string;
  description?: string;
};

type Order = {
  id: string;
  user_id: string | null;
  product_id: string | null;
  amount: number | null;
  ship_fee: number | null;
  status: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// So sanh chuoi thoi gian hang (tranh do key theo thoi gian phan hoi)
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) {
    diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return diff === 0;
}

// Tim ma don trong noi dung CK. Ngan hang hay bo dau "-"/khoang trang,
// nen chap nhan "ZIZI7K3P", "ZIZI 7K3P", "ZIZI-7K3P" va tra ve phan duoi.
function extractOrderSuffix(p: SepayPayload): string | null {
  const text = `${p.code ?? ""} ${p.content ?? ""} ${p.description ?? ""}`;
  const m = text.toUpperCase().match(/ZIZI[\s-]?([A-Z0-9]{4,8})/);
  return m ? m[1] : null;
}

// Client REST toi gian cho PostgREST cua Supabase (service role, bo qua RLS)
function makeDb(url: string, key: string) {
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
  };
  // Khoa service_role kieu cu (JWT) can them Authorization; khoa moi sb_secret_ chi can apikey
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
    prefer?: string,
  ): Promise<{ data: T | null; error: string | null }> {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return { data: null, error: `${res.status} ${text}` };
    return { data: text ? (JSON.parse(text) as T) : null, error: null };
  }
  return {
    select: <T>(path: string) => call<T[]>("GET", path),
    insert: (table: string, row: unknown) =>
      call("POST", table, row, "return=minimal"),
    update: <T>(path: string, patch: unknown) =>
      call<T[]>("PATCH", path, patch, "return=representation"),
    upsert: (path: string, row: unknown) =>
      call("POST", path, row, "resolution=merge-duplicates,return=minimal"),
  };
}

const q = encodeURIComponent;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ success: false, error: "method" }, 405);

  const expectedKey = Deno.env.get("SEPAY_WEBHOOK_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expectedKey || !supabaseUrl || !serviceKey) {
    console.error("Thieu bien moi truong SEPAY_WEBHOOK_KEY / SUPABASE_*");
    return json({ success: false, error: "server_not_configured" }, 500);
  }

  // 1) Xac thuc: tu choi moi request khong mang dung API key cua SePay
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

  const db = makeDb(supabaseUrl, serviceKey);
  const txnId = String(p.id);
  const log = (note: string, orderId: string | null = null) =>
    db.insert("webhook_logs", {
      provider: "sepay",
      payload: p,
      matched_order: orderId,
      note,
    });

  // Chi xu ly tien VAO
  if (p.transferType !== "in") {
    await log("bo qua: khong phai tien vao");
    return json({ success: true });
  }

  // 2) Idempotent: giao dich nay da gan voi don nao chua?
  const dup = await db.select<{ id: string }>(
    `orders?select=id&sepay_txn_id=eq.${q(txnId)}`,
  );
  if (dup.data && dup.data.length) return json({ success: true, duplicate: true });

  // 3) Ghep don theo ma trong noi dung chuyen khoan
  const suffix = extractOrderSuffix(p);
  if (!suffix) {
    await log("khong tim thay ma don trong noi dung CK");
    return json({ success: true });
  }
  const found = await db.select<Order>(
    `orders?select=id,user_id,product_id,amount,ship_fee,status` +
      `&code=in.(${q(`ZIZI${suffix}`)},${q(`ZIZI-${suffix}`)})&limit=1`,
  );
  const order = found.data?.[0];
  if (found.error || !order) {
    await log(`khong co don ZIZI${suffix}${found.error ? " - " + found.error : ""}`);
    return json({ success: true });
  }
  if (order.status !== "pending") {
    await log(`don dang o trang thai ${order.status}, khong tu xu ly`, order.id);
    return json({ success: true });
  }

  const pendingFilter = `orders?id=eq.${q(order.id)}&status=eq.pending`;

  // 4) Kiem tra so tien: thieu -> chuyen 'review' de admin xu ly tay
  const due = (order.amount ?? 0) + (order.ship_fee ?? 0);
  const paid = Number(p.transferAmount ?? 0);
  if (paid < due) {
    await db.update(pendingFilter, { status: "review", sepay_txn_id: txnId });
    await log(`thieu tien: nhan ${paid}, can ${due}`, order.id);
    return json({ success: true });
  }

  // 5) Danh dau da thanh toan (dieu kien status=pending chong xu ly trung
  //    khi SePay gui lai song song; sepay_txn_id unique cung chan trung)
  const upd = await db.update<{ id: string }>(pendingFilter, {
    status: "paid",
    paid_at: new Date().toISOString(),
    sepay_txn_id: txnId,
  });
  if (upd.error || !upd.data || !upd.data.length) {
    return json({ success: true, duplicate: true });
  }

  // 6) Mo quyen hoc (neu don gan voi tai khoan)
  if (order.user_id && order.product_id) {
    const enr = await db.upsert("enrollments?on_conflict=user_id,product_id", {
      user_id: order.user_id,
      product_id: order.product_id,
      order_id: order.id,
      granted_by: "purchase",
    });
    if (enr.error) {
      await log(`da thanh toan nhung loi mo quyen: ${enr.error}`, order.id);
      return json({ success: true });
    }
  }

  // TODO (giai doan 4): gui email qua Resend - RESEND_API_KEY cung dat trong
  // Secrets, khong bao gio de trong code trinh duyet.
  await log("da thanh toan", order.id);
  return json({ success: true });
});
