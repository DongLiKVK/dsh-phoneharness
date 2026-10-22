# Phone ⇄ DSH Harness 远程控制 · 协议规范 v1.3

本文件是「host 插件」与「Android APK」之间唯一的契约。双方各自实现，不得单方面改动。

> v1.1 相对 v1 的新增（都是向后兼容的附加项）：
> `/v1/catalog` 多一个 `workspaces` 数组；`defaults.model` 改为取 profile 实际配置；
> 新增 `GET /v1/approvals?session=`；`POST /answer` 回包里带 `outcome`；新增 `GET /apk`。
> 审批的实现方式也换了：不再是客户端交互流，而是 host 插件注册的 `approval/request` waterfall 监听者。
>
> v1.2 新增：**图片消息**。`POST /v1/sessions` 与 `POST /v1/sessions/{id}/messages` 接受可选的
> `images` 数组（base64 内联）；`TimelineItem` 多一种 `kind:"image"` 与 `images[]`；
> 新增 `GET /v1/sessions/{id}/image/{attachmentId}` 直接把图片字节取回来（时间线里只放引用，不放 base64）。
>
> v1.3 新增：**用户主机 harness 配置的读/写**。新端点 `GET /v1/harness`（读：Agent 预设 / 最近工作区 / 当前默认值与能力）、
> `POST /v1/harness/config`（写：改主机侧的预设 / 工作区 / 模型 / 权限）、`GET /v1/harness/dirs`（浏览主机目录，只列目录）、
> `POST /v1/harness/dirs`（可选，新建目录）。手机端在首页 composer 的座位行上以两枚 chip（工作区、Agent 预设）承担「查看与修改」，
> 顺序与桌面一致：工作区 → 预设 → 模型 → 权限。全部是向后兼容的附加项，旧客户端可忽略。

## 0. 拓扑

```
[Android APK] --HTTP/1.1 + SSE--> [host 插件自建 http.Server, 绑 0.0.0.0:PORT] --> DSH 内部服务
```

- DSH 自带 webServer 只监听 127.0.0.1（实测），手机连不上。所以 host 插件必须自己 `http.createServer()` 绑 `0.0.0.0`。
- 默认端口 **8737**（可在插件 config 里改）。局域网地址形如 `http://<LAN_IP>:8737`。
- 无云端中转，无 TLS（局域网内明文；用一次性配对码 + device token 授权）。

## 1. 鉴权

- 配对前所有 `/v1/*` 返回 401 `{"error":{"code":"unauthorized"}}`。
- 配对：`POST /v1/pair` 带 `{"code":"123456","device":"Xiaomi 14"}`。
  - `code` 由 host 侧生成：6 位数字，TTL 10 分钟，一次性；在 DSH 侧栏面板和 host 日志里显示。
  - 成功返回 `{"token":"<64 hex>","deviceId":"...","server":{"name":"...","version":"0.1.0"}}`。
  - 之后所有请求带 `Authorization: Bearer <token>`。
- 同一 token 长期有效，存在 host 的 `<dataRoot>/devices.json`。

## 2. 端点

所有响应 `Content-Type: application/json; charset=utf-8`，错误形如
`{"error":{"code":"bad_request","message":"..."}}`。

错误码一览：

| code | HTTP | 含义 |
| --- | --- | --- |
| `unauthorized` | 401 | 无令牌 / 令牌不认 / 配对码错或过期 |
| `bad_request` | 400 | 参数缺失或非法（如空消息、cwd 不存在） |
| `bad_json` | 400 | 请求体不是合法 JSON |
| `bad_image` | 400 | 图片编码/类型/大小不合格（非 canonical base64、声明类型与字节不符、超限） |
| `model_no_image` | 400 | 当前模型不支持图片输入 |
| `body_too_large` | 413 | 请求体超过 40MB |
| `not_found` | 404 | 会话或附件不存在（含「这张图不在这个会话里」） |
| `approval_not_pending` | 409 | 审批已处理或已过期 |
| `service_unavailable` | 503 | DSH 侧服务读不到附件 |
| `unknown_preset` | 400 | 预设 id 不在可用列表里（v1.3） |
| `unknown_model` | 400 | 模型 id 未知（v1.3） |
| `unknown_permission` | 400 | 权限 id 未知（v1.3） |
| `bad_workspace` | 400 | 工作区路径不存在 / 不是目录 / 读不了（v1.3） |
| `bad_path` | 400 | 目录浏览路径非法（v1.3） |
| `bad_name` | 400 | 新建目录的名字非法（v1.3） |
| `forbidden` | 403 | 目标路径不允许访问（v1.3） |
| `exists` | 409 | 新建目录时目标已存在（v1.3） |
| `config_unavailable` | 503 | 主机既没有配置写入通道、插件配置也不可写（v1.3） |

### GET /v1/ping（无需鉴权）
```json
{"ok":true,"name":"HOST-PC","version":"0.1.0","needsPair":true,"time":"2026-10-20T18:30:00.000Z"}
```

### POST /v1/pair
见上。

### GET /v1/catalog
```json
{"models":[{"id":"buddy/deepseek-v4.1-flash","title":"deepseek-v4.1-flash","providerName":"buddy"}],
 "permissions":[{"id":"danger-full-access","name":"Full access"}],
 "agentPresets":[{"id":"ptc","title":"PTC"}],
 "defaults":{"model":"buddy/deepseek-v4.1-flash","permission":"danger-full-access","agentPreset":"ptc"}}
```
（任一数组可以是空数组；客户端必须能处理空。）

补充字段（v1.1 新增，客户端可选择忽略）：
```json
{"workspaces":[{"cwd":"C:\\work\\repo","title":"repo"}],
 "defaults":{"model":"deepseek-account/deepseek-flash","permission":"danger-full-access","agentPreset":"standard"}}
```
- `workspaces`：本机最近用过的目录，最多 8 条，给手机端「新建会话」做成一键填充（手机上敲 Windows 路径太痛苦）。
- `defaults.model` 优先取 profile 里 `agent-default-model` 的实际配置，而不是 catalog 里第一个 provider —— 第一个往往是没配 key 的那家。

### GET /v1/sessions
```json
{"sessions":[{"id":"session-uuid","title":"修复登录 bug","cwd":"C:\\work","updatedAt":1760900000000,
  "status":"idle|running|failed","lastText":"...","itemCount":42}]}
```
按 `updatedAt` 降序，最多 200 条。

### GET /v1/sessions/{id}
```json
{"id":"session-uuid","title":"...","cwd":"C:\\work","status":"running","seq":128,
 "items":[ <TimelineItem>, ... ]}
```
`seq` = 已投影到的最新事件序号；客户端记下来用于 `/v1/stream?since=seq` 续传。

### POST /v1/sessions
新建会话并立刻发第一条消息。
请求：`{"cwd":"C:\\\\work","text":"帮我看看","requestId":"<client-uuid>","model":"...","permission":"...","agentPreset":"...","images":[...]}`
响应：`{"sessionId":"session-uuid","accepted":true}`
- `requestId` 由客户端生成（UUID），用于幂等重试：同一 requestId 重复提交不得产生第二条消息。
- `cwd` 必须是 host 上存在的绝对目录；否则 400 `bad_request`。
- `model`/`permission`/`agentPreset` 可省略，省略则用 defaults。
- `images` 可选，见 §2.1。

### POST /v1/sessions/{id}/messages
`{"text":"继续","requestId":"<client-uuid>"}` → `{"accepted":true,"seq":130}`

带图片时：
`{"text":"看下这个报错","requestId":"<client-uuid>","images":[{"mediaType":"image/jpeg","data":"<canonical base64>","name":"IMG_0042.jpg"}]}`
- `text` 与 `images` 至少有一个非空，否则 400 `bad_request`（`消息不能为空`）。
- **允许纯图片消息**（`text` 为空串或省略）。

### 2.1 图片消息（v1.2）

图片**不上传、不走回执**，就是一个内联的 base64：

```json
{"mediaType":"image/jpeg","data":"/9j/4AAQSkZJRg...","name":"IMG_0042.jpg"}
```

- `mediaType` 只接受 `image/png` `image/jpeg` `image/webp` `image/gif`；
- `data` 必须是 **canonical base64**（重新编码后要与原文完全一致，不带换行）；声明类型必须与实际字节的 magic 相符，否则 400 `bad_image`；
- host 侧硬上限：单图 20MB（解码后）、单条消息合计 200MB（base64 之前）、请求体 40MB；超出分别 400 / 413；
- 会话当前模型必须支持图片输入。不支持时 400 `model_no_image`（`当前模型不支持图片输入，请先换一个多模态模型再发图`）；
- 手机端建议：长边压到 1600、JPEG q85（几百 KB）；原图 <2.5MB 的 PNG 截图原样发，避免字被压糊。

### GET /v1/sessions/{id}/image/{attachmentId}
取回一张图的原字节。

- 响应体是图片本身，`Content-Type` 为它的 `mediaType`，`Cache-Control: private, max-age=86400, immutable`；
- `attachmentId` 形如 `sha256:<64 hex>`，含 `:`，URL 里要编码成 `sha256%3A<hex>`；
- 只在这个会话真的引用过这张图时才给；否则 404 `not_found`（`这张图不在这个会话里`）；
- 时间线里永远只放引用（见 §3 `image` 字段），base64 不重复下发 —— 否则每刷一屏都要重传整段历史。

### POST /v1/sessions/{id}/interrupt
→ `{"ok":true}`

### GET /v1/approvals?session=<id>
补拉还没处理的审批（SSE 只推增量，手机重连会错过 `approval` 帧；进会话和每次重连成功各拉一次）。
```json
{"approvals":[{"eventId":"...","sessionId":"...","toolName":"write","callId":"call_00_...",
  "reason":"escalate sandbox to danger-full-access: ...","createdAt":1760900000000,
  "actions":[{"actionId":"allow-once","label":"允许一次"},{"actionId":"reject","label":"拒绝"}]}]}
```
只返回 `status === "open"` 的条目；空数组表示没有待处理的审批。

### POST /v1/sessions/{id}/answer
回答一个审批/提问交互。
`{"eventId":"...","action":"allow-once"}`（或 `"reject"`）→ `{"ok":true,"outcome":"allowed-once"|"rejected"}`
- `eventId` 来自 SSE 的 `approval` 事件（`status === "open"` 的那一帧）或 `/v1/approvals`。
- 已经处理过 / 已过期的 `eventId` → 409 `approval_not_pending`，客户端应把它从卡片上撤掉。
- 服务的实现是插件注册的 `approval/request` waterfall 监听者；**没有手机在线时不会接管**，桌面 UI 照常弹。

### 2.2 用户主机 harness（v1.3）

手机端不再自己存一份 harness 配置，而是**直接读/写用户主机的 harness**。四个端点都要求 `Authorization: Bearer <token>`（与 `/v1/catalog` 同一条校验路径）。

#### GET /v1/harness

```json
{
  "presets": [
    { "id": "standard", "title": "标准模式", "description": "处理代码、文件和资料，适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。",
      "current": false, "usable": true, "builtin": true, "reason": null },
    { "id": "ptc", "title": "PTC 模式", "description": "包含标准模式的所有能力，更适合批量调用工具，并对结果进行筛选、整理、去重、统计或汇总的任务。",
      "current": true, "usable": true, "builtin": true, "reason": null }
  ],
  "workspaces": [ { "cwd": "C:\\work\\repo", "title": "repo", "current": true } ],
  "defaults": { "model": "deepseek-account/deepseek-flash", "permission": "danger-full-access", "agentPreset": "ptc" },
  "capabilities": { "writeConfig": true, "listDirs": true, "configEditor": true },
  "failures": []
}
```

- `presets[].title` / `description` 是**中文文案**，手机端直接显示，不要自己再翻译或映射。主机侧只有英文名或 id 时，插件按桌面同名文案补全（标准模式 / PTC 模式 / 极简模式 / 创造模式）。
- `usable=false` 的预设仍然出现在列表里，手机端置灰不可点；`reason` 给不可用原因。
- `builtin` 区分内置 / 自定义，供手机端分组。
- `workspaces` 是本机最近用过的目录（最多 12 条，含当前默认）；`current=true` 标当前生效项。
- `capabilities.writeConfig=false` 时 `POST /v1/harness/config` 会一律返回 503，手机端应把「只读」提示出来。
- `failures` 沿用 `/v1/catalog` 的失败清单形状，可为空数组。

#### POST /v1/harness/config

请求体（至少一个字段，未出现的字段不改）：

```json
{ "agentPreset": "ptc", "workspace": "C:\\work\\repo", "permission": "danger-full-access", "model": "deepseek-account/deepseek-flash" }
```

响应 200：

```json
{ "ok": true,
  "applied": { "agentPreset": "ptc" },
  "message": "已切换为 PTC 模式",
  "persisted": true,
  "harness": { ...与 GET /v1/harness 完全同形... } }
```

- `message` 是给手机端直接 `Toast` 的中文短句。失败时也用中文（客户端把它拼进「无法切换到「X」：<原因>」）。
- `persisted=true` 表示已写进 profile 配置（重启后仍在）；`false` 表示只在本次运行内生效，手机端要提示「已生效（本次运行）」。
- 写成功后**不再需要二次 GET**：响应里的 `harness` 就是刷新后的快照。
- 写失败时 `harness` 字段缺席，客户端保留原状态并把 chip 回滚。
- `applied` 只包含真正改动的字段（用于客户端确认哪一项生效了）。

#### GET /v1/harness/dirs?path=<主机路径>[&showHidden=1]

```json
{ "cwd": "C:\\work",
  "parent": "C:\\",
  "roots": [ { "name": "C:", "path": "C:\\" }, { "name": "D:", "path": "D:\\" } ],
  "entries": [ { "name": "repo", "path": "C:\\work\\repo", "dir": true, "hidden": false } ] }
```

- **只列目录**（工作区只能是目录）；点开头的目录默认不返回，`showHidden=1` 才返回。
- `path` 省略时 `cwd` 取主机当前默认工作区，`parent` 是它的上一级（到盘符根为止）。
- 只读操作，不写任何文件。路径非法 / 不存在 / 不可读分别 400 `bad_path` / 404 `not_found` / 403 `forbidden`。

#### POST /v1/harness/dirs（可选实现）

```json
{"parent":"C:\\work","name":"newdir"} → 201 {"path":"C:\\work\\newdir"}
```

桌面端的目录选择浮层有「新建文件夹」，手机端可以不做；做了就是这条。名字非法 400 `bad_name`，已存在 409 `exists`。

### GET /apk（无需鉴权）
下载插件自带的手机安装包（`application/vnd.android.package-archive`）。
手机浏览器打开 `http://<电脑IP>:8737/apk` 即可安装，省得先配对再传文件。

### GET /v1/stream?since=<seq>[&session=<id>]
SSE，`Content-Type: text/event-stream`，不缓冲（`X-Accel-Buffering: no`）。
每 20s 发一行注释 `: ping` 心跳。事件格式：

```
id: <该事件对应的事件序号>
event: item
data: {"item": <TimelineItem>}

event: remove
data: {"id":"item-xxx"}

event: status
data: {"sessionId":"...","status":"running","seq":130}

event: approval
data: {"sessionId":"...","eventId":"...","title":"请求批准：shell","reason":"...","actions":[{"actionId":"allow-once","label":"允许一次"},{"actionId":"reject","label":"拒绝"}]}

event: done
data: {"sessionId":"...","reason":"completed|failed|interrupted"}
```
`since` 提供时先补发 seq > since 的历史 item，再转实时。`session` 省略则推送所有会话。

## 3. TimelineItem（双方共用）

```json
{"id":"item-1a2b","seq":42,"ts":1760900000000,
 "role":"user|assistant|system|tool",
 "kind":"text|tool|permission|marker|image",
 "status":"running|done|failed|interrupted",
 "text":"markdown 正文",
 "tool":{"callId":"call_1","name":"bash","status":"running|done|failed","preview":"$ ls -la","resultPreview":"..."},
 "image":{"attachmentId":"sha256:...","mediaType":"image/png","width":800,"height":600,"bytes":123456,"name":"a.png"},
 "images":[ ...同 image 形状... ],
 "title":"可选标题"}
```
- `role=user` / `assistant` 且 `kind=text`：正文放 `text`。
- `kind=tool`：`tool.name` 必有；`preview`/`resultPreview` 是截断到 400 字符的单行摘要。
- `kind=permission`：仅作历史留痕，不可再回答。
- `kind=marker`：系统标记（压缩、turn 结束等），UI 用小灰字。
- `kind=image`：这条本身是一张图（纯图消息），`text` 为空，图在 `image`。图片字节**不在**事件里，客户端拿 `attachmentId` 去 `GET /v1/sessions/{id}/image/{attachmentId}` 取。
- `kind=text` 的消息若同时带了图，`images` 数组里放这些图的引用（可能多张，也可能没有该字段）。
- 客户端按 `seq` 升序渲染，同 id 后用新版本覆盖（upsert）。

## 4. 客户端要求（APK）

1. 首次启动：输入 `http://IP:PORT` + 6 位配对码 → 存 token（SharedPreferences）。
2. 会话列表：下拉刷新；点进去看时间线。
3. 会话详情：SSE 实时流；底部输入框发消息；running 时显示「停止」按钮。
4. 收到 `approval` 事件弹出卡片：允许一次 / 拒绝。
5. 断线自动重连（指数退避 1s→2s→5s→10s，带 `since` 续传）。
6. 全部中文文案。
7. 发图：`ACTION_OPEN_DOCUMENT`（`image/*`，不需要任何存储权限），端上压缩后 base64 进 `images`；一条消息最多 6 张。
8. 看图：时间线里按 `attachmentId` 懒加载（独立 GET + 内存缓存），点击看大图。

## 5. 构建

无 Gradle / 无 AndroidX。纯 Java + `org.json`（Android 框架自带）+ `HttpURLConnection`。
工具链：`sdk/build-tools/android-16/{aapt2.exe,d8.bat,apksigner.bat,zipalign.exe}` + `sdk/platform/android-35/android.jar` + JDK 25 `javac --release 8`。

- **必须用 build-tools/android-16 的 d8**：android-14 的 d8 在 JDK 25 编译出的匿名内部类上会崩（`NullPointerException: Cannot invoke "String.length()" because "<parameter1>" is null`）。
- `classes.dex` 必须落在 APK 根目录；用 `cd build/dex && jar --update --file ../bin/unsigned.apk classes.dex`，构建脚本里有断言。
