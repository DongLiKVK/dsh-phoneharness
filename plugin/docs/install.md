# 安装与依赖

## 零、先选接入方式（30 秒）

插件不需要 Tailscale 也能用。先按你的场景选一条，后面所有步骤都围绕它：

| 你的情况 | 选哪条地址 | 还要装什么 |
| --- | --- | --- |
| 手机和电脑连同一个 WiFi / 同一路由器（**最常见**） | 面板上的「局域网」 | 什么都不用装，默认配置已经监听私网地址 |
| 手机用 4G、人在外面、要连公司/家里的电脑 | 面板上的「Tailscale」 | 电脑和手机各装一次 Tailscale，登录**同一个**免费账号 |
| 只想在本机验证 | `127.0.0.1` | 什么都不用装（手机连不上是正常的） |

> 没装 Tailscale 时，面板不会显示 Tailscale 那行，也不用管它 —— 那属于可选组件。

## 一、依赖环境

| 侧 | 需要什么 | 说明 |
| --- | --- | --- |
| 宿主 | **DeepSeek Harness（DSH）**，带 Web GUI | 插件靠宿主的 `webServer` 挂控制 API，靠 `slots` / `locale` 挂设置面板 |
| 宿主 | **Node.js ≥ 20** | DSH 自带运行时里就有；不需要单独装 |
| 宿主 | **pnpm** | DSH 自带（`dsh plugin` 内部转发给 profile 目录里的 pnpm） |
| 宿主 | Windows / macOS / Linux | 网卡枚举用 `os.networkInterfaces()`，三平台一致 |
| 手机 | **Android 7.0+**（`minSdk 21`，`targetSdk 34`） | 只要能用浏览器下载 APK 并允许「安装未知来源」 |
| 网络 | 手机与电脑同局域网（默认够用），**或**同一个 Tailscale 账号 | 见 `addresses.md` |
| 可选 | [Tailscale](https://tailscale.com/download) | 只在外网 / 4G 下连时才需要；不装不影响同一 WiFi 使用 |
| 可选 | Android SDK（`aapt2`、`d8`、`zipalign`、`apksigner`）+ JDK | 只有要自己编 APK 时才需要 |

## 二、安装插件

```bash
# 方式 A：从 Release 的 tgz 装（推荐）
dsh plugin --profile <profile> add file:/abs/path/dsh-phoneharness-0.4.1.tgz

# 方式 B：从 npm 装（若已发布）
dsh plugin --profile <profile> add dsh-phoneharness

# 确认
dsh plugin --profile <profile> list | grep dsh-phoneharness
```

装完**重启宿主**，然后在 Web GUI 的「设置」里找 **手机远程控制**（面板 section id = `dsh-phoneharness`）。

```bash
# 卸载
dsh plugin --profile <profile> remove dsh-phoneharness
# 可选：连数据一起清（设备令牌、归档标题缓存）
rm -rf ~/.dsh/phone-harness
```

## 三、安装手机 APK

三种方式，任选：

1. **手机浏览器直连**：`http://<电脑地址>:8737/apk` —— 免配对、免登录，插件把 `assets/dsh-phone.apk` 直接吐给浏览器；
2. **adb**：`adb install -r plugin/assets/dsh-phone.apk`；
3. **扫码 / 传输**：把 `plugin/assets/dsh-phone.apk` 丢到手机里点开安装。

APK 的包名是 `com.lc.phoneharness`，显示名 **PhoneHarness**。首次打开会要求输入「地址 + 6 位配对码」。

## 四、首次配对

1. 宿主面板上读出当前配对码（6 位数字，默认 10 分钟有效，**用过一次即失效**）；
2. 手机填配对码，地址按第零节的判断填（同一 WiFi 就填「局域网」那条，异地填「Tailscale」那条；面板「怎么选」里也写着）；
3. 成功后插件把该设备写进 `~/.dsh/phone-harness/devices.json`（权限 0600），手机保存 64 位十六进制令牌，之后免码重连；
4. 想踢掉某台设备：面板「已配对的手机」里点撤销，或 `POST /dsh-phone/api/devices/revoke`。

## 五、端口与防火墙

- 默认端口 **8737**（`config.port` 可改；填 `0` 让系统随机挑，`/status` 会回报实际端口）。
- 端口被占时插件会记录 `lastError`，面板显示启动失败原因 —— 换端口即可。
- **Windows 首次监听会弹防火墙授权**：勾「专用网络」；只勾公用网络时，同 WiFi 的手机仍然连不上。
- 想验证监听状态：`netstat -ano | findstr 8737`（Windows）/ `ss -ltnp | grep 8737`（Linux/macOS）。

## 六、数据目录

`~/.dsh/phone-harness/`：

| 文件 | 内容 | 删了会怎样 |
| --- | --- | --- |
| `devices.json` | 已配对设备与令牌（0600） | 所有手机需重新配对 |
| `endpoint.json` | 上次监听的地址/端口/进程号 | 无害，自动重建 |
| `titles.json` | 会话标题缓存（归档箱、列表提速） | 无害，自动重建 |
| `boot.log` / `tunnel.log` | 启动与内网穿透日志 | 无害 |

升级 / 迁移前先整目录备份，见 `update.md`。
