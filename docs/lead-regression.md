# 改版验收记录（UI/交互对齐参考 APK · Lead 签署）

> 目标：把 phone-harness 的**视觉与动效**对齐参考样本 `com.deepseek.chat 2.6.1`（versionCode 279，
> md5 `0c7efce025b1400c27a8c28dae17ff44`），**功能行为零变更**。
> 参考侧技术栈：Jetpack Compose（animation 1.11.4 / material3 1.4.0 / navigation-compose 2.8.5）。
> 本项目：native Java + 手工 aapt2→javac→d8 链路（未改技术栈、未加依赖）。

## 0. 结论摘要

| 维度 | 状态 | 依据 |
|---|---|---|
| 业务逻辑 / 路由 / 数据结构 / 状态 / 接口 | **零变更** | §1.1 业务 token 多重集合差异 = **0 条**；§1.2 验收脚本 PASS=34 FAIL=0 |
| 调色板 / 主题色 | **已对齐（零改动）** | §2.1 参考进包 colors.xml 与 `Theme.java` 逐值相同 |
| 品牌 logo 取色 | **已对齐（本轮改动）** | §2.2 参考鲸鱼=主色，本项目原为黑/白 |
| 页面转场（时长/曲线/顺序/幅度） | **已对齐（本轮改动）** | §3.2 四条 anim 全量重写，数值全部来自参考字节码 |
| 按压反馈 / 列表点击 / 弹层进出 | **已对齐** | §3.3 Motion 工厂接线 73 处 |
| 骨架屏 / shimmer | **未新增** | §4 参考侧该动效未在实机出现，无证据不发明 |
| 浅色主题动效数值 | **不可取证** | §4 参考在取证条件下恒为深色 |

产物：`android/bin/dsh-phone.apk`，versionName **0.6.13** / versionCode **29** / **629201 B** /
md5 `863baba2fdd80ced14a70a112cf0a227`（基线为 `041ac4ca597e73c199315922027e92d7`）。

## 1. 功能零变更的证据

### 1.1 逐文件 diff + 业务 token 多重集合比对

判定口径（本轮全队统一）：**diff 里出现业务分支 / 路由 / 接口参数 / 状态判定 / 布局测量的改变即退回**；
允许的只有动画包裹、时长/曲线/幅度、以及被同一业务字段守卫的收尾回调。

| 文件 | hunk | 新增行 | 删除行 |
|---|---|---|---|
| ChatActivity.java | 11 | 146 | 16 |
| HostsActivity.java | 8 | 10 | 4 |
| MainActivity.java | 10 | 79 | 16 |
| Motion.java | 新增文件 | — | — |
| NewSessionActivity.java | 3 | 3 | 3 |
| PairActivity.java | 4 | 4 | 3 |
| Seats.java | 8 | 42 | 16 |
| SettingsActivity.java | 4 | 4 | 1 |
| SplashActivity.java | 2 | 10 | 1 |
| Theme.java | 6 | 139 | 0 |

**业务 token 多重集合差异：0 条。** 做法：对每个改动文件抽出命中
`Nav.` / `Api.` / `Prefs.` / `Thread` / `HttpURLConnection` / `JSONObject` / `JSONArray` /
`putExtra` / `getIntExtra` / `getStringExtra` / `SharedPreferences` / `onActivityResult` / `startActivity`
的行，按**多重集合**（含出现次数）与基线逐文件比对。
这覆盖了全部路由跳转、接口调用、请求参数拼装、prefs 读写、序列化与页面返回处理——
一条不多、一条不少，即**没有新增/删除任何一处业务调用**。

原始输出：`shots/lead/diff-audit.txt`（可复跑 `python tools/tmp-audit.py`）。

### 1.2 功能验收脚本

`node tools/verify-harness.mjs`（工程既有脚本，A 语法 / B 协议 / C 反例 / D 构建 / E 资源 / F 静态界面）：

```
PASS=34  FAIL=0  NOT-READY=0  SKIP=0  未验证=6
```

6 条「未验证」是脚本本来就标注的**真机截图项**（G1–G5 与 C10），与本次改版无关。
报告：`shots/harness/verify-report-lead.json`、`shots/harness/verify-table.md`。

## 2. 视觉对齐

### 2.1 调色板 —— 参考与项目逐值相同，本轮零改动

参考 `res/values/colors.xml` / `values-night/colors.xml` 与 `Theme.java` 的对照（抽样）：

| 令牌 | 参考（浅 / 深） | Theme.java |
|---|---|---|
| primary / accent | `#ff426efe` / `#ff507bf2` | `#426EFE` / `#507BF2` ✅ |
| 正文 ink | `#0f0f0f` / `#f8f8f8` | `#0F0F0F` / `#F8F8F8` ✅ |
| 危险色 | `#d93025` / `#f25a5a` | `#D93025` / `#F25A5A` ✅ |
| 启动背景 | `#ffffffff` / `#ff0f0f0f` | 白 / `#0F0F0F` ✅ |

### 2.2 品牌 logo：从「黑鲸/白鲸」改为**主色鲸**（本轮改动）

证据（两路互证）：
1. 参考进包资源 `res/drawable/chat_welcome_logo.xml` 单 path `fillColor="#426efe"`，且**没有 drawable-night 变体**；
2. 参考首页实测鲸鱼像素 `(80,123,242) = #507BF2`，恰等于深色 `primary`（`values-night/colors.xml`）；
   re-motion 独立复算：`col x=540` 全部 ink 像素中位 `#507bf2`。

改法：`Theme.brandLogoInto(ImageView)` / `splashLogoInto(ImageView)` = 原素材 + `setColorFilter(accent, SRC_IN)`，
5 处调用点换成这两个工厂（`ChatActivity.java:3119`、`MainActivity.java:363`、`PairActivity.java:53`、
`SettingsActivity.java:223`、`SplashActivity.java:37`），PNG 的 alpha 线稿完好、形状不变。
实测验收：本项目首页鲸鱼主色 `(66,110,254) = #426efe`（1543 px），与参考的**浅色** primary 精确一致；
深色下 `accent = #507BF2` 自动跟随，与参考深色实测同值。

## 3. 动效对齐

### 3.1 令牌层 `android/src/com/lc/phoneharness/Motion.java`（新增，650 行）

62 个常量 + 41 个工厂方法，每条带证据标注：
`[测]` 本项目实测（file:line）、`[参考]` 参考 APK 进包资源/字节码实测、`[库]` 由库版本推出但本机无法复核。
缓动只有参考真实存在的那几条，来自 `official/jadx-out/sources/defpackage/z24.java:8-11`：

| 令牌 | 曲线 | 参考字面量 |
|---|---|---|
| `EASE_STANDARD` | cubic(0.4, 0, 0.2, 1) | `a = new be3(0.4f, 0.0f, 0.2f, 1.0f)` |
| `EASE_DECELERATE` | cubic(0, 0, 0.2, 1) | `b = new be3(0.0f, 0.0f, 0.2f, 1.0f)` |
| `EASE_ACCELERATE` | cubic(0.4, 0, 1, 1) | `c = new be3(0.4f, 0.0f, 1.0f, 1.0f)` |
| `EASE_EMPH_DECEL` | cubic(0, 0, 0, 1) | `mh7.java:16` |
| `EASE_EMPH_ACCEL` | cubic(0.3, 0, 1, 1) | `mh7.java:15` |

> 说明：本会话早期 motion-core 曾引入 `(0.23,1,0.32,1)` / `(0.77,0,0.175,1)` / `(0.32,0.72,0,1)` 三条
> 第三方"最佳实践"曲线，**已删除**——参考里不存在，属于用外部经验冒充证据。

### 3.2 页面转场：四条 anim 全量重写

参考侧转场是 Compose 过渡，实现于字节码（R8 重打包后可读）：

- **位移** `bk.java:78-80`：`new e74(new fsa(null, new vv9(new ew0(uy6(27), 4), k53.Z0(300, 0, z24.a, 2)), ...))`
  → **300ms + EASE_STANDARD**，偏移由 `ew0` 提供（整宽位移）。
- **进场淡入** `mh7.java:18-21` + `bk.java:79` 的 `.a(mh7.c)`：
  `iH=195`、`i = 300 - 195 = 105`、`c = y64.d(tween(195, i, z24.b))` → **195ms + 延迟 105ms + EASE_DECELERATE**。
- **退场淡出** `mh7.java:22-23` + `bk.java:81` 的 `.a(mh7.d)`：
  `d = y64.e(k53.Z0(105, 0, z24.c, 2))` → **105ms + EASE_ACCELERATE**。
- **自洽校验**：105 = 300 − 195，进出预算合计正好 300ms；进场淡入发生在位移的**后段**（顺序也复刻了）。
- **幅度**：参考实测 `shots/re/C1-conv-open` 帧 0010→0014（5 帧 × 62.5ms）新页左缘从约 0.9 屏宽收到 0
  → 整宽位移 `100%p`，且**独立复核了 300ms 这个时长**（此前用 `bk` 静态推断）。

| 资源 | 位移 | 透明 | 说明 |
|---|---|---|---|
| `nav_enter.xml` | `100%p → 0`，300ms，EASE_STANDARD | `0 → 1`，195ms，startOffset **105**，EASE_DECELERATE | 前进：新页滑入 |
| `nav_push_out.xml` | `0 → -9%p`，300ms，EASE_STANDARD | 无 | 旧页视差后退，**保持不透明** |
| `nav_pop_in.xml` | `-9%p → 0`，300ms，EASE_STANDARD | 无 | 返回：被露出的页 |
| `nav_pop_out.xml` | `0 → 100%p`，300ms，EASE_STANDARD | `1 → 0`，105ms，EASE_ACCELERATE | 返回：退场的页 |

两处**工程判断**（写进 XML 注释，可审计）：

1. **下层页不做淡出。** 参考是 Compose 单窗口，"淡出"露出的是同一个 Activity 的背景色；
   本项目是两个 Activity 窗口，下层若淡到 0、而上层前 105ms alpha 仍为 0，左侧未遮住区域
   会露出**启动器**而不是同底色。故下层一律只位移、不淡出，淡入淡出只作用在**上层**那一页。
2. **视差幅度沿用本项目原值 9%p**，不采用 re-motion 早前报的 19%。其已裁定 `top_left 1036→867` 与容器边界
   是**同一条硬边界**（不是旧页顶栏），因此"旧页位移 169px"没有独立依据；没有证据的幅度不发明。

`Nav.java` 本身**零改动**：它早已按 `Build.VERSION.SDK_INT >= 33` 走 `overrideActivityTransition`
（`Nav.java:28-33` / `:52-57`），manifest `targetSdk=34` + 设备 API 35 → 走新接口，转场真生效。

### 3.3 各页接线（`Motion.` 引用 73 处）

| 文件 | 引用数 | 主要位点 |
|---|---|---|
| ChatActivity.java | 31 | 折叠 body/chevron、附件条、上传面板、状态条、工具卡 detail、反问面板进出 |
| MainActivity.java | 19 | 抽屉开/关、遮罩、搜索页、附件条、批量条 |
| Seats.java | 12 | 底部席位面板进/出（`sheetIn` / `sheetOutSymmetric`） |
| HostsActivity.java | 4 | CTA 按压反馈（`rippleOn`） |
| SettingsActivity.java / SplashActivity.java | 3 / 3 | 居中弹层 `panelIn`、启动页 `staggerIn` |
| Theme.java | 1 | `ripple()` 统一半径分档 |

零反馈点击 6 处全部补上涟漪（`NewSessionActivity.java:155/222/327`、`PairActivity.java:86/97/131`），
半径**沿用原字面量**不新造档位；7 个居中 Dialog 在 `dialog.show()` 后接 `panelIn`（120ms，scale 0.96→1）。

### 3.4 刻意保留硬切的地方（统一原则）

> **同一容器在不同业务对象之间复用、且没有标识当前对象的状态字段**的显隐，一律保持硬切。

理由：做对称淡出必须在 `endAction` 里判断"这次收尾是否仍属当前对象"，而该标识只能**新增状态**，
触"状态管理不得改动"红线。据此裁定并保持硬切：`applyUser()` 头像↔首字母、`renderPresetTag()` 只读标签、
图片内容到达型替换、`noticeRow` 审批条三处隐藏（`ChatActivity.java:1021/2567/2612`）。

## 4. 未对齐 / 不可取证（诚实清单）

| 项 | 状态 | 原因 |
|---|---|---|
| 骨架屏 / shimmer | 未新增 | 参考实机未出现该动效（`cb0.b`=600ms/delay200 有静态常量但无实机证据） |
| 浅色主题的动效数值 | 不可取证 | 参考在取证条件下恒为深色（`cmd uimode night no` 无效，其用 app 内自持主题） |
| 抽屉面板本身的滑动时长 | 未定 | 参考实测只拿到内容区 alpha ramp ≈100ms + FOSI，面板位移无独立证据 |
| 水波纹时长 | 不可调 | `RippleDrawable` 无 `setEnterDuration/setExitDuration` 公开 API（javap 核实） |
| 按压缩放 | 不做 | 与 `Root.java:25` 的 26dp 边缘手势冲突 |
| `Motion.panelIn` 的 0.96 缩放 | 待定 | 参考实测全程无缩放（互相关 dx=0），该值属项目自创，已标注 |
| `z24.d`（第 4 条缓动） | **[未证实]** | 是 R8 合成的 `l33` 类，非字面量 LinearEasing |

## 5. 复现命令

```bash
cd <PROJECT_ROOT>/android && ./build.sh     # 构建
cd .. && node tools/verify-harness.mjs                                            # 功能验收
python tools/tmp-audit.py                                                         # 业务 token 零差异复核
bash tools/cap.sh shot com.lc.phoneharness shots/lead/x.png                       # 截图（多屏机必须走 cap.sh）
```

## 6. 回滚点

无 git。基线快照：`<HOME>/Documents/task/_baseline-phone-harness-20261022-065400`
（`src/`、`res/`、`build.sh`、`AndroidManifest.xml`、`bin/`、`FINGERPRINT.md5` 158 项、`README-BASELINE.md`）。
逐文件回退示例：`cp "$BASE/src/com/lc/phoneharness/Nav.java" android/src/com/lc/phoneharness/`。

## 附：对话页 ≡ 的行为修正（0.6.16）

用户报告「在任意对话中，点左上角切换对话时，当前对话不返回到新对话」。原行为：`ChatActivity` 顶栏 ≡ = `closeWithPop()` → `finish()`，等于退出到首页的新对话页。参考 APK（2.6.1）的同一个 ≡ 是**打开历史抽屉**（`shots/lead/v7/r4-ref-chat-menu.png`：抽屉滑出、当前会话蓝字高亮、背景对话可见）。

已改为抽屉（细节见 `docs/lead-chat-drawer.md`）：

- 抽屉 = 标题行（`ch_drawer_title` + ⊕ 新对话）+ 分组会话列表，数据走与首页同一个 `/v1/sessions`（不带参数、只读）。
- 当前会话高亮（`t.accent` 文字 + `t.accentSoft` 圆角底）；点另一条就地起同页新 `sessionId` 并 `finish()`，OPEN/CLOSE 转场置 0，**不退回首页**。
- 动效复用既有令牌：进 220ms `EASE_DECELERATE` / 出 190ms `EASE_ACCELERATE`，遮罩 `0x99000000` × `SCRIM_ALPHA` 0.6。
- 左缘往右划同效；返回键先收抽屉；右上 ⊕ 行为不变（仍是回首页开新对话）。
- 实测：`shots/lead/v8/c-chat-drawer.png`（抽屉 + 当前会话高亮）、`d-switched.png`（点「问候」后就地切换，`topResumedActivity` 仍是 `.ChatActivity`）、`f-after-back.png`（返回键只收抽屉）、`h-en-drawer.png`（英文 `Chats/Pinned/Today`）、`j-edge-swipe.png`（边缘手势）。
- 回归：`verify-harness` **PASS=34 FAIL=0 未验证=6**；业务 token 差异 18 条全部是本次新增的 /v1/sessions 读取与 putExtra 同名参数（与 `MainActivity.open()` 完全一致），无删除/改写。

## 附：用户指定的对参考偏离（记录用）

- **首页 hero 位置**：参考（`shots/lead/t-ref.png`）是整块视觉重心偏上摆放（间隙中心 y=852.5 / 屏高 1920），本项目按用户明确指令 m01150 + m01204 改为「logo 与问候语两者间距的中心落在屏幕中线」，实测间隙中心 y=960.0（偏差 0.0px）。这是**有意偏离参考**，不是对齐缺陷。详见 `docs/lead-hero-scale.md §附`。
