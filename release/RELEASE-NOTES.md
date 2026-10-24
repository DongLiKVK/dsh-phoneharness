# Release 插件 0.5.21 / APK 0.6.29

本轮把两条线的最新产物一起发：APK 侧是「内置 Tailscale 引擎」的 `0.6.29`，插件侧是 0.5.20 叠加「运行期重绑」的 `0.5.21`。

## 产物（Release 资产）

| 文件 | 说明 |
| --- | --- |
| `dsh-phone-0.6.29.apk` | Android 客户端，versionName `0.6.29` / versionCode `45`，46,025,305 字节，内置 tsnet |
| `dsh-phoneharness-0.5.21.tgz` | 宿主插件包 0.5.21（17,026,956 字节，内含同一份 APK），`dsh plugin add file:<tgz>` |
| `SHA256SUMS` | 上面两个文件的校验和 |

校验：先 `cd` 到下载目录，再 `sha256sum -c SHA256SUMS`。

## APK 0.6.29：内置 Tailscale

- 自带 `libgojni.so`（tsnet，arm64-v8a + x86_64）：**不用另装 Tailscale App**，手机就能加入 tailnet、用 `100.x` 地址连电脑。
- Java 侧仍是 `HttpURLConnection`，只在目标是 `100.64.0.0/10` 时挂本机 `127.0.0.1` 代理，由 tsnet（用户态 WireGuard + netstack）直连。
- 设置页新增「内网互联」：登录 / 退出、两种退出口径（只退 Tailscale / 连同配对一起断开）、AuthURL 打开登录页。
- `0.6.28` 修掉真机上的 tsnet 问题（SELinux 拒绝 AF_NETLINK → 改用 Java 侧网卡快照；反射漏传参数类型）；`0.6.29` 修配对页任务根与「返回键按两次才退出」。

> **两条版本线**：`0.6.29` 的界面基线是 `0.6.18`，**没有** `0.6.19`–`0.6.26` 的聊天页改动（操作条 `BarTarget`、抽屉检索等）。
> 想要那些功能，请装上个 Release `v0.5.20` 里的 `dsh-phone-0.6.26.apk`。

## 插件 0.5.21：运行期重绑

- `lib/server.js`：新增 `listenOn(bind)` / `rebind(addresses)`，用 `bound` 集合记已监听地址；`start()` 与重绑共用同一条监听路径（`headersTimeout 30000` / `requestTimeout 60000`，EADDRINUSE 记 `lastError`）。
- `index.js`：`rebindTick()` 每 15 秒跑一次（`REBIND_MS = 15000`），只补「期望地址里还没监听」的那几条，`0.0.0.0` 兜底不参与；补上后回写 `endpoint.json` 的 `binds` / `updatedAt`。
- 修的问题：Windows 上 tailscaled 常比宿主后起，插件启动时 `100.x` 还不存在 → `binds` 永久少一条，手机登录完了也连不上电脑。
- 保留 0.5.20 的「下载 APK 文件名带版本号」。

## 仓库约定变化：二进制不进 git

- `plugin/assets/dsh-phone.apk` 与 `.apk.json` 由发版流程在 `npm pack` 前注入（见 `plugin/assets/README.md`）。仓库里没有它们时 `GET /apk` 返回 `404 no_apk`，`npm run verify` 跳过 APK 两项打包检查并打一行 `warn`。
- `release/` 只留本说明、`SHA256SUMS` 与 APK 的 `.apk.json` 元数据。

## 验证

- `node --check`：`index.js`、`client.js`、`lib/*.js`、`scripts/*.mjs` 全过。
- `node plugin/scripts/verify.mjs` → 4 项全过（npm pack 27 文件 / 文档相对链接全在）。
- 包内 APK 一致性：tgz 里 `package/assets/dsh-phone.apk` 的 md5 `4e55f8d45fae5cc7fbb8d436e8e7f2b5`，与 `android/bin/dsh-phone.apk` 完全相同；`SHA256SUMS` 里的 sha256 由这两个产物直接算出。
