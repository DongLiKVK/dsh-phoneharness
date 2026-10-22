# 启动图标鲸鱼放大（m01266）

> 需求：用户要求「将应用图标里的鲸鱼自适应放大一些」。
> 约束不变：不改技术栈、不加依赖、不动业务逻辑与路由；只改图标位图资源。

## 〇、结论摘要

| 层 | 改前墨迹（xxxhdpi） | 改后墨迹（xxxhdpi） | 占画布 | 主色 |
| --- | --- | --- | --- | --- |
| 传统白瓦片 `ic_launcher.png`（192px） | 125 × 85（65.1%） | **143 × 96（74.5%）** | 74.5% | #131414 |
| 自适应前景 `ic_launcher_foreground.png`（432px） | 173 × 117（40.0%） | **217 × 146（50.2%）** | 50.2%（对角线 60.5%） | #131414 |
| 主题图标层 `ic_launcher_monochrome.png`（432px） | 173 × 117 | **217 × 146** | 同上，与前景**逐字节相同** | #131414 |

缩放系数：传统瓦片 **×1.15**，自适应前景/主题层 **×1.25**。五档 dpi 全部按同一系数等比重出。

## 一、改法（只重出位图，不动资源引用与清单）

1. 图标资源清单（未增删任何文件）：
   - `android/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` —— 传统白瓦片（48/72/96/144/192）
   - `.../ic_launcher_foreground.png`、`.../ic_launcher_monochrome.png` —— 自适应两层（108/162/216/324/432）
   - `android/res/mipmap-anydpi-v26/ic_launcher.xml` —— adaptive-icon，background `@color/ic_launcher_background`（`android/res/values/colors.xml:4` = `#FFFFFF`）
2. 生成脚本 **`tools/icon-scale.py`**：源目录一律取基线快照 `_baseline-phone-harness-20261022-065400/res`（幂等，可随时重跑），写入 `android/res`。
   - 透明层：按 alpha>12 求内容 bbox（含 2px 余量）裁切 → `resize_premul()`（预乘 alpha 的 LANCZOS，避免半透明边缘发黑）→ 居中贴回原画布。
   - 白瓦片：先由「亮度→墨迹覆盖率」把鲸鱼还原成 RGBA 字形（`cov = clip((255-L)/(255-19.2),0,1) * src_alpha`，颜色固定 `INK=(19,20,20)`），缩放后贴到「旧鲸区域先涂白」的瓦片上。圆角、白底、瓦片尺寸原样保留。
3. 未改：包名、Activity、自适应 XML、任何 Java 代码。

## 二、系数是怎么定的

- 参照物是**自适应图标的可见区域**：108dp 画布里只有中间 72dp 会显示，前景墨迹要在这个可见区里占得饱满又不被圆形遮罩切边。
- 安全圆半径 = 0.305 × 432 = **131.8px**；×1.25 后墨迹 bbox 半对角线 = √(108.5² + 73²) = **130.8px < 131.8** → 不出血（留 1px 余量，靠近极限但成立）。
- 传统瓦片没有遮罩，按「视觉占比与自适应层一致」定 74.5%（原 65.1%），系数 1.15。
- 两层改后的**视觉占比都约等于瓦片可见区的 75%**，与相邻的参考 App 图标（DeepSeek）同量级。

## 三、踩过的两个坑（脚本已修）

1. **墨色变纯黑**：第一版把裁切区 RGB 直接写 `(0,0,0)`，鲸鱼变 #000000。`python tools/logo-sheet.py verify` 逐张报 `主色 #000000 期望 #131414 ... !! 不一致`。→ 字形颜色必须固定为品牌墨色 `(19,20,20)`。
2. **传统瓦片四角被涂黑、bbox 撑满整幅**：求覆盖率时忘了乘源 alpha，圆角外的透明像素（RGB 0,0,0）被当成「满墨」。→ `cov` 必须乘 `src_alpha`。

## 四、验证

1. 素材级：`python tools/logo-sheet.py verify` → **15 张 mipmap 全部 OK**（画布尺寸、主色 #131414、alpha 双端），并输出「monochrome 与 foreground 逐字节相同：mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi」；md5 手工复核五档全 SAME。
2. 构建：`cd android && bash ../tools/build-lock.sh ./build.sh` → EXIT 0，`android/bin/dsh-phone.apk` = 731600 B / versionName 0.6.13 / versionCode 29 / md5 `606a607aff885b49d286d50da870e726`。
3. 装机 + 桌面实测（`shots/lead/v6/desktop.png`，启动器瓦片 121×121）：鲸身墨迹 **91 × 62px = 75.2% 宽**，左右留白 14 / 16px；放大截图 `shots/lead/v6/tile-zoom.png`、对照图 `shots/lead/v6/icon-compare.png`。
4. 应用内回归：清进程冷启首页，UI 文本 dump 与 `shots/lead/v2/zh-home.xml` **SAME: True**（6/6 项一致），`shots/lead/v6/smoke-home.png`。
5. 全套回归：`node tools/verify-harness.mjs`（见 `docs/lead-regression.md`）。

## 五、边界

- 桌面图标由启动器自行解析与缓存，部分启动器会先显示旧图；复核前需 `am force-stop` 启动器再 `KEYCODE_HOME` 重抓。
- 传统瓦片与自适应层走的是不同可见区域（瓦片无遮罩、自适应有 72dp 视窗），所以两层缩放系数不同（1.15 / 1.25），不能统一成一个数。
- `docs/logo-theme-spec.md` §二 的版面规则已同步为「传统瓦片 74.5% / 自适应对角线 60.5%」。

## 六、复现命令

```bash
cd <PROJECT_ROOT>
python tools/icon-scale.py            # 从基线重出 15 张图标
python tools/logo-sheet.py verify     # 15 张全 OK 才算过
cd android && bash ../tools/build-lock.sh ./build.sh
```

## 七、回滚点

- 图标：`_baseline-phone-harness-20261022-065400/res/mipmap-*`（拷回 `android/res/mipmap-*` 即回到改前）。
- 全套：`<HOME>/Documents/task/_baseline-phone-harness-20261022-065400/`。
