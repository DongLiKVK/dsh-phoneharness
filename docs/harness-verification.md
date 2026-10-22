# 用户主机 Harness —— 独立验收报告（verifier）

- 验收对象：契约 `docs/harness-contract.md` §6 六条验收（冻结契约 v1.3 → **v1.3.2 更正**：座位行从输入卡片内部挪到卡片正上方独立一行、整行靠左；§3.6 图标措辞改为「纯填充矢量、由 Theme 着色」）
  - **v1.3.3 追加验收**：座位分两处（工作区 + 预设 在输入卡片**上方横向带**；模型 + 权限 回**胶囊内 row**，顺序 模型 → 权限 → 弹簧 → 两枚 44dp 圆钮）；面板**打开即取数** + 失败态 `harness_loading` → `harness_load_error(原因)` → 可点 `harness_retry`；maxTextDp 定案 34 / 52 / 70 / 56；报告口径 **A/B 分离**（脚本证明代码能力 · probe 证明 profile 是否生效）。本轮结果 **PASS=34 / FAIL=0 / 未验证=6**（G1–G5 已由真机截图升 PASS，仅 C10 桩侧未验证）
- 验收人：verifier（独立于 plugin-dev / android-core / android-ui）
- 复跑方式：`node tools/verify-harness.mjs [--host-only|--no-build|--force] [--out shots/harness/verify-report.json]`
  - 退出码：有 **FAIL** 才为 1；NOT-READY / SKIP / 未验证 不影响退出码
  - 机器可读账本：`shots/harness/verify-report.json`（含每条原始响应）
  - 可直接抄进文档的表：`shots/harness/verify-table.md`
  - 抽原始片段：`node shots/harness/extract-evidence.mjs B1 C1 C8`
- 结论口径（五档）：**PASS** / **FAIL**（对端已实现但形状或行为不符，并记 owner）/ **NOT-READY**（对端尚未落盘）/ **SKIP**（按需跳过）/ **未验证**（需真机或人工，写明替代证据与局限）

## 本轮结论（全量：A/B/C/D/E/F + 连机段）

| 项 | 结果 |
| --- | --- |
| **汇总（脚本全量，本轮 v1.3.3 复验）** | **PASS=34 · FAIL=0 · NOT-READY=0 · SKIP=0 · 未验证=6**（`cd android && VERSION_NAME=0.6.6 VERSION_CODE=22 node tools/verify-harness.mjs --out shots/harness/verify-report.json`，2026-10-22 05:32，exit 0） |
| 汇总（并入真机人工复核） | 脚本标「未验证」的 6 条里 **G1–G5 已由 0.6.6/22 真机截图人工核对升为 PASS**（§6.1 的 §6(4c) 小节）；**仅剩 C10 桩侧**保持未验证 |
| 本轮已 PASS | A1、B1–B6、C1–C9、C11、C12、D1（0.6.6 / code 22）、E1–E3（文案键 **27** 条）、F1–**F12**、G1–G5 |
| 本轮未验证 | **C10**（桩造不出「会拒绝写默认值的宿主」；替代证据 = `plugin/lib/server.js` 的 describe() 有 `default_unavailable → 409` 映射，且真机侧已有实测 409 原始响应 `shots/harness/switch-rollback-409.http`）；另「手机端真机取到**真实**名册」按 **环境未就绪** 记（本机真宿主为 03:57 旧进程，`GET /v1/harness → 404`，见 §6.1 第 9 条） |
| FAIL | 无（v1.3.2 复验期曾出现的 F2/F3/F4/F5 经查证全是**验收脚本自身的假阴性**，已修脚本并重跑，见「归因更正 ②」） |
| 上一轮（v1.3.2 复验）存档 | PASS=31 · 未验证=6（`VERSION_CODE=20 VERSION_NAME=0.6.4`，2026-10-22 04:37）—— 数字已被本轮 34 PASS 取代，结论沿用 |

> **归因更正 ①**：2026-10-22 04:0x 用「未注入 harness 的桩」跑出的 8 条 FAIL 归因有误。那批原始响应清一色是
> `{"status":503,"body":{"error":{"code":"config_unavailable","message":"这台电脑上的 harness 配置通道没有起来"}}}`，
> 成因是验收桩没有把 `HarnessConfig` 传进 `PhoneServer`（`plugin/lib/server.js:383` 的 `!this.harness` 分支），
> **属于验收脚本自身的缺陷，不是 plugin-dev 的缺陷**。本版桩已按 `plugin/index.js:231`（`new HarnessConfig(ctx, { runtime, readDefaults, writeDefaults })`）
> 与 `plugin/index.js:274`（`harness: harnessConfig`）的线上接法注入（脚本 `:373-376` 与 `:392-394`），归因以本版结果为准。该结论同时写在报告 JSON 的 `notes` 字段里。
>
> **归因更正 ②（F2/F3/F4/F5）**：首轮全量的这 4 条 FAIL 同样是脚本缺陷，逐条查证如下（都不算 android-ui / android-core 的缺陷）：
> - F2：脚本 grep `R.drawable.ic_folder` 落空 → 真实实现走契约 §2 冻结的 `Harness.workspaceIcon()` / `Harness.presetIcon()`（`Harness.java:289/293`），顺序实测正确（`MainActivity.java:482` 工作区 → `:498` 预设 → `:515` 模型 → `:531` 权限）。已改为**图标双路**匹配。
> - F3：脚本要求签名逐字等于契约措辞，实际是 `public static void showWorkspacePanel(final Activity host, final Theme t, final Prefs prefs, final View anchor, final Runnable onChanged)`（`Seats.java:1462`，`showPresetPanel` 在 `:1481`）—— **语义一致**，只多了 `public/final` 与参数名差异。已按语义放宽。
> - F4：脚本用了裸词 `harness` / `workspaceChip`，命中的是**历史遗留**硬编码中文（`PhoneHarness 手机端…` 服务说明文本、既有工作区筛选方法 `workspaceChip("全部", …)`）。已改为**逐文件 harness 专属 token**，并把区域外的 184 处历史遗留单列（不计 FAIL）。
> - F5：脚本要求 `strokeWidth` + `#FF000000`，而实现是 `#FFFFFFFF` 填充矢量（与既有 `ic_folder.xml` / `ic_enhance.xml` 同款）。契约 §3.6 的措辞与它自己引用的「同 `ic_data/ic_enhance` 风格」前提互相矛盾（`ic_enhance` 本身也是纯填充）→ 已按意图判 PASS，并把措辞偏差回报 lead（见「verifier 备注 5」）。

> **本轮验收范围口径**：**真 `PhoneServer` + 真 harness 路由 + 真 `HarnessConfig` + 桩 ctx**。
> 本机 DSH 正在跑我们自己的会话，装真 profile 需要重启宿主、会掐掉当前工作，所以**不做真 profile 装机**；
> 宿主侧能力差异（`configEditor` 可用/不可用）用桩 ctx 的两种形态覆盖（C8/C9/C12）。

> **交叉核对**：plugin-dev 自己的桩 `plugin/scratch/stub-harness.mjs`（`cd plugin && node scratch/stub-harness.mjs`）实跑 **31/31 OK，exit 0**；
> 本报告桩与它在 B1/B4/C1–C5/C9 上**逐字段一致**（含中文 `message` 原文，例如「这台机器上没有「no-such-preset-xyz」这个模式」「工作区已切换为 docs（已生效（本次运行））」）。
> 两套独立桩 + 真实现三者一致，即「实现形状 ↔ 契约形状」对上的证据。

> **并发写入者**：仓库存在另一条无关工作线的写入者（04:09–04:11 把 `plugin/package.json` 升到 0.5.2、`plugin/index.js` `VERSION='0.5.2'`、`AndroidManifest.xml` 改成 `versionCode=19/versionName=0.6.3`，属抽屉账号栏 / `GET /v1/me` 那条线）。
> 发布线按 lead 口径取 **插件 0.5.3 / APK 0.6.4（code 20）**；构建一律显式覆盖 `VERSION_CODE=20 VERSION_NAME=0.6.4`，撞号不计入本功能缺陷。

---

## §6(1) 语法：`cd plugin && node --check lib/harness.js lib/server.js index.js`

- 操作：`cd plugin && node --check lib/harness.js lib/server.js index.js`
- 原始输出：`exit=0`（无输出）
- 结论：**PASS**（用例 `A1`）
- 证据：`shots/harness/verify-report.json` → `results[A1].evidence`

## §6(2) 桩服务器上的协议成功路径与失败路径

桩：`tools/verify-harness.mjs` 内联 `startStubServer()`（真 `PhoneServer` + 真 `HarnessRuntime` + 真 `HarnessConfig`；假 ctx 提供 `llm / agentDefaultModel / agentPresets / workspaceRegistry / permissionPresets / settings / configEditor / profileContext`；
`withEditor=false` 即「只读宿主」：`configEditor`、`settings`、`agentDefaultModel` 三条写通道全部拿掉）。
固定令牌 `devtoken`，`Authorization: Bearer devtoken`。

成功路径：

| 用例 | 操作 | 原始响应关键片段 | 结论 |
| --- | --- | --- | --- |
| B1 | `GET /v1/harness` | 200，`presets[0]={id:"standard",title:"标准模式",description:"处理代码、文件和资料，适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。",current:true,usable:true,builtin:true}`；四条内置预设标题/描述与桌面参考逐字一致；`current` 恰好 1 条；`usable=false` 的 `broken-preset` 保留在列表里并带 `reason` | **PASS** |
| B2 | `GET /v1/harness/dirs?path=<真实目录>` | 200，`{cwd,parent,roots:[{name:"C:",path:"C:\\"},{name:"D:",path:"D:\\"}],entries:[{name,path,dir:true,hidden:false}],showHidden:false}`，entries 只含目录 | **PASS** |
| B3 | `GET /v1/harness/dirs`（省略 path） | 200，`cwd="<PROJECT_ROOT>"`（当前默认工作区），`parent="<HOME>\\Documents\\task"` | **PASS** |
| B4 | `POST /v1/harness/config {"agentPreset":"ptc"}` | 200，`{"ok":true,"applied":{"agentPreset":"ptc"},"message":"已切换为 PTC 模式","persisted":true,"harness":{...}}`，`harness` 内 `ptc.current=true`、`standard.current=false`（无需二次 GET） | **PASS** |
| B5 | `POST /v1/harness/config {"workspace":"...\\phone-harness\\docs"}` | 200，`applied.workspace` 回真实路径，`harness.workspaces` 里该条 `current=true` | **PASS** |
| B6 | `GET /v1/harness` 不带令牌 | 401 `unauthorized`「请先在手机上配对」（沿用既有鉴权路径） | **PASS** |

失败路径（错误体形状一律 `{error:{code,message}}`）：

| 用例 | 请求 | 原始响应 | 结论 |
| --- | --- | --- | --- |
| C1 | `{"workspace":"...\\no-such-dir-xyz-12345"}` | 400 `bad_workspace`「这个工作区在本机不存在：…」 | **PASS** |
| C2 | `{"agentPreset":"no-such-preset-xyz"}` | 400 `unknown_preset`「这台机器上没有「no-such-preset-xyz」这个模式」 | **PASS** |
| C3 | `{"model":"no-such-provider/no-such-model"}` | 400 `unknown_model`「这台机器上没有「no-such-provider/no-such-model」这个模型」 | **PASS** |
| C4 | `{"permission":"no-such-permission"}` | 400 `unknown_permission`「这台机器上没有「no-such-permission」这个权限模式」 | **PASS** |
| C5 | `{}`（无有效字段） | 400 `bad_request`「至少要给一项：agentPreset、workspace、permission、model」 | **PASS** |
| C6 | `GET /v1/harness/dirs?path=<不存在>` | 404 `not_found`「这个目录不存在：…」 | **PASS** |
| C7 | `GET /v1/harness/dirs?path=...\\docs\\harness-contract.md`（文件） | 400 `bad_path`「这不是目录：…」 | **PASS** |

证据：`shots/harness/verify-report.json` → `results[B1..B6]`、`results[C1..C7]`（每条都存了完整原始响应 JSON）。

## §6(3) 构建与资源进包

| 用例 | 操作 | 原始输出关键片段 | 结论 |
| --- | --- | --- | --- |
| D1 | `cd android && VERSION_CODE=20 VERSION_NAME=0.6.4 bash build.sh` | `exit=0`；尾部 `[8/8] 写旁车元数据` / `versionName 0.6.4 (code 20), 864542 bytes, md5 8b45f65d…` / `已同步到 ../plugin/assets/` / `OK -> .../android/bin/dsh-phone.apk`；`版本覆盖: VERSION_NAME=0.6.4 VERSION_CODE=20`；APK mtime `2026-10-21T20:37:44.922Z`，sha256 `5d6d04c6f4cadf83b854d86916f71616bc76a3e4c8cca11ac5d118b55c85b720` | **PASS** |
| D1 复核 | `aapt2 dump badging android/bin/dsh-phone.apk` | `package: name='com.lc.phoneharness' versionCode='20' versionName='0.6.4'`、`minSdkVersion:'21'`、`targetSdkVersion:'34'` | **PASS** |
| E1 | `aapt2 dump resources android/bin/dsh-phone.apk \| grep ic_preset` | 命中 2 处：`resource 0x7f030036 drawable/ic_preset`、`() (file) res/drawable/ic_preset.xml type=XML` | **PASS** |
| E2 | `aapt2 dump strings/resources` 对照契约 §4 的 24 条键 | 命中 **24 / 24**，缺失：无 | **PASS** |
| E3 | `android/bin/dsh-phone.apk.json` 旁车元数据 | `{"versionName":"0.6.4","versionCode":20,"size":864542,"md5":"8b45f65d98501f8bbc78fce34051b258","builtAt":"2026-10-21T20:37:45Z"}`（与 `android/bin/dsh-phone.apk` 同 864542 B） | **PASS** |

- 证据：`shots/harness/verify-report.json` → `results[D1]`、`results[E1..E3]`（每条含完整命令与原始输出）。
- **并发构建重叠说明（按 lead 口径记录）**：本轮 D 段与 android-core / android-ui 的构建窗口重叠过，同一个 864542 bytes 的 APK 先后出现 `74b6ec76…`（我 04:19:00 那次）、`0e6234b5…`（04:19:20，别人重建）、`4881af1e…`（我 04:19:56 最后一次）三个 md5 —— **md5 每次构建都不同（zip 内嵌构建时间戳），size 相同即源码相同**。因此判定口径取**内容级**：`versionName/versionCode` + 资源表命中 + 旁车 json 与产物一致；报告的最终产物证据 = 最后一次全量跑（04:37）产出的 `8b45f65d98501f8bbc78fce34051b258`（864542 bytes，`2026-10-21T20:37:45Z`，sha256 `5d6d04c6f4cadf83b854d86916f71616bc76a3e4c8cca11ac5d118b55c85b720`）。另：android-ui 交付构建自身 md5 = `a9448859ddc4e70c322b30ea8ae046f2`（同 0.6.4/20、同 864542 B）—— 与我的构建 md5 亦不同，进一步佐证 md5 不可跨构建比对。若之后有人再做 0.6.4/20 构建，md5 会再变而判定不变。

## §6(4) 界面证据

### (4a) 静态核对（脚本 F 段，源码级，全部 PASS）

| 用例 | 检查 | 关键证据 | 结论 |
| --- | --- | --- | --- |
| F1 | `strings.xml` 24 条 `harness_*` 键值逐字一致 | `harness_* 键数量: 24` / 缺失: 无 / 文案不符: 无 | **PASS** |
| F2 | 首页座位行顺序 = 工作区 → 预设 → 模型 → 权限（4 枚均按既有 `seatChip` 构造）**+ v1.3.2 版面** | 行号：工作区 `MainActivity.java:483`（`seatChip(Harness.workspaceIcon(), 64, …)`）、预设 `:499`（`seatChip(Harness.presetIcon(), 48, …)`）、模型 `:516`（`seatChip(R.drawable.ic_data, 70, …)`）、权限 `:532`（`seatChip(Seats.permIcon(Seats.permission(prefs)), 56, …)`）；顺序正确=true；**v1.3.2 版面**：`wrap.addView(chipScroll)=583` 在 `wrap.addView(card)=585` 之前、`row.addView(chipScroll)=无（正确）`、座位行在卡片上方=true、卡片内仍是「弹簧+两枚 44dp 圆钮」=true（弹簧 `MainActivity.java:549`、两枚圆钮 `:560/:574`）；`showWorkspacePanel/showPresetPanel` 入口存在 | **PASS**（v1.3.2 版面复核通过） |
| F3 | `Seats.java` 两个面板方法签名 + 关键交互齐备 | `Seats.java:1462 showWorkspacePanel` / `:1481 showPresetPanel`；`fillWorkspace`(1500) / `fillDirBrowser`(1555) / `fillPreset`(1678) / `Sheet`(2019) / `Sheet.refill()`(2155)；`R.string.harness_*` 引用 18 处；缺失: 无 | **PASS** |
| F4 | harness 相关代码无硬编码中文（中文一律走 `R.string.harness_*`） | harness 区域 0 处；区域外 184 处均为历史遗留（早于本轮，不计 FAIL） | **PASS** |
| F5 | `ic_preset.xml` 24dp 可着色矢量、与既有图标同族 | `vector=true width24dp=true height24dp=true 含 path=true 颜色字面量=#FFFFFFFF`；字面 `strokeWidth+#FF000000=false`（措辞偏差见备注 5） | **PASS**（意图） |
| F6 | 设置页：4 行只读当前值 + capabilities 摘要 + `writeConfig=false` 只读警告 | 缺失: 无（`SettingsActivity.java:274/1045/1052` 等） | **PASS** |
| F7 | 会话页预设标签只读、不提供切换控件 | `含预设标签=true / 含切换面板(不应有)=false`（另需人工核对 12sp、次要色圆角、≤180dp 省略） | **PASS** |
| F8 | 新建会话页：工作区 chip + 预设 chip + 建会话带 `agentPreset` | 缺失: 无（`NewSessionActivity.java:106/121`） | **PASS** |
| F9 | 会话页同构版面（v1.3.2：chip 行也在输入卡片上方） | `wrap.addView(chipScroll)=ChatActivity.java:522` 在 `wrap.addView(card)=:524` 之前、`row.addView(chipScroll)=无（正确）`、`chipsRow` 含 `modelChip`(:457)/`permChip`(:476)、卡片内只剩弹簧（`:478`）+ 两枚 44dp 圆钮（`:481/:496`） | **PASS** |

### (4c) v1.3.2 版面复核（用户反馈：座位行移到输入框上方一行、整行靠左）

- 依据：契约更正 v1.3.2 —— 座位行从输入卡片内部挪出来，作为卡片正上方独立一行（wrap 子 view 顺序 = attachStrip → 座位行 → 输入卡片）。
- 复核命令：`cd <PROJECT_ROOT> && VERSION_CODE=20 VERSION_NAME=0.6.4 node tools/verify-harness.mjs --no-build --out shots/harness/tmp-f.json`（只重跑 A/B/C/F，D/E 段因 `--no-build` SKIP）。
- 本节那一次结果：**PASS=27 · FAIL=0 · NOT-READY=0 · SKIP=2（D0/E0）· 未验证=6（C10 + G1–G5）**；F1–F9 全 PASS。
- 之后含 D/E 的最终全量（04:37）结果：**PASS=31 · FAIL=0 · NOT-READY=0 · SKIP=0 · 未验证=6**（D1/E1–E3 亦 PASS，见 §6(3) 与顶部汇总表）。
- 判据（F2/F9 的正判据，均为源码级静态核对）：
  1. `wrap.addView(chipScroll` 出现在 `wrap.addView(card` **之前**；
  2. `row.addView(chipScroll` **不存在**（座位行已挪出卡片）；
  3. 卡片那一行只剩弹簧 `LinearLayout.LayoutParams(0, 1, 1f)` 与两枚 `t.dp(44), t.dp(44)` 圆钮。
- 实测：MainActivity `:583` chipScroll → `:585` card，弹簧 `:549`，圆钮 `:560/:574`；ChatActivity `:522` chipScroll → `:524` card，弹簧 `:478`，圆钮 `:481/:496`。
- 局限与后续：本节仅为**源码级**版面核对。真机侧已由 android-ui 于 04:30 重拍 `home-chips.png`（新版式、四枚 pill 全可见、`标准模式` 完整显示）→ 已在 §6(4b) 判 **G1 PASS**；04:27 那张（预设文案被截）与 04:19:46 那张（旧版式）均已作废。

### (4b) 真机截图（提供方 = android-ui；真机 ZTE A2322，已配对到本机桩主机）

| 用例 | 截图（时间 / 字节 / SHA-256 前 12 位） | 我（verifier）的人工核对结论 | 判定 |
| --- | --- | --- | --- |
| G1 | `shots/harness/home-chips.png`（04:30 / 97040 B / `368d87f7c956`） | 座位行**独立一行、位于输入卡片正上方、整行靠左**；四枚 pill 从左到右 `pho…`(文件夹) → **`标准模式`（完整显示）** → `De…`(模型) → `仅可…`(盾牌)，各带 chevron，**未换行、未被圆钮挤压、右缘有余量**；输入卡片内右下角仍是两枚 44dp 圆钮（⊕ / 语音）；文案全中文 | **PASS（G1）** |
| G1 观感（已改善，记录用） | 同上 | 契约 §3.1（v1.3.2 实测回填）maxTextDp = 工作区 34 / 预设 52 / 模型 30 / 权限 46；本轮 `标准模式` 已完整显示（04:27 那张曾被截成 `标准…`，本轮已修）。工作区 `pho…`、模型 `De…`、权限 `仅可…` 属窄屏取舍 | **备注（非 FAIL）** |
| G1（旧图，存档） | `home-chips.png` 04:19:46 版 / 04:27 版（均已被 04:30 版覆盖） | 04:19:46 版 = v1.3.2 之前的版式（座位行仍在输入卡片内）；04:27 版 = 新版面但预设文案被截 | **作废** |
| G2 前半 | `shots/harness/workspace-panel.png`（04:32 / 144436 B / `22e9af12aa46`） | 面板标题 `选择工作区`；`最近工作区` 下列 `phone-harness`（当前项 `✓`，副标题为省略的完整 cwd `<HOME>/Doc…ents/task/phone-harness`）、`user-chat-v4`、`default-workspace`；下方 `浏览主机目录`、`手动输入路径` 入口均在；长路径省略号未撑破面板 | **PASS（G2 前半）** |
| G2 后半 | `workspace-browse-a.png`（04:32 / 129768 B / `064eee5c4b7a`）+ `workspace-browse.png`（04:32 / 113767 B / `5dd298c051e9`） | a：标题 `浏览主机目录`，面包屑 `Users > <user> > Documents > task > phone-harness`，`上级目录 <HOME>/Documents/task`，目录行 `android` `docs` `plugin` `shots` `tools`，底部 `使用此目录` + `手动输入路径`；b：点「上级目录」后面包屑 → `C: > Users > <user> > Documents > task`、`上级目录 <HOME>/Documents`、子项出现 `phone-harness` ⇒ **往返成立、面包屑随行更新** | **PASS（G2 后半，往返已验证）** |
| G3 | `shots/harness/preset-panel.png`（04:35 / 287892 B / `e3d31f20e61b`） | 标题 `Agent 预设`；说明行 `选择 Agent 的工具和工作方式。日常任务用「标准模式」，扩展 DSH 的能力用「创造模式」。` **逐字**；`内置`：`标准模式`（当前蓝色 + 徽章 `新任务默认` + 描述逐字 `处理代码、文件和资料，适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。`）、`PTC 模式`（描述逐字）、`极简模式`（**整项置灰 + 徽章 `加载失败` + 描述后追加 reason `主机上没有安装这个预设。`**）、`创造模式`（描述逐字）；`自定义`：`评审模式` + `暂无描述。` ⇒ 四项中文名/描述与桌面参考 §1 逐字一致 | **PASS（G3，含 `usable=false` 置灰的界面证据）** |
| G4 | `switch-rollback.png`（04:32 / 127423 B / `10379f43a60a`）+ `switch-rollback-after.png`（04:32 / 98976 B / `41e86c7638e4`） | 前：Toast `无法切换到「PTC 模式」：标准模式不可用，请恢复该模式或选择…`（= `harness_switch_refused` + 主机中文 detail）；后：Toast 消失，chip 文案已回滚为 `标准模式`。触发链：点 PTC → `POST /v1/harness/config {agentPreset:"ptc"}` → 409 `default_unavailable` → chip 回滚 ⇒ **乐观更新失败回滚成立** | **PASS（G4，回滚已验证）** |
| G5 前半 | `shots/harness/settings-harness.png`（04:35 / 143058 B / `0c15fda7d32e`） | 标题 `用户主机的 Harness`；四行只读 = 工作区 `phone-harness`（副标题省略的完整 cwd）/ Agent 预设 `标准模式`（副标题 = 描述首行）/ 模型 `deepseek-account/dee…` / 权限 `工作区内修改`；`刷新` 一行；底部 `主机 http://<LAN_IP>:8799` + `writeConfig on · listDirs on · configEditor on`（该宿主可写 ⇒ **不出现**只读警告条，符合 §3.4） | **PASS（G5 前半）** |
| G5 后半 | `shots/harness/chat-preset-tag.png`（04:34 / 107369 B / `881fb2430da4`） | 会话页标题 `截图会话` 旁只读标签 `标准模式`：灰底圆角、无 chevron、无点击控件；底部 composer 只有模型 chip `DeepSeek…` 与权限 chip `仅可查看`（会话页**不提供**预设/工作区切换，符合 §3.5 只读决定） | **PASS（G5 后半，只读标签已验证）** |

- **我的局限（诚实声明）**：本机 `adb` 不在 PATH，我**没有**真机通道，无法独立复现 android-ui 的真机动作（配对、`adb reverse`、点击序列）。
  因此真机证据由 **android-ui 提供截图**，我做的核对是：截图是否与契约 §3.1/§3.2/§3.4/§3.5 的文字要求逐条对得上（文案、顺序、入口、只读），而**不能**证明截图操作序列本身。
  每条截图的提供方与时间戳已记在本表；后台账 `results[G*]` 保留了脚本在无设备时的判定与替代证据。
- 静态结论（脚本在我这边独立跑的，不依赖截图）：四枚 chip 顺序、`seatChip` 参数、两枚圆钮位置、面板方法签名、只读标签无 click 监听 —— 见 (4a) 的 F2/F3/F7/F8。

## §6(5) 反例

| 反例 | 操作 | 原始响应 | 结论 |
| --- | --- | --- | --- |
| `capabilities.writeConfig=false` | 只读宿主（无 `configEditor`/`settings`/`agentDefaultModel`）`GET /v1/harness` | 200，`capabilities={"writeConfig":false,"listDirs":true,"configEditor":false}`，`failures` 列出 configEditor/settings/model/workspace 四条原因 | **PASS**（C8；§3.4 只读警告条的前提成立；设置页警告条的静态证据见 F6） |
| 只读宿主切预设 | `POST {"agentPreset":"ptc"}` | 503 `config_unavailable`「这台机器上没有可写的 Agent 预设配置（agent-preset-registry 未加载）」 | **PASS**（C9） |
| 只读宿主切工作区 | `POST {"workspace":"...\\docs"}` | 200，`persisted:false`，`message:"工作区已切换为 docs（已生效（本次运行））"` | **PASS**（C12，手机端提示「本次运行生效」的依据） |
| `presets[].usable=false` 项保留且置灰不可点 | 桩的 `broken-preset`（协议侧）+ 真机 `preset-panel.png`（界面侧） | 协议：`{"id":"broken-preset","title":"坏掉的预设","usable":false,"builtin":false,"reason":"加载失败"}`；界面：`极简模式` 整项置灰、右侧徽章 `加载失败`、描述后追加 reason `主机上没有安装这个预设。`，当前项 `标准模式` 的蓝色/勾选状态不受影响 | **PASS**（C11 + G3 截图） |
| 宿主拒绝写默认值 → 409 | 桩侧：无法构造该宿主；真机侧：android-ui 在 ZTE A2322 上点 `PTC 模式` 触发 | 真机原始响应（`shots/harness/switch-rollback-409.http`，195 B，sha256 `73b98df65b093f5e37a9f5eac2eb56dd8787de6a9447f82d529deb38a8257a85`）：`HTTP/1.1 409 Conflict` / `Content-Type: application/json; charset=utf-8` / `{"error":{"code":"default_unavailable","message":"标准模式不可用，请恢复该模式或选择其他可用模式。"}}` | **桩侧未验证 · 真机侧 PASS**（C10 桩口径不硬判；真机已实测 409 + 中文 message） |
| C10′ 409 的端到端链路 | 真机：点 `PTC 模式` → `POST /v1/harness/config {"agentPreset":"ptc"}` → 409 → chip 回滚 + Toast | Toast `无法切换到「PTC 模式」：标准模式不可用，请恢复该模式或选择…`；`switch-rollback-after.png` 里 chip 已回滚为 `标准模式`；终态坐标 dump `phone-harness@162,1986 / 标准模式@414,1986 / DeepSeek-V4.1-Flash@660,1986 / 仅可查看@903,1986` | **PASS**（G4/C10′；真机证据由 android-ui 提供，我核对截图与 `.http` 原文） |
| POST 失败时 chip 回滚 | 真机：`switch-rollback.png`（Toast 态）+ `switch-rollback-after.png`（稳态） | 前：Toast `无法切换到「PTC 模式」：标准模式不可用，请恢复该模式或选择…`（= `harness_switch_refused` + 主机中文 detail）；后：Toast 消失、chip 文案已回到 `标准模式` | **PASS**（G4；截图 sha256 `10379f43a60a…` / `41e86c7638e4…`；静态替代证据 F3 亦命中） |

## §6(6) 报告本体

- 结论：**本文件即报告**；每条 = 命令/操作 + 原始输出片段或截图路径 + 结论（PASS/FAIL/未验证+原因）
- 附原始账本（v1.3.3 本轮）：`shots/harness/verify-report.json`（40041 B，全量原始响应 + tally `{PASS:34, FAIL:0, NOT-READY:0, SKIP:0, 未验证:6}`）、`shots/harness/verify-table.md`（结论表 = 34 PASS + 6 未验证，与 tally 一致）；上一轮 v1.3.2 的 31 PASS 数字见本行历史
- 截图目录：`shots/harness/`；真机图 9 张（提供方 = android-ui，真机 ZTE A2322，装配交付构建 0.6.4 / code 20）：`home-chips.png`、`workspace-panel.png`、`workspace-browse-a.png`、`workspace-browse.png`、`preset-panel.png`、`switch-rollback.png`、`switch-rollback-after.png`、`settings-harness.png`、`chat-preset-tag.png`；另附原始 HTTP 记录 `switch-rollback-409.http`。逐张核对（时间 / 字节 / SHA-256 / 结论）见 §6(4b)；**v1.3.3 新一批 5 张（首页版式 + 预设面板三态）见 §6.1 附节**。
- 截图 SHA-256 均由我（verifier）在本机用 `sha256sum` 独立计算，可与重拍版本区分。
- **本轮验收范围口径**：**真 `PhoneServer` + 真 harness 路由 + 真 `HarnessConfig` + 桩 ctx**（本机 DSH 正在跑我们自己的会话，不往真 profile 写配置，以免重启宿主掐掉当前工作）。
- **局限**：本机 `adb` 不在 PATH，我没有真机通道 → §6(4b) 的 9 张截图与 `switch-rollback-409.http` 由 android-ui 提供；我做的是「逐张与契约文字要求对照 + 独立校验 SHA-256」，**未**独立复现该真机操作序列。

---

## §6.1 v1.3.3 追加验收（第 7 / 8 / 9 条）

- 契约位置：`docs/harness-contract.md:295-304`（§6.1 三条）；§3.1 冻结口径在 `:173-191`（`:181` = maxTextDp 定案，`:230` = ic_preset 风格）。
- 复验命令（全量，含 D 段构建）：
  `cd <PROJECT_ROOT> && VERSION_NAME=0.6.6 VERSION_CODE=22 node tools/verify-harness.mjs --out shots/harness/verify-report.json`
- 结果：**PASS=34 · FAIL=0 · NOT-READY=0 · SKIP=0 · 未验证=6**（exit 0；generatedAt `2026-10-21T21:32:39.856Z`；机器可读账本 `shots/harness/verify-report.json`，结论表 `shots/harness/verify-table.md`）。
- 本轮新增/改写的断言：**F2**（v1.3.3 两处座位 + maxTextDp 逐值）、**F9**（ChatActivity 撤带）、**F10**（面板打开即取数 + 失败态）、**F11**（`Harness.lastError` 接线）、**F12**（五张新截图逐张 md5）；E 段文案键由 24 升到 **27**。

### 第 7 条　静态界面断言（源码级，全部贴行号）

| 断言 | 实测（文件:行号；原始输出见 `shots/harness/verify-report.json` 的 `results[F2]` / `results[F9]` / `results[F10]` / `results[F11]`.evidence） | 结论 |
| --- | --- | --- |
| 工作区 + 预设 在输入卡片**上方那一行**（横向带） | `MainActivity.java:474` `HorizontalScrollView chipScroll`；`:481` `chipScroll.addView(chipsRow, …)`；`:587` `wrap.addView(chipScroll, chipLp)` → `:589` `wrap.addView(card)`（chipScroll 在 card **之前**） | PASS |
| 带内只有两枚、顺序 工作区 → 预设 | `chipsRow.addView` 共 **2** 处：`:498` `chipsRow.addView(wsChip)` → `:514` `chipsRow.addView(presetChip, seatLp(t))`；`:484` `wsChip = seatChip(Harness.workspaceIcon(), 34, …)`、`:500` `presetChip = seatChip(Harness.presetIcon(), 52, …)` | PASS |
| 模型 + 权限 回打字胶囊内；顺序 模型 → 权限 → 弹簧 → 两枚 44dp 圆钮 | `:517` `modelChip = seatChip(R.drawable.ic_data, 70, …)` → `:531` `row.addView(modelChip)` → `:533` `permChip = seatChip(Seats.permIcon(…), 56, …)` → `:550` `row.addView(permChip, permLp)` → `:553` `row.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f))`（弹簧）→ `:566` 上传 / 语音两枚 `t.dp(44), t.dp(44)` 圆钮 | PASS |
| `row.addView(chipScroll` **不存在**（旧版式残留检查） | 命中 **0** 处 ⇒ 旧「整条带塞进胶囊」写法已清除 | PASS |
| 权限 chip 与模型 chip 间距 `t.dp(8)` | `:549` `permLp.leftMargin = t.dp(8)` | PASS |
| maxTextDp 与契约 §3.1 `:181` 定案逐值一致 | 实测 工作区 **34**（`:484`）/ 预设 **52**（`:500`）/ 模型 **70**（`:517`）/ 权限 **56**（`:533`）；契约定案同值 ⇒「四枚全部一致 = true」 | PASS |
| ChatActivity 不再有整条 chipScroll band | `grep -c chipScroll ChatActivity.java` = **0**；`:432` 模型 chip(70) → `:446` `row.addView(modelChip)` → `:448` 权限 chip(56) → `:465` `row.addView(permChip, permLp)`（`:464` `leftMargin = t.dp(8)`）→ `:467` 弹簧 → `:470/:482` 上传圆钮、`:485/:506` 语音圆钮 → `:508` `wrap.addView(card)` | PASS |
| `Seats.java` 面板**打开即取数**（无条件） | `:1462` `showWorkspacePanel` → `:1467 fillWorkspace(sheet)` → `:1468 sheet.show()` → `:1469 refreshPanel(sheet)`；`:1473` `showPresetPanel` → `:1476 fillPreset(sheet)` → `:1478 refreshPanel(sheet)`；`:1485 private static void refreshPanel(final Sheet sheet)` → `:1486` `Harness.refresh(sheet.host, sheet.prefs, new Runnable(){…})`（回调内 `sheet.refill(); sheet.resize();` + `onChanged.run()`）；反判据「仅 `state==null` 才取数」命中 **false** | PASS |
| 面板失败态：loading → 错误文案（含原因）→ 可点「重新加载」 | `:1515 R.string.harness_loading` → `:1516 Harness.lastError()` → `:1520 R.string.harness_load_error(reason)` → `:1522 R.string.harness_retry`（`actionRow(ic_refresh, 重新加载, true, click → refill+resize+refreshPanel)`）；预设面板同构 `:1706 / :1707 / :1711 / :1713` | PASS |
| `Harness.lastError()` 接线完整 | `Harness.java:135 private static volatile String lastError`；`:137 clear()` 内含 `lastError = null`；`:143 public static String lastError()`；`:340 private static void setLastError(…)`；`:220 refresh(...)` 开头 `:226 lastError = null` 归零；`:319 reasonOf(Throwable)` | PASS |
| E 段文案键进包 | `android/res/values/strings.xml:262 harness_retry=重新加载` / `:263 harness_load_error=读不到主机的配置：%1$s` / `:264 harness_host_notes=主机提示` → `aapt2 dump resources/strings` 命中 **27 / 27**（缺失：无） | PASS |

> 说明：`MainActivity.java:334` 另有一处同型 `new LinearLayout.LayoutParams(0, 1, 1f)`（历史代码，不在 composer 内）。脚本改从「权限 `row.addView` 之后」起搜弹簧，避免误命中（首版曾因此假 FAIL，已修）。

### 第 8 条　预设读取（主机侧 + 失败态 + 环境侧）

| 面 | 证据 | 结论 |
| --- | --- | --- |
| 主机侧（真 `PhoneServer` + 真路由 + 真 `HarnessConfig` + 桩 ctx） | `GET /v1/harness → 200`；`presets` 名册 ≥4 条、`title` 全部非空、`current===true` 恰好 **1** 条；内置四项中文名/描述与桌面参考 §1 **逐字**一致（标准模式 / PTC 模式 / 极简模式 / 创造模式）；`usable=false` 的 `broken-preset` 保留并带 `reason`（原始响应见 `results[B1]`） | **PASS** |
| 失败态（android 侧桩 `stub-ui3.mjs` + 真机截图） | `preset-panel-503.png`：`正在读取主机配置…` + `读不到主机的配置：HTTP 503 config_unavailable: 主机暂时读不到 harness 配置，请稍后重试。` + 蓝色可点 `重新加载`；`preset-panel-host404.png`：`读不到主机的配置：HTTP 404 not_found: 没有这个接口：GET /v1/harness` + `重新加载`；`preset-panel-recovered.png`：点「重新加载」后名册恢复渲染（与 loaded 同） | **PASS** |
| 名册永不为空（四级兜底） | 队友证据（未重跑，仅引用）：`cd plugin && node scratch/stub-harness.mjs` → 退出码 0、断言 **51/51**（含预设名册四级取数兜底）；`android/scratch-core/out/parse-check.log`（RESULT pass=77 fail=0）与 `android/scratch-core/out/refresh-check.log`（RESULT(refresh): pass=20 fail=0，含 503 → `lastError` 逐字「HTTP 503 config_unavailable：这台电脑上的 harness 配置通道没有起来」、成功后归 null） | **PASS**（引用队友证据） |
| 环境侧（本机真宿主 profile 是否生效） | `node tools/probe-live-host.mjs`（只读）：endpoint `{name: <HOSTNAME>, port: 8737, pid: 37408, startedAt: 2026-10-21T19:57:36.602Z, device: <DEVICE> (Android 15), tokenHead: <TOKEN_HEAD>…}`；`GET /v1/harness → 404 {"error":{"code":"not_found","message":"没有这个接口：GET /v1/harness"}}`；`GET /v1/harness/dirs → 404` 同形；`GET /v1/me → 200`（`host.version=0.5.1`）；`GET /v1/catalog → 200` | **环境未就绪**：手机端真机「取到**真实**名册」按**未验证**记 —— 原因 = 跑着的宿主进程是 03:57 那份旧代码；唯一必要动作 = 重启宿主（见 `docs/harness-host-update.md`） |

### 第 9 条　报告口径（两段分离，禁止混算）

| 口径 | 能证明什么 | 本轮证据 |
| --- | --- | --- |
| **A. 脚本证明代码能力** | 验收脚本自己拉起**真 `PhoneServer` + 真 harness 路由 + 真 `HarnessConfig` + 桩 ctx** ⇒ 证明的是「实现方代码按契约 §1/§2/§3 的形状与错误码行为」，**不等于**本机正在运行的那份 profile 已升级 | A1、B1–B6、C1–C9、C11、C12、F1–F12、D1、E1–E3 |
| **B. probe 证明 profile 是否生效** | `tools/probe-live-host.mjs` 打真实端口 HTTP ⇒ 证明「本机跑着的**这份**宿主进程」有没有 harness 路由 | `GET /v1/harness → 404`（旧进程）⇒ **未生效**；故手机端「取到真实名册」= **未验证 / 环境未就绪** |

- 因此本轮**不**把「手机端真机取到真实名册」判 PASS：真机三态截图（loaded / 503 / host404）证明的是**面板在四类响应下都渲染正确**（成功态来自 android 侧桩的 `ok` 模式），不是「本机 profile 已升级」。
- 并发写入者：本仓库存在另一条无关工作线的写入者（CHANGELOG / `plugin/package.json` / `AndroidManifest.xml` / 设置页等），其改动记一行「并发写入者」、**不计我们团队缺陷**；判我们文件完好只看 harness 相关行 —— A1 `node --check lib/harness.js lib/server.js index.js` 全过 + 上文各源码行号存在。

### §6.1 附　v1.3.3 真机截图核对（提供方 = android-ui；真机 ZTE A2322 / Android 15；构建 0.6.6(code 22)）

| 文件（`shots/harness/`） | 字节 | md5（我用 `crypto` 在本机独立计算，与 lead 交付值逐张一致，见 `results[F12]`） | 我的人工核对结论 | 判定 |
| --- | --- | --- | --- | --- |
| `home-chips-in-card.png` | 105405 | `9fdf323b99ae1a68af33ce3e16ef444c` | 输入卡片**正上方独立一行、整行靠左**：`📁 pho… ⌄`（工作区，maxTextDp 34 故截断）→ `〽 标准模式 ⌄`（预设，**完整显示**）；卡片内左下 `DeepSeek… ⌄` + `仅可查看 ⌄`，右下两枚 44dp 圆钮（⊕ / 语音）；**未换行、圆钮未被挤压、右缘有余量** | **PASS（G1，v1.3.3 版式）** |
| `preset-panel-loaded.png` | 287642 | `9e0dba7f44dc4f28243fb517eb22dc69` | 标题 `Agent 预设`；说明行逐字；`内置`：`标准模式`（蓝 + 徽章 `新任务默认` + 描述逐字）、`PTC 模式`（逐字）、`极简模式`（**置灰 + 徽章 `加载失败` + 追加 reason `主机上没有安装这个预设。`**）、`创造模式`（逐字）；`自定义`：`评审模式` + `暂无描述。` ⇒ 名册 ≥4、标题非空、当前项恰 1 条 | **PASS（G3 + 第 8 条成功态）** |
| `preset-panel-503.png` | 144132 | `a1f121d6fede6a377b954a2b100d5d52` | `正在读取主机配置…` + `读不到主机的配置：HTTP 503 config_unavailable: 主机暂时读不到 harness 配置，请稍后重试。` + `⟳ 重新加载` | **PASS（失败态可见 + 可重试）** |
| `preset-panel-recovered.png` | 287606 | `0207e714e3438bbdfac70a8fefd8a8f0` | 点「重新加载」后恢复到与 loaded 相同的完整名册 | **PASS（重试可恢复）** |
| `preset-panel-host404.png` | 136322 | `654c98035bbeddd5b45998fdd57d5d08` | `读不到主机的配置：HTTP 404 not_found: 没有这个接口：GET /v1/harness` + `重新加载`（＝本机真宿主尚未升级时的实际表现） | **PASS（失败态）** |

- 局限（诚实声明）：本机 `adb` 不在 PATH，我**没有**真机通道 ⇒ 这 5 张图由 android-ui 提供；我做的核对 = 逐张**独立计算 md5**（与交付值一致）+ **逐张目视与契约 §3.1/§3.2/§3.4 的文字要求对照**（文案、顺序、入口、置灰、只读）；我**不能**证明截图背后的操作序列。
- 版本口径：本轮沿用上一轮 **0.6.4(code 20)** 的 `workspace-panel.png` / `workspace-browse*.png`（G2）、`switch-rollback*.png`（G4）、`settings-harness.png` / `chat-preset-tag.png`（G5）—— 这些面板/回滚/只读标签行为本轮未改动（`Seats.java` 变更仅为「打开即取数 + 失败态」），故 **G2 / G4 / G5 沿用其证据**；v1.3.3 重拍的是首页版式与预设面板三态。`home-chips.png`（0.6.4 版式）**已作废**，以 `home-chips-in-card.png` 为准。

---

---

## verifier 备注（不影响判定，供 lead 收口参考）

1. 契约 §1.1 写「`reason` 说明」，实际实现是**仅在 `usable=false` 时输出 `reason`**（`plugin/lib/harness.js:322` 的 `...(broken ? { reason: broken } : {})`）。验收按此语义判定：`usable=false` 必须有非空 `reason`，`usable=true` 不得带 `reason`。桌面参考的 `brokenBadge`「加载失败」也正是这条。
2. 内置预设的 `title` 才是中文；自定义/未知预设可能回英文 id 作 title（`localise()` 只对已知别名补中文）。因此脚本只对 `builtin=true` 的项断言「title 是中文」。
3. 工作区写入是**插件自己的偏好**（`selfEntry()` 写 `dsh-phoneharness` 条目），不是宿主服务；宿主条目不可写时如实回 `persisted=false` + 「已生效（本次运行）」，与契约 §1.2 的 `persisted` 语义一致（C12 实测）。
4. 脚本内联桩是刻意的：契约 §5 只给 verifier `tools/verify-harness.mjs` 的写租约，不新建 `tools/stub-harness-server.mjs`。
5. **`ic_preset.xml` 的措辞偏差（需 lead 定）**：契约 §3.6 字面要求「线性矢量 / `strokeWidth` 同值 / `strokeColor="#FF000000"`」，但实现（与它引用的 `ic_folder.xml`、`ic_enhance.xml` 一致）是 `fillColor="#FFFFFFFF"` 的填充矢量、靠 Theme 着色；`ic_enhance.xml` 本身也是纯填充 → 契约措辞自相矛盾。我按**意图**判 PASS（24dp、矢量、可着色、与既有图标同族、E1 已验进包）。若要严格照字面，需 android-ui 改成描边矢量（写租约内可行），或 lead 修 §3.6 措辞 —— **v1.3.2 已由 lead 采纳此判定并把 §3.6 改成「纯 `fillColor=#FFFFFFFF` 填充、由 Theme 着色、不该自带黑色描边」，故本条不需要改代码**。
6. **md5 语义**：同一套源码重复构建出的 APK **md5 不同**（zip 内嵌构建时间戳），size 相同。所以「产物一致性」应比对 `versionName/versionCode` + 资源表 + 旁车 json，不要拿 md5 跨构建比对。
7. 五档口径中的 **NOT-READY** 是刻意加的：验收脚本要在对方还没落盘时把「路由不存在」判成未就绪，而不是给队友记 FAIL。判定特征是「404 + `error.code==='not_found'` + message 含「没有这个接口」」。
8. 反例 `C10`（409 `default_unavailable`）的**桩侧**保持未验证（桩造不出「拒绝写默认值的宿主」，不硬判 PASS）；**真机侧**已由 android-ui 实测到 409 原始响应 + chip 回滚（`switch-rollback-409.http` + `switch-rollback.png` / `switch-rollback-after.png`），我核对后记为「真机侧 PASS · 桩侧未验证」。
