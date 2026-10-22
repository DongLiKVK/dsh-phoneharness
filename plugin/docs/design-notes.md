> 这是开发过程中的设计/实现笔记，按时间顺序堆叠，用于解释「为什么这么写」。面向使用者的文档见 [../README.md](../README.md) 与 [install.md](./install.md)。

# 设计笔记（design notes）

用手机接管这台电脑上的 DeepSeek Harness：装一个 APK，在局域网里看会话、发指令、**发图片**、**在手机上批准工具调用**。

默认不需要云、不需要账号、不需要公网 IP，数据全部留在本机。
想在外面（4G / 异地 WiFi）也能用，加一条 **SSH 反向隧道 + 云上 nginx** 就行，见「[公网中继](#公网中继)」。

---

## 它做了什么

DSH 自带的网页界面只监听 `127.0.0.1`，手机连不上；审批请求也是发给浏览器 UI 的，没人点就等于拒绝。
这个插件补上这两件事：

1. 自己开一个 **`bind:8737`** 的 HTTP/SSE 端口，专门给手机用；
2. **一次性 6 位配对码**换长期设备令牌，令牌只存本机 `devices.json`（0600）；
3. 把 DSH 会话事件投影成手机时间线，SSE 增量推送；
4. **图片双向**：手机上选图（端上压到长边 1600 / q85）→ base64 塞进 `images` 发出去 → DSH 真能「看见」这张图；反过来时间线里的图只放引用，手机按 `attachmentId` 单独取字节，不重复传 base64；
5. **注册 `approval/request` waterfall 监听者**：手机连着时接管审批，手机点了再把 `allowed-once` / `rejected` 回灌给 DSH；没手机时自动 `next()` 让位给桌面浏览器 UI；
6. **注册 `user-questions/request` waterfall 监听者**：模型用 `ask_user_question` 反问时，问题直接弹到手机上，选完答案回灌，模型接着往下跑（不让位就永远轮不到桌面 UI，反之亦然）；
7. **会话管理**：改名、归档 / 取消归档、置顶，手机端长按会话行就能操作，全部落到 DSH 自己的 `sessionTitle` / `workspaceRegistry`；
8. 侧栏「设置 → 手机远程」面板：显示配对码、局域网地址、已配对设备、审批统计，还能直接下载 APK。

---

## 装插件

插件已经装在这个 profile 里（`<HOME>\.dsh\profiles\phone`）。换机器时：

```bash
dsh plugin --profile phone add "link:<本仓库>/plugin"
```

然后在 profile 的 `cordis.patch.yml` 里追加（`plugin/cordis.patch.yml` 就是这段）：

```yaml
- insert:
    - id: dsh-phone-harness
      name: dsh-phone-harness
      config:
        enabled: true
        port: 8737
        bind: 0.0.0.0
        pairingTtlMs: 600000
        approvalTimeoutMs: 120000
```

重启 DSH，日志里会出现：

```
phone-harness: 手机可连 http://<本机IP>:8737（配对码 123456）
```

## 装 APK

面板里**不再提供下载入口**（0.4.4 起移除，避免把手机包的分发绑在某台开机的电脑上），装包改走：

- **GitHub Releases**（推荐）：从项目 Releases 页下载 `dsh-phone.apk`；
- **本地直连**：手机浏览器打开 `http://<电脑IP>:8737/apk`（路由仍在，只是面板不链接它）。

APK 在 `plugin/assets/dsh-phone.apk`（152,474 字节 / md5 `0962877b9ee7edb1e1aafd45ca8d6855`，
v0.3.0，debug 签名，minSdk 21 / targetSdk 34，**debuggable**）。装的时候手机会提示「未知来源」，允许即可。

包带 `android:debuggable="true"`，所以 `adb shell run-as com.lc.phoneharness`、JDWP 断点、
`logcat --pid` 都能直接用（发版前把 Manifest 里那一行删掉重编即可）。
中兴 / nubia 手机的完整装机与调试步骤见 **docs/ZTE-手机安装与调试.md**；
插上 USB 后也可以直接跑一键脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\phone-install.ps1
```

界面按 **DeepSeek 官方手机版 2.6.1** 重做：官方调色板与文案、浅/深双主题、日期分组会话列表、
左边缘抽屉、欢迎页鲸形主图、助手鲸形头像、5 图标消息操作条、底部胶囊输入条、长按菜单，
见「[手机端界面](#手机端界面)」。应用图标是「鲸域」的鲸尾线稿。

## 连上

1. 手机和电脑连同一个 WiFi（或走 Tailscale，见下）；
2. 打开 APK → 填地址 + 面板上的 6 位配对码 → 「配对并连接」；
3. 之后进会话列表，点进任一会话就能看实时时间线、发消息、打断。

三种地址按场景挑一个填（`Prefs.base()` 会自动补 `http://`，带路径前缀也认）：

| 场景 | 填什么 |
| --- | --- |
| 家里 / 同一 WiFi | `<电脑局域网IP>:8737`（面板「手机远程」里会直接显示） |
| 走 Tailscale（装了就有，端到端加密） | `<Tailscale 100.x.y.z>:8737` |
| 外网 / 4G / 异地 | `<公网中继IP>/<32位hex前缀>`（公网中继，见下；具体值见你自己的隧道配置） |

配对码一次性，用过就换；令牌 64 位 hex，撤销在面板「移除」里。

---

## 协议（v1）

```
[Android APK] --HTTP/1.1 + SSE--> [插件自建 http.Server, bind:8737 + 每地址一个 server] --> DSH 内部服务
```

鉴权：`Authorization: Bearer <64 hex>`；除 `/v1/ping` `/v1/pair` `/health` `/apk` 外全要令牌。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 存活探测，不用鉴权 |
| GET | `/apk` | 下载自带 APK，不用鉴权 |
| GET | `/v1/ping` | `{ok,name,version,needsPair,time}` |
| POST | `/v1/pair` | `{code,device}` → `{token,deviceId,server}` |
| GET | `/v1/catalog` | 模型/权限/预设/默认值/**最近目录** `workspaces` |
| GET | `/v1/sessions` | 会话清单（按 updatedAt 降序，最多 200） |
| GET | `/v1/sessions/{id}` | 详情 + 完整时间线 + `seq` |
| POST | `/v1/sessions` | `{cwd,text,requestId,model?,permission?,agentPreset?}` |
| POST | `/v1/sessions/{id}/messages` | `{text,requestId,images?}`，文本与图片至少一样非空 |
| GET | `/v1/sessions/{id}/image/{attachmentId}` | 取图片原始字节（时间线里只给引用） |
| POST | `/v1/sessions/{id}/interrupt` | 打断当前 turn |
| POST | `/v1/sessions/{id}/answer` | `{eventId,action:"allow-once"\|"reject"}` → `{ok,outcome}` |
| GET | `/v1/approvals?session=` | 还没处理的审批（重连兜底） |
| GET | `/v1/questions?session=` | 模型反问：`{questions:[{eventId,sessionId,status,revision,createdAt,questions:[{id,question,header,options,multi_select}]}]}` |
| POST | `/v1/sessions/{id}/question` | `{eventId,answers:[{id,selected:[...],custom?}]}` → `{ok,delivered:"inline"\|"continuation"}` |
| POST | `/v1/sessions/{id}/rename` | `{title}` → `{ok,title,seq}` |
| POST | `/v1/sessions/{id}/archive` | 归档，之后不再出现在 `GET /v1/sessions` |
| POST | `/v1/sessions/{id}/unarchive` | 取消归档 |
| POST | `/v1/sessions/{id}/pin` | `{pinned:bool}` → `{ok,pinned}` |
| GET | `/v1/stream?session=&since=` | SSE：`item` `status` `done` `approval` `question` `error` |

```
POST /v1/sessions/{id}/question
{"eventId":"86c8c592-…","answers":[{"id":"choice","selected":["X"]}]}

200 {"ok":true,"delivered":"inline"}
```

每条问题都必须出现一次；跳过某题就给 `{"id":"…","selected":[]}`（语义等于「略过」）。
少给或重复给会回 400 `bad_answer`，已处理过的 `eventId` 回 400 `question_not_pending`。

SSE 每 20 秒一行 `: ping` 心跳；`since=<seq>` 先补历史再转实时。

### TimelineItem

```json
{"id":"...","seq":42,"role":"user|assistant|system|tool","kind":"text|tool|permission|marker|image",
 "status":"running|done|failed|interrupted","text":"...","title":"...",
 "tool":{"callId":"call_1","name":"bash","status":"running","preview":"$ ls","resultPreview":"..."},
 "image":{"attachmentId":"sha256:...","mediaType":"image/png","width":800,"height":600,"bytes":123456},
 "images":[{"attachmentId":"sha256:..."}]}
```

---

## 手机发图是怎么走通的

```
相册选图 → 端上压到长边 1600 / q85（<2.5MB 的 PNG 截图原样发，别压糊字）
        → Base64.NO_WRAP → POST /messages {"text","images":[{mediaType,data,name}]}
        → host 插件校验 → controller.prompt({content:[{type:"image",mediaType,data}]})
        → DSH 自己 admitPromptContent 落盘成 sha256 附件 → 模型真的看到图
```

回看方向刻意**不**把 base64 放进时间线：一屏十几张图，每次都重传会把手机流量和内存吃光。
时间线只带 `attachmentId`，手机端 `Img.java` 按需拉 `GET /v1/sessions/{id}/image/{attachmentId}`，
12MB LRU 缓存 + 按目标宽度 `inSampleSize` 下采样。

几个实测出来的边界：

| 情况 | 结果 |
| --- | --- |
| 只发图、不打字 | 200，DSH 正常理解图片 |
| 图 + 文字 | 200，时间线一条 `kind:"text"` 带 `images[]` |
| 空消息（无文无图） | 400 `bad_request` |
| 非 canonical base64 | 400 `bad_image` |
| 声明 `image/jpeg` 实为 PNG | 400 `bad_image` |
| 1×1 的极小 PNG | 400 `bad_image`（归一化拒绝），用 ≥64px 的正常图 |
| 当前模型不支持图片输入 | 400 `model_no_image` |
| 取不属于本会话的 attachmentId | 404 `not_found` |

> 发图要求会话当前模型是多模态的。`deepseek-flash` / `deepseek-v4-pro` 都支持；
> 换到纯文本模型时手机端会看到「当前模型不支持图片输入，请先换一个多模态模型再发图」。

---

## 审批是怎么接进去的（关键实现）

DSH 的审批缝在 `@deepseek-ai/dsh-user-approval`：

```js
const answer = Promise.resolve().then(() => this.ctx.waterfall(
  scopeTarget(req.agent, req.agent), 'approval/request', req,
  () => Promise.resolve('unavailable'),
))
```

cordis 的 `waterfall` 是「外层先跑，不调 `next()` 就否决后面的监听者（包括浏览器 UI）」。
所以插件注册的是这样一个监听者（`plugin/lib/approvals.js`）：

```js
this.ctx.on('approval/request', (request, next) => this.answer(request, next), { global: true })
```

- `{ global: true }` 不受 scope 过滤，任意会话的审批都能收到；
- 没有手机在线 → `Promise.resolve(next())`，桌面 UI 照常弹；
- 有手机在线 → 生成 `eventId`，通过 SSE 推 `approval` 事件，等手机 POST `/answer`；
- 手机超时（默认 120s）或请求被 abort → 交回 `next()`，仍没人答就是 DSH 自己的 `unavailable`（fail closed）。

返回词表只有 `allowed-once` `rejected` `cancelled` `unavailable`；`allowed-once` 是唯一的「准」。

> 注意：`danger-full-access` 这个权限预设的 `approval` 是 `never`，用它的会话不会产生审批（直接被拒）。
> 想看到手机上的审批卡片，请把会话权限设成 `workspace-write` 或 `read-only`。

---

## 会话管理（标题投影 / 改名 / 归档）

### 标题为什么以前全是「未命名会话」

`SessionHeader` 里**没有 title 字段**（`dsh-api-session-controller` 的 typert 声明只有
`version/id/createdAt/cwd/parentSession/isSeeded/origin/delegationDepth/agentPreset`），
所以老代码 `header.title || header.firstUserMessage` 永远落到占位串。
真正的标题是日志里的 **`session/title` 事件**：

```json
{"type":"session/title","seq":33,"data":{"title":"询问今日计划的三个选项","messageSeqs":[9],"source":{"kind":"provider"}}}
```

`source.kind` = `provider`（模型自动生成）/ `user`（用户改名）/ `fallback`。

现在的链路：

1. `lib/projection.js` 的 `Timeline.apply` 处理 `session/title`，写进 `timeline.title` / `timeline.titleSeq`（活会话）；
2. 冷会话（重启后没跑过的）走 `sessionQuery.readTitleSnapshots(ids)` 批量扫日志，
   结果进 `titleCache`：**一次请求只同步解析最新 24 条**（`TITLE_BATCH`），其余进后台队列按 3 条一批
   + 120 ms 让出事件循环慢慢焐热 —— 否则 130 个冷会话会把主线程占满 10~20 秒（实测过）。
   缓存 TTL：**有标题 30 分钟、没标题 10 分钟**（负缓存，不然空会话每次列表都重扫）；
   `session/title` 事件到达即失效、改名成功也立即失效；缓存落盘在
   `~/.dsh/phone-harness/titles.json`，重启后是热的；
3. 优先级：**日志/时间线标题 → `header.title` → `header.firstUserMessage` → 「未命名会话」**。

> 老的一批「未命名会话」不会自己变好：它们日志里本来就没有 `session/title` 事件。
> 给它发一条消息重新触发标题生成，或者直接 `POST /rename` 手动起名。

### `GET /v1/sessions` 每行

字段名没动，只**新增** `pinned` / `archived`（拿不到 `workspaceRegistry` 时都是 `false`）：

```json
{"id":"session-…","title":"询问今日计划的三个选项","cwd":"<HOME>",
 "updatedAt":1792529892585,"status":"idle","lastText":"你选了 写代码…","itemCount":7,
 "pinned":false,"archived":false}
```

- 列表**最多 200 行**（`INVENTORY_LIMIT`）；**置顶的永远排在最前**，同组内按 `updatedAt` 降序；
- `GET /v1/sessions?archived=1` 是**归档箱**：只返回已归档的行（手机抽屉第 4 项走这个）；
  `?includeArchived=1` 才是「全都要」（含归档行）；
- **子代理内部会话不进列表**，判据只看 header（不为了判断去激活会话）：
  `header.origin === 'subagent' || header.parentSession != null`。
  真给它发消息会拿到 400 `subagent_session`：「这个会话是子代理的内部会话，手机上不能直接继续」。

### 改名

```http
POST /v1/sessions/{id}/rename
{"title":"给这个会话起个名字"}

200 {"ok":true,"title":"给这个会话起个名字","seq":33}
400 {"error":{"code":"bad_title","message":"标题不能为空"}}
503 {"error":{"code":"title_unavailable","message":"…没有挂载会话标题服务（sessionTitle）…"}}
404 {"error":{"code":"session_not_found","message":"这个会话不存在了"}}
```

底层是 `ctx.get('sessionTitle').rename(session, title)` → `{title, eventSeq}`：

- **必须是活会话**（服务内部断言 `ctx.sessions.get(session.id) === session`），
  所以插件先 `resolveAgent(id)` 把会话拉起来；拉不起来就是 503 / 404；
- 标题会被归一化：去控制字符 / OSC / CSI / ESC、折叠空白、按 UTF-8 字节截断；
- 归一化后没有可见字符 → `SessionTitleInvalidError` → 400 `bad_title`；
- 成功会立刻写进内存时间线，手机不用等 `session/title` 事件回灌；
- 注意 `renameSession` 会把会话激活（起 agent），冷会话改名后状态会变成活的（幂等，无害）。

### 归档 / 取消归档 / 置顶

```http
POST /v1/sessions/{id}/archive     {}  → 200 {"ok":true}
POST /v1/sessions/{id}/unarchive   {}  → 200 {"ok":true}
POST /v1/sessions/{id}/pin         {"pinned":true}  → 200 {"ok":true,"pinned":true}
POST /v1/sessions/{id}/pin         {"pinned":false} → 200 {"ok":true,"pinned":false}
```

底层是 `workspaceRegistry`（`@deepseek-ai/dsh-workspace`）。**语义别猜**：

- 归档**不删文件、不改会话状态**，只是往 `archivedSessionIds` 里加一条；
  `GET /v1/sessions` **默认过滤掉**它们（这就是官方 UI 的行为）；`?archived=1` 是「归档箱」，
  **只**返回归档的；`?includeArchived=1` 是「全都要」；
- 归档时会**自动取消置顶**（DSH 原文：写入 archivedSessionIds 的同时从 pinnedSessionIds 移除）；
- 归档已归档的会话、取消归档未归档的会话都是**幂等 no-op**；
- **归档的会话不能置顶**（`WorkspaceArchivedSessionPinError`）；
- 会话不存在 → 404 `session_not_found`。

**正在跑 turn 的会话**：`archiveSession(id,{})` 会被 `workspace/session-activity` waterfall 拦下来
（`WorkspaceActiveSessionError`）。插件顺序是「先试 → 撞到活跃就 `agent.cancel({kind:'user'})`
再试一次 → 仍失败就 `archiveSession(id,{stopActivity:true})`（官方『先停再做』路径）」。
**所以手机点归档会顺手把这个会话当前的 turn 停掉**，UI 上要说一句。

---

## 模型反问（ask_user_question）怎么答

审批走的是 `approval/request`，模型反问走的是**另一条缝**：`user-questions/request`。
照抄审批那套骨架就行（`plugin/lib/questions.js`）：

```js
this.ctx.on('user-questions/request', (request, next) => this.answer(request, next), { global: true })
```

- 没手机在线 / 超过待处理上限 → `next()`，桌面 UI 照常弹卡片；
- 有手机 → 推 SSE `question` 事件（`status:"open", revision:1`），等手机 `POST /question`；
- 手机答完 → `resolve({answers:[…]})`，同一 `eventId` 再推一次 `status:"resolved", revision:2`；
- 请求被 abort 或超时 → `next()`；仍没人答就是 DSH 自己的 `NO_PROVIDER`。

实测事件序（一条 `ask_user_question` 回合）：

```
item(tool running) → question(open,rev1) → [手机 POST /question] → question(resolved,rev2)
→ item(tool done, resultPreview 带 answers) → status(running)
→ item(assistant text「你选择了 X。」) → item(turn 处理完成) → status(idle) → done(completed)
```

> 参数 `timeout` 走的是 `askTimed`：超时后返回 `{pending:true,callId}`，工具调用立即结束，
> 但问题仍留在 `sessionProjections.userQuestions` 里（`state:"continued"`），手机端
> 之后还能用 `answer(agent, callId, …)` 补答。插件两种模式都接。

### answer 的硬约束

服务端（`dsh-user-questions`）要求 `answer` 恰好覆盖 `request.questions` 的每个 `id` **一次**，
否则抛 `BAD_ANSWER`。跳过某题 = `selected: []` 且不带 `custom`。
插件在 `lib/questions.js` 的 `validateAnswers()` 里用同一判据先挡一遍，回 400 `bad_answer`，
并在 message 里指出是哪一题，手机端直接把这句话显示给用户就行。

### 两种工具模式

| 模式 | 工具怎么执行 | 插件怎么答 |
| --- | --- | --- |
| **legacy**（默认） | `userQuestions.ask({...request, wait:{callId}})`，一直阻塞到有答案 | 窗口内 `resolve(answer)`，直接成为 tool result |
| **timed**（schema 带 `timeout`） | `userQuestions.askTimed(request, callId, timeout*1000)` | 同上；**窗口过期后**工具返回 `{pending:true,callId}`，题目仍是 `continued`，插件改走 `userQuestions.answer(agent, callId, answer)` 补答（steer 一条 `user-question-reply` 用户消息进 agent） |

结论：**窗口内两种都能答；窗口外只有 timed 能补答**（靠 `callId`）。
窗口外的 legacy 问题插件明确回 400 `question_not_pending`，不会假装答上。
响应里的 `delivered` 说明走了哪条路：`"inline"` / `"continuation"`。

### 接口

```http
GET /v1/questions?session=<会话id>
200 {"questions":[{"eventId":"6dc3ae4e-…","sessionId":"session-82c8…","callId":"call_1",
     "timed":false,"status":"open","revision":1,"createdAt":1792529892585,
     "questions":[{"id":"today_plan","question":"今天想做什么？",
       "header":"今天想做什么",
       "options":[{"label":"写代码","description":"…"},{"label":"休息","description":"…"}],
       "multi_select":true}]}]}
```

`session` 省略 = 全实例还没答的；`status` 只会是 `open`（还在等）或
`pending`（timed 窗口已过、仍可补答）。

```http
POST /v1/sessions/{id}/question
{"eventId":"6dc3ae4e-…","answers":[{"id":"today_plan","selected":["写代码"]},
                                 {"id":"other_q","selected":[],"custom":"自己写的"}]}

200 {"ok":true,"delivered":"inline"}
400 {"error":{"code":"bad_answer","message":"缺少问题的答案：choice（跳过请给 selected: []）"}}
400 {"error":{"code":"question_not_pending","message":"这个提问已经处理过或已失效"}}
```

SSE `question` 事件的 payload **与 `GET /v1/questions` 的一行完全同构**，Android 一份解析即可：

```
event: question   data: {…,"status":"open","revision":1}      ← 有人问了
event: question   data: {…,"status":"resolved","revision":2}  ← 已答 / 已失效
```

手机（重）连 SSE 时插件会**主动补发**当前 `status:"open"`（以及 `pending`，timed 模式可补答）
的问题，断线重连不丢卡片。带 `?session=<id>` 连就只补发这个会话的。

### 让位规则（绝不打死工具调用）

| 情况 | 行为 |
| --- | --- |
| 没有手机连着（`server.clients.size === 0`） | 直接 `next()`，桌面 UI 照常弹 |
| 等满超时（默认 120s，同 `approvalTimeoutMs`） | 标 `expired`（timed 标 `pending`），`resolve(next())` 让位 |
| `request.signal` abort（timed 窗口到期 / turn 被打断） | 同上 |
| 手机 SSE 全断 | **10 秒宽限**（切后台/重连很常见），期间连回来就取消；超时才 `next()` |
| `POST /interrupt` | 立刻 `next()`，问题标失效 |
| 插件卸载 | 全部 `next()`，不留悬挂 Promise |

没人接的时候最终是 DSH 自己的 `NO_PROVIDER`，模型会收到这个错误——DSH 本来的行为。

### 已实测（2026-10-21，真机链路）

| 场景 | 结果 |
| --- | --- |
| 模型调 `ask_user_question` → SSE `question`(open,rev1) | 通 |
| `GET /v1/questions?session=` 补拉 | 通，`status:"open"` |
| `POST …/question` 正确答案 | 200 `{ok:true,delivered:"inline"}`；下一帧 `question`(resolved,rev2) → tool done（`resultPreview` 带 answers）→ assistant 引用所选 → `done(completed)` |
| 同一 `eventId` 再发 | 400 `question_not_pending` |
| 未知 `eventId` | 400 `question_not_pending` |
| 答错 id / 漏答 | 400 `bad_answer`（message 指出是哪题） |
| 断线 3 秒再连 | 问题仍在列表，重连补发一帧，答案照样 200 |
| 提问挂着时 `POST /interrupt` | 问题立刻消失，晚到的答案 400 |

---

## 手机端界面

APK 的视觉与交互按 **DeepSeek 官方手机版（com.deepseek.chat 2.6.1）** 重做（`android/src/com/lc/phoneharness/`）。
设计令牌不是猜的：浅/深两套颜色来自官方 APK 真机截图像素采样 + `res/drawable` 里 165 个业务 vector
的 `fillColor` 统计，文案直接搬官方 `values-b+zh+Hans/strings.xml`（693 条）。

**颜色令牌（`Theme.java`，两套主题）**

| 令牌 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `bg` / `surface` | `#FFFFFF` | `#0F0F0F` / `#141414` | 页面底 / 卡片面 |
| `surfaceAlt` | `#F3F4F6` | `#1E1E1E` | 次级面（用户气泡、marker 胶囊） |
| `text` | `#0F0F0F` | `#F8F8F8` | 正文 |
| `muted` / `muted2` | `#7D7F85` / `#8E9094` | `#B9BABB` / `#8E9094` | 次要文字 / 图标灰 |
| `accent` | `#426EFE` | `#507BF2` | 主色（官方 `primary`） |
| `onAccent` | `#FFFFFF` | `#0F0F0F` | 主色上的字（深色主按钮反转） |
| `ok` / `warn` / `bad` | `#22C55E` / `#F59E0B` / `#D93025` | 同 / 同 / `#F25A5A` | 语义色（官方唯一做深浅分离的是 error） |

**界面**

| 区域 | 形态 |
| --- | --- |
| 主题 | 浅色 / 深色 / 跟随系统，抽屉「外观」循环切换（`Prefs.theme()`） |
| 首页 | 顶栏左抽屉 + 中间「鲸域」+ 副标题 + 右新建；正文**置顶分组在最前**，其后按 今天 / 昨天 / 7 天内 / 30 天内 / 更早 分组（官方分组桶名），纯文字条目无卡片边框；置顶行右侧 accent 小胶囊「置顶」，归档行灰胶囊「已归档」 |
| 空态 | 官方文案：`暂无对话` + `你与鲸域的对话\n将展示在这里` |
| 抽屉 | 80% 屏宽，鲸尾 logo + 品牌名 + 新建会话 / 刷新列表 / 连接设置 / **归档箱** / 外观，底部显示当前地址与版本 |
| 归档箱 | 抽屉切换后副标题变「已归档 · N 个」，列表只留归档会话（`GET /v1/sessions?archived=1`） |
| 欢迎页 | 空会话显示官方鲸形主图（`chat_welcome_logo` 43×32dp）+ `今天有什么可以帮到你？` + 两列建议词（分析一下 / 解释一下 / 总结 / 怎么办），点一下填进输入框 |
| 聊天 | 用户消息靠右灰气泡；助手**左侧鲸形头像 + 整宽正文**（官方无助手气泡）；「思考」marker 带 `ic_think` 图标胶囊；工具调用折叠卡（点开看参数与结果）；图片圆角卡 |
| 消息操作条 | 助手消息底部 5 个官方 20dp 图标：复制 · 重新生成 · 喜欢 · 不喜欢 · 分享 |
| 输入区 | 照官方 2.6.1 实测几何重做：一张 28dp 圆角卡片（338dp 宽、外边距 11dp、内边距 16/12/10/10），第一行 `发消息或按住说话`，第二行 **深度思考** / **智能搜索** 两枚 chip（高 30dp、圆角 15dp、14dp 图标 + 13sp 字、间距 11dp）+ ⊕ 上传键 + 三态动作键（空=声波、有字=蓝色实心圆白箭头、语音态=键盘）；点 ⊕ 展开 **拍照 / 相册 / 文件** 三个 77dp 方块。逐部件尺寸、取色与差异处理见 **docs/输入区-composer-复刻说明.md** |
| 反问 | 底部卡片：`DSH 想问你` + 忽略 / 每题标题 + 选项（`Flow` 自动折行）+ `全部跳过` / `回答`，一次提交整批 |
| 长按 | 会话行 → 置顶 / 取消置顶 · 重命名 · 归档 / 取消归档 · 复制会话 ID（随状态变化）；消息 → 复制 / 复制为 Markdown / 重发 / 编辑后重发 / 重发这张图 |

**长按消息的细节**：正文故意没开 `setTextIsSelectable` —— 一开长按就被系统的文字选择器吃掉，
菜单弹不出来。改成给整棵气泡子树递归挂 `setOnLongClickListener`，按消息类型给不同条目：

| 消息类型 | 长按条目 |
| --- | --- |
| 助手消息 | 复制 · 复制为 Markdown |
| 用户消息（纯文字） | 复制 · 复制为 Markdown · 重发 · 编辑后重发 |
| 用户消息（带图） | 上面四条 + 重发这张图 |

「重发」= 把原文字用新的 `requestId` 再发一次；「编辑后重发」= 先填回输入框再发；
「重发这张图」= 按 `attachmentId` `GET /v1/sessions/{id}/image/{attachmentId}` 取回原始字节
（`Api.bytes`，readTimeout 60 秒）→ `Pick.Pending.of` 包回附件条 → 点发送时重新编码上传。
回合正在跑的时候点重发会给一句「还在生成中，先等这一轮跑完」，不会打断当前回合。

**品牌图形与图标**：`res/drawable/` 51 个文件。启动图标与抽屉 logo 是「鲸域」的鲸尾线稿
（品牌站 `brand.js` 那条 56 锚点手绘矢量化 `TAIL_D` 路径，`<group android:rotation="9">` 与官网一致）；
鲸形欢迎主图、助手头像、字标、消息操作图标全部来自官方 APK 的 vector 原文（`official/brand-vectors/`），
导入时统一重着色成白色，运行时用 `setColorFilter` 上色。

**深度思考怎么生效**：chip 开 → 发消息 body 带 `reasoning: "high"` → 宿主 `applySelections`
把它写进 `ModelSelection.reasoningEffort`。会话日志里能验到
`{"type":"model/selection","data":{"provider":"deepseek-account","model":"deepseek-flash","reasoningEffort":"high"}}`。

**快速模式 / 专家模式去哪了**：官方 2.6.1 的输入区只有「深度思考 / 智能搜索」两枚 chip，模型档位在
模型选择器里。所以本项目把原来的档位 chip 从输入区移到了右上角「⋯」菜单（「切换到专家模式 / 切换到快速模式」），
档位仍然决定发消息时带的 `model`（`…/deepseek-flash` 或 `…/deepseek-v4-pro`），新建对话页的两档模型 chip 不变。

---

## 构建 APK

本机没有 Gradle / Android Studio，用 SDK build-tools 手工构建：

```bash
cd android && ./build.sh
# -> android/bin/dsh-phone.apk
```

依赖 `../sdk/{build-tools/android-16, platform/android-35/android.jar}` + JDK。

三个坑已经写在脚本注释里：

1. **步骤顺序必须是 `aapt2 compile → aapt2 link → javac → d8`**。`R.java` 是 `aapt2 link` 生成的，
   先 javac 会得到 15 个 `package R does not exist`。脚本里 link 已经把 `--java build/gen` 打开，
   javac 用 `find src build/gen -name "*.java"` 一起编。
2. **必须用 build-tools/android-16 的 d8**。android-14 的 d8 在 JDK 25 编译出的匿名内部类上会崩（`NullPointerException: Cannot invoke "String.length()" because "<parameter1>" is null`）。
3. **`classes.dex` 必须落在 APK 根目录**。用 `jar --update` 时如果传入 `../dex/classes.dex` 这种带目录的路径，jar 会保留目录，产出 `dex/classes.dex` —— 能装、能开，但 ART 找不到类，一启动就崩。脚本里已经改成 `cd build/dex && jar --update --file ../bin/unsigned.apk classes.dex`，并加了校验。

---

## 常驻运行

插件只在 **DSH 进程活着**的时候工作。用后台进程/终端起的实例会随会话结束被杀掉，所以走计划任务：

**1. `start-phone.py`**（主入口，日志写 `%DSH_HOME%\phone-harness\boot.log`）

用 `pythonw.exe` 跑，`subprocess.Popen` 带 `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW`：

```python
EXE = r"<DSH_INSTALL>\DeepSeek Harness.exe"
CLI = r"<DSH_INSTALL>\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js"
env["DSH_HOME"] = r"<HOME>\.dsh"
env["ELECTRON_RUN_AS_NODE"] = "1"
p = subprocess.Popen([EXE, "--expose-internals", CLI, "--profile", "phone", "--port", "8399", "--no-open"],
                     creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW, ...)
```

为什么要 pythonw 而不用 vbs：`wscript.exe` 在本机跑 `shell.Run` 会报 `0x800704C7 操作已被用户取消`，
计划任务于是挂住不退出（Last Result 267009）、也不启子进程。cmd 那条路还有编码坑（见下）。
pythonw 没有控制台，天然不闪窗，也不经 cmd 解析。

**2. `start-phone.bat`**（手动兜底，直接双击即可，实测可用）

```bat
@echo off
set "DSH_HOME=<HOME>\.dsh"
set "ELECTRON_RUN_AS_NODE=1"
cd /d <HOME>
"<DSH_INSTALL>\DeepSeek Harness.exe" --expose-internals ^
 "<DSH_INSTALL>\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" ^
 --profile phone --port 8399 --no-open >> "%DSH_HOME%\phone-harness\boot.log" 2>&1
```

> **`.bat` / `.vbs` 一律只写 ASCII**。带中文注释的 bat 会被 cmd 按 GBK 解码切碎，报
> `'xxx' 不是内部或外部命令`。上面这几个文件现在都是纯 ASCII。

**3. 注册计划任务（已注册为 `DSHPhone`，`onlogon`）**

```bat
schtasks /create /tn DSHPhone /tr "\"<HOME>\AppData\Local\Programs\Python\Python314\pythonw.exe\" \"<PROJECT_ROOT>\start-phone.py\"" /sc onlogon /rl highest /f
schtasks /run /tn DSHPhone
```

> 实测：`schtasks /run` 约 20 秒后 `bind:8737` + `127.0.0.1:8399` 同时 LISTENING，任务 Last Result = 0。
> 起来之后 `netstat -ano | findstr :8737` 能看到 `bind:8737 LISTENING`。
> 要重启实例：先按 PID 杀掉（`taskkill /PID <pid> /T /F`），再 `schtasks /run /tn DSHPhone`。

**4. 看护（已注册为 `DSHPhoneWatch`，每 5 分钟）**

实例挂了（崩溃、被误杀、重启后没登录）时自动拉回来，活着就什么都不做：

```bat
schtasks /create /tn DSHPhoneWatch /tr "\"<HOME>\AppData\Local\Programs\Python\Python314\pythonw.exe\" \"<PROJECT_ROOT>\watch-phone.py\"" /sc minute /mo 5 /rl highest /f
```

`watch-phone.py` 的判断很简单：`connect("127.0.0.1", 8737)` 成功就退出；失败则看
`%TEMP%\dsh-phone-watch.lock` 的 mtime，3 分钟内刚拉过就跳过（避免 DSH 启动要 20 秒时被连拉三次）。

> 实测：实例活着时跑任务 Last Result = 0 且不动端口；杀掉实例后再跑，约 20 秒端口回来。

**5. 防火墙（已加规则 `DSH phone harness 8737`）**

```bat
netsh advfirewall firewall add rule name="DSH phone harness 8737" dir=in action=allow protocol=TCP localport=8737
```

---

## 公网中继

在外网（4G、别人的 WiFi、异地）连家里这台电脑。链路是：

```
手机 APK
  → http://<公网中继IP>/<32位hex前缀>        （云主机 80 端口）
  → nginx  location /<32位hex前缀>/  →  proxy_pass 127.0.0.1:7100
  → SSH 反向隧道（-R 7100:127.0.0.1:8737）
  → 本机 127.0.0.1:8737                       （插件自己的 http.Server）
```

用的是 SSH 自带的反向转发，没装 frp：零额外守护进程、复用已有的 SSH 密钥、
nginx 只多一个 `location`。云上 `frps` 现在是 inactive，7000 端口虽然放行但没在用。

### 隧道守护 `tunnel-phone.py`

常驻 supervisor，`while True` 循环重连 ssh（纯 ASCII，日志 `%DSH_HOME%\phone-harness\tunnel.log`）：

| 项 | 值 |
| --- | --- |
| 远端 | `-R 127.0.0.1:7100:127.0.0.1:8737` |
| 必带参数 | `-N -T`、`ExitOnForwardFailure=yes`、`ServerAliveInterval=30`、`ServerAliveCountMax=6`、`StrictHostKeyChecking=accept-new`、`BatchMode=yes`、`ConnectTimeout=15` |
| 单实例 | pidfile `%TEMP%\dsh-phone-tunnel.pid`；用 `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` + `GetExitCodeProcess == 259` 判断还活着，活着就直接退出 |
| 重连节奏 | 断了 5s 起，失败一次翻倍，封顶 60s；稳定存活 >120 秒后重置回 5s |

### 两个计划任务

```bat
:: 开机/登录起（onlogon）
schtasks /create /tn DSHPhoneTunnel /tr "\"<HOME>\AppData\Local\Programs\Python\Python314\pythonw.exe\" \"<PROJECT_ROOT>\tunnel-phone.py\"" /sc onlogon /rl highest /f

:: 看护（每 5 分钟；靠 pidfile 单实例保护，活着就什么都不做）
schtasks /create /tn DSHPhoneTunnelWatch /tr "\"<HOME>\AppData\Local\Programs\Python\Python314\pythonw.exe\" \"<PROJECT_ROOT>\tunnel-phone.py\"" /sc minute /mo 5 /f
```

加上实例自己的两个任务，一共四个：

| 任务 | 周期 | 作用 |
| --- | --- | --- |
| `DSHPhone` | onlogon | 拉起 DSH phone 实例（8737 + 8399） |
| `DSHPhoneWatch` | 5 分钟 | 实例挂了拉回来 |
| `DSHPhoneTunnel` | onlogon | 起 SSH 反向隧道 |
| `DSHPhoneTunnelWatch` | 5 分钟 | 隧道挂了拉回来 |

> `DSHPhoneTunnel` 的「上次结果」显示 **267009**（= `0x41301`「任务正在运行」）是正常的，它不是失败码。

### 云上 nginx

`/etc/nginx/snippets/dsh-tunnel.conf`（在自己的 80/443 站点里 server 级 include）：

```nginx
location /<32位hex前缀>/ {
    proxy_pass http://127.0.0.1:7100/;
    proxy_http_version 1.1;
    proxy_set_header Host              <你的隧道域名>;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;          # SSE 必须：不然事件被攒住
    proxy_request_buffering off;  # 大图上传必须
    proxy_read_timeout  3600s;    # SSE 长连接
    proxy_send_timeout  3600s;
    proxy_connect_timeout 10s;
    proxy_next_upstream off;
}
```

`/etc/ssh/sshd_config.d/60-dsh-tunnel.conf`：`AllowTcpForwarding yes` + `GatewayPorts no`（只绑 127.0.0.1，不对外直开）。

### 为什么手机必须填 `http://` 不能填 `https://`

443 上挂的是自签 CA（`/etc/nginx/dsh-tls/ca.pem`，CN=`DSH Relay CA`），SAN 只有 IP。
Android 的 `HttpURLConnection` 不认这个 CA，会直接 `SSLHandshakeException`。
APK 里 `android:usesCleartextTraffic="true"`，所以走 80 明文是通的。

> 想让 443 真的可用：把 `ca.pem` 装进手机「受信任的凭据」（设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书），
> 名字随便填。装完手机浏览器会提示网络被监控，这是自签 CA 的正常表现。

### 实测数据（2026-10-21）

| 项 | 结果 |
| --- | --- |
| `GET /health` 走公网 | 200 |
| 全链路配对 → catalog → SSE → 发消息 → 收回复 | 通（SSE 6 秒 1972 字节，事件是实时的） |
| 7.5MB 图片消息（base64 后） | `POST /v1/sessions` 200，约 13 秒上传，模型正常「看见」 |
| 单条消息体上限 | 插件 40MB，nginx `client_max_body_size 8m` ⇒ 实际卡在 8MB |
| 杀隧道 → 看护恢复 | 502 → 约 5 分钟内回来（实测 20 秒） |

### 公网中继排错

| 现象 | 原因 / 处理 |
| --- | --- |
| 公网 502 | 隧道断了。`cat %TEMP%\dsh-phone-tunnel.pid` 看进程在不在，`schtasks /run /tn DSHPhoneTunnel` 手动拉一次 |
| 公网 404 | URL 前缀写错（末尾那个斜杠可有可无，前缀本身是固定的 32 位 hex） |
| 公网 413 | 图太大。nginx 8m 上限；APK 已把图压到长边 1600/q85，一般是几百 KB |
| SSE 卡住不动、一次吐出全部 | nginx 少了 `proxy_buffering off` 或没带 `X-Accel-Buffering: no` |
| 手机报 SSL 握手失败 | 填成了 `https://`。改回 `http://` |
| 隧道反复重连 | 看 `tunnel.log` 的 `ssh exited code=`；`255` 多半是密钥/网络，`1` 多半是端口被占 |
| 云上 7100 已被别的 sshd 占 | `sudo ss -ltnp | grep 7100`；换端口要同时改 `tunnel-phone.py` 的 `REMOTE` 和 nginx `proxy_pass` |

---

## 排错

| 现象 | 原因 / 处理 |
| --- | --- |
| 装上新 APK 后界面还是老样式 | 安卓不会自动覆盖 debug 同签名的新旧壳；卸载旧的再装，或确认 `dumpsys package com.lc.phoneharness` 的 versionName 是 0.3.0 |
| 首页列表空 / 副标题显示「DSH 手机端」 | 首次加载要读会话日志回填标题，慢的时候 20~60 秒，别当 bug |
| 打开会话只看到「开始处理」和「处理完成」、正文不见了 | 已修：SSE `item` 事件是 `{"item":{…}}` 包一层的，旧版直接解析外层拿到空对象。升到 v0.3.0 即可 |
| 手机点了选项但回合被中断 | 顶栏那个 ⏹ 是打断按钮，位置离标题很近，误触会直接终止 turn |
| 会话列表里一条都发不出消息 | 那些 id 没有 `session-` 前缀的是子代理内部会话，插件已在 `GET /v1/sessions` 里滤掉；升级插件后不应再出现 |
| 手机连不上 | 电脑防火墙放行 8737；确认手机和电脑同一网段（面板里那三个 IP 都显示出来了） |
| `/apk` 404 | 插件包里没带 APK，把 `android/bin/dsh-phone.apk` 复制到 `plugin/assets/` |
| 面板显示「审批转发：不可用」 | 这个 DSH 版本没有 `approval/request` 事件，或者监听者注册失败（看 DSH 日志） |
| 手机点了「允许」没反应 | 会话权限是 `danger-full-access`（approval=never），本来就不会问 |
| 手机接不到审批事件 | 老版本没有 `/v1/approvals`，APK 会自动跳过；新版本重连时会补拉一次 |
| 跑完 `adb devices` 是空的 | 与本插件无关；直接把 APK 传到手机装，或面板里下 |
| 发图回 400 `bad_image` | 图太小（<64px）、格式不在白名单、或 base64 被换行污染；APK 里已用 `Base64.NO_WRAP` |
| 发图回 400 `model_no_image` | 会话模型不支持图片输入，换成多模态模型再发 |
| 发图很慢 / 超时 | 原图太大。APK 会先压到长边 1600；走 4G 时建议用 WiFi 或等 Tailscale 直连 |
| 时间线里图一直转圈 | `Img.load` 拿不到字节：确认插件版本 ≥ v1.2（有 `/image/` 路由），并看 DSH 日志里的 `附件服务不可用` |
| `POST /messages` 回 500 `signal is not defined` | 已修（`runtime.prompt` 少传 signal）；升级插件后重启 |
| 冷会话（重启后没跑过的）发消息报错 | 已修：`resolveAgent` 会把它拉起来；这条路径现在测通 |
| 面板「审批转发」显示可用但手机收不到卡片 | 检查那条会话的权限预设；`danger-full-access` 的 approval=never 产生不了审批 |

---

## 目录

```
plugin/                    DSH 插件（宿主 + 前端面板）
  index.js                 注册服务、端口、配对码、控制 API
  client.js                设置面板（React，无构建）
  lib/server.js            对外 HTTP/SSE（bind:8737）
  lib/runtime.js           DSH 服务封装（会话/目录/发消息/打断）
  lib/projection.js        会话事件 → 手机时间线
  lib/approvals.js         approval/request waterfall 监听者
  lib/questions.js         user-questions/request waterfall 监听者（模型反问）
  lib/store.js             设备令牌 + 一次性配对码
  assets/dsh-phone.apk     随插件分发的安装包
android/                   手机端（纯 Java，无 AndroidX，无 Gradle）
  src/com/lc/phoneharness/  Api Sse Item Img Pick Prefs Root App Theme Flow MaxScroll
                            MainActivity PairActivity ChatActivity NewSessionActivity
  res/drawable/             51 个矢量：官方业务图标 + 鲸形欢迎主图/助手头像/字标
                            + ic_launcher / ic_whale（鲸域鲸尾线稿）
  res/values/strings.xml    官方 zh-Hans 文案（分组桶名 / 消息操作 / 欢迎语 / 空态）
  build.sh                 手工构建脚本
  bin/dsh-phone.apk        产物（152,474 字节，v0.3.0）
brand/                     鲸域品牌源（brand.js / favicon.ico / index.html，从官网 scp 回来）
official/                  官方 APK 逆向产物（REPORT-official.md 视觉、REPORT-official-code.md 代码）
  brand-vectors/           官方品牌 vector 原文（鲸形主图 / 助手头像 / 字标）
  apktool-out/             apktool 解包目录（资源与图标源）
docs/ZTE-手机安装与调试.md  中兴 / nubia 装机 + 开发者选项 + adb + 断点 + 排错（一页速查）
tools/                     asar 读取（asar.mjs）、zstd 日志（zstd-dump.mjs / loggrep.mjs）、
                           图标导入（icon-import.mjs）、一键装机（phone-install.ps1）、
                           远端手机驱动（zte-tunnel.cmd 起隧道 / zte-adb.cmd 转发 adb）
SPEC.md                    协议规范 v1.2
start-phone.py             常驻启动器（pythonw 拉起，计划任务 DSHPhone 调它）
watch-phone.py             看护（每 5 分钟探 8737，挂了就拉回来；任务 DSHPhoneWatch）
tunnel-phone.py            SSH 反向隧道守护（任务 DSHPhoneTunnel / DSHPhoneTunnelWatch）
start-phone.bat            手动启动兜底（纯 ASCII，双击即可）
```
