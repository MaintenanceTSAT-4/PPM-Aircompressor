"""
process_logo.py — ลบพื้นหลังสีขาวออกจาก logo.png แล้ว inject เข้า PPM_AirCompressor.html
วิธีใช้:
  1. บันทึก logo TS Automotive เป็นไฟล์ชื่อ  logo.png  ในโฟลเดอร์เดียวกัน
  2. รัน:   python process_logo.py
  3. PPM_AirCompressor.html จะถูกอัปเดตอัตโนมัติ — รีเฟรช browser ได้เลย
"""

import base64, io, os, re, sys

# ── ตรวจสอบ dependency ───────────────────────────────────────────
try:
    from PIL import Image
    import numpy as np
except ImportError:
    print("กำลังติดตั้ง Pillow และ numpy...")
    os.system(f"{sys.executable} -m pip install Pillow numpy -q")
    from PIL import Image
    import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH  = os.path.join(SCRIPT_DIR, "logo.png")
HTML_FILES = [
    os.path.join(SCRIPT_DIR, "PPM_AirCompressor.html"),
]

# ── 1. โหลดและลบพื้นหลังสีขาว ──────────────────────────────────
if not os.path.exists(LOGO_PATH):
    print(f"❌ ไม่พบไฟล์ logo.png ใน {SCRIPT_DIR}")
    print("   กรุณาบันทึกโลโก้เป็น logo.png แล้วรันสคริปต์นี้อีกครั้ง")
    sys.exit(1)

print("🖼  กำลังประมวลผล logo.png ...")
img  = Image.open(LOGO_PATH).convert("RGBA")
data = np.array(img, dtype=np.float32)

r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
whiteness   = (r + g + b) / 3.0

THRESHOLD_HARD = 235
THRESHOLD_SOFT = 200

alpha_mask = np.ones_like(whiteness)
hard_white = whiteness >= THRESHOLD_HARD
soft_white = (whiteness >= THRESHOLD_SOFT) & (~hard_white)

alpha_mask[hard_white] = 0.0
alpha_mask[soft_white] = (whiteness[soft_white] - THRESHOLD_SOFT) / (THRESHOLD_HARD - THRESHOLD_SOFT)
alpha_mask = 1.0 - alpha_mask
data[:,:,3] = np.clip(a * alpha_mask, 0, 255)

result_img = Image.fromarray(data.astype(np.uint8), "RGBA")

# ── 2. แปลงเป็น base64 ─────────────────────────────────────────
buf = io.BytesIO()
result_img.save(buf, format="PNG", optimize=True)
b64      = base64.b64encode(buf.getvalue()).decode("ascii")
data_url = f"data:image/png;base64,{b64}"

print(f"✅ ลบพื้นหลังสำเร็จ — ขนาด base64: {len(b64)//1024} KB")

# ── 3. Inject เข้า HTML ────────────────────────────────────────
LOGO_SRC_RE  = re.compile(r'(<img\s+id="header-logo"[^>]*\ssrc=")[^"]*(")')
LOGO_WRAP_RE = re.compile(r'(id="logo-wrap"\s+style=")[^"]*(")')

updated_any = False
for html_path in HTML_FILES:
    if not os.path.exists(html_path):
        print(f"⚠  ไม่พบไฟล์: {html_path}")
        continue
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()

    new_content, n1 = LOGO_SRC_RE.subn(lambda m: m.group(1) + data_url + m.group(2), content)
    new_content, n2 = LOGO_WRAP_RE.subn(
        lambda m: m.group(1) + "display:flex;flex-shrink:0;" + m.group(2), new_content
    )

    if n1 or n2:
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"✅ อัปเดตแล้ว: {os.path.basename(html_path)}")
        updated_any = True
    else:
        print(f"⚠  ไม่พบ placeholder ใน {os.path.basename(html_path)}")

if updated_any:
    print("\n🎉 เสร็จสิ้น! รีเฟรช browser เพื่อดูโลโก้")
else:
    print("\n❌ ไม่มีไฟล์ถูกอัปเดต")
