# 对话页 ≡ 改为历史抽屉（对齐官方 2.6.1）

状态：已实现并在模拟器实测。APK **0.6.16**（versionCode 32）。
关联需求：用户报告「在任意对话中，点左上角切换对话时，当前对话不返回到新对话」（m01423）。

## 0. 问题与判读

原实现里 `ChatActivity` 顶栏的 ≡ 只有一种行为：`closeWithPop()` → `Nav.close(this)` → `finish()`。
于是「想换个对话」的代价是**退出到首页的新对话页**（hero + 空输入框），当前对话被丢掉。

参考 APK（com.deepseek.chat 2.6.1）的同一个 ≡ 是**打开历史抽屉**：抽屉从左滑出盖住当前对话，当前会话在列表里高亮，点另一条就在原地换会话，页面不退出。

- 参考证据：`shots/lead/v7/r3-ref-chat.png`（对话页顶栏：≡ + 会话标题 + 朗读/⊕）、`shots/lead/v7/r4-ref-chat-menu.png`（≡ 之后：抽屉滑出、当前会话行蓝字 + accentSoft 圆角底 + ⋯、背景对话仍可见）。
- 本项目改前证据：`shots/lead/v7/05-after-menu.png`（≡ 之后回到首页 hero）。

## 1. 改了什么（全部在 `android/src/com/lc/phoneharness/ChatActivity.java`）

新增（纯增，不触任何既有分支）：

| 位置 | 内容 |
|---|---|
| 字段区（`attachStrip` 之后） | `Root shell` / `View drawerMask` / `LinearLayout drawerPanel, drawerList` / `boolean drawerOpen` / `int drawerWidth` / `List<JSONObject> drawerSessions` / `boolean drawerLoading` / `String drawerError` |
| `drawerBody()` | 抽屉面板：标题行（`ch_drawer_title` + ⊕ 新对话）→ `ScrollView` 里的分组会话列表 |
| `openDrawer()` / `closeDrawer()` / `closeDrawerNow()` | 与首页同一套：`Motion.drawerIn` / `Motion.drawerOut`；`closeDrawerNow()` 是跳转前瞬时落位 |
| `loadDrawerSessions()` | `api.get("/v1/sessions", …)` —— **与首页抽屉同一个接口、同样不带参数**，只读展示 |
| `renderDrawer()` / `drawerGroupOf()` / `drawerRow()` | 分组头（置顶 / 今天 / 昨天 / 7 天内 / 30 天内 / 更早，全部走既有 `R.string.session_history_timeline_label_*` 与 `mn_group_pinned`）+ 会话行；当前会话用 `t.accent` 文字 + `t.accentSoft` 圆角底 |
| `switchTo(JSONObject)` / `switchAnimNone()` | 点另一条会话：收起抽屉 → `startActivity(ChatActivity + sessionId/title)` + `finish()`，并把 OPEN/CLOSE 转场都置 0（官方也是就地换内容，不滑页） |

改了 3 处既有代码（都是「接线」，不含业务判定）：

1. `build()` 结尾：`setContentView(root)` → 把原 `root` 原样塞进新建的 `Root`（`shell`）再 `setContentView(shell)`，随后挂 `drawerMask` + `drawerPanel` + `shell.setSwipe(...)`（左缘往右划开抽屉，阈值 34% 抽屉宽）。**原视图树、顺序、内边距一字未动。**
2. ≡ 的 `onClick`：`closeWithPop()` → `drawerOpen ? closeDrawer() : openDrawer()`。
3. 新增 `onBackPressed()`：抽屉开着时先收抽屉。

未改：右上 ⊕ 仍是 `closeWithPop()`（= 回首页开新对话，行为不变）；`sessionId` / `title` 两个 extra 的键名与取值来源与 `MainActivity.open()` 完全一致；SSE、消息窗口、附件、朗读、审批条、反问卡片全部未碰。

## 2. 动效与视觉（都用既有令牌，无新数值）

- 抽屉进场 `Motion.drawerIn(panel, mask, panel.getTranslationX())` → `DUR_DRAWER_IN = 220ms` + `EASE_DECELERATE`；退场 `Motion.drawerOut(panel, mask, -width, end)` → `DUR_DRAWER_OUT = 190ms` + `EASE_ACCELERATE`。
- 遮罩沿用首页：底色 `0x99000000`，目标 alpha `Motion.SCRIM_ALPHA = 0.6`。
- 抽屉宽 `0.82 × 屏宽`（与首页抽屉同值）。
- 行高 `minHeight = 44dp`、标题 16sp、行内左右 12dp、当前行圆角 14dp —— 全部复用首页 `drawerRow` 的量级。
- 分组头 13sp muted，上边距 18dp / 下 4dp（与首页一致）。

## 3. 设备实测（<DEVICE> / 23113RKC6C / Android 15 / 1080x1920）

| 证据 | 结论 |
|---|---|
| `shots/lead/v8/a-drawer.png` | 首页 ≡ 打开抽屉（回归对照，行为未变） |
| `shots/lead/v8/b-chat.png` | 从抽屉进入会话（`topResumedActivity=com.lc.phoneharness/.ChatActivity`） |
| `shots/lead/v8/c-chat-drawer.png` | **对话页 ≡ 打开抽屉**：标题「会话」+ ⊕、分组「置顶 / 今天」、当前会话「鲸域网站开发」蓝字 + accentSoft 圆角底、背景对话仍可见 |
| `shots/lead/v8/d-switched.png` | 点「问候」→ 标题变「问候」、内容换成该会话，`topResumedActivity` 仍是 `.ChatActivity`（原地切换，未退回首页） |
| `shots/lead/v8/e-drawer2.png` | 再开抽屉，高亮已跟到「问候」 |
| `shots/lead/v8/f-after-back.png` | 抽屉开着按返回键：只收抽屉，仍停在 `.ChatActivity`（与 d-switched 同一帧） |
| `shots/lead/v8/h-en-drawer.png` | 英文模式：`Chats` / `Pinned` / `Today` / `New chat`（会话标题是服务端数据，仍是中文） |
| `shots/lead/v8/j-edge-swipe.png` | 左缘往右划（`input swipe 5 900 700 900 300`）也能打开抽屉，画面与点 ≡ 完全一致（PNG 字节相同） |

界面文案新增 2 个键，zh/en 同步：`ch_drawer_title`（会话 / Chats）、`ch_drawer_new`（新对话 / New chat）。

## 4. 功能零变更核对

- `python tools/tmp-audit.py` → `shots/lead/diff-audit.txt`：业务 token 多重集合差异 **18 条，全部来自本次新增代码**（`api.get("/v1/sessions", …)`、`JSONObject/JSONArray` 解析、`putExtra("sessionId"/"title")`、`startActivity`）与早前 i18n 的 2 条显示串 —— **没有一条是删除或改写的业务判定**。
- `node tools/verify-harness.mjs --out shots/harness/verify-report-drawer.json` → **PASS=34 FAIL=0 NOT-READY=0 SKIP=0 未验证=6**（6 条是脚本固有的真机截图项 G1–G5、C10，与上一轮一致）。
- 新增的 `/v1/sessions` 调用与首页抽屉同参数：不带任何 query，只读；不写状态、不改 `sessionId`/`title` 的既有读写路径。

## 5. 构建

```bash
cd android && bash ../tools/build-lock.sh ./build.sh
```

- `android/build.sh` 默认版本提到 **0.6.16 / 32**（原 0.6.14 / 30）。
- 产物：`android/bin/dsh-phone.apk` **735697 bytes**，`aapt2 dump badging` = `versionCode='32' versionName='0.6.16'`，md5 `6fc20d585b336d5f881b53c310e56a80`，已同步 `plugin/assets/`。
- `adb install -r` Success（干净装机后重跑上面整条链路仍然通过）。

## 6. 回滚

- 源码：`android/src/com/lc/phoneharness/ChatActivity.java` 三处接线（`build()` 结尾、≡ onClick、`onBackPressed`）改回原样并删掉 7 个新方法 + 字段块即可，`strings_chat.xml` 的两个键可留着（未引用不报错）。
- 整体回滚点：`<HOME>/Documents/task/_baseline-phone-harness-20261022-065400`。
