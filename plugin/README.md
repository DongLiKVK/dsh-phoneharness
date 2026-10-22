# dsh-phoneharness

**用手机接管这台电脑上的 [DeepSeek Harness](https://github.com/deepseek-ai) 会话。** 插件在宿主开一个自建 HTTP/SSE 端口，手机 APK 连上去就能发指令、看时间线、批准工具调用、回答模型反问——和坐在电脑前一样。

```
手机（原生 APK） ──HTTP/SSE──▶ 宿主插件（cordis） ──▶ DSH 会话 / 工具 / 审批
```

- 一次性 6 位配对码换长期设备令牌，令牌只存本机 `~/.dsh/phone-harness/devices.json`（0600）
- 默认监听回环 + 局域网 + Tailscale（`bind: loopback,lan,tailscale`），不往 `0.0.0.0` 上摊开；没装 Tailscale 时该项自动跳过
- 一条 SSE 流同时带「消息增量 / 状态 / 审批 / 反问」四类帧，断线用 `since=seq` 补齐
- 随插件分发 APK：手机浏览器打开 `http://<电脑>:8737/apk` 直接下，不用先配对

## 功能

| 能力 | 手机侧表现 |
| --- | --- |
| 会话列表 / 新建 / 改名 / 置顶 / 归档 | 抽屉按「今天 / 昨天 / 7 天内 / 30 天内 / 更早」分组，支持搜索与多选 |
| 流式对话 | 增量出字、思考行可展开、工具调用折叠卡 |
| 审批转发 | 手机在线才接管，超时自动交回桌面端，两边不打架 |
| 模型反问（`ask_user_question`） | 单选/多选/自定义答案直接回填 |
| 模型选择 | provider / model / 推理档位 / 自定义 OpenAI 兼容通道 |
| 权限选择 | 只读 / 工作区写 / 完全权限（危险档位二次确认） |
| 图片 | 拍照、相册、文件上传；会话内图片走带鉴权的字节流 |
| 设置面板 | 服务状态、三地址（各带用途与场景）、配对码、设备撤销、版本与更新说明 |
| 更新检测 | 宿主启动 8 秒后查一次 npm / GitHub（可加自建 `updateFeed`），面板显示「有新版 / 已是最新 / 无法检测」并支持一键复查与开关 |

## 快速开始

**不需要 Tailscale**：手机和电脑连同一个 WiFi 就能用（默认 `bind` 已含 `lan`）。只有手机在外网 / 4G 时才建议装 Tailscale。设置面板里有「外网接入（可选 · Tailscale）」卡片，按机器状态显示**未安装 / 已安装·未生效 / 已就绪**，未装时直接给出电脑版与手机版下载入口。

```bash
# 1) 装插件（tgz 来自 Release，路径写绝对路径）
dsh plugin --profile <profile> add file:/abs/path/dsh-phoneharness-0.4.1.tgz
# 2) 重启宿主，Web GUI「设置」里出现「手机远程控制」
# 3) 手机装 APK（浏览器打开 http://<电脑地址>:8737/apk），填地址 + 6 位配对码
```

装完之后面板长这样（三条地址各带类型、场景、监听状态）：

| 地址类型 | 什么时候用 |
| --- | --- |
| 局域网（`192.168.x` 等） | **最常见**：手机与电脑同一 WiFi，零配置，不装任何东西 |
| Tailscale（`100.x`） | 可选：手机登录同一 Tailscale 账号，外出/4G 也能连 |
| 虚拟网卡（OPPO 互联 / Docker / WSL…） | 一般用不上，面板会标「虚拟网卡」并变淡 |

细节见 [docs/addresses.md](docs/addresses.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/install.md](docs/install.md) | 依赖环境、装插件、装 APK、首次配对、端口与防火墙、数据目录 |
| [docs/configure.md](docs/configure.md) | `port` / `bind` / 配对码 TTL / 默认模型与权限 / 审批超时；`bind` 语法与安全建议 |
| [docs/addresses.md](docs/addresses.md) | 面板里那几行地址分别是什么、怎么算「未监听」、怎么开、怎么排错 |
| [docs/update.md](docs/update.md) | 三条版本线、发布通道、升级/回滚、兼容与降级、发版清单 |
| [docs/architecture.md](docs/architecture.md) | 模块划分、一次发消息的完整路径、**扩展点**（加接口/条目/面板卡片/模型通道/语言） |
| [docs/api.md](docs/api.md) | `/v1` 与 `/dsh-phone/api` 全部端点、SSE 帧、错误码 |
| [docs/design-notes.md](docs/design-notes.md) | 开发过程笔记：为什么这样投影时间线、审批怎么接、标题怎么来的 |

## 目录

```
dsh-phoneharness/
├── index.js            # 插件入口：配置、bind、控制 API、APK 元数据
├── client.js           # 设置面板（手写 React.createElement，无构建步骤）
├── cordis.patch.yml    # 默认配置（插进宿主的 cordis patch）
├── lib/
│   ├── server.js       # HTTP 路由 + SSE + 鉴权
│   ├── runtime.js      # Harness 桥：会话 / 提示 / 时间线 / 中断
│   ├── projection.js   # 事件流 → TimelineItem
│   ├── models.js       # catalog / 默认模型 / 自定义通道
│   ├── approvals.js    # approval/request waterfall 桥
│   ├── questions.js    # user-questions/request 桥
│   ├── store.js        # 设备令牌 + 配对码
│   └── http.js         # sendJson / sendError / readJson
├── assets/             # 随包 APK + 旁车元数据（dsh-phone.apk.json）
├── docs/               # 上面那七篇
└── scripts/verify.mjs  # 发版守门：语法 / 配置 / 打包 / 文档链接
```

## 依赖环境

- 宿主：DSH（带 Web GUI）+ Node.js ≥ 20（DSH 自带运行时即可）+ pnpm（DSH 自带）
- 手机：Android 7.0+（`minSdk 21`）
- 网络：同一局域网，或同一个 Tailscale 账号
- 自己编 APK 才需要：JDK + Android SDK（`aapt2` / `d8` / `zipalign` / `apksigner`）

## 自己编 APK

仓库 `android/` 目录是一套**不依赖 Gradle** 的手工构建（`aapt2 → javac → d8 → zipalign → apksigner`）：

```bash
cd android
VERSION_CODE=11 VERSION_NAME=0.6.0 bash build.sh
# -> android/bin/dsh-phone.apk（同时写 .json 元数据并同步到 ../plugin/assets/）
```

构建脚本里固定用 `build-tools/android-16` 的 `d8`——`android-14` 的 d8 在 JDK 25 编译出的匿名类上会崩（`NullPointerException: Cannot invoke "String.length()"`）。

## 发版守门

```bash
npm run verify   # 语法检查 + cordis patch 校验 + 打包清单 + 文档链接
```

## 安全模型

- 攻击面 = 一个端口 + 一个 Bearer 令牌。**默认不监听 0.0.0.0**，需要局域网直连再改 `bind`。
- 配对码一次性、默认 10 分钟；令牌 64 位 hex，撤销即时生效（面板或 `POST /dsh-phone/api/devices/revoke`）。
- 没有 TLS：走公网请前置 nginx/Caddy 并限制来源，别把端口直接映射出去。
- 插件只调用 Harness 已有的会话/审批接口，不自建 shell、不落任何执行日志。

详见 [SECURITY.md](../SECURITY.md)。

## 已知限制

- 不做服务端检索（RAG）与 PoW 校验；这两块官方 App 走的是自家后端。
- 语音是系统 TTS / 系统语音识别，不接云厂商。
- 同一时刻最多 8 条 SSE 流（`MAX_STREAM_CLIENTS`）。
- 老版本宿主没有 `/v1/models`：新 APK 会回落到 `/v1/catalog`。

## License

MIT。见 [LICENSE](../LICENSE)。

---

## English

**dsh-phoneharness** lets an Android phone drive DeepSeek Harness sessions running on your desktop: send prompts, stream replies, approve tool calls and answer model questions over one HTTP/SSE port. Pair with a one-time 6-digit code, keep the 64-hex device token server-side, and bind to loopback + LAN + Tailscale by default, so a phone on the same WiFi works with zero extra software (Tailscale is optional and skipped when absent).

- Install: `dsh plugin --profile <profile> add file:/abs/path/dsh-phoneharness-<ver>.tgz`, restart the host, then open **Settings → Phone remote**.
- Phone: download the bundled APK from `http://<host>:8737/apk`, paste a recommended address and the pairing code.
- Docs: [install](docs/install.md) · [configure](docs/configure.md) · [addresses](docs/addresses.md) · [update](docs/update.md) · [architecture](docs/architecture.md) · [api](docs/api.md).
- Build the APK without Gradle: `cd android && bash build.sh`.
