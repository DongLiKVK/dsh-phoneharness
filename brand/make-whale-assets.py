# -*- coding: utf-8 -*-
"""把用户提供的「黑鲸鱼」原图做成全套品牌素材（浅色 / 深色两套 + 桌面图标 + 自适应图标 + 主题图标层）。

用法：  python brand/make-whale-assets.py
输入：  brand/whale-source.png（白底黑鲸剪影；附件原图已转存为 PNG，避免 JPEG 二次压缩）
输出：
  brand/whale-light-master.png / brand/whale-dark-master.png        方形主图（透明背景）
  brand/preview/whale-levels.png                                    放大检查用（边缘 / 镂空）
  android/res/drawable-<dpi>/ic_brand_logo.png       应用内 logo 浅色版（黑鲸，透明背景）
  android/res/drawable-<dpi>/ic_brand_logo_dark.png  应用内 logo 深色版（白鲸，透明背景）
  （不写 drawable-night/：night 限定符按系统解析，会覆盖应用内显式外观选择，实测有害）
  android/res/drawable-<dpi>/ic_splash_logo.png      启动页 96dp 浅色版
  android/res/drawable-<dpi>/ic_splash_logo_dark.png 启动页 96dp 深色版
  android/res/mipmap-<dpi>/ic_launcher.png           传统桌面图标（白底圆角 + 黑鲸）
  android/res/mipmap-<dpi>/ic_launcher_foreground.png 自适应图标前景（108dp 画布）
  android/res/mipmap-<dpi>/ic_launcher_monochrome.png 主题图标层（Android 13+）
"""
import os
import numpy as np
from PIL import Image, ImageDraw

ROOT = r"<PROJECT_ROOT>"
SRC = os.path.join(ROOT, "brand", "whale-source.png")
RES = os.path.join(ROOT, "android", "res")
PREVIEW = os.path.join(ROOT, "brand", "preview")

# 浅色版填充：取原图暗部中位数（下面实测后覆盖，保持与原图一致的黑）
LIGHT = (16, 17, 21)
# 深色版填充：与 values-night/styles.xml 的 android:textColor 一致（#F8F8F8）
DARK = (248, 248, 248)

DENS = [("mdpi", 1.0), ("hdpi", 1.5), ("xhdpi", 2.0), ("xxhdpi", 3.0), ("xxxhdpi", 4.0)]
BRAND_DP, SPLASH_DP, LAUNCHER_DP, ADAPTIVE_DP = 64, 96, 48, 108


def save(img, folder, name, px):
    d = os.path.join(RES, folder)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, name + ".png")
    img.resize((px, px), Image.LANCZOS).save(path, optimize=True)
    return path


def alpha_from_white(path):
    """白底黑图 -> alpha。白底 alpha=0；鲸身白色细节（眼睛 / 须纹）也变 0，天然成为镂空。"""
    a = np.array(Image.open(path).convert("RGB")).astype(np.int16)
    raw = (255 - a.min(axis=2)).clip(0, 255).astype(np.float32)
    # 电平：白底与 JPEG 噪点（raw<30，即 lum>225）全透明；任何「墨」（raw>110，即 lum<145）拉满不透明。
    # 只有边缘那一圈落在 30..110 之间，天然得到抗锯齿的轮廓。
    lev = np.clip((raw - 30.0) * (255.0 / 80.0), 0, 255)
    lev[lev < 8] = 0
    return np.round(lev).astype(np.uint8), a


def tinted_square(alpha, rgb, pad=1.06):
    """上色 -> 裁到内容 -> 放到正方形画布（留 6% 边距，任何尺寸都不切边）。"""
    h, w = alpha.shape
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[:, :, 0], rgba[:, :, 1], rgba[:, :, 2] = rgb
    rgba[:, :, 3] = alpha
    img = Image.fromarray(rgba, "RGBA")
    ys, xs = np.where(alpha > 8)
    img = img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    w, h = img.size
    side = int(round(max(w, h) * pad))
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return sq, img.size


def fit_circle(master, canvas_px, ratio):
    """按 bbox 对角线 = ratio*canvas 缩放居中：保证自适应图标安全圆内不出血。"""
    w, h = master.size
    s = (canvas_px * ratio) / ((w * w + h * h) ** 0.5)
    nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
    lg = master.resize((nw, nh), Image.LANCZOS)
    c = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))
    c.paste(lg, ((canvas_px - nw) // 2, (canvas_px - nh) // 2), lg)
    return c


def rounded_tile(master, size, scale, bg=(255, 255, 255, 255), radius_ratio=0.234):
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle([0, 0, size - 1, size - 1],
                                           radius=int(round(size * radius_ratio)), fill=bg)
    w, h = master.size
    s = (size * scale) / w
    nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
    lg = master.resize((nw, nh), Image.LANCZOS)
    tile.paste(lg, ((size - nw) // 2, (size - nh) // 2), lg)
    return tile


alpha, rgb = alpha_from_white(SRC)
mask = alpha > 200
LIGHT = tuple(int(round(v)) for v in np.median(rgb[mask].reshape(-1, 3), axis=0))
print("原图暗部中位数 -> 浅色版填充", LIGHT, " 深色版填充", DARK)

light_master, content = tinted_square(alpha, LIGHT)
dark_master, _ = tinted_square(alpha, DARK)
print("内容 bbox", content, "方形主图", light_master.size)
os.makedirs(PREVIEW, exist_ok=True)
light_master.save(os.path.join(ROOT, "brand", "whale-light-master.png"))
dark_master.save(os.path.join(ROOT, "brand", "whale-dark-master.png"))
light_master.resize((512, 512), Image.LANCZOS).save(os.path.join(PREVIEW, "whale-levels.png"))

# 1) 应用内 logo（64dp）浅 / 深两套。
#    ⚠ 不再写 drawable-night/：night 限定符按「系统」配置解析，与应用内「外观」选择无关，
#    系统深色 + 应用显式浅色时会把浅色资源改写成白鲸 -> 白鲸压白底不可见（真机实测缺陷，
#    见 docs/logo-theme-spec.md §3.4 / §六）。logo 的选择只由 Theme.dark 决定。
for folder, s in DENS:
    save(light_master, "drawable-" + folder, "ic_brand_logo", int(round(BRAND_DP * s)))
    save(dark_master, "drawable-" + folder, "ic_brand_logo_dark", int(round(BRAND_DP * s)))

# 2) 启动页 logo（96dp）
for folder, s in DENS:
    save(light_master, "drawable-" + folder, "ic_splash_logo", int(round(SPLASH_DP * s)))
    save(dark_master, "drawable-" + folder, "ic_splash_logo_dark", int(round(SPLASH_DP * s)))

# 3) 传统桌面图标：白底圆角 + 黑鲸（鲸身宽占 68%）
for folder, s in DENS:
    px = int(round(LAUNCHER_DP * s))
    save(rounded_tile(light_master, px, 0.68), "mipmap-" + folder, "ic_launcher", px)

# 4) 自适应图标前景 + 主题图标层（108dp 画布；bbox 对角线 60% -> 落在 66dp 安全圆内）
for folder, s in DENS:
    px = int(round(ADAPTIVE_DP * s))
    save(fit_circle(light_master, px, 0.60), "mipmap-" + folder, "ic_launcher_foreground", px)
    save(fit_circle(light_master, px, 0.60), "mipmap-" + folder, "ic_launcher_monochrome", px)

print("done")
