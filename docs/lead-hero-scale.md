# 首页 hero（鲸鱼 + 问候语）尺寸与间距 —— 对齐官方手机端

日期：2026-10-22　执行：Lead
需求来源：用户 m01064「中间的文字和logo按比例自适应放大」、m01121「将logo和中间文字的间距调整为官方手机端里面的logo和中间文字的间距」。
上位约束（m00001）：功能零变更、不改技术栈/工程结构、不加依赖。本次只改 `MainActivity.hero()` 的四个布局数值与 `Theme` 的 6 个视觉令牌，**没有触碰任何业务分支**。

---

## 1 实测基准（参考 APK，`shots/lead/t-ref.png`，1080x1920 @480dpi）

| 元素 | 参考实测（墨迹） |
|---|---|
| 鲸鱼 logo | 42.0 x **32.0** dp |
| 问候语 | 墨迹高 **20.0** dp（粗体居中） |
| logo 墨迹底 → 问候语墨迹顶 | **26.3** dp |

本项目改版前同一屏（`shots/lead/v2/zh-home.png`）：logo 墨迹 32.0 x 22.0 dp、问候语墨迹 16.3 dp、间距 25.3 dp —— **logo 与文字都偏小**，间距反而接近。

## 2 改法

### 2.1 尺寸令牌（`Theme.java`）

| 令牌 | 值 | 依据 |
|---|---|---|
| `HERO_LOGO_DP` | **50f** | 本项目 PNG 墨迹只占画布 94.8% x 64.1%（`ic_brand_logo.png` 192px 实测），50dp 框 → 墨迹 47.3 x **32.0** dp，与参考墨迹高度逐 dp 相等（宽度差来自两家鲸鱼画法不同，本项目鲸鱼本身更扁宽） |
| `HERO_GREET_SP` | **21f** | 17sp → 墨迹 16.3dp，按比例反推 20.0/16.3*17 ≈ 20.9 → 21sp，实测墨迹 **20.3** dp |
| `HERO_GAP_DP` | **10.6f** | 见 2.3 |
| `HERO_SHIFT_DP` | 22f | 原值，只跟随 `heroScale()` 缩放 |
| `HERO_SCALE_MIN/MAX` | 1f / 1.6f | 小屏不缩小（避免偏离参考比例）；大屏最多 1.6 倍，否则会把输入卡片挤得没位置 |

### 2.2 自适应比例 `Theme.heroScale()`

```java
public float heroScale() {
    DisplayMetrics m = context.getResources().getDisplayMetrics();
    float w = m.widthPixels / m.density;
    float h = m.heightPixels / m.density;
    float s = Math.min(w / 360f, h / 640f);
    if (!(s > HERO_SCALE_MIN)) return HERO_SCALE_MIN;   // 同时兼顾 NaN
    return s > HERO_SCALE_MAX ? HERO_SCALE_MAX : s;
}
```

- 基准 **360 x 640dp**（本机 1080x1920 @480dpi 恰为 360x640dp → 比例 1.0）。
- 宽、高各按自身比例换算后**取小值**：宽度是文字排版的硬约束（太大会换行），高度只决定留白，两者都满足才放大。
- 只读 `DisplayMetrics`，不写状态、不碰业务值。
- 应用面：logo 框、问候语字号、间距、整块上移量**全部乘以同一个 `hs`**，整块等比缩放而不是各元素各放大。

`MainActivity.hero()` 现在的四处计算：

```java
float hs = t.heroScale();
int logoBox = Math.round(t.dp(Theme.HERO_LOGO_DP) * hs);
TextView hello = t.strong(getString(R.string.home_greeting), Theme.HERO_GREET_SP * hs, t.text);
lp.topMargin = Math.round(t.dp(Theme.HERO_GAP_DP) * hs);
box.setTranslationY(-Math.round(t.dp(Theme.HERO_SHIFT_DP) * hs));
```

### 2.3 间距为什么是 10.6dp（而不是直接写 26.3）

参考量到的是**墨迹到墨迹**，而布局里能设的是**控件边框到边框**，两者差着两段留白：

- logo 50dp 框内，墨迹上下留白 = 8.85dp / **9.4dp**（PNG 墨迹在画布 0.177..0.8125 之间）；
- 问候语 `includeFontPadding=false` 后，文本顶到墨迹顶仍有 **6.3dp**（实测 773-768）。

所以 `10.6 + 9.4 + 6.3 = 26.3dp` = 参考的可见间距。**实测复核：26.0dp（差 0.3dp = 1px，亚像素级）。**

## 3 验证

| 检查 | 结果 |
|---|---|
| 尺寸（本机 360x640dp，hs=1.0） | logo 墨迹 **47.3 x 32.0** dp；问候语墨迹 **20.3** dp；墨迹间距 **26.0** dp（参考 42.0x32.0 / 20.0 / 26.3） |
| 自适应（`wm density 320` → 540x960dp，hs=1.5） | logo 墨迹 **48.0** dp 高（=32.0x1.5 ✓）、问候语 **30.5** dp（=20.3x1.5 ✓）、整块等比 → 公式与夹取行为均正确；测完已 `wm density reset`（现为 480） |
| 功能回归 | `node tools/verify-harness.mjs` → **PASS=34 FAIL=0 NOT-READY=0 SKIP=0 未验证=6**，与改版前一致 |
| 代码影响面 | 仅 `MainActivity.hero()` 4 行布局数值 + `Theme` 6 个静态令牌 + 1 个只读方法；`git`/业务 token 无差异 |

证据截图：`shots/lead/v3/hero-after.png`（放大后）、`hero-gap.png`（间距对齐后）、`hero-dpi320.png`（1.5 倍缩放验证）。

## 4 回滚

```
Theme.java      : 删 HERO_* 六个常量与 heroScale()，去掉 DisplayMetrics import
MainActivity.java : hero() 内四处改回
  new LinearLayout.LayoutParams(t.dp(34), t.dp(34))
  t.strong(getString(R.string.home_greeting), 17f, t.text)
  lp.topMargin = t.dp(14);
  box.setTranslationY(-t.dp(22));
```

## 附：整块按屏幕中线定位（m01150 / m01204）

用户要求两次收敛：先「自适应到屏幕的居中位置」，再明确为「**logo 与问候语两者间距的中心**落在屏幕居中位置」。

### 做法（不再用固定上移量）
`MainActivity.hero()` 给 hero 的 `LinearLayout` 挂一个 `OnLayoutChangeListener`：每次布局完成就量一次 hero 与 decorView 的屏幕坐标，把「hero 外框中心」平移到「屏幕中线 − 光学偏置」：

```java
View decor = getWindow().getDecorView();
v.getLocationOnScreen(heroPos); decor.getLocationOnScreen(decorPos);
float centerNow  = heroPos[1] + v.getHeight() / 2f;
float centerWant = decorPos[1] + decor.getHeight() / 2f
                 - Math.round(t.dp(Theme.HERO_INK_BIAS_DP) * hs);
v.setTranslationY(v.getTranslationY() + (centerWant - centerNow));
```

只改 `translationY`（不触发重新布局），每次按「当前位置」反推差值，多次回调只会收敛到中线；横竖屏切换、字号变化、换语言都会自动重算，乘 `hs` 保证跟随 `heroScale()` 缩放。

`Theme.HERO_INK_BIAS_DP = 8.5f`：外框中心 ≠ 墨迹中心（logo 是方形画布里的扁鲸，墨迹下方留 9.4dp；问候语 TextView 墨迹偏上半部）。实测外框居中时**墨迹间隙中心比屏幕中线低 18px（6dp）**，8.5dp 是把「间隙中心」顶到中线的合值（= 先前的 2.5dp 墨迹偏置 + 6dp 间隙偏置）。

### 实测（`shots/lead/v4/`，1080x1920 @480dpi，屏幕中线 y=960）
| 项 | logo 墨迹 | 问候语墨迹 | 墨迹间隙 | 间隙中心 | 偏差 |
|---|---|---|---|---|---|
| center3（zh 浅色） | 826..921（32.0dp 高） | 999..1059（20.3dp 高） | 25.7dp | **960.0** | **0.0px** |
| center-dark（zh 深色） | 826..921 | 999..1059 | 25.7dp | **960.0** | **0.0px** |
| center-en2（英文） | 835..930 | 999..1060 | 22.7dp | 964.5 | +4.5px（1.5dp，字面 metrics 差） |

> 参考侧（`shots/lead/t-ref.png`）：logo 墨迹 718..813、问候语 892..951，间隙中心 852.5 —— 参考是按整块视觉重心偏上摆放的，**不是**屏幕居中。此处按用户指令执行屏幕居中，属于对参考的**用户指定偏离**，已在 `docs/lead-regression.md` §4 记录。

### 验证
- 构建 `bash ../tools/build-lock.sh ./build.sh` → EXIT 0，`android/bin/dsh-phone.apk` 674257 B / versionName 0.6.13 / code 29。
- 装机 `adb install -r` → Success；截图 `shots/lead/v4/center3.png`（原图）与 `center3-guide.png`（红线=屏幕中线、蓝线=间隙中心，两线重合）。
- 功能回归 `node tools/verify-harness.mjs` → PASS=34 FAIL=0 NOT-READY=0 SKIP=0 未验证=6（与改动前一致）。
