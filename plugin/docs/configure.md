# 配置指南

配置写在宿主 profile 的 cordis patch 里（插件自带默认值，安装即可用）：

- Windows：`%USERPROFILE%\.dsh\profiles\<profile>\cordis.patch.yml`
- macOS / Linux：`~/.dsh/profiles/<profile>/cordis.patch.yml`

```yaml
- insert:
    - id: dsh-phoneharness
      name: dsh-phoneharness
      config:
        enabled: true
        port: 8737
        bind: loopback,tailscale
        pairingTtlMs: 600000
        model: ''
        permission: ''
        agentPreset: ''
        approvalTimeoutMs: 120000
```

## 一、配置项

| 键 | 类型 | 默认 | 作用 |
| --- | --- | --- | --- |
| `enabled` | bool | `true` | 关掉后插件完全不启动（不监听、不挂控制 API） |
| `port` | int 0–65535 | `8737` | 手机连的端口；`0` = 系统随机，实际端口看 `/status` |
| `bind` | string | `loopback,lan,tailscale` | 监听哪些地址，支持别名与逗号/空格分隔（见下）。默认让同一 WiFi 的手机开箱可用；没装 Tailscale 时该项自动跳过 |
| `pairingTtlMs` | int ≥ 60000 | `600000` | 配对码有效期（毫秒），默认 10 分钟 |
| `model` | string | `''` | 新建会话默认模型 `provider/model`；空 = 取 catalog 第一个 |
| `permission` | string | `''` | 新建会话默认权限预设（`read-only` / 工作区写 / 完全权限）；空 = 最宽松的那个 |
| `agentPreset` | string | `''` | 新建会话默认 agent 预设；空 = 第一个可用预设 |
| `approvalTimeoutMs` | int ≥ 5000 | `120000` | 审批 / 反问转发给手机后等多久，超时交回桌面 UI |

新键都有默认值，老配置文件不用改。

## 二、`bind` 语法

逗号或空格分隔，支持三个别名：

| 别名 | 展开成 |
| --- | --- |
| `loopback` / `local` | `127.0.0.1` |
| `tailscale` | 本机所有 `<TAILSCALE_IP>/10` 地址 |
| `lan` | 本机所有 RFC1918 私网地址（`10/8`、`172.16/12`、`192.168/16`） |

也可以直接写 IP。解析不出地址时（Tailscale 未登录、网卡刚断）会退回私网地址，再退 `0.0.0.0`，并写一条警告日志。

**没装 Tailscale 不用管它**：`tailscale` 这一项解析为空，会被自动跳过，`lan` 仍然照常监听 —— 这也是默认值写成三项的原因：新用户不装任何东西，同一 WiFi 下就能连上。

常见组合：

| 场景 | 配置 |
| --- | --- |
| 只想自己电脑调试 | `bind: loopback` |
| 家里 WiFi 手机直连（最常见） | `bind: lan,loopback` |
| 局域网 + 外网 Tailscale 都能连 | `bind: lan,tailscale,loopback` |
| 只走 Tailscale（不碰局域网广播域） | `bind: loopback,tailscale` |
| 云主机 / 反代后面 | `bind: 0.0.0.0` + 前面挂 HTTPS 反代并限制来源 |

## 三、安全建议

1. **默认别用 `0.0.0.0`**：这会把端口暴露到所有网卡（含咖啡馆 WiFi）。默认模板给的是 `loopback,lan,tailscale`（局域网可用 + 只对本机回环开放管理面）；不想让同网段设备看到端口，改成 `loopback,tailscale` 即可。
2. **配对码一次性**：用过即换，TTL 10 分钟；泄露了就在面板点「换一个」。
3. **令牌等同密码**：`devices.json` 里是 64 位十六进制令牌，谁拿到谁就能操作会话；不要把该文件提交进仓库、不要放进截图。
4. **手机丢了**：面板「已配对的手机」→ 撤销（或 `POST /dsh-phone/api/devices/revoke`）。
5. **公网暴露**：如果一定要走公网，前置 nginx/Caddy 上 TLS + IP 白名单，不要直接把 8737 映射出去。
6. **审批超时**：`approvalTimeoutMs` 越短越安全（手机会话失联时更快交回桌面），越长越方便。

## 四、面板上的东西从哪来

| 面板元素 | 数据源 |
| --- | --- |
| 服务状态 / 端口 / 监听列表 | `GET /dsh-phone/api/status` → `running`、`binds`、`lan[].kind/listening` |
| 配对码与剩余时间 | `status.pairing.code / expiresAt` |
| 已配对手机 | `status.devices[]` |
| 随包 APK 版本 | `status.apkMeta`（versionName / versionCode / size / md5） |
| 开源仓库地址 | `status.repo`（编译期常量 `REPO_URL`） |
| 审批 / 反问统计 | `status.approvals.stats`、`status.questions.stats` |
