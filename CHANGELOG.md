# 变更记录

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

插件与 APK 两条版本线独立编号：插件看 `plugin/package.json`，APK 看 `android/AndroidManifest.xml`（`versionName` / `versionCode`）。

## 插件 0.5.21 / APK 0.6.29 — 2026-10-24

### 新增

- **APK 内置 Tailscale 引擎（tsnet）**：APK `0.6.29`（versionCode 45，46,025,305 字节）自带 `libgojni.so`（arm64-v8a + x86_64），手机不用另装 Tailscale 就能加入 tailnet、用 `100.x` 访问电脑。Java 侧照旧用 `HttpURLConnection`，只在目标是 `100.64.0.0/10` 时挂一个本机 `127.0.0.1` 代理，由 tsnet（用户态 WireGuard + netstack）直连。设置页新增「内网互联」：登录 / 退出、两种退出口径（只退 Tailscale / 连同配对一起断开）、AuthURL 打开登录页。
- **插件运行期重绑**：`lib/server.js` 拆出 `listenOn(bind)` / `rebind(addresses)` 并维护 `bound` 集合；`index.js` 每 15 秒跑一次 `rebindTick()`，只补「期望地址里还没监听」的那几条（`0.0.0.0` 兜底不参与），补上后回写 `endpoint.json` 的 `binds` / `updatedAt`。修的是 Windows 上 tailscaled 比宿主后起、`binds` 永久少一条 `100.x`、手机登录完也连不上电脑的问题。

### 变更

- 插件 0.5.20 → **0.5.21**：重绑补丁直接叠在 0.5.20 上（`0.5.20` 的「下载 APK 带版本号」保留）。0.5.15 那次只把重绑打进工作区、没有随包发布，本版起仓库源码与 Release 里的 tgz 一致。
- 发布形态变化：产物**只挂 GitHub Release 资产**（`dsh-phone-0.6.29.apk`、`dsh-phoneharness-0.5.21.tgz`、`SHA256SUMS`）。仓库里不再提交二进制：`release/` 只留发布说明、校验和与 `.apk.json` 元数据；`plugin/assets/dsh-phone.apk` 由发版流程在 `npm pack` 前注入（见 [plugin/assets/README.md](plugin/assets/README.md)）。APK 46 MB、插件包 17 MB，进 git 会让仓库膨胀到 60 MB 以上。

### 两条版本线

APK `0.6.29` 出自「内置 Tailscale」这条开发线，界面基线是 `0.6.18`；本仓库 `android/` 源码仍是 `0.6.26` 线（聊天页操作条、抽屉检索等）。所以这个 APK **带 Tailscale、但没有 0.6.19–0.6.26 的聊天页改动**。按需二选一：

- 要手机端直接连 tailnet → 装本 Release 的 `dsh-phone-0.6.29.apk`；
- 要聊天页操作条 / 抽屉检索 → 装上个 Release `v0.5.20` 里的 `dsh-phone-0.6.26.apk`。

### 实测

- APK 0.6.29：`android/bin/dsh-phone.apk` 46,025,305 字节，md5 `4e55f8d45fae5cc7fbb8d436e8e7f2b5`，sha256 `cfb8c924…b68bd6`；versionName `0.6.29` / versionCode `45`。tsnet 真机问题（SELinux 拒绝 AF_NETLINK → Java 侧网卡快照、反射漏传参数类型）已在 `0.6.28` 修掉，`0.6.29` 修配对页任务根与返回键两次退出。
- 插件 0.5.21：`node --check` 全过、`npm run verify` 4 项全过；tgz 17,026,956 字节（内含同一份 APK，md5 一致），sha256 `6cf7f881…08fd6`。

## 插件 0.5.20 / APK 0.6.26 — 2026-10-22

### 变更

- **下载下来的 APK 带版本号**。以前无论哪个版本，浏览器存的都是 `dsh-phone.apk`，手机里下过两版就互相覆盖、分不清装的是哪一版。现在按旁车文件里的 `versionName` 命名：
  - 手机浏览器 `http://<电脑>:8737/apk` → `dsh-phone-0.6.26.apk`
  - 面板「下载 APK」→ 同上（`plugin/index.js` 的 `sendFile` 走同一个命名函数）
  - `/apk/meta` 返回的 `name` 字段也带版本，手机端「检查更新」能直接显示文件名
- 读不到 `versionName`（旁车文件缺失）时退回 `dsh-phone.apk`，不影响下载。
- Release 资产同步改名：`dsh-phone-0.6.26.apk`、`dsh-phoneharness-0.5.20.tgz`、`SHA256SUMS`（`SHA256SUMS` 里的文件名也跟着改，先 `cd` 到 `release/` 再 `sha256sum -c`）。

### 实测

- 直接调用 `PhoneServer.prototype.sendApk`（假 req / 可写流），返回 `Content-Disposition: attachment; filename="dsh-phone-0.6.26.apk"`、`Content-Length: 752401`，流出字节数与源文件一致。
- `node scripts/verify.mjs` → 4 项全过（14 文件语法 / cordis 字段 / 26 文件 694 KB / 19 条文档链接）。

## APK 0.6.26 — 2026-10-22

### 修复

用户报「这几个按钮的功能对所有会话生成的文本都要有效果」（指对话页每条助手消息底部的 复制 / 赞 / 踩 / 朗读 / 分享 / 重新生成）。实测根因不是按钮坏了，而是**操作条只挂在助手正文消息上**：本项目的 agent 型轮次里绝大部分条目是工具调用与思考标记，样本会话 `session-24c7d3a7…` 的 191 条里助手正文只有 2 条，其余轮次整轮没有正文 —— 这些轮次里操作条根本不出现，用户看到的就是「对生成内容没用」。

- 新增 `BarTarget` 抽象：一条消息、或一整块「思考 + 工具调用」聚合区，都能包成同一个操作条作用对象，六个动作只认它。
- 纯工具轮次的聚合块在自己底部挂操作条（复制 / 朗读 / 分享拿到这一块里全部可读文字，赞 / 踩与重新生成按这一块的定位）。
- 一轮不出现两条操作条：有正文时正文带、无正文时聚合块带，二选一。
- 「这一块是不是本轮最后一块」的判定**跳过 role=system 的收尾标记**（「处理完成」那个小胶囊）；这是本轮实测踩到的 bug —— 不跳过时 agent 轮次永远算不上尾块，修完夹具才出条。
- `regenerate` 由「全局最后一条用户消息」改为**按操作条所在那一轮定位**（取 `seq` 小于本块起点的最后一条 user），只加载了后半段时退回原行为；长按消息菜单走同一套 `BarTarget`，与操作条行为一致。

### 实测

- 构建 **0.6.26（code 42）**，`android/bin/dsh-phone.apk` 752401 bytes，md5 `080ee84574c215f279349be77dbe5e3e`（签名带时间戳，bytes + versionName 才是稳定判据），已同步 `plugin/assets/`；`adb install -r` Success，`dumpsys package` = versionCode 42 / versionName 0.6.26。
- 用自造会话缓存夹具（`tools/fixtures/round-tool-only.json`，纯工具轮次）逐动作点击验证：复制出「已复制」、赞转蓝并出「已点赞」、朗读出「本机没有可用的朗读引擎」、重新生成回填上一条提问并重发、`am force-stop` 重启后赞仍为蓝。证据见 `shots/lead/v13/k-fixture2.png`、`l-copy.png`、`m-like.png`、`n-speak.png`、`q-regen.png`、`r-persist.png`。
- 正文消息未被破坏：真实会话上点正文操作条复制仍出「已复制」，且该轮只出现一条操作条（`s-text-copy.png`、`d-beee.png`）。
- 回归 `node tools/verify-harness.mjs` → **PASS=34 FAIL=0 未验证=6**。
- 细节见 [docs/chat-action-bar.md](docs/chat-action-bar.md)。

### 版本线

本机同时有另一路改动在推进（0.6.25 / code 41 的选择文本面板），因此本次构建**不改 `android/build.sh` 默认值**，用 `VERSION_NAME=0.6.26 VERSION_CODE=42` 环境变量注入，避免下次默认构建倒退。

## APK 0.6.25 — 2026-10-22

### 新增

用户报「选择文本这个功能优化一下」，实测是**点了没反应**：旧 `selectText(Item)` 把整条消息正文塞进 `Intent.ACTION_PROCESS_TEXT` 再 `createChooser`，本机没有 PROCESS_TEXT 处理器，选择器既不弹也没报错（截图 `shots/select/before-7-selecttext.png` 与点之前的菜单逐像素一致）。改成**底部选择面板**：

- 长按消息 →「选择文本」→ 面板从底部升起（全宽、18dp 顶部圆角、高度 = 84% 屏高，真机 730dp），正文置顶不预选，光标停 0 位。
- 长按选词 / 拖两端水滴手柄 / 全选；系统浮动工具栏被 callback 屏蔽，操作全走面板自带按钮。
- footer：`已选 N / 共 M 字` + 全选 + 复制 + 分享（图标）+ 完成（品牌色字）。分享与复制都只取**选区**，空选区给「先选一段文字」。
- 关闭四条路：完成 / × / 返回键 / 点遮罩；`renderAll()` 整页重绘前先收面板，避免工具条指向已丢弃的视图。
- 细节与验收见 [docs/select-text.md](docs/select-text.md)。

### 修复

- **复制药丸的禁用态**：原来是整颗 `setAlpha(0.5f)`，浅色白字压 #A1B7FE 只有 **2.0:1**、深色灰字压 #304580 只有 **1.6:1**，像按钮坏了。改成 0 选区时中性底 + 灰字（`t.tile` + `t.muted`/深色 `t.muted2`，4.3:1 / 5.0:1），有选区才切品牌色实底白字；切换由 `copyActive` 守卫，只跨过 0 边界时重刷，不给 120ms 的 tick 添负担。
- **selector 手柄只剩一个圆点**：`ic_select_handle_start/end.xml` 原 viewport 20×28，圆画在 y17.5~32.5 越界被裁、三角与圆断开。重写为 22×26：圆 r=8 圆心 (11,16)、尖脚 `M11,1L16,12L6,12Z` 底边扎进圆内融合成水滴。
- **无障碍/自动化拿不到 idle**：`updateCount()` 每 120ms 无条件 `count.setText()` 会让 `uiautomator dump` 报 `could not get idle state`。改成值比较后再写。
- `plugin/index.js` 的 `VERSION` 从 `0.5.10` 对齐到 `package.json` 的 **0.5.19**（两条版本线早前就漂开了，面板与 `/dsh-phone/api` 报的是这个常量）。

### 实测

- 构建 0.6.25（code 41），`android/bin/dsh-phone.apk` **752398 bytes**，md5 `38d9d80ccf8e4f77c813089f31d0663e`（签名带时间戳，bytes + versionName 才是稳定判据），已同步 `plugin/assets/`；`adb install -r` Success。
- 浅色 / 深色 / 英文三套：`final-9-disabled-light.png`（0 选区中性药丸，实测底 #F5F5F5 + 字 #7D7F85）、`final-10-active-light.png`（有选区 #426EFE + 白字）、`final-7-disabled-dark.png`（#1E1E1E + #8E9094）、`final-8-active-dark.png`（#507BF2 + 白字）、`en-2-sheet.png`（`1 of 1832 characters` 不溢出）。
- 剪贴板内容级验证：选 1 字 → 复制 → 关面板 → 点输入框 → `input keyevent 279` → EditText 恰好是「从」（`final-11-copied-light.png`、`final-12-pasted-light.png`）。
- 分享：`mCurrentFocus=…ChooserActivityZTE`，`getCount()=13`。
- 中间构建 0.6.23（code 39，并发改动线）与 0.6.24（code 40，本次首版把深色初始字色写成 `muted`）已被 0.6.25 取代，不单独发版。

## 插件 0.5.18 — 2026-10-22

### 变更

- 随包 APK 刷新到 **0.6.22**（versionCode 38）：设置「内容 → 工作区」行首图标由地球换成文件夹。

## APK 0.6.22 — 2026-10-22

### 变更

- 设置页「内容 → 工作区」一行行首图标：`ic_globe16`（16dp 实心地球）→ **新建的 `ic_folder24`**（24dp 描边族文件夹，1.9 描边、圆头圆角，与同卡片的 `ic_archive` 归档箱、以及「语言 / 模型 / 外观」几行同一视觉族；由 `Theme.icon(res, color, 22)` 统一着色，深浅色自动跟随）。
- `SettingsActivity.java:277` 只换资源 id，行高 / 内衬 / 点击行为 / 右侧值（跟随电脑端）全部未动。地球图标仍保留给「语言」一行（`SettingsActivity.java:298`）。

### 实测

- 构建 0.6.22（code 38），`android/bin/dsh-phone.apk` **752399 bytes**，md5 `9bfad23807eed8d84e51c5de00142cd7`（签名带时间戳，逐次构建 md5 会变），已同步 `plugin/assets/`；`adb install -r` Success。
- 设置页截图 `shots/lead/v12/a-settings.png` 与放大图 `b-zoom.png`：文件夹描边粗细、圆角、视觉重量与下方「归档箱」一致。

## 插件 0.5.17 — 2026-10-22

### 变更

- 随包 APK 刷新到 **0.6.21**（versionCode 37）：补全对话页助手消息操作条六枚按钮的空壳体验（朗读永远「还在准备」/ 分享无目标弹空面板 / 赞踩无提示且不保存）。

## APK 0.6.21 — 2026-10-22

### 修复

用户报「一段对话结束后最下面的这些按钮的功能缺失」。实测六枚按钮（复制 / 赞 / 踩 / 朗读 / 分享 / 重新生成）**源码层全部已接线可用**，问题在于其中三枚落在空壳体验上，本次补齐：

- **朗读**：模拟器/部分机型没有 TTS 引擎时，原来会新建 TextToSpeech、init 回调永不到达，于是永远停在「朗读引擎还在准备」。现在先 `hasTtsEngine()`（`queryIntentServices(Engine.INTENT_ACTION_TTS_SERVICE)`）预判，无引擎直接 toast「本机没有可用的朗读引擎」；有引擎但 init 超时，由 2 s 的 `ttsWatchdog` 兜底切到同一句提示并回收引擎。
- **分享**：没有可接收 `ACTION_SEND` 的应用时不再弹空的系统选择器，降级为把正文复制到剪贴板并 toast「没有可分享的应用，已复制到剪贴板」。
- **赞 / 踩**：点击后除了图标变色，现在给出「已点赞 / 已标记为不喜欢 / 已取消反馈」的确认 toast；并且**写进 `Prefs`**（键 `fb.<sessionId>.<messageId>`，值 like/dislike/空），重新进会话会由 `restoreFeedback()` 回填，重启 App 也保留。

### 变更

- `Prefs.java` 新增 `messageFeedback(String sessionId, String messageId)` / `setMessageFeedback(String, String, String)`（空值即 remove）。
- `ChatActivity.java`：`toggleFeedback` 重写（落盘 + 分档 toast）、新增 `restoreFeedback`、`copy` 拆出 `setClipboard`、`share` 加目标探测、`toggleSpeak` 加引擎探测与超时兜底、新增 `hasTtsEngine()`、新增 `feedbackRestored` 与 `ttsWatchdog` 两个字段。
- `values/strings_chat.xml` 与 `values-en/strings_chat.xml` 各增 5 条：`ch_speak_no_engine` / `ch_feedback_liked` / `ch_feedback_disliked` / `ch_feedback_cleared` / `ch_share_copied`（两语言 59 → 64 键，键集仍相等）。

### 实测

- 构建 0.6.21（code 37），`android/bin/dsh-phone.apk` **748230 bytes**，md5 `16e4553152b3019f7d94196985ef7c1a`（签名带时间戳，逐次构建 md5 会变；bytes + versionName 才是稳定判据），已同步 `plugin/assets/`；`adb install -r` Success。
- 点朗读 300 ms 内截图即出「本机没有可用的朗读引擎」（`shots/lead/v11/n1-speak-toast.png`），不再无限等待。
- 点赞出「已点赞」且图标转主题蓝（`n2-like-toast.png`）；**force-stop 重启 App 后重进同一会话，赞仍为蓝色**（`n3-reenter.png`，该区域 1276 个 `(66,110,254)` 像素，与本次点击后的计数一致）。
- 回归 `node tools/verify-harness.mjs`：**PASS=34 FAIL=0 NOT-READY=0 SKIP=0 未验证=6**（与 0.6.20 完全一致）。

## 插件 0.5.16 — 2026-10-22

### 变更

- 随包 APK 刷新到 **0.6.20**（versionCode 36）：对话页 ⋯ 菜单删掉「切换到专家模式 / 切换快速模式」与「返回列表」，只剩重命名 / 刷新 / 复制会话 ID。

## APK 0.6.20 — 2026-10-22

### 变更

- **对话页 ⋯ 菜单删除两项**（用户要求）：去掉「切换到专家模式 / 切换到快速模式」与「返回列表」。菜单现在只剩 **重命名这个会话 / 刷新 / 复制会话 ID**。
  - `ChatActivity.sessionMenu()` 由 5 项改为 3 项，分派从 `which==0..4` 收成 `which==0 rename / 1 load / 2 copy(sessionId)`；`pro` 局部变量与 `prefs.setMode(...)` 调用一并移除（该菜单是 `setMode` 的唯一调用点，`Prefs.setMode/mode` 方法本身保留不动）。
  - 「返回列表」原来走 `finish()`，移除后对话页仍可用左上角 ≡ 打开历史抽屉、或用系统返回键退出。
  - 同步删掉三个已无引用的串：`ch_menu_switch_flash` / `ch_menu_switch_pro` / `ch_menu_back`（`values/strings_chat.xml` 与 `values-en/strings_chat.xml` 各 3 条，两语言键数仍相等）。

### 实测

- 构建 0.6.20（code 36），`android/bin/dsh-phone.apk` **739790 bytes**，md5 `d5182c4a6c14888cfa9192e277ee7c1b`（签名带时间戳，逐次构建 md5 会变；bytes + versionName 才是稳定判据），已同步 `plugin/assets/`；`adb install -r` Success（<DEVICE> / 23113RKC6C / Android 15）。
- 中文：进会话 → ⋯ → UI dump 只剩 3 项（`重命名这个会话` y=744 / `刷新` y=888 / `复制会话 ID` y=1032，行高 144px=48dp），截图 `shots/lead/v9/f-menu.png`。
- 英文：`Rename this chat` / `Refresh` / `Copy chat ID`（`shots/lead/v9/g-menu-en.png`，dump `m6.xml`），验完已把设备语言写回 `zh`。
- 三项功能本身回归正常：重命名弹框、刷新重载、复制 ID 的 toast 均未改动代码路径。

## 插件 0.5.15 — 2026-10-22

### 变更

- 随包 APK 刷新到 **0.6.19**（versionCode 35）：绿点改为「已完成且未读」语义，点开会话即变已读、绿点消失。

## APK 0.6.19 — 2026-10-22

### 新增

- **`Read.java`：会话已读的本地记账**。主机没有已读状态（`GET /v1/sessions` 每行只有 `id/title/cwd/updatedAt/status/lastText/itemCount/pinned/archived`），所以已读记在手机 `SharedPreferences` 里，键 `readN:<id>`，值是**已读到的 `itemCount`**。选 `itemCount` 而不是 `updatedAt`：条数单调递增、两端同一份 projection、不受手机与电脑时钟差影响（`updatedAt` 会被改名/置顶这类纯元数据操作碰一下）。`markRead` 只往前推、不回退。

### 变更

- 绿点语义：`itemCount > 0`（跑过就永远绿）→ **`itemCount > seen(id)`（完成且未读）**。首页抽屉 `MainActivity.java:1522` 与聊天页抽屉 `ChatActivity.java:3990` 共用 `Read.unread(this, row)`，一处点掉两页同步。
- 行点击记账：首页 `MainActivity.java:1560-1563`、聊天页 `ChatActivity.java:4023` 都先 `Read.markRead(...)` 再进会话；多选态点行只切换勾选、不记账。
- 正在看的一页自动算已读：`ChatActivity.applyDetail`（`ChatActivity.java:1011`）在 `setStatus` 之后 `Read.markRead(this, sessionId, items.size())`。
- 列表指纹（`MainActivity.java:2064`）用 `Read.unread(this, row) ? '1' : '0'` 取代原先的 `itemCount > 0`：点行变已读、空会话在两轮 5s 轮询之间跑完，都靠这一位触发重建；仍只记 0/1，条数不进指纹（否则每次轮询都重建整张列表）。
- 四态映射不变，只是 done 那格加了已读判定：running → 圆环、failed → 红点、done 且未读 → 绿点、已读/没跑过 → 空槽占位（槽位始终占住 20dp，标题左缘恒定 46dp）。

### 实测

- 构建：本改动完成于 **0.6.19（code 35，739793 bytes，md5 `53c07901b9504ce67f8d63394f93a978`）**；随后并行会话把 `build.sh` 默认值推进到 0.6.20 / 36，同一份源码又构建了一次，设备上这轮验收跑的就是含本改动的 0.6.20 包（签名带时间戳，逐次构建 md5 不同；bytes + versionName 才是稳定判据）。已同步 `plugin/assets/`；`adb install -r` Success（<DEVICE> / 23113RKC6C / Android 15，density 3）。
- 未读态：4 条跑过一轮的会话挂绿点；`itemCount=0` 的「鲸域网站开发」「云服务器安全」「抖音工作流测试」「家庭网络拓扑结构」无点。
- 点「某个会话」→ 进会话页 → 返回 → 该行绿点消失、其余行不动；设备端记账 `readN:session-<redacted> = 44`（该会话 `itemCount=44`）。
- 反向：`POST /v1/sessions` 新建只回 ok 的会话 → 自动绿点 → 点开消失 → `POST /v1/sessions/{id}/messages` 再发一轮 → 绿点自己回来（探针会话验完已 `POST .../archive` 归档）。
- 抽屉不关的过渡：第三轮进行中该行是圆环，跑完后**不关抽屉、5s 轮询自己**换成绿点（<TMP>/r7.png → <TMP>/r8.png）。
- 深色：绿点仍 `(34,197,94)` = `#22C55E`，与浅色逐位相同；已读与空会话行为不变。验完已写回 `theme=day` 并读回确认。

### 证据图

- `shots/ring/unread-state-light.png`：上排＝未读（绿点）/ 点开后（无点），下排＝进行中（圆环）/ 跑完变绿点（抽屉不关的同一行前后对照）。
## 插件 0.5.14 — 2026-10-22

### 变更

- 随包 APK 刷新到 **0.6.18**（versionCode 34）：聊天页抽屉与首页抽屉同构 —— 保留顶栏搜索胶囊 + 工作区 chips、底栏用户行 + ⋯ 菜单，删除「会话」标题与右上 ⊕。

## APK 0.6.18 — 2026-10-22

### 新增

- **聊天页抽屉顶栏**：搜索胶囊 38dp（`t.round(t.surfaceAlt, 20f)`，hint「搜索对话内容…」，左右边距 14dp、topMargin 14 / bottomMargin 8）+ 工作区 chips 行（高 30dp、13sp、右距 8dp、选中 `accent` 文字 + `accentSoft` 底；目录来自 `GET /v1/catalog` 的 `workspaces[].cwd/title`，外加会话里出现但未登记的 cwd）。
- **聊天页抽屉底栏**：34dp 头像（`Me.avatar` 有图用图，否则首字母 + `accentSoft` 底）+ 昵称 16sp + host 行 11sp（`Hosts.title(active)` 或「地址 · 设备」）+ 右侧 ⋯ 18dp；整行点击进设置，⋯ 弹五项菜单（在线主机 / 归档箱 / 刷新列表 / 连接设置 / 设置），归档箱走 `MainActivity` + `extra archive=true`。
- **检索态**：点胶囊切成 `drawerSearchBar()`（左侧返回箭头 + EditText，自动聚焦并弹键盘），输入即时过滤 `title` / `lastText`；返回键先退检索再退抽屉；关闭抽屉一律 `resetDrawerSearch()`。

### 变更

- 聊天页抽屉 `drawerBody()` 由「会话标题行 + 列表」改为 `drawerHeadBox` + `list` + `drawerUserRow()`；「会话」16sp 标题与右上 ⊕ 删除（聊天页顶栏 `topBar` 已有 ⊕ 新建，抽屉里那个是重复入口）。
- 工作区筛选只存在 Activity 内（`drawerWs` 不写回 `Prefs`），避免在聊天页点 chip 改掉首页的默认工作区。
- 空态分两种：有关键词 → 「没有找到相关对话」；只选了工作区 → 该工作区空态。
- 行首状态槽（0.6.17 的 20dp 环 / 绿点 / 红点 / 空占位）与列表分组不动。

### 实测

- 构建 0.6.18（code 34），`android/bin/dsh-phone.apk` **739792 bytes**，md5 `88eea0f9a0321eee7a53b2be15c0fe5a`（签名带时间戳，同源码逐次构建 md5 不同；bytes + versionName 才是稳定判据），已同步 `plugin/assets/`；`adb install -r` Success（<DEVICE> / 23113RKC6C / Android 15）。
- 浅色（1080×1920 / density 3）：抽屉顶栏胶囊 + chips（全部 / github / task / security / W…）、置顶 6 行（当前会话绿点 + `accentSoft` 高亮）、今天分组、底栏「柔堇 / <HOSTNAME>…C6C (Android 15) / ⋯」；每行标题左缘仍是 **x=140..142**。
- chips 过滤：点 github → 只剩 2 条 github 会话（「我是一名小白，教我怎么使用g…」「未命名会话」），置顶分组消失、今天分组保留。
- 检索：输入 `adb` → 空态「没有找到相关对话」；输入 `harness` → 命中 置顶 1 / 今天 2 / 昨天 3 / 7 天内 2，分组照旧。
- ⋯ 菜单：标题为 host 行，五项齐全；点「归档箱」跳到 `归档箱 · 155` 页（真实跳转，非占位）。
- 深色（`shared_prefs` 写 `theme=dark`）：胶囊 `surfaceAlt`、chips 选中 `accent` + `accentSoft`、底栏同上，逐项与首页深色一致；验完已改回 `day`（读回确认）。

### 证据图

- `shots/ring/chat-drawer-light.png`、`shots/ring/chat-drawer-dark.png`（886×1920，抽屉整幅三段：顶栏 / 列表 / 底栏）。

## 插件 0.5.13 — 2026-10-22

### 变更

- 随包 APK 刷新到 **0.6.17**（versionCode 33）：两处会话列表统一行首 20dp 状态槽。

## APK 0.6.17 — 2026-10-22

### 修复

- **聊天页历史抽屉的行首没有状态槽，标记（圆环 / 绿点）一消失文字就向左吸到 12dp**：`ChatActivity.drawerRow` 行内衬 12dp→10dp，补上与首页会话列表逐字一致的 20dp 槽 —— `status=="running"` → `StateRing`、`failed` → `StateDot(t.bad)`、`itemCount>0` → `StateDot(t.ok)`、从未跑过 → **空 `View` 占住槽位**（槽位不能跟着标记一起消失，否则整列标题在槽位/无槽位之间来回跳）。分组标题内衬 12dp→10dp，与槽位对齐。
- 结果：同一批会话在首页抽屉与聊天页抽屉里的标题左缘完全一致（8dp 列表内衬 + 10dp 行内衬 + 20dp 槽 + 8dp 右距 = **46dp ≈ 138px** @density 3）。

### 未变

- 聊天页抽屉的当前会话高亮（`t.accent` 文字 + `t.accentSoft` 圆角底）、16sp 标题、分组标题 13sp `t.muted`、点行就地 `switchTo` 与零转场都不动 —— 只补槽位与对齐。

### 实测

- 构建 0.6.17（code 33），`android/bin/dsh-phone.apk` **735694 bytes**，md5 `5bb18a92db5cfe5cd761897668c98bd0`，已同步 `plugin/assets/`；`adb install -r` Success（<DEVICE> / 23113RKC6C / Android 15）。
- 逐行量左缘（1080×1920 / density 3 / 浅色）：聊天页抽屉 14 行标题全部落在 **x=139..142**，其中绿点行 `75..92` + 标题 `140`、圆环行 `64..106` + 标题 `141`、空槽行 `140`；首页抽屉同样是 `140/142`。
- 聊天页抽屉同框四态：置顶 4 绿点、抖音工作流测试 / 家庭网络拓扑结构 空槽、今天组里 2 条 running 显圆环（`GET /v1/sessions` 当时恰有 2 条 `status":"running"`）、「问候」当前会话绿点 + 高亮。
- 证据图：`shots/ring/session-list-align-before-after.png`、`shots/ring/chat-drawer-states.png`。

## 插件 0.5.12 — 2026-10-22

### 变更

- 随包 APK 刷新到 **0.6.14**（versionCode 30）：会话跑完从圆环变绿点。

## APK 0.6.16 — 2026-10-22

### 新增

- **对话页历史抽屉**（`ChatActivity`）：顶栏 ≡ 不再直接 `finish()` 退回首页的新对话页，而是从左滑出历史抽屉（遮罩 `0x99000000` × `Motion.SCRIM_ALPHA`，面板 0.82×屏宽，进 220ms `EASE_DECELERATE` / 出 190ms `EASE_ACCELERATE`）。列表走与首页抽屉同一个 `/v1/sessions`（不带参数、只读），分组沿用 `session_history_timeline_label_*`，**当前会话用 `t.accent` 文字 + `t.accentSoft` 圆角底高亮**；点另一条就地 `startActivity` 同页新 `sessionId` 并 `finish()`，OPEN/CLOSE 转场都置 0（官方也是就地换内容）。左缘往右划同效，返回键先收抽屉。
- 文案 2 键：`ch_drawer_title`（会话 / Chats）、`ch_drawer_new`（新对话 / New chat）。

### 实测

- 构建 0.6.16（code 32），`android/bin/dsh-phone.apk` **735697 bytes**，md5 `6fc20d585b336d5f881b53c310e56a80`，已同步 `plugin/assets/`；`adb install -r` Success（<DEVICE> / 23113RKC6C / Android 15）。
- 对话页 ≡ → 抽屉（`shots/lead/v8/c-chat-drawer.png`，当前会话「鲸域网站开发」高亮）；点「问候」→ 标题与内容就地切换、`topResumedActivity` 仍是 `.ChatActivity`（`d-switched.png`）；再开抽屉高亮已跟随（`e-drawer2.png`）；返回键只收抽屉（`f-after-back.png`）；英文模式 `Chats / Pinned / Today`（`h-en-drawer.png`）；左缘右划同画面（`j-edge-swipe.png`）。
- 回归：`node tools/verify-harness.mjs` → **PASS=34 FAIL=0 NOT-READY=0 SKIP=0 未验证=6**。

### 文档

- `docs/lead-chat-drawer.md`：问题判读 / 参考证据 / 改动清单（3 处接线）/ 动效数值来源 / 8 张实测证据 / 功能零变更核对 / 构建与回滚。

## APK 0.6.14 — 2026-10-22

### 新增

- **对话跑完后，行首的旋转圆环变成绿点**：新增 `StateDot.java`（10dp 盒 + 60% 直径的实心点），`status=="failed"` 画红点（`Theme.bad`），`idle && itemCount>0` 画绿点（`Theme.ok`），从未跑过的不画 —— 避免几十条「未命名会话」挂满标记。

### 变更

- 列表指纹 `listSignature()` 在 `status` 之后追一位 `itemCount>0 ? '1' : '0'`（只记 0/1 不记条数：条数一轮内反复变会让每次 5s 轮询都重建整张列表；但「空会话在第一轮结束」只有这一位能捕捉）。

### 实测

- 构建 0.6.14（code 30），`android/bin/dsh-phone.apk` **731600 bytes**，md5 `4085b44a1d6d4e88376857d29a903607`，已同步 `plugin/assets/`；装机后 `dex` 内确认存在 `Lcom/lc/phoneharness/StateDot;`。
- 端到端过渡：`POST /v1/sessions`（返回键名是 **sessionId**，不是 `id`）新建会话 → 抽屉里新行立刻是圆环 → 该轮结束后 **≤5s 自动变绿点**，无需重开抽屉（tr1 环 / tr2 仍环 / tr3–tr4 绿点，绿点像素 (114,218,152) 为抗锯齿边，该行非白像素 316→50）。
- 测试会话标题因 curl 传参乱码，已 `POST /v1/sessions/<sessionId>/archive` 清理。

## 插件 0.5.11 — 2026-10-22

### 变更

- 随包 APK 刷新到 **0.6.13**（versionCode 29）：抽屉会话行左侧的「这条对话还没跑完」旋转圆环。

## APK 0.6.13 — 2026-10-22

### 新增

- **抽屉里「还没跑完的对话」左侧有了旋转圆环，与主机 harness 同规格**：新增 `StateRing.java`，14dp 自绘圆环 —— 整圈 **1.5s 匀速旋转** + 弧长 **72.4°→144.8°→72.4° 呼吸**（1.5s ease-in-out，起点同时前移 36.2°），底环 25% 透明度。所有数值逐字取自主机前端 `index-BxpfOGf3.css` 的 `_dsh-state-dot-spin` / `_dsh-state-dot-dash` 两条 keyframes（含 `stroke-dasharray:12 150` → `24 150` → `12 150`、`stroke-dashoffset:0 → -6 → 0`、`stroke-width:2`、`r=9.5`、viewBox `24`），不是估的 —— 逐条对照见 `docs/motion-tokens.md` §H2。减少动效时退化为静态弧（对应主机 `prefers-reduced-motion` 分支的 `18 150 / -3`）。
- **行首固定 20dp 状态槽**（`MainActivity.drawerRow`）：多选态放选择圈、`status=="running"` 放圆环、其余放空占位 —— 空位也占住，否则有会话在跑时整列标题会左右跳一格。
- **全 App 共用同一相位基准**（`StateRing` 里的 `EPOCH`）：对应主机 `HD()` 把所有 spinner 的 `startTime` 置 0，多个环同相位转，不会各转各的。
- **新增令牌 `Motion.DUR_HOST_SPIN_LOOP = 1500`**，证据级别 `[测·主机]`（该级别已补进 `docs/motion-tokens.md` 的分级表）。
- 抽屉里**有会话在跑时每 5s 重拉一次会话列表**（`RUNNING_POLL_MS` / `syncRunningPoll()`）：列表接口不推流（SSE 只走单会话详情），这是环能停下来的唯一依据。只在「抽屉开着且真有 running」时排，关抽屉 / `onPause` 立刻摘掉。

### 变更

- 抽屉行标题右侧原来那个 `"●"` running 圆点删掉：状态只由左侧环表达，不再一处两个指示器。
- 列表指纹 `listSignature()` 加入 `status`：否则 turn 结束后 `render()` 不跑，环会一直转到下次进页面。

### 修复

- 构建期撞名：新 View 原名 `Ring`，与 `MainActivity` 里既有的私有嵌套类 `Ring`（输入卡右侧圆钮的容器 DTO）冲突，`javac` 报 `constructor Ring in class Ring cannot be applied to given types`；改名为 `StateRing` 后通过（未动既有嵌套类）。
- **圆环把宿主的状态槽压扁，整列标题左右跳 6dp**（像素比对发现）：`StateRing.onMeasure` 原写死 `setMeasuredDimension(42, 42)`，无视 `LinearLayout` 给的 `EXACTLY` 60px（20dp）槽，于是有环的行标题左缘 `x=121..123`、无环的行 `x=140..142` —— 正是「空占位」本身要消灭的跳动，只是换成宽度而非有无。改为按 measure spec 取值：`resolve(spec, want)` 在 `EXACTLY` 下返回 `size`、`AT_MOST` 下返回 `min(size, want)`，环仍按 14dp 绘制并在槽内居中（`onDraw` 的 `diameter = min(sizePx, view)` 不变）。修后所有行标题左缘统一 `139..142`，环包围盒从 `x=56..93` 归位到 **`x=65..102`**（槽 `56..116` 居中、42px 宽）。

### 实测

- 构建 0.6.13（code 29），`android/bin/dsh-phone.apk` **731600 bytes**，md5 `aa7ab83ce484a877463e5f4a53b16915`（同值的 `bin/dsh-phone.apk.json` 旁车元数据供插件读版本/大小/哈希），已同步 `plugin/assets/`；`adb install -r` Success（<DEVICE> / 23113RKC6C / Android 15）。
- 像素（浅色，应用内 `theme=day`）：抽屉「今天」组两行左端各一枚环，环包围盒 **`x=65..102`**（= `x=56..116` 的 20dp 槽内居中）、`y=1410..1438` 与 `y=1542..1570`；弧最暗像素 **127** = `Theme.muted` 浅色 `#7D7F85`，底环更淡（25% 透明度）。置顶组各行与「今天」组标题左缘统一为 `139..142`（修槽宽前有环行是 `121..123`）—— 占位与居中同时成立，有无环都不跳。
- 像素（深色，应用内 `theme=dark`）：环包围盒 `x=69..101`，最亮像素 **186** = `Theme.muted` 深色 `#B9BABB`，标题左缘同样 `141` —— 颜色随主题走，不用单独一套令牌（主机本身也是 `stroke:currentColor` + `--dsw-alias-label-tertiary`）。
- 复现深色请注意：系统夜间模式（`cmd uimode night yes`）对 App 无效，`Prefs` 里显式存了 `theme=day` 时优先于系统（`Prefs.java:125`）；要验深色得改 `shared_prefs/phone-harness.xml` 的 `theme` 再 `force-stop` 重启，验完记得改回。
- 动效：设备侧打时间戳连拍 12 帧（`date +%s%3N` 后紧跟 `screencap -d <uniqueId>`，间隔 ~160ms），弧长在 **85°–155°** 之间呼吸，对弧长序列做正弦拟合得**周期 1500ms，R²=0.9985**，振幅 36.5°（理论 36.25°）；弧角中点持续推进，P=1500 时残差集中度 R=0.907，而 P=900/1200 只有 0.08/0.67 —— 即转的就是 1.5s，不是 `DUR_LOADING_LOOP`(900) 那一档。

## APK 0.6.12 — 2026-10-22

### 新增

- **配对页（连接你的电脑）左上角补上返回键**：此前这一页没有任何返回入口，只能按系统返回键。现在顶栏左侧有一枚圆形返回键（浅色底 `#EFEFEF` / 深色 `#1E1E1E`，20dp `ic_back`，36dp 圆形热区 + ripple），点它或按系统返回键都退回上一页，并沿用全局的右出转场动画（`nav_hold` / `nav_exit`）。实现见 `PairActivity.java` 的 `topBar()` / `finishWithPop()` / `onBackPressed()`；内容区顶部内边距由 44dp 收到 18dp，其余布局、文案、配色与相邻页面不受影响。
- **实测**：深色与浅色两套外观下顶栏按钮均正常显示；点返回键与按系统返回键后 `topResumedActivity` 均为 `SettingsActivity`（从设置页进入时），不残留、不跳空。

## 插件 0.5.10 — 2026-10-22

### 变更

- 随包 APK 刷新到 **0.6.12**（versionCode 28）：配对页左上角返回键。

## 插件 0.5.9 — 2026-10-22

### 变更

- 随包 APK 刷新到 **0.6.11**（versionCode 27）：包含 0.6.9 的新鲸形 logo + 跟随应用外观的深浅色切换，以及 0.6.11 对「白鲸压白底」的修复（删除 `drawable-night/`）。

## APK 0.6.11 — 2026-10-22

### 修复

- **修掉「白鲸压白底」**：系统处于深色、应用内「外观」却是浅色时，首页 / 空会话页 / 启动页的 logo 会变成白鲸叠在浅色页面上（首页实测：背景 `(255,255,255)`、logo 区域最暗像素 248、墨色像素 0），肉眼几乎不可见。成因是 `drawable-night/` 的资源限定符按**系统** uiMode 解析，与应用自己的 `Theme.dark` 无关 —— 程序化选择被资源限定符覆盖。已删除 `android/res/drawable-night/`，并让 `brand/make-whale-assets.py` 不再生成它；logo 的选择只由 `Theme.dark` 决定。
- **回归用例**：系统深色 + 应用显式浅色 → 浅色页面 + 黑鲸。完整验证矩阵（系统 × 应用外观 2×2）与像素断言见 `docs/logo-theme-spec.md` §五 / §六；真机复验证据见 `docs/logo-verification.md`。
- 本次为交付构建（versionName 0.6.11 / versionCode 27），随包 APK 已同步 `plugin/assets/dsh-phone.apk`。

## APK 0.6.10 — 2026-10-22

### 变更

- **「当前主机」行改成纯状态展示**（`HostsActivity.rowView`）：① 去掉行尾的展开指示符（chevron）；② 不再注册点击，点一下不跳页、不重开会话列表；③ 连按下反馈（ripple）一并去掉，单击不产生任何请求或事件响应。长按仍打开这台主机自己的菜单（打开工作台 / 打开归纳箱 / 重命名 / 删除这台主机），主机管理能力不丢。
- **其余主机行完全不受影响**：非当前主机保留 chevron 与「点一台即切到它的工作台」的原有交互，离线行点击仍提示「… 现在连不上」。实测：注入一台离线主机后，离线行 chevron 与点击提示均正常；当前行点击后 `topResumedActivity` 保持 `HostsActivity`、logcat 无任何 Activity 启动事件，节点属性 `clickable=false / long-clickable=true`。

## APK 0.6.9 — 2026-10-22

### 新增

- **应用内 logo 换成新鲸形并跟随系统深浅色**：浅色模式黑鲸 `#131414`、深色模式白鲸 `#F8F8F8` —— 两份素材同源（同一份单色剪影，只有着色不同）。启动页 / 首页 / 空会话页 / 配对页 / 设置页品牌位五处统一改由 `Theme.brandLogo()` / `Theme.splashLogo()` 按 `Theme.dark` 选资源，首帧即正确，主题变化重建后无残留。
- **桌面图标换新鲸形**：传统图标（白底圆角瓦片 + 黑鲸）与自适应图标前景同步换图，并新增 Android 13+ 主题图标层 `<monochrome>`（`mipmap-*/ic_launcher_monochrome.png`）—— 启动器图标本身不随系统深浅色切换，主题图标层是平台提供的唯一系统级适配途径。
- **不放 `drawable-night/`（真机验证后的结论）**：一度加过 `drawable-night/` 深色版当资源级兜底，实测发现它有害 —— 资源限定符按**系统**配置解析，与应用内「外观」选择无关，于是「系统深色 + 应用显式浅色」时 `ic_brand_logo` 被改写成白鲸，叠在浅色页面上不可见（首页实测：背景 (255,255,255)、logo 区域最暗像素 248、墨色像素 0）。该目录已删除（详见 0.6.11），logo 只由 `Theme.dark` 选择。
- **素材生成脚本** `brand/make-whale-assets.py`：读 `brand/whale-source.png` 一条命令重生成全部 logo 素材（五档密度 × 两套着色 + 图标三态）。规格、改动清单与验证方法见 `docs/logo-theme-spec.md`。

## 插件 0.5.8 — 2026-10-22

### 变更

- 随包 APK 刷新到 0.6.10（0.6.9 的新 logo + 跟随系统深浅色，加上 0.6.10 的当前主机行改动）。

## APK 0.6.8 — 2026-10-22

### 变更

- **座位胶囊加深到与功能圆钮同色**：`chipInk` 改为直接取正文色（浅色 `#0F0F0F` / 深色 `#F8F8F8`），与输入卡右侧的 ⊕、语音圆钮同色；chevron 用 `chipInk2`（浅 `#5A5E66` / 深 `#C9CACB`），仍比正文浅一档但明显深于 muted。实测浅色下 chip 文字与 ⊕ 按钮取色同为 `(15,15,15)`。

## 插件 0.5.7 — 2026-10-22

### 变更

- 随包 APK 刷新到 0.6.8（座位胶囊与功能圆钮同色）。

## APK 0.6.7 — 2026-10-22

### 变更

- **composer 四枚座位胶囊的图标与文字加深**：新增主题色 `chipInk`（浅色 `#3F434A` / 深色 `#E9EAEB`）与 `chipInk2`（chevron，浅 `#6F7379` / 深 `#B9BABB`），替换原先的 `muted`（#7D7F85）与 `muted2`（#8E9094）。三处 `seatChip()`（`MainActivity:623`、`ChatActivity:664`、`NewSessionActivity:216`）与各自的 `renderChips()` 着色统一改用新色，浅深两套主题各自取值，无需手工切换。

## 插件 0.5.6 — 2026-10-22

### 变更

- 随包 APK 刷新到 0.6.7（座位胶囊配色加深）。

## APK 0.6.6 — 2026-10-22

### 修复

- **模型 / 权限两枚选择器回到打字胶囊内部原来那一行**（顺序：模型 → 权限 → 弹簧 → 上传/语音两枚 44dp 圆钮；`maxTextDp` 回到 70 / 56），**工作区 / 预设**两枚仍留在胶囊上方那一行；会话页不再有座位带，两枚选择器回到输入卡片内 —— 与改动前的位置、顺序、交互一致（用户反馈）。
- **预设面板打开即向主机取最新名册**：不再只在本地缓存为空时才取数；取数失败时显示真实原因（`Harness.lastError()`：状态码 + 错误码 + 主机说明）并提供可点的「重新加载」一行（主机侧的 `failures` 本轮不单独成组，逐条原因已在置灰项上给出）。

### 变更

- **设置页分组调整**：「内容」卡片（工作区 / 归档箱）从原来的第一位下移到「账户」卡片下面，分组名从「连接」改成「内容」；现在顺序是 品牌卡 → 账户 → 内容 → 应用 → 语音 → 关于。
- **设置页移除两行**：删掉「连接 → 电脑连接」与「应用 → 用户主机的 Harness」两项 —— 连接分组只剩「工作区 / 归档箱」，应用分组直接从「模型」开始（用户主机 harness 的读写面板仍留在 composer 的 chip 与新建会话页里）。

## 插件 0.5.5 — 2026-10-22

### 变更

- 随包 APK 刷新到 0.6.6（设置页分组调整）。

## 插件 0.5.4 — 2026-10-22

### 修复

- **预设名册取数加固**：`GET /v1/harness` 的 `presets` 不再可能返回空数组 —— 取数按 `agentPresets.remoteExportList()`（用 `isDefault` 定当前项）→ `agentPresets.list()` → 插件内置四条中文名册 三级回退，任一级给出 id 就进名册；全拿不到时回落内置四条并把原因写进 `failures`。条目 `title` 不再可能为空串（宿主缺 `name`/`description` 时用内置中文补齐）。对应手机端「选择模式」面板候选为空的问题。

### 变更

- 随包 APK 刷新到 0.6.6（versionCode 22）。

## 插件 0.5.3 — 2026-10-22

### 新增

- **用户主机的 harness 通道（协议 v1.3）**：新增四个端点，把「跑在电脑上那份 harness 配置」交给手机读写 —— `GET /v1/harness`（预设名册 + 最近工作区 + 当前默认模型/权限/预设 + 能力位 + 失败项）、`POST /v1/harness/config`（切换 预设 / 工作区 / 权限 / 模型，写后读回确认，返回 `persisted`）、`GET /v1/harness/dirs`（只列目录，含 `showHidden`）、`POST /v1/harness/dirs`（新建目录，重名 409）。
- 预设名册按桌面文案补全中文名与说明（标准模式 / PTC 模式 / 极简模式 / 创造模式）；加载失败的预设不隐藏，而是回 `usable=false` + `reason`，让手机置灰并说明原因。
- 错误码扩表：`unknown_preset` / `unknown_model` / `unknown_permission` / `bad_workspace` / `bad_path` / `bad_name` → 400，`forbidden` → 403，`exists` → 409，`config_unavailable` → 503（宿主没有可写通道时读接口照常工作、写接口明确拒绝）。
- 工作区是**插件自己的偏好**：能写 profile 条目时持久化，写不动时退化成「本次运行内生效」（`persisted:false`），不假装已经落盘。

### 变更

- 随包 APK 刷新到 0.6.4（手机端座位行与配置面板）。

## APK 0.6.4 — 2026-10-22

### 新增

- **首页 composer 座位行补齐「工作区」与「Agent 预设」两枚 chip**，顺序与桌面新会话页一致：工作区 → Agent 预设 → 模型 → 权限。座位行**独立成一行、位于输入框卡片的上方并整行靠左**（不塞进打字框里），四枚 chip 排进一条横向滚动带：窄屏横向滑动、永不换行，右侧上传与语音两枚圆钮留在卡片内、不受挤压。
- **点开即改主机配置**：工作区面板 = 最近工作区（当前项打勾 + 完整路径副标题）+ 面包屑目录浏览 + 上级目录 + 「使用此目录」+ 手动输入路径；Agent 预设面板 = 说明段 + 内置/自定义分组 + 中文名与描述 + 当前项标「新任务默认」+ 加载失败的项置灰并给出原因。点选即乐观更新 chip，失败回滚并提示「无法切换到「X」：原因」，只在本次运行生效时补一句「已生效（本次运行）」。
- **新建会话页**的两枚 chip 复用同一套面板，创建会话时带上所选 `agentPreset`；**设置页**新增「用户主机的 Harness」行（工作区 / 预设 / 模型 / 权限四项当前值，逐项可点改）；**会话页**只显示一枚只读的预设标签（会话一旦开始组合就固定，不假装可切）。
- 主机没有可写通道时（`writeConfig=false`），面板与设置页顶部明确标注只读，不做「能改」的假象。

## APK 0.6.3 — 2026-10-22

### 新增

- **抽屉底部账号栏继承电脑端登录账号**：头像直接显示电脑端 harness 登录账号的头像（走 `GET /v1/me/avatar` 拉下来，按魔数认 jpeg/png/gif/webp，圆裁显示），标题显示账号昵称/ID（现在是 `<账号昵称>`），不再写死 `PhoneHarness`；副标题仍是「电脑名 · 手机型号」。
- 设置页「账户 → 账号管理」右侧的值同步显示账号昵称；退出登录时一并清掉本地账号缓存与头像文件。

### 变更

- 账号身份来自宿主新增的 `GET /v1/me`（`{id,name,contact,avatarUrl,source}`）：进首页时后台刷新，缓存进 Prefs 与 `filesDir/me-avatar.bin`，断网或电脑端没登录账号时沿用上次结果（退化为电脑用户名）。

## 插件 0.5.2 — 2026-10-22

### 新增

- **`GET /v1/me` / `GET /v1/me/avatar`**：把电脑端登录的账号身份（昵称、ID、联系方式、头像）暴露给已配对的手机；身份取自 DSH 的 `deepseekAccount.getProfile()`，拿不到时退化为电脑用户名（`source: "host"`）；头像按 URL 缓存 24 小时，4 MB 上限，按魔数识别格式。
- 控制 API `/status` 载荷新增 `user` 字段。

### 变更

- 随包 APK 刷新到 0.6.3。
## APK 0.6.2 — 2026-10-22

### 修复

- **点抽屉底部账号栏「闪一下、过渡不顺」**：原来是三层动画在抢帧 —— 抽屉 190ms 滑出 + 遮罩淡出 + 系统默认的 Activity 缩放入场；现在抽屉同步落位（`closeDrawerNow()`，不留中间帧），只保留一条 200ms 的右进转场（`res/anim/nav_enter.xml` + `nav_hold.xml`，返回用 `nav_exit.xml`）。
- **设置页首帧露白**：系统启动预览窗取的是主题里的 `windowBackground`（纯白），而设置页底是 `#F3F4F6`；新增 `AppTheme.Content`（`windowBackground=@color/page_bg`，深色 `values-night` 同步为 `#0F0F0F`）给 SettingsActivity，并在 `onCreate` 里 `setBackgroundDrawable(pageBg())` 兜底。
- **返回首页时整列表重建**：`onResume → load()` 每次都 `removeAllViews()` 再逐行 add，主线程被占住；新增内容指纹 `listSignature()` / `renderedSig`，数据没变就不重建。

### 变更

- 导航统一走 `pushIn(Intent)`（MainActivity）/`push(Intent)`（SettingsActivity）/`closeWithPop()`（ChatActivity），首页 → 会话 → 返回、抽屉 → 设置/在线主机/连接设置/归档箱，方向与时长一致。
- 实测（MuMu，软件渲染）：进设置 15 帧、冷启动首帧 1 次 >16ms；再次进入 16 帧、janky 0%、95th 16ms；返回首页 11 帧、janky 0%、90th 5ms。

## 插件 0.5.0 — 2026-10-22

### 变更

- 随包 APK 刷新到 0.6.2（抽屉账号栏与页面转场重做）。
## APK 0.6.0 — 2026-10-22

### 修复

- **进应用不再自动展开底部三格工具栏**：首页 composer 的三格（拍照 / 相册 / 文件）此前被硬编码成 `setVisibility(VISIBLE)`、图标也直接给成 ✕，所以每次进应用都是「已展开」；现在建界面时就 `GONE` + ⊕，并且 `onResume()` 里再 `closePanel()` 一次 —— 进应用、从会话页返回、强杀后重进，都固定成「工具栏未展开」的状态。点 ⊕ 仍可展开、再点一次收起。

## 插件 0.4.9 — 2026-10-22

### 变更

- 随包 APK 刷新到 0.6.0（首页底部三格工具栏默认收起）。
## APK 0.5.9 — 2026-10-22

### 变更

- **右上角「开新对话」换成官方图标**：改用官方 2.6.1 的 `ic_new_chat_outline_24`（开口圆环 + 加号，单条 fill 路径），首页顶栏 24dp、会话页顶栏 21dp 同步替换，不再是自绘的实心圆环 + 十字。
- **每次启动固定落回首页**：`SplashActivity` 进主界面的 Intent 加上 `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TASK`，manifest 再给 Splash 加 `android:clearTaskOnLaunch="true"`；以前从桌面图标进来会恢复上次停留的会话页，现在无论「后台被回收后重进」还是「强杀后重进」都停在「嗨！今天想聊些什么？」。

## 插件 0.4.8 — 2026-10-22

### 新增

- **面板自动更新检测**：设置 → 手机远程底部新增「更新」卡片 —— 当前版本 / 最新版本 / 上次检查时间 / 三个来源各自的状态徽标（`npm · 未发布`、`github · 占位地址`、`feed · 正常`…），配「立即检查」与「自动检查」开关。有新版时卡片标题带「有新版 vX」徽标。
- 三源并发比较、取最高版本：npm `registry.npmjs.org/dsh-phoneharness/latest`、GitHub `releases/latest`（无 Release 时退化到 tags）、以及可选的 `updateFeed`（任意返回 `{"version":"x.y.z"}` 的地址，内网/私有分发/CI 产物都能接）。
- 新接口：`GET /dsh-phone/api/update`、`POST /dsh-phone/api/update/check`、`POST /dsh-phone/api/update/auto`。

### 变更

- 自动检查：宿主启动 8 秒后查首次，之后每 `updateIntervalMs`（默认 6 小时，最小 5 分钟）复查；状态落盘 `~/.dsh/phone-harness/update.json`（0600），面板读缓存不打 registry。开关状态跨重启保留。
- `cordis.patch.yml` 新增 `updateAuto` / `updateIntervalMs` / `updateFeed` 三项。
- 随包 APK 刷新到 0.5.9（官方「新对话」图标 + 启动固定回首页）。
## APK 0.5.8 — 2026-10-22

### 修复

- **用户气泡恢复成官方样式**：气泡里的 TextView 之前交给 LinearLayout 的默认布局参数（MATCH_PARENT），于是 `setMaxWidth` 失效、气泡被撑成整宽；改成显式 `WRAP_CONTENT` 后回到右侧窄气泡（最宽 68% 屏宽、右下对齐）。

## APK 0.5.7 — 2026-10-22

### 性能

- **打开会话秒开**：新增本地磁盘缓存（`Cache.java`，应用私有目录 `files/cache/`，总量上限 24MB 自动淘汰最旧），第二次打开同一会话先铺缓存再后台刷新，不再等 2.7MB 全量下载。
- **首屏只渲染最近 60 条**，顶部出现「载入更早的消息」；点一下就地扩窗（本地有）或向电脑要全量（本地只有尾巴）。
- **首次打开只取尾巴**：请求 `GET /v1/sessions/{id}?tail=300`，不再整包拖 3400+ 条下来。
- **流式回复不再整页重建**：SSE 的 `item` 事件合并成 120ms 一次重绘（此前每来一条就全量 `removeAllViews` 重建所有视图）。

## 插件 0.4.7 — 2026-10-22

### 变更

- 随包 APK 刷新到 0.5.8（用户气泡宽度修复）。

## 插件 0.4.6 — 2026-10-22

### 新增

- `GET /v1/sessions/{id}` 支持 `?since=<seq>` 增量返回（只回新增条目 + 末尾一条 `head`，后者可能还在同一 seq 上继续长）、`?tail=<n>` 只回尾部 n 条（带 `truncated:true` 与 `total`）。
- `GET /v1/sessions` 与 `GET /v1/sessions/{id}` 支持 `ETag` / `If-None-Match`：内容没变回 `304`，App 直接用本地缓存。

## APK 0.5.6 — 2026-10-22

### 修复

- **设置页版本号不再显示错**：以前 `App.java` 里硬编码 `VERSION_NAME = "0.5.4"`，界面永远显示 0.5.4；现在改为运行时读安装包真值（`PackageManager`，新增 `App.versionName(ctx)` / `App.versionCode(ctx)`）。
- **「检查更新」变成真的**：以前点了只弹「已是最新版本」；现在真的去问电脑（`GET /apk/meta`），比较 versionCode（相同则比 md5，能识别「版本号没动但包重新构建了」）。进设置页会自动静默检查一次，发现新版本弹「发现新版本 x / 去下载」。

### 变更

- 构建：版本号单一来源改为 `android/AndroidManifest.xml`；`build.sh` 会生成注入后的 manifest 副本再交给 aapt2，支持 `VERSION_CODE=12 VERSION_NAME=0.5.6 bash build.sh` 覆盖（此前 aapt2 link 的 `--version-code/--version-name` 盖不过 manifest 里的显式值，所以包内版本号一直没变）。

## 插件 0.4.5 — 2026-10-22

### 新增

- 手机端口（8737）新增免配对路由 `GET /apk/meta`（`/apk/info` 同义），返回随包 APK 的 `versionName` / `versionCode` / `size` / `md5` / `builtAt`，供手机端「检查更新」使用。此前该接口只挂在回环控制 API（GUI 端口 `/dsh-phone/api/apk/meta`），手机够不着。

## 插件 0.4.4 — 2026-10-22

### 变更

- **移除面板里的 APK 下载卡**：设置面板不再显示「APK / 下载手机 APK / 直连地址 / 版本 md5」这一块。APK 改为随 GitHub Releases 分发，不再把手机包的分发绑在「电脑开着、手机在同一网络」这个前提上。
- 「怎么连」第 2 步文案改为「从项目 Releases 下载，或电脑直接把包发给手机」。
- 服务端 GET /apk、GET /apk/meta 路由保留（手机浏览器与脚本仍可用），只是面板不再链接它们；/status 的 apkMeta 字段保留，「关于」卡仍显示随包 APK 版本。
## 插件 0.4.3 — 2026-10-22

### 新增

- **面板内 Tailscale 引导**：设置面板新增「外网接入（可选 · Tailscale）」卡片，解释它解决什么问题（手机不在同一 WiFi 时连回本机、100.x 私有地址、WireGuard 端到端加密、不用开路由器端口也不把 8737 暴露公网、免费个人版 100 台设备）。
- 卡片按机器状态显示三种徽章并给对应动作：**未安装**（给出电脑版 / 手机版下载按钮与三步流程）、**已安装 · 未生效**（提示 bind 加 tailscale 并重启）、**已就绪**（提示直接复制那行地址）。
- 已安装时自动隐藏三步流程；**已就绪**时仍保留「下载安卓版 / iOS」两个入口（电脑装了、手机还没装的情况最常见）。未就绪时提示面板每 5 秒自动刷新。

### 变更

- docs/addresses.md 的 Tailscale 段落扩写为「要走外网 → 装 Tailscale」：补 iOS/Android 下载入口、三种面板徽章对照表、手机上需常驻的注意事项。
## 插件 0.4.2 — 2026-10-21

### 变更

- **开箱即用**：默认配置改为 `bind: loopback,lan,tailscale` —— 没装 Tailscale 的新用户，手机连同一个 WiFi 就能连上；`tailscale` 解析为空时自动跳过。
- 面板地址区新增「怎么选」卡片：同一 WiFi → 局域网 / 异地 → Tailscale / 自测 → 127.0.0.1；没有 Tailscale 网卡时补一句说明，不让用户以为装坏了。
- 局域网那行未监听时，直接给出 `bind: lan,loopback` 的改法与「重启宿主」提示。
- 文档同步：install 增加「先选接入方式」、addresses 增加「从没用过 Tailscale？」（同一 WiFi / 手机热点 / 内网穿透三条替代路）、configure 更新默认值与安全说明。

## APK 0.5.5 — 2026-10-21

### 变更

- 配对页提示改为「手机和电脑连同一个 WiFi 就能用，不用装 Tailscale」，并指明配对码在面板「手机远程」里。

## 插件 0.4.1 — 2026-10-21

### 变更

- 「关于 / 更新」卡新增两行：**二次开发**（指向 `docs/architecture.md` 的模块划分与 6 类扩展点、`docs/api.md` 的完整协议）与**贡献 / 安全**（`CONTRIBUTING.md`、`SECURITY.md`）。
- 面板「怎么连」第 2 步文案修正为 `dsh-phone.apk`，并指明从 APK 卡下载。

## 插件 0.4.0 — 2026-10-21

### 新增

- **地址分类与标注**：`/status` 的 `lan[]` 每项新增 `kind`（`tailscale / lan / virtual / other / loopback`）与 `listening`；面板按「类型胶囊 + 推荐 + 未监听」渲染，并给出场景说明与补救提示。
- **APK 元数据**：`/status.apkMeta` 与 `GET /dsh-phone/api/apk/meta`，返回 `versionName / versionCode / size / md5 / builtAt`（按 `mtime+size` 缓存，不每次算 md5）；版本号读 `assets/dsh-phone.apk.json` 旁车文件。
- **关于 / 更新卡片**：面板显示插件版本、随包 APK 版本、仓库地址、许可证、文档入口与三条更新说明。
- **开源准备**：`plugin/docs/` 六篇文档 + 设计笔记、根 README、CHANGELOG、CONTRIBUTING、SECURITY、`.gitignore`、CI（`.github/workflows/verify.yml`）、`npm run verify` 守门脚本。
- `package.json`：补 `repository / homepage / bugs / keywords / engines / scripts`，`files` 纳入 `docs/` 与 `scripts/`，`private: false`。

### 变更

- 面板「手机里填这个地址」由平铺列表改为**按可用性排序**（监听优先，Tailscale > 局域网 > 虚拟网卡 > 其他），并把最优的一条用于「APK 下载地址」提示。
- 「已配对的手机」为空时的文案从「还没有手机配对过」保持不变，但地址区新增一行总说明：一行一种接入方式，别三条都试。

## 插件 0.3.5 — 2026-10-21

### 变更

- 随包 APK 更新到 0.5.4（工作区选择 chips、官方样式对齐、字体大小缩放）。
- 设置面板补齐「服务已启动 / 监听地址」状态行与启动失败原因展示。

## 插件 0.3.2 — 2026-10-21

### 安全

- 移除源码与 README 中的真实地址、令牌、主机名、工作区名等个人信息；配对页的常用地址改为由本机已保存主机生成，不再硬编码。
- 重新打包 `assets/dsh-phone.apk`（0.5.4，md5 `289d5a38e709ce3e277640e45e084541`）。

## 插件 0.3.1 — 2026-10-21

### 变更

- 包名从 `dsh-phone-harness` 改为 `dsh-phoneharness`（插件目录、cordis id、面板 section id、日志前缀一并改），使插件能以独立包装进任意 profile。
- 内置 `cordis.patch.yml`，安装即插入默认配置（端口 8737、`bind: loopback,tailscale`）。

## 插件 0.3.0 — 2026-10-20

### 新增

- 首个可用版本：配对码 + 设备令牌、会话列表/新建/改名/置顶/归档、SSE 流式时间线、审批转发、模型反问、图片上传与会话内图片、模型 catalog 与自定义通道、设置面板。

## APK 0.5.4 — 2026-10-21

### 新增

- 设置页工作区 chips（全部 / 各工作区），抽屉列表按工作区过滤。
- 字体大小（跟随系统 / 0.85–1.30 缩放）与外观（系统 / 浅色 / 深色）。

### 变更

- 以官方 DeepSeek App 为模板重做视觉：首页新对话、历史抽屉分组、多选、设置分组卡片、用户气泡 `#EDF3FE`、思考行纯文本 + 可展开、长按菜单锚定浮层。
- 「深度思考」改为「模型」选择、「智能搜索」改为「权限」三档（与桌面端一致）。

### 修复

- 归档箱条目混入主列表；归档后返回首页不刷新；Back 键从设置页直接退出。
