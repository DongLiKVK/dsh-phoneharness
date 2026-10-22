# HTTP API

所有接口都在手机连的那个端口上（默认 `8737`）。

- **免鉴权**：`GET /health`、`GET /`、`GET /apk`、`GET /dsh-phone.apk`、`POST /v1/pair`
- **需要令牌**：其余 `/v1/*`，请求头 `Authorization: Bearer <64 位十六进制>`
- **控制 API**：`/dsh-phone/api/*`，只挂在宿主的**回环** webServer 上（面板用，手机用不到）

## 一、健康与配对

```http
GET /health
200 {"ok":true,"name":"<机器名>","version":"0.4.1","needsPair":true}
```

`needsPair` 为 `true` 表示还没有任何设备配对过（手机据此决定是先显示「配对」还是直接进会话列表）。

```http
POST /v1/pair
Content-Type: application/json
{"code":"123456","device":{"name":"Pixel","model":"...","os":"Android 15"}}

200 {"token":"<64 hex>","deviceId":"dev_xxx","server":{"name":"...","version":"0.4.1"}}
401 {"error":"bad_code","message":"配对码不正确或已过期…"}
```

配对码一次性、默认 10 分钟有效（`pairingTtlMs`）。

## 二、会话

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/sessions` | 会话列表；`?archived=1` 只列归档；`?includeArchived=1` 全都要 |
| POST | `/v1/sessions` | 新建会话并发第一条消息 |
| GET | `/v1/sessions/{id}` | 会话详情（含时间线快照） |
| POST | `/v1/sessions/{id}/messages` | 追加一条用户消息（**必须带 `requestId`**） |
| GET | `/v1/sessions/{id}/image/{attachmentId}` | 会话内图片字节（带鉴权，防越权取图） |
| POST | `/v1/sessions/{id}/interrupt` | 中断当前 turn |
| POST | `/v1/sessions/{id}/rename` | `{"title":"…"}` |
| POST | `/v1/sessions/{id}/pin` | `{"pinned":true}` |
| POST | `/v1/sessions/{id}/archive` | 归档 |
| POST | `/v1/sessions/{id}/unarchive` | 取消归档 |
| POST | `/v1/sessions/{id}/answer` | 审批：`{"eventId":"…","action":"allow-once"\|"reject"}` |
| POST | `/v1/sessions/{id}/question` | 反问：`{"eventId":"…","answers":[{"id":"…","selected":["…"],"custom":"…"}]}` |

新建会话 / 发消息的请求体（图片走 base64，总量上限 40 MB）：

```json
{
  "requestId": "rnb-018f…",
  "text": "你好",
  "cwd": "D:/work/project",
  "model": "provider/model",
  "permission": "read-only",
  "reasoning": "high",
  "agentPreset": "default",
  "images": [{"mediaType": "image/png", "data": "<base64>", "name": "a.png"}]
}
```

## 三、模型

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/catalog` | 全量 catalog（provider + model + 权限 + 推理档位），老 App 用这条 |
| GET | `/v1/models` | 精简可选项（新 App 用，含 `configurable`/`custom`） |
| POST | `/v1/models/default` | `{"model":"provider/model"}` 设默认 |
| POST | `/v1/models/custom` | 加自定义（openai 兼容通道） |
| DELETE | `/v1/models/custom/{name}` | 删自定义 |

```json
GET /v1/models
200 {
  "providers": [
    {"id":"deepseek-account","label":"DeepSeek 账号","configurable":true,
     "models":[{"id":"deepseek-flash","label":"DeepSeek-V4-Flash","reasoning":true,"vision":false}]}
  ],
  "failures": [],
  "defaults": {"model":"deepseek-account/deepseek-flash"}
}
```

`failures` 里是某家 provider 拉列表失败的原因（不影响其它 provider 展示）。

## 四、实时流（SSE）

```http
GET /v1/stream?session=<id>&since=<seq>
Accept: text/event-stream
```

- 不带 `session` = 订阅全部会话；
- `since` 让服务端先补发 `seq > since` 的条目（断线重连不丢消息，但有上限）；
- 最多同时 8 条流（`MAX_STREAM_CLIENTS`），超了返回 `429 too_many_streams`；
- 服务端每帧形如：

```
event: item
id: 128
data: {"item":{…},"sessionId":"session-…"}

event: status
data: {"sessionId":"…","status":"running|idle","seq":128}

event: approval
data: {"eventId":"…","sessionId":"…","toolName":"bash","reason":"…","actions":["allow-once","reject"]}

event: question
data: {"eventId":"…","sessionId":"…","questions":[…]}

event: done
data: {"sessionId":"…","reason":"completed"}
```

**客户端必须忽略不认识的 `event:`**（协议只增不减）。

时间线条目（`item`）的 `kind`：

| kind | 渲染 | 关键字段 |
| --- | --- | --- |
| `text` | 普通气泡 | `role`（user/assistant）、`text`、`images[]` |
| `marker` | 灰色分隔行 | `title`（如「已思考（用时 3 秒）」）、`text` |
| `tool` | 折叠工具卡 | `tool{name,preview,resultPreview}`、`status` |
| `permission` | 审批条 | `status`（pending/allow-once/reject） |
| `image` | 图片气泡 | `image{mediaType,data}` |

## 五、补拉（重连兜底）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/approvals?session=<id>` | 还没处理的审批 |
| GET | `/v1/questions?session=<id>` | 还没回答的反问 |

行形状与 SSE 的 `approval` / `question` 帧完全一致，Android 一份解析两处复用。

## 六、控制 API（回环，面板用）

挂在宿主 webServer 的 `/dsh-phone/api` 前缀下，只监听回环地址，不需要令牌：

| 方法 | 路径 | 返回 |
| --- | --- | --- |
| GET | `/status` | 运行状态、端口、`binds`、`lan[]{name,address,kind,listening}`、配对码、设备、审批统计、`apkMeta`、`repo` |
| GET | `/apk` | 插件自带 APK 的字节流 |
| GET | `/apk/meta` | `{ok,version,repo,apk{versionName,versionCode,size,md5,builtAt}}` |
| POST | `/pairing` | 换一个新配对码 |
| POST | `/devices/revoke` | `{"id":"dev_…"}` 撤销设备 |

## 七、用户主机的 harness 配置

手机端「用户主机」这一屏要能改这台电脑的 Agent 预设、工作区、权限模式与默认模型，并且要在动手前先看清现状（契约 §1）。三条接口都在同一端口、同一 Bearer 令牌之下。

```http
GET /v1/harness
200 {
  "presets": [
    {"id":"ptc","title":"PTC 模式","description":"包含标准模式的所有能力…","current":true,"usable":true,"builtin":true}
  ],
  "workspaces": [{"cwd":"C:\\work\\task","title":"task","current":true}],
  "defaults": {"model":"pi/glm-4.6","permission":"danger-full-access","agentPreset":"ptc"},
  "capabilities": {"writeConfig":true,"listDirs":true,"configEditor":true},
  "failures": [],
  "workspace": "C:\\work\\task"
}
```

- `presets[].title/description`：**恒为中文**。宿主给中文就直接用宿主的；宿主只给 id 或英文名时，按桌面端逐字文案补全（标准模式 / PTC 模式 / 极简模式 / 创造模式）。`builtin` 表示这个 id 认不认识；`usable=false` 的是加载失败的模式，带 `reason`，手机端置灰、不给点。
- `presets` **永远非空**：名册按 `agentPresets.remoteExportList()`（宿主正式形态，每条带 `isDefault`，用它定 `current`）→ `agentPresets.compositionInventory()` → `agentPresets.list()` → `runtime.catalog().agentPresets` 依次取；四条都拿不到就回内置四条（标准模式 / PTC 模式 / 极简模式 / 创造模式）。走了兜底通道时 `failures[]` 里会有一句中文说明（`area` = `agentPreset`）；宿主没声明的内置预设 `usable=false`，其 `reason` 说明用的是内置兜底名册，写回宿主前会被拒（`unknown_preset`）。
- `presets[].current` 与 `defaults.agentPreset`：新任务默认用哪个模式，同一个值。
- `workspaces[]`：复用 `/v1/catalog` 那条工作区来源（注册表里的 + 最近用过的），上限 12 条；`title` 是短名，`current` 是当前工作区。
- `capabilities`：`writeConfig` 能不能写配置（`false` 时手机端只显示只读警告条）、`listDirs` 能不能浏览主机目录、`configEditor` 宿主有没有配置文件编辑器。
- `failures[]`：`{area, message}`。某一块读不出来时如实列出，其它字段照常返回（不整体失败）。

```http
POST /v1/harness/config
Content-Type: application/json
{"agentPreset":"ptc","workspace":"C:\\work\\task","permission":"danger-full-access","model":"pi/glm-4.6"}

200 {
  "ok": true,
  "applied": {"agentPreset":"ptc"},
  "message": "已切换为 PTC 模式",
  "persisted": true,
  "harness": { …与 GET /v1/harness 完全同形… }
}
```

- 请求体里**没出现的字段不动**；四个字段可以只给一个。
- `message`：给手机直接显示的中文短句（如「已切换为 PTC 模式」「工作区已切换为 task」）。一次改多个字段时用「；」连起来。
- `persisted`：`true` 表示这次改动确实落到 profile 配置里（写完会读回确认）；`false` 表示只在本次运行里生效，`message` 会补一句「（已生效（本次运行））」，手机端据此提示「重启后不保留」。
- 写不动（宿主既没有配置文件编辑器、也没有对应服务）时返回 `503 config_unavailable`，不会假装成功。

```http
GET /v1/harness/dirs?path=C:\\work&showHidden=1
200 {
  "cwd": "C:\\work",
  "parent": "C:\\",
  "roots": [{"name":"C:","path":"C:\\"},{"name":"D:","path":"D:\\"}],
  "entries": [{"name":"task","path":"C:\\work\\task","dir":true,"hidden":false}],
  "showHidden": true
}
```

- **只列目录**，不列文件；`path` 省略时用当前工作区（插件记的偏好 → 最近一次列表 → 进程目录），相对路径按当前工作区解析。
- 名字点开头的目录算隐藏，默认不返回，`showHidden=1` 才给。
- 目录**里**的符号链接一律不返回（不跟随、不展开），避免从浏览入口顺着链接跑到别处。
- Windows 上 `roots` 是探测出来的可用盘符（保证当前盘符在列）；其它平台是 `[{"name":"/","path":"/"}]`。

```http
POST /v1/harness/dirs
{"parent":"C:\\work","name":"task"}
201 {"path":"C:\\work\\task"}
```

新建目录（可选能力）：目录名不能带斜杠、`.`、`..`，Windows 上还不能带 `<>:"|?*` 这些字符。

### 写通道与「当前工作区」

| 改什么 | 落到哪儿 |
| --- | --- |
| `agentPreset` | profile 条目 `agent-preset-registry` 的 `selectedDefault`（volatile，走宿主 settings 服务；退路是配置文件编辑器 `configEditor`） |
| `permission` | profile 条目 `permission` 的 `defaultPreset`（volatile，同上） |
| `model` | 复用既有的 `POST /v1/models/default` 那条通道（`agentDefaultModel.saveSelection`） |
| `workspace` | **本插件自己的** profile 条目里的 `workspace`（见下） |

宿主没有「切换当前工作区」的服务（`workspaceRegistry` 只有 list/get/create/resolveByPath/archive/pin；桌面端点一下工作区只是前端导航），所以工作区是插件自己的偏好：先改本次运行，再写进插件自己的配置条目。写不进就 `persisted=false`，不谎报。

> 注意：工作区这类**普通字段**的写入会走配置文件的常规生命周期，可能触发本插件重载；预设 / 权限是 volatile 字段，不会重载插件。
## 八、错误码

响应体统一 `{"error":"<code>","message":"<人话>"}`：

| code | HTTP | 场景 |
| --- | --- | --- |
| `bad_code` | 401 | 配对码错/过期 |
| `unauthorized` | 401 | 缺令牌或令牌已撤销 |
| `bad_request` | 400 | 参数缺失（如没带 `requestId`） |
| `bad_json` | 400 | 请求体不是合法 JSON |
| `body_too_large` | 413 | 超过 40 MB（多半是图太大） |
| `session_not_found` | 404 | 会话不存在/已删 |
| `not_found` | 404 | 路由不存在 |
| `no_apk` | 404 | 插件包里没带 APK |
| `model_no_image` | 400 | 当前模型不支持图片 |
| `bad_image` | 400 | 图片格式/大小/编码不对 |
| `too_many_streams` | 429 | 同时连的手机太多（上限 8） |
| `question_unavailable` | 503 | 该实例没挂反问桥 |
| `bad_path` | 400 | 浏览目录：路径用不了（不是目录、非法字符） |
| `bad_name` | 400 | 新建目录：名字不合法 |
| `bad_workspace` | 400 | 切工作区：路径不存在 / 不是目录 / 不可写 |
| `unknown_preset` | 400 | 切模式：id 不认识，或这个模式加载失败 |
| `unknown_permission` | 400 | 切权限：id 不认识 |
| `unknown_model` | 400 | 切默认模型：id 不认识 |
| `config_unavailable` | 503 | 配置改不动（既没有 configEditor，也没有对应宿主服务）；harness 通道没起来时也用它 |
| `forbidden` | 403 | 浏览 / 新建目录没有权限 |
| `exists` | 409 | 新建目录：同名已存在 |
| `internal` | 500 | 兜底 |
