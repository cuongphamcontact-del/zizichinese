#!/usr/bin/env bash
# Chặn commit/đẩy khóa bí mật vào code chạy ở trình duyệt.
# Chỉ thư mục supabase/functions/ (phía máy chủ) được NHẮC tới tên biến bí mật,
# và kể cả ở đó cũng chỉ đọc qua Deno.env — không bao giờ ghi giá trị thật.
set -euo pipefail
cd "$(dirname "$0")/.."

# Mẫu giá trị khóa thật (không phải tên biến)
VALUE_PATTERNS='sb_secret_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+|re_[A-Za-z0-9]{20,}|spk_(live|test)_[A-Za-z0-9]{10,}'
# Tên/khái niệm khóa bí mật không được xuất hiện trong code trình duyệt
BROWSER_PATTERNS='service_role|SERVICE_ROLE_KEY|SEPAY_WEBHOOK_KEY|SEPAY_API_KEY|RESEND_API_KEY'

fail=0
if hits=$(git grep -nIE "$VALUE_PATTERNS" -- . ':!scripts/check-secrets.sh'); then
  echo "❌ Phát hiện giá trị trông như khóa bí mật:"; echo "$hits"; fail=1
fi
if hits=$(git grep -nIE "$BROWSER_PATTERNS" -- '*.html' '*.js' '*.mjs' '*.css' ':!supabase/functions/**'); then
  echo "❌ Code trình duyệt nhắc tới khóa phía máy chủ:"; echo "$hits"; fail=1
fi
[ "$fail" -eq 0 ] && echo "✅ Không thấy khóa bí mật trong code trình duyệt."
exit "$fail"
