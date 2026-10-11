from PIL import Image
import base64
import io
from pathlib import Path

root = Path(r"c:\Users\AMINE\Desktop\angular\OpenWA")
logo_path = root / "docs" / "logo" / "smartconfirm_logo.png"

if not logo_path.exists():
    raise FileNotFoundError(f"Logo not found at {logo_path}")

im = Image.open(logo_path)
print("Loaded master logo:", im.size)

public_dir = root / "dashboard" / "public"
public_dir.mkdir(parents=True, exist_ok=True)

# 1. Favicon ICO (16, 32, 48)
im.save(public_dir / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
print("[OK] Saved favicon.ico")

# 2. Favicon PNG (32, 64, 192) and Apple Touch Icon (180x180)
im.resize((32, 32), Image.Resampling.LANCZOS).save(public_dir / "favicon-32x32.png", format="PNG")
im.resize((64, 64), Image.Resampling.LANCZOS).save(public_dir / "favicon.png", format="PNG")
im.resize((180, 180), Image.Resampling.LANCZOS).save(public_dir / "apple-touch-icon.png", format="PNG")
im.resize((192, 192), Image.Resampling.LANCZOS).save(public_dir / "android-chrome-192x192.png", format="PNG")
im.resize((512, 512), Image.Resampling.LANCZOS).save(public_dir / "android-chrome-512x512.png", format="PNG")
print("[OK] Saved PNG favicons")

# 3. High quality SVG favicon embedding the logo
im_128 = im.resize((128, 128), Image.Resampling.LANCZOS)
buf = io.BytesIO()
im_128.save(buf, format="PNG")
b64_png = base64.b64encode(buf.getvalue()).decode("utf-8")

svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <image href="data:image/png;base64,{b64_png}" width="128" height="128" />
</svg>"""

with open(public_dir / "favicon.svg", "w", encoding="utf-8") as f:
    f.write(svg_content)
print("[OK] Saved favicon.svg")

# Also copy to dashboard/dist if dist exists
dist_dir = root / "dashboard" / "dist"
if dist_dir.exists():
    for f in ["favicon.ico", "favicon.svg", "favicon.png", "apple-touch-icon.png"]:
        src = public_dir / f
        if src.exists():
            (dist_dir / f).write_bytes(src.read_bytes())
    print("[OK] Synced to dashboard/dist")
