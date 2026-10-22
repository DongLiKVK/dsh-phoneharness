# 本项目视觉与动效差距审计（逐页 / 逐交互）

> 审计者：ui-audit（task-2） · 状态：**§一 / §二 / §三 已完成**（§三 已按 `official/MOTION-SPEC.md` 逐条校准）· §四 已列
> **静态扫描基线**：`android/src/**` 的 mtime 落在 2025-10-22 03:06–06:32（§一/§二 的数字取自该基线）。
> 基线之后 **motion-core（task-4）已开始落地**（`Motion.java` 06:59 · `res/interpolator/` 06:59 · `Theme.java` 06:56）——
> 因此「当前实现」列描述的都是**基线态**；与 motion-core 已落地物的逐项对账见 **§3.9**。
> **执行者先读 §3.9 再动手**：那里同时给出「已存在、别重建」与「待补、待改值、待接线」两张清单。
> 写作用域：本文件 + `shots/audit/**`。**未修改 `android/**` 任何文件（只读）。**

---

## 〇、方法与证据

### 0.1 静态证据（主证据）

| 项 | 值 |
| --- | --- |
| 源码根 | `android/src/com/lc/phoneharness/` |
| 规模 | 24 个 `.java`，合计 **13819 行** |
| 7 个 Activity | MainActivity 2416 · ChatActivity 3067 · SettingsActivity 1424 · HostsActivity 762 · NewSessionActivity 425 · PairActivity 306 · SplashActivity 88 |
| 共享 UI 组件 | Seats 2409（座位/底部面板/菜单）· Pick 243 · Theme 295（色与控件工厂）· Nav 68（页面转场）· Root 70（抽屉手势）· Flow 77（折行容器）· Item 150 · Img 126 |
| 动画资源 | `android/res/anim/` 6 个 XML（其中 2 个零引用，见 §2.1）；**基线态 `res/interpolator/` 目录不存在**（全部用 `@android:interpolator/*` 内置曲线）—— 该目录已于 06:59 由 motion-core 新建（4 文件，见 §3.9） |
| 主题资源 | `res/values/{colors,strings,styles}.xml` + `res/values-night/{colors,styles}.xml`；manifest 无 `android:windowAnimationStyle` |

### 0.2 动效触点全量扫描（命中即取证）

扫描正则集合：`overridePendingTransition` / `overrideActivityTransition` / `RippleDrawable` / `ripple(` / `ObjectAnimator` / `ValueAnimator` / `ViewPropertyAnimator` / `animate(` / `setAlpha` / `setScaleX` / `setScaleY` / `setTranslation` / `setRotation` / `setPivot` / `postDelayed` / `Interpolator` / `TransitionManager` / `LayoutTransition` / `R.anim` / `R.interpolator` / `animateLayoutChanges` / `performHapticFeedback` / `Vibrator` / `shimmer` / `setDuration` / `smoothScroll` / `startAnimation` / `AnimationUtils` / `VelocityTracker` / `GestureDetector`。

**扫描结论（这四条决定了整个审计的方向）：**

1. **`setScaleX` / `setScaleY` 全项目零命中** —— 全 App 没有任何按压缩放反馈，按压只有水波纹（Material 默认），没有 0.97 缩放。
2. **`ObjectAnimator` / `ValueAnimator` / `TransitionManager` / `LayoutTransition` 零命中** —— 唯一的时间轴机制是 `View.animate()`（ViewPropertyAnimator）与 `res/anim` 的 `<set>`。
3. **`VelocityTracker` / `GestureDetector` 零命中** —— 抽屉拖拽不看速度，松手只看位移（`MainActivity.java:300`），没有 fling 惯性。
4. **`shimmer` / `pulse` / `blink` 零命中** —— 没有骨架屏或任何循环动效；加载态靠静态文字。

### 0.3 动态证据

模拟器 `<DEVICE>` 已装本项目 APK（`com.lc.phoneharness`）与参考 APK（`com.deepseek.chat` 2.6.1 / versionCode 279）。
上机核验脚本与截图落在 `shots/audit/**`（§五 列清单）。

### 0.4 参考目标的可用性（**重要阻塞项**）

任务卡要求每条差距「引用 `official/MOTION-SPEC.md` 或 `official/VISUAL-SPEC.md` 的条目」。
**该阻塞项已解除**：`official/MOTION-SPEC.md` 已由 teammate **re-motion**（task-1）落盘（256 行，§0–§10 + 附录 A/B/C），§三 的「参考目标」列已**逐条**改为引用 `MOTION-SPEC §x.y` + 该条的字面数值。
`official/VISUAL-SPEC.md` 本轮**未用于任何数值对齐**（§三 只引 MOTION-SPEC；MOTION-SPEC 未取证的一律写 **[待实测]**，不编造）。
「参考目标」列的引用来源如下：

| 参考证据文件 | 内容 | 本轮可用性 |
| --- | --- | --- |
| `official/ALIGN.md` | 视觉/结构/文案对照表，含「已对齐 / 有意不对齐 / 可做但未做」三分类与理由 | 已读 |
| `official/REPORT-official.md` | 官方视觉与资源取证（505 行）：色值、图标、字号、组件形态 | 存在 |
| `official/REPORT-official-code.md` | 官方代码取证（367 行） | 存在 |
| `official/apktool-out` | apktool 3.0.3 解包（含官方 `res/anim`、`res/interpolator`、`values`） | 可用于反查官方曲线/时长 |
| `official/jadx-out` | jadx 反编译（Compose 侧动效调用点） | 可用于反查官方 spec |
| `official/MOTION-SPEC.md` | 官方动效规格（时长/缓动/位移/缩放/透明度/顺序/中断） | **已落盘（256 行）→ §三 逐条引用 §x.y** |
| `official/VISUAL-SPEC.md` | 官方视觉规格（色/字/距/圆角/图标/组件） | 本轮**未引用**（数值对齐只用 MOTION-SPEC） |

> **已完成的校准**：§三 每行的「参考目标」都写成 `MOTION-SPEC §x.y` + 反编译位置（`defpackage/xx.java:行号`）+ 字面值，并带**证据等级**：
> `[S]` 官方静态字面量 / `[M]` 官方逐帧实测 / `[L]` 库默认（**本轮一律标 [L] 待补 URL，不当官方证据**）/ `[待实测]` 官方无证据。
> 项目侧证据用 `[P]`（源码 `file:line` + 字面值）与 `[M-P]`（`shots/audit/*-frames.txt` 帧号）标注。**凡 SPEC 无证据处拒绝编造数值。**

---

## 一、逐页现状

每页三段：**页面职责** → **主要交互面** → **现有转场/反馈做法（file:line + 数值）**。

### 1.1 SplashActivity（`SplashActivity.java`，88 行）

**职责**：品牌启动页。logo 96dp + 名称 18sp + 版本 12sp，垂直居中；`HOLD_MS` 后进 MainActivity，或点击立即进。

**主要交互面**：整页可点（`setOnClickListener` 触发 `go()`）；无按钮。

**现有做法**：

| 触点 | 现值 | 位置 |
| --- | --- | --- |
| 停留时长 | `HOLD_MS = 620L`（硬编码常量） | `SplashActivity.java:21` |
| 停留计时 | `root.postDelayed(go, 620)` | `SplashActivity.java:61-66` |
| 进入转场 | **无动画**：`Nav.none(this)` → `overrideActivityTransition(OPEN, 0, 0)`（API33+）/ `overridePendingTransition(0, 0)` | `SplashActivity.java:85` → `Nav.java:61-66` |
| logo 入场 | **无**。静态 `setImageResource`，无 alpha/scale 动画 | `SplashActivity.java:36-39` |
| 点击抢占 | `moved` 布尔去重，无过渡 | `SplashActivity.java:75-79` |

**关键观察**：这是全 App 唯一「允许有 delight 预算」的页面（首次/低频），但**一个动画都没有** —— logo 直接出现在满 alpha 状态。属于 §八「Missed opportunities」。

### 1.2 MainActivity（`MainActivity.java`，2416 行）

**职责**：首页。会话列表（置顶 + 今日/昨天/7 天/30 天分桶）+ 顶栏（左抽屉 / 中标题 / 右新建）+ 输入卡片 + 底部用户行；另含左抽屉（鲸域品牌 + 5 项 + 用户行）、搜索页、上传面板、批量多选态。

**主要交互面**：抽屉开合（点击 + 左边缘滑动手势）、列表行点击/长按、chip、圆钮（＋/发送）、上传面板方块、开关、底部面板、批量多选进入退出、搜索页进出、Toast、对话框。

**现有做法**：

| 交互 | 现值 | 位置 |
| --- | --- | --- |
| **抽屉宽度** | `widthPixels * 0.82f`（魔法比，非 dp） | `MainActivity.java:189` |
| 抽屉初始态 | `setTranslationX(-drawerWidth)` + `GONE` | `MainActivity.java:277-278` |
| 遮罩底色 | `0x99000000`（固定 60% 黑，**不随主题**） | `MainActivity.java:261` |
| 遮罩初始态 | `alpha = 0f` + `GONE` | `MainActivity.java:262-263` |
| **抽屉拖拽（手势）** | `x = min(0f, -drawerWidth + dx)` 直接跟手，**无摩擦、无边界阻力**；遮罩 `alpha = min(1, dx/drawerWidth) * 0.6` | `MainActivity.java:289-294` |
| **抽屉松手判定** | `if (dx > drawerWidth * 0.34f) openDrawer()` —— **纯位移阈值，不看速度** | `MainActivity.java:300` |
| 抽屉打开 | `drawer.animate().translationX(0f).setDuration(220)` + `DecelerateInterpolator`；`mask.animate().alpha(0.6f).setDuration(220)`（**遮罩未设插值器**） | `MainActivity.java:2354-2356` |
| 抽屉关闭 | `translationX(-drawerWidth).setDuration(190)`（**无插值器**）；`mask.alpha(0f).setDuration(190).withEndAction{ 隐藏 }` | `MainActivity.java:2379-2388` |
| 抽屉立即收起 | `closeDrawerNow()`：`cancel()` + 直接赋目标值（跳转前防抢帧） | `MainActivity.java:2360-2369` |
| 手势识别参数 | `edge = 26dp`（起手必须贴左边缘）；`slop = 10dp`；主轴判定 `abs(dy) > abs(dx) * 1.4f` | `Root.java:25-26, 46-53` |
| 手势速度 | **无 `VelocityTracker`**（`Root.java` 全文 70 行零命中） | — |
| **搜索页进场** | `setVisibility(VISIBLE)`（硬切）+ `alpha 0f → 1f, setDuration(140)`，**无位移/无缩放/无插值器** | `MainActivity.java:1730-1732` |
| 搜索页退场 | `setVisibility(GONE)` —— **纯硬切，无退场动画** | `MainActivity.java:1752` |
| 键盘延迟 | `postDelayed(..., 120)`（等待布局的魔法延时） | `MainActivity.java:1735-1743` |
| 列表行/卡片 按压 | `t.ripple(radius)`，radius ∈ {8,10,12,14,22}f 散落多处 | `:1054, 1204, 1410, 1438, 1532, 1773, 396` |
| **搜索图标入场偏移** | `box.setTranslationY(-t.dp(22))` —— 静态偏移量，非动画 | `MainActivity.java:374` |
| 发送按钮禁用态 | `actionButton.setAlpha(sending ? 0.45f : 1f)` —— 无过渡，瞬时 | `MainActivity.java:766` |
| 批量多选进入/退出 | `startBatch()/endBatch()`：`userBox.setVisibility(GONE/VISIBLE)` + `batchBar.setVisibility(VISIBLE/GONE)` —— **纯硬切，无动画**（注：`ALIGN.md` 记「多选未做」，实际**已实现**，文档过期） | `MainActivity.java:1547-1563` |
| 上传面板显隐 | `uploadPanel.setVisibility(GONE)` —— 硬切 | `:592, :737` |
| Toast | `Toast.makeText(..., LENGTH_SHORT)`，5 处 | `:2392` 等 |
| 对话框 | `new Dialog(this)` + `sizeDialog(dialog, 320/340)`（**只定宽度，无进出场动画**） | `:1184, :1608, :1982, :2007, :2088, :2133` |

**关键观察**：
- 抽屉是**唯一有时间轴的手势动效**，但拖拽跟手与松手动画**两套曲线不接续**：跟手是线性的、松手是 220ms 减速 —— 有空档感；且拖拽过程**遮罩渐变系数 0.6 与最终值 0.6 一致**（这一条是对的），但**关闭用 190ms、打开用 220ms**，非对称但无设计理由记录。
- 搜索页「淡入 140ms + 无退场」是全 App 最明显的**入场不解释来源**（无位移，用户不知道它从哪儿来）。

### 1.3 ChatActivity（`ChatActivity.java`，3067 行）

**职责**：对话页。欢迎页（logo + 建议词两列）+ 消息流（用户浅灰气泡 / 助手全宽流式）+ 思考折叠 + 工具卡 + 消息操作条 + 输入卡片（＋/输入/发送）+ 深度思考与模式 chip + 审批条 + 模型反问卡片 + 上传面板 + 附件条 + 状态行。

**主要交互面**：流式回复、思考胶囊折叠/展开、工具卡折叠/展开、消息操作条、chip 选择、上传面板、附件条、反问选项与整批提交、审批条、打断、Toast、对话框。

**现有做法**：

| 交互 | 现值 | 位置 |
| --- | --- | --- |
| **流式合帧** | `ui.removeCallbacks(renderSoon); ui.postDelayed(renderSoon, 120)` —— 120ms 合并重绘 | `ChatActivity.java:1090-1091` |
| **新消息入场** | **无动画**：整页 `render()` 重建，新 item 以满 alpha 直接出现 | `ChatActivity.java` render 路径 |
| **自动滚底** | `scroller.fullScroll(View.FOCUS_DOWN)` —— **瞬跳，非 smoothScroll** | `ChatActivity.java:1193, 1201` |
| 滚底时机 | `scroller.post{ fullScroll }`；`before == 0` 时再发一次 | `ChatActivity.java:1190-1204` |
| **思考/工具折叠 chevron** | `chevron.setRotation(open ? 90f : 0f)` —— **瞬变，无过渡** | `ChatActivity.java:1631, 1674, 1706, 1736` |
| **思考/工具折叠展开体** | `body.setVisibility(willOpen ? VISIBLE : GONE)` —— **硬切，无高度动画** | `ChatActivity.java:1666, 1673, 1728, 1735` |
| 折叠头按压 | `head.setBackground(t.ripple(8f))` | `ChatActivity.java:1635, 1708` |
| 折叠头排版 | chevron 14dp / `t.muted2` / `margin-left 4dp`；标题 13sp / `t.muted`；header padding `(0,4,6,4)` | `ChatActivity.java:1630-1645, 1705-1712` |
| 非「思考」marker | 灰胶囊 `t.pill(t.surfaceAlt)` + padding `(10,5,12,5)` + 11sp —— **静态，无动画** | `ChatActivity.java:1689-1696` |
| 上传面板按钮 | `t.ripple(22f)` / `t.ripple(12f)` / `t.ripple(8f)` | `:471, :589, :1603, :1431` |
| 上传面板显隐 | `uploadPanel.setVisibility(GONE)` —— 硬切 | `ChatActivity.java:511` |
| 附件条显隐 | `attachStrip.setVisibility(GONE/VISIBLE)` —— 硬切 | `:238, :2834-2837` |
| 状态行显隐 | `statusView.setVisibility(VISIBLE/GONE)` —— 硬切（无 shimmer/无骨架） | `:269, :1105, :1118` |
| 提问卡片显隐 | `questionRow.setVisibility(GONE/VISIBLE)` —— 硬切 | `:223, :2576` |
| 审批条显隐 | `noticeRow.setVisibility(GONE/VISIBLE)` —— 硬切 | `:215, :2475` |
| 发送按钮禁用 | `actionButton.setAlpha(enabled ? 1f : 0.45f)`，瞬时 | `:2947` |
| 图片加载占位 | `image.setVisibility(GONE/VISIBLE)` + `hint` 切换 —— 硬切 | `:1837-1859` |
| 长按菜单/对话框 | `AlertDialog.Builder`（系统默认进出场） | `:1914, 2395, 2419` |
| Toast | `Toast.makeText(..., LENGTH_SHORT)` | `:3060` |

**关键观察**：
- **思考折叠与工具卡展开是这个 App 被点得最多的动效**（会话内每条助手消息都有），却是**瞬变**：chevron 90° 跳变 + 内容硬切。这是 §1「Purpose & frequency」里典型的「高频却做了最粗糙的处理」。
- **流式回复没有入场动效**：to 400+ 条 item 的列表里每 120ms 重建一次整页，任何入场动画都不现实 —— 但**应该**做的是「新 item 只在首次出现时做一次 6~10px 上移 + 淡入」，而不是完全不动。当前是**零动效 + 整页重建**。
- **滚底是瞬跳**：流式输出时每 120ms 跳一次，视觉上是一次次「砸」到底部。

### 1.4 SettingsActivity（`SettingsActivity.java`，1424 行）

**职责**：设置页。分组卡片（外观 / 字体大小 / 主机 / 工作区 / 关于等），每行 52dp（带副标题 58dp），右箭头 + 值文本。

**主要交互面**：行点击、单选框、开关、外观对话框、工作区对话框、确认对话框、Toast。

**现有做法**：

| 交互 | 现值 | 位置 |
| --- | --- | --- |
| 行按压 | `cell.setBackground(t.ripple(14))` | `:395, :790, :1113` |
| 列表项按压 | `item.setBackground(t.ripple(8f))` | `:535` |
| 对话框按钮按压 | `confirm.setBackground(t.ripple(16))` | `:821, :933` |
| **禁用行** | `cell.setBackground(enabled ? t.ripple(14) : null)` —— **禁用行连水波纹都没有**（无过渡） | `:1113` |
| 行高 | `t.dp(52)` / 带副标题 `t.dp(58)` | `:399-400, :1117-1118` |
| 对话框 | `new Dialog(this)`（`appearanceDialog` `:760`、`showWorkspaceDialog` `:510`、`:897`）—— **自建 Dialog，无自定义进出场动画** | `:512, :761, :897` |
| 确认弹窗 | `AlertDialog.Builder`（系统默认） | `:671, :735` |
| Toast | `Toast.makeText` | `:725` |
| **主题切换** | 「外观」改完 → `recreate()`（`MainActivity` 有 `darkAtBuild` 防露帧逻辑）—— 页面整体重建，**无交叉淡入**，会看到一次闪白/闪黑 | `MainActivity` 主题路径 |

**关键观察**：设置页动效触点密度最高（6 处 ripple）但**全部是按压反馈，零状态过渡**。字体大小、字体跟随系统、开关切换都是**瞬时生效 + 整页重排**，没有过渡。

### 1.5 HostsActivity（`HostsActivity.java`，762 行）

**职责**：在线主机管理页。主机列表（当前主机置顶）、增删改名、归类箱、对话框（宽 320/340dp）。

**主要交互面**：主机行点击/长按、菜单项点击、对话框、Toast。

**现有做法**：

| 交互 | 现值 | 位置 |
| --- | --- | --- |
| 主机行（可切换）按压 | `cell.setBackground(t.ripple(12f))` | `HostsActivity.java:353` |
| **「当前」主机行** | `cell.setBackground(null)` + `setClickable(false)` —— **有意无按压反馈**（源码注释明确说明：只做状态展示，避免误触产生响应）。**按 skill Hard Rule 5（不重审已记档的取舍）——记录，不作为缺陷上报** | `HostsActivity.java:346-352` |
| 菜单项按压 | `item.setBackground(t.ripple(8f))` | `HostsActivity.java:517` |
| 菜单项内边距 | `setPadding(16, 13, 16, 13)dp` | `HostsActivity.java:516` |
| 对话框 | `new Dialog(this)` × 4（`addDialog` `:619`、`renameDialog` `:524`、`deleteDialog` `:560`、`:451`），`sizeDialog(dialog, 320|340)` **只定宽度、无进出场动画** | `:451, 524, 560, 619, 727` |
| Toast | `Toast.makeText` | `:760` |

**关键观察**：与 SettingsActivity 同构（行 + 对话框 + Toast），动效触点更少，**无任何过渡**。

### 1.6 NewSessionActivity（`NewSessionActivity.java`，425 行）

**职责**：新建会话页。工作区选择、标题输入、模型 chip 选择、提交。

**主要交互面**：关闭、工作区行点击、chip 选择、提交按钮、Toast。

**现有做法（本节是本次审计最严重的单点发现）：**

| 交互 | 现值 | 位置 |
| --- | --- | --- |
| 关闭按钮 | `close.setClickable(true)` —— **未设任何背景**，无按压反馈 | `NewSessionActivity.java:75-76` |
| **提交按钮** | `submit.setBackground(t.round(t.accent, 26f))` —— **静态圆角底，无水波纹、无缩放** | `NewSessionActivity.java:155` |
| **工作区行** | `box.setBackground(t.roundStroke(t.cardFill, t.line, 15f))` —— **无水波纹** | `NewSessionActivity.java:222-224` |
| **模型 chip** | `chip.setBackground(t.round(selected ? t.accent : t.surfaceAlt, 18f))` —— **选中态硬切换底色，无水波纹、无过渡** | `NewSessionActivity.java:327-330` |
| 转场 | 经 `Nav.open`/`Nav.close` 走全局 nav 动画 | `Nav.java` |
| Toast | `Toast.makeText` × 5 | `:261, 354, 362, 389, 408` |

**关键观察**：**整页零按压反馈、零状态过渡**。`grep 'ripple(' NewSessionActivity.java` → **0 命中**。这是与 SettingsActivity/HostsActivity（同为「行 + chip + 按钮」结构）最刺眼的**跨页面不一致**：同样的交互元素，在同一 App 的不同页面有完全不同的反馈（§七 Cohesion）。

### 1.7 PairActivity（`PairActivity.java`，306 行）

**职责**：配对页（连接电脑）：地址输入、探测按钮、设备/主机 chip、连接按钮；含聊天内的返回条。

**主要交互面**：连接、探测、chip 选择、返回条、Toast。

**现有做法**：

| 交互 | 现值 | 位置 |
| --- | --- | --- |
| **连接按钮** | `connect.setBackground(t.round(t.accent, 26f))` —— **无水波纹** | `PairActivity.java:86-87` |
| **探测按钮** | `probe.setClickable(true)` —— **未设任何背景**，无按压反馈 | `PairActivity.java:96` |
| **主机 chip** | `chip.setBackground(t.roundStroke(0x00000000, t.line, 16f))` —— **无水波纹**，且底色写死 `0x00000000`（**未走令牌**） | `PairActivity.java:130-131` |
| **返回条** | `back.setBackground(t.rippleOn(t.dark ? t.surfaceAlt : Theme.alpha(t.text, 0.06f), 999f))` —— **全页唯一有按压反馈的元素**；radius `999f` | `PairActivity.java:227-228` |
| 路径框 | `edit.setBackground(t.roundStroke(t.surfaceAlt, t.surfaceAlt, 14f))` —— 无反馈 | `PairActivity.java:280` |
| 成功 Toast | `Toast.makeText(..., "连接成功", LENGTH_SHORT)` —— **文案硬编码中文**，未走 `strings.xml` | `PairActivity.java:191` |

**关键观察**：与 NewSessionActivity 同病 —— **主操作按钮（连接/提交）是全局最该有按压反馈的元素，却只有静态底色**。

### 1.8 共享组件（跨页复用，缺陷会放大到每一页）

#### Nav.java —— 页面转场（68 行）

**唯一机制**：`res/anim/*.xml` 的 `<set>`；**全 App 只有 4 个动画文件在用，2 个是死文件**。

| 场景 | 现值 | 位置 |
| --- | --- | --- |
| 前进 · 新页入 | `alpha 0.86 → 1.0` + `translateX 9%p → 0`，**200ms**，`@android:interpolator/decelerate_cubic` | `res/anim/nav_enter.xml:4-13` |
| 前进 · 旧页出（被盖） | `alpha 1.0 → 0.9` + `translateX 0 → -8%p`，**200ms**，`decelerate_cubic` | `res/anim/nav_push_out.xml:4-13` |
| 返回 · 露出页入 | `alpha 0.9 → 1.0` + `translateX -8%p → 0`，**220ms**，`decelerate_cubic` | `res/anim/nav_pop_in.xml:4-13` |
| 返回 · 退场页出 | `alpha 1.0 → 0.86` + `translateX 0 → 9%p`，**220ms**，`decelerate_cubic` | `res/anim/nav_pop_out.xml:4-13` |
| **死文件 1** | `alpha 1.0 → 0.86` + `translateX 0 → 9%p`，**170ms**，`accelerate_cubic` | `res/anim/nav_exit.xml` —— **全仓库零引用** |
| **死文件 2** | `alpha 1.0 → 1.0`，200ms（纯占位） | `res/anim/nav_hold.xml` —— **全仓库零引用** |
| API 分流 | SDK ≥ 33 → `overrideActivityTransition`；否则 `overridePendingTransition` | `Nav.java:28-33, 52-57` |
| 无动画 | `overrideActivityTransition(OVERRIDE_TRANSITION_OPEN, 0, 0)` / `overridePendingTransition(0, 0)` | `Nav.java:61-66` |

> `Nav.java:10-13` 注释记录了关键实测结论：**targetSdk ≥ 34 时 `overridePendingTransition` 失效**（系统接管转场），故 API 33+ 必须用 `overrideActivityTransition`。**这是已记档的取舍，不重审。**

**关键观察**：
- **位移量是百分比（9% / 8%），不是「全屏 100%」** —— 这是「视差式轻推」而非标准 Android push。注释（`nav_pop_in.xml` 头注）说明是有意的「视差」设计，**不重审**；但要确认它与官方一致（待 MOTION-SPEC）。
- **`accelerate_cubic` 只出现在死文件 `nav_exit.xml`** —— 项目实际只用 `decelerate_cubic`。这**符合** §2「进入/退出用 ease-out」的方向，是当前实现里**做对了的一条**。
- **离开时长 170ms 的取值被孤立在死文件里** —— 暗示曾有过「进入 200ms / 退出 170ms」的非对称设计，后改为 200/200 与 220/220，但旧文件未清理。属于 §七「consolidation」+ 仓库卫生。

#### Root.java —— 抽屉手势（70 行）

见 §1.2。要点：**无 VelocityTracker、无摩擦、松手只看位移**。

#### Theme.java —— 色与控件工厂（295 行）

| 项 | 现值 | 位置 |
| --- | --- | --- |
| 水波纹（透明底） | `RippleDrawable(color = ARGB(alpha, text.r, text.g, text.b), content = null, mask = round(0xFFFFFFFF, radiusDp))`；**alpha = 0.10f（浅）/ 0.16f（深）** | `Theme.java:166-171` |
| 水波纹（带底色） | 同上 alpha；`content = round(fill, radiusDp)`，`mask = round(0xFFFFFFFF, radiusDp)` | `Theme.java:174-181` |
| 圆角工厂 | `round(color, radiusDp)` / `roundStroke(color, stroke, r)`（描边 `max(1px, 0.8dp)`）/ `pill(color)`（`radius = 999dp`）/ `circle(color)` | `Theme.java:143-188` |
| 字号缩放 | `fontScale = Prefs.fontFollowSystem() ? 1.0f : Prefs.fontScale()`；**只作用于 ≥ 14sp 的文字**（`sizeSp >= 14f ? sizeSp * fontScale : sizeSp`） | `Theme.java:60, 65, 197` |

**关键观察**：`Theme.ripple()` **已是一处集中托管**（alpha 与 mask 逻辑只此一份）—— 好的先例，`Motion.java` 已按此形态落地（06:59，见 §3.9）。**但半径仍是调用方传入的 8 个散落值**，且**水波纹的涟漪动画参数（`RippleDrawable` 默认 maxRadius/时长）完全没有公开 setter**（已核实，§3.0.1），无法按页面调节。

#### Seats.java —— 底部面板与菜单（2409 行）

| 交互 | 现值 | 位置 |
| --- | --- | --- |
| **底部面板进场** | `card.setTranslationY(t.dp(26))` + `alpha 0f`；`scrim.alpha 0f` → 动画到 `translationY(0) + alpha(1)`，**200ms**（**无插值器**）；`scrim.alpha(1)`，**200ms** | `Seats.java:2153-2158` |
| **底部面板退场** | `translationY(t.dp(30)) + alpha(0)`，**150ms**（**无插值器**）+ `withEndAction{ win.dismiss() }`；`scrim.alpha(0)`，**150ms** | `Seats.java:2167-2174` |
| 进出位移不对称 | 进场 `26dp` / 退场 `30dp` —— **非对称但无设计理由记录** | `Seats.java:2153, 2167` |
| 面板卡片高度 | `lp.height = measureCardHeight()`（**每开一次改一次 LayoutParams → 触发一次 requestLayout**） | `Seats.java:2150-2152` |
| 座位 cell 按压 | `t.ripple(10f)` / `t.ripple(12f)` | `:1276, 1309, 1189, 1225, 1770, 2339, 2278` |
| 菜单行 | `iconRes != 0 ? draw : 0`；`minimumHeight 44dp`；padding `(16,6,16,6)dp`；label 13.5sp | `Seats.java:2333-2345` |
| **禁用 cell** | `cell.setAlpha(0.72f)`（路径 cell） / `cell.setAlpha(0.55f)`（另一处）—— **两个不同值** | `Seats.java:1837, 2327` |
| 保存按钮态 | `saveButton.setAlpha(1f)` / `0.5f` —— **第三个禁用 alpha 值** | `Seats.java:1049, 1077` |
| 权限对话框 | `new Dialog(host)` | `:1379, :1847` |
| Toast | 4 处 | `:805, 818, 1032, 1434, 1959, 1965` |

**关键观察**：**全 App 唯一的「弹层进出场动画」在 Seats 的底部面板里**（200ms 进 / 150ms 出），而 MainActivity / HostsActivity / SettingsActivity 的所有 `Dialog` **完全没有自定义动画**（走系统默认）。这造成**同一 App 两种弹层语言**（§七 Cohesion HIGH）。

#### Flow.java / Pick.java —— 无动效触点

- `Flow.java`（77 行）：折行 `ViewGroup`，`onMeasure`/`onLayout` 手算 —— **纯布局，零动画**。反问卡片选项的换行是瞬变。
- `Pick.java`（243 行）：无 `ripple` 命中。**图片/文件选择面板无按压反馈**。

---

## 二、需集中托管的硬编码动画值（`Motion.java` 的输入清单）

**这一节就是 `Motion.java` 的取值表** —— 下面每一行都是当前散落在 Activity 里的字面量，必须收敛为常量。

> **⚠ 基线态说明（执行者必读）**：本节数字取自 06:32 前的源码基线。motion-core 已于 06:56–06:59 落地 `Motion.java`（32566 B）+ `res/interpolator/`（4 文件）+ `Theme.java`，
> 但它**只把下面这些旧字面量原样收编成常量**（`DUR_NAV_ENTER=200`、`DUR_NAV_EXIT=170`、`DUR_SHEET_IN=200`、`DUR_DRAWER_IN=220` …），
> **没有替换成 `MOTION-SPEC` 的目标值**（105+195 / 250+200 / 120 / 150 …）。所以本节**既是「迁移清单」也是「待改写值清单」**，逐项对账见 §3.9。

### 2.1 时长（毫秒）

| # | 值 | 位置 | 用途 | 建议令牌 |
| --- | --- | --- | --- | --- |
| 1 | `620` | `SplashActivity.java:21` | 启动页停留 | `SPLASH_HOLD_MS` |
| 2 | `200` | `res/anim/nav_enter.xml:8,12` | 前进·新页入 | `NAV_ENTER_MS` |
| 3 | `200` | `res/anim/nav_push_out.xml:8,12` | 前进·旧页出 | `NAV_EXIT_MS` |
| 4 | `220` | `res/anim/nav_pop_in.xml:7,12` | 返回·露出页入 | `NAV_POP_IN_MS` |
| 5 | `220` | `res/anim/nav_pop_out.xml:7,12` | 返回·退场页出 | `NAV_POP_OUT_MS` |
| 6 | `170` | `res/anim/nav_exit.xml:8,13` | **死文件**（零引用） | 删除或并入 `NAV_EXIT_MS` |
| 7 | `200` | `res/anim/nav_hold.xml:4` | **死文件**（零引用） | 删除 |
| 8 | `220` | `MainActivity.java:2354` | 抽屉打开（位移） | `DRAWER_OPEN_MS` |
| 9 | `220` | `MainActivity.java:2356` | 抽屉打开（遮罩） | 同上（应同源） |
| 10 | `190` | `MainActivity.java:2379` | 抽屉关闭（位移） | `DRAWER_CLOSE_MS` |
| 11 | `190` | `MainActivity.java:2380` | 抽屉关闭（遮罩） | 同上（应同源） |
| 12 | `140` | `MainActivity.java:1732` | 搜索页淡入 | `SEARCH_IN_MS` |
| 13 | `120` | `MainActivity.java:1735` | 搜索页键盘延迟 | `KEYBOARD_DELAY_MS` |
| 14 | `120` | `ChatActivity.java:1091` | 流式合帧 | `STREAM_COALESCE_MS` |
| 15 | `200` | `Seats.java:2157` | 底部面板进入（卡片） | `SHEET_ENTER_MS` |
| 16 | `200` | `Seats.java:2158` | 底部面板进入（scrim） | 同上（应同源） |
| 17 | `150` | `Seats.java:2167` | 底部面板退出（卡片） | `SHEET_EXIT_MS` |
| 18 | `150` | `Seats.java:2174` | 底部面板退出（scrim） | 同上（应同源） |

> **总结**：18 处时长字面量，落在 9 个不同毫秒值（120/140/150/170/190/200/220/620 与 nav 的成对值）。**「200」出现 6 次、「220」出现 4 次、「190」2 次、「150」2 次** —— 典型的「几乎一样但不统一」。

### 2.2 缓动曲线

| # | 值 | 位置 | 用途 | 建议令牌 |
| --- | --- | --- | --- | --- |
| 19 | `@android:interpolator/decelerate_cubic` | `nav_enter.xml:4` | 前进入 | `EASE_OUT`（**语义已对**） |
| 20 | `@android:interpolator/decelerate_cubic` | `nav_push_out.xml:4` | 前进出 | `EASE_OUT` |
| 21 | `@android:interpolator/decelerate_cubic` | `nav_pop_in.xml:4` | 返回入 | `EASE_OUT` |
| 22 | `@android:interpolator/decelerate_cubic` | `nav_pop_out.xml:4` | 返回出 | `EASE_OUT` |
| 23 | `@android:interpolator/accelerate_cubic` | `nav_exit.xml:3` | **死文件**用 `ease-in` | 随死文件删除 |
| 24 | `new DecelerateInterpolator()` | `MainActivity.java:2355` + import `:29` | 抽屉打开 | `EASE_OUT`（**与 nav 的 `decelerate_cubic` 不是同一条**：`DecelerateInterpolator` 是 factor=1 的 `t' = 1-(1-t)^2`，与内置 `decelerate_cubic` 强度不同） |
| 25 | **缺省（null）** | `MainActivity.java:2356`（遮罩 alpha） | 抽屉遮罩 —— **未设插值器**，走系统默认 | `EASE_OUT` |
| 26 | **缺省（null）** | `MainActivity.java:2379-2388`（抽屉关闭位移 + 遮罩） | 抽屉关闭 —— **未设插值器** | `EASE_OUT` |
| 27 | **缺省（null）** | `MainActivity.java:1732` | 搜索页淡入 —— **未设插值器** | `EASE_OUT` |
| 28 | **缺省（null）** | `Seats.java:2157-2158` | 底部面板进 —— **未设插值器** | `EASE_OUT` |
| 29 | **缺省（null）** | `Seats.java:2167-2174` | 底部面板出 —— **未设插值器** | `EASE_OUT` |
| 30 | ~~**`res/interpolator/` 目录不存在**~~ → **已于 06:59 由 motion-core 新建 4 个文件**（`ease_standard`=0.4/0/0.2/1 · `ease_decelerate`=0/0/0.2/1 · `ease_accelerate`=0.4/0/1/1 · `ease_linear`）。**转场（§3.1）所需的两条曲线就在这 4 个里，不需要再建**；仍缺的 2 条强调曲线（`0,0,0,1` / `0.3,0,1,1`）只服务 `§6.1/§6.2` 面板与抽屉 | `android/res/interpolator/` | 曲线资源位已建立；转场侧**无缺口**，面板/抽屉侧缺口 = 2 条 | 见 §3.9.3 + §3.9.7：新增 `ease_emph_decel.xml` / `ease_emph_accel.xml` 供面板/抽屉；`Motion.java` 同步加 `EASE_EMPH_DECEL` / `EASE_EMPH_ACCEL` |

> **总结**：**6 处动画完全没有插值器**（全部落在「应该是 ease-out」的场景上），且 **`nav` 用 `decelerate_cubic`、抽屉用 `DecelerateInterpolator`** —— 两条不同的「减速」曲线在同一 App 并存。这是 §2/§七的核心 finding。

### 2.3 位移 / 幅度

| # | 值 | 位置 | 用途 |
| --- | --- | --- | --- |
| 31 | `9%p` | `nav_enter.xml:11` | 前进入位移（页面宽的 9%） |
| 32 | `-8%p` | `nav_push_out.xml:11` | 前进出位移 |
| 33 | `-8%p` | `nav_pop_in.xml:11` | 返回入位移 |
| 34 | `9%p` | `nav_pop_out.xml:11` | 返回出位移 |
| 35 | `9%p` | `nav_exit.xml:12` | **死文件** |
| 36 | `widthPixels * 0.82f` | `MainActivity.java:189` | 抽屉宽度（**比例而非 dp**） |
| 37 | `drawerWidth * 0.34f` | `MainActivity.java:300` | 抽屉松手阈值（**纯位移，无速度项**） |
| 38 | `26dp` | `Seats.java:2153` | 底部面板进场起始偏移 |
| 39 | `30dp` | `Seats.java:2167` | 底部面板退场终点偏移（**与 38 不对称**） |
| 40 | `-22dp` | `MainActivity.java:374` | 首页空态上移（**静态布局值，非动画** —— 但容易被误认成动画起点，建议注释或令牌化） |
| 41 | `edge = 26dp` | `Root.java:25` | 抽屉起手边缘区宽度 |
| 42 | `slop = 10dp` | `Root.java:26` | 抽屉手势最小位移 |
| 43 | `abs(dy) > abs(dx) * 1.4f` | `Root.java:46` | 手势主轴判定比（**魔法数**） |
| 44 | `min(1, dx/drawerWidth) * 0.6f` | `MainActivity.java:294` | 拖拽中遮罩最大 alpha |
| 45 | `alpha(0.6f)` | `MainActivity.java:2356` | 打开后遮罩 alpha（**与 44 同值，好**） |
| 46 | `0x99000000` | `MainActivity.java:261` | 遮罩底色（与 44/45 的 0.6 **数值巧合一致但三处独立定义**，改一处会漂移） |
| 47 | `90f` / `0f` | `ChatActivity.java:1631, 1674, 1706, 1736` | chevron 旋转角（4 处字面量，瞬时） |
| 48 | `dp(22)`（ripple 半径） | `ChatActivity.java:471, 649, 657`；`MainActivity.java:396` | 圆钮水波纹半径 |
| 49 | `dp(999)` | `Theme.java:161`（`pill`）；`PairActivity.java:227`（`rippleOn(..., 999f)`） | 胶囊圆角 / 水波纹半径 |

### 2.4 透明度（状态与遮罩）

| # | 值 | 位置 | 用途 |
| --- | --- | --- | --- |
| 50 | `0.86` | `nav_enter.xml:6` / `nav_push_out.xml:8`（toAlpha）/ `nav_pop_out.xml:6` | 转场中页面的最低 alpha |
| 51 | `0.9` | `nav_pop_in.xml:6` / `nav_push_out.xml:8` | 转场中页面的中间 alpha |
| 52 | `0.10f`（浅）/ `0.16f`（深） | `Theme.java:168, 175` | 水波纹压色强度（**已集中，好先例**） |
| 53 | `0.45f` | `MainActivity.java:766`；`ChatActivity.java:2947` | 发送按钮禁用 alpha |
| 54 | `0.5f` | `Seats.java:1077` | 保存按钮禁用 alpha |
| 55 | `0.55f` | `Seats.java:2327` | 菜单 cell 禁用 alpha |
| 56 | `0.72f` | `Seats.java:1837` | 路径 cell 禁用 alpha |
| 57 | `1f` | `Seats.java:1049`；`MainActivity.java:766`；`ChatActivity.java:2947` | 启用 alpha |
| 58 | `0f`（起点） | `MainActivity.java:262`（mask）、`:1731`（searchPage）、`Seats.java:2154-2155`（card/scrim） | 动画起始 alpha |

> **总结**：**禁用态 alpha 有 4 个不同值（0.45 / 0.5 / 0.55 / 0.72）** —— 同一个「不可用」语义，四种视觉强度。必须收敛为 1~2 个令牌。

### 2.5 无动效（**「缺失」也是需要集中决策的表现层**）

| # | 现象 | 位置 | 说明 |
| --- | --- | --- | --- |
| 59 | 无按压缩放 | 全项目 | `setScaleX/Y` 零命中 —— 若决定加缩放，需 `PRESS_SCALE` + `PRESS_MS` |
| 60 | 无骨架/shimmer | 全项目 | `shimmer`/`pulse`/`blink` 零命中 |
| 61 | 无 stagger | 全项目 | 列表渲染无错峰 |
| 62 | 无 `smoothScroll` | `ChatActivity.java:1193, 1201` | 只有 `fullScroll` 瞬跳 |
| 63 | 无退场动画 | `MainActivity.java:1752`（搜索页）、`ChatActivity.java:511`（上传面板）、`MainActivity.java:592, 737`（上传面板）、`ChatActivity.java:238, 269, 215, 223, 2834` | 全部 `setVisibility(GONE)` 硬切 |
| 64 | 无速度追踪 | `Root.java`（70 行） | 抽屉拖拽无 fling |
| 65 | 无自定义 Dialog 动画 | `MainActivity` 6 处、`HostsActivity` 4 处、`SettingsActivity` 3 处、`Seats` 2 处 | 全部走系统默认；**唯一例外**是 `Seats` 底部面板 |
| 66 | 无主题切换过渡 | `MainActivity` 主题路径 | `recreate()` 整体重建，闪一帧 |

### 2.6 交互半径（圆角，决定动效可感知性）

| # | 值 | 位置 |
| --- | --- | --- |
| 67 | `8f` | `ChatActivity.java:1603, 1635, 1708`；`HostsActivity.java:517`；`MainActivity.java:1204`；`Seats.java:2385`；`SettingsActivity.java:535` |
| 68 | `10f` | `ChatActivity.java:1431, 2044`；`MainActivity.java:1410`；`Seats.java:1276, 1309, 1416, 1428, 1885, 1897, 2226` |
| 69 | `12f` | `ChatActivity.java:589`；`HostsActivity.java:353`；`MainActivity.java:1773`；`Seats.java:1189, 1225, 1770, 2339` |
| 70 | `14f` / `14` | `MainActivity.java:1054, 1438`；`SettingsActivity.java:395, 790, 1113` |
| 71 | `16f` / `16` | `SettingsActivity.java:821, 933` |
| 72 | `22f` | `ChatActivity.java:471, 649, 657`；`MainActivity.java:396` |
| 73 | `0f` | `MainActivity.java:1532` |
| 74 | `999f` | `PairActivity.java:227` |

> **总计 `ripple(` 调用 41 处，半径落在 8 个不同值（0/8/10/12/14/16/22/999）。**

### 2.7 其余视觉字面量（影响动效可读性，供 `Theme.java` 令牌化）

| # | 值 | 位置 | 用途 |
| --- | --- | --- | --- |
| 75 | `13f` / `t.muted` | `ChatActivity.java:1644, 1711` | 思考折叠头字号 |
| 76 | `14`（dp，图标） / `t.muted2` | `ChatActivity.java:1630, 1705` | chevron 尺寸与色 |
| 77 | `11f` | `ChatActivity.java:1692` | marker 胶囊字号 |
| 78 | `13.5f` | `Seats.java:2343` | 菜单行字号 |
| 79 | `52dp` / `58dp` | `SettingsActivity.java:399-400, 1117-1118` | 设置行高 |
| 80 | `44dp` | `Seats.java:2336` | 菜单行最小高 |
| 81 | `0x00000000`（写死透明） | `PairActivity.java:130` | chip 底色（**未走令牌**） |
| 82 | `0x99000000` | `MainActivity.java:261` | 遮罩底（见 #46） |
| 83 | `999dp` | `Theme.java:161` | `pill` 圆角 |

### 2.8 本结构小结（可直接执行的结论）

1. **`Motion.java` 第一批常量**（**已于 06:59 落地，但取值 = 下表旧字面量**）：9 个时长 + 4 条缓动（`EASE_STANDARD` / `EASE_DECELERATE` / `EASE_ACCELERATE` / `LINEAR`）+ 6 个位移/阈值 + 4 个 alpha。
   **仍未做**：① 把取值改成 SPEC 目标值；② 接线到 7 个 Activity/Seats（现状：全项目仅 `MainActivity.java:2355` 仍用 `new DecelerateInterpolator()`，**没有任何一处引用 `Motion.*`**）。
2. **`DecelerateInterpolator` 必须统一到一条曲线**：`nav` 用 `decelerate_cubic`、抽屉用 `DecelerateInterpolator`、其余 6 处干脆没设 —— 三态并存。
3. **禁用 alpha 收敛到 1~2 个值**（现状 4 个）。
4. **ripple 半径收敛到 3~4 个语义档**（现状 8 个）。
5. **2 个死动画文件（`nav_exit.xml` / `nav_hold.xml`）应清理** —— 它们携带的 170ms / `accelerate_cubic` 是唯一残留的「退出用 ease-in」痕迹，留着会误导实现者（**清理动作超出本审计的只读边界，须交 motion-core 在 `res/anim` 范围内执行**）。

---

## 三、逐交互差距与最小改法（已按 `official/MOTION-SPEC.md` 校准）

### 3.0 本节的前提：证据等级、可实施性核实、以及上一版阻塞的解除

`official/MOTION-SPEC.md`（re-motion / task-1）已落盘 → §0.4 记录的阻塞项**解除**；下表「参考目标」列全部改为逐条引用 `MOTION-SPEC §x.y` 的**条目号 + 数值**。

证据等级沿用 SPEC §1 图例，本项目侧另加两个记号：

| 记号 | 含义 | 可指认到 |
| --- | --- | --- |
| **[S]** | 官方静态字面量 | `official/jadx-out/sources/defpackage/xxx.java:NN` |
| **[M]** | 官方逐帧实测 | `shots/re/...`（**本轮尚未采集，见 SPEC §10 全 ☐**） |
| **[L]** | 库默认值 | **本轮无 androidx 源码 URL（本会话 web 检索 401）→ 一律不得写成官方证据，只能标 [无法取证-已说明]** |
| **[待实测]** | 官方侧尚无证据 | 禁止填数字 |
| **[P]** | **本项目**静态值 | 本项目 `android/src/.../xxx.java:NN` + 字面值 |
| **[M-P]** | **本项目**逐帧实测 | `shots/audit/*-frames.txt` / `*-yavg.txt` |

**形态差异（必须先说清楚）**：官方是 **Compose 1.11.4 + Material3 1.4.0**（`MOTION-SPEC §0`），本项目是 **原生 View 体系**（`android/build.sh:46` → `--min-sdk-version 21 --target-sdk-version 34`，无 Gradle）。因此本节**只对齐「可观测的表现层量」**（时长 / 曲线 / 幅度 / alpha / 顺序），**不对齐实现机制**；官方用 spring 的地方，本项目只能用 `PathInterpolator` 或 `Interpolator` 近似，凡近似一律在「最小改法」里标 **[近似]**。

### 3.0.1 已核实的可实施前提（`javap` 直读 `sdk/platform/android-35/android.jar`，本轮新增证据）

| 事实（本轮实测命令见 §六.6） | 对本审计的结论 |
| --- | --- |
| `android.view.animation.PathInterpolator` 有 **`PathInterpolator(float,float,float,float)`** 构造 | 官方三条缓动可**逐点直抄**，不需要拟合、不需要新依赖：`new PathInterpolator(0.4f,0f,0.2f,1f)` / `(0f,0f,0.2f,1f)` / `(0.4f,0f,1f,1f)`。min-sdk 21 满足 |
| `android.graphics.drawable.RippleDrawable` 的公开方法只有 `setColor` / `setRadius` / `setHotspot` / `setEffectColor` / `setPaddingMode` 等 | **没有** `setEnterDuration` / `setExitDuration` → **水波纹的时长无法通过公开 API 缩短**（本项目 41 处 ripple 都受此限）。「官方微交互 15/20/30/45ms vs 本项目系统默认」这条差距**属于有代价项**，见 §四 |
| `RippleDrawable.setRadius(int)` 是公开方法 | 半径收敛（§2.6 的 8 个值 → 3 档）**可实施**，且 `Theme.ripple()` 已是全项目唯一注入点 |

### 3.0.2 本轮新增的官方侧证据（我自己从反编译核出，补 `MOTION-SPEC §2.1/§2.4`）

`defpackage/z24.java:8-10`、`mh7.java:16`、`um9.java:8` 里出现的 `com.ishumei.smantifraud.l11l111lI1l.l111l1111lI1l` 是 **jadx 常量替换伪影**（jadx 把与某 SDK 常量同值的字面量替换成常量名），其值 = **`0.0f`**。反证：`um9.java:8` 同一字段位写的是字面量 `0.0f`、`um9.java:9` 写的是 `64.0f`；且 `z24.b = (x,x,0.2,1)` 与 SPEC §2.2 recorded 的 `cubic-bezier(0,0,0.2,1)` 逐位吻合。

由此**逐行读出**（这是 SPEC §2.4 的补充，可直接给 motion-core 抄）：

| 官方符号 | 精确内容 | 证据 |
| --- | --- | --- |
| `z24.b` | `cubic-bezier(0,0,0.2,1)` = **LinearOutSlowIn** | `z24.java:9` |
| `z24.c` | `cubic-bezier(0.4,0,1,1)` = **FastOutLinearIn** | `z24.java:10` |
| `mh7.a` | `TweenSpec(250ms, delay 200ms, cubic-bezier(0,0,0,1))` | `mh7.java:16` |
| `mh7.b` | `TweenSpec(200ms, delay 0ms, cubic-bezier(0.3,0,1,1))` | `mh7.java:15,17` |
| `mh7.c`（fadeIn 令牌） | `int iH = rv6.H(195.0f); int i = 300 - iH;` → `iH=195, i=105` → `fadeIn(tween(195ms, delay 105ms, LinearOutSlowIn))` | `mh7.java:18-22,23` |
| `mh7.d`（fadeOut 令牌） | `fadeOut(tween(105ms, delay 0ms, FastOutLinearIn))` | `mh7.java:19,21,23` |
| `c44.a/b/c` | `120ms FastOutSlowIn` / `150ms cubic-bezier(0.4,0,0.6,1)` / `120ms cubic-bezier(0.4,0,0.6,1)` | `c44.java:13-16` |
| `z09.a` | `15ms` + `z24.d`（lambda easing） | `z09.java:6` |
| `cb0.b` | `600ms, delay 200ms, cubic-bezier(0.42,0,0.58,1)` | `cb0.java:22-24` |
| `um9.c/d` | 单弹簧 `(0.6, 400)`；弹簧组 `(0.2,1000)` / `(1.0,130)` / `(0.8,300)` | `um9.java:10-11` |

> **对 motion-core 的直接指令**：`mh7.c/mh7.d` 的 `195 + 105 = 300` 是本轮**最可执行的发现** —— 官方「页面/抽屉类进出」不是「两个等长动画同时跑」，而是 **退出 105ms 先走完（ease-in），入场延迟 105ms 再跑 195ms（ease-out）**，合计 300ms。本项目 4 个 nav 资源（200/200/220/220，两侧同时起跑）**结构上完全不同**。

---

### 3.1 页面转场与返回（A3 / A4 —— 验收重点）

#### 3.1.1 前进 · 新页入场

| 列 | 内容 |
| --- | --- |
| **当前实现** | `res/anim/nav_enter.xml` = `alpha 0.86 → 1.0` + `translateX 9%p → 0`，**时长 200ms**（`nav_enter.xml:8,12`），插值器 `@android:interpolator/decelerate_cubic`（`nav_enter.xml:4`），alpha 端点 `0.86`（`nav_enter.xml:6`）；调用点 `Nav.java:28-33`（API 33+ 走 `overrideActivityTransition`，`Nav.java:10-13` 已记录 `targetSdk>=34` 时 `overridePendingTransition` 失灵的实测事实）。[P] |
| **参考目标** | `MOTION-SPEC §3.1`（`mh7.java:18-23`）= enter **195ms + delay **105ms**，`LinearOutSlowIn` = `cubic-bezier(0,0,0.2,1)`，语义 fadeIn；§3.1 总计 **300ms**；另 `MOTION-SPEC §3.2`（`mh7.java:27`）= 整段 300ms `cubic-bezier(0.4,0,0.2,1)`。[S] |
| **差距** | ① 时长 200 → 195（≈同级，**不是**主要问题）；② **曲线族不同**：`decelerate_cubic` ≠ `cubic-bezier(0,0,0.2,1)`；③ **缺 105ms 错峰**：官方 enter 延迟 105ms 起跑，与 exit 形成「先出后进」的 300ms 节奏，本项目两侧同时起跑；④ 位移 `9%p` 是项目自定 parallax（`nav_pop_in.xml` 头注释已记录为**有意设计** → 按 skill 硬规则 5 **不作为缺陷**）。 |
| **最小改法** | 只改 `res/anim/nav_enter.xml`（归 motion-core 写域）：`android:duration` `200 → 195`；加 `android:startOffset="105"`；`android:interpolator` 换成 `@interpolator/ease_decelerate.xml`（= `PathInterpolator(0f,0f,0.2f,1f)` = `Motion.EASE_DECELERATE` = 参考 `z24.b`，资源**已存在**）。位移 `9%p` 与 alpha 端点**保持**。**（07:20 更正：此处原写 `motion_emph_decel`，归属搞错了 —— 强调曲线属 `§6.1/§6.2` 面板/抽屉，不是转场；见 §3.9.7）** |
| **验证** | 逐帧对照 A3：需确认 `overrideActivityTransition` 是否承认 `startOffset`（SPEC §10 A3 = ☐ 未采集，本项目侧同样未录 A3）→ 见 §六.7 采集脚本。若不认，退化为「出 105ms / 入 195ms 无错峰」（总 195ms），**仍是净收益**。 |

#### 3.1.2 前进 · 旧页退场

| 列 | 内容 |
| --- | --- |
| **当前实现** | `res/anim/nav_push_out.xml` = `alpha 1.0 → 0.9` + `translateX 0 → -8%p`，**200ms**（`nav_push_out.xml:8,12`），`decelerate_cubic`（`:4`）。[P] |
| **参考目标** | `MOTION-SPEC §3.1`（`mh7.java:19,21,23`）= exit **105ms, delay 0**，`FastOutLinearIn` = **`cubic-bezier(0.4,0,1,1)`**（强 ease-in）。[S] |
| **差距** | ① **曲线方向反了**：本项目退出也走 ease-**out**（「慢慢停住」），官方退场走 ease-**in**（立刻加速离开）；② 时长 200 → 105（官方退场只有入场的 54%）。这是本项目转场最明显的一处「缓动语义错配」。 |
| **最小改法** | `nav_push_out.xml`：`duration 200 → 105`；`interpolator` → `@interpolator/ease_accelerate.xml`（`PathInterpolator(0.4f,0f,1f,1f)` = `Motion.EASE_ACCELERATE` = 参考 `z24.c`，资源**已存在**）。位移 `-8%p` 与 alpha `0.9` 保持。**（07:20 更正，理由同上）** |

#### 3.1.3 返回 · 露出页入场 / 3.1.4 返回 · 退场页出场

| 列 | 内容 |
| --- | --- |
| **当前实现** | `nav_pop_in.xml` = `alpha 0.9 → 1.0` + `translateX -8%p → 0`，**220ms**，`decelerate_cubic`（`:4,6,7,11,12`）；`nav_pop_out.xml` = `alpha 1.0 → 0.86` + `0 → 9%p`，**220ms**，`decelerate_cubic`。[P] |
| **参考目标** | 同一组令牌 `MOTION-SPEC §3.1`（195+105 / 105）。**pop 是否与 push 对称 = `MOTION-SPEC §3.6` [待实测]**。[S] + [待实测] |
| **差距** | ① 与 3.1.1/3.1.2 同源缺陷（曲线族 + 无错峰 + 220 偏长）；② 项目 push 200 / pop 220 **本身不对称**（220 = 200 + 10%，无注释依据）；③ alpha 端点 `0.86/0.9` 是「不透明到底」的中庸做法，官方是纯 fade `0→1 / 1→0` —— **建议保留中间值并加注释**（本项目的下方窗口是真实存在的 Activity，纯 fade 会有闪烁风险），**不判为缺陷**。 |
| **最小改法** | `nav_pop_in.xml`：`220 → 195` + `startOffset 105` + `@interpolator/ease_decelerate`（`Motion.EASE_DECELERATE`）；`nav_pop_out.xml`：`220 → 105` + `@interpolator/ease_accelerate`（`Motion.EASE_ACCELERATE`）。**（07:20 更正：两条都是标准曲线，不是强调曲线）** |

#### 3.1.5 启动页首帧（A1 —— 本项目最大的「零动效」缺口）

| 列 | 内容 |
| --- | --- |
| **当前实现** | `SplashActivity.java:21` `HOLD_MS = 620L`；`:61-66` `root.postDelayed(go, 620)`；`:85` `Nav.none(this)` → `Nav.java:61-66` 的 `overrideActivityTransition(OPEN, 0, 0)` = **零转场**；logo 是静态 `setImageResource`（`SplashActivity.java:36-39`），**无任何入场动画**。[P] |
| **动态证据** | `shots/audit/A1c.mp4`（8.03s / 176 帧）+ `A1c-frames.txt`：启动页出现是**单帧硬切**（t=3.551，YAVG 0.000 → **9.742**，下一帧即回落噪声）；`splash → MainActivity` 交换同样是单帧（YAVG 0.000 → **1.217** → 0.000）。参照量级：真实窗口切换的差值在 **8–9**，所以 1.217 也是硬切。[M-P] |
| **参考目标** | `MOTION-SPEC §10 A1` = **☐ 未采集**（官方启动页动效本轮无证据）；可引用的只有 §3.1/§3.2 的 300ms 令牌族存在性 + §2.2 三条缓动常量。[S] + [待实测] |
| **差距** | 参考侧**无法做数值对齐**（SPEC 自己标 ☐）。可判定的是本项目侧：冷启动是**唯一会让用户停留 620ms 的页面，却零动效** —— 620ms 的静态等待 + 单帧硬切。 |
| **最小改法** | **不动** 620ms 停留与 `postDelayed` 跳转逻辑（`SplashActivity.java:61-66` 属逻辑）；只给 logo 加入场：`logo.setAlpha(0f); logo.setScaleX(0.96f); logo.setScaleY(0.96f);` → `logo.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(195).setInterpolator(Motion.EASE_DECELERATE)`（= §3.1 `mh7.c` 的 `LinearOutSlowIn`；**令牌已存在** `Motion.java:174`，`cubic-bezier(0,0,0.2,1)`）。这是**唯一不动逻辑即可回收「最值得的一处动效」**的地方。 |

#### 3.1.6 死动画资源（会误导实现者）

| 列 | 内容 |
| --- | --- |
| **当前实现** | `res/anim/nav_exit.xml`（**170ms**，`@android:interpolator/accelerate_cubic`，`:3,8,13`）与 `res/anim/nav_hold.xml`（200ms，`:4`）**全项目零引用**（§三「死文件」= §2.1 行 6/7）。[P] |
| **参考目标** | 不适用（这是项目内卫生问题）。 |
| **差距** | `nav_exit.xml` 携带的 `accelerate_cubic` 是**本仓库唯一残留的 ease-in 曲线**——恰好与官方退场语义（§3.1 exit = FastOutLinearIn）方向一致，但被弃用；留着会让后来者以为「退场用 ease-in」已被否决。 |
| **最小改法** | 删除两文件（**属 motion-core 的 `android/res/anim` 写域，本审计只读不删**），或把 `nav_exit.xml` 的曲线抽进新建的 `@interpolator/motion_emph_accel` 后删除。 |

#### 3.1.7 `Nav.none()`（保留，非缺陷）

| 列 | 内容 |
| --- | --- |
| **当前实现** | `Nav.java:61-66`：`overrideActivityTransition(OPEN, 0, 0)`（API 33+）/ `overridePendingTransition(0,0)`。[P] |
| **参考目标** | 无对应条目（SPEC 未记录「零转场」）。 |
| **差距** | 无。**记录为有意设计**（启动页 → 主页的交接不需要二次转场）。 |
| **最小改法** | **不动**。 |

---

### 3.2 弹层 / 底部面板 / 对话框（A5 / A6 —— 验收重点）

#### 3.2.1 底部面板进入（全项目唯一「有动画的弹层」）

| 列 | 内容 |
| --- | --- |
| **当前实现** | `Seats.java:2150-2158`：`card.setTranslationY(t.dp(26)); card.setAlpha(0f); scrim.setAlpha(0f);` → `card.animate().translationY(0).alpha(1).setDuration(200)`（**无 `setInterpolator`**，`Seats.java:2157`）；`scrim.animate().alpha(1).setDuration(200)`（同 `:2158`，也无曲线）；每次 open 都重设 `lp.height` + `requestLayout`（`:2150-2152`）。[P] |
| **参考目标** | `MOTION-SPEC §6.1` = `mh7.a` = **250ms + delay 200ms**，`cubic-bezier(0,0,0,1)`（`mh7.java:16`）[S]；最近可用的一组 = §6.3 `c44.a` 120ms FastOutSlowIn / `c44.b` 150ms `cubic-bezier(0.4,0,0.6,1)`（`c44.java:13-16`）[S]；位移量与遮罩/面板先后（顺序列）SPEC 全标 **[待实测]**。 |
| **差距** | ① **完全无曲线**（ViewPropertyAnimator 走系统默认插值）→ 起步与收尾都不受控；② 时长 200 vs 250（+200 延迟）；③ 本项目「卡片与遮罩同时起跑」，官方 §6.1 语义是**内容延迟入场**；④ 起始位移 26dp **无官方量可对本**（SPEC 待实测）；⑤ **每次 open 重新 `requestLayout`** 会让动画首帧与布局同拍，是掉帧风险点（表现层问题，非逻辑）。 |
| **最小改法** | `Seats.java:2157-2158`（表现层）：面板 `.setDuration(250).setStartDelay(200).setInterpolator(Motion.EASE_EMPH_DECEL)`；遮罩 `.setDuration(250).setInterpolator(Motion.EASE_EMPH_DECEL)`、**无 delay**（先铺底再出内容 = §6.1「内容延迟入场」的可观测实现）。位移 26dp 保持（官方量待实测）。`lp.height` 的重设逻辑**不动**（属布局）。**令牌缺口**：`Motion.EASE_EMPH_DECEL = PathInterpolator(0f,0f,0f,1f)`（= `mh7.a`，`mh7.java:16`）**现 `Motion.java` 中没有**（只有 standard/decelerate/accelerate/linear）→ §3.9 待补；辅助方法 `Motion.pathBezier(x1,y1,x2,y2)` 已存在可直接用。 |
| **验证** | 逐帧对照 A5（`shots/audit/` 现无 A5 录屏）→ §六.7。 |

#### 3.2.2 底部面板退出

| 列 | 内容 |
| --- | --- |
| **当前实现** | `Seats.java:2167-2174`：`card.animate().translationY(t.dp(30)).alpha(0).setDuration(150)`（**无曲线**）+ `withEndAction { win.dismiss(); }`；`scrim.animate().alpha(0).setDuration(150)`（同 `:2174`）。**进 26dp / 出 30dp 不对称，源码无注释依据**。[P] |
| **参考目标** | `MOTION-SPEC §6.2` = `mh7.b` = **200ms, delay 0, `cubic-bezier(0.3,0,1,1)`**（`mh7.java:15,17`）[S]。 |
| **差距** | ① 时长 150 vs 200（本项目退场**比进场快**，官方退场 200 vs 进场 250 —— 方向一致，量不同）；② **无曲线**，官方退出是强 ease-in（`0.3,0,1,1`）；③ 26dp/30dp 不对称无依据。 |
| **最小改法** | `.setDuration(200).setInterpolator(Motion.EASE_EMPH_ACCEL)`（`PathInterpolator(0.3f,0f,1f,1f)` = `mh7.b` `mh7.java:15,17`；**待补令牌，见 §3.9**）；把退场 `30dp` 改为与进场同值（`26dp`）→ **进出一致化**（标 `[本项目内一致化]`，非 SPEC 条目，因为 SPEC 的位移量待实测）。`withEndAction { dismiss }` **保持**（它是生命周期，不是表现层）。 |

#### 3.2.3 Dialog（全项目 15 处，全部系统默认进出场）

| 列 | 内容 |
| --- | --- |
| **当前实现** | `new Dialog(this)` / `AlertDialog`：`MainActivity.java:1184, 1608, 1982, 2007, 2088, 2133`；`HostsActivity.java:451, 524, 560, 619, 727`；`SettingsActivity.java:512, 761, 897, 671, 735`；`Seats.java:1379, 1847`。仅 `sizeDialog(320/340)` 设宽（`MainActivity.java:1184` 等），**无 `setWindowAnimations`、无自定义进出场**。[P] |
| **参考目标** | `MOTION-SPEC §6.4`（Dialog 进出）= **[待实测]**；`§6.7`（M3 Dialog 默认 fade+scale）= **[L] 待补 URL → 按本轮纪律不得当官方证据**。 |
| **差距** | **官方侧无可用数值 → 本条不做数值对齐**。可判定的是本项目侧：15 处弹窗全部依赖系统默认，风格与 `Seats` 的自绘弹层**两套观感并存**（自绘面板有 200/150ms 位移+alpha，系统 Dialog 是平台 fade+scale）。 |
| **最小改法** | 给 Dialog 指定**官方同 App 的最近可用令牌** §6.3：`dlg.getWindow().setWindowAnimations(R.style.DialogMotion)`，`DialogMotion` 引用一对新 `res/anim`（进场 fade + `scale 0.96→1`，120ms + `c44` 的 FOSI ≈ `PathInterpolator(0.4f,0f,0.2f,1f)`；退场 fade + `scale 1→0.96`，150ms + `PathInterpolator(0.4f,0f,0.6f,1f)`）。**必须在文档与代码注释里标清：这是「官方同 App 令牌族里最近的一条」，不是官方 Dialog 规格（§6.4 待实测）**。 |

#### 3.2.4 底部菜单 / 下拉（`Seats` 的菜单行）

| 列 | 内容 |
| --- | --- |
| **当前实现** | 与底部面板同一套机制（`Seats.java:2336-2343`：`minimumHeight 44dp`、菜单行字号 `13.5f`、`t.ripple(8f)`），无独立进出场。[P] |
| **参考目标** | `MOTION-SPEC §6.5`（DropdownMenu）= **[待实测]**。 |
| **差距** | 无取证值；现状与 3.2.1/3.2.2 同源（补曲线 + 时长即可受益，无需单独动效）。 |
| **最小改法** | 随 3.2.1/3.2.2 一并生效，**不新增**。 |

#### 3.2.5 上传面板 / 附件条的显隐（硬切）

| 列 | 内容 |
| --- | --- |
| **当前实现** | `ChatActivity.java:511`（`uploadPanel` `setVisibility(GONE)`）、`:238` / `:2834-2837`（`attachStrip`）、`MainActivity.java:592, 737`（上传面板）—— **全部 `setVisibility` 硬切，无退场动画**（§2.5 行 63）。[P] |
| **参考目标** | `MOTION-SPEC §6.3`「长/短面板另一组」= `c44.a` **120ms**（FOSI）/ `c44.b` **150ms**（`cubic-bezier(0.4,0,0.6,1)`）/ `c44.c` **120ms**（`c44.java:13-16`）[S]。 |
| **差距** | 面板显隐「瞬跳」，即使有位移也没有过渡；而官方为「短面板」准备了 120/150ms 一对令牌。 |
| **最小改法** | 显：`alpha 0→1` + `translationY 8dp→0`，120ms + FOSI；隐：`alpha 1→0` + `translationY 0→8dp`，150ms + `cubic-bezier(0.4,0,0.6,1)`，`withEndAction { setVisibility(GONE) }`。**不动高度与内容逻辑**（避免 `requestLayout` 抖动）。 |

#### 3.2.6 `sizeDialog` 只设宽（视觉一致性）

| 列 | 内容 |
| --- | --- |
| **当前实现** | `sizeDialog(320/340)`＝只 `setLayout(w, WRAP_CONTENT)`（`MainActivity.java:1184` 等）。[P] |
| **参考目标** | 无 SPEC 条目（属布局）。 |
| **差距** | 无动画差距；仅提示：宽度固定值不随动效缩放，`scale` 进场时边距不会跟着变（可接受）。 |
| **最小改法** | 不动。 |

---

### 3.3 按压反馈（A2 / A7）

#### 3.3.1 全局按压：只有水波纹，且时长不可控（**有代价**）

| 列 | 内容 |
| --- | --- |
| **当前实现** | 全项目 41 处 `t.ripple(...)`，半径落 8 个值（§2.6）；压色已集中 `0.10f` 浅 / `0.16f` 深（`Theme.java:168, 175`）；`setScaleX/setScaleY` **零命中** → 无按压缩放（§2.5 行 59）。[P] |
| **动态证据** | `shots/audit/A7.mp4`（2.0s / 42 帧，长按首页 ＋ 钮 1.2s）：唯一信号是 YAVG 峰值 **1.254** 的衰减段，跨 t=1.315→1.615（约 **300ms**）+ 小尾巴到 1.699。**量级印证**：真实几何变化（窗口切换）在同一套采集里是 **8–9**，所以 1.25 = 纯色变（水波纹），**没有缩放**。[M-P] |
| **参考目标** | `MOTION-SPEC §4.1` = `z09.a` = tween(**15ms**, 0, `z24.d`)（`z09.java:6`）[S]；§4.2 = `v4.java:579,586` 的 **45ms / 150ms** 成对 [S]；§4.3 = `jw1.java:77` 的 **20ms / 30ms** 成对 [S]；§4.4（按压缩放幅度）= [待实测]；§4.5（ripple 半径/透明度/bounded）= [待实测]。 |
| **差距** | ① **官方同 App 的微交互时长量级是 15 / 20 / 30 / 45ms**，本项目水波纹走系统默认（**约 200ms 量级**）→ 反馈「慢半拍」；② 按压缩放官方 [待实测]，本项目**确定为零**（静态零命中 + 动态无量级信号）。 |
| **最小改法** | (a) **半径收敛可做**：在 `Theme.ripple()` 内集中到 3 档语义（建议 `8f → SM`、`12f/14f/16f → MD`、`22f/999f → FULL`），41 处调用改传语义名；`RippleDrawable.setRadius(int)` 是公开 API（§3.0.1 已核实）。(b) **时长不可做**：`RippleDrawable` 无公开 `setEnterDuration/setExitDuration`（§3.0.1 已核实）→ 除非自绘 ripple，否则**无法**把反馈压到 15–45ms 量级 → 记入 §四。(c) 按压缩放：需给每个按钮加 `OnTouchListener` 做 `animate().scaleX(0.97f)`，**与 `Root.java` 的手势边缘区（26dp）可能冲突** → 建议单独立卡，不与本轮混做。 |

#### 3.3.2 六处主控件**完全没有**按压反馈（「零」而非「弱」）

| 列 | 内容 |
| --- | --- |
| **当前实现** | `NewSessionActivity.java:155` submit（`setBackground(t.round(t.accent, 26f))` 静态）；`:222-224` workspace row（`t.roundStroke(...)`）；`:327-330` model chip（`setBackground(t.round(selected ? accent : surfaceAlt, 18f))` 硬换色）；`PairActivity.java:86-87` connect（`t.round(t.accent, 26f)`）；`:96` probe（**仅 `setClickable`，无 `setBackground`**）；`:130-131` host chip（`t.roundStroke(0x00000000, t.line, 16f)`）。`grep 'ripple('` 在 **`NewSessionActivity.java` 全文 0 命中**。[P] |
| **参考目标** | `MOTION-SPEC §4.5`（ripple 半径 / 是否 bounded）= [待实测]；但「官方对列表项与小控件存在多条长短反馈令牌」已由 §4.1–§4.3 确证 [S]。 |
| **差距** | 同构控件在 `SettingsActivity`（`t.ripple(14)`, `:395, 790, 1113`）与 `HostsActivity`（`t.ripple(12f)`, `:353`）**有** ripple，在这两页**没有** → **页间不一致**（本项目内缺陷，**不需要 SPEC 即可判定**）。`NewSessionActivity` 是全 App 唯一「整页零按压反馈」的页面。 |
| **最小改法** | 6 处把 `setBackground(<现有底色构造>)` 换成 `setBackground(t.rippleOn(<同一个色值>, <同一个半径>))` —— **只换构造函数名，底色/几何/圆角一个像素都不变**；`Theme.rippleOn(fill, radiusDp)` 已存在（`Theme.java:174-181`），**零新增依赖、零新 View**。`PairActivity.java:96` 的 probe 需要先确认它当前靠什么显示（`setClickable` only）→ 加 `t.ripple(16f)`。 |

#### 3.3.3 圆钮（＋ / 发送 / chevron）半径 22f

| 列 | 内容 |
| --- | --- |
| **当前实现** | `ChatActivity.java:471, 649, 657`；`MainActivity.java:396`，半径 `t.dp(22)`。[P] |
| **参考目标** | `MOTION-SPEC §4.5` = [待实测]。 |
| **差距** | 无外部参照；项目内部只需内聚（见 3.3.1a）。 |
| **最小改法** | 内聚为 `RIPPLE_FULL` 档。 |

---

### 3.4 手势与滚动（A10 / §7）

#### 3.4.1 抽屉拖拽（本项目自绘手势，官方无对应证据）

| 列 | 内容 |
| --- | --- |
| **当前实现** | `Root.java`：`edge = 26dp`（`:25`）、`slop = 10dp`（`:26`）、主轴判定 `abs(dy) > abs(dx) * 1.4f`（`:46`）；`MainActivity.java:289-294`：`x = min(0f, -drawerWidth + dx)` —— **无阻尼、无边界回弹**；遮罩 `alpha = min(1f, dx / drawerWidth) * 0.6f`（`:294`）；松手 `if (dx > drawerWidth * 0.34f) openDrawer()`（`:300`）—— **纯位移阈值，零速度项**（`VelocityTracker` / `GestureDetector` 全项目零命中）。[P] |
| **参考目标** | `MOTION-SPEC §7.3`「拖动/拖拽释放回弹」可用令牌 = 弹簧 `(0.6, 400)` / `(0.8, 300)` / `(1.0, 130)`（`um9.java:10-11`）[S]；`§7.5` 侧滑抽屉 = [待实测]（**SPEC 明确写明「项目侧现有实现是 220ms，不作为参考值」**）。 |
| **差距** | ① 拖拽无阻尼（官方拖拽类以弹簧语义表达释放）；② **松手无速度项** → 快速轻扫（flick）不会开抽屉，必须拖过 34% 宽度；③ `1.4f` 是魔法数（应令牌化）。 |
| **最小改法** | (a) **可做（纯表现层）**：把 `0.34f` 与 `1.4f` 提为 `Motion` 常量并注释；(b) **松手回弹**若要用弹簧观感：Android 无公开 `SpringInterpolator` → 用 `PathInterpolator` 近似 **[近似]**；(c) **加速度项需 `VelocityTracker` + 改 `Root.java`/`MainActivity.java` 的手势判定 → 属「交互层」，不是纯表现层，建议单独立卡由 lead 判是否越界**。本审计只给方案：`vx > 800px/s` 且方向为开 → 直接开（惯用阈值，**非官方证据**）。 |

#### 3.4.2 抽屉开合（点击路径）

| 列 | 内容 |
| --- | --- |
| **当前实现** | 开：`translationX(0).setDuration(220)` + `new DecelerateInterpolator()`（`MainActivity.java:2354-2355`，import `:29`），遮罩 `alpha(0.6f).setDuration(220)` **无曲线**（`:2356`）；关：`translationX(-drawerWidth).setDuration(190)` **无曲线**（`:2379`），遮罩 `alpha(0).setDuration(190)` + `withEndAction { hide }`（`:2380-2388`）；`closeDrawerNow()` 走 `cancel()` + 直接赋值（`:2360-2369`）。遮罩底色 `0x99000000`（`:261`）与 `0.6f`（`:294`, `:2356`）**三处独立定义、数值巧合一致**。[P] |
| **参考目标** | 抽屉按「抽屉类进出」→ `MOTION-SPEC §3.1/§6.1` 同组令牌：进 **250ms + delay 200ms，`cubic-bezier(0,0,0,1)`**；出 **200ms，`cubic-bezier(0.3,0,1,1)`**（`mh7.java:15-17`）[S]。 |
| **差距** | ① **曲线三态并存**：`DecelerateInterpolator`（`t' = 1-(1-t)²`）≠ nav 用的 `decelerate_cubic` ≠ 「没设曲线」；② 时长 220/190 vs 250/200；③ **遮罩与位移不同源**（位移有曲线、遮罩没有）→ 开合时遮罩与抽屉会有肉眼可见的相位差；④ 三处独立定义的遮罩值会让后来者改一处而漂移。 |
| **最小改法** | 位移与遮罩**必须同源**：`MainActivity.java:2354-2356` 与 `:2379-2388` 统一改用 250ms + `Motion.EASE_EMPH_DECEL`（`PathInterpolator(0f,0f,0f,1f)`）+ `setStartDelay(200)`（**仅面板**）/ 200ms + `Motion.EASE_EMPH_ACCEL`（`PathInterpolator(0.3f,0f,1f,1f)`），并把 `Motion.java` 的 `DUR_DRAWER_IN(220)` / `DUR_DRAWER_OUT(190)` **改写为 250 / 200**；遮罩值收敛为 `Motion.SCRIM_ALPHA`（`0.6f`，**已存在** `Motion.java:274`）并从 `0x99000000` 派生（`Theme.alpha(0xFF000000, 0.6f)` 等价）；同时删掉 `MainActivity.java:29` 的 `DecelerateInterpolator` import。`closeDrawerNow()` 的 `cancel()` **保持**（它是中断正确性）。 |

#### 3.4.3 惯性滚动 / overscroll（A10）

| 列 | 内容 |
| --- | --- |
| **当前实现** | `setOverScrollMode(View.OVER_SCROLL_NEVER)` **共 10 处**：`ChatActivity.java:230`、`HostsActivity.java:93`、`MainActivity.java:478, 968, 1307, 1718`、`Seats.java:489, 2109, 2367`、`SettingsActivity.java:207`；全部同时 `setVerticalScrollBarEnabled(false)`。→ **无拉伸、无辉光**。[P] |
| **参考目标** | `MOTION-SPEC §7.2`（下拉/overscroll 是否拉伸/辉光/无）= **[待实测]**。 |
| **差距** | **官方侧无证据 → 不判缺陷**（且官方是 Compose：`LazyColumn` 在 Android 上默认也无 stretch/glow，本项目的「一律关闭」很可能是**已经对齐的**）。 |
| **最小改法** | **不动**。先补 `MOTION-SPEC §7.2` 的实测再谈；记入 §四。 |

#### 3.4.4 流式自动滚底

| 列 | 内容 |
| --- | --- |
| **当前实现** | `ChatActivity.java:1193, 1201` `scroller.fullScroll(View.FOCUS_DOWN)` = **瞬跳**；项目内唯一 `smoothScrollTo` 在 `Seats.java:933`；流式合帧 `ui.postDelayed(renderSoon, 120)`（`ChatActivity.java:1091`）。[P] |
| **参考目标** | `MOTION-SPEC §8.4`：自动滚底由**远端 KV 设置项**驱动 —— `sse_auto_scroll_one_screen`、`sse_auto_scroll_smooth_stiffness`、`sse_smooth_follow`，平滑跟随是**弹簧**，刚度来自远端 KV [S 键名；数值待抓 KV]。 |
| **差距** | ① 本项目瞬跳 vs 官方弹簧平滑跟随；② 官方的跟随强度是**用户可配置的远端设置**（本项目无此设置，**属功能差异 → 不新增**）；③ 120ms 合帧是「减少重绘」，**不是**动效，勿混为一谈。 |
| **最小改法** | 把 `fullScroll(FOCUS_DOWN)` 换成 `smoothScrollBy(dy, 180)` + `PathInterpolator(0f,0f,0.2f,1f)`（近 `LinearOutSlowIn` = §3.1 enter 曲线）**[近似]**（Android 无公开弹簧插值器）。**不动** 120ms 合帧、不动 SSE 处理。 |

---

### 3.5 chip / 开关 / 分段控件（A11 / A12）

#### 3.5.1 chip 选中（项目两套实现，全部硬换）

| 列 | 内容 |
| --- | --- |
| **当前实现** | ① 问题卡选项 chip：`ChatActivity.java:2619-2645`，`chip.setBackground(t.roundStroke(on ? t.accentSoft : t.surface, on ? t.accent : t.line, 12f))` + `t.text(label, 13f, on ? t.accent : t.text)`，**选中后走 `renderSheet()` 重建**；② 新建会话模型 chip：`NewSessionActivity.java:327-330`，`t.round(selected ? t.accent : t.surfaceAlt, 18f)` 硬换色；③ composer 的 `seatChip`（`ChatActivity.java:663-687`，几何：13dp 图标 + 12.5sp 文字 + 10dp chevron，高 30dp / 半径 15dp）在 `renderChips()`（`:689-700`）里**只重着色图标**。[P] |
| **参考目标** | `MOTION-SPEC §9.1`（chip 选中/取消）= **[待实测]**；同 App 最近可用令牌 = §6.3 `c44.a` **120ms** FOSI（`c44.java:14`）[S]。 |
| **差距** | 官方 chip 动效数值无取证 → **不做数值对齐**。可判定的是本项目侧：**选中是「瞬跳」**；且 `GradientDrawable` 换色**无法**被 `ViewPropertyAnimator` 直接动画（每帧 `setBackground` 新 drawable 会闪）→ 所以这不是「加两行」能解决的，需要一层前景。 |
| **最小改法** | 每个 chip 加一层**前景 View**（同圆角、选中色、初始化 `alpha 0f`），选中时 `fg.animate().alpha(on ? 1f : 0f).setDuration(120).setInterpolator(Motion.EASE_STANDARD)`（`Motion.EASE_STANDARD` = FastOutSlowIn `cubic-bezier(0.4,0,0.2,1)`，**已存在** `Motion.java:165`）；**`setBackground` 与 `renderSheet()` 的选中逻辑完全不动**（不改状态、不改数据、不改重建路径）。代价：每 chip 多一个 View（表现层）。 |

#### 3.5.2 Switch（A11）

| 列 | 内容 |
| --- | --- |
| **当前实现** | 全 App **唯一** 真实 `Switch` = `SettingsActivity.java:1280-1286`（字体对话框「跟随系统」行）：`switcher.setChecked(follow); switcher.setThumbTintList(ColorStateList.valueOf(t.ok)); switcher.setTrackTintList(ColorStateList.valueOf(Theme.alpha(t.ok, 0.38f)));` → 滑动动效是**平台实现**，本项目只改色。另 `Seats.java:1397` 有一个 `CheckBox`（权限确认）。[P] |
| **参考目标** | `MOTION-SPEC §9.3`（Switch 滑块位移 + 轨道色）= **[待实测]**；`§9.4`（M3 Switch 默认 spec）= **[L] 待补 URL**。 |
| **差距** | **官方侧完全无证据 → 无法对齐**。原理上双方都是平台/M3 自带的 switch 动画，观感差异不可量化。 |
| **最小改法** | **不动**，记入 §四。 |

#### 3.5.3 字体大小滑块（自绘 SeekBar）

| 列 | 内容 |
| --- | --- |
| **当前实现** | `SettingsActivity.java:1305-1357` 手搓：`SeekBar seek`（`setMax(100)`、`setSplitTrack(false)`）+ 22dp OVAL 自绘 thumb（`setSize(dp(22), dp(22))`，1dp 描边 `Theme.alpha(t.text, 0.18f)`）+ 自绘 track（`t.round(Theme.alpha(t.text, 0.24f), 1.5f)`）+ 独立 ticks View（`dp(9)` 高、`topMargin dp(13)`）；映射 `fontScale 0.80~1.20 → progress 0~100`（`:1405-1413`）。[P] |
| **参考目标** | `MOTION-SPEC §9.2`（分段控件指示器移动）= **[待实测]**。 |
| **差距** | 无取证值 → 不动。**附带发现（非动效）**：thumb 22dp < 项目自己在 `Seats.java:2336` 定的 44dp 最小触控高 → **可及性偏小**，但改尺寸会动布局，超出本审计范围。 |
| **最小改法** | **不动**（记录）。 |

---

### 3.6 加载 / 空态 / 对话流（A8 / §5 / §8）

#### 3.6.1 加载态（本项目零骨架 / 零 shimmer / 零三点）

| 列 | 内容 |
| --- | --- |
| **当前实现** | `ProgressBar` **全项目零命中**；加载 = **纯文本**：`Seats.java:683`（`R.string.seat_loading_models` / `seat_no_models`）、`:1515, 1581, 1637, 1706`（`sheet.note(host.getString(R.string.harness_loading))`）、`SettingsActivity.java:1200`（`R.string.harness_loading`）。[P] |
| **参考目标** | `MOTION-SPEC §5.1` = `cb0.b` = tween(**600ms, delay 200ms, `cubic-bezier(0.42,0,0.58,1)`**)（`cb0.java:22-24`）[S]；`§5.2` = `w2b.java:784-785` 三点透明度无限动画：幅度 **1.0 ↔ 0.1 ↔ 0.87**，`infiniteRepeatable(keyframes, iterations=1, offset -100ms/-200ms)`，**错峰步长 100ms** [S]；`§5.3`（骨架出现延迟/debounce）= [待实测]；`§5.4` = [L] 待补。 |
| **差距** | ① 项目零骨架、零扫光、零点状指示 → 加载全是「一行文字硬替换」；② 官方同 App **明确有** 600ms 扫光与 100ms 错峰三点两套令牌；③ 但 `cb0.b` 的**位移方向与幅度**、以及是否 `infiniteRepeatable` 仍 [待实测] → 不可照抄幅度。 |
| **最小改法** | (a) **三点指示（最划算）**：在加载文本旁加 3 个 dot，按 §5.2 的**已确证数值**实现（错峰 100ms，alpha 1.0 / 0.1 / 0.87，靠 `postDelayed` 驱动 —— 项目已有 `postDelayed` 先例 `ChatActivity.java:1091`）；(b) 扫光骨架：用 `§5.1` 的 600ms + delay 200ms + `PathInterpolator(0.42f,0f,0.58f,1f)`，**幅度自定**（SPEC 待实测，不得照抄）。两者都是**表现层**，不动数据加载流程；**代价 = 新增视觉元素**（见 §四）。 |

#### 3.6.2 流式新消息入场（本项目完全没有）

| 列 | 内容 |
| --- | --- |
| **当前实现** | `ChatActivity.java` 的 `render()` 全量重建列表，**新气泡无入场动画**（无相关触点；`ui.postDelayed(renderSoon, 120)` 只是合帧 `:1090-1091`）。[P] |
| **参考目标** | `MOTION-SPEC §8.1`（气泡进入）= **[待实测]**。 |
| **差距** | 官方无取证值；但 SPEC §2.4 已确证官方存在 120/150ms 与 195/105ms 两组令牌，可用于最小入场。 |
| **最小改法** | 只对「**新增的最后一条**」气泡做 `alpha 0→1` + `translationY 8dp→0`，**195ms** + `PathInterpolator(0f,0f,0.2f,1f)`（§3.1 enter 令牌）。**风险与纪律**：必须在 `render()` 之后按**消息 id** 判断「是否首帧」，否则每次重建都会重放动画（这是本条唯一可能触及逻辑的地方 → **只允许加一个「上次渲染的最新 id」比较**，不改任何数据流）。 |

#### 3.6.3 思考折叠 / 工具卡展开（**本项目最高频动效，现在是「跳」的**）

| 列 | 内容 |
| --- | --- |
| **当前实现** | chevron `chevron.setRotation(open ? 90f : 0f)` **瞬变**（`ChatActivity.java:1631, 1674, 1706, 1736`）；折叠体 `body.setVisibility(willOpen ? VISIBLE : GONE)` **硬切**（`:1666, 1673, 1728, 1735`）；头部 `t.ripple(8f)`（`:1635, 1708`）；头部内边距 `(0, 4, 6, 4)`（`:1637, 1710`）；label `13f` / `t.muted`（`:1644, 1711`）；chevron `14dp` / `t.muted2` / margin-left `4dp`（`:1630, 1705`）；marker 胶囊 `11f` + `t.surfaceAlt` + padding `(10,5,12,5)`（`:1689-1696`，静态）。[P] |
| **参考目标** | `MOTION-SPEC §8.2`（思考折叠，含 auto-fold 开关 key `kv_settings_thinking_auto_fold_enabled`）、`§8.3`（工具卡展开/收起）、`§7.4`（扩展/折叠）= **全部 [待实测]**；同 App 最近可用令牌 = §6.3 `c44.a` **120ms FOSI** / `c44.b` **150ms**（`c44.java:14-15`）[S]。 |
| **差距** | ① **官方侧折叠动效数值无取证**（三种折叠都标待实测）→ 不能声称「官方是 X ms」；② 本项目侧可独立判定（不依赖 SPEC）：会话内**最高频**的交互是「跳」的 —— 违反 skill `AUDIT.md §4`（可快速反转的交互必须**可打断**、时长 ≤ 300ms）；③ 无高度过渡（`VISIBLE/GONE`）在快速连点时会产生「内容瞬现 + 布局猛跳」。 |
| **最小改法** | chevron：`chevron.animate().rotation(open ? 90f : 0f).setDuration(150).setInterpolator(Motion.EASE_STANDARD)`（**令牌已存在** `Motion.java:165`；ViewPropertyAnimator 天然**可打断**：新动画自动覆盖旧动画）；折叠体：`alpha 0→1` + `translationY 6dp→0`，150ms + `Motion.EASE_STANDARD`，`withEndAction { setVisibility(GONE) }` 用于关闭。**明确禁止**：用 `LayoutTransition` 或 `ValueAnimator` 动高度（会 `requestLayout` 抖动，且与 `render()` 全量重建冲突）。**不改任何折叠状态判定**（`ChatActivity.java:1660-1740` 的 `willOpen` 逻辑保持原样）。 |

#### 3.6.4 Toast

| 列 | 内容 |
| --- | --- |
| **当前实现** | `ChatActivity.java:3060`、`MainActivity.java:2392`、`HostsActivity.java:760`、`Seats.java:805, 818, 1032, 1434, 1959, 1965`、`PairActivity.java:191`（后者是**硬编码中文** `连接成功`，未入 `strings.xml`）。全部走系统 `Toast`。[P] |
| **参考目标** | `MOTION-SPEC §6.6`（Toast / Snackbar）= **[待实测]**。 |
| **差距** | 无取证值 → 不对齐。**附带发现（非动效）**：`PairActivity.java:191` 的字符串未走资源。 |
| **最小改法** | **不动**（记 §四）。 |

#### 3.6.5 图片加载占位 / 空态

| 列 | 内容 |
| --- | --- |
| **当前实现** | 图片占位 `setVisibility` 硬切（`ChatActivity.java:1837-1859`）；首页空态静态上移 `box.setTranslationY(-t.dp(22))`（`MainActivity.java:374`，**静态布局值，不是动画**），空态切换硬切（`:737` 附近）。[P] |
| **参考目标** | 无直接条目；可借用 `§5.1`（600ms 扫光）与 `§6.3`（120/150ms）。 |
| **差距** | 占位出现/消失无过渡（与 3.2.5 同族缺陷）。 |
| **最小改法** | 占位淡入 200ms（§6.2 曲线）；空态出现 `alpha 0→1` 150ms（§6.3 `c44.b`）。不动 `-22dp`（是布局）。 |

---

### 3.7 页级一致性 / 主题切换 / 批量栏

| # | 交互 | 当前实现（file:line + 数值） | 参考目标（SPEC 条目） | 差距 | 最小改法（只改表现层） |
| --- | --- | --- | --- | --- | --- |
| 3.7.1 | 主题切换 | `recreate()` 整体重建 → **闪一帧**（`MainActivity` 主题路径 / `SettingsActivity.java`）[P] | 无 SPEC 条目 | 无过渡；但 `recreate()` 是 Activity 生命周期，**动它属逻辑层** | **不动**（记 §四）。若要淡入，需在 `recreate()` 后给根 View 做 `alpha 0→1 120ms` —— 这是**唯一**不碰逻辑的做法，可选 |
| 3.7.2 | 批量栏（多选）显隐 | `startBatch()` / `endBatch()`（`MainActivity.java:1547-1593`）`batchBar`（`:1038-1041`）**硬切显隐** [P] | `§6.3` `c44.a/.b`（120/150ms）[S] | `official/ALIGN.md §4` 记「多选未做」**已过期**（实际已实现），只是没有过渡 | `batchBar` 显示 `alpha 0→1` + `translationY -8dp→0` 150ms（`c44.b`）；**不动**多选状态与 `startBatch/endBatch` 的判定 |
| 3.7.3 | 搜索页进出 | 进：`setVisibility(VISIBLE)` 硬切 + `alpha 0→1 140ms` **无曲线**（`MainActivity.java:1730-1732`），键盘 `postDelayed 120ms`（`:1735-1743`）；出：`setVisibility(GONE)` **无退出动画**（`:1752`）[P] | `§3.1` enter 195+105 / `§3.2` 300ms `cubic-bezier(0.4,0,0.2,1)` [S] | 进场有 alpha 但**无曲线**；**退场是零动画**（8 处「无退场」之一，§2.5 行 63）；140ms 不在官方任何令牌里 | 进：140 → **195ms** + `PathInterpolator(0f,0f,0.2f,1f)`；出：补 `alpha 1→0` + `translationY 0→-8dp` **105ms** + `PathInterpolator(0.4f,0f,1f,1f)`，`withEndAction { GONE }`。键盘延迟 120ms **不动** |
| 3.7.4 | 列表行 / 设置行按压 | `SettingsActivity.java:395, 790, 1113`（`t.ripple(14)`）、`HostsActivity.java:353`（`t.ripple(12f)`）、`Seats.java:517`（`t.ripple(8f)`）；**禁用行 `setBackground(enabled ? t.ripple(14) : null)` → 禁用态连 ripple 都没有**（`SettingsActivity.java:1113`）[P] | `§4.1–4.3`（15/20/30/45ms 量级）[S]；`§4.5` 半径 [待实测] | 半径 4 个值（8/12/14/16）散落；禁用态**零反馈**（官方 M3 disabled 仍有状态语义，但 SPEC 无该项 → 仅记录） | 半径按 3.3.1a 内聚；禁用行的「无 ripple」为**有意**（避免诱导点击）→ **保留**，但建议同时降 alpha 走 §2.4 的 `DISABLED_ALPHA` 之一 |

---

### 3.8 本节小结：可立即执行的最小改法（按性价比排序）

| 优先级 | 改法 | 触及文件（motion-core 写域） | 参考条目 | 风险 |
| --- | --- | --- | --- | --- |
| 1 | 4 个 nav 资源改为 `105ms ease-**in** 出 → delay105 + 195ms ease-out 入`；曲线用**已存在**的 `@interpolator/ease_decelerate` / `ease_accelerate`（= `z24.b`/`z24.c`，**不需要新建文件**） | `res/anim/nav_enter|nav_push_out|nav_pop_in|nav_pop_out.xml` | `§3.1`（`mh7.java:18-21` · `bk.java:63,68,71`）[S] | 低（需逐帧验证 `startOffset` 是否被 `overrideActivityTransition` 承认） |
| 2 | 底部面板进/出补曲线 + 时长对齐（250/200）+ 位移对称化 | `Seats.java:2150-2174` | `§6.1/§6.2` [S] | 低 |
| 3 | 抽屉开/关统一曲线（面板与遮罩同源）+ 遮罩值单一来源 | `MainActivity.java:2354-2388` | `§3.1/§6.1/§6.2`（同组令牌）[S] | 低 |
| 4 | 6 处「零按压反馈」控件改 `t.rippleOn(同色, 同半径)` | `NewSessionActivity.java:155/222/327`、`PairActivity.java:86/96/130` | `§4.5` [待实测] + 项目内一致性 | 极低（只换构造函数名） |
| 5 | 思考折叠/工具卡：chevron `animate().rotation` + body alpha/位移，**不动高度** | `ChatActivity.java:1631/1666/1673/1674/1706/1728/1735/1736` | `§6.3`（最近可用）[S]；`§8.2/§8.3` [待实测] | 低（不动 `willOpen` 判定） |
| 6 | 搜索页：进场补曲线 + **补退场** | `MainActivity.java:1730-1752` | `§3.1/§3.2` [S] | 低 |
| 7 | 上传面板/附件条显隐加 120/150ms 过渡 | `ChatActivity.java:511/238/2834-2837`、`MainActivity.java:592/737` | `§6.3` [S] | 低（勿动高度） |
| 8 | 加载态加三点错峰指示（100ms 步长、alpha 1.0/0.1/0.87） | `Seats.java:683` 等文本加载点 | `§5.2`（`w2b.java:784-785`）[S] | 中（新增视觉元素，需 lead 认可「表现层增强」边界） |
| 9 | 启动页 logo 入场 195ms + ease-out | `SplashActivity.java:36-39` | `§3.1` enter 令牌 [S] | 极低（不动 620ms 与跳转） |
| 10 | ripple 半径 8 值 → 3 档（`Theme.ripple()` 内集中） | `Theme.java:166-181` + 41 处调用 | 项目内一致性（`setRadius` 公开，§3.0.1） | 低（纯视觉） |

> **不可执行项**（本轮明确排除，理由见 §四）：水波纹时长（无公开 API）、按压缩放（与 `Root` 手势边缘区冲突）、抽屉速度项（改手势判定 = 交互层）、overscroll / Switch / Toast / 主题切换（官方侧无证据或有代价）。


---

### 3.9 与 motion-core 已落地产物的对账（**执行者必读，先看这节**）

本轮审计进行中，**motion-core（task-4）已开始落地**。为避免重复造已有产物，下面是「已存在 / 待补 / 待改值 / 待接线」四张清单，全部以文件 mtime + 逐行读出为证据。

#### 3.9.1 已存在的产物（**不要重建**）

| 产物 | 状态（mtime / 大小） | 内容（逐行核实） |
| --- | --- | --- |
| `android/src/com/lc/phoneharness/Motion.java` | **新文件**，2025-10-22 06:59，32566 B | 见 3.9.2 令牌表；另含 `SPEC_PENDING[]`（`:50`）标记未取证项 |
| `android/res/interpolator/` | **新目录**，06:59，4 文件 | `ease_standard.xml`=`pathInterpolator 0.4/0.0/0.2/1.0`（注释同时引 `official/apktool-out/res/interpolator/fast_out_slow_in.xml:2` 与 `z24.java:8`）· `ease_decelerate.xml`=`0.0/0.0/0.2/1.0`（引 `z24.java:9`）· `ease_accelerate.xml`=`0.4/0.0/1.0/1.0`（引 `z24.java:10`）· `ease_linear.xml`=`linearInterpolator`（引 `z24.java:11`） |
| `android/src/com/lc/phoneharness/Theme.java` | 已改，06:56，16703 B | 仅两处**注释**新增：`:33` 指向 `Motion.java` / `docs/motion-tokens.md`；`:164` 记录遮罩底 `0x99`=60% 黑 ↔ `Motion.SCRIM_ALPHA = 0.60f`。**行为未变**（`ripple()` 半径仍由调用方传 8 个值） |
| `docs/motion-tokens.md` | 新文件，07:01，14697 B | motion-core 自己的令牌文档（与本节互为交叉引用） |
| `android/res/anim/` 6 个 XML | mtime 06:32 但**内容逐字未变** | `nav_enter.xml` 仍 `alpha 0.86` + `translateX 9%p` + `duration 200` + `@android:interpolator/decelerate_cubic`；`nav_pop_out.xml` 同形（220ms）；`nav_exit.xml` / `nav_hold.xml` **仍在**（零引用死文件） |

#### 3.9.2 `Motion.java` 现有令牌（**取值 = 旧字面量，不是 SPEC 目标值**）

| 组 | 令牌与现值 |
| --- | --- |
| 语义时长 | `DUR_NAV_ENTER=200`（`:67`）· `DUR_NAV_EXIT=170`（`:69`）· `DUR_NAV_POP_IN=220`（`:71`）· `DUR_NAV_POP_OUT=220`（`:73`）· `DUR_DRAWER_IN=220`（`:75`）· `DUR_DRAWER_OUT=190`（`:77`）· `DUR_SHEET_IN=200`（`:79`）· `DUR_SHEET_OUT=150`（`:81`）· `DUR_OVERLAY_IN=140`（`:83`）· `DUR_SCRIM_IN=220`（`:85`）· `DUR_SCRIM_OUT=190`（`:87`） |
| 间距刻度 | `DUR_SHORT1..4 = 50/100/150/200`（`:92-98`）· `DUR_MEDIUM1..4 = 250/300/350/400`（`:100-106`）· `DUR_LONG1..4 = 450/500/550/600`（`:108-114`）· `DUR_EXTRALONG1..4 = 700/800/900/1000`（`:116-122`） |
| 语义应用 | `DUR_COMPOSE_DEFAULT=300`（`:128`）· `DUR_PRESS=110`（`:133`）· `DUR_TOGGLE=150`（`:135`）· `DUR_LOADING_LOOP=900`（`:137`）· `DUR_SHIMMER=1200`（`:139`）· `DUR_LIST_ITEM_IN=DUR_SHORT4`（`:144`）· `STAGGER_STEP=40` / `STAGGER_MAX=240`（`:146,148`）· `DUR_REDUCED_MOTION=0` / `DUR_REDUCED_FADE=100`（`:151,153`） |
| 缓动（4 条，**全部对得上 SPEC**） | `EASE_STANDARD = cubicBezier(0.4,0,0.2,1)`（`:165` = `z24.a`）· `EASE_DECELERATE = cubicBezier(0,0,0.2,1)`（`:174` = `z24.b`）· `EASE_ACCELERATE = cubicBezier(0.4,0,1,1)`（`:182` = `z24.c`）· `LINEAR = new LinearInterpolator()`（`:190` = `z24.d`） |
| 弹簧 | `SPRING_MASS=1f` / `SPRING_STIFFNESS=300f` / `SPRING_DAMPING=28f` / `DUR_SPRING=500`（`:197-203`）+ `spring(m,s,d)` / `springValue(...)` / `springSettleMs(...)`（`:217,227,247`） |
| 形状/透明 | `NAV_SLIDE_IN=0.09f` / `NAV_SLIDE_BACK=0.08f`（`:260,262`）· `SHEET_OFFSET_DP=26f` / `SHEET_EXIT_OFFSET_DP=30f`（`:264,266`）· `HERO_OFFSET_DP=22f`（`:268`）· `ENTER_ALPHA=0.86f` / `ENTER_ALPHA_SOFT=0.90f`（`:270,272`）· `SCRIM_ALPHA=0.60f`（`:274`）· `DISABLED_ALPHA=0.45f` / `DIM_ALPHA=0.55f`（`:276,278`）· `PRESS_SCALE=0.97f`（`:280`）· `SHIMMER_MIN_ALPHA=0.55f` / `SHIMMER_MAX_ALPHA=1.00f`（`:282,284`） |
| 辅助 | `cubicBezier(x1,y1,x2,y2)`（`:295`）· `pathBezier(...)`（`:305`，已核实可用 4 参 `PathInterpolator`）· `reducedMotion(Context)`（`:344`）· `durMotion(Context,int)` / `durFade(Context,int)`（`:355,360`）· `enter/exit/fadeIn/fadeOut/slideX`（`:373,387,400,405,412`）· `pageShift/pageEnter/pageExit/pageReveal`（`:419,426,431,436`）· `sheetIn(card,scrim,theme)`（`:449`） |

#### 3.9.3 待补令牌（SPEC 有字面量、`Motion.java` 里没有）

| 缺口 | 目标值（SPEC 来源） | 落地动作 |
| --- | --- | --- |
| 「强调」曲线（**属面板/抽屉，不属转场**，消费点 `cv.java:34/37` · `q3.java:92/96`） | `cubic-bezier(0,0,0,1)`（`mh7.a`，`mh7.java:16`）· `cubic-bezier(0.3,0,1,1)`（`mh7.b`，`mh7.java:15,17`） | 新增 `Motion.EASE_EMPH_DECEL` / `Motion.EASE_EMPH_ACCEL`（`cubicBezier(0f,0f,0f,1f)` / `(0.3f,0f,1f,1f)`）+ `res/interpolator/ease_emph_decel.xml` / `ease_emph_accel.xml`。**转场不需要它们**：`§3.1` 用 `z24.b`/`z24.c` = 标准 `EASE_DECELERATE`/`EASE_ACCELERATE`（资源已存在） |
| 延迟令牌 | `200ms`（`mh7.a` delay）· `105ms`（`mh7.c` delay） | 新增 `DUR_DELAY_ENTER=200` / `DUR_DELAY_NAV=105` |
| 进出成对令牌 | `fadeIn 195ms(delay 105) + fadeOut 105ms`（`mh7.java:18-23`）· `250/200`（`mh7.java:16-17`） | 新增 `DUR_PAGE_IN=195` / `DUR_PAGE_OUT=105` / `DUR_PANEL_IN=250` / `DUR_PANEL_OUT=200`，或直接改写现有 4 个语义令牌的值 |

#### 3.9.4 待改值（**已有令牌，值要换成 SPEC**）

| 令牌 | 现值 | 应改为 | SPEC 来源 |
| --- | --- | --- | --- |
| `DUR_NAV_ENTER` | 200 | **195**（+ delay 105） | `§3.1` / `mh7.java:18-20` |
| `DUR_NAV_EXIT` | 170 | **105** | `§3.1` / `mh7.java:21` |
| `DUR_NAV_POP_IN` / `DUR_NAV_POP_OUT` | 220 / 220 | **195 / 105**（与 push 同族） | `§3.1/§3.6` |
| `DUR_DRAWER_IN` / `DUR_DRAWER_OUT` | 220 / 190 | **250 / 200** | `§6.1/§6.2` / `mh7.java:16-17` |
| `DUR_SHEET_IN` / `DUR_SHEET_OUT` | 200 / 150 | **250 / 200** | `§6.1/§6.2` |
| `DUR_OVERLAY_IN` | 140 | **195**（(`mh7.c` 的 fadeIn 时长） | `§3.1` |
| `EASE_*` 用法 | 6 处动画**根本没设**插值器 | 全部补 `setInterpolator` | `§2.2` + 各节 |

#### 3.9.5 待接线（**改动量最大的一项**）

**现状：`Motion.*` 全项目零调用点**（`grep -rn 'Motion\.' --include=*.java` 只命中 `Theme.java:33` 与 `Theme.java:164` 两条注释）。
唯一残留的原生调用：`MainActivity.java:2355` `.setInterpolator(new DecelerateInterpolator()).start();`（抽屉打开，import 在 `:29`）。

待接线的 12 个动效位点（对应 §三 的 10 行改法）：

| 位点 | 文件:行 | 目标令牌 |
| --- | --- | --- |
| 抽屉开（面板位移 + 曲线） | `MainActivity.java:2354-2355` | 250ms + `EASE_EMPH_DECEL` + `setStartDelay(200)` |
| 抽屉开（遮罩 alpha） | `MainActivity.java:2356` | 同曲线（**现无曲线**），值 `SCRIM_ALPHA` |
| 抽屉关（位移） | `MainActivity.java:2379` | 200ms + `EASE_EMPH_ACCEL`（**现无曲线**） |
| 抽屉关（遮罩 + `withEndAction{hide}`） | `MainActivity.java:2380-2388` | 同曲线，`withEndAction` 保留 |
| 搜索页进场 | `MainActivity.java:1730-1732` | 195ms + `EASE_DECELERATE`（**现无曲线**，140ms） |
| 搜索页退场 | `MainActivity.java:1752` | **新增**：105ms `EASE_ACCELERATE` + `withEndAction{GONE}` |
| 底部面板进 | `Seats.java:2157-2158` | 250ms + delay200 + `EASE_EMPH_DECEL`（**两个动画都无曲线**） |
| 底部面板出 | `Seats.java:2167-2174` | 200ms + `EASE_EMPH_ACCEL`；位移 30dp→26dp |
| 思考/工具折叠 chevron | `ChatActivity.java:1631,1674,1706,1736` | `animate().rotation(...)` 150ms + `EASE_STANDARD` |
| 思考/工具折叠体 | `ChatActivity.java:1666,1673,1728,1735` | alpha + translationY 150ms（**不动高度**） |
| 启动页 logo | `SplashActivity.java:36-39` | 195ms + `EASE_DECELERATE`（**现零动画**） |
| 6 处零反馈控件 | `NewSessionActivity.java:155/222/327`(实为 `322-330`)、`PairActivity.java:86/96/130` | `t.rippleOn(同色, 同半径)` |

**上一轮已复核仍未修**：`NewSessionActivity.java` 全文件 `ripple` 命中数 = **0**（`grep -c ripple` → 0）；`PairActivity.java` 仅 1 处（`:227` 返回条）→ §3.8 第 4 行**依然成立、未被执行**。`Seats.java` 仍为 06:59 前状态（`Seats.java:2153-2158` / `:2167-2174` 逐行读出与基线一致）；`Root.java`（Oct 21）未被触碰。

#### 3.9.6 结论

§三 的 10 行改法**全部仍然有效**——它们描述的是「值 + 接线」的增量，而 `Motion.java` 目前只完成了**「收编成常量」**这一步（值仍是旧的，且无人调用）。执行者按 §3.8 的优先级做，**不要重建 `Motion.java` / `res/interpolator/` 的 4 个已有文件**，只补 2 条 `emph` 曲线 + 改 6 个时长值 + 接 12 个位点。

#### 3.10 `Seats.java` 显隐硬切扫描（本轮新增，39 行面板）

扫描口径：`grep -n 'setVisibility(View.VISIBLE\|setVisibility(View.GONE)' Seats.java` → 共 **5 处**（`:860` `:906` `:928` `:957` `:966`），按三摞归类：

| 摞 | 位点（改后行号） | 判定 |
| --- | --- | --- |
| 已接线（本轮未动） | 底部面板进出场 `Seats.java:2181-2202`（`Motion.sheetIn` / `sheetOutSymmetric` / `fadeIn` / `fadeOut`） | 第一轮已接好，**不要重复改** |
| **该补曲线（本轮已补）** | 保存按钮禁用/恢复：`Seats.java:1069-1075`（`setAlpha(1f)` → `animate().alpha(1f)`）与 `:1097-1105`（`0.5f`） | `.setDuration(Motion.durMotion(host, Motion.DUR_TOGGLE)).setInterpolator(Motion.EASE_STANDARD)`；纯 alpha，无布局参与 |
| **该补曲线（本轮已补，只做出现侧）** | 内联校验文案：`fieldError()` `:919-936`、`clearErrors()` `:951-959`、`showFormError()` `:961-973`，创建期两处 `:859-862` / `:903-906` 加 `setAlpha(0f)` | 出现侧 `Motion.cancel + Motion.fadeIn(v, Motion.durFade(host, Motion.DUR_TOGGLE))`；**收起侧保持硬切**（理由见下） |
| 刻意保留 | 创建期 `setVisibility(GONE)`（`:860` `:906`）；列表 cell 禁用态静态 alpha `:1837` `0.72f` / `:2327` `0.55f`；4 处 Dialog 的 `show()/dismiss()`（`:794` `:1454` `:1920` + `:1161` `:1179` `:1231` `:1421` `:1435` `:1438` `:1890` `:1904`） | 见下三条 |

刻意保留的理由（逐条给证据）：

1. **内联校验文案的收起侧**：这一行的可见性**参与面板高度丈量** —— `submit()` 在设完 `fieldError` 后紧接着就 `resize()`（`Seats.java:1024`），`resize()` 走 `measureCardHeight()`（`Seats.java:2228`）。若把 `GONE` 延后 150ms 做淡出，面板会为这行多留一段空白，直到下一次 `resize()` 才补回来 —— 可见回归；要修就得在动画回调里调 `resize()`，那是改布局流程。按 Lead m00416「硬切处于业务流程中间则保持判定不变」的口径，**收起侧不动**。出现侧保留动效是因为**可见性仍同步置位**，`resize()` 的丈量结果一字不变。
2. **cell 禁用态静态 alpha（`0.72f` / `0.55f`）**：两处都是**构建期**赋值（cell 每次 render 重建），不是状态切换动画；要做成动画就得「先建后淡入」，等于给列表加一套入场编排 —— 属新设计而非补动效，且参考侧 Compose 重组不为此产生动画 → **非差距**。
3. **Dialog 的 `show()/dismiss()`**：载体不同 —— Dialog 是独立窗口，进出场走**平台窗口动画**，自定义需要 `window.setWindowAnimations(R.style.X)` + 新增 `res/values` 样式；`res/values` 不属本审计与 task-5 写域（属 motion-core 的 task-4 范围）→ **记账、未执行**。

本轮实际改动：`Seats.java` 7 处编辑，全在表现层，**判定条件一字未动**（`message.length() == 0` 仍是唯一分支条件，`submitting` / `firstError` / `errors` 未改）。构建：`cd android && bash build.sh` → `EXIT=0`，versionName 0.6.13 (code 29)，629198 bytes，md5 `ad6db01b9145cd72c05b711565135e08`。**未触碰 `Seats.java:2181-2202`**（面板进出场）。

---

## 四、无法对齐 / 有代价（只还原表现层，不新增功能）

**原则**：官方有而本项目没有的**功能**，按任务要求**只还原其表现层风格，不新增功能入口**。

**统一原则（Lead 裁定 m00500，适用于所有「硬切要不要补动效」的判定）**：

> 凡「同一容器**在不同业务对象之间复用**、且**没有标识当前对象的状态字段**」的显隐，**一律保持硬切**。理由：做对称淡出必须在 `endAction` 里判断「这次收尾是否仍属于当前对象」，而那个判断所需的标识**只能新增状态**；任务红线是状态管理不得改动，因此宁可放弃这一点动效，也不引入新状态。

已按此裁定的四处：① 抽屉账号栏「头像 ↔ 首字母」（`MainActivity.java` `applyUser()`）；② `renderPresetTag()` 只读标签（`ChatActivity.java:345` / `:349`）；③ 图片内容到达型替换（`ChatActivity.java:1934` / `:1945-1946` / `:1955-1956`）；④ 审批条 `noticeRow` 三处隐藏（`ChatActivity.java:1021` / `:2567` / `:2612`）。

**内联校验文案（`Seats.java` 表单错误行）不在上述四处之内**：它的「当前对象」可由**行自身的文案**判定，无需新增字段，因此出现侧补了淡入；但收起侧因高度丈量耦合仍是硬切（见 §3.10 第 1 条）。
| # | 官方能力 | 本项目 | 处置（表现层） |
| --- | --- | --- | --- |
| 1 | 多选批量（`session_batch_entry_button`） | **已实现**（`MainActivity.java:1547-1593`，含 `batchBar`）—— `ALIGN.md §4` 记「未做」**已过期** | 无需新增；只需给 `startBatch/endBatch` 的显隐加过渡（当前硬切） |
| 2 | 会话内搜索 | 已实现**本地过滤**（`MainActivity.java:1756+`）；官方是服务端全文检索 | 仅对齐搜索页进出场动效，**不新建检索能力** |
| 3 | 语言 61 种 / 字节 APM / 云同步 / 扫码继续聊 / TTS+ASR / 实时语音通话 / PoW 签名 | 无（`ALIGN.md §5` 已记「有意不对齐」并给出理由） | **不动**（硬约束：不新增功能） |
| 4 | 字体大小设置 | **已实现**（`Theme.java:60,65,197` + `Prefs.fontScale`） | 仅需给切换加过渡（`recreate()` 无交叉淡入） |
| 5 | 思考折叠 + 用时 | 已实现（`ChatActivity.java:1700-1741`，`message_think_duration`） | 仅需给折叠加动效（见 §三 A4） |
| 6 | 识图模式（vision 档） | 无独立档位 | **不新增档位** |
| 7 | 批量置顶/删除/归档 | 已实现 | 无需新增 |
| 8 | 分支（edit-to-branch / regenerate 建兄弟分支） | 无（宿主无分支语义） | **不做** |
| 9 | 抽屉账号栏「头像 ↔ 首字母」互换（`MainActivity.java` `applyUser()`，现为 :1138-1157） | 已实现（`userPhoto` / `userLetter` 互斥 `setVisibility`，硬切） | **保持硬切，判定为非差距**（Lead 裁定 m00471）：① `applyUser()` 每次抽屉刷新都会被调用，**无条件加动画 = 头像没变也闪一下**，属新增可见副作用；② 要避免闪就必须新增「当前 VISIBLE 的是哪一个」的判定 = 引入新状态 → 触碰「状态管理不得改动」红线；③ **参考侧是 Compose 重组，同一 composable 仅换内容默认不产生动画**，故硬切本身不构成与参考的差距。→ **本项不改**，不再列入待接线清单（§3.9.5 与 §3.8 均已剔除该项语境）。 |

---

## 五、证据文件（`shots/audit/**`）

| 文件 | 用途 |
| --- | --- |
| `shots/audit/00-static-sweep.txt` | 动效触点全量扫描原始输出（grep 结果，含行号） |
| `shots/audit/01-hardcoded-values.txt` | 硬编码值提取原始输出 |
| `shots/audit/02-ripple-radius-distribution.txt` | ripple 半径分布直方图 |
| `shots/audit/03-dead-anim-resources.txt` | 死动画资源确认（`nav_exit` / `nav_hold` 零引用证明 + `res/anim` / `res/interpolator` 全量 listings） |
| `shots/audit/04-motion-core-state.txt` | **motion-core 落地产物与接线状态取证**（293 行，2026-10-22T07:05:55 采集）：① 产物 mtime/大小（`Motion.java` 32566 B 06:59 · `Theme.java` 16703 B 06:56 · `res/interpolator/` 4 文件 06:59 · 7 Activity 06:30 · `Seats.java` 05:16 · `Root.java` Oct 21）；② `Motion.java` 公开令牌全量（`:50`–`:284`）；③ `Motion.*` 调用点复核（**除 `Theme.java:33,164` 两条注释外零命中**）+ `setInterpolator` 残留（仅 `MainActivity.java:2355`）+ `DecelerateInterpolator` import（`:29`）；④ 六处零反馈控件复核（`NewSessionActivity` ripple 计数 = **0**）；⑤ `Seats.java:2150-2176` 原样；⑥ `res/anim` 6 文件全文（未改）；⑦ 死文件零引用 |
| `shots/audit/A1.mp4`（3.03s / 108 帧） · `A1b.mp4`（96 帧） · `A1c.mp4`（8.03s / 176 帧） | 冷启动 + splash→Main 硬切核验（三次独立录制，结论一致；`A1c` 最完整）；配套 `A1-frames.txt` / `A1c-frames.txt` / `A1c-times.txt` / `A1c-yavg.txt` / `A1c-meta.txt` |
| `shots/audit/A7.mp4`（2.0s / 42 帧） | 主页 ＋ 按钮原位长按 → **只有 ripple**（峰值差值 1.25，而真实窗口切换为 8–9）→ 按压缩放运行时亦不存在；配套 `A7-frames.txt` |
| `shots/audit/A1-frames/` · `A7-frames/` · `A1c-sheet-s*.png` | 关键帧抽帧（t=0.60/0.75/0.90/1.20/1.80s；按压 0.90/1.10s；启动页 3.0/3.6/4.3/5.0/5.9/6.3/7.0/7.9s） |
| `shots/audit/analyze.sh` · `shots/audit/capture-a1a7.sh` | 录屏 + 逐帧差分流水线（**A2/A3/A4/A5/A6/A8–A12 待补录**；方法见 §六.6） |

---

## 六、复现命令

~~~bash
P=<PROJECT_ROOT>
A=$P/android/src/com/lc/phoneharness

# 1) 动效触点全量扫描
cd "$A" && grep -rnE 'overridePendingTransition|overrideActivityTransition|RippleDrawable|ripple\(|ObjectAnimator|ValueAnimator|ViewPropertyAnimator|animate\(|setAlpha|setScaleX|setScaleY|setTranslation|setRotation|setPivot|postDelayed|Interpolator|TransitionManager|LayoutTransition|R\.anim|R\.interpolator|animateLayoutChanges|performHapticFeedback|Vibrator|shimmer|setDuration|smoothScroll|startAnimation|AnimationUtils|VelocityTracker|GestureDetector' --include=*.java .

# 2) ripple 半径分布
grep -rhoE 'ripple(On\([^,]+,\s*)?[0-9.]+f?' . | sort | uniq -c | sort -rn

# 3) 死动画资源确认
grep -rn 'nav_exit\|nav_hold' "$P/android" --include=*.java --include=*.xml

# 4) 动画资源与插值器
ls -la "$P/android/res/anim"; ls -la "$P/android/res/interpolator" 2>&1

# 5) 禁用 alpha 分布
grep -rnE 'setAlpha\(' --include=*.java .

# 6) 录屏 + 逐帧差分（本项目侧动态证据；详见 shots/audit/analyze.sh）
#    录屏必须作为 host 后台作业跑，shell & 会被截断：
#    adb shell screenrecord --time-limit 8 --bit-rate 12000000 --size 1080x1920 /sdcard/X.mp4
#    adb pull /sdcard/X.mp4 C:/Users/.../shots/audit/X.mp4
#    逐帧差分（ffmpeg 是 Windows 二进制：先 cd 进目录，:file= 用相对文件名，否则 filter 描述被盘符冒号打断）：
#    ffmpeg -i X.mp4 -vf "tblend=all_mode=difference,signalstats,metadata=mode=print:file=X-meta.txt" -f null -
#    grep -oE 'pts_time:[0-9.]+' X-meta.txt  →  grep -oE 'YAVG=[0-9.]+' X-meta.txt  →  合成 X-frames.txt
#    读法：单帧尖峰 = 硬切（无动画）；连续多帧非零 = 真动画，帧跨度即时长；
#          0.000–0.08 交替 = 编码/重复帧噪声（静止画面）；真实窗口切换的差值量级为 8–9，ripple 约 1.2。
#    注：screenrecord 在本机的有效帧率约 22–36 fps（一帧 ≈ 28–45ms），不得声称亚帧精度。

# 7) motion-core 落地产物对账（§3.9 的证据，输出见 shots/audit/04-motion-core-state.txt）
cd "$P" && {
  ls -la android/src/com/lc/phoneharness/Motion.java android/res/interpolator/ android/res/interpolator/*.xml
  grep -nE 'public static final' android/src/com/lc/phoneharness/Motion.java
  grep -rn 'Motion\.' --include=*.java android/src/ | grep -v '/Motion.java:'   # 期望：只有 Theme.java 两条注释
  grep -rn 'setInterpolator\|DecelerateInterpolator' --include=*.java android/src/  # 期望：只剩 Motion.java 内部与各页 Motion 常量用法（DecelerateInterpolator 已全清）
  grep -rn 'Motion\.' --include=*.java android/src/ | grep -v '/Motion.java:'      # 期望：MainActivity / ChatActivity / Seats 大量命中；Settings/Hosts/NewSession/Pair 仍为 0
  grep -c 'ripple' android/src/com/lc/phoneharness/NewSessionActivity.java          # 期望：0（仍待执行）
  sed -n '2181,2202p' android/src/com/lc/phoneharness/Seats.java                    # 行号已漂：期望 sheetIn/sheetOutSymmetric/fadeIn/fadeOut
}

# 8) 构建与安装（不属本审计写域，供执行者验证用）
cd "$P/android" && bash build.sh          # → bin/dsh-phone.apk
# adb install -r bin/dsh-phone.apk        # adb = <PLATFORM_TOOLS>/adb.exe
~~~
---

## 七、A/B 证据纪律（Lead 本轮踩出来的三条，后续所有截图/录屏对比必须遵守）

1. **`tools/cap.sh shot <pkg>` 打印的包名不足以证明画面归属** —— 本机焦点匹配会串台（实测 3 次采到别的 app）。每次采集后必须**开图**（或用 md5 与另一 app 的截图区分）确认采到的就是目标页；**不得凭脚本返回值下结论**。
2. **两个 app 都不跟随系统日夜模式** —— 参考 `com.deepseek.chat` 与本项目 `com.lc.phoneharness` 各自有 app 内主题设置，`cap.sh mode light|dark` 只改**系统**设置。做 A/B 前必须把**两边都设成同一模式**（各自由 app 内设置切换），否则对比的是两种光照条件下的画面。
3. **参考首页的真实图是 `shots/lead/t-ref.png`**（md5 `9bef45a6`，深色 `#0F0F0F` 底 + 蓝鲸 `#507BF2` + 文案「欢迎回来，想从哪里开始?」）；`shots/lead/re-REAL.png`（md5 `e621c361`）是**本项目**的截图，**已作废**，不得作为参考侧证据引用。（本审计此前若引用过 `re-REAL.png` 的条目，一律按此更正。）

**纪律延伸（§六 复现命令的口径）**：数字取舍以 Lead 裁定为准；本审计文档中所有官方侧数值的证据等级标记见 §0.3 / §3.0.1 的图例，未取证的库默认值一律标 `[无法取证-已说明]`。

