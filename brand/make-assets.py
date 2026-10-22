
import os
import numpy as np
from PIL import Image, ImageDraw

ROOT = r"<PROJECT_ROOT>"
SRC = os.path.join(ROOT, "brand", "logo-source2.png")
RES = os.path.join(ROOT, "android", "res")

im = Image.open(SRC).convert("RGB")
a = np.array(im).astype(np.int16)
alpha = (255 - a.min(axis=2)).clip(0, 255).astype(np.uint8)
mask = alpha > 200
color = np.median(a[mask].reshape(-1, 3), axis=0).astype(int)
print("stroke color", color)
hexc = "#%02X%02X%02X" % (color[0], color[1], color[2])

# trimmed logo with transparent background
rgba = np.zeros((a.shape[0], a.shape[1], 4), dtype=np.uint8)
rgba[:, :, 0] = color[0]; rgba[:, :, 1] = color[1]; rgba[:, :, 2] = color[2]
rgba[:, :, 3] = alpha
logo = Image.fromarray(rgba, "RGBA")
arr = np.array(logo)[:, :, 3]
ys, xs = np.where(arr > 16)
bbox = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
logo = logo.crop(bbox)
print("bbox", bbox)
print("trimmed", logo.size)
logo.save(os.path.join(ROOT, "brand", "logo-transparent.png"))

# square canvas with small margin so strokes never clip
w, h = logo.size
side = int(max(w, h) * 1.02)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(logo, ((side - w) // 2, (side - h) // 2), logo)
master = square
master.save(os.path.join(ROOT, "brand", "logo-master.png"))

def save(img, folder, name, px):
    d = os.path.join(RES, folder)
    os.makedirs(d, exist_ok=True)
    img.resize((px, px), Image.LANCZOS).save(os.path.join(d, name + ".png"), optimize=True)
    return os.path.join(d, name + ".png")

DENS = [("mdpi", 1.0), ("hdpi", 1.5), ("xhdpi", 2.0), ("xxhdpi", 3.0), ("xxxhdpi", 4.0)]

# 1) in-app logo (base 64dp)
for folder, s in DENS:
    save(master, "drawable-" + folder, "ic_brand_logo", int(round(64 * s)))

# 2) splash logo (base 96dp)
for folder, s in DENS:
    save(master, "drawable-" + folder, "ic_splash_logo", int(round(96 * s)))

# 3) legacy launcher icon: white rounded tile + logo 62%
def rounded_tile(size, logo_scale=0.70, radius_ratio=0.234, bg=(255, 255, 255, 255)):
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    r = int(round(size * radius_ratio))
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=bg)
    inner = int(round(size * logo_scale))
    lg = master.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    tile.paste(lg, (off, off), lg)
    return tile

for folder, s in DENS:
    px = int(round(48 * s))
    save(rounded_tile(px), "mipmap-" + folder, "ic_launcher", px)

# 4) adaptive foreground: 108dp canvas, logo 58%
for folder, s in DENS:
    canvas = int(round(108 * s))
    fg = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    inner = int(round(canvas * 0.60))
    lg = master.resize((inner, inner), Image.LANCZOS)
    off = (canvas - inner) // 2
    fg.paste(lg, (off, off), lg)
    save(fg, "mipmap-" + folder, "ic_launcher_foreground", canvas)

print("done, color", hexc)