# 中兴手机装「鲸域」APK + 配成调试设备

> 适用：任意 Android 5.0（API 21）以上的中兴 / nubia 手机（本 APK 的 minSdk 是 21）。
> 若手机是 **nubia MyOS / ZTE MiFavor**，开发者选项的名称与位置见 §3 的对照表。
> 读不到型号时：先按 §2 在手机上抄下来，或插上 USB 后跑 `adb shell getprop ro.product.model`。

---

## 0. 已实测：你这台 ZTE A2322（2026-10-21 完成）

手机 USB 插在服务器 **WIN-TBJD613AK50（<LAN_IP>）** 上，不是本机。以下全部为真机读回的值：

| 项 | 值 |
| --- | --- |
| 型号 | **ZTE A2322**（`ro.product.model`）；产品名 `CN_P870A01`，device `P870A01` |
| 品牌 / 制造商 | ZTE / ZTE |
| 系统 | **MyOS12.0.27_A2322**（中兴自研 UI） |
| Android | **12**，API **31**，`ro.build.type=user` |
| 构建 | `20221228.172845`，2022-12-28 |
| 序列号 | `326615795460` |
| 屏幕 | 1080 × 2460，density 480（xxhdpi，3×） |
| ABI | arm64-v8a |
| WiFi | <LAN_IP>/24（同网段能直连宿主 <LAN_IP>:8737） |
| USB 描述符 | `USB\VID_19D2&PID_0306&MI_01`（VID_19D2 = 中兴） |

**已完成**：APK 装上并跑通（`versionCode=3 / versionName=0.3.0`）、`flags=[ DEBUGGABLE ... ]`、
`run-as` 可读 `shared_prefs`、`adb jdwp` 列出 App pid、`adb forward tcp:18700 jdwp:<pid>` 成功、
`logcat --pid` 有输出、App 里直接显示 157→159 个真实会话。截图见
[shots/zte1.png](../shots/zte1.png)（列表）、[shots/zte6-chat.png](../shots/zte6-chat.png)（聊天）。

### 这台机器上的 adb 在哪

```powershell
# 服务器上（WIN-TBJD613AK50）
<ANDROID_SDK>\platform-tools\adb.exe devices -l
# 326615795460   device product:CN_P870A01 model:ZTE_A2322 device:P870A01 transport_id:1
```

### 在本机上直接驱动这台手机（推荐）

服务器 adb server 只听环回，所以本机走一条 **SSH 隧道**最省事（不动服务器配置、
不影响那边跑着的 ws-scrcpy）。两条现成命令：

```bat
rem 1) 起隧道：本机 127.0.0.1:15037 -> 服务器 127.0.0.1:5037（幂等，已在跑就直接返回）
tools\zte-tunnel.cmd

rem 2) 之后所有 adb 命令都走它（自动补 -H 127.0.0.1 -P 15037 -s 326615795460，并自动拉隧道）
tools\zte-adb.cmd devices -l
tools\zte-adb.cmd shell getprop ro.product.model
tools\zte-adb.cmd install -r android\bin\dsh-phone.apk
tools\zte-adb.cmd logcat --pid=22401
tools\zte-adb.cmd forward tcp:18700 jdwp:22401
```

实测（本机执行，设备在服务器上）：

```
> tools\zte-adb.cmd devices -l
List of devices attached
326615795460   device product:CN_P870A01 model:ZTE_A2322 device:P870A01 transport_id:1
> tools\zte-adb.cmd shell getprop ro.product.model
ZTE A2322
```

> 服务器上还跑着 ws-scrcpy（`DSH-WSSCRCPY` 计划任务），它会把 adb server 拉回
> `127.0.0.1`。所以别指望 `adb -H <LAN_IP>` 直连；真要那么干，用服务器上现成的
> `<HOME>\srv-adb-listen.ps1`（先停 ws-scrcpy，再 `-a` 起 server，
> 并建防火墙规则 `ADB Server 5037`），但那会抢占它的独占访问。

---

## 1. 安装包在哪

| 位置 | 说明 |
| --- | --- |
| 电脑：`<PROJECT_ROOT>/plugin/assets/dsh-phone.apk` | 135,328 字节 / md5 `7e166bb7f3f455a3a367e96ded7e8037` / v0.3.0 / **debuggable** |
| 电脑：`<PROJECT_ROOT>/android/bin/dsh-phone.apk` | 与上面同一份（构建产物） |
| 手机浏览器：`http://<电脑IP>:8737/apk` | 前提是手机与电脑同一网络，且实例在跑 |
| DSH 面板：设置 → 手机远程 → 「下载手机 APK」 | 同上 |

签名是 Android Debug（`CN=Android Debug`，SHA-256 `fb71e66e00e1b8efdbe09812ab2d940611b6751eb388d0c7c658328c8173bbe3`）。
因为用的是 debug 签名，**以后每次装新版本只要签名没变就能覆盖安装（`-r`）**，不用卸载。

这个包在 `AndroidManifest.xml` 里带了 `android:debuggable="true"`（`aapt2 dump badging` 会打
`application-debuggable`），所以 `run-as`、JDWP 断点、`logcat --pid` 都能直接用。
代价是 ART 会关掉一部分 AOT 优化，界面滚动会比 release 包略钝 —— 调试够用，发版时把这一行去掉重编。

---

## 2. 先抄下手机的型号和 Android 版本

手机上看：**设置 → 关于手机**（nubia 在「设置 → 关于手机 → 更多信息」）

- 型号：例如 `ZTE A2023` / `nubia NX729J`
- Android 版本：例如 `Android 14`
- 顺便看一眼「版本号」那一行 —— 连点它会开开发者选项（见 §3）

插上 USB 后电脑可以直接读：

```bash
adb shell getprop ro.product.model          # 型号
adb shell getprop ro.build.version.release  # Android 版本
adb shell getprop ro.build.version.sdk      # API level
adb shell getprop ro.product.manufacturer   # ZTE / nubia
```

---

## 3. 打开「开发者选项」和「USB 调试」

### 3.1 开开发者选项（通用做法）

**设置 → 关于手机 → 版本号**，**连续点 7 次**，提示「您已处于开发者模式」。
若开了锁屏密码，会要求输入一次。

少数机型入口不同：

| 系统 | 入口 |
| --- | --- |
| MiFavor（中兴） | 设置 → 关于手机 → 版本号 |
| MyOS（nubia） | 设置 → 关于手机 → 版本号 |
| 部分定制版 | 设置 → 系统 → 关于手机 → 版本号 |

### 3.2 开 USB 调试

**设置 → 系统 → 开发者选项**（nubia 可能是「设置 → 其他 → 开发者选项」），打开：

1. **USB 调试** —— 必开
2. **USB 安装**（有的机型叫「通过 USB 安装应用」）—— 不开的话 `adb install` 会报 `INSTALL_FAILED_USER_RESTRICTED`
3. **USB 调试（安全设置）** —— 只有要改系统设置/模拟输入才需要，装 APK 不用
4. **「仅充电」模式下允许 ADB 调试** —— 部分中兴机型有这一项，开了才能在仅充电模式连上

### 3.3 把 USB 模式从「仅充电」改成「传输文件」

插上数据线后下拉通知栏，点 USB 那条通知，选 **传输文件（MTP）**。
留在「仅充电」时有些机型不会暴露 adb 接口。

---

## 4. 电脑这边：让 adb 认到手机

### 4.1 adb 可执行文件位置

```
<HOME>\Documents\deepseek-harness\default-workspace\work\phone-adb\platform-tools\adb.exe
```

版本 `1.0.41 / 37.0.1`（够用，支持 `adb pair` 无线配对）。同一目录有
`AdbWinApi.dll`、`AdbWinUsbApi.dll` 和 `fastboot.exe`。

建议加进 PATH（一次性）：

```powershell
$env:Path += ";<HOME>\Documents\deepseek-harness\default-workspace\work\phone-adb\platform-tools"
adb version
```

### 4.2 连上并确认

```bash
adb kill-server      # 干净起步
adb devices -l
```

正常输出长这样（`device` 才是成功；`unauthorized` 见 §4.3）：

```
List of devices attached
ABCD12345678           device product:xxx model:ZTE_A2023 device:xxx transport_id:1
```

### 4.3 手机没弹「允许 USB 调试吗」

第一次连会弹一个带 RSA 指纹的对话框，勾 **「一律允许使用这台计算机进行调试」** 再点 **允许**。

没弹或点了拒绝：

1. 拔插数据线
2. **开发者选项 → 撤销 USB 调试授权**，再插一次
3. 换一根**能传数据**的线（很多线只有电源针）
4. 换 USB 口（优先主板直出的 USB 2.0 口，别用前面板或 hub）

### 4.4 Windows 驱动

Win10/11 通常自带 WinUSB，`adb devices` 直接能认。认不到时：

1. 设备管理器里找带黄色感叹号的 `Android` / `ZTE` / `ADB Interface`
2. 右键 → 更新驱动 → 浏览我的电脑 → 让我从列表中选取
3. 选 **Android Device → Android ADB Interface**（或 **通用串行总线设备 → WinUSB Device**）
4. 装不上就装一遍 ZTE 官方 USB 驱动，或用 Google 的 `usb_driver`

---

## 5. 装 APK

### 5.1 走 adb（推荐，最稳）

```bash
adb install -r "<PROJECT_ROOT>/plugin/assets/dsh-phone.apk"
# Success
```

旧的 debug 包在的话加 `-r` 覆盖；签名不一致才需要先 `adb uninstall com.lc.phoneharness`。

### 5.2 走文件传输（不装 adb 驱动也能用）

1. USB 选「传输文件」，把 APK 拷到手机 `Download/`
2. 手机上用「文件管理」点开 APK
3. 提示「未知来源」→ 允许「文件管理」安装未知应用

### 5.3 确认装成功

```bash
adb shell dumpsys package com.lc.phoneharness | grep -E "versionCode|versionName"
# versionCode=3 minSdk=21 targetSdk=34
# versionName=0.3.0
```

手机上：桌面出现图标 **鲸域**（蓝色圆角底 + 白色鲸尾线稿）。

---

## 6. 装完先跑通一次

1. 打开 **鲸域** → 因为还没有令牌，会自动进「连接你的电脑」
2. **电脑地址**填下面任一条（点 chip 可一键填入）：
   - 同一 WiFi：`<LAN_IP>:8737`
   - 外网：`http://43.142.153.74/a4f41d8f5c00`
   - Tailscale：`<TAILSCALE_IP>:8737`
3. 点 **只测连通** —— 出现「通了：<HOSTNAME> / v0.3.0」说明网络与端口都对
4. **配对码**：电脑上 `curl -s -X POST http://127.0.0.1:8399/dsh-phone/api/pairing`
   返回 `{"ok":true,"code":"123456",...}`，把 6 位数字填进去
5. 点 **连接** → 进会话列表

---

## 7. 调试这一台手机

### 7.1 直接启动、看日志

```bash
# 冷启首页
adb shell am force-stop com.lc.phoneharness
adb shell am start -n com.lc.phoneharness/.MainActivity

# 只看这个 App 的日志
adb logcat --pid=$(adb shell pidof -s com.lc.phoneharness)
# 或按 tag 过滤（自己加的 Log 用这个）
adb logcat -s PhoneHarness:V AndroidRuntime:E
```

> `PairActivity` / `ChatActivity` / `NewSessionActivity` 都是 `exported="false"`，
> 用 `am start` 直接拉起会被拒（`Permission Denial: ... not exported`）。要从 App 内点进去。

### 7.2 断点

| 工具 | 做法 |
| --- | --- |
| **Android Studio** | Run → Edit Configurations → `+ Android App` → Deploy 选 `Nothing`（或 `Default APK`）→ Debug。因为包不是它编的，第一次会提示 `Waiting for Debugger`，按提示挂上即可 |
| **命令行 + jdb** | `adb shell am set-debug-app -w com.lc.phoneharness` → 启动 App 会停在「Waiting For Debugger」→ 另开窗口 `adb forward tcp:8700 jdwp:$(adb shell pidof -s com.lc.phoneharness)` → `jdb -attach localhost:8700` |
| 取消 | `adb shell am clear-debug-app` |

> APK 是 `debuggable` 的（`AndroidManifest.xml` 里有 `android:debuggable="true"`），
> 所以上面这些都能用，`run-as com.lc.phoneharness` 也能用（只有 debuggable 包才行）。
> 验证：`adb shell run-as com.lc.phoneharness ls /data/data/com.lc.phoneharness` 能列出
> `cache / code_cache / shared_prefs`；`adb jdwp` 的输出里有这个 App 的 pid。

### 7.3 看 App 的本地存储（地址、令牌、主题）

```bash
adb shell run-as com.lc.phoneharness cat shared_prefs/phone-harness.xml
# address / token / device / lastModelName / theme / reasoning / mode
```

### 7.4 屏幕与输入（自动化测试用）

```bash
adb exec-out screencap -p > shot.png                       # 截图
adb shell uiautomator dump /sdcard/ui.xml && adb exec-out cat /sdcard/ui.xml > ui.xml
adb shell input tap 540 2352                               # 点击（真实屏幕像素）
adb shell input text 'hello'                               # 打字（空格写 %s）
adb shell input keyevent 4                                 # 返回
```

> 本机 bash 会改写 `/sdcard/...` 路径，命令前先 `export MSYS2_ARG_CONV_EXCL='*' MSYS_NO_PATHCONV=1`。

### 7.5 无线调试（Android 11+，不用插线）

```bash
# 手机：开发者选项 → 无线调试 → 使用配对码配对设备（显示 IP:端口 + 6 位码）
adb pair <LAN_IP>:37123 123456      # 用配对弹窗里的地址和码
adb connect <LAN_IP>:5555           # 再连调试端口
adb devices
```

---

## 8. 常见问题

| 现象 | 处理 |
| --- | --- |
| `adb devices` 空 | 换数据线（要能传数据的）、换 USB 口、`adb kill-server` 后重试 |
| `unauthorized` | 手机上确认那个 RSA 弹窗；不行就「撤销 USB 调试授权」再插 |
| `INSTALL_FAILED_USER_RESTRICTED` | 开发者选项里开「USB 安装」 |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | 手机上是别的签名的旧包，先 `adb uninstall com.lc.phoneharness` |
| 装完图标是旧的蓝色聊天气泡 | 装的是老包，看 `versionName` 是不是 `0.3.0`；不是就重装 §1 的那份 |
| 首页列表空 / 副标题写「深水里，聊点真的」 | 首次要读会话日志回填标题，20~60 秒，等着 |
| 「连不上：timeout」 | 地址/端口不对，或电脑防火墙没放行 8737 |
| 「配对码是 6 位数字」 | 配对码过期了（10 分钟），重新 `POST /dsh-phone/api/pairing` 换一个 |

---

## 9. 一键脚本

不想一条条敲的话，插上手机直接跑：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File <PROJECT_ROOT>\tools\phone-install.ps1
```

它会依次：找 adb → 列设备（没设备就打印上面 §3 的操作步骤并退出）→ 读型号 / Android 版本 / API →
检查授权状态 → 装 `plugin/assets/dsh-phone.apk` → 核对 `versionName` 与 debuggable →
启动 App → 打最近 40 行 `logcat`。

参数：`-Serial <LAN_IP>:5555`（多台设备时指定）、`-Apk <PATH>\dsh-phone.apk`（换包）、
`-NoLaunch`（只装不启动）。

> 脚本存的是 UTF-8 **带 BOM**。PowerShell 5.1 读无 BOM 的 UTF-8 会按 GBK 解，中文全变乱码并报
> `表达式或语句中包含意外的标记`。改这个文件时要保住 BOM。

---

## 10. 一页速查

```bash
ADB="<HOME>/Documents/deepseek-harness/default-workspace/work/phone-adb/platform-tools/adb.exe"
APK="<PROJECT_ROOT>/plugin/assets/dsh-phone.apk"

"$ADB" devices -l
"$ADB" install -r "$APK"
"$ADB" shell dumpsys package com.lc.phoneharness | grep versionName
"$ADB" shell am start -n com.lc.phoneharness/.MainActivity
"$ADB" logcat --pid=$("$ADB" shell pidof -s com.lc.phoneharness)
```
