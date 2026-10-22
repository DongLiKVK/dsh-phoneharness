# 用户主机 harness 功能 · 冻结契约 v1.3.3（Lead 签发）

> 本文件是本次改动的**唯一执行依据**。四人分工、接口、文案、验收全部以此为准；
> 参考实现细节见 `docs/harness-desktop-reference.md`（含 asar 行号证据）。
> 目标（用户原话，m00003）：在**手机端**增加「用户主机 harness」功能；位置/布局参考本机 harness 的展示与交互方式；
> 按移动端屏幕尺寸适配优化；**必须支持查看与修改用户主机的 harness 配置**；交互逻辑清晰，样式与整体界面协调。

## 0. 一句话设计

手机首页 composer 的座位行新增两枚 chip —— **工作区** 与 **Agent 预设**（顺序与桌面 heroWorkspaceRow 一致：工作区 → 预设 → 模型 → 权限）；
点开是**底部面板**（移动端对桌面浮层的等价物）：工作区面板 = 最近工作区 + 主机目录浏览 + 手动输入路径；预设面板 = 内置预设列表（名称 + 描述，当前项打勾）。
选中即**写入用户主机 harness 配置**（`POST /v1/harness/config`），成功后面板与被选 chip 同步刷新；新建会话页与设置页复用同一套面板入口。

## 1. 协议（插件侧，只加不改）

所有 `/v1/harness*` 沿用既有鉴权（`Authorization: Bearer <token>`，与 `/v1/catalog` 同一条校验路径）。

### 1.1 GET /v1/harness → 200

```json
{
  "presets": [
    { "id": "ptc", "title": "PTC 模式",
      "description": "包含标准模式的所有能力，更适合批量调用工具，并对结果进行筛选、整理、去重、统计或汇总的任务。",
      "current": true, "usable": true, "builtin": true, "reason": null }
  ],
  "workspaces": [ { "cwd": "<HOME>\\Documents\\task", "title": "task", "current": true } ],
  "defaults": { "model": "deepseek-chat", "permission": "read-only", "agentPreset": "ptc" },
  "capabilities": { "writeConfig": true, "listDirs": true, "configEditor": true },
  "failures": []
}
```

硬性要求：
- `presets[].title` **必须是桌面同名中文**（标准模式 / PTC 模式 / 极简模式 / 创造模式）：host 给中文 title 直接用；host 只给 id 或英文 title 时，插件按 `docs/harness-desktop-reference.md` §1 的映射补全 title **与** description。
- `presets[].usable=false` 的项保留在列表里（`reason` 说明原因），手机端置灰不可点，对应桌面的 `brokenBadge`/`standardUnavailable` 语义。
- `presets[].builtin` 区分内置/自定义，供手机端分组（内置 / 自定义）。
- `current=true` 标当前生效项；`defaults.*` 是插件配置里的默认值（与 `plugin/index.js:220 readDefaults` 同源）。
- `workspaces` 复用 `runtime.js` 既有 `workspaces(signal)`（`workspaceRegistry.list()` + 最近会话 cwd，上限 12 条），`title` = 短名，`current=true` 标当前默认工作区。
- `capabilities.writeConfig=false` 时手机端必须把「只读」提示出来（见 §3.4），而不是假装能改。
- `failures` 沿用 catalog 的失败清单形状（可为空数组）。
- **（v1.3.3 新增）`presets` 永不为空数组**：宿主名册取数按 §1.1.1 的三级来源（`agentPresets.remoteExportList()` → `agentPresets.list()` → 插件内置四条 zh 名册）回退；只要四级来源里任何一级给出 id，就必须出现对应条目；四级全拿不到时也必须回**内置四条**（standard / ptc / minimal / cordis），并把「为什么回退」写进 `failures`（中文一句话）。任何条目的 `title` 都不允许为空串/null。

### 1.1.1 宿主名册的三级来源（v1.3.3，修「选择模式候选为空」）

宿主（DSH 本体）提供 Agent 预设的是 `@deepseek-ai/dsh-agent-preset-registry`，服务名 `agentPresets`（`dsh-src/_ref/preset-registry__index.js:451` `super(ctx, "agentPresets")`）。取数顺序：

1. **`agentPresets.remoteExportList()`**（`preset-registry__index.js:587`）：`{ presets: [{ id, name?, description?, order?, broken?, isDefault }] }` —— 这是「宿主传入的预选模式列表」的正式形态，`isDefault` 直接用来定 `current`。
2. **`agentPresets.list()`**（`preset-registry__index.js:570`）：同形（去掉 `isDefault`，`current` 由 `defaults.agentPreset` 判定），排序为 `order ?? Infinity` 再按 id。
3. **插件内置 zh 名册**：`standard/PTC/极简/创造` 四条 title + description（见 `docs/harness-desktop-reference.md` §1），仅在 1、2 都给不出 id 时用，且必须写 `failures`。

字段映射：`broken !== undefined` ⇒ `usable=false` 且 `reason=String(broken)`；`name/description` 缺失 ⇒ 用内置 zh 文案补齐；`id` 在内置四条内 ⇒ `builtin=true`。

### 1.2 POST /v1/harness/config → 200

请求体（至少一个字段；未出现的字段不改）：

```json
{ "agentPreset": "ptc", "workspace": "<HOME>\\Documents\\task", "permission": "read-only", "model": "deepseek-chat" }
```

响应 200：

```json
{ "ok": true,
  "applied": { "agentPreset": "ptc" },
  "message": "已切换为 PTC 模式",
  "persisted": true,
  "harness": { /* 与 GET /v1/harness 完全同形 */ } }
```

- `persisted=true` = 已写入 profile 配置（`configEditor` 可用，重启后仍在）；`false` = 仅本次运行期生效，手机端必须提示「本次运行生效」。
- `message` 是给手机端直接显示的中文短句（禁止英文）。
- `harness` 直接返回刷新后的快照，手机端据此更新 chip 与面板，**不需要二次 GET**。

错误码（全部走既有 `server.js` 错误映射表，新增行也只加不删）：

| HTTP | code | 触发 |
| --- | --- | --- |
| 400 | bad_request | 无有效字段 / 字段类型错 |
| 400 | unknown_preset | agentPreset 不在可用列表 |
| 400 | unknown_model | model 未知 |
| 400 | unknown_permission | permission 未知 |
| 400 | bad_workspace | 路径不存在、不是目录、或不可读 |
| 409 | default_unavailable | 沿用既有语义：宿主拒绝写入默认值 |
| 503 | config_unavailable | configEditor 与本插件配置两条路径都不可用 |

### 1.3 GET /v1/harness/dirs?path=HOST_PATH → 200

```json
{ "cwd": "<HOME>\\Documents",
  "parent": "<HOME>",
  "roots": [ { "name": "C:", "path": "C:\\" }, { "name": "D:", "path": "D:\\" } ],
  "entries": [ { "name": "task", "path": "<HOME>\\Documents\\task", "dir": true, "hidden": false } ] }
```

- **只列目录**（工作区只能是目录）；点开头目录默认不返回，`showHidden=1` 时返回。
- `path` 省略 → `cwd` 为当前默认工作区、`parent` 为其父级。
- 错误：400 bad_path / 404 not_found / 403 forbidden。
- 只读操作，不改任何文件。

### 1.4 POST /v1/harness/dirs → 201（可选，最低优先级）

```json
{ "parent": "<HOME>\\Documents", "name": "newdir" } → { "path": "<HOME>\\Documents\\newdir" }
```

错误：409 exists / 400 bad_name。桌面浮层有「新建文件夹」，手机端**可以不做**；做了必须在面板里同样暴露。

## 2. Android 数据层（android/src/com/lc/phoneharness/Harness.java，新建，签名冻结）

```java
package com.lc.phoneharness;

/** 用户主机 harness 配置的读/写门面。所有网络调用都在调用线程阻塞执行，UI 侧必须放到后台线程。 */
public final class Harness {
    public static final class Preset {                       // presets[]
        public final String id, title, description, reason;   // reason 可为 null
        public final boolean current, usable, builtin;
    }
    public static final class Space {                        // workspaces[]
        public final String cwd, title;
        public final boolean current;
    }
    public static final class Dir {                          // /v1/harness/dirs entries[]
        public final String name, path;
        public final boolean dir, hidden;
    }
    public static final class State {
        public final java.util.List<Preset> presets;
        public final java.util.List<Space> spaces;
        public final String agentPreset, workspace, model, permission;  // 当前生效值
        public final boolean writeConfig, listDirs, configEditor;
        public final String presetTitle(String id);        // 未命中返回 id 本身（不返回 null）
        public final String presetDescription(String id);  // 未命中返回 ""
        public final Preset preset(String id);             // 可为 null
        public final String workspaceTitle();              // 当前工作区短名；未知时返回 workspace 原串
    }
    public static final class Result {
        public final boolean ok;
        public final String message, code;
        public final boolean persisted;
        public final State state;                          // 失败时为 null
    }
    /** 进程内缓存：null 表示还没成功拿过。 */
    public static State state();
    public static void clear();
    /** 解析 /v1/harness（或 config 响应里的 harness 字段）并写入缓存。 */
    public static State parse(org.json.JSONObject json);
    /** 后台 GET /v1/harness；完成后在主线程回调 done（无论成败都回调）。 */
    public static void refresh(android.app.Activity host, Prefs prefs, Runnable done);
    /** 解析 dirs 响应。 */
    public static java.util.List<Dir> dirs(org.json.JSONObject json);
    public static String dirsCwd(org.json.JSONObject json);
    public static String dirsParent(org.json.JSONObject json);
    /** 同步 POST /v1/harness/config；抛 IOException（Api.HttpError 提供 code）。 */
    public static Result set(Prefs prefs, org.json.JSONObject body) throws java.io.IOException;
    /** 便捷构造请求体。 */
    public static org.json.JSONObject body(String key, Object value);
    /** chip 图标资源。 */
    public static int presetIcon();
    public static int workspaceIcon();
}
```

规则：
- 复用 `Api.call(address, token, method, path, body)`；失败时它会抛 `Api.HttpError(status, code, detail)` —— `set()` 必须捕获它并填 `Result.code/message`（`message` 用主机给的中文 detail，拿不到才回退 `Api.message(e)`）。
- 除上述成员外不要新增公开成员；UI 侧只依赖这些签名。
- 缓存写入 `Prefs`：`harnessPreset`、`harnessPresetTitle`、`harnessWorkspace`、`harnessWorkspaceTitle`（键名冻结，供离线时 chip 立即有文案）。`Prefs` 归 android-core 所有。

## 3. 界面（样式/文案依据见 docs/harness-desktop-reference.md）

### 3.1 首页 composer（MainActivity.java）

- **（v1.3.3 更正｜依据用户直接反馈 m00570）座位分成两处**：**工作区 chip → 预设 chip** 两枚在**输入卡片上方那一行**（横向滚动带，见下条）；**模型 chip → 权限 chip** 两枚留在**输入卡片（打字胶囊）内部**原来那一行，即**改动前的位置与顺序**——`row` 内顺序 = 模型 chip → 权限 chip → 弹簧 `(0,1,1f)` → 两枚 44dp 圆钮（上传 / 语音），与 v1.2 完全一致，`maxTextDp` = 模型 **70** / 权限 **56**，权限 chip `leftMargin = t.dp(8)`。
- `MainActivity.java`：`chipScroll`（473–481）只装 `chipsRow` 里的 **wsChip(483) + presetChip(499)**；`modelChip(516)`/`permChip(532)` 从 chipsRow 移回 `row`，`maxTextDp` 回 70/56。`ChatActivity.java`：该页座位带里**只有**模型/权限 ⇒ **整条 chipScroll band 删除**（433–441、519–522），两枚 chip 回 `row` 内、弹簧（478）之前，`maxTextDp` 70/56 不变。
- 会话页只读预设标签（`ChatActivity` 273–281 / `renderPresetTag` 342）不受影响、保持在标题行右侧。
- **版面定位（v1.3.2 起，v1.3.3 收窄适用面）**：**工作区 + 预设**两枚**不放在输入框（打字框）里面**，而是**独立成一行、位于输入卡片之上、整行靠左**。实现（`MainActivity.composer()`）：`LinearLayout wrap = t.column()`（MainActivity.java:408）——把 `chipScroll` 从 `card` 里挪出来，改成 **`wrap` 的子 view，且在 `wrap.addView(card, …)` 之前** add（顺序：attachStrip → **chipScroll** → card），`bottomMargin = t.dp(6)`、宽 MATCH_PARENT / 高 WRAP_CONTENT。`card` 里只留 `input`（打字框）与它下方那一行（两枚圆钮）。
- chipScroll 参数：`setHorizontalScrollBarEnabled(false)`、`setFillViewport(false)`、`setClipToPadding(false)`、`setOverScrollMode(View.OVER_SCROLL_NEVER)`，左右 padding 各 `t.dp(4)` 使 chip **文字左沿**与卡片内文字左沿对齐（wrap 左 padding 11dp + 4dp + chip 自身 9dp ≈ 卡片 11+14=25dp）；`chipsRow` 里只放**工作区 + 预设**两枚（预设 `leftMargin = t.dp(8)`），`chipsRow` 从左排起。模型/权限两枚不在这一带里（见上条 v1.3.3）。
  理由：座位行独立成行后，它不再与两枚 44dp 圆钮抢同一行宽度（原来卡片可视宽 ≈ 屏宽 − 22dp，360dp 屏只剩 ~338dp，扣掉圆钮 ~92dp 只剩 ~246dp，四枚 chip 固定开销 ≈39dp/枚 → 只剩 ~90dp 给四段文字，必然挤压）。独立行 + 横向滚动带后：360dp 屏 ~338dp 足以平铺两枚；更窄仍可横向滑动，**永不换行、不挤压输入框与圆钮**（模型/权限已回到胶囊内，不再参与这一带的宽度竞争）。
- maxTextDp 取值（**v1.3.3 定案**）：带内两枚 工作区 **34**、预设 **52**（沿用 v1.3.2 实测值，**本轮不做样式调整**）；胶囊内两枚 **模型 70 / 权限 56**（= 改动前的原值，随位置一起还原）。chip 内左右 padding 7/5、chip 间距 6dp 不变。
  实测依据（ZTE A2322，1080px / 3x = 360dp；`adb exec-out screencap` 抓原始 framebuffer 后扫 chip 描边色）：座位行内容区 x = 15.0–349.0dp（334dp）；四枚 pill 实测 15.0–85.7 / 92.0–176.7 / 183.0–249.7 / 256.0–338.7 ⇒ **四枚全可见、右缘余量 10.0dp**；「预设」pill 宽 85.0dp = 37dp 固定开销 + 48dp（「标准模式」四字 12sp 自然宽）⇒ 不触发省略号。（该实测是在「四枚同带」的 v1.3.2 版面上做的：64/48/70/56 那一组会裁掉第 4 枚。v1.3.3 把模型/权限移回胶囊后，带内只剩两枚，本条保留作历史依据；模型/权限的 70/56 在胶囊内与改动前一致，实测已验证可见。）
- chip 点击开面板时 anchor 传 chip 自身（沿用现有 `pickerAnchor`/chip 引用语义）。
- 两枚新 chip 一律用既有 `seatChip(iconRes, maxTextDp, click)` 构造，不新写样式：
  - 工作区：`seatChip(R.drawable.ic_folder, 84, …)`；文案 = `Harness.state().workspaceTitle()`，无数据时用 `Prefs.harnessWorkspaceTitle`，再没有则显示 `选择工作区`。
  - 预设：`seatChip(R.drawable.ic_preset, 56, …)`；文案 = 当前预设 title，回退 `Prefs.harnessPresetTitle`，再没有则 `选择模式`。
- chip 无数据/主机不可用时保持可点（点了会拉数据并提示），不置灰成死按钮。
- 首帧（进程启动、还没有 harness 数据）**不得阻塞**：chip 先用 `Prefs` 缓存值渲染，随后静默 `Harness.refresh()` 刷新。
- `renderChips()` 一并刷新两枚新 chip 的文案与图标。

### 3.2 面板（移动端等价物：底部面板）

统一在 `Seats.java` 里实现两个方法（与既有 `showModelMenu`/`showPermissionMenu` 同风格、同 `Menu` 工具类）：

```java
static void showWorkspacePanel(Activity a, Theme t, Prefs p, View anchor, Runnable onChanged);
static void showPresetPanel(Activity a, Theme t, Prefs p, View anchor, Runnable onChanged);
```

- **工作区面板**：标题 `选择工作区`；上部「最近工作区」列表（`Harness.state().spaces`，当前项打勾 + 副标题写完整 cwd）；下部「浏览主机目录」——面包屑（可点回上级）+ 目录行列表（`ic_folder` + 名称），点目录进入、`上级目录` 返回、底部「使用此目录」按钮 = 选择当前目录；再下方一行「手动输入路径」打开输入框。
- **面板打开即取数（v1.3.3，修「候选为空或显示不正确」）**：`showWorkspacePanel`/`showPresetPanel` 必须**无条件**调 `Harness.refresh(host, prefs, cb)`（先用 `Harness.state()` 缓存渲染首帧，再在回调里 `sheet.refill(); sheet.resize();`，并顺带跑一次 `onChanged` 刷新上方 chip 文案）——不再只在 `Harness.state()==null` 时才取数。
- **失败必须可见可重试（v1.3.3）**：`state==null || 列表为空` 时，面板依次显示 `正在读取主机配置…` 与 `读不到主机的配置：<原因>`（原因 = `Harness.lastError()`，为 null 时退回 `主机没有提供任何 Agent 预设`），并提供一行可点的 `重新加载`（点了重跑 refresh + refill）。**（v1.3.3 修订）** 不做 `主机提示` 分组：`Harness.State` 的冻结签名里**没有** `failures` 字段，而每条不可用预设已经自带 `reason`（如「这台机器没有声明这个预设，名册用的是内置兜底」），信息已足够 ⇒ 本轮**不改数据层签名、不加 hostNotes()**，`harness_host_notes` 键保留在 strings.xml 备用。工作区面板同样处理。
- **名册完整性**：内置/自定义两组都为空时走失败分支，不得留白；`usable=false` 的项保留（`加载失败` 徽章 + reason），当前项 `新任务默认`。
- **预设面板**：标题 `Agent 预设`；顶部一行说明 `选择 Agent 的工具和工作方式。日常任务用「标准模式」，扩展 DSH 的能力用「创造模式」。`；列表按 `内置`/`自定义` 分组；每项 = 名称（13sp）+ 描述（12sp，可换行，最多 3 行省略）；当前项右侧 `新任务默认`；`usable=false` 的项置灰并在描述后追加 `（reason）`；描述为空显示 `暂无描述。`。
- 面板必须**可关闭**（返回键/下滑/点遮罩），长路径必须省略号显示不能撑破面板，内容超高时列表内部滚动。
- 点选流程（对齐桌面乐观更新）：立刻关闭面板并把 chip 文案换成新值 → 后台 `Harness.set()` → 成功：用响应里的 `harness` 刷新 chip；失败：**回滚 chip 文案** + `Toast` 显示 `无法切换到「<name>」：<message>`。
- `persisted=false` 时成功提示追加 `已生效（本次运行）`。

### 3.3 新建会话页（NewSessionActivity.java）

- 顶部裸 `cwd` 输入框改为：工作区 chip + 预设 chip（同上，同序）；`手动输入路径` 入口保留在工作区面板里。
- 若 `Harness.state()` 已有工作区且用户未手动改过，`cwd` 默认值取 harness 当前工作区，并在 chip 上体现。
- 发 `POST /v1/sessions` 时带上当前选中的 `agentPreset`。

### 3.4 设置页（SettingsActivity.java）

- 新增一行「用户主机的 Harness」→ 打开同一个面板外壳的「设置模式」：
  - 四行只读当前值并显示完整值：工作区（完整 cwd）、Agent 预设（名称 + 描述首行，单行省略）、模型、权限；每行可点，点了打开对应选择面板（模型/权限直接用既有 `Seats.showModelMenu`/`showPermissionMenu`）。
  - 底部：主机地址与 `capabilities` 摘要；`writeConfig=false` 时顶部显示警告条 `主机不接受配置写入，以下只能查看`。
  - 「刷新」按钮 = `Harness.refresh()`，完成后整页刷新。
- 手机端自己**不再存一份** harness 配置（只存缓存展示值），避免双份真相。

### 3.5 会话页（ChatActivity.java）

- 只读标签（对齐桌面 AgentPresetLabel 的只读决定）：标题旁显示会话所属预设名，次要色圆角背景、12sp、最多 180dp 后省略；拿不到会话预设时不显示任何占位。
- **不提供**任何切换控件。

### 3.6 图标

- 新增 `android/res/drawable/ic_preset.xml`：24dp 矢量，**按仓库既有风格实现**——即与 `ic_data`/`ic_enhance`/`ic_folder` 同款：24dp viewport、纯 `android:fillColor="#FFFFFFFF"` 填充（不写 strokeWidth）、**由 Theme 的 `t.icon()`/`tint` 着色**，不要自带黑色描边（自带 `#FF000000` 会导致着色失效、深色主题下发黑）。能快速从桌面/官方资源提取到 path 就用它，否则自绘等价图形（本条第 3 处 v1.3.2 措辞更正：原写「线性矢量 / strokeWidth / #FF000000」与仓库既有图标实现相矛盾，以本条为准）。
- 工作区 chip 用既有 `ic_folder.xml`，不要新建。

## 4. 文案（全部进 android/res/values/strings.xml，键名冻结，只用 android-core 写）

```
harness_workspace_chip_default = 选择工作区
harness_preset_chip_default    = 选择模式
harness_workspace_panel_title  = 选择工作区
harness_preset_panel_title     = Agent 预设
harness_preset_section_intro   = 选择 Agent 的工具和工作方式。日常任务用「标准模式」，扩展 DSH 的能力用「创造模式」。
harness_group_builtin          = 内置
harness_group_custom           = 自定义
harness_in_use                 = 新任务默认
harness_no_description         = 暂无描述。
harness_broken_badge           = 加载失败
harness_use_this_dir           = 使用此目录
harness_browse_dir             = 浏览主机目录
harness_manual_path            = 手动输入路径
harness_parent_dir             = 上级目录
harness_refresh                = 刷新
harness_host_label             = 主机
harness_readonly_warning       = 主机不接受配置写入，以下只能查看
harness_persist_runtime_only   = 已生效（本次运行）
harness_switch_refused         = 无法切换到「%1$s」：%2$s
harness_settings_row           = 用户主机的 Harness
harness_recent_workspaces      = 最近工作区
harness_empty_workspaces       = 还没有可用的工作区
harness_empty_presets          = 主机没有提供任何 Agent 预设
harness_loading                = 正在读取主机配置…
# —— v1.3.3 新增（预设读取失败可见可重试；android-core 独占写）——
harness_retry                  = 重新加载
harness_load_error             = 读不到主机的配置：%1$s
harness_host_notes             = 主机提示（本轮保留备用：State 无 failures 字段，见 §3.2 v1.3.3 修订）
```

## 5. 分工与写租约（同一工作区、同一文件系统，禁止越界写）

| 成员 | 写范围（严格） |
| --- | --- |
| plugin-dev | plugin/lib/harness.js（新）、plugin/lib/server.js、plugin/index.js、plugin/lib/runtime.js（如需）、plugin/docs/api.md |
| android-core | android/src/com/lc/phoneharness/Harness.java（新）、Api.java、Prefs.java、android/res/values/strings.xml、NewSessionActivity.java |
| android-ui | MainActivity.java、Seats.java、SettingsActivity.java、ChatActivity.java、android/res/drawable/ic_preset.xml（新） |
| verifier | tools/verify-harness.mjs（新）、shots/harness/**、docs/harness-verification.md（新） |
| lead | SPEC.md、CHANGELOG.md、README.md、docs/harness-*.md |

- strings.xml 只由 android-core 写；android-ui 需要的新键以本文件 §4 为准，实现里禁止硬编码中文。
- Seats.java 只由 android-ui 写；android-core 不得改它。
- 谁都不许改 plugin/cordis.patch.yml 既有字段语义（只允许新增 harness 相关开关，且默认值保持现状行为）。

## 6. 验收（verifier 逐条给证据）

1. `cd plugin && node --check lib/harness.js lib/server.js index.js` 全绿。
2. 桩服务器上跑：GET `/v1/harness`、POST `/v1/harness/config` 成功 + 三个失败（bad_workspace / unknown_preset / config_unavailable）、GET `/v1/harness/dirs` 正常 + bad_path；把真实响应 JSON 贴进报告。
3. `cd android && bash build.sh` 产出 android/bin/dsh-phone.apk；确认新资源 ic_preset 与新字符串进包（aapt/apkanalyzer 或等效）。
4. 界面证据（能连机就截图；不能连机要明说并给静态核对）：
   - 首页座位行 4 枚 chip，顺序 = 工作区 / 预设 / 模型 / 权限，不换行、不挤压上传语音按钮（截图 shots/harness/home-chips.png）。
   - 工作区面板：最近工作区 + 目录浏览 + 手动输入可用；往返上级目录后面包屑正确。
   - 预设面板：四项中文名与描述与桌面逐字一致（把桌面字符串与截图里的字符串并排对照）。
   - 切换预设：chip 立即变化、主机收到正确请求体、失败场景 chip 回滚且出现 toast。
   - 新建会话页与设置页入口可用；会话页预设标签只读。
5. 反例：capabilities.writeConfig=false 时设置页出现只读警告条；presets[].usable=false 的项置灰不可点。
6. 报告写 docs/harness-verification.md：每条 = 命令/操作 + 原始输出或截图路径 + 结论（PASS/FAIL/未验证原因）。
### 6.1 v1.3.3 追加验收（位置恢复 + 预设读取修复，2026-10-22 第二轮）

7. **版面恢复（源码级 + 真机截图）**
   - `MainActivity.java`：横向带里只有 wsChip 与 presetChip（`chipsRow.addView` 两处）；胶囊内 `row` 顺序 = modelChip（maxTextDp **70**）→ permChip（**56**，leftMargin `t.dp(8)`）→ 弹簧 `(0, 1, 1f)` → 两枚 44dp 圆钮；`wrap.addView(chipScroll, chipLp)` 必须在 `wrap.addView(card)` **之前**。
   - `ChatActivity.java`：`grep -c chipScroll` = **0**；两枚 chip 在 `row` 内、弹簧之前。
   - 截图 `shots/harness/home-chips-in-card.png`：模型/权限在打字胶囊内，工作区/预设在上方那一行靠左。
8. **预设读取修复**
   - **打开即取数**：缓存非空时打开面板也必须发一次 `GET /v1/harness`（桩侧计数 ≥1；旧的「只在 state==null 才取」判 FAIL）。
   - **失败可见可重试**：桩返回 503 / 真宿主返回 404 时，面板显示 `读不到主机的配置：<原因>`（原因含状态码与错误码）并给出可点的 `重新加载`；点它后再发一次请求、桩改回正常时能渲染出候选。
   - **名册永不为空**：任何夹具下 `presets` ≥ 4 条、每条 `title` 非空、current 恰好一条；宿主无 `agentPresets` 时回落内置四条并把原因写进 `failures`。
   - **环境侧证据**：`node tools/probe-live-host.mjs` 的原始输出（本机宿主重启前应为 404、重启后应为 200 + presets 非空），与 `shots/harness/preset-panel-host404.png` 二选一或都给。
9. **报告口径**：`docs/harness-verification.md` 增加 v1.3.3 小节，并明确区分「脚本证明代码具备能力」（真 PhoneServer + 真路由 + 真 HarnessConfig + 桩 ctx）与「probe 证明本机 profile 是否已生效」（真宿主 HTTP）。


## 7. 交付顺序

1. plugin-dev 先把 GET /v1/harness + /dirs 跑通（android 侧可对着真响应开发）。
2. android-core 冻结 Harness.java（签名不再改），android-ui 从此只写调用。
3. verifier 在收到「两侧都已落盘」通知后开始；构建失败按文件归属把失败信息回给对应成员，不得自己改别人的文件。
4. lead 收口：SPEC.md v1.3、CHANGELOG.md 两条、README.md 一段，最后跑一次全量验收。
