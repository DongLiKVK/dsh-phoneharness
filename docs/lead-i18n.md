# 语言（中/英）与 logo 黑白化 —— 交付说明

日期：2026-10-22　执行：Lead（收口）+ i18n-chat / i18n-settings / verify-harness（并行 worker）
需求来源：用户 m00727「语言里面加上英语，logo颜色还原成黑白的」。
上位约束（m00001）：不改技术栈、不改工程结构、不加依赖；**业务逻辑 / 路由 / 数据结构 / 状态管理 / 接口调用（含请求参数与返回处理）/ 已有功能入口一律不得增删改**；参考样本里有而本项目没有的功能只还原表现层、不新增功能。

---

## 0 摘要

| 项 | 结果 |
|---|---|
| 语言设置 | 设置页「语言」行从「当前仅支持简体中文」改成真正的选择弹层：`中文（简体中文）` / `English` |
| 生效范围 | 7 个 Activity 全部跟随（首页/会话/设置/主机/新建会话/配对/启动） |
| 文案表 | 7 张 strings 表，zh 445 键 ↔ en 445 键，**missing-in-en 全为空** |
| 界面残留中文 | 只剩「服务端下发数据 / 协议固定词 / 回退串」，见 §3 |
| logo | 5 处调用点全部回到黑白线稿 PNG（撤销上一轮的 accent 着色） |
| 功能回归 | 业务 token 多重集合差异 2 条，均为**显示串**（见 §5.2）；`tools/verify-harness.mjs` **PASS=34 FAIL=0**（与改版前同） |
| 构建 | `cd android && bash ../tools/build-lock.sh ./build.sh` → EXIT 0，versionName 0.6.13 / versionCode 29 |

---

## 1 语言机制

**新增文件** `android/src/com/lc/phoneharness/Langs.java`（95 行，全部是上下文/语言工具，不含业务）：

| 成员 | 作用 |
|---|---|
| `ZH="zh"` / `EN="en"` | 语言代码 |
| `ZH_LABEL="中文（简体中文）"` / `EN_LABEL="English"` | 语言名用**自身写法**，故意不翻译（与系统语言列表一致） |
| `current(Context)` / `set(Context,String)` / `label(Context)` | 读/写/显示，prefs 键 `lang` |
| `locale(Context)` | 由 lang 得 Locale |
| `wrap(Context base)` | `createConfigurationContext` + `config.setLocale` +（API≥17）`setLayoutDirection` |
| `changed(Context,String atBuild)` | onResume 守卫用：语言与本页构建时不同 → `recreate()` |
| `str(int resId, String zhFallback, Object... args)` | 给**没有 Context 的静态工具**取文案；拿不到 Context 时返回中文原文 |

**接线方式**（与既有的主题 `darkAtBuild` 守卫完全同构，没有引入新机制）：

1. 6 个 Activity 增加 `attachBaseContext(Context base)` → `super.attachBaseContext(Langs.wrap(base))`，并记 `private String langAtBuild`。
2. 4 个原本就有 `onResume` 的 Activity（ChatActivity / HostsActivity / PairActivity / SettingsActivity）在其顶部插入 `if (Langs.changed(this, langAtBuild)) { recreate(); return; }`；NewSessionActivity 为此新增一个只做这件事的 `onResume`；SplashActivity 生命周期太短，不加。
3. MainActivity 走同样的 attach + 守卫。
4. `Prefs.java`：`FILE` 由 `private` 放开为包内可见（Langs 复用同一 prefs 文件，不另立常量）；新增 `public Context context()` 供 Api 取资源（`Api` 有 10 处 `new Api(prefs)`，**构造签名未动**）。
5. 设置页「语言」行 → `languageDialog()`：完全镜像既有 `appearanceDialog()`（圆角卡片 + `t.strong` 标题 + `radioDrawable` 单选行 + 确认 + `Motion.panelIn` + 300dp 宽 + dimAmount 0.35），确认后 `Langs.set(...)`，**只有真换了语言才 recreate()**。

设备侧验证：点语言行 → 弹层（当前语言打勾）→ 点 English → 确认 → 整页变英文，语言行右侧同步变 English。

---

## 2 文案表（zh / en 逐表对齐）

| 表 | zh | en | 缺 en 的键 |
|---|---|---|---|
| `values/strings.xml` | 234 | 234 | 无 |
| `values/strings_chat.xml` | 60 | 60 | 无 |
| `values/strings_main.xml` | 58 | 58 | 无 |
| `values/strings_settings.xml` | 28 | 28 | 无 |
| `values/strings_hosts.xml` | 34 | 34 | 无 |
| `values/strings_pair.xml` | 16 | 16 | 无 |
| `values/strings_misc.xml` | 15 | 15 | 无 |
| **合计** | **445** | **445** | — |

- 官方英文资源（参考 APK 的 `values-en`/`values-b+en`）复用 99 条，其中 92 条逐字一致，其余按本项目语义微调；核对脚本见 §8。
- 占位符（`%1$s` 等）数量与顺序两侧逐一比对，mismatch 0。
- 英文侧残留中文字符 0（专名如 "DeepSeek" 不算）。
- 上一轮唯一的界面中文提示「当前仅支持简体中文」已随语言弹层上线而删除（这是**功能增强**，非文案丢失）。

---

## 3 刻意保留的中文（全部有理由，非遗漏）

| 位置 | 内容 | 为什么不搬 |
|---|---|---|
| `ChatActivity.MARKER_THINKING = "思考"` | 服务端思考标记 | **协议固定词**：服务端下发的标题就是中文「思考」，跟随界面语言会导致英文模式下思考区退化 |
| `ChatActivity.java:896` | `"未命名会话"` | 服务端默认标题，属协议文本 |
| `Api.java` 7 条 / `Img.java` / `Item.java` | 中文**回退串** | `Langs.str(资源, "中文原文")` 的第二参数：拿不到 Context 时保证中文模式输出逐字不变 |
| `Langs.ZH_LABEL` | 中文（简体中文） | 语言名自身写法 |
| `Prefs.LEGACY_FOLLOW = "跟随电脑端"` | 旧 prefs 历史值 | 迁移用：老的「跟随电脑端」标签读成空串，界面自己出本地化标签 |
| `App.SLOGAN` | 深水里，聊点真的 | 无 Context 老调用点的兜底；有 Context 处已改 `App.slogan(this)` |

---

## 4 logo 黑白化

- `Theme.java` 删除上一轮新增的 `brandLogoInto(ImageView)` / `splashLogoInto(ImageView)`（内部是 `setColorFilter(accent, SRC_IN)` 上色），全仓 grep 归零。
- 5 处调用点回到 `setImageResource(...)`：`ChatActivity.java`、`MainActivity.java:363`、`PairActivity.java:53`、`SettingsActivity.java:223`、`SplashActivity.java:37`。
- 验证：`shots/lead/lang-row.png` / `shots/lead/v2/zh-home.png` 中鲸鱼为黑色线稿（与桌面图标参照图一致）。

---

## 5 功能零变更证据

### 5.1 逐文件 diff（相对基线 `_baseline-phone-harness-20261022-065400`）

```
Api.java                 +7     -7      now 325 lines
App.java                 +8     -0      now 40 lines
ChatActivity.java        +254   -90     now 3231 lines
HostsActivity.java       +64    -42     now 784 lines
Img.java                 +15    -3      now 138 lines
Item.java                +27    -5      now 172 lines
MainActivity.java        +170   -81     now 2505 lines
NewSessionActivity.java  +23    -3      now 445 lines
PairActivity.java        +34    -18     now 322 lines
Pick.java                +5     -5      now 243 lines
Prefs.java               +18    -1      now 326 lines
Seats.java               +42    -16     now 2435 lines
SettingsActivity.java    +164   -48     now 1540 lines
SplashActivity.java      +19    -0      now 107 lines
Theme.java               +121   -0      now 416 lines
unchanged: 10 of 25
NEW: Langs.java(95) / Motion.java(831)
```

（此表含上一轮动效改版，本轮新增的是文案外提与语言机制。）

### 5.2 业务 token 多重集合比对（`tools/tmp-audit.py` → `shots/lead/diff-audit.txt`）

比对 token：`Nav.` `Api.` `Prefs.` `Thread` `HttpURLConnection` `JSONObject` `JSONArray` `putExtra` `getIntExtra` `getStringExtra` `SharedPreferences` `onActivityResult` `startActivity`。
**差异 2 条（共 4 行增删），逐条判定如下，均不改变行为：**

| 位点 | 改动 | 判定 |
|---|---|---|
| `MainActivity.java:2057` | `intent.putExtra("title", row.optString("title", "对话"))` → 回退值改 `getString(R.string.mn_untitled_session)` | **extra 键名不变**；`mn_untitled_session` 的中文值就是 `对话`（`values/strings_main.xml:63`）→ **中文模式字节级等价**；英文模式回退值变 "Chat"。该值只用于 `ChatActivity` 标题栏（`ChatActivity.java:166/278`），服务端给了标题时完全不受影响 |
| `PairActivity.java` | `say("配对失败：" + Api.message(error), t.bad)` → `say(getString(R.string.pr_status_pair_fail, Api.message(error)), t.bad)` | 状态提示文案；`Api.message(error)` 的参数位置与内容不变 |

**其余 token 多重集合逐条相同**：0 处路由变化、0 处请求参数变化、0 处返回处理变化、0 处状态判定变化。

### 5.3 回归脚本

`node tools/verify-harness.mjs --out shots/harness/verify-report-i18n.json` → **PASS=34 FAIL=0 NOT-READY=0 SKIP=0 未验证=6**，与改版前完全一致（6 条是脚本固有的真机截图项 G1–G5、C10）。

### 5.4 两处“为了不回归”的主动设计

1. **思考标记双认**：`isThinkingMarker(title)` = `title.contains("思考")` **或** `title.contains(getString(R.string.message_reasoning_marker))`。若只比资源，英文模式下服务端下发的「思考」匹配不上，思考区会退化成小胶囊 —— 这是自查发现的回归，已修。
2. **会话菜单改下标分派**：原实现把显示串当分派键（`pick.equals("置顶")`），译文一变分派就全错。改成 `which==0..3`，与原来分支逐条等价；分组标签「置顶」与多选按钮判定改用同一份 `getString(R.string.mn_group_pinned)`，两侧同源。

---

## 6 设备验证（<DEVICE> / Android 15 / 1080x1920）

| 场景 | 证据 | 结果 |
|---|---|---|
| 中文首页 vs 改版前基线 | `shots/lead/v2/zh-home.xml` ↔ `shots/audit/ui-home.xml` | **逐字相同** |
| 中文设置页 vs 基线 | `shots/lead/v2/zh-settings3.xml` ↔ `shots/audit/ui-settings.xml` | **逐字相同**（19/19 行） |
| 中文会话菜单 | `取消置顶 / 重命名 / 归档 / 复制对话 ID / 取消`；分组头「置顶」 | ✓ |
| 英文首页 | `Hi! What would you like to chat about? / Type a message or hold to speak / Full access` | ✓ |
| 英文设置页 | `Settings / Profile / Account settings / Online hosts / Content / Workspace / Follow desktop / Archive / App / Model / Select a model / Language / English / Appearance / Light` | ✓ 唯一中文是账户名「<账号名>」（数据） |
| 英文会话菜单 | `Unpin / Rename / Archive / Copy chat ID / CANCEL` | ✓ |
| 英文抽屉 | `Search chat content… / All / Pinned`；会话标题仍中文 = 服务端数据 | ✓ |

截图：`shots/lead/v2/zh-home.png`、`zh-drawer.png`、`zh-settings.png`、`en-home.png`、`en-settings.png`、`lang-row.png`。

**采集注意（设备机制，非本项目问题）**：每次 app 启动都会新建虚拟屏，`input -d <displayId>` 必须取当次 id（`bash tools/cap.sh disp com.lc.phoneharness`）；切换语言需改 prefs 的 `lang` 后 `am force-stop` + `am start`（设备已 root，脚本 `/data/local/tmp/setlang.sh`）。

**一个已排除的假警报**：冷启动直接 `am start -n .../.SettingsActivity` 时「模型」行显示「请选择模型」，而基线是「DeepSeek V4.1 Flash」。原因：模型目录由 `Seats` 的静态快照提供，直接起设置页时快照为空；先起首页再进设置即与基线逐字相同（已实测 SAME: True）。与 i18n 无关。

---

## 7 已知边界

1. **服务端下发的数据保持原文**（会话标题、预设名「PTC 模式」、账户名、主机名），界面语言只影响本地文案 —— 这是正确行为，不是遗漏。
2. 英文文案长度普遍比中文长，chip 与列表行已按 `Theme` 省略号策略显示；超长英文在窄屏仍会被截断为「…」。
3. 语言切换即时生效依赖 `recreate()`，会重建当前页（与切主题同样的代价）；会话页正在流式输出时切语言会中断当次刷新（与切主题同）。

---

## 8 复现命令

```bash
cd <PROJECT_ROOT>

# 构建（多人共用 android/ 必须走 build-lock）
cd android && bash ../tools/build-lock.sh ./build.sh && cd ..

# 装到模拟器
export PATH="<HOME>/Downloads/android-tools/platform-tools:$PATH"
adb install -r -t android/bin/dsh-phone.apk

# 切语言（root 直改 prefs）
adb push tools/tmp-setlang.sh /data/local/tmp/setlang.sh
bash tools/device-lock.sh run lead -- bash -c 'adb shell "sh /data/local/tmp/setlang.sh en"; adb shell am force-stop com.lc.phoneharness; adb shell am start -n com.lc.phoneharness/.MainActivity'

# 截图（自动选当前虚拟屏）
bash tools/cap.sh shot com.lc.phoneharness shots/lead/v2/en-home.png

# 回归
node tools/verify-harness.mjs --out shots/harness/verify-report-i18n.json
python tools/tmp-audit.py   # 业务 token 差异
```

---

## 9 回滚

```bash
BASE=<HOME>/Documents/task/_baseline-phone-harness-20261022-065400
cp -r "$BASE"/src/. android/src/            # 源码回到基线（同时撤销动效改版）
cp -r "$BASE"/res/. android/res/            # 资源回到基线
rm -f android/src/com/lc/phoneharness/Langs.java android/src/com/lc/phoneharness/Motion.java
cd android && bash ../tools/build-lock.sh ./build.sh
```

功能回归基线 APK：versionName 0.6.13 / versionCode 29 / 616266 B / md5 `041ac4ca597e73c199315922027e92d7`。

## 附：英文问候语按用户要求改写（m01241）

- values-en/strings.xml:132 home_greeting：Hi! What would you like to chat about? → **Hi. What can I do for you?**（中文 values/strings.xml:128「嗨！今天想聊些什么？」未动）。
- 实测（shots/lead/v5/en-home.png，英文模式 1080x1920）：墨迹宽 721px，左右留白 180 / 179px（各 60dp），不再贴边；间隙中心 964.5（与改前一致，字面 metrics 而非文案长度决定）。
- 中文回归：shots/lead/v5/zh-home.xml 首页问候语仍为「嗨！今天想聊些什么？」。
- 键总数不变（445 ↔ 445），values-en 与 values 仍一一对应。
