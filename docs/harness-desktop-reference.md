# 用户主机 harness 功能 · 桌面参考（单一事实来源）

> 目的：把桌面 harness 里「工作区 chip + Agent 预设 chip」的**文案、结构、样式、行为**逐条固化，
> 供手机端照抄。所有引用均给出 asar 内的真实文件与行号，禁止凭印象改写。

## 0. 结论：截图里那两枚 pill 到底是什么

截图（`m00001`, sha256 `db38259a…`）显示 `📁 task ⌄` 与 `「PTC 模式」 ⌄`，它们是**新会话页 hero（未开始对话的首页）里同一个座位行**的两枚 chip：

- `📁 task ⌄` = **工作区 chip**（`WorkspaceChip`），label 是工作区**短名**（basename / workspace title）。
- `⬡ PTC 模式 ⌄` = **Agent 预设 chip**（`AgentPresetSeat`），label 是预设名。
- 二者**相邻、工作区在左、预设紧贴其右**，见下方证据。

### 证据（asar 内真实代码）

文件：`dsh-src/_ref/dsh-client-ui-conversation__lib__client.js`
（asar 路径 `/dsh/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js`）

```js
// 第 17790 行起：ConversationContent() 里构造 heroWorkspaceRow
const heroWorkspaceRow = jsxs("div", {
  className: ConversationRoot_module_css_default.heroWorkspaceRow,
  children: [
    jsx(WorkspaceChip, { buttonRef: pickerAnchor, label: chipTitle, menuOpen: pickerOpen, onClick: ... , t }),
    renderSlot("conversation.hero.workspace", { open: pickerOpen, anchorRef: pickerAnchor, selectedId, onPick, onClose }),
    renderSlot("conversation.hero.agentPreset", {}),
    sessionId === void 0 ? null : jsx("div", {
      className: ConversationRoot_module_css_default.heroOptions,
      children: renderSlot("conversation.hero.options", {})
    })
  ]
});
```

→ **顺序 = 工作区 chip → 工作区选择浮层（锚定在该 chip 上） → 预设 chip →（仅有会话时）heroOptions（模型/权限等选项）**。

槽位名（同文件）：`conversation.hero.workspace`(17797)、`conversation.hero.agentPreset`(17812)、`conversation.hero.options`(17815)、`conversation.hero.brand.mark`(17713)。
另有槽位登记表原文（`dsh-cordis-client-runner/lib/client.js`）把 `conversation.hero.agentPreset` 的占用者写成 `client-ui-agent-preset AgentPresetSeat`，`declaredBy: factory 'conversation.content' (client-ui-conversation)`。

chip 文案构成（同文件 17762-17792）：
```js
const storedChipTitle = pendingWorkspace?.title ?? (sessionId === void 0 ? void 0 : sessionWorkspace?.title
  ?? (workspaces.phase === "ready" || cwd === void 0 || cwd === "" ? void 0 : workspaceLabel(cwd)));
const chipTitle = storedChipTitle === void 0 ? void 0 : workspaceDisplayTitle(storedChipTitle, t("workspace.defaultName"));
```
→ 优先用工作区 title，取不到时用 cwd 推出的短名，再取不到则用 `工作区默认名`；`hero && chipTitle === undefined` 时输入框置灰。

## 1. Agent 预设 chip（AgentPresetSeat）

文件：`dsh-src/_ref/dsh-client-ui-agent-preset__lib__client.js`

- 结构（1382-1389）：
  ```jsx
  <button type="button" className={css.seat} aria-haspopup="menu"
          aria-expanded={open && options.length > 0} title={error?.reason ?? t("seatHint")}
          disabled={state.busy || options.length === 0} onClick={...}>
    <IconAgentPresetOutlineRegular className={css.seatIcon} />
    <span className={css.seatLabel}>{shownLabel}</span>
    <IconChevronDownOutlineRegular className={css.chevron} />
  </button>
  ```
- 样式（1224 行 `_oGoKq_seat`）：`border-radius:var(--dsw-radius-sm); max-width:min(100%,240px); min-height:28px; color:label-primary; white-space:nowrap; gap:4px; padding:0 8px; font-size:13px; font-weight:500; line-height:20px; display:inline-flex`；
  容器 `menuAnchor`：`min-width:54px`；`:not(:disabled):hover, [aria-expanded=true]` → `background:var(--dsw-alias-interactive-bg-hover)`；`:disabled` → `color:var(--dsw-alias-label-quaternary)`。
  `seatIcon` 用 `label-primary`；`chevron` 用 `label-caption`；`seatLabel` 溢出省略号。
  菜单项：`.item{flex-direction:column;gap:2px;max-width:280px}` + `.itemName{font-size:13px;line-height:20px}` + `.itemDesc{color:label-caption;white-space:normal;font-size:12px;line-height:16px}`。
- 行为：点击开菜单（`onSelect(id)` → `setOpen(false)` + `select(id)`）；`busy` 或无可选项时 disabled；切换被主机拒绝时弹 `switchRefused` toast（锚在 `[data-composer-card]`）。

### 桌面 zh 文案（必须原样沿用）

来源：同文件 940-969 行的 `zh` 字典。

| key | 值 |
| --- | --- |
| builtInGroup | `内置` |
| customGroup | `自定义` |
| sectionIntro | `选择 Agent 的工具和工作方式。日常任务用「标准模式」，扩展 DSH 的能力用「创造模式」。` |
| seatHint | `选择新任务使用的 Agent 预设` |
| headerHint | `本任务的 Agent 预设，在任务开始时确定` |
| nav | `Agent 预设` |
| setDefault | `设为新任务默认` |
| view | `查看配置` |
| presetStandardName | `标准模式` |
| presetStandardDescription | `处理代码、文件和资料，适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。` |
| presetPtcName | `PTC 模式` |
| presetPtcDescription | `包含标准模式的所有能力，更适合批量调用工具，并对结果进行筛选、整理、去重、统计或汇总的任务。` |
| presetMinimalName | `极简模式` |
| presetMinimalDescription | `Agent 使用终端和图片读取工具，并支持上下文压缩，适合测试和对比其基础表现。` |
| presetCordisName | `创造模式` |
| presetCordisDescription | `用对话定制 DSH：让 Agent 编写插件，添加新功能或界面；也能组合工具和提示词，创建自己的模式。` |
| inUse | `新任务默认` |
| noDescription | `暂无描述。` |
| brokenBadge | `加载失败` |
| switchRefused | `无法切换到「{name}」：{reason}` |
| standardUnavailable | `标准模式不可用，请恢复该模式或选择其他可用模式。` |
| close | `关闭` |

### 预设名/描述 → id 映射

host 侧 `agentPresets` 的 id 与桌面四个内置预设对应关系（手机端必须以 title 为准、以 id 兜底）：
`standard|default|normal → 标准模式`；`ptc → PTC 模式`；`minimal|simple → 极简模式`；`cordis|creator|creation → 创造模式`。
host 若已给中文 title（桌面即如此）则直接用 host 的 title；host 给英文 title 或只有 id 时，插件用上表补全中文名与描述。

## 2. 工作区 chip 与工作区选择

- chip = `WorkspaceChip`（同 conversation 文件），label 为短名，无图标 in-line 证据但从截图可判为文件夹图标；点击开 `conversation.hero.workspace` 浮层，`anchorRef` 即 chip 本身，`selectedId` 标当前项，`onPick(workspaceId)` 选择后关闭。
- 选择动作是「乐观更新 + 失败回滚」（同文件 17800-17806）：
  ```js
  onPick: (workspaceId) => { setPickerOpen(false); setPendingWorkspaceId(workspaceId);
    selectWorkspace(workspaceId).catch(() => setPendingWorkspaceId(current => current === workspaceId ? void 0 : current)); }
  ```
  → 手机端同样：**先改本地显示、再写主机、失败回滚并提示**。
- 目录浏览浮层（`dsh-client-ui-directory-picker-browse`）：标题 `browser.title`、面包屑 + 可编辑路径、Miller 双列目录行（`IconFolderCloseRegular`/`IconFolderOpenRegular`，选中行高亮）、footer「`newFolder` 新建文件夹」+ `Open`。
- `hero.chooseWorkspace` = `选择工作区`。

## 3. 会话页里的预设呈现（只读）

`AgentPresetLabel`（同文件 980-1000 行注释原文）：
> Read-only by construction: a session's composition is fixed once its conversation starts, and a header is only worth reading after that. Offering a control here would promise a switch the host refuses; naming what the session runs is the honest affordance, and the choice itself lives on the new-session screen (AgentPresetSeat).

→ **手机端会话页只做只读标签**（不提供切换控件）；切换只在新会话/首页 composer 上提供。
样式 `b06baG_label`：`border-radius:var(--dsw-radius-xs); background:var(--dsw-alias-fill-tsp-secondary); max-width:180px; height:22px; color:label-tertiary; gap:4px; font-size:12px; line-height:22px`；`@container (width<=540px){ display:none }`（窄容器下整个标签隐藏）→ 手机窄屏按此**默认隐藏**或按可用宽度自适应。

## 4. 会话页 header 的另一条证据

`dsh-client-ui-session/lib/client.js` 只有会话壳，不含座位（无 `Seat` 命中）；座位全部由 `client-ui-conversation` 的 hero 槽位装配 —— 也就是说**切换入口只存在于新会话页**，这条来自桌面实现本身，不是我们的取舍。

## 5. 与手机端既有实现的对应

- 手机 `MainActivity` 首页 composer 的座位行已有 2 枚 chip（模型 `ic_data`、权限 `ic_perm_*`），由 `seatChip()` 统一渲染：`t.icon(icon,t.muted,12) + TextView(12f,muted,maxWidth=t.dp(n),ellipsize=END) + t.icon(ic_chevron_down,t.muted2,9)`，容器高 30dp、`roundStroke(cardFill,line,15f)`、padding 9/0/6/0 —— 与桌面 seat 的 `13px/500 + icon14 + chevron + 28px 高` 同构，只需按手机密度调小字号/高度。
- 手机没有 `conversation.hero.options` 里的模型/权限行以外的结构，故新增的「工作区」「预设」两枚 chip 直接插在既有两枚 chip **之前**，顺序与桌面一致（工作区 → 预设 → 模型/权限）。

## 6. 生态约定（不要违反）

- `/v1` 协议只做加法（`SPEC.md`）；新增接口不得改动既有字段语义。
- 所有面向用户的新文案必须中文，并写进 `android/res/values/strings.xml`（夜间同名资源在 `values-night/`，颜色只用 `Theme` 令牌）。
- 每次改动写进 `CHANGELOG.md`（插件版本线与 APK 版本线各一条）。
