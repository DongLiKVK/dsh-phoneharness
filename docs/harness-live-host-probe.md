# 真机宿主实测取证：为什么手机上的「选择模式」是空的

> 取证时间：2026-10-22 05:12（Asia/Shanghai） · 取证方式：直连本机正在运行的 phone-harness 宿主 HTTP 端口（不看仓库源码）。
> 复跑命令：`node tools/probe-live-host.mjs`（只读，只发 GET；`--write` 才会试写）。

## 1. 取证命令与原始输出

```
# 宿主 endpoint
{ "name": "<HOSTNAME>", "port": 8737, "pid": 37408, "startedAt": "2026-10-21T19:57:36.602Z",
  "binds": ["127.0.0.1","<LAN_IP>","<LAN_IP>","<TAILSCALE_IP>"], "host": "loopback,lan,tailscale",
  "device": { "name": "<DEVICE> (Android 15)", "lastSeenAt": 1792617091249 }, "tokenHead": "<TOKEN_HEAD>…" }

## GET /v1/harness -> 404
{"error":{"code":"not_found","message":"没有这个接口：GET /v1/harness"}}

## GET /v1/harness/dirs -> 404
{"error":{"code":"not_found","message":"没有这个接口：GET /v1/harness/dirs"}}

## GET /v1/me -> 200
{"ok":true,"user":{"id":"<ACCOUNT_ID>","name":"<昵称>","contact":"<手机号>","avatarUrl":"<头像URL>","source":"account"},"host":{"name":"<HOSTNAME>","version":"0.5.1"}}

## GET /v1/catalog -> 200   （省略：models 数组很长，首条 deepseek-official/deepseek-flash / DeepSeek-V4.1-Flash）

# 结论：2 条非 2xx（宿主还没到这个版本，或该端点不存在）
```

## 2. 判定

| 事实 | 证据 | 含义 |
| --- | --- | --- |
| 宿主进程 `pid 37408` 启动于 `2026-10-21T19:57:36Z`（= 本地 03:57） | `endpoint.json.startedAt` | 该进程加载插件代码的时刻是 **03:57** |
| 宿主自报插件版本 **0.5.1** | `GET /v1/me` → `host.version` | 运行中的插件早于 harness 通道 |
| `/v1/harness` 与 `/v1/harness/dirs` 双双 404 | 上表原始 body | **宿主此刻根本不提供 harness 接口**（不是返回空名册！） |
| `/v1/me`、`/v1/catalog` 均 200 | 上表原始 body | 会话/模型通道正常 ⇒ 手机能连、能发指令，只是 harness 通道不存在 |
| 已安装副本 `profiles/desktop/node_modules/dsh-phoneharness` 的 `version=0.5.2`、`lib/harness.js`（28919B，04:10）、`lib/server.js`（30130B，04:10） | 文件 mtime/大小 | **磁盘上的代码已含 harness，但进程是 03:57 启动的 ⇒ 跑的是旧代码** |
| 手机以`devices.json` 的令牌连上（`<DEVICE> (Android 15)`，`lastSeenAt` 05:11） | 上表 host 段 | 用户此刻正在用手机连这台宿主 |

### 两条根因（各自独立，都要修）

1. **宿主侧（环境）**：正在跑的插件进程没有 harness 路由，手机拿到的一律是 `404 not_found「没有这个接口：GET /v1/harness」`。任何手机端改动都无法凭空造出名册 —— 必须**把含 harness 的插件版本装进 profile 并重启宿主**（步骤见 `docs/harness-host-update.md`）。
2. **手机侧（代码）**：面板只在本地缓存为空时才取数，且 `Harness.refresh` 把异常整个吞掉 ⇒ 缓存里那份空名册会一直显示，用户看不到「其实是宿主 404」。本轮 0.6.5 修掉：打开面板即取数、失败显示真实原因（状态码 + 错误码 + 主机说明）、并提供「重新加载」行。修好后即使宿主仍是 0.5.1，用户也会看到 `读不到主机的配置：HTTP 404 not_found：没有这个接口：GET /v1/harness`，而不是一个空面板。

## 3. 复现方式（任何人可重跑）

1. `node tools/probe-live-host.mjs` —— 读 `<HOME>/.dsh/phone-harness/endpoint.json` 拿端口与 pid、读同目录 `devices.json` 拿最后一个已配对设备的令牌；输出**不打完整令牌**（只打前 6 位）。
2. 期望（未升级宿主时）：`/v1/harness` 与 `/v1/harness/dirs` 为 404，末尾一行结论会写「2 条非 2xx」。
3. 期望（升级且重启宿主后）：两条 200，`presets` 非空、`capabilities.writeConfig` 为 true，末尾一行写「全部 2xx」。

## 4. 与验收脚本的关系

- `tools/verify-harness.mjs` 用的是**真 PhoneServer + 真路由 + 真 HarnessConfig + 桩 ctx**（不起真 profile），因此它证明的是「代码具备该能力」，**不能**证明「本机 profile 里跑的就是这份代码」——本文件补的正是后者。
- 两者结论合并口径：代码侧 = 脚本全绿；环境侧 = 本文件（升级 + 重启前为 404，属预期）。
