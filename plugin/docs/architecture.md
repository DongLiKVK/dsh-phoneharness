# 架构与扩展点

一行话：**宿主侧插件**把 DSH 的会话能力包成一层 HTTP/SSE 服务，**手机 APK** 是一个原生 Android 客户端，两边只通过 `/v1/*` 说话。

## 一、进程与模块

```
┌──────────────── 宿主进程（DSH）────────────────┐
│  cordis 容器                                    │
│   ├─ index.js        生命周期、配置、bind 解析、  │
│   │                  控制 API、APK 元数据        │
│   ├─ lib/server.js   HTTP 路由 + SSE + 鉴权      │
│   ├─ lib/runtime.js  Harness 桥（会话/提示/投影）│
│   ├─ lib/approvals.js 审批 waterfall 桥          │
│   ├─ lib/questions.js 反问 waterfall 桥          │
│   └─ client.js       设置面板（React，无构建）    │
│          ↕ /dsh-phone/api（回环，面板用）        │
│          ↕ /v1/*（对外，手机用，Bearer）         │
└──────────────────────────────────────────────────┘
                    ↕ HTTP / SSE
┌──────────────── 手机（Android）─────────────────┐
│  Api.java  Sse.java  Item.java  Img.java        │
│  ChatActivity  MainActivity  Seats.java  …      │
└──────────────────────────────────────────────────┘
```

### 宿主侧文件

| 文件 | 行数 | 职责 | 关键入口 |
| --- | --- | --- | --- |
| `plugin/index.js` | ~402 | 插件入口：读配置、解析 bind、起 `PhoneServer`、挂审批/反问桥、挂控制 API | `apply(ctx, config)`、`readConfig()`、`resolveBind()`、`lanAddresses()`、`apkMeta()` |
| `plugin/lib/server.js` | ~563 | 路由分发、Bearer 鉴权、SSE 广播、APK 下载、会话图片转发 | `PhoneServer.handle()`、`openStream()`、`sendApk()` |
| `plugin/lib/runtime.js` | ~1202 | 把 Harness 的 agent 会话包成手机可用的一组方法 | `catalog()`、`createSession()`、`prompt()`、`listSessions()`、`interrupt()`、`hydrate()` |
| `plugin/lib/projection.js` | ~329 | 把 Harness 事件流投影成手机可直接渲染的 TimelineItem | `Timeline.apply()` |
| `plugin/lib/models.js` | ~770 | 模型 catalog、默认模型、自定义模型（openai 兼容通道） | `models.list/addCustom/removeCustom` |
| `plugin/lib/approvals.js` | ~248 | 接管 `approval/request` waterfall，手机在线才接管，超时让位桌面 | `ApprovalBridge` |
| `plugin/lib/questions.js` | ~466 | 接管 `user-questions/request`，把模型反问推到手机 | `QuestionBridge` |
| `plugin/lib/store.js` | ~109 | 设备令牌库 + 配对码 | `DeviceStore`、`PairingCode` |
| `plugin/lib/http.js` | ~55 | `sendJson` / `sendError` / `readJson` | — |
| `plugin/client.js` | ~582 | 设置面板：状态卡、地址卡、配对码、设备、关于/更新 | `Panel`、`Address` |

### 手机侧文件

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `ChatActivity.java` | ~2761 | 会话页：消息列表、composer、审批条、反问卡、工具卡、长按菜单、TTS |
| `MainActivity.java` | ~2181 | 首页/新对话、历史抽屉、搜索、多选、归档箱 |
| `Seats.java` | ~1454 | 模型 / 权限 / 推理档位选择器、自定义模型表单 |
| `SettingsActivity.java` | ~1029 | 设置页（账户/应用/语音/关于）、外观、字体大小 |
| `HostsActivity.java` | ~753 | 已保存主机管理、连接设置 |
| `NewSessionActivity.java` | ~353 | 新建会话（工作区/模型/权限） |
| `Theme.java` | ~273 | 颜色、尺寸、圆角、字号缩放、元件工厂 |
| `Hosts.java` / `Prefs.java` | 267 / 210 | 多主机配置 / 本地偏好 |
| `PairActivity.java` | ~248 | 配对页（地址 + 6 位码） |
| `Api.java` / `Sse.java` | 234 / 145 | HTTP 封装 / SSE 解析 |
| `Item.java` / `Flow.java` / `Img.java` | 147 / 77 / 126 | 时间线条目模型 / 反问卡模型 / 图片加载 |

## 二、一次「手机发消息」的完整路径

1. 手机 `Api.post("/v1/sessions/<id>/messages", {text, requestId, model, permission})`；
2. `lib/server.js` 校验 Bearer → `runtime.prompt(...)`；
3. `lib/runtime.js` 调 Harness 的 `session.prompt()`，并监听该 agent 的帧；
4. 帧经 `lib/projection.js` 变成 `TimelineItem`（`text / marker / tool / image / permission`）；
5. `lib/server.js` 把变化的条目通过 SSE 帧 `event: item` 推给所有在线手机；
6. 手机 `Sse.java` 解析 → `ChatActivity` 增量刷新；
7. 需要审批时 `lib/approvals.js` 拿到 `approval/request`，推 `event: approval`，手机点「允许一次 / 拒绝」→ `POST /v1/sessions/<id>/answer`。

## 三、扩展点

### 加一个 `/v1` 接口

1. `plugin/lib/server.js` 路由分发处（`route === 'xxx'` 的 if 链）加分支；
2. 逻辑写在 `lib/runtime.js`（或新模块）里，别把 Harness API 直接写进 server；
3. 手机侧 `Api.java` 加同名方法，返回类型用 `JSONObject`；
4. 文档补 `plugin/docs/api.md`，并保证老手机忽略新字段。

### 加一种时间线条目

1. `plugin/lib/projection.js` 产新的 `kind`；
2. `android/.../Item.java` 里解析该字段（`isTool()` / `isPermission()` 之外再加判定）；
3. `ChatActivity.java` 的 `bubble()` 分支里画它；
4. 保持向后兼容：老 APK 不认识时会走 `body()` 的兜底文本。

### 加一张面板卡片

`plugin/client.js` 的 `Panel` 里加一段 JSX（这里是手写 `React.createElement`，没有构建步骤），文案走 `zh`/`en` 两套字典，样式进 `S`。数据要么来自 `/status`（在 `index.js` 里补字段），要么新开控制 API。

### 加一种模型通道

`plugin/lib/models.js` 已经有「自定义模型」表单（openai 兼容 base_url + api key + 模型名）。如果是新的 provider 类型，在 `models.js` 里加 adapter；如果是改默认值，改 `config.model` 即可。

### 改权限档位

宿主侧 `lib/runtime.js` 的 `selections` 里做映射；手机侧 `Seats.java` 画档位。两边文案都以宿主返回的 `catalog.permissions` 为准，避免各写一份。

### 加语言

`plugin/client.js` 里复制一份 `zh` 字典改成 `ja`，加进 `ctx.locale.register()`；手机侧文案在 `android/res/values-*/strings.xml`。

## 四、设计约束（改代码前先看）

- **不要改 `/v1` 已发布语义**：手机在用户手里，升级不同步。只加字段/加路由。
- **审批/反问必须「手机在线才接管」**：否则桌面端会失去审批能力（`hasPhone: () => server.clients.size > 0` 的意义）。
- **不要在主线程做重活**：`/status` 每 5 秒被面板轮询，所以 APK 的 md5 用 `mtime+size` 缓存（`apkMeta()`）；
- **出错要能被面板看见**：`server.lastError` → `status.error`，不要让插件静默失败。
- **令牌不进日志**：`boot.log` 只记地址与配对码状态。
