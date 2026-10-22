# 动效与视觉令牌层（motion-tokens）

本文件是**词汇表说明书**：所有页面改版只从这里取时长 / 曲线 / 幅度 / 视觉档位。
代码位置：`android/src/com/lc/phoneharness/Motion.java`（新，动效令牌 + 工厂）、
`android/src/com/lc/phoneharness/Theme.java`（新增视觉令牌，未删任何既有成员）。

范围声明：本卡只交付令牌与工厂，**未改任何 Activity**。页面接入由后续 screen 卡负责。
纪律：不改技术栈/工程结构；业务逻辑、路由、数据结构、状态管理、接口一律未动；未引入任何新依赖。

## 证据分级

| 标记 | 含义 |
| --- | --- |
| `[测]` | 本项目现有实现的实测值，注释带 `file:line`，值原样搬进令牌（语义不变） |
| `[参考]` | 参考 APK 2.6.1 进包资源实测，注释带 `official/... file:line` |
| `[库]` | 由参考 APK 携带的库版本推出的公开常量（material3 1.4.0 / Compose 1.11.4）。**本机无外网，未联网复核**，见 §SPEC_PENDING |
| `[测·主机]` | 直接读 DSH 主机 harness（Web 前端，asar 内 CSS/JS）拿到的值，注释带选择器与 asar 路径 —— 本项目的目标就是「与主机一致」，故这一级高于 `[参考]`（参考 APK） |
| `TODO(spec)` | 需要动态采集（A1–A12）或规格裁决的值，先给保守占位 |

参考库版本（来自 `META-INF/androidx.*.version`，权威）：compose.animation / animation-core / foundation / material / ui = **1.11.4**；
**material3 = 1.4.0**；navigation-compose 2.8.5；activity-compose 1.13.0；lifecycle 2.10.0；dynamicanimation 1.0.0；interpolator 1.0.0。

## A. 时长令牌：转场 / 抽屉 / 弹层（全部 `[测]`）

| 令牌 | 值(ms) | 语义 | 依据 |
| --- | --- | --- | --- |
| `Motion.DUR_NAV_ENTER` | 200 | 新页进场 | `res/anim/nav_enter.xml:6` |
| `Motion.DUR_NAV_EXIT` | 170 | 旧页退场 | `res/anim/nav_exit.xml:6` |
| `Motion.DUR_NAV_POP_IN` | 220 | 返回时露出页回位 | `res/anim/nav_pop_in.xml:6` |
| `Motion.DUR_NAV_POP_OUT` | 220 | 返回时退场页 | `res/anim/nav_pop_out.xml:6` |
| `Motion.DUR_DRAWER_IN` | 220 | 抽屉打开 | `MainActivity.java:2354`、`:2356` |
| `Motion.DUR_DRAWER_OUT` | 190 | 抽屉关闭 | `MainActivity.java:2379`、`:2380` |
| `Motion.DUR_SHEET_IN` | 200 | 弹层进入 | `Seats.java:2157`、`:2158` |
| `Motion.DUR_SHEET_OUT` | 150 | 弹层退出 | `Seats.java:2167`、`:2174` |
| `Motion.DUR_OVERLAY_IN` | 140 | 页内浮层淡入 | `MainActivity.java:1732` |
| `Motion.DUR_SCRIM_IN` | 220 | 遮罩淡入 | `MainActivity.java:2356` |
| `Motion.DUR_SCRIM_OUT` | 190 | 遮罩淡出 | `MainActivity.java:2380` |

### A2. 参考 APK 自建转场令牌（`[参考]` MOTION-SPEC §3.1 / §3.3 / §3.4 / §6.1-6.3）

这一组是**参考 APK 自己的**转场/面板时长（来自 `mh7` / `c44` / `x62` / `w2b` 四组 `TweenSpec`），
与 §A 的本项目实测值并存：屏间转场优先用这一组（它才是「对齐参考」的语义），仅当要保持本项目现网观感时才用 §A。

| 令牌 | 值(ms) | 语义 | 依据 |
| --- | --- | --- | --- |
| `Motion.DUR_PAGE_IN` / `DELAY_PAGE_IN` | 195 / 105 | 全屏页 / 抽屉「进」（与出合计 300） | `defpackage/mh7.java:20` `fadeIn(tween(195ms, 105ms, LinearOutSlowIn))` |
| `Motion.DUR_PAGE_OUT` | 105 | 全屏页「出」（delay 0） | `defpackage/mh7.java:21` `fadeOut(tween(105ms, 0, FastOutLinearIn))` |
| `Motion.DUR_PANEL_IN` / `DELAY_PANEL_IN` | 250 / 200 | 底部面板 / 弹层进 | `defpackage/mh7.java:16` `new zza(250, 200, be3(0.0f,0.0f,0.0f,1.0f))` |
| `Motion.DUR_PANEL_OUT` | 200 | 底部面板出 | `defpackage/mh7.java:17` `new zza(200, 0, be3(0.3f,0.0f,1.0f,1.0f))` |
| `Motion.DUR_PANEL_ALT_IN` | 120 | 长/短面板另一组：进 | `defpackage/c44.java:9` `tween(120ms,0,FastOutSlowIn)` |
| `Motion.DUR_PANEL_ALT_MID` | 150 | 长/短面板另一组：过渡 | `defpackage/c44.java:11` `tween(150ms,0,cubic-bezier(0.4,0,0.6,1))` |
| `Motion.DUR_MID_IN` / `DELAY_MID_IN` | 150 / 50 | 中转场进 | `defpackage/x62.java:57` `tween(150ms, delay 50ms, cubic-bezier(0.3,0,1,1))` |
| `Motion.DUR_SLIDE_IN` / `DELAY_SLIDE_IN` | 125 / 50 | 滑入（长/短场景） | `defpackage/w2b.java:808` `slideIn(tween(125ms, 50ms, LinearOutSlowIn))` |
| `Motion.DUR_SLIDE_OUT` | 150 | 滑出 / settle | 同上 `defpackage/w2b.java:808` `tween(150ms,0,LinearOutSlowIn)` |

注：MOTION-SPEC §4.4/§4.5/§5.3/§7.1/§3.5/§3.6 与本表对应的**幅度/半径/对称性**仍是 `[待实测]`（A1–A12 全未采集），
所以令牌层只定了「时长与曲线」，位移/缩放幅度仍取本项目实测值（§G）或占位。

## B. 时长令牌：Material3 1.4.0 阶梯（`[库]`，未联网复核）

`DUR_SHORT1..4` = 50 / 100 / 150 / 200；`DUR_MEDIUM1..4` = 250 / 300 / 350 / 400；
`DUR_LONG1..4` = 450 / 500 / 550 / 600；`DUR_EXTRALONG1..4` = 700 / 800 / 900 / 1000（单位 ms）。
`Motion.DUR_COMPOSE_DEFAULT` = 300 = Compose 1.11.4 `AnimationConstants.DefaultDurationMillis`，即「没细挑档位」的兜底。

用法：`Motion.DUR_SHORT4` 是小型状态切换（chip / 勾选 / 开关）的常用档；模态/抽屉落到 `DUR_MEDIUM1..3`；
超过 `DUR_MEDIUM4`(400) 需要规格理由 —— animate 技能 Never Ship 表禁止「无理由超 300ms」，故 UI 主体动效目标区间是 [100, 300]。

## C. 交互反馈 / 循环（多数已换成 `[参考]`，见 MOTION-SPEC §4 / §5）

| 令牌 | 值(ms) | 语义 | 依据 |
| --- | --- | --- | --- |
| `Motion.DUR_RIPPLE` | 15 | 涟漪快档（按钮/列表项按下） | `[参考]` MOTION-SPEC §4.1 ← `official/jadx-out/sources/defpackage/z09.java:6` `tween(15ms, 0, l33)`，使用方 `yp3` / `v4` |
| `Motion.DUR_MICRO_IN` | 20 | 微交互进 | `[参考]` MOTION-SPEC §4.3 ← `defpackage/jw1.java:77` `tween(20ms,0,l33)` |
| `Motion.DUR_MICRO_OUT` | 30 | 微交互出 | `[参考]` MOTION-SPEC §4.3 ← `defpackage/jw1.java:77` `tween(30ms,0,l33)` |
| `Motion.DUR_LIST_FB_IN` | 45 | 列表项反馈进 | `[参考]` MOTION-SPEC §4.2 ← `defpackage/v4.java:579` `tween(45ms,0,l33)` |
| `Motion.DUR_LIST_FB_OUT` | 150 | 列表项反馈 settle | `[参考]` MOTION-SPEC §4.2 ← `defpackage/v4.java:586` `tween(150ms,0,l33)` |
| `Motion.DUR_LIST_ITEM_IN` | 150 | 错峰单条时长 | = `DUR_LIST_FB_OUT`（参考的列表项 settle 档） |
| `Motion.DUR_SHIMMER` | 600 | 骨架 shimmer 单程 | `[参考]` MOTION-SPEC §5.1 ← `defpackage/cb0.java:18-22` `b = new zza(600, 200, be3(0.42,0,0.58,1))` |
| `Motion.DELAY_SHIMMER` | 200 | 骨架 shimmer 起始延迟 | `[参考]` 同上 `cb0.java:18-22` 的 delay 200 |
| `Motion.DUR_PRESS` | 110 | 按压反馈 | `TODO(spec)` **非参考证据**：animate 技能表 100–160ms 的中值；MOTION-SPEC §4.4（A7 按压缩放幅度）未采集 |
| `Motion.DUR_TOGGLE` | 150 | 开关 / chip 状态切换 | `TODO(spec)`：MOTION-SPEC §9.1/§9.3（A11 Switch / A12 Chip）未采集 |
| `Motion.DUR_LOADING_LOOP` | 900 | 加载循环一圈 | `TODO(spec)`：MOTION-SPEC §5.2（A8）未采集 |
| `Motion.DUR_HOST_SPIN_LOOP` | 1500 | 会话「进行中」圆环：整圈旋转 + 弧长呼吸（12→24→12） | `[测·主机]` `node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-BxpfOGf3.css` 内 `._spinnerMotion_1i3xo_42{animation:_dsh-state-dot-spin_1i3xo_1 1.5s linear infinite}` 与 `._spinnerArc_1i3xo_48{animation:_dsh-state-dot-dash_1i3xo_1 1.5s ease-in-out infinite}`。**与 `DUR_LOADING_LOOP`(900) 不是一回事**：后者是 SWE 猜值，前者是抄来的真值 |

## D. 错峰

| 令牌 | 值 | 依据 |
| --- | --- | --- |
| `Motion.STAGGER_STEP` | 40ms | 兜底步进（**非参考证据**）：animate 技能 Never Ship 表「禁止一切同时入场，要 30–80ms stagger」 |
| `Motion.STAGGER_DOT` | 100ms | `[参考]` 参考侧自己的错峰步长：MOTION-SPEC §5.2 ← `defpackage/w2b.java:784-785` 三点打字动画 `infiniteRepeatable(..., StartOffset(-100ms/-200ms))` |
| `Motion.STAGGER_MAX` | 240ms | 长列表尾部封顶，避免第 20 项等 800ms |

## E. 缓动令牌

**参考 APK 的缓动槽位共六条**：`z24.java:8-11` 四条（standard / decelerate / accelerate / linear）+ `mh7.java:15-17` 两条强调进/出（本机逐行复核行号）。
令牌层只包含这六条 —— 任何第三方最佳实践曲线（Emil Kowalski 表、Ionic drawer 曲线等）**已全部移除**，因为本任务是对齐参考 APK，不是自选曲线。
六条里有五条是强证据，只有 `LINEAR` 的语义标 `[未证实]`（`l33` 是 R8 合成类，不是 Compose 的 LinearEasing 对象）；细节见下表末三行。

| 令牌 | cubic-bezier | 证据 | 实测 f(0.5) |
| --- | --- | --- | --- |
| `Motion.EASE_STANDARD` | (0.4, 0.0, 0.2, 1.0) | `official/jadx-out/sources/defpackage/z24.java:8` + `official/apktool-out/res/interpolator/fast_out_slow_in.xml:2`（两条独立来源同值） | 0.7756 |
| `Motion.EASE_DECELERATE` | (0.0, 0.0, 0.2, 1.0) | `official/jadx-out/sources/defpackage/z24.java:9` `be3 b = new be3(0.0f,0.0f,0.2f,1.0f)` —— **进场** | 0.8392 |
| `Motion.EASE_ACCELERATE` | (0.4, 0.0, 1.0, 1.0) | `official/jadx-out/sources/defpackage/z24.java:10` `be3 c = new be3(0.4f,0.0f,1.0f,1.0f)` —— **出场** | 0.3248 |
| `Motion.LINEAR` | 线性 | `[未证实]` `official/jadx-out/sources/defpackage/z24.java:11` `l33 d = new l33()` —— `l33` 逐行核对为 **R8 合成类**（`public final synthetic class l33 implements x24`，含 `int a = 19` 与 bridge 方法），**不是 Compose 的 LinearEasing**；只能断言该槽位需要线性曲线，按线性实现，语义待复核 | — |
| `Motion.EASE_EMPH_DECEL` | (0.0, 0.0, 0.0, 1.0) | `official/jadx-out/sources/defpackage/mh7.java:16` `a = new zza(250, 200, new be3(0.0f,0.0f,0.0f,1.0f))`；`zza.java:10` `zza(int i, int i2, x24)` = (时长, 延迟, 缓动) → 250ms / 延迟 200ms —— **进**侧 | 0.8899 |
| `Motion.EASE_EMPH_ACCEL` | (0.3, 0.0, 1.0, 1.0) | `official/jadx-out/sources/defpackage/mh7.java:15` `be3 be3Var = new be3(0.3f,0.0f,1.0f,1.0f)` + `mh7.java:17` `b = new zza(200, 0, be3Var)` → 200ms / 延迟 0 —— **出**侧 | 0.3720 |
| `Motion.EASE_SHIMMER` | (0.42, 0.0, 0.58, 1.0) | `[参考]` MOTION-SPEC §5.1 ← `official/jadx-out/sources/defpackage/cb0.java:18-22` `a = new be3(0.42f,0.0f,0.58f,1.0f)`（shimmer 扫光曲线） | 0.5000 |
| `Motion.EASE_PANEL_ALT` | (0.4, 0.0, 0.6, 1.0) | `[参考]` MOTION-SPEC §6.3 ← `official/jadx-out/sources/defpackage/c44.java:11` `new be3(0.4f,0.0f,0.6f,1.0f)` | 0.5000 |

方向性核对：`EASE_DECELERATE`（进场）与本项目 `nav_enter.xml` 原用的 `@android:interpolator/decelerate_cubic` 同向；
`EASE_ACCELERATE`（出场）与 `nav_exit.xml` 原用的 `@android:interpolator/accelerate_cubic` 同向 —— 即「令牌没改变现有转场的观感方向，只是把它换成参考的精确控制点」。

上面 6 条曲线都由 `Motion.cubicBezier()`（自实现，与 Compose `CubicBezierEasing` 同解析式 x(u)=3(1-u)²u·x1+3(1-u)u²·x2+u³，牛顿迭代 8 次反解 u）生成，本机数值核对：f(0)=0、f(1)=1、区间内单调。
需要交给平台/XML 的场景可用 `Motion.pathBezier(x1,y1,x2,y2)`（`android.view.animation.PathInterpolator`，API 21+）。

对应资源 `android/res/interpolator/`（已随 APK 打包）：

| 文件 | 控制点 | 证据 |
| --- | --- | --- |
| `ease_standard.xml` | 0.4 / 0.0 / 0.2 / 1.0 | `z24.java:8` + `fast_out_slow_in.xml:2` |
| `ease_decelerate.xml` | 0.0 / 0.0 / 0.2 / 1.0 | `z24.java:9` |
| `ease_accelerate.xml` | 0.4 / 0.0 / 1.0 / 1.0 | `z24.java:10` |
| `ease_linear.xml` | —（linearInterpolator） | `z24.java:11`（`[未证实]`，见上表） |
| `ease_emph_decel.xml` | 0.0 / 0.0 / 0.0 / 1.0 | `mh7.java:16` |
| `ease_emph_accel.xml` | 0.3 / 0.0 / 1.0 / 1.0 | `mh7.java:15` + `mh7.java:17` |
| `ease_shimmer.xml` | 0.42 / 0.0 / 0.58 / 1.0 | `cb0.java:18-22` |
| `ease_panel_alt.xml` | 0.4 / 0.0 / 0.6 / 1.0 | `c44.java:11` |

本轮修订：删除了 `ease_out.xml` / `ease_in_out.xml` / `ease_drawer.xml`（那三条来自 animate 技能引用的第三方曲线表，参考 APK 里不存在）。

## F. 弹簧（`[参考]` 参考 APK 的 um9 三档 + legacy 自拟档）

参考 APK 真的在用弹簧（不是纯时长）：`official/jadx-out/sources/defpackage/um9.java:10-11`，
其中 `yg4` = Compose `SpringSpec(dampingRatio, stiffness, visibilityThreshold)`、`k53.U0` = 三参数构造（见 MOTION-SPEC §2.1/§2.3 符号表）。

| 令牌 | 值 | 依据 |
| --- | --- | --- |
| `Motion.SPRING_MASS` | 1 | `[库]` Compose `Spring` 默认质量（物理插值器的 mass 参数） |
| `Motion.SPRING_RATIO_SOFT` / `SPRING_STIFFNESS_SOFT` | 0.6 / 400 | `[参考]` MOTION-SPEC §2.3 ← `defpackage/um9.java:10` `new yg4(0.6f, 400.0f)`（M3 单弹簧令牌） |
| `Motion.SPRING_RATIO_A` / `SPRING_STIFFNESS_A` | 0.2 / 1000 | `[参考]` MOTION-SPEC §2.3 ← `defpackage/um9.java:11` `k53.U0(0.2f, 1000.0f, null, 4)`（跟手、允许轻微过冲） |
| `Motion.SPRING_RATIO_B` / `SPRING_STIFFNESS_B` | 1.0 / 130 | `[参考]` 同上 `k53.U0(1.0f, 130.0f, null, 4)`（临界阻尼、慢而稳） |
| `Motion.SPRING_RATIO_C` / `SPRING_STIFFNESS_C` | 0.8 / 300 | `[参考]` 同上 `k53.U0(0.8f, 300.0f, null, 4)`（默认匀滑） |
| `Motion.SPRING_RATIO_700` / `SPRING_STIFFNESS_700` | 0 / 700 | `[参考]` MOTION-SPEC §2.4 f1b 组 ← `defpackage/f1b.java:1004` `spring(0, 700, null)` |
| `Motion.SPRING_STIFFNESS` / `SPRING_DAMPING` / `DUR_SPRING` | 300 / 28 / 500ms | **legacy（非参考证据）**：首轮自拟，保留以免破坏已按此口径调参的调用方 |

**接线口径**：新页面优先用 um9 三档（`spring(1f, 1000f, 2f*0.2f*sqrt(1000f))` 这类由 ratio 换算的调法见 §I.8 示例）；
`Motion.spring(mass, stiffness, damping)` 是解析解插值器，ratio → damping 的换算是 `damping = 2 * ratio * sqrt(mass * stiffness)`（与 Compose 同一口径）。

本机纯标准库数值实测（`springValue` / `springSettleMs` 的解析式）：
zeta = 0.8083、w0 = 17.3205 rad/s、wd = 10.1980、**过冲 1.340%**、整定时间 **0.4934s**、t=T 处残差 9.89e-4。
`Motion.springSettleMs(1f, 300f, 28f)` 返回 493，与手算一致。

**为什么弹簧不用贝塞尔拟合**：本机做过一轮最小二乘（41 采样点、目标函数=最大绝对误差、统一时长口径），
最好结果 `cubic-bezier(0.450, 1.500, 0.200, 1.0)`：T=0.4s 时最大误差 27.28%（26dp 行程 = 7.09dp）、
T=0.5s 时 14.67%（3.81dp）。单段三次贝塞尔表达不了「起手极快 + 轻微过冲」这一对形状，故改用解析插值器
（`Motion.spring(mass, stiffness, damping)`），无拟合误差。

## G. 幅度令牌

| 令牌 | 值 | 依据 |
| --- | --- | --- |
| `Motion.NAV_SLIDE_IN` | 0.09 | `res/anim/nav_enter.xml:8` fromXDelta="9%p" |
| `Motion.NAV_SLIDE_BACK` | 0.08 | `res/anim/nav_push_out.xml:8` toXDelta="-8%p" |
| `Motion.SHEET_OFFSET_DP` | 26dp | `Seats.java:2153` |
| `Motion.SHEET_EXIT_OFFSET_DP` | 30dp | `Seats.java:2167`（与进场 26dp 非对称，见 §SPEC_PENDING） |
| `Motion.HERO_OFFSET_DP` | 22dp | `MainActivity.java:374` |
| `Motion.ENTER_ALPHA` | 0.86 | `res/anim/nav_enter.xml:4` fromAlpha |
| `Motion.ENTER_ALPHA_SOFT` | 0.90 | `res/anim/nav_pop_in.xml:4` fromAlpha |
| `Motion.SCRIM_ALPHA` | 0.60 | `MainActivity.java:2356` alpha(0.6f) |
| `Motion.DISABLED_ALPHA` | 0.45 | `MainActivity.java:766`、`ChatActivity.java:2947` |
| `Motion.DIM_ALPHA` | 0.55 | `Seats.java:2327` |
| `Motion.PRESS_SCALE` | 0.97 | animate 技能：入场不得用 scale(0)，下压取 0.9–0.97 |
| `Motion.PANEL_SCALE_IN` | 0.96 | **[待实测·归属未定]** —— 参考侧没有任何一条已确认为 Dialog 进场的缩放幅度证据（A1–A12 未采集）；0.96 只满足技能硬规则「入场从 scale(0.9–0.97) + opacity:0 起，禁 scale(0)」。结构相近的候选是 EMPH 对 `mh7.java:15-17`，但它被哪个 UI 消费未确认（re-motion 复核中）。**归属确认前不得描述成本值已对齐参考** |
| `Motion.SHIMMER_MIN_ALPHA` / `MAX` | 0.55 / 1.00 | `TODO(spec)`，待 A8 |

## H. 视觉令牌（`Theme.java` 新增，未删任何既有成员）

- **字号层级**：`TYPE_XL`22 / `TYPE_L`19 / `TYPE_M`17 / `TYPE_S`16 / `TYPE_BODY`15 / `TYPE_BODY_S`14 /
  `TYPE_LABEL`13 / `TYPE_LABEL_S`12 / `TYPE_CAPTION`11 / `TYPE_MICRO`10 / `TYPE_TINY`9（sp）。
  依据：全库字号分布实测（12sp 39 次最多、15sp 20 次、22sp 仅 `PairActivity.java:61`）。
  注意 `Theme.text()` 只在 **>= 14sp** 才乘 fontScale（`Theme.java:197`），令牌里 11/12/13sp 不受字体大小影响。
- **圆角**：`RADIUS_NONE`0 / `XS`2 / `S`6 / `M`8 / `L`10 / `XL`12 / `2XL`14 / `3XL`16 / `4XL`18 / `5XL`20 / `6XL`22 / `7XL`24 / `8XL`26 /
  `9XL`28 / `FULL`999。依据：`round()/roundStroke()` 半径分布（`Seats.java:2214`=2、`NewSessionActivity.java:155`=26、`ChatActivity.java:413`=28、`MainActivity.java:1532`=0）。
- **间距**：`SPACE_2/4/6/8/10/12/14/16/18/20/24/26/44`。依据：`dp()` 高频值（6dp 89 次、8dp 82 次、14/16dp 各 76 次、44dp 底部安全区 16 次）。
- **描边**：`STROKE_CARD`0.8 / `STROKE_HAIRLINE`0.7 / `STROKE_SOLID`1（前两者会被 `Math.max(1, dp(x))` 兜到 1px 以上，见 `Theme.java:153`、`Theme.java:287`）。
- **新增颜色**：`Theme.skeleton`（浅 #EDEEF0 / 深 #232323）、`Theme.skeletonHi`（浅 #F7F8FA / 深 #2E2E2E）、`Theme.scrim`（#99000000，= `Motion.SCRIM_ALPHA`）。
  前两者 `TODO(spec)`，等 A8 骨架采集后校正；`scrim` 与实测 0.6 保守对齐。

## H2. 会话状态圆环（`StateRing.java` —— 逐字对齐 DSH 主机 harness）

主机的「这条对话还没跑完」指示器是一个 14dp 的 SVG 圆环：**整圈匀速旋转** + **弧长呼吸**（两段 1.5s 同时起跑）。
`StateRing` 是它的自绘复刻（不用 SVG/矢量库，一个 `View` + `drawArc`），值全部取自 asar 内 CSS，不做「差不多」估计：

| 主机 CSS（`index-BxpfOGf3.css`，asar 内 `@deepseek-ai/dsh-web-frontend/dist/assets/`） | StateRing 常量 | 值 |
| --- | --- | --- |
| `<svg viewBox="0 0 24 24" width={14}>` + 两个 `<circle r="9.5">` | `BOX=24` / `RADIUS=9.5` / `SIZE_DP=14` | 24 网格、半径 9.5、14dp |
| `.stroke-width: 2` | `STROKE=2` | 2（随 14/24 缩放） |
| `._spinnerTrack{opacity:.25}` | `TRACK_ALPHA=64` | 25% 透明度底环 |
| `@keyframes _dsh-state-dot-spin{to{transform:rotate(360deg)}}` `1.5s linear infinite` | `Motion.DUR_HOST_SPIN_LOOP=1500` + `angle=phase*360` | 匀速整圈 |
| `@keyframes _dsh-state-dot-dash{0%{stroke-dasharray:12 150;stroke-dashoffset:0}50%{...24 150...-6}to{...12 150...0}}` `1.5s ease-in-out` | `DASH_ON_MIN=12` / `DASH_ON_MAX=24` / `DASH_OFFSET_MID=-6` / `Motion.EASE_SHIMMER`=(.42,0,.58,1) | 弧长 72.4°→144.8° 呼吸，起点同时前移 36.2° |
| `@media (prefers-reduced-motion: reduce){animation:none; stroke-dasharray:18 150; stroke-dashoffset:-3}` | `DASH_ON_STILL=18` / `DASH_OFFSET_STILL=-3` + `Motion.reducedMotion()` | 静态 108.6° 弧 |
| JS `HD()` 把所有 spinner 的 `startTime` 置 0（多 spinner 相位同步） | `private static final long EPOCH = SystemClock.uptimeMillis()` | 全 App 共用同一相位基准 |
| `aria-hidden="true"` | `setImportantForAccessibility(NO)` | 不朗读 |

宿主接法（`MainActivity.drawerRow`）：行首固定一个 20dp 状态槽 —— 多选态放 `selectDot`、`status=="running"` 放 `StateRing`、
其余放**空 View 占位**（空位也占住，否则有会话在跑时整列标题会左右跳一格）。标题右侧原先那个 `"●"` running 圆点已删除：状态只由左侧环表达，
不再一处两个指示器。`render()` 的列表指纹（`listSignature`）已包含 `status`，否则 turn 结束后不会重画、环会一直转到下次进页面。

`StateRing.onMeasure` 必须按 measure spec 取值（`EXACTLY` 用给定尺寸、`AT_MOST` 用 `min`），因为它被塞进 `LayoutParams(20dp, 20dp)` 的槽里：写死 `setMeasuredDimension(42, 42)` 会无视槽宽，环一出现整列标题就左移 6dp（实测有环行 `ink_x=121..123`、无环行 `140..142`）。改对之后所有行标题左缘统一 `139..142`，环在 `x=56..116` 的槽内居中成 `x=65..102`。环本身仍按 14dp 画（`onDraw` 的 `diameter = min(sizePx, view)`），槽多大都不影响环径。

证据图：`shots/ring/state-ring-motion.gif`（24 帧真实连拍，帧间时长取设备时间戳）、`state-ring-light.png` / `state-ring-dark.png`（两套外观 2× 裁切）。

`status` 只来自 `GET /v1/sessions`（列表不推流，SSE 只走单会话详情），所以抽屉里**有 running 时每 5s 重新拉一次**
（`RUNNING_POLL_MS`，`syncRunningPoll()` 在 onResume / load 回调 / openDrawer 处挂；closeDrawer 与 onPause 摘掉）—— 环停下来的唯一依据就是这一次拉取的新 `status`。

### H2b. 两处会话列表共用同一条行首槽（APK 0.6.17）

App 里有**两个**会话列表：首页抽屉（`MainActivity.drawerRow`，1611 行那一处）与聊天页抽屉（`ChatActivity.drawerRow`）。
它们拉的是同一个接口（`GET /v1/sessions`），行数据也同一份（`status` / `itemCount` 都在里面），但 0.6.16 之前只有首页那一侧有状态槽，
聊天页抽屉是「标题从 12dp 起排」——于是同一批会话在两页里的文字左缘差 26dp，而且**聊天页里根本没有环 / 绿点**：

| 位置 | 列表内衬 | 行内衬 | 行首槽 | 标题左缘 |
| --- | --- | --- | --- | --- |
| 首页抽屉（0.6.13 起） | 8dp | 10dp | 20dp 槽 + 8dp 右距 | **46dp ≈ 138px** |
| 聊天页抽屉（0.6.16 及以前） | 8dp | 12dp | 没有 | **20dp ≈ 60px** |
| 聊天页抽屉（0.6.17） | 8dp | 10dp | 20dp 槽 + 8dp 右距 | **46dp ≈ 138px** |

修法：把 `ChatActivity.drawerRow` 的行首槽逐字复刻首页那一份（`running` → `StateRing`、`failed` → `StateDot(t.bad)`、
`itemCount>0` → `StateDot(t.ok)`、其余 → **空 `View` 占住槽位**），`ChatActivity` 的分组标题内衬 12dp → 10dp，
两页当前会话的主色 `accentSoft` 高亮保持不变。

关键约束（这次的 bug 就是它在起作用）：**标记消失时槽位不能跟着消失**。槽位一旦按状态切换成 `GONE` 或不 addView，
「没有绿点」的那些行就会整列向左吸回 20dp —— 用户看到的正是「绿点消失以后文字向左对齐」。空 `View` 占位是为了
让「有标记 / 没标记」两批行的标题落在同一条竖线上，和主机的固定左侧指示列一致。

实测（1080×1920 / density 3，浅色）：两页每一行标题左缘都是 **x=139..142**，无论该行是绿点、圆环还是空槽
（空槽行 `ink_x=140`；绿点行点是 `x=75..92`、标题 `140`；圆环行环是 `x=64..106`、标题 `141`）。
证据图：`shots/ring/session-list-align-before-after.png`（左＝0.6.16 聊天页抽屉文字顶到 20dp，右＝0.6.17 同位置保留 46dp 槽）、
`shots/ring/chat-drawer-states.png`（聊天页抽屉四态同框：4 绿点 + 2 空槽 + 2 圆环）。

### H2c. 聊天页抽屉与首页同构：顶栏搜索 + chips、底栏用户行（APK 0.6.18）

0.6.17 之前，聊天页抽屉只有一行「会话」标题（16sp）+ 右上角 ⊕，下面直接是列表；首页抽屉则是「搜索胶囊 + 工作区 chips」
在上、用户行 + ⋯ 在下。两页同一个数据源却两套骨架，切换页面时顶/底两栏整块消失。0.6.18 把首页那两栏**逐字搬过去**，
聊天页抽屉删掉「会话」标题与右上 ⊕：

| 位置 | 首页抽屉（蓝本） | 聊天页抽屉 0.6.17 及以前 | 聊天页抽屉 0.6.18 |
| --- | --- | --- | --- |
| 顶栏 | 搜索胶囊 38dp + chips 行 | 无 | **搜索胶囊 38dp + chips 行**（左右边距 14dp，topMargin 14 / bottomMargin 8） |
| 标题 | 无 | 「会话」16sp + 右上 ⊕ | **删掉**（聊天页顶栏 topBar 已有 ⊕ 新建，抽屉里那个是重复入口） |
| 列表 | 分组头 + 20dp 行首槽 | 分组头 + 20dp 行首槽（0.6.17 补） | 不变 |
| 底栏 | 34dp 头像 + 昵称 + host 行 + ⋯ 菜单 | 无 | **同构**（整行进设置，⋯ 弹五项菜单） |

实现要点（ChatActivity.java）：drawerBody() = drawerHeadBox + list + drawerUserRow()；renderDrawerHead() 按 drawerSearching
在胶囊与 drawerSearchBar()（左侧返回箭头 + EditText）之间切换；drawerChips() 的目录集来自 loadCatalog()（GET /v1/catalog →
workspaces[].cwd/title）+ 会话里出现但未登记的 cwd，与首页 workspaceChips() 同规则；筛选项 drawerWs **只存在 Activity 内**，
不写回 Prefs —— 否则在聊天页点一下 chip 会改掉首页的默认工作区；drawerPool() 先按工作区再按关键词（drawerQuery，匹配 title /
lastText）过滤，空态分两种（有 query → 「没有找到相关对话」，只有工作区 → 该工作区空态）；返回键顺序是先退检索态、再退抽屉，
closeDrawer() / closeDrawerNow() 收尾一律 resetDrawerSearch()。

实测（1080×1920 / density 3，浅色 v4、深色 d2，抽屉宽 0.82 屏 = 886px）：搜索胶囊文字 ink 从 x=85 起、chips 行 y=209..245、
分组头 ink x=56、**每一行标题 ink 仍是 x=140..142**（与 H2b 同值，因为行首槽规格没动）、底栏头像 ink x=48..150、⋯ 到 x=821。
深色下胶囊是 surfaceAlt、chips 选中态 accent 文字 + accentSoft 底，与首页深色逐项一致。

证据图：shots/ring/chat-drawer-light.png、shots/ring/chat-drawer-dark.png（886×1920，抽屉整幅：顶栏 / 列表 / 底栏三段齐全）。

### H2d. 绿点 = 已完成且未读（APK 0.6.19，`Read.java` 本地记账）

H2b 里那个绿点原先是「跑过至少一轮（`itemCount > 0`）」—— 跑过就永远绿。0.6.19 起它有了已读语义：
**绿点 = 这个会话已经跑完、而且完成之后我还没点进去看**；点开这一行就变已读，绿点消失。

主机侧没有已读状态（`GET /v1/sessions` 的行只有 `id / title / cwd / updatedAt / status / lastText / itemCount / pinned / archived`，
见 `plugin/lib/runtime.js:664-677`），所以已读只能是手机本地的一笔账，落在 `Read.java`：

| 判定 | 条件 | 标记 |
| --- | --- | --- |
| ongoing | `status == "running"` | 旋转圆环 `StateRing` |
| error | `status == "failed"` | 红点 `StateDot(t.bad)` |
| done 且未读 | `itemCount > 0 && itemCount > seen(id)` | 绿点 `StateDot(t.ok)` = `#22C55E` |
| done 已读 | `itemCount <= seen(id)` | 空槽（只为占住 20dp，不画点） |

记账键是 **`itemCount` 而不是 `updatedAt`**（`Read.PREFIX = "readN:"`，存进 `Prefs.FILE` 同一个 `SharedPreferences`）：
`itemCount` 是时间线条数、单调递增、两端同一份 projection，不受手机与电脑时钟差影响；`updatedAt` 会被改名、置顶这类
纯元数据操作碰一下，用它会出现「什么都没说也算新消息」。`Read.markRead` 只往前推、绝不回退 —— 页面里后到的全量详情，
条数可能暂时比列表行少几条，回退会把刚点的已读又翻成未读。

四处接线（两页列表共用同一笔账，所以在一页点掉，另一页也同步消失）：

- 首页抽屉 `MainActivity.java:1522` `final boolean unread = Read.unread(this, row);` → 槽分支只有 `unread` 才画绿点，其余空 `View` 占位；
- 首页行点击 `MainActivity.java:1560-1563`：`Read.markRead(MainActivity.this, row); open(row);`（多选态点行只切换勾选，不记账）；
- 聊天页抽屉 `ChatActivity.java:3990` 同一个 `Read.unread`，行点击 `ChatActivity.java:4023` 先 `Read.markRead(...)` 再 `switchTo(row)`；
- 聊天页 `applyDetail(...)`（`ChatActivity.java:1011`）在 `setStatus(next)` 之后、`renderAll()` 之前 `Read.markRead(this, sessionId, items.size());`
  —— **正在看这一页就等于读过**：这一轮的完成结果就在眼前，切回抽屉不该再挂绿点。
- 列表指纹 `MainActivity.java:2064` 把 `itemCount > 0 ? '1' : '0'` 换成 `Read.unread(this, row) ? '1' : '0'`：点行变已读、
  以及空会话在两个 5s 轮询之间跑完，都靠这一位触发重建；仍只记 0/1 不记条数（条数一轮里反复变会让每次轮询都重建整张列表）。

实测（1080×1920 / density 3，设备 <DEVICE> / 23113RKC6C / Android 15）：

- 未读态：4 条跑过一轮的会话挂绿点，「鲸域网站开发」「云服务器安全」「抖音工作流测试」「家庭网络拓扑结构」（`itemCount=0`）无点；
- 点「某个会话」进会话页再返回 → 该行绿点消失、其余行不动；设备端 `readN:session-<redacted>…` 记账成 `44`（该会话 `itemCount=44`）；
- 反向：新建一个只回 ok 的会话 → 自动挂绿点 → 点开 → 消失 → 用 `POST /v1/sessions/{id}/messages` 再发一轮 → 绿点自己回来；
- 抽屉不关的过渡：第三轮进行中该行是圆环（<TMP>/r7.png），跑完后**不关抽屉、5s 轮询自己**换成绿点（<TMP>/r8.png）；
- 深色：绿点仍是 `(34,197,94)` = `#22C55E`（与浅色逐位相同），已读/空会话行为不变（<TMP>/d1.png）。

证据图：`shots/ring/unread-state-light.png`（上排＝未读绿点 / 点开后无点，下排＝进行中圆环 / 跑完变绿点，抽屉不关的同一行前后对照）。
## I. 给 screen 同学的用法（照抄即可）

```java
// 1) 页面转场（替代 Nav 的 overridePendingTransition，JDK 侧统一曲线）
Motion.pageEnter(pageRoot, this);                       // 右移 9% + 0.86 起淡入，200ms ease-out
Motion.pageExit(pageRoot, this, () -> finishPage());    // 对称退场，170ms

// 2) 弹层（Seats 已用同一套数）
Motion.sheetIn(card, scrim, t);                         // 26dp 上浮 + 遮罩升到 0.60
Motion.sheetOut(card, scrim, t, () -> closeSheet());     // 现有实测行程 30dp
Motion.sheetOutSymmetric(card, scrim, t, () -> closeSheet()); // 对称版（按进来路径退），规格裁决后二选一

// 3) 抽屉
Motion.drawerIn(drawer, scrim, -drawerWidth);
Motion.drawerOut(drawer, scrim, -drawerWidth, () -> opened = false);

// 4) 按压反馈（不吞事件：onClick / onLongClick / 系统涟漪照常）
Motion.press(iconButton);                       // 缩放到 0.97
Motion.pressRipple(row, t, Theme.RADIUS_XL);     // 涟漪背景 + 按压反馈

// 5) 骨架 / 加载
ObjectAnimator a = Motion.shimmer(skeletonView); a.start();
ObjectAnimator b = Motion.loading(spinner);      b.start();
// 离开页面必须停：Motion.stop(a, b);
skeletonView.setBackground(Motion.shimmerBand(120f, t.skeleton, t.skeletonHi));

// 6) 列表错峰
for (int i = 0; i < rows.size(); i++) Motion.staggerIn(rows.get(i), i, t.dp(8f));

// 6b) 居中弹层（系统 Dialog 的 card）：show() 之后紧跟一行即可
dialog.show();                     // 业务原有的 show，顺序/分支不动
Motion.panelIn(card, this);        // [待实测·归属未定] scale 0.96→1 + alpha 0.90→1，120ms；曲线 EASE_DECELERATE 有据，幅度/时长无据（等 re-motion 定归属）；减少动效时只剩 100ms 淡入

// 7) 减少动效门（必须随动画一起交付）
int d = Motion.durMotion(this, Motion.DUR_SHEET_IN);   // 位移类：减少动效 -> 0
int f = Motion.durFade(this, Motion.DUR_OVERLAY_IN);   // 淡入淡出：减少动效 -> 最多 100ms
// 或直接用工厂（内部已过门）：Motion.pageEnter(pageRoot, this)
```

## J. SPEC_PENDING（等规格定值，代码里同名列在 `Motion.SPEC_PENDING`）

1. **M3 时长阶梯（`DUR_SHORT*` / `MEDIUM*` / `LONG*` / `EXTRALONG*`）与 `DUR_COMPOSE_DEFAULT`** —— 缓动侧已由字节码证据定稿（见 §E），
   时长侧还没有同等证据：本机外网不可用（`web_fetch` → `fetch failed`；`curl` → `http=000`；`web_search` 插件端点 401），
   且参考 APK 的 `androidx.compose.material3.tokens.MotionTokens` 字符串命中数 = 0（R8 已内联移除），无法从 dex 按名字取真值。
   **复核优先级：先等 re-motion 的 `official/MOTION-SPEC.md` 时长条目**，其次才联网比对 material3 `MotionTokens.kt` / Compose `AnimationConstants`。
   在此之前，§A 的实测时长是唯一带 `file:line` 证据的时长令牌，页面改版请优先用 §A。
2. **`DUR_PRESS` / `DUR_TOGGLE` / `DUR_LOADING_LOOP` / shimmer 透明度（`SHIMMER_MIN_ALPHA`/`MAX`）/ 全部位移缩放幅度** —— MOTION-SPEC 已到（§4.4/§4.5/§5.3/§7.1/§3.5/§3.6 与 §10 的 A1–A12）但 **A1–A12 全部 ☐ 未采集**，所以这些仍是占位；
   其中 `DUR_SHIMMER`(600) / `DELAY_SHIMMER`(200) / `DUR_LIST_ITEM_IN`(150) / `DUR_RIPPLE`(15) / `DUR_MICRO_*`(20/30) / `DUR_LIST_FB_*`(45/150) **已由 `[参考]` 证据定值**，见 §C。
   注：`official/VISUAL-SPEC.md` 在本轮内仍**不存在**（`official/` 下只有 `MOTION-SPEC.md` 与 `SPEC.md`），视觉令牌的可回填项等它落地。
3. **弹层行程 26dp（进）/ 30dp（出）非对称** —— 参考侧是否对称需要 A5/A6 帧级核对；代码里两个版本都给了。
4. **曲线统一的口径变化**（有意为之，需规格追认）：现网抽屉进场用 `DecelerateInterpolator`、遮罩无插值器、弹层用默认插值器；
   令牌层统一到参考的进场 `EASE_DECELERATE` / 退场 `EASE_ACCELERATE`；方向与现网一致，只有控制点被换成参考的精确值。
5. **`PANEL_SCALE_IN`(0.96) 与 `panelIn` 时长(120ms)** —— **[待实测·归属未定]**。lead 已逐行核过 mh7：
   `mh7.java:15-17` = a/b 是 **EMPH 对**（a = 250ms + 延迟 200 + cubic(0,0,0,1)；b = 200ms + 延迟 0 + cubic(0.3,0,1,1)）；
   `mh7.java:18-21` = c/d 是 **转场对**（c = 195ms + 延迟 105 + `z24.b`(0,0,0.2,1)；d = 105ms + `z24.c`(0.4,0,1,1)）。
   两条 EMPH 曲线的值本身没写错；但 a/b 到底被哪个 UI 消费尚未确认（re-motion 复核中），故 panelIn 的幅度与时长保持占位、注释明确标 [待实测·归属未定]。
   召点线索：`cv.java:34/37`、`q3.java:92/96`。
## K. 构建

`cd android && bash build.sh` → **绿**：`bin/dsh-phone.apk`，629198 bytes，
md5 `968d6daa1d4cdeddb817f42a7185472f`，versionName 0.6.13 (code 29)。
（本文件 §A–§L 描述的令牌层最后一次「只改令牌、不接线」的构建是 624942 B / `27641b75…`；接线批次见 §L 末两行。）
APK 内含 `classes.dex` 与 8 个 `res/interpolator/*.xml`：`ease_standard` / `ease_decelerate` / `ease_accelerate` / `ease_linear` /
`ease_emph_decel` / `ease_emph_accel` / `ease_shimmer` / `ease_panel_alt`。
```
[3/7] javac 红过一次：error: cannot find symbol LinearGradient（已修：补 import android.graphics.LinearGradient）
[4/7] d8 / [5/7] classes.dex / [6/7] zipalign / [7/7] 签名 → OK
```

## L. 修订记录

- **缓动换源（本轮）**：删除 `EASE_OUT`(0.23,1,0.32,1) / `EASE_IN_OUT`(0.77,0,0.175,1) / `EASE_DRAWER`(0.32,0.72,0,1) 与两个 `EASE_EMPHASIZED_*`（前三条来自 animate 技能引用的第三方曲线表，后两条无法联网复核），改为参考 APK 字节码直出的四条：standard / decelerate / accelerate / linear，证据 `official/jadx-out/sources/defpackage/z24.java:8-11`。
- 工厂接线随之更新：进场类 → `EASE_DECELERATE`，出场类 → `EASE_ACCELERATE`，`EASE_STANDARD` 保留给无明确方向的屏上过渡。
- 资源目录同步：`res/interpolator/` 从「4 个（含 3 条无证据曲线）」改为「4 个（全部带 `z24.java:8-11` 行号证据）」。
- 修正 §E 中 decelerate / accelerate 在 x=0.5 处的实测值：0.8992 / 0.4508 → **0.8392 / 0.3248**（JS 镜像实算）。
- **补两条强调曲线（本轮）**：`EASE_EMPH_DECEL`(0,0,0,1) 与 `EASE_EMPH_ACCEL`(0.3,0,1,1)，来自 `official/jadx-out/sources/defpackage/mh7.java:15-17`（本机逐行复核；lead 给的 mh7.java:18-23 是错行号，实际字面量在 15-17），各配 `res/interpolator/ease_emph_*.xml`。命名沿用 lead 口径；控制点与本机已知的 M3 EmphasizedDecelerate(0.05,0.7,0.1,1) / EmphasizedAccelerate(0.3,0,0.8,0.15) 不同，以 mh7 字面值为准。
- **`LINEAR` 证据降级**：`z24.java:11` 的 `l33` 逐行核对是 R8 合成类（`public final synthetic class l33 implements x24`），不是 Compose LinearEasing，故文档与代码注释均标 `[未证实]`，只保留「该槽位需要线性曲线」这一断言。
- 本轮构建：624942 bytes，md5 `50a2fe351b2c092c0c736d725b01b85a`。
- **按 MOTION-SPEC 回填（本轮，§A2/§C/§D/§E/§F）**：MOTION-SPEC.md 到位后，把参考 APK 自建转场令牌（`DUR_PAGE_IN/OUT`、`DUR_PANEL_IN/OUT`、`DUR_PANEL_ALT_*`、`DUR_MID_IN`、`DUR_SLIDE_*` 与对应 `DELAY_*`）、
  交互反馈令牌（`DUR_RIPPLE` 15 / `DUR_MICRO_IN` 20 / `DUR_MICRO_OUT` 30 / `DUR_LIST_FB_IN` 45 / `DUR_LIST_FB_OUT` 150）、shimmer（`DUR_SHIMMER` 600 + `DELAY_SHIMMER` 200）、错峰（`STAGGER_DOT` 100）、
  弹簧三档（`SPRING_RATIO_A/B/C` = um9 `k53.U0` 三档）与走势曲线（`EASE_SHIMMER` 0.42/0/0.58/1、`EASE_PANEL_ALT` 0.4/0/0.6/1）全部补进 Motion.java；同时把 `DUR_SHIMMER` / `DUR_LIST_ITEM_IN` 从 `SPEC_PENDING` 移出（已有 `[参考]` 证据）。
- 新增 `res/interpolator/ease_shimmer.xml`(`cb0.java:18-22`) 与 `ease_panel_alt.xml`(`c44.java:11`)；`res/interpolator/` 现共 8 个。
- 本轮构建：624942 bytes，md5 `27641b7526e490c5bb6f6ae82978dd6e`（javac/d8/sign 全绿）。
- **接线批次（本轮，仅动画参数 + 令牌新增，业务分支/路由/接口零改动）**：
  · 6 处零按压反馈控件改 `t.rippleOn(同色, 同半径)`（audit §3.8 第 4 行）：`NewSessionActivity.java:155`(26f) / `:222`(15f，用新增的 `rippleOnStroke`) / `:327`(18f)，`PairActivity.java:86`(26f) / `:97`(999f) / `:131`(16f，`rippleOnStroke`)。
  · `HostsActivity.java` 4 处对话框 CTA：`:541` 保存 22f / `:579` 取消 22f / `:585` 删除 22f / `:649` 连接并加入 22f，全部 `t.round(...)` → `t.rippleOn(同色, 同半径)`。
  · `Theme.java` 新增 `rippleOnStroke(fill, stroke, radiusDp)`（保住描边 + 涟漪），`rippleOn` 原封未动。
  · `SplashActivity.java` logo/名称/版本号错峰入场（`Motion.staggerIn`，步长 8dp，减少动效关闭）；**HOLD_MS 620ms 未动**（`SplashActivity.java:21` / `:75`）。
  · 新增 `Motion.PANEL_SCALE_IN`=0.96 与 `Motion.panelIn(card, Context)`；接线 7 个居中 Dialog（`SettingsActivity.java:569/852/961`、`HostsActivity.java:511/559/615/728`）。`panelOut` 已定义但**未接线**（dismiss 调用点在业务分支里，令牌层不能改顺序）。
- 本轮构建：629198 bytes，md5 `968d6daa1d4cdeddb817f42a7185472f`，BUILD_EXIT=0。
- **lead 裁决后的一轮（仅反馈补全 + 注释诚实化）**：
  · 写域 rev5：`res/interpolator/` 归还本任务（曲线是令牌定义），故 `ease_shimmer.xml` / `ease_panel_alt.xml` 不再有归属问题。
  · `HostsActivity.java:661`（「添加主机」对话框里纯文字的「取消」，无底色）补 `t.ripple(999f)` —— 对应 Material TextButton 的 ripple，与 `PairActivity.java:97` 同一处理；`HostsActivity.java:746` 输入框背景按裁决**不加**（输入框不是点击反馈项）。
  · `Motion.PANEL_SCALE_IN` 与 `panelIn` / `panelOut` 注释从「技能建议」改写为 **[待实测·归属未定]**（数值一字未改），并在 §J 第 5 条写清 mh7 的 EMPH 对（15-17）与转场对（18-21）归属拆分。
- **`Pick.java` 盘点（本轮，只读未改，diff = 0 行）**：`android/src/com/lc/phoneharness/Pick.java`（243 行 / 10356 bytes）是**纯工具类、零 UI 面**：
  只有 `public static void read(Context, Uri, Callback)` 与 `Pending` / `Callback` / 私有 `readNow` / `compress` / `decodeSampled` / `shrink` / `rotate` / `sniff` / `displayName`。
  按 audit §3.8 第 4 行口径（可点元素 = 承载 `setOnClickListener` / `setOnTouchListener` / 长按 / 点击容器的 View）逐项 grep：`android.view`=0、`View`=0、`setOnClickListener`=0、`setOnTouchListener`=0、`setOnLongClickListener`=0、`onClick`=0、`setBackground`=0、`RippleDrawable`=0、`Dialog`=0、`Nav.`=0、`findViewById`=0。
  → **可点元素 0 个、零反馈可点元素 0 个、可接线点 0 个**，故无需（也不允许）在其上做任何动效接线；它的写域归属不产生动效改动。
- 本轮构建：629198 bytes，md5 `ea51394aa4644b670295389e75e9ce2b`，BUILD_EXIT=0（APK 每次签名带时间戳，md5 逐次不同；bytes 与 versionName 是稳定判据）。
- **聊天页抽屉与首页同构（本轮，APK 0.6.18）**：`ChatActivity.drawerBody()` 换成 `drawerHeadBox` + `list` + `drawerUserRow()`，删「会话」标题与右上 ⊕（顶栏已有 ⊕ 新建）；顶栏搜索胶囊 38dp / 左右 14dp / topMargin 14 / bottomMargin 8，chips 高 30dp、13sp、选中 `accent`+`accentSoft`，目录取自 `GET /v1/catalog`；底栏 34dp 头像 + 昵称 16sp + host 11sp + ⋯ 五项菜单；筛选状态 `drawerWs` 只留 Activity 内不写回 `Prefs`。详见 §H2c。本轮构建：739792 bytes，md5 `88eea0f9a0321eee7a53b2be15c0fe5a`（APK 每次签名带时间戳，bytes + versionName 才是稳定判据）。
- **绿点 = 已完成且未读（本轮，APK 0.6.19）**：新增 `Read.java`（键 `readN:<id>`，值 = 已读到的 `itemCount`；`markRead` 只前进不回退），首页与聊天页抽屉的绿点判定从 `itemCount > 0` 换成 `Read.unread(this, row)`，行点击（`MainActivity.java:1560` / `ChatActivity.java:4023`）与聊天页 `applyDetail`（`ChatActivity.java:1011`）落账已读，列表指纹（`MainActivity.java:2064`）改用 unread 位。实测：点「某个会话」后绿点消失（`readN:session-<redacted>… = 44`）、再发一轮绿点自己回来、抽屉不关时圆环 5s 内自换绿点、深色绿点仍 `#22C55E`。详见 §H2d。构建：本改动完成于 0.6.19（code 35，739793 bytes）；并行会话随后把 `build.sh` 默认推到 0.6.20 / 36，设备验收跑的是含本改动的 0.6.20 包。
