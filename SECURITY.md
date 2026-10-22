# 安全说明

## 攻击面

插件在宿主机上开一个 TCP 端口（默认 8737），对外只暴露两类东西：

1. `GET /health`、`GET /apk` —— 无需鉴权（只回版本/机器名/是否需要配对，或直接吐 APK 字节）；
2. `/v1/*` —— 需要 `Authorization: Bearer <64 hex>` 设备令牌。

拿到令牌 = 能读写这台机器上的 DSH 会话、能替你在手机上批准工具调用。**请按密码对待它**。

## 威胁模型

| 场景 | 现状 |
| --- | --- |
| 同一 WiFi 的其他设备 | 默认 `bind` 含 `lan`（为了开箱即用）：同网段设备能看到端口，但 `/v1/*` 一律要设备令牌，配对码一次性。担心暴露就把 `bind` 收回 `loopback,tailscale` |
| 手机丢失 / 被借走 | 面板撤销设备即刻失效（内存 + `devices.json` 同时删） |
| 局域网嗅探 | 明文 HTTP：令牌与消息都可能被同网段嗅探。要求高就把 `bind` 收到 `loopback,tailscale`（Tailscale 自身加密链路） |
| 公网暴露 | 不推荐。要暴露请前置 nginx/Caddy 上 TLS + 来源白名单，并且不要把 `bind` 设成 `0.0.0.0` |
| 恶意网页 CSRF | `/v1/*` 全部需要 Bearer 头，浏览器无法凭 cookie 直接利用；SSE 端口回复了 `Access-Control-Allow-Origin: *`，但不含凭据 |
| 插件自身越权 | 插件只调用 Harness 已有的会话/审批接口，不自建 shell、不落执行日志 |

## 加固清单

- [ ] `bind` 用 `loopback,tailscale` 或 `loopback,lan,tailscale`（默认），不要 `0.0.0.0`
- [ ] 配对码只在需要时生成，用完即换（面板「换一个」）
- [ ] `~/.dsh/phone-harness/devices.json` 权限 0600，不进版本库、不进截图
- [ ] 定期看面板「已配对的手机」，删掉不认识的设备
- [ ] 升级前备份 `~/.dsh/phone-harness/`（见 [plugin/docs/update.md](plugin/docs/update.md)）
- [ ] Windows 防火墙只放行「专用网络」

## 报告漏洞

请不要开公开 issue，改用 GitHub Security Advisory（仓库 → Security → Report a vulnerability），或邮件联系维护者（在仓库主页 About 里）。请在报告里写清：影响版本（插件 `version` + APK `versionCode`）、复现步骤、是否需要已配对令牌。

我们会在 72 小时内确认，修复后在同一渠道发布并致谢（除非你要求匿名）。
